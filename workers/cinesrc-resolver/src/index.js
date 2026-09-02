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

async function captureMaster(browserBinding, embedUrl) {
  let stage = "launch";
  try {
    const browser = await puppeteer.launch(browserBinding);
    stage = "newPage";
    const page = await browser.newPage();
    stage = "request-listener";
    const masters = [];
    page.on("request", (req) => {
      const u = req.url();
      if (/\.m3u8(\?|$)/i.test(u)) masters.push(u);
    });
    stage = "goto-cinesrc";
    await page.goto(embedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    stage = "wait-m3u8";
    const deadline = Date.now() + 20000;
    while (masters.length === 0 && Date.now() < deadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
    if (!masters.length) throw new Error("no master playlist captured");
    return masters[0];
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`[stage=${stage}] ${msg}`);
  } finally {
    await browser.close().catch(() => {});
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
    const master = await ctx.waitUntil(captureMaster(env.BROWSER, embedUrl));
    const masterRes = await fetch(master, {
      headers: { Referer: "https://cinesrc.st/" },
    });
    if (!masterRes.ok) throw new Error("master fetch failed with " + masterRes.status);
    filtered = filterMaster(await masterRes.text(), parseInt(q, 10));
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
