import { UPSTREAM_URL, jsonResponse, CORS_HEADERS } from '../../_utils.js';

/**
 * Extract only explicit HLS/MP4 URLs from third-party embed HTML.
 * Dynamic JavaScript from embeds is never executed or unpacked.
 */
function extractStreamFromHtml(html) {
  if (!html) return null;
  const source = html;
  const match = source.match(/"(?:hls2|hls|file|src)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i) ||
    source.match(/(?:file|src)\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
    source.match(/https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*/i);

  return match ? (match[1] || match[0]).replace(/\\/g, '') : null;
}

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

    const ajaxUrl = `${UPSTREAM_URL}/wp-content/themes/movies2023/Ajaxat/Single/Server.php`;
    const formData = new URLSearchParams({ id: postId, i: serverIdx });
    const ajaxRes = await fetch(ajaxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Referer: UPSTREAM_URL,
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

    let directStreamUrl = null;
    const debugInfo = { embedUrl, embedStatus: 0, embedLength: 0, extracted: null, err: null };

    try {
      const embedRes = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          Referer: UPSTREAM_URL,
        },
      });
      debugInfo.embedStatus = embedRes.status;
      if (embedRes.ok) {
        const embedBody = await embedRes.text();
        debugInfo.embedLength = embedBody.length;
        directStreamUrl = extractStreamFromHtml(embedBody);
        debugInfo.extracted = directStreamUrl;
      }
    } catch (err) {
      debugInfo.err = err.message;
    }

    if (directStreamUrl) {
      const proxiedUrl = `/api/proxy?url=${encodeURIComponent(directStreamUrl)}&ref=${encodeURIComponent(embedOrigin)}`;
      return jsonResponse({
        ok: true,
        url: proxiedUrl,
        direct: directStreamUrl,
        type: directStreamUrl.includes('.mp4') ? 'mp4' : 'hls',
      }, 200, 600);
    }

    return jsonResponse({
      ok: false,
      error: 'سيرفر البث المحدد لا يعرض رابط HLS أو MP4 صريحاً للمشغل النظيف.',
      debug: debugInfo,
    }, 200);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}

