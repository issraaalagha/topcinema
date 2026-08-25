import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import { createSessionToken, getExpectedPasscode } from '../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { passcode, remember = true } = body;

    const expected = getExpectedPasscode(env);

    if (!passcode || String(passcode).trim() !== String(expected).trim()) {
      return jsonResponse({ ok: false, error: 'رمز الدخول غير صحيح' }, 401);
    }

    const { token, maxAge } = await createSessionToken(passcode, env, remember);

    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `tc_auth=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
      ...CORS_HEADERS,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        token,
        expiresIn: maxAge,
        message: 'تم تسجيل الدخول بنجاح! 🍿',
      }),
      { status: 200, headers }
    );
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
