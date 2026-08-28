// Home feed powered by TMDB (Arabic-first, English fallback).
// Response shape matches the legacy scraper contract: { rows: [...] }.

import { jsonResponse, CORS_HEADERS } from './_utils.js';
import { tmdbFetch, mapListItem } from './_tmdb.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const [trendingAll, trendingMovies, onTheAir, topMovies] = await Promise.all([
      tmdbFetch(env, '/trending/all/week', {}, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/movie/popular', { page: 1 }, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/tv/on_the_air', { page: 1 }, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/movie/top_rated', { page: 1 }, 'ar').catch(() => ({ results: [] })),
    ]);

    const all = (list, type) =>
      (list.results || [])
        .filter((r) => r.media_type ? r.media_type === type || type === 'all' : true)
        .map((r) => mapListItem(r, r.media_type === 'tv' ? 'tv' : type === 'all' ? (r.title ? 'movie' : 'tv') : type))
        .filter((i) => i.title && i.poster)
        .slice(0, 18);

    const rows = [
      { id: 'trending', title: 'الأكثر رواجاً هذا الأسبوع 🔥', items: all(trendingAll, 'all') },
      { id: 'recent-movies', title: 'أحدث الأفلام الرائجة ✨', items: all(trendingMovies, 'movie') },
      { id: 'on-air-tv', title: 'مسلسلات تُعرض حالياً 📺', items: all(onTheAir, 'tv') },
      { id: 'top-rated', title: 'الأعلى تقييماً على الإطلاق 🌟', items: all(topMovies, 'movie') },
    ].filter((r) => r.items.length > 0);

    return jsonResponse({ rows }, 200, 600);
  } catch (error) {
    return jsonResponse({ error: 'Failed to load home feed', message: error.message, rows: [] }, 500);
  }
}
