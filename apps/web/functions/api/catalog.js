import { UPSTREAM_URL, jsonResponse, fetchHtml, parseMovieItems, CORS_HEADERS } from './_utils.js';

const CATEGORY_MAP = {
  movies: 'category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a-8',
  series: 'category/%d9%85%d8%b3%d9%84%d8%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a%d8%a9-1',
  anime: 'category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d9%86%d9%85%d9%8a-1',
  action: 'genre/%d8%a7%d9%83%d8%b4%d9%86',
  horror: 'genre/%d8%b1%d8%b9%d8%a8',
  comedy: 'genre/%d9%83%d9%88%d9%85%d9%8a%d8%af%d9%8a',
  drama: 'genre/%d8%af%d8%b1%d8%a7%d9%85%d8%a7',
  scifi: 'genre/%d8%ae%d9%8a%d8%a7%d9%84-%d8%b9%d9%84%d9%85%d9%8a',
};

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const category = url.searchParams.get('category')?.trim() || '';
  const page = parseInt(url.searchParams.get('page') || '1', 10);

  try {
    let targetUrl = UPSTREAM_URL;

    if (q) {
      targetUrl = `${UPSTREAM_URL}/?s=${encodeURIComponent(q)}`;
    } else if (category && CATEGORY_MAP[category]) {
      const catPath = CATEGORY_MAP[category];
      targetUrl = page > 1 
        ? `${UPSTREAM_URL}/${catPath}/page/${page}/`
        : `${UPSTREAM_URL}/${catPath}/`;
    } else if (page > 1) {
      targetUrl = `${UPSTREAM_URL}/page/${page}/`;
    }

    const html = await fetchHtml(targetUrl);
    const items = parseMovieItems(html);

    return jsonResponse({ items, page }, 200, 300);
  } catch (error) {
    return jsonResponse(
      {
        error: 'Failed to load catalog',
        message: error.message,
        items: [],
      },
      500
    );
  }
}
