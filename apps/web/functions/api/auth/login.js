import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import {
  createSessionToken,
  getExpectedPasscode,
  safeEqual,
  verifyPassword,
} from '../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, 0);
  }

  // Fail closed: refuse to authenticate when the signing secrets are absent
  if (!env?.JWT_SECRET || !env?.PASSCODE_SECRET) {
    return jsonResponse({ ok: false, error: 'الخدمة غير مهيأة: أسرار المصادقة غير مضبوطة' }, 503, 0);
  }

  // Uniform failure response: identical message for unknown user, wrong
  // password and wrong passcode (no account enumeration).
  const loginFailed = () => jsonResponse({ ok: false, error: 'بيانات الدخول غير صحيحة' }, 401, 0);

  try {
    const body = await request.json().catch(() => ({}));
    const { username, password, passcode, remember = true } = body;

    // ── Path 1: account login (username + password from D1) ──
    if (username && password) {
      if (!env?.DB) {
        return jsonResponse({ ok: false, error: 'قاعدة البيانات غير متاحة' }, 503, 0);
      }

      const user = await env.DB
        .prepare('SELECT * FROM users WHERE username = ? LIMIT 1')
        .bind(String(username).trim().toLowerCase())
        .first();

      const valid = user && user.active ? await verifyPassword(password, user.salt, user.pass_hash) : false;
      if (!valid) {
        return loginFailed();
      }

      const { token, maxAge } = await createSessionToken(
        { sub: user.username, role: user.role, ver: user.token_version || 0 },
        env,
        remember
      );

      return new Response(
        JSON.stringify({
          ok: true,
          token,
          role: user.role,
          username: user.username,
          expiresIn: maxAge,
          message: `أهلاً بعودتك ${user.username}! 🍿`,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'Set-Cookie': `tc_auth=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
            ...CORS_HEADERS,
          },
        }
      );
    }

    // ── Path 2: master passcode (owner recovery / bootstrap) ──
    const expected = getExpectedPasscode(env);
    if (passcode && expected && safeEqual(String(passcode).trim(), String(expected).trim())) {
      const { token, maxAge } = await createSessionToken(
        { sub: 'owner', role: 'owner' },
        env,
        remember
      );

      return new Response(
        JSON.stringify({
          ok: true,
          token,
          role: 'owner',
          username: 'owner',
          expiresIn: maxAge,
          message: 'تم دخول المالك! 🍿',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'Set-Cookie': `tc_auth=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
            ...CORS_HEADERS,
          },
        }
      );
    }

    return loginFailed();
  } catch (error) {
    console.error('[login] internal error:', error);
    return jsonResponse({ ok: false, error: 'حدث خطأ داخلي، حاول لاحقاً' }, 500, 0);
  }
}
