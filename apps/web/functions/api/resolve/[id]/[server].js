import { UPSTREAM_URL, jsonResponse, CORS_HEADERS } from '../../_utils.js';

/**
 * 🎬 TopCinema Enterprise Multi-Engine Stream Resolvers (v3.0.0 VIP Core)
 * Dedicated, isolated reverse-engineering engines for each video provider.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Core Cryptographic & Obfuscation Utilities
// ─────────────────────────────────────────────────────────────────────────────

function universalUnpack(html) {
  if (!html || !html.includes('eval(function(p,a,c,k,e,d)')) return html;
  
  let result = html;
  const regex = /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\s*\(\s*(['"][\s\S]*?['"])\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"][\s\S]*?['"])\.split\(['"]\|['"]\)/g;
  
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      let p = match[1].slice(1, -1);
      const a = parseInt(match[2], 10);
      let c = parseInt(match[3], 10);
      const k = match[4].slice(1, -1).split('|');

      while (c--) {
        if (k[c]) {
          const re = new RegExp(`\\b${c.toString(a)}\\b`, 'g');
          p = p.replace(re, k[c]);
        }
      }
      result += '\n' + p;
    } catch {}
  }
  return result;
}

function cleanStreamUrl(url) {
  if (!url) return null;
  return url.replace(/&asn=\d+/g, '').replace(/\\/g, '').trim();
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dedicated Provider Engines
// ─────────────────────────────────────────────────────────────────────────────

const UpDownEngine = {
  name: 'UpDown Engine',
  canHandle: (url) => /updown|gamescdn/i.test(url),
  async extract(embedUrl) {
    const res = await fetch(embedUrl, {
      headers: { ...BROWSER_HEADERS, 'Referer': `${UPSTREAM_URL}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const unpacked = universalUnpack(html);
    const mp4Match = unpacked.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*/i) ||
                     unpacked.match(/(?:file|src|source)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
    const raw = mp4Match ? (mp4Match[1] || mp4Match[0]) : null;
    return raw ? { url: cleanStreamUrl(raw), type: raw.includes('.m3u8') ? 'hls' : 'mp4' } : null;
  }
};

const VidTubeEngine = {
  name: 'VideoTube Engine',
  canHandle: (url) => /vidtube|cdn-video/i.test(url),
  async extract(embedUrl) {
    const res = await fetch(embedUrl, {
      headers: { ...BROWSER_HEADERS, 'Referer': `${UPSTREAM_URL}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const unpacked = universalUnpack(html);
    const hlsMatch = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i) ||
                     unpacked.match(/(?:file|src|source)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
    const raw = hlsMatch ? (hlsMatch[1] || hlsMatch[0]) : null;
    return raw ? { url: cleanStreamUrl(raw), type: 'hls' } : null;
  }
};

const StreamWishEngine = {
  name: 'StreamWish Engine',
  canHandle: (url) => /streamwish|premilkyway|swish/i.test(url),
  async extract(embedUrl) {
    const res = await fetch(embedUrl, {
      headers: { ...BROWSER_HEADERS, 'Referer': `${UPSTREAM_URL}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const unpacked = universalUnpack(html);
    const hlsMatch = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i) ||
                     unpacked.match(/(?:file|src|source)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
    const raw = hlsMatch ? (hlsMatch[1] || hlsMatch[0]) : null;
    return raw ? { url: cleanStreamUrl(raw), type: 'hls' } : null;
  }
};

const FileLionsEngine = {
  name: 'FileLions Engine',
  canHandle: (url) => /filelions|earnvids|acek-cdn/i.test(url),
  async extract(embedUrl) {
    const res = await fetch(embedUrl, {
      headers: { ...BROWSER_HEADERS, 'Referer': `${UPSTREAM_URL}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const unpacked = universalUnpack(html);
    const hlsMatch = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i) ||
                     unpacked.match(/(?:file|src|source)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
    const raw = hlsMatch ? (hlsMatch[1] || hlsMatch[0]) : null;
    return raw ? { url: cleanStreamUrl(raw), type: 'hls' } : null;
  }
};

const MixdropEngine = {
  name: 'Mixdrop Engine',
  canHandle: (url) => /mixdrop/i.test(url),
  async extract(embedUrl) {
    const res = await fetch(embedUrl, {
      headers: { ...BROWSER_HEADERS, 'Referer': `${UPSTREAM_URL}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    let unpacked = html;
    if (html.includes('eval(function(p,a,c,k,e,d)')) {
      const packed = html.match(/eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\).*?\)/gs) || [];
      for (const b of packed) unpacked += '\n' + universalUnpack(b);
    }
    const match = unpacked.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*/i);
    const raw = match ? match[0] : null;
    return raw ? { url: cleanStreamUrl(raw), type: raw.includes('.mp4') ? 'mp4' : 'hls' } : null;
  }
};

const GenericEngine = {
  name: 'Generic Universal Engine',
  canHandle: () => true,
  async extract(embedUrl) {
    const res = await fetch(embedUrl, {
      headers: { ...BROWSER_HEADERS, 'Referer': `${UPSTREAM_URL}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    let unpacked = html;
    if (html.includes('eval(function(p,a,c,k,e,d)')) {
      const packed = html.match(/eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\).*?\)/gs) || [];
      for (const b of packed) unpacked += '\n' + universalUnpack(b);
    }

    let match = unpacked.match(/"(?:hls2|hls|file|src|source|video)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i) ||
                unpacked.match(/(?:file|src|source|video)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
                unpacked.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/i);
    const raw = match ? (match[1] || match[0]) : null;
    return raw ? { url: cleanStreamUrl(raw), type: raw.includes('.mp4') ? 'mp4' : 'hls' } : null;
  }
};

const ENGINES = [
  UpDownEngine,
  VidTubeEngine,
  StreamWishEngine,
  FileLionsEngine,
  MixdropEngine,
  GenericEngine
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. Worker Request Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { id, server } = params;

  try {
    let postId = id;
    let serverIdx = '0';

    if (server && server.includes('__')) {
      const parts = server.split('__');
      postId = parts[0];
      serverIdx = parts[1];
    } else if (server) {
      serverIdx = server;
    }

    // Step 1: Retrieve embed iframe from upstream TopCinema WordPress Ajax
    const ajaxUrl = `${UPSTREAM_URL}/wp-content/themes/movies2023/Ajaxat/Single/Server.php`;
    const formData = new URLSearchParams({ id: postId, i: serverIdx });
    const ajaxRes = await fetch(ajaxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        Referer: `${UPSTREAM_URL}/`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formData.toString(),
    });

    const iframeHtml = await ajaxRes.text();
    const iframeMatch = iframeHtml.match(/<iframe[^>]*src="([^"]+)"/i);
    if (!iframeMatch) {
      return jsonResponse({ ok: false, error: 'تعذر استخراج كود المشغل من السيرفر' }, 404);
    }

    let embedUrl = iframeMatch[1];
    if (embedUrl.startsWith('//')) embedUrl = `https:${embedUrl}`;

    let embedOrigin = '';
    try {
      const parsed = new URL(embedUrl);
      embedOrigin = `${parsed.protocol}//${parsed.hostname}/`;
    } catch {}

    // Step 2: Route embedUrl to the specialized server engine
    const matchedEngine = ENGINES.find((engine) => engine.canHandle(embedUrl)) || GenericEngine;
    
    let result = null;
    try {
      result = await matchedEngine.extract(embedUrl);
    } catch (err) {
      // If specialized engine fails, fallback to GenericEngine
      if (matchedEngine !== GenericEngine) {
        try {
          result = await GenericEngine.extract(embedUrl);
        } catch {}
      }
    }

    if (result && result.url) {
      const proxiedUrl = `/api/proxy?url=${encodeURIComponent(result.url)}&ref=${encodeURIComponent(embedOrigin)}`;
      return jsonResponse({
        ok: true,
        url: proxiedUrl,
        direct: result.url,
        type: result.type,
        engine: matchedEngine.name
      }, 200, 600);
    }

    return jsonResponse({
      ok: false,
      error: 'سيرفر البث المحدد لا يعرض رابط HLS أو MP4 صريحاً للمشغل النظيف.',
      engine: matchedEngine.name,
      embedUrl
    }, 200);

  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}

