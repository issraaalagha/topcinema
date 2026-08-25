import { UPSTREAM_URL, jsonResponse, CORS_HEADERS } from '../../_utils.js';

/**
 * Extract only explicit HLS/MP4 URLs from third-party embed HTML.
 * Dynamic JavaScript from embeds is never executed or unpacked.
 */
function extractStreamFromHtml(html) {
  if (!html) return null;
  const source = html;
  
  // Pattern 1: JSON-like "hls2", "hls", "file", "src" properties
  let match = source.match(/"(?:hls2|hls|file|src|source|video)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i);
  if (match && match[1]) return match[1].replace(/\\/g, '');
  
  // Pattern 2: JavaScript variable assignments
  match = source.match(/(?:file|src|source|video)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
  if (match && match[1]) return match[1].replace(/\\/g, '');
  
  // Pattern 3: Direct URL in HTML/JS (not inside quotes)
  match = source.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?/i);
  if (match && match[0]) return match[0].replace(/\\/g, '');
  
  // Pattern 4: Base64 or encoded patterns
  match = source.match(/atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/);
  if (match && match[1]) {
    try {
      const decoded = atob(match[1]);
      if (decoded.match(/\.(?:m3u8|mp4)/i)) return decoded;
    } catch {}
  }
  
  // Pattern 5: Common video platforms
  match = source.match(/(?:videotube|streamwish|filelions|lulustream|updown)[\w.-]*\/(?:e|embed|v)\/([a-zA-Z0-9_-]+)/i);
  if (match && match[0]) {
    // Return the embed URL itself if no direct stream found
    return match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
  }
  
  return null;
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
    const debugInfo = { embedUrl, embedStatus: 0, embedLength: 0, extracted: null, err: null, attempts: [] };

    // Attempt 1: Fetch embed page with standard browser headers
    try {
      const embedRes = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Referer': UPSTREAM_URL,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        },
      });
      debugInfo.embedStatus = embedRes.status;
      debugInfo.attempts.push({ method: 'embed-page', status: embedRes.status });
      
      if (embedRes.ok) {
        const embedBody = await embedRes.text();
        debugInfo.embedLength = embedBody.length;
        directStreamUrl = extractStreamFromHtml(embedBody);
        debugInfo.extracted = directStreamUrl;
        
        // Try common stream path patterns if no direct URL found
        if (!directStreamUrl && embedUrl.includes('/e/')) {
          const videoId = embedUrl.match(/\/e\/([a-zA-Z0-9_-]+)/)?.[1];
          if (videoId) {
            const commonPaths = [
              embedOrigin + `hls/${videoId}/index.m3u8`,
              embedOrigin + `stream/${videoId}.m3u8`,
              embedOrigin + `api/source/${videoId}`,
            ];
            
            for (const testUrl of commonPaths) {
              try {
                const testRes = await fetch(testUrl, { method: 'HEAD' });
                if (testRes.ok) {
                  directStreamUrl = testUrl;
                  debugInfo.attempts.push({ method: 'path-guess', url: testUrl, found: true });
                  break;
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      debugInfo.err = err.message;
      debugInfo.attempts.push({ method: 'embed-page', error: err.message });
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

