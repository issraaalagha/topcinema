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
  const audio = lines.filter((l) => l.startsWith("#EXT-X-MEDIA:"));
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

  return (
    ["#EXTM3U", "#EXT-X-VERSION:7", ...audio, best.inf, best.url].join("\n") + "\n"
  );
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
  function fail(msg) { st.textContent = msg; st.className = 'status err'; }
  // hls.js FIRST: MSE is reliable on Chromium/Firefox/Safari-desktop.
  // Native HLS only as fallback (iOS Safari) — some webviews report
  // canPlayType "maybe" yet fail to play (MEDIA_ERR_SRC_NOT_SUPPORTED).
  if (window.Hls && Hls.isSupported()) {
    var h = new Hls({ enableWorker: true });
    h.loadSource(src);
    h.attachMedia(v);
    h.on(Hls.Events.MANIFEST_PARSED, function () {
      st.textContent = 'البث جاهز — اضغط تشغيل';
      v.play().catch(function () { st.textContent = 'البث جاهز — اضغط ▶ للتشغيل'; });
    });
    h.on(Hls.Events.FRAG_BUFFERED, function () { st.textContent = 'يشغّل الآن ▶'; });
    h.on(Hls.Events.ERROR, function (e, d) {
      if (d.fatal) fail('تعذر تشغيل البث: ' + d.details);
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
    return master;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`[stage=${stage}] ${msg}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
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
  // minutes; master URLs rotate so the TTL must stay short).
  const cacheKey = new Request(
    "https://cache.internal/hls?" + url.searchParams.toString(),
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  let filtered;
  try {
    const captured = await captureMaster(env.BROWSER, embedUrl);
    filtered = filterMaster(captured.body, parseInt(q, 10));
  } catch (e) {
    const detail = e && e.stack ? String(e.stack).slice(0, 400) : String(e);
    return json({ ok: false, error: detail }, 502);
  }

  const res = new Response(filtered, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=1800",
    },
  });
  await caches.default.put(cacheKey, res.clone());
  return res;
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
};
