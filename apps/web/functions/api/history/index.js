import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import { getSession, hasRole } from '../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const db = env?.DB;
  const url = new URL(request.url);
  const profileId = url.searchParams.get('profile') || 'default';

  // Privacy: users access only their own profile; admins access any.
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse({ ok: false, error: 'يرجى تسجيل الدخول' }, 401);
  }
  const isOwn =
    profileId === session.sub || (session.sub === 'owner' && profileId === 'default');
  if (!isOwn && !hasRole(session, 'admin')) {
    return jsonResponse({ ok: false, error: 'لا تملك صلاحية الوصول لبيانات مستخدم آخر' }, 403);
  }

  if (!db) {
    return jsonResponse(
      { ok: true, items: [], warning: 'D1 binding not available' },
      200,
      0,
      { private: true }
    );
  }

  try {
    // 1. GET Watch History
    if (request.method === 'GET') {
      const { results } = await db
        .prepare(
          'SELECT * FROM watch_history WHERE profile_id = ? AND percent < 95 ORDER BY updated_at DESC LIMIT 20'
        )
        .bind(profileId)
        .all();

      const items = (results || []).map((row) => ({
        id: row.item_id,
        title: row.title,
        poster: row.poster,
        quality: row.quality,
        currentTime: row.current_time,
        duration: row.duration,
        percent: row.percent,
        updated_at: row.updated_at,
      }));

      // Per-user data: never publicly cacheable (SECURITY_AUDIT.md F-10)
      return jsonResponse({ ok: true, items }, 200, 0, { private: true });
    }

    // 2. POST (Save Progress)
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { id, title, poster = '', quality = '', currentTime = 0, duration = 0 } = body;

      if (!id || !title) {
        return jsonResponse({ ok: false, error: 'Missing id or title' }, 400, 0);
      }

      const percent = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;
      const historyId = `${profileId}__${id}`;

      // If user finished watching (> 95%), remove from continue watching
      if (percent >= 95) {
        await db
          .prepare('DELETE FROM watch_history WHERE profile_id = ? AND item_id = ?')
          .bind(profileId, String(id))
          .run();
        return jsonResponse({ ok: true, message: 'Watched and cleared' }, 200, 0);
      }

      await db
        .prepare(
          `INSERT INTO watch_history (id, profile_id, item_id, title, poster, quality, current_time, duration, percent, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(profile_id, item_id) DO UPDATE SET
             title = excluded.title,
             poster = excluded.poster,
             quality = excluded.quality,
             current_time = excluded.current_time,
             duration = excluded.duration,
             percent = excluded.percent,
             updated_at = CURRENT_TIMESTAMP`
        )
        .bind(historyId, profileId, String(id), title, poster, quality, currentTime, duration, percent)
        .run();

      return jsonResponse({ ok: true, message: 'Saved progress' }, 200, 0);
    }

    // 3. DELETE (Remove specific item from history)
    if (request.method === 'DELETE') {
      const itemId = url.searchParams.get('id');
      if (itemId) {
        await db
          .prepare('DELETE FROM watch_history WHERE profile_id = ? AND item_id = ?')
          .bind(profileId, String(itemId))
          .run();
      } else {
        await db
          .prepare('DELETE FROM watch_history WHERE profile_id = ?')
          .bind(profileId)
          .run();
      }
      return jsonResponse({ ok: true, message: 'History cleared' }, 200, 0);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405, 0);
  } catch (error) {
    console.error('[history] internal error:', error);
    return jsonResponse({ ok: false, error: 'حدث خطأ داخلي، حاول لاحقاً' }, 500, 0);
  }
}
