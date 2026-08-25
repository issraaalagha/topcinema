import { UPSTREAM_URL, jsonResponse, fetchHtml, parseMovieItems, CORS_HEADERS } from './_utils.js';

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const html = await fetchHtml(UPSTREAM_URL);
    const allItems = parseMovieItems(html);

    // Distribute into meaningful sections
    const recent = allItems.slice(0, 15);
    const trending = allItems.slice(15, 30);
    const topRated = allItems.filter(it => parseFloat(it.imdb) >= 7.0 || it.quality.includes('1080')).slice(0, 15);
    const more = allItems.slice(30, 48);

    const rows = [
      {
        id: 'recent-movies',
        title: 'أحدث الأفلام والمسلسلات المضافة ✨',
        items: recent,
      },
    ];

    if (topRated.length > 0) {
      rows.push({
        id: 'top-rated',
        title: 'الأعلى تقييماً وجودة (IMDb 7+) 🌟',
        items: topRated,
      });
    }

    if (trending.length > 0) {
      rows.push({
        id: 'trending',
        title: 'الأكثر رواجاً ومشاهدة الآن 🔥',
        items: trending,
      });
    }

    if (more.length > 0) {
      rows.push({
        id: 'recommended',
        title: 'مختارات ومقترحات سينمائية 🍿',
        items: more,
      });
    }

    return jsonResponse({ rows }, 200, 600);
  } catch (error) {
    return jsonResponse(
      {
        error: 'Failed to load home feed',
        message: error.message,
        rows: [],
      },
      500
    );
  }
}
