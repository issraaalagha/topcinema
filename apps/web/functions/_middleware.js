import { isAuthorized } from './api/_auth.js';
import { CORS_HEADERS } from './api/_utils.js';

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // 1. Always allow CORS preflights
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 2. Allow public auth routes, media proxy & assets
  if (
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/proxy') ||
    !url.pathname.startsWith('/api/')
  ) {
    return next();
  }

  // 3. Verify Edge Token for protected /api/* routes
  const authenticated = await isAuthorized(request, env);

  if (!authenticated) {
    return new Response(
      JSON.stringify({
        ok: false,
        requiresAuth: true,
        error: 'يرجى إدخال رمز المرور للدخول إلى المنصة 🔐',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...CORS_HEADERS,
        },
      }
    );
  }

  return next();
}
