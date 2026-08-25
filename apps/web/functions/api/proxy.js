/**
 * Cloudflare Edge Media & HLS Proxy
 * Enterprise-Grade Edge Proxy for M3U8 Playlists, TS Segments, and MP4 Video Streams.
 *
 * Features:
 * - Rewrites nested M3U8 playlists and TS chunks to route through Edge Proxy
 * - Spoofs upstream Referer and Origin to bypass CDN anti-hotlinking
 * - Forwards Range requests for seeking in MP4/TS streams (206 Partial Content)
 * - Full CORS headers (Access-Control-Allow-Origin: *)
 * - Error resilient with status forwarding
 */

export async function onRequest(context) {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get('url');
  const customReferer = reqUrl.searchParams.get('ref');

  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Timing-Allow-Origin': '*',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!targetUrl) {
    return new Response('Missing URL parameter', { status: 400, headers: CORS_HEADERS });
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response('Invalid URL', { status: 400, headers: CORS_HEADERS });
  }

  // Determine Referer and Origin
  let referer = customReferer || `${parsedTarget.protocol}//${parsedTarget.hostname}/`;
  let origin = referer.replace(/\/$/, '');

  const fetchHeaders = new Headers();
  fetchHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  fetchHeaders.set('Referer', referer);
  fetchHeaders.set('Origin', origin);
  fetchHeaders.set('Accept', '*/*');

  // Forward Range header if present (crucial for MP4 seeking & buffer chunks)
  const range = request.headers.get('range');
  if (range) {
    fetchHeaders.set('Range', range);
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response(`Edge Proxy Fetch Error: ${err.message}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  // If upstream failed and it's not a range error
  if (!upstreamResponse.ok && upstreamResponse.status !== 206 && upstreamResponse.status !== 304) {
    return new Response(`Upstream error ${upstreamResponse.status}: ${upstreamResponse.statusText}`, {
      status: upstreamResponse.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/plain',
      },
    });
  }

  const contentType = upstreamResponse.headers.get('content-type') || '';
  const isM3u8 = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegurl');

  const resHeaders = new Headers(CORS_HEADERS);
  resHeaders.set('Accept-Ranges', 'bytes');

  // Forward useful headers
  for (const h of ['content-type', 'content-length', 'content-range', 'cache-control', 'etag', 'last-modified']) {
    const val = upstreamResponse.headers.get(h);
    if (val) resHeaders.set(h, val);
  }

  // ── M3U8 Playlist Handling: Rewrite all relative and absolute URLs ────────
  if (isM3u8) {
    resHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
    resHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    const rawText = await upstreamResponse.text();

    if (!rawText.includes('#EXTM3U') && !rawText.includes('#EXT-X-')) {
      return new Response('Invalid HLS stream returned from upstream', {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const baseUrl = new URL(targetUrl);
    const proxyRef = encodeURIComponent(referer);

    const lines = rawText.split('\n');
    const rewrittenLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        // Check for URI inside #EXT-X-KEY or #EXT-X-MAP
        if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            let absKeyUrl = uri;
            try {
              absKeyUrl = new URL(uri, baseUrl).toString();
            } catch {}
            return `URI="/api/proxy?url=${encodeURIComponent(absKeyUrl)}&ref=${proxyRef}"`;
          });
        }
        return line;
      }

      // Convert line URL to absolute
      let absoluteUrl = trimmed;
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        try {
          absoluteUrl = new URL(trimmed, baseUrl).toString();
        } catch {
          return line;
        }
      }

      // Route all sub-playlists and TS chunks through Edge Proxy
      return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${proxyRef}`;
    });

    return new Response(rewrittenLines.join('\n'), {
      status: 200,
      headers: resHeaders,
    });
  }

  // ── Video Segments & MP4 Streams (Binary Passthrough with streaming) ─────
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: resHeaders,
  });
}
