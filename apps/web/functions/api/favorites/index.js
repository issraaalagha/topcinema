import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import { getSession, hasRole } from '../_auth.js';

function detectItemType(item) {
  if (item.item_type) return item.item_type;
  const title = (item.title || '').toLowerCase();
  const genres = Array.isArray(item.genres) ? item.genres.join(' ').toLowerCase() : (item.genres || '').toLowerCase();

  if (title.includes('انمي') || title.includes('أنمي') || genres.includes('انمي') || genres.includes('anime')) {
    return 'anime';
  }
  if (title.includes('مسلسل') || title.includes('الحلقة') || title.includes('الموسم') || genres.includes('مسلسل')) {
    return 'series';
  }
  return 'movie';
}

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
  const filterType = url.searchParams.get('type') || ''; // 'movie' | 'series' | 'anime' | ''

  // Fallback memory state if DB binding is not present
  if (!db) {
    return jsonResponse(
      { ok: true, items: [], warning: 'D1 binding not available, using client store fallback' },
      200,
      0,
      { private: true }
    );
  }

  try {
    // 1. GET Favorites
    if (request.method === 'GET') {
      let query = 'SELECT * FROM favorites WHERE profile_id = ?';
      const params = [profileId];

      if (filterType) {
        query += ' AND item_type = ?';
        params.push(filterType);
      }

      query += ' ORDER BY created_at DESC';

      const { results } = await db.prepare(query).bind(...params).all();

      const items = (results || []).map((row) => ({
        id: row.item_id,
        item_type: row.item_type,
        title: row.title,
        poster: row.poster,
        quality: row.quality,
        imdb: row.imdb,
        genres: row.genres ? JSON.parse(row.genres) : [],
        year: row.year,
        added_at: row.created_at,
      }));

      // Per-user data: never publicly cacheable (SECURITY_AUDIT.md F-10)
      return jsonResponse({ ok: true, items, count: items.length }, 200, 0, { private: true });
    }

    // 2. POST (Add to Favorites)
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { id, title, poster = '', quality = '', imdb = '', genres = [], year = '' } = body;

      if (!id || !title) {
        return jsonResponse({ ok: false, error: 'Missing item id or title' }, 400, 0);
      }

      const itemType = detectItemType(body);
      const favId = `${profileId}__${id}`;
      const genresStr = JSON.stringify(Array.isArray(genres) ? genres : []);

      await db
        .prepare(
          `INSERT INTO favorites (id, profile_id, item_id, item_type, title, poster, quality, imdb, genres, year, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(profile_id, item_id) DO UPDATE SET
             item_type = excluded.item_type,
             title = excluded.title,
             poster = excluded.poster,
             quality = excluded.quality,
             imdb = excluded.imdb,
             genres = excluded.genres,
             year = excluded.year`
        )
        .bind(favId, profileId, String(id), itemType, title, poster, quality, imdb, genresStr, year)
        .run();

      return jsonResponse({ ok: true, message: 'Added to favorites', item_type: itemType }, 200, 0);
    }

    // 3. DELETE (Remove from Favorites)
    if (request.method === 'DELETE') {
      const itemId = url.searchParams.get('id');
      if (!itemId) {
        // Clear all favorites for this profile
        await db.prepare('DELETE FROM favorites WHERE profile_id = ?').bind(profileId).run();
        return jsonResponse({ ok: true, message: 'Favorites cleared' }, 200, 0);
      }

      await db
        .prepare('DELETE FROM favorites WHERE profile_id = ? AND item_id = ?')
        .bind(profileId, String(itemId))
        .run();

      return jsonResponse({ ok: true, message: 'Removed from favorites' }, 200, 0);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405, 0);
  } catch (error) {
    console.error('[favorites] internal error:', error);
    return jsonResponse({ ok: false, error: 'حدث خطأ داخلي، حاول لاحقاً' }, 500, 0);
  }
}
