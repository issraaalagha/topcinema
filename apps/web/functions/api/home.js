// Home feed powered by TMDB (Arabic-first, English fallback).
// Response shape matches the legacy scraper contract: { rows: [...] }.

import { jsonResponse, CORS_HEADERS } from './_utils.js';
import { tmdbFetch, mapListItem, mergeListTitles, hasCJK } from './_tmdb.js';

    // Anime airing TODAY: /tv/airing_today ignores genre filters, so fetch
    // 3 pages and filter client-side for Animation + Japanese origin.
    async function animeAiringToday(env) {
      const pages = await Promise.all(
        [1, 2, 3].map((pg) =>
          tmdbFetch(env, '/tv/airing_today', { page: pg }, 'ar').catch(() => ({ results: [] }))
        )
      );
      const seen = new Set();
      const out = [];
      for (const r of pages.flatMap((p) => p.results || [])) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        if ((r.genre_ids || []).includes(16) && r.original_language === 'ja') out.push(r);
      }
      return { results: out };
    }

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const animeParams = {
      page: 1,
      with_genres: 16,
      with_original_language: 'ja',
      'vote_average.gte': 6.5,
    };
    const [trendingAll, trendingMovies, onTheAir, topMovies, topAnime, newAnime, airingAnime] = await Promise.all([
      tmdbFetch(env, '/trending/all/week', {}, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/movie/popular', { page: 1 }, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/tv/on_the_air', { page: 1 }, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/movie/top_rated', { page: 1 }, 'ar').catch(() => ({ results: [] })),
      tmdbFetch(env, '/discover/tv', { ...animeParams, sort_by: 'popularity.desc' }, 'ar')
        .then(async (ar) => mergeListTitles(ar.results || [], (await tmdbFetch(env, '/discover/tv', { ...animeParams, sort_by: 'popularity.desc' }, 'en').catch(() => ({ results: [] }))).results || []))
        .catch(() => []),
      tmdbFetch(env, '/discover/tv', { ...animeParams, sort_by: 'first_air_date.desc' }, 'ar')
        .then(async (ar) => mergeListTitles(ar.results || [], (await tmdbFetch(env, '/discover/tv', { ...animeParams, sort_by: 'first_air_date.desc' }, 'en').catch(() => ({ results: [] }))).results || []))
        .catch(() => []),
      animeAiringToday(env).catch(() => ({ results: [] })),
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
      {
        id: 'anime-hot',
        title: 'أنمي الياباني الأنجح 🎌',
        items: (topAnime || [])
          .map((r) => mapListItem(r, 'tv'))
          .filter((i) => i.title && i.poster)
          .slice(0, 18),
      },
      {
        id: 'anime-airing',
        title: 'حلقات الأنمي الجديدة اليوم ⚡',
        items: (airingAnime.results || [])
          .map((r) => mapListItem(r, 'tv'))
          .filter((i) => i.title && i.poster)
          .slice(0, 18),
      },
      {
        id: 'anime-new',
        title: 'أحدث الأنمي المضافة 🎴',
        items: (newAnime || [])
          .map((r) => mapListItem(r, 'tv'))
          .filter((i) => i.title && i.poster)
          .slice(0, 18),
      },
    ].filter((r) => r.items.length > 0);

    return jsonResponse({ rows }, 200, 600);
  } catch (error) {
    return jsonResponse({ error: 'Failed to load home feed', message: error.message, rows: [] }, 500);
  }
}
