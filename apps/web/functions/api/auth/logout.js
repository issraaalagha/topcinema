import { jsonResponse, CORS_HEADERS } from '../_utils.js';

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': 'tc_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    ...CORS_HEADERS,
  });

  return new Response(
    JSON.stringify({ ok: true, message: 'تم تسجيل الخروج بنجاح' }),
    { status: 200, headers }
  );
}
