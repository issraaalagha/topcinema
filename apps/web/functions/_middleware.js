import { getSession, verifyMediaTicket } from './api/_auth.js';
import { CORS_HEADERS } from './api/_utils.js';

// Public surface — explicit allowlist only. Everything else under /api/
// requires an authenticated session (deny by default).
const PUBLIC_PATHS = [
  /^\/api\/auth\/login\/?$/,
  /^\/api\/auth\/verify\/?$/,
  /^\/api\/auth\/logout\/?$/,
];

// Public catalog reads (GET only) — shared, non-personal content. Subtitles
// are per-title (not per-user) and are consumed credential-less by cast
// receivers and external players, so they stay publicly readable.
const PUBLIC_GET_PATHS = [
  /^\/api\/home\/?$/,
  /^\/api\/catalog\/?$/,
  /^\/api\/post\/.+/,
  /^\/api\/episodes\/.+/,
  /^\/api\/subtitles\/.+/,
];

// NOTE: never construct Responses at module top scope — the Workers runtime
// disallows it in global scope; build them per-request inside the handler.
function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ ok: false, error: 'غير مصرح — يرجى تسجيل الدخول' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    }
  );
}

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // 1. Always allow CORS preflights
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 2. Static assets / non-API routes
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  // 3. Explicit public allowlist (auth entry points + catalog reads)
  if (PUBLIC_PATHS.some((re) => re.test(url.pathname))) {
    return next();
  }
  if (request.method === 'GET' && PUBLIC_GET_PATHS.some((re) => re.test(url.pathname))) {
    return next();
  }

  // 4. Everything else requires a valid session. The media proxy additionally
  //    accepts a short-lived, proxy-scoped media ticket for players/cast
  //    receivers that cannot send headers (never a session token in URLs).
  const session = await getSession(request, env);
  if (session) {
    return next();
  }

  if (url.pathname.startsWith('/api/proxy')) {
    const mt = url.searchParams.get('mt');
    if (mt && (await verifyMediaTicket(mt, env))) {
      return next();
    }
  }

  return unauthorizedResponse();
}
