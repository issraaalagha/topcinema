// Personalized recommendations — TMDB-powered (replaces legacy scraper).
// Analyzes the user's favorite genres (Arabic names) from D1, maps them to
// TMDB genre ids, and returns popular movie/series picks. Items use the
// new composite TMDB ids so links always resolve.

import { jsonResponse, CORS_HEADERS } from './_utils.js';
import { tmdbFetch, mapListItem, mergeListTitles, hasCJK } from './_tmdb.js';
import { getSession } from './_auth.js';

const AR_GENRE_TO_TMDB = {
  'أكشن': 28, 'حركة': 28, 'مغامرة': 12, 'أنمي': 16, 'كرتون': 16,
  'كوميديا': 35, 'جريمة': 80, 'وثائقي': 99, 'دراما': 18,
  'عائلي': 10751, 'فانتازيا': 14, 'تاريخي': 36, 'رعب': 27,
  'إثارة': 53, 'موسيقى': 10402, 'غموض': 9648, 'رومانسي': 10749,
  'رومانسية': 10749, 'خيال علمي': 878, 'خيال علمي وفانتازيا': 878,
  'حربي': 10752, 'غربي': 37,
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Recommendations are personal — bind to the signed-in account
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse({ ok: true, items: [], title: '' }, 200, 0);
  }
  const profileId = session.sub;

  try {
    let topGenreAr = 'أكشن';

    if (env?.DB) {
      const { results } = await env.DB
        .prepare('SELECT genres FROM favorites WHERE profile_id = ? LIMIT 30')
        .bind(profileId)
        .all();

      const genreFreq = {};
      for (const row of results || []) {
        try {
          const list = typeof row.genres === 'string' ? JSON.parse(row.genres || '[]') : row.genres || [];
          (Array.isArray(list) ? list : []).forEach((g) => {
            const clean = String(g).trim();
            if (clean) genreFreq[clean] = (genreFreq[clean] || 0) + 1;
          });
        } catch {}
      }

      const sorted = Object.keys(genreFreq).sort((a, b) => genreFreq[b] - genreFreq[a]);
      if (sorted.length > 0) topGenreAr = sorted[0];
    }

    const genreId = AR_GENRE_TO_TMDB[topGenreAr] || 28;
    const params = {
      page: 1,
      with_genres: genreId,
      sort_by: 'popularity.desc',
      'vote_average.gte': 5.5,
    };

    // Movie + series picks for the genre, Arabic-first titles with CJK/en fallback
    const [movieAr, movieEn, tvAr, tvEn] = await Promise.all([
      tmdbFetch(env, '/discover/movie', params, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/discover/movie', params, 'en').catch(() => ({ results: [] })),
      tmdbFetch(env, '/discover/tv', params, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/discover/tv', params, 'en').catch(() => ({ results: [] })),
    ]);

    const movies = mergeListTitles(movieAr.results || [], movieEn.results || [])
      .map((r) => mapListItem(r, 'movie'));
    const shows = mergeListTitles(tvAr.results || [], tvEn.results || [])
      .map((r) => mapListItem(r, 'tv'));

    // Interleave movies & shows, drop filler
    const mixed = [];
    for (let i = 0; i < Math.max(movies.length, shows.length); i++) {
      if (movies[i]) mixed.push(movies[i]);
      if (shows[i]) mixed.push(shows[i]);
    }

    const items = mixed
      .filter((i) => i.title && i.poster && !hasCJK(i.title))
      .slice(0, 15);

    // Personalized → never publicly cacheable (SECURITY_AUDIT.md F-10)
    return jsonResponse(
      {
        ok: true,
        genre: topGenreAr,
        title: `مقترحات مخصصة لذوقك (${topGenreAr}) 🎯`,
        items,
      },
      200,
      0,
      { private: true }
    );
  } catch (error) {
    return jsonResponse({ ok: false, items: [], error: 'حدث خطأ داخلي، حاول لاحقاً' }, 500, 0);
  }
}
