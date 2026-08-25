import { UPSTREAM_URL, jsonResponse, fetchHtml, parseMovieItems, CORS_HEADERS } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const db = env?.DB;
  const url = new URL(request.url);
  const profileId = url.searchParams.get('profile') || 'default';

  try {
    let topGenres = ['اكشن', 'رعب', 'خيال علمي'];

    if (db) {
      // 1. Analyze user's favorite genres from D1
      const { results } = await db
        .prepare('SELECT genres FROM favorites WHERE profile_id = ? LIMIT 20')
        .bind(profileId)
        .all();

      const genreFreq = {};
      for (const row of results || []) {
        try {
          const list = JSON.parse(row.genres || '[]');
          list.forEach((g) => {
            const cleanG = g.trim();
            if (cleanG) genreFreq[cleanG] = (genreFreq[cleanG] || 0) + 1;
          });
        } catch {}
      }

      const sortedGenres = Object.keys(genreFreq).sort((a, b) => genreFreq[b] - genreFreq[a]);
      if (sortedGenres.length > 0) {
        topGenres = sortedGenres.slice(0, 3);
      }
    }

    // 2. Fetch movies matching the top genre from TopCinema
    const primaryGenre = topGenres[0] || 'اكشن';
    const genreUrl = `${UPSTREAM_URL}/genre/${encodeURIComponent(primaryGenre)}/`;
    const html = await fetchHtml(genreUrl).catch(() => '');
    const items = parseMovieItems(html).slice(0, 15);

    return jsonResponse(
      {
        ok: true,
        genre: primaryGenre,
        title: `مقترحات مخصصة لذوقك (${primaryGenre}) 🎯`,
        items,
      },
      200,
      600
    );
  } catch (error) {
    return jsonResponse({ ok: false, items: [], error: error.message }, 500);
  }
}
