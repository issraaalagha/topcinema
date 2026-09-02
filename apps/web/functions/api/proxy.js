/**
 * Cloudflare Edge Media & HLS Proxy
 * Enterprise-Grade Edge Proxy for M3U8 Playlists, TS Segments, and MP4 Video Streams.
 *
 * Access control is enforced centrally in functions/_middleware.js: a valid
 * session (cookie/Bearer) or a short-lived proxy-scoped media ticket (`mt`)
 * is required before this handler runs — this endpoint is never public.
 *
 * Features:
 * - Rewrites nested M3U8 playlists and TS chunks to route through Edge Proxy
 * - Spoofs upstream Referer and Origin to bypass CDN anti-hotlinking
 * - Forwards Range requests for seeking in MP4/TS streams (206 Partial Content)
 * - Manual redirect following with per-hop re-validation (no blind fetches)
 * - Error resilient with status forwarding
 */

const MAX_REDIRECTS = 4;

function isPublicHttpsUrl(u) {
  if (!u || u.protocol !== 'https:') return false;
  const h = u.hostname;
  if (!h || h.includes(':')) return false; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false; // IPv4 literal
  if (/(^|\.)(localhost|local|internal)$/.test(h)) return false;
  return true;
}

/**
 * Optional operator lock-down: when PROXY_ALLOWED_HOSTS is set (comma-separated
 * domain suffixes), every target — including redirect hops — must match it.
 */
function isAllowedHost(hostname, env) {
  const allowlist = env?.PROXY_ALLOWED_HOSTS;
  if (!allowlist) return true;
  return allowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((suffix) => hostname === suffix || hostname.endsWith('.' + suffix));
}

function targetError(message, status) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get('url');
  const customReferer = reqUrl.searchParams.get('ref');
  const mediaTicket = reqUrl.searchParams.get('mt');

  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!targetUrl) {
    return targetError('Missing URL parameter', 400);
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return targetError('Invalid URL', 400);
  }

  if (!isPublicHttpsUrl(parsedTarget) || !isAllowedHost(parsedTarget.hostname, env)) {
    return targetError('Blocked target', 403);
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

  let cleanTargetUrl = targetUrl.replace(/&asn=\d+/g, '');

  // Manual redirect following: every hop is re-validated against the same
  // scheme/host policy (OWASP SSRF prevention — no blind redirect fetches).
  let upstreamResponse;
  try {
    let hopUrl = cleanTargetUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      upstreamResponse = await fetch(hopUrl, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: fetchHeaders,
        redirect: 'manual',
      });
      if (!upstreamResponse.ok || upstreamResponse.status < 300 || upstreamResponse.status > 308) break;
      const location = upstreamResponse.headers.get('location');
      if (!location) break;
      let nextUrl;
      try {
        nextUrl = new URL(location, hopUrl);
      } catch {
        return targetError('Blocked redirect target', 403);
      }
      if (!isPublicHttpsUrl(nextUrl) || !isAllowedHost(nextUrl.hostname, env)) {
        return targetError('Blocked redirect target', 403);
      }
      hopUrl = nextUrl.toString();
    }
  } catch (err) {
    return targetError('Edge Proxy Fetch Error', 502);
  }

  // If upstream failed and it's not a range error
  if (!upstreamResponse.ok && upstreamResponse.status !== 206 && upstreamResponse.status !== 304) {
    return targetError(`Upstream error ${upstreamResponse.status}`, upstreamResponse.status);
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

  // ── Content sniffing: some origins disguise playlists and segments as
  // .jpg/.png (image/jpeg content-type). Peek the first bytes and detect an
  // HLS playlist by content, not by extension — otherwise disguised child
  // playlists pass through un-rewritten and relative segment URIs resolve
  // against /api/proxy and hit the SPA shell.
  if (!upstreamResponse.body) {
    // HEAD (and 204/304) responses carry no body — nothing to sniff.
    return new Response(null, { status: upstreamResponse.status, headers: resHeaders });
  }
  const reader = upstreamResponse.body.getReader();
  const firstRead = await reader.read();
  const decoder = new TextDecoder();
  const headText = firstRead.value ? decoder.decode(firstRead.value.slice(0, 7)) : '';
  const looksLikePlaylist =
    upstreamResponse.status === 200 && (isM3u8 || headText.startsWith('#EXTM3U'));

  if (!looksLikePlaylist) {
    // Binary passthrough (segments / init / mp4 / ts) with the first chunk
    // re-attached so nothing is lost by the sniffing read.
    if (firstRead.done) {
      return new Response(null, { status: upstreamResponse.status, headers: resHeaders });
    }
    if (!isM3u8) {
      if (targetUrl.includes('.mp4') || !resHeaders.get('content-type') || resHeaders.get('content-type') === 'application/octet-stream') {
        resHeaders.set('Content-Type', 'video/mp4');
      } else if (targetUrl.includes('.ts')) {
        resHeaders.set('Content-Type', 'video/mp2t');
      }
    }
    const passthrough = new ReadableStream({
      start(controller) {
        controller.enqueue(firstRead.value);
        const pump = () =>
          reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
            return pump();
          });
        return pump();
      },
      cancel() {
        reader.cancel();
      },
    });
    return new Response(passthrough, {
      status: upstreamResponse.status,
      headers: resHeaders,
    });
  }

  // ── M3U8 Playlist Handling: Rewrite all relative and absolute URLs ────────
  {
    resHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
    resHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    const chunks = [];
    let total = 0;
    if (firstRead.value) {
      chunks.push(firstRead.value);
      total += firstRead.value.length;
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > 2 * 1024 * 1024) {
        reader.cancel(); // stop the upstream body; playlist exceeds hard cap
        break;
      }
    }
    const rawBytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      rawBytes.set(c, off);
      off += c.length;
    }
    const rawText = decoder.decode(rawBytes);

    if (!rawText.includes('#EXTM3U') && !rawText.includes('#EXT-X-')) {
      return targetError('Invalid HLS stream returned from upstream', 502);
    }

    const baseUrl = new URL(targetUrl);
    const proxyRef = encodeURIComponent(referer);
    // Ticketed sessions (cast receivers / native players) need the ticket on
    // every child request, since rewritten URLs are fetched without cookies.
    const ticketSuffix = mediaTicket ? `&mt=${encodeURIComponent(mediaTicket)}` : '';

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
            return `URI="/api/proxy?url=${encodeURIComponent(absKeyUrl)}&ref=${proxyRef}${ticketSuffix}"`;
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
      return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}&ref=${proxyRef}${ticketSuffix}`;
    });

    return new Response(rewrittenLines.join('\n'), {
      status: 200,
      headers: resHeaders,
    });
  }
}
