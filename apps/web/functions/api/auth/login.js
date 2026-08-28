import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import {
  createSessionToken,
  getExpectedPasscode,
  verifyPassword,
} from '../_auth.js';

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
    const { username, password, passcode, remember = true } = body;

    // ── Path 1: account login (username + password from D1) ──
    if (username && password) {
      if (!env?.DB) {
        return jsonResponse({ ok: false, error: 'قاعدة البيانات غير متاحة' }, 503);
      }

      const user = await env.DB
        .prepare('SELECT * FROM users WHERE username = ? LIMIT 1')
        .bind(String(username).trim().toLowerCase())
        .first();

      if (!user || !user.active) {
        return jsonResponse({ ok: false, error: 'الحساب غير موجود أو معطّل' }, 401);
      }

      const valid = await verifyPassword(password, user.salt, user.pass_hash);
      if (!valid) {
        return jsonResponse({ ok: false, error: 'كلمة المرور غير صحيحة' }, 401);
      }

      const { token, maxAge } = await createSessionToken(
        { sub: user.username, role: user.role },
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
            'Set-Cookie': `tc_auth=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
            ...CORS_HEADERS,
          },
        }
      );
    }

    // ── Path 2: master passcode (owner recovery / bootstrap) ──
    const expected = getExpectedPasscode(env);
    if (passcode && String(passcode).trim() === String(expected).trim()) {
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
            'Set-Cookie': `tc_auth=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
            ...CORS_HEADERS,
          },
        }
      );
    }

    return jsonResponse({ ok: false, error: 'بيانات الدخول غير صحيحة' }, 401);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
