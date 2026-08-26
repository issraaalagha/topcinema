// Cloudflare Pages Edge Function for TopCinema API Proxy & Edge Caching

const UPSTREAM_API = 'https://web.topcinemaa.live';

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);

  // Allow custom API backend from Environment Variables if set
  const apiBase = env?.API_UPSTREAM || UPSTREAM_API;
  
  // Construct target URL
  const targetUrl = new URL(url.pathname + url.search, apiBase);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Clone request headers, omitting host
  const headers = new Headers(request.headers);
  headers.set('Host', new URL(apiBase).host);
  headers.set('User-Agent', 'TopCinema-Cloudflare-Edge/2026');

  try {
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    // Set smart caching for read endpoints
    if (url.pathname.includes('/home') || url.pathname.includes('/catalog')) {
      responseHeaders.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200');
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Edge Gateway Error',
        message: error.message || 'Failed to communicate with upstream API',
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
