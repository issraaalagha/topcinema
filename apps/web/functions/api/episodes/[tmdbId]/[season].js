// Episode list for a TV season (Arabic-first, English fallback).

import { jsonResponse, CORS_HEADERS } from '../../_utils.js';
import { tmdbFetch, imgUrl } from '../../_tmdb.js';

export async function onRequest(context) {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const tmdbId = parseInt(params.tmdbId, 10);
  const season = parseInt(params.season, 10);
  if (!tmdbId || isNaN(season)) {
    return jsonResponse({ error: 'معرف غير صالح' }, 400);
  }

  try {
    const data = await tmdbFetch(env, `/tv/${tmdbId}/season/${season}`, {}, 'ar');
    const episodes = (data.episodes || []).map((e) => ({
      number: e.episode_number,
      name: e.name || `الحلقة ${e.episode_number}`,
      overview: e.overview || '',
      still: imgUrl(e.still_path, 'w300'),
      airDate: e.air_date || '',
    }));

    return jsonResponse({ season, episodes }, 200, 600);
  } catch (error) {
    return jsonResponse({ error: 'تعذر تحميل الحلقات' }, 500, 0);
  }
}
