// cinesrc-resolver — Cloudflare Browser Rendering worker
//
// GET /hls?cine=<movie-315635|tv-92783-1-1>&q=<2160|1080|720>&token=<CINE_HLS_TOKEN>
//
// Loads the cinesrc embed page in an edge-hosted browser, captures the first
// master .m3u8 the player requests, filters the master to a single quality +
// its audio group, and returns it. Cast apps (Web Video Cast, TV players)
// then play one combined stream: video + audio, quality locked.
//
// Auth: `token` query param (cast devices cannot send headers). The filtered
// result is cached at the edge for 30 minutes.

import puppeteer from "@cloudflare/puppeteer";

const Q_ALLOW = new Set(["2160", "1080", "720"]);

// ── Media proxying ───────────────────────────────────────────────────────────
// The stream origin hotlink-protects its URLs: requests without
// Referer: https://cinesrc.st/ get 404 — which is what browsers (they send
// our origin as referer) and TV players (no referer at all) would hit.
// /hls-media therefore fetches media server-side with the correct referer
// and streams it back, rewriting nested playlist URLs to itself.

function isAllowedMediaUrl(raw) {
  // SSRF guard: https only, a real dotted hostname, no local/internal names.
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".")) return false;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) {
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return false; // IP literals
  return true;
}

function proxiedUrl(absUrl, token) {
  return (
    "https://cast.freewatch.uk/hls-media?u=" +
    encodeURIComponent(absUrl) +
    "&token=" +
    encodeURIComponent(token)
  );
}

// General playlist rewriter: absolutizes every URL (segments, KEY/MAP/MEDIA
// URIs) against baseUrl, then maps it through mapFn (proxy or keep-direct).
function rewritePlaylistGeneric(text, baseUrl, mapFn) {
  const abs = (p) => {
    try {
      return new URL(p, baseUrl).toString();
    } catch {
      return null;
    }
  };
  const lines = text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      if (
        trimmed.startsWith("#EXT-X-KEY") ||
        trimmed.startsWith("#EXT-X-MAP") ||
        trimmed.startsWith("#EXT-X-MEDIA")
      ) {
        return trimmed.replace(/URI="([^"]+)"/g, (m, uri) => {
          const a = abs(uri);
          return a ? 'URI="' + mapFn(a) + '"' : m;
        });
      }
      return line;
    }
    const a = abs(trimmed);
    return a ? mapFn(a) : line;
  });
  return lines.join("\n");
}

// Segments/init are NOT referer-protected (verified live): keep them direct
// to the origin so bandwidth never touches the worker.
function absolutizePlaylist(text, baseUrl) {
  return rewritePlaylistGeneric(text, baseUrl, (u) => u);
}

async function handleHlsMedia(request, url, env) {
  const token = url.searchParams.get("token") || "";
  if (!env.CINE_HLS_TOKEN || token !== env.CINE_HLS_TOKEN) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const target = url.searchParams.get("u") || "";
  if (!isAllowedMediaUrl(target)) {
    return json({ ok: false, error: "blocked url" }, 400);
  }
  const headers = { Referer: "https://cinesrc.st/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" };
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  let upstream;
  try {
    upstream = await fetch(target, { headers, redirect: "follow" });
  } catch (e) {
    return json({ ok: false, error: "upstream fetch failed" }, 502);
  }
  const ct = upstream.headers.get("content-type") || "";
  const looksPlaylist = /\.m3u8(\?|$)/i.test(target) || ct.includes("mpegurl");
  if (looksPlaylist) {
    const text = await upstream.text();
    const rewritten = rewritePlaylistGeneric(text, target, (u) => proxiedUrl(u, token));
    return new Response(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  }
  // Binary passthrough (init/segments) — forward range status + key headers.
  const resHeaders = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=1800",
  });
  for (const h of ["content-type", "content-length", "content-range", "etag"]) {
    const v = upstream.headers.get(h);
    if (v) resHeaders.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

function cinesrcEmbedFromComposite(cine) {
  const m = cine.trim().match(/^(movie|tv)-(\d+)(?:-(\d+))?(?:-(\d+))?$/);
  if (!m) return null;
  const kind = m[1];
  const id = encodeURIComponent(m[2]);
  const base = "https://cinesrc.st/embed/" + kind + "/" + id;
  if (kind === "movie") return base;
  const season = encodeURIComponent(m[3] || "1");
  const episode = encodeURIComponent(m[4] || "1");
  return base + "?s=" + season + "&e=" + episode;
}

function filterMaster(raw, wanted) {
  const lines = raw.split(/\r?\n/);
  const audioLines = lines.filter((l) => l.startsWith("#EXT-X-MEDIA:"));
  const variants = [];
  let inf = null;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      inf = line;
      continue;
    }
    if (inf && line && !line.startsWith("#")) {
      const m = inf.match(/RESOLUTION=(\d+)x(\d+)/);
      const h = m ? parseInt(m[2], 10) : 0;
      variants.push({ h, inf, url: line });
      inf = null;
    }
  }
  if (!variants.length) throw new Error("no video variants in master playlist");

  // Prefer at-or-below the wanted height; overshoot penalized heavily.
  const score = (v) => Math.abs(v.h - wanted) + (v.h > wanted ? 5000 : 0);
  variants.sort((a, b) => score(a) - score(b) || b.h - a.h);
  const best = variants[0];

  const audioUrl = (audioLines[0] || "").match(/URI="([^"]+)"/);
  return {
    masterText:
      ["#EXTM3U", "#EXT-X-VERSION:7", ...audioLines, best.inf, best.url].join("\n") + "\n",
    variantUrl: best.url,
    audioUrl: audioUrl ? audioUrl[1] : null,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, no-store",
    },
  });
}

// Minimal dark RTL player page. Loads the SAME url (fetch/XHR → m3u8) with
// hls.js; Safari falls back to native HLS. Segments are CORS-open at the
// origin (verified), so playback needs no proxy.
function playerPage(url, cine, q) {
  const qualityLabel = q === "2160" ? "4K" : q === "720" ? "720p" : "1080p HD";
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>مشغل البث — ${qualityLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background:#0b0d12; color:#e5e7eb; font-family:system-ui,'Segoe UI',Tahoma,sans-serif;
         min-height:100vh; display:flex; flex-direction:column; }
  header { padding:12px 16px; display:flex; align-items:center; gap:10px;
           background:rgba(255,255,255,.04); border-bottom:1px solid rgba(255,255,255,.08); }
  .dot { width:8px; height:8px; border-radius:50%; background:#ef4444; }
  header h1 { font-size:14px; font-weight:600; }
  .badge { font-size:11px; background:rgba(16,185,129,.15); color:#10b981;
           padding:2px 8px; border-radius:99px; }
  main { flex:1; display:grid; place-items:center; padding:12px; }
  video { width:100%; max-width:1100px; aspect-ratio:16/9; background:#000;
          border-radius:12px; max-height:78vh; }
  .status { margin-top:10px; font-size:13px; color:#9ca3af; text-align:center; min-height:20px; }
  .err { color:#f87171; }
  a.home { color:#10b981; text-decoration:none; font-size:12px; margin-inline-start:auto; }
</style>
</head>
<body>
<header>
  <span class="dot"></span>
  <h1>FreeWatch — بث مباشر</h1>
  <span class="badge">${qualityLabel}</span>
  <a class="home" href="https://freewatch.uk/">→ الموقع</a>
</header>
<main>
  <div style="width:100%;max-width:1100px">
    <video id="v" controls playsinline preload="auto"></video>
    <div class="status" id="st">جارٍ تحميل البث…</div>
  </div>
</main>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js"></script>
<script>
(function () {
  var v = document.getElementById('v');
  var st = document.getElementById('st');
  var src = location.href.replace(/([?&])page=1&?/, '$1').replace(/[?&]$/, ''); // media URL
  // Trace every XHR hls.js issues (empty-url fragLoadError hunt)
  window.__xhrLog = [];
  (function () {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { window.__xhrLog.push(String(url).slice(0, 110)); } catch (x) {}
      return origOpen.apply(this, arguments);
    };
  })();
  function fail(msg) { st.textContent = msg; st.className = 'status err'; }
  // hls.js FIRST: MSE is reliable on Chromium/Firefox/Safari-desktop.
  // Native HLS only as fallback (iOS Safari) — some webviews report
  // canPlayType "maybe" yet fail to play (MEDIA_ERR_SRC_NOT_SUPPORTED).
  if (window.Hls && Hls.isSupported()) {
    var h = new Hls({ enableWorker: true, maxBufferLength: 30 });
    var retries = 0;
    h.loadSource(src);
    h.attachMedia(v);
    h.on(Hls.Events.MANIFEST_PARSED, function () {
      st.textContent = 'البث جاهز — اضغط تشغيل';
      v.play().catch(function () { st.textContent = 'البث جاهز — اضغط ▶ للتشغيل'; });
    });
    h.on(Hls.Events.FRAG_BUFFERED, function () { st.textContent = 'يشغّل الآن ▶'; });
    window.__hlsDiag = window.__hlsDiag || [];
    h.on(Hls.Events.ERROR, function (e, d) {
      if (!d.fatal) return;
      try {
        window.__hlsDiag.push({
          type: String(d.type), details: String(d.details),
          url: String(d.url || '').slice(0, 120),
          resp: d.response ? String(d.response.code) : null,
          reason: String(d.reason || '').slice(0, 80),
        });
      } catch (x) {}
      if ((d.type === Hls.ErrorTypes.NETWORK_ERROR) && retries < 4) {
        retries++;
        st.textContent = 'انقطاع بسيط — إعادة المحاولة ' + retries + '/4…';
        setTimeout(function () { h.startLoad(); }, 1000 * retries);
        return;
      }
      if ((d.type === Hls.ErrorTypes.MEDIA_ERROR) && retries < 4) {
        retries++;
        st.textContent = 'إصلاح المشغّل…';
        h.recoverMediaError();
        return;
      }
      fail('تعذر تشغيل البث: ' + d.details);
    });
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = src; v.play().catch(function(){});
    st.textContent = 'تشغيل مباشر (HLS أصلي)';
  } else {
    fail('المتصفح لا يدعم تشغيل HLS');
  }
})();
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

async function captureMaster(browserBinding, embedUrl) {
  let stage = "launch";
  let browser;
  try {
    browser = await puppeteer.launch(browserBinding);
    stage = "newPage";
    const page = await browser.newPage();
    stage = "response-listener";
    // Capture .m3u8 response BODIES from inside the browser context — the
    // origin blocks direct datacenter fetches (418) but serves its own
    // player's requests normally. The first responses may be child/audio
    // playlists; the MASTER is the one containing #EXT-X-STREAM-INF.
    const candidates = [];
    let master = null;
    page.on("response", async (res) => {
      const u = res.url();
      if (!/\.m3u8(\?|$)/i.test(u)) return;
      try {
        const text = await res.text();
        if (!text || !text.includes("#EXTM3U")) return;
        if (text.includes("#EXT-X-STREAM-INF")) {
          if (!master) master = { url: u, body: text };
        } else {
          candidates.push({ url: u, body: text });
        }
      } catch {}
    });
    stage = "goto-cinesrc";
    await page.goto(embedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    stage = "wait-m3u8";
    const deadline = Date.now() + 25000;
    while (!master && Date.now() < deadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
    if (!master) {
      const sample = candidates
        .slice(0, 2)
        .map((c) => c.url.slice(0, 80))
        .join(" | ");
      throw new Error(
        `no master playlist captured (got ${candidates.length} child playlists${sample ? ": " + sample : ""})`,
      );
    }
    return { master, children: candidates, page, browser };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`[stage=${stage}] ${msg}`);
  }
}

// Fetch the chosen variant/audio playlists from INSIDE the captured page:
// that context is authorized (correct referer + accepted egress), while the
// worker's own fetch is 418-blocked. Absolutizes segment URLs (segments are
// NOT referer-protected — verified live — so they stay direct to origin).
async function fetchChildrenInPage(page, master, variantUrl, audioUrl) {
  const grab = async (u) => {
    if (!u) return null;
    try {
      const abs = new URL(u, master.url).toString();
      const body = await page.evaluate(
        async (target) => {
          const r = await fetch(target, { credentials: "omit" });
          return r.ok ? await r.text() : null;
        },
        abs,
      );
      if (!body) return null;
      return absolutizePlaylist(body, abs);
    } catch {
      return null;
    }
  };
  const [video, audio] = await Promise.all([grab(variantUrl), grab(audioUrl)]);
  return { video, audio };
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ ok: true, service: "cinesrc-resolver" });
  }

  if (url.pathname === "/debug-launch") {
    try {
      const browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 20000 });
      const title = await page.title();
      await browser.close().catch(() => {});
      return json({ ok: true, title });
    } catch (e) {
      const detail = e && e.stack ? String(e.stack).slice(0, 500) : String(e);
      return json({ ok: false, error: detail }, 502);
    }
  }

  if (url.pathname.startsWith("/hls-media")) {
    return handleHlsMedia(request, url, env);
  }

  if (url.pathname.startsWith("/hls-pl")) {
    return handleHlsPl(url, env);
  }

  if (!url.pathname.startsWith("/hls")) {
    return json({ ok: false, error: "not found" }, 404);
  }

  const token = url.searchParams.get("token") || "";
  if (!env.CINE_HLS_TOKEN) {
    return json({ ok: false, error: "service not configured" }, 503);
  }
  const tokenBytes = new TextEncoder().encode(token);
  const secretBytes = new TextEncoder().encode(env.CINE_HLS_TOKEN);
  const equal =
    tokenBytes.length === secretBytes.length &&
    tokenBytes.every((byte, i) => byte === secretBytes[i]);
  if (!equal) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const cine = url.searchParams.get("cine") || "";
  const q = url.searchParams.get("q") || "1080";
  const embedUrl = cinesrcEmbedFromComposite(cine);
  if (!embedUrl) {
    return json({ ok: false, error: "invalid cine id" }, 400);
  }

  // Content negotiation: a real browser NAVIGATION gets an embedded player
  // page (the same URL plays in-browser); every other client — cast apps,
  // TV players, fetch()/XHR sniffers — keeps receiving the raw m3u8.
  // Sec-Fetch-Dest: document is only sent on top-level navigations, so
  // Web Video Cast's network sniffer still sees the playlist. &page=1 is
  // an explicit override for embedded webviews with non-standard headers.
  const accept = request.headers.get("accept") || "";
  const secDest = request.headers.get("sec-fetch-dest") || "";
  const wantsPlayerPage =
    url.searchParams.get("page") === "1" ||
    secDest === "document" ||
    (accept.includes("text/html") && !accept.includes("vnd.apple"));
  if (wantsPlayerPage) {
    return playerPage(url, cine, q);
  }

  // Edge cache: same query served from cache for 30 minutes (saves browser
  // minutes; master URLs rotate so the TTL must stay short). The cached
  // entry is the full bundle {master, video, audio} served by /hls + /hls-pl.
  // Canonical key (cine+q+token): the player page may append cache-busters
  // (_=...) and page=1 — /hls-pl must resolve the SAME bundle entry.
  const canonKey = new Request(
    "https://cache.internal/v7/hls?cine=" + encodeURIComponent(cine) +
    "&q=" + encodeURIComponent(q) + "&token=" + encodeURIComponent(token),
  );
  const cacheKey = canonKey;

  let bundle;
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    bundle = await cached.json();
  } else {
    let captured;
    try {
      captured = await captureMaster(env.BROWSER, embedUrl);
    } catch (e) {
      const detail = e && e.stack ? String(e.stack).slice(0, 400) : String(e);
      return json({ ok: false, error: detail }, 502);
    }
    try {
      const picked = filterMaster(captured.master.body, parseInt(q, 10));
      // Fetch the chosen playlists from inside the authorized page context;
      // fall back to whatever the player itself loaded, else to /hls-media.
      const inPage = await fetchChildrenInPage(
        captured.page,
        captured.master,
        picked.variantUrl,
        picked.audioUrl,
      );
      const fromCandidates = (u) => {
        if (!u) return null;
        const abs = new URL(u, captured.master.url).toString();
        const hit = captured.children.find((c) => c.url === abs);
        return hit ? absolutizePlaylist(hit.body, abs) : null;
      };
      const videoBody = inPage.video || fromCandidates(picked.variantUrl);
      const audioBody = inPage.audio || fromCandidates(picked.audioUrl);

      // Enforcement probe: fetch the first segment WITHOUT referer from the
      // page (authorized egress, client-like request). Some extraction
      // sessions produce hotlink-protected URLs (404 for browsers/TVs);
      // those are routed through the home proxy (residential authorized).
      let enforced = false;
      {
        // Hotlink enforcement varies PER FILE within one session — probe the
        // init (EXT-X-MAP) and first segment of BOTH tracks; any non-200
        // (no-referer) routes the whole episode through the home proxy.
        const probeTargets = [];
        for (const body of [videoBody, audioBody]) {
          if (!body) continue;
          const mapUri = (body.match(/URI="([^"]+)"/) || [])[1];
          if (mapUri) probeTargets.push(mapUri);
          const firstSeg = body.split(/\r?\n/).find((l) => l && !l.startsWith("#"));
          if (firstSeg) probeTargets.push(firstSeg);
        }
        if (probeTargets.length) {
          const statuses = await captured.page.evaluate(
            async (urls) => {
              return await Promise.all(
                urls.map(async (u) => {
                  try {
                    const r = await fetch(u, { referrerPolicy: "no-referrer" });
                    return r.status;
                  } catch {
                    return 0;
                  }
                }),
              );
            },
            probeTargets,
          );
          enforced = statuses.some((st) => st !== 200);
        }
      }
      let videoFinal = videoBody;
      let audioFinal = audioBody;
      if (enforced && env.HOME_SEG_BASE && env.HOME_SEG_TOKEN) {
        const toHome = (u) =>
          env.HOME_SEG_BASE + "/hls/" + env.HOME_SEG_TOKEN + "/seg?url=" + encodeURIComponent(u);
        if (videoBody) videoFinal = rewritePlaylistGeneric(videoBody, "https://cast.freewatch.uk/", toHome);
        if (audioBody) audioFinal = rewritePlaylistGeneric(audioBody, "https://cast.freewatch.uk/", toHome);
      }

      const plUrl = (kind) =>
        "https://cast.freewatch.uk/hls-pl?cine=" +
        encodeURIComponent(cine) + "&q=" + encodeURIComponent(q) +
        "&kind=" + kind + "&token=" + encodeURIComponent(token);
      const masterText = picked.masterText
        .replace(/(URI=")([^"]+)(")/, '$1' + plUrl("audio") + '$3')
        .replace(/^(https?:\/\/\S+)$/m, plUrl("video"));

      bundle = { master: masterText, video: videoFinal, audio: audioFinal, enforced };
    } catch (e) {
      const detail = e && e.stack ? String(e.stack).slice(0, 400) : String(e);
      return json({ ok: false, error: detail }, 502);
    } finally {
      if (captured && captured.browser) {
        await captured.browser.close().catch(() => {});
      }
    }
    await caches.default.put(
      cacheKey,
      new Response(JSON.stringify(bundle), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
      }),
    );
  }

  const res = new Response(bundle.master, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=1800",
    },
  });
  return res;
}

// Serve the captured variant/audio playlists (already segment-absolutized).
async function handleHlsPl(url, env) {
  const token = url.searchParams.get("token") || "";
  if (!env.CINE_HLS_TOKEN || token !== env.CINE_HLS_TOKEN) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const kind = url.searchParams.get("kind") === "audio" ? "audio" : "video";
  const cacheKey = new Request(
    "https://cache.internal/v7/hls?cine=" +
      encodeURIComponent(url.searchParams.get("cine") || "") +
      "&q=" + encodeURIComponent(url.searchParams.get("q") || "1080") +
      "&token=" + encodeURIComponent(token),
  );
  const cached = await caches.default.match(cacheKey);
  if (!cached) {
    return json({ ok: false, error: "bundle expired — reload the cast link" }, 404);
  }
  const bundle = await cached.json();
  const body = bundle[kind];
  if (!body) {
    return json({ ok: false, error: "playlist not captured for this quality" }, 404);
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, no-store",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
};
