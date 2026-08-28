// Catalog + search powered by TMDB.
// Response shape matches the legacy contract: { items: [...], page }.

import { jsonResponse, CORS_HEADERS } from './_utils.js';
import { tmdbFetch, mapListItem, mergeListTitles, TMDB_GENRE_IDS } from './_tmdb.js';

/**
 * Real Japanese anime: Animation genre + Japanese origin language.
 * Without the original-language filter, TMDB's Animation genre is
 * dominated by western kids' cartoons.
 */
async function fetchAnime(env, page, sortBy = 'popularity.desc') {
  const params = {
    page,
    with_genres: 16,
    with_original_language: 'ja',
    sort_by: sortBy,
  };
  const [ar, en] = await Promise.all([
    tmdbFetch(env, '/discover/tv', params, 'ar'),
    tmdbFetch(env, '/discover/tv', params, 'en').catch(() => ({ results: [] })),
  ]);
  const merged = mergeListTitles(ar.results || [], en.results || []);
  return merged
    .map((r) => mapListItem(r, 'tv'))
    .filter((i) => i.title && i.poster);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const category = url.searchParams.get('category')?.trim() || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));

  try {
    let data;

    if (q) {
      // Multi-search covers movies + TV in one call
      data = await tmdbFetch(env, '/search/multi', { query: q, page, include_adult: false }, 'ar');
      const items = (data.results || [])
        .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
        .map((r) => mapListItem(r, r.media_type))
        .filter((i) => i.title && i.poster);
      return jsonResponse({ items, page, total_pages: data.total_pages || 1 }, 200, 300);
    }

    const genreId = TMDB_GENRE_IDS[category];

    if (category === 'movies') {
      data = await tmdbFetch(env, '/movie/popular', { page }, 'ar');
    } else if (category === 'series') {
      data = await tmdbFetch(env, '/tv/popular', { page }, 'ar');
    } else if (category === 'anime') {
      // Real Japanese anime (not western animation), most popular first
      const items = await fetchAnime(env, page, 'popularity.desc');
      return jsonResponse({ items, page, total_pages: 500 }, 200, 300);
    } else if (genreId) {
      // Genre chips apply to movies by default
      data = await tmdbFetch(env, '/discover/movie', { page, with_genres: genreId, sort_by: 'popularity.desc' }, 'ar');
    } else {
      data = await tmdbFetch(env, '/trending/all/day', { page }, 'ar');
    }

    const items = (data.results || [])
      .filter((r) => r.media_type ? r.media_type !== 'person' : true)
      .map((r) => mapListItem(r, r.media_type === 'tv' || r.first_air_date ? 'tv' : 'movie'))
      .filter((i) => i.title && i.poster);

    return jsonResponse({ items, page, total_pages: Math.min(data.total_pages || 1, 500) }, 200, 300);
  } catch (error) {
    return jsonResponse({ error: 'Failed to load catalog', message: error.message, items: [], page }, 500);
  }
}
