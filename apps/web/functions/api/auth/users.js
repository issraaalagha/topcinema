// Admin user-management API (owner/admin only, enforced by token role).
// GET    → list users
// POST   → create user {username, password, role}
// PATCH  → update {id, active?, role?, password?}
// DELETE → remove user ?id=

import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import {
  getSession,
  hasRole,
  hashPassword,
  generateSalt,
} from '../_auth.js';

function unauthorized() {
  return jsonResponse({ ok: false, error: 'هذه الصفحة للمشرفين فقط' }, 403);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const session = await getSession(request, env);
  if (!hasRole(session, 'admin')) return unauthorized();

  if (!env?.DB) {
    return jsonResponse({ ok: false, error: 'قاعدة البيانات غير متاحة' }, 503);
  }

  const db = env.DB;
  const url = new URL(request.url);

  try {
    // ── LIST ──────────────────────────────────────────────────────────────
    if (request.method === 'GET') {
      const { results } = await db
        .prepare(
          `SELECT id, username, role, active, created_at,
                  (SELECT COUNT(*) FROM watch_history h WHERE h.profile_id = u.username) AS history_count
           FROM users u ORDER BY created_at DESC`
        )
        .all();
      return jsonResponse({ ok: true, users: results || [] }, 200, 0);
    }

    // ── CREATE ────────────────────────────────────────────────────────────
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const role = ['viewer', 'admin'].includes(body.role) ? body.role : 'viewer';

      if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
        return jsonResponse(
          { ok: false, error: 'اسم المستخدم: 3-24 حرفاً لاتينياً/أرقاماً فقط' },
          400
        );
      }
      if (password.length < 6) {
        return jsonResponse({ ok: false, error: 'كلمة المرور: 6 أحرف على الأقل' }, 400);
      }
      // Only owner may mint admins
      if (role === 'admin' && !hasRole(session, 'owner')) {
        return jsonResponse({ ok: false, error: 'إنشاء مشرفين للمالك فقط' }, 403);
      }

      const exists = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (exists) {
        return jsonResponse({ ok: false, error: 'اسم المستخدم محجوز' }, 409);
      }

      const salt = generateSalt();
      const passHash = await hashPassword(password, salt);
      const id = crypto.randomUUID();

      await db
        .prepare(
          'INSERT INTO users (id, username, pass_hash, salt, role, active) VALUES (?, ?, ?, ?, ?, 1)'
        )
        .bind(id, username, passHash, salt, role)
        .run();

      return jsonResponse({ ok: true, id, username, role }, 200);
    }

    // ── UPDATE ────────────────────────────────────────────────────────────
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const target = await db
        .prepare('SELECT id, username, role FROM users WHERE id = ?')
        .bind(String(body.id || ''))
        .first();
      if (!target) return jsonResponse({ ok: false, error: 'الحساب غير موجود' }, 404);

      // Role changes on owners require owner; viewers can't touch owners
      if (target.role === 'owner' || body.role === 'owner') {
        if (!hasRole(session, 'owner')) return unauthorized();
      }

      if (body.active !== undefined) {
        // Can't deactivate yourself
        if (target.username === session.sub && body.active === 0) {
          return jsonResponse({ ok: false, error: 'لا يمكنك تعطيل حسابك الحالي' }, 400);
        }
        await db.prepare('UPDATE users SET active = ? WHERE id = ?').bind(body.active ? 1 : 0, target.id).run();
      }

      if (body.role && ['viewer', 'admin'].includes(body.role)) {
        await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, target.id).run();
      }

      if (body.password) {
        if (String(body.password).length < 6) {
          return jsonResponse({ ok: false, error: 'كلمة المرور: 6 أحرف على الأقل' }, 400);
        }
        const salt = generateSalt();
        const passHash = await hashPassword(String(body.password), salt);
        await db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(passHash, salt, target.id).run();
      }

      return jsonResponse({ ok: true });
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      const target = await db.prepare('SELECT username, role FROM users WHERE id = ?').bind(id).first();
      if (!target) return jsonResponse({ ok: false, error: 'الحساب غير موجود' }, 404);
      if (target.role === 'owner') return unauthorized();
      if (target.username === session.sub) {
        return jsonResponse({ ok: false, error: 'لا يمكنك حذف حسابك الحالي' }, 400);
      }

      await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
