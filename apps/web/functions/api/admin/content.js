// Admin content management: browse & manage any user's favorites/history.
// GET    ?user=X                     → both lists
// DELETE ?user=X&kind=history|favorites[&id=Y] → clear all / remove one
// Owner/admin only (enforced by token role).

import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import { getSession, hasRole } from '../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const session = await getSession(request, env);
  if (!hasRole(session, 'admin')) {
    return jsonResponse({ ok: false, error: 'هذه الصفحة للمشرفين فقط' }, 403);
  }
  if (!env?.DB) {
    return jsonResponse({ ok: false, error: 'قاعدة البيانات غير متاحة' }, 503);
  }

  const url = new URL(request.url);
  const user = (url.searchParams.get('user') || '').trim();
  if (!user) {
    return jsonResponse({ ok: false, error: 'حدد المستخدم' }, 400);
  }

  const db = env.DB;

  try {
    if (request.method === 'GET') {
      const [favorites, history] = await Promise.all([
        db
          .prepare('SELECT * FROM favorites WHERE profile_id = ? ORDER BY created_at DESC')
          .bind(user)
          .all(),
        db
          .prepare('SELECT * FROM watch_history WHERE profile_id = ? ORDER BY updated_at DESC')
          .bind(user)
          .all(),
      ]);

      return jsonResponse(
        {
          ok: true,
          user,
          favorites: favorites.results || [],
          history: history.results || [],
        },
        200,
        0
      );
    }

    if (request.method === 'DELETE') {
      const kind = url.searchParams.get('kind');
      const id = url.searchParams.get('id') || '';

      if (kind === 'history') {
        if (id) {
          await db
            .prepare('DELETE FROM watch_history WHERE profile_id = ? AND item_id = ?')
            .bind(user, id)
            .run();
          return jsonResponse({ ok: true, message: 'تم حذف العنصر من السجل' });
        }
        await db.prepare('DELETE FROM watch_history WHERE profile_id = ?').bind(user).run();
        return jsonResponse({ ok: true, message: 'تم مسح سجل المستخدم بالكامل' });
      }

      if (kind === 'favorites') {
        if (id) {
          await db
            .prepare('DELETE FROM favorites WHERE profile_id = ? AND item_id = ?')
            .bind(user, id)
            .run();
          return jsonResponse({ ok: true, message: 'تم حذف العنصر من المفضلة' });
        }
        await db.prepare('DELETE FROM favorites WHERE profile_id = ?').bind(user).run();
        return jsonResponse({ ok: true, message: 'تم مسح مفضلة المستخدم بالكامل' });
      }

      return jsonResponse({ ok: false, error: 'نوع غير معروف' }, 400);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('[admin/content] internal error:', error);
    return jsonResponse({ ok: false, error: 'حدث خطأ داخلي، حاول لاحقاً' }, 500, 0);
  }
}
