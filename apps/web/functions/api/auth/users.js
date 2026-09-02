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
          400,
          0
        );
      }
      if (password.length < 6) {
        return jsonResponse({ ok: false, error: 'كلمة المرور: 6 أحرف على الأقل' }, 400, 0);
      }
      // Only owner may mint admins
      if (role === 'admin' && !hasRole(session, 'owner')) {
        return jsonResponse({ ok: false, error: 'إنشاء مشرفين للمالك فقط' }, 403, 0);
      }

      const exists = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (exists) {
        return jsonResponse({ ok: false, error: 'اسم المستخدم محجوز' }, 409, 0);
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

      return jsonResponse({ ok: true, id, username, role }, 200, 0);
    }

    // ── UPDATE ────────────────────────────────────────────────────────────
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const target = await db
        .prepare('SELECT id, username, role FROM users WHERE id = ?')
        .bind(String(body.id || ''))
        .first();
      if (!target) return jsonResponse({ ok: false, error: 'الحساب غير موجود' }, 404, 0);

      // Role-hierarchy integrity: mutating an admin row (role/password/active)
      // or granting the admin role requires owner. Admins may only manage
      // viewers. (Owner rows stay owner-only, as before.)
      const touchesAdminRow = target.role === 'admin';
      const grantsAdminRole = body.role === 'admin';
      if (
        target.role === 'owner' ||
        body.role === 'owner' ||
        ((touchesAdminRow || grantsAdminRole) && !hasRole(session, 'owner'))
      ) {
        return unauthorized();
      }

      if (body.active !== undefined) {
        // Can't deactivate yourself
        if (target.username === session.sub && body.active === 0) {
          return jsonResponse({ ok: false, error: 'لا يمكنك تعطيل حسابك الحالي' }, 400, 0);
        }
        await db.prepare('UPDATE users SET active = ? WHERE id = ?').bind(body.active ? 1 : 0, target.id).run();
      }

      if (body.role && ['viewer', 'admin'].includes(body.role)) {
        // Bump token_version: role change revokes the target's live sessions
        await db
          .prepare('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?')
          .bind(body.role, target.id)
          .run();
      }

      if (body.password) {
        if (String(body.password).length < 6) {
          return jsonResponse({ ok: false, error: 'كلمة المرور: 6 أحرف على الأقل' }, 400, 0);
        }
        const salt = generateSalt();
        const passHash = await hashPassword(String(body.password), salt);
        // Bump token_version: password reset revokes the target's live sessions
        await db
          .prepare('UPDATE users SET pass_hash = ?, salt = ?, token_version = token_version + 1 WHERE id = ?')
          .bind(passHash, salt, target.id)
          .run();
      }

      return jsonResponse({ ok: true }, 200, 0);
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      const target = await db.prepare('SELECT username, role FROM users WHERE id = ?').bind(id).first();
      if (!target) return jsonResponse({ ok: false, error: 'الحساب غير موجود' }, 404, 0);
      // Hierarchy: admins may only delete viewers; admins/owners need owner.
      if (target.role !== 'viewer' && !hasRole(session, 'owner')) return unauthorized();
      if (target.username === session.sub) {
        return jsonResponse({ ok: false, error: 'لا يمكنك حذف حسابك الحالي' }, 400, 0);
      }

      await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return jsonResponse({ ok: true }, 200, 0);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405, 0);
  } catch (error) {
    console.error('[users] internal error:', error);
    return jsonResponse({ ok: false, error: 'حدث خطأ داخلي، حاول لاحقاً' }, 500, 0);
  }
}
