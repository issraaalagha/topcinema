// Issues short-lived, proxy-scoped media tickets to authenticated users.
// These let <video>/HLS/cast receivers that cannot send Authorization headers
// stream through /api/proxy without session tokens appearing in URLs.
// Tickets carry no identity and grant access to /api/proxy only.

import { jsonResponse, CORS_HEADERS } from './_utils.js';
import { getSession, createMediaTicket } from './_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse({ ok: false, error: 'يرجى تسجيل الدخول' }, 401, 0);
  }

  try {
    const { ticket, expiresIn } = await createMediaTicket(env);
    return jsonResponse({ ok: true, mt: ticket, expiresIn }, 200, 0);
  } catch (error) {
    console.error('[media-ticket] internal error:', error);
    return jsonResponse({ ok: false, error: 'الخدمة غير مهيأة' }, 503, 0);
  }
}
