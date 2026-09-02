// Platform statistics for the admin dashboard (owner/admin only).

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

  try {
    const [users, activeUsers, history, favorites] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS c FROM users').first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE active = 1').first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM watch_history').first(),
      env.DB.prepare('SELECT COUNT(*) AS c FROM favorites').first().catch(() => ({ c: 0 })),
    ]);

    const topWatched = await env.DB
      .prepare(
        `SELECT item_id, title, COUNT(*) AS views FROM watch_history
         GROUP BY item_id ORDER BY views DESC LIMIT 5`
      )
      .all()
      .catch(() => ({ results: [] }));

    return jsonResponse(
      {
        ok: true,
        stats: {
          users: users.c,
          activeUsers: activeUsers.c,
          historyCount: history.c,
          favoritesCount: favorites.c,
          topWatched: topWatched.results || [],
        },
      },
      200,
      0
    );
  } catch (error) {
    return jsonResponse({ ok: false, error: 'حدث خطأ داخلي، حاول لاحقاً' }, 500, 0);
  }
}
