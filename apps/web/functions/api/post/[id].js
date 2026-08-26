import { UPSTREAM_URL, jsonResponse, fetchHtml, cleanText, CORS_HEADERS } from '../_utils.js';

export async function onRequest(context) {
  const { request, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { id } = params;
  if (!id) {
    return jsonResponse({ error: 'Missing movie ID or slug' }, 400);
  }

  try {
    const slug = encodeURIComponent(decodeURIComponent(id));
    const postUrl = isNaN(Number(id)) 
      ? `${UPSTREAM_URL}/${slug}/` 
      : `${UPSTREAM_URL}/?p=${id}`;

    const watchUrl = isNaN(Number(id))
      ? `${UPSTREAM_URL}/${slug}/watch/`
      : `${UPSTREAM_URL}/?p=${id}&watch=1`;

    // Fetch single post and watch page in parallel for maximum speed
    const [postHtml, watchHtml] = await Promise.all([
      fetchHtml(postUrl).catch(() => ''),
      fetchHtml(watchUrl).catch(() => ''),
    ]);

    const htmlToParse = postHtml || watchHtml;
    if (!htmlToParse) {
      return jsonResponse({ error: 'Movie not found' }, 404);
    }

    // 1. Extract Post Details
    const titleMatch = htmlToParse.match(/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                       htmlToParse.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? cleanText(titleMatch[1]) : '';

    const posterMatch = htmlToParse.match(/class="image"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
                        htmlToParse.match(/<img[^>]*class="[^"]*imgLoader[^"]*"[^>]*data-src="([^"]+)"/i) ||
                        htmlToParse.match(/<meta property="og:image" content="([^"]+)"/i);
    const poster = posterMatch ? posterMatch[1] : '';

    const storyMatch = htmlToParse.match(/<div class="story">([\s\S]*?)<\/div>/i);
    const story = storyMatch ? cleanText(storyMatch[1]) : '';

    const qualityMatch = htmlToParse.match(/<span>جودة الفيلم : <\/span>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                         htmlToParse.match(/<div class="ribbon">([\s\S]*?)<\/div>/i);
    const quality = qualityMatch ? cleanText(qualityMatch[1]) : '';

    const durationMatch = htmlToParse.match(/<span>توقيت الفيلم : <\/span>[\s\S]*?<strong>([\s\S]*?)<\/strong>/i);
    const duration = durationMatch ? cleanText(durationMatch[1]).replace(/[^0-9]/g, '') : '';

    const yearMatch = htmlToParse.match(/<span>موعد الصدور :<\/span>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                      title.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? cleanText(yearMatch[1] || yearMatch[0]) : '';

    const langMatch = htmlToParse.match(/<span>لغة الفيلم : <\/span>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const language = langMatch ? cleanText(langMatch[1]) : '';

    const genres = [];
    const genreMatches = [...htmlToParse.matchAll(/<a href="https:\/\/(?:web\.)?topcinemaa\.(?:co|live)\/genre\/[^"]+">([\s\S]*?)<\/a>/gi)];
    for (const g of genreMatches) {
      const gText = cleanText(g[1]);
      if (gText && !genres.includes(gText)) genres.push(gText);
    }

    const imdbMatch = htmlToParse.match(/<div[^>]*class="[^"]*imdbBox[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const imdb = imdbMatch ? cleanText(imdbMatch[1]).replace(/[^0-9.]/g, '') : '';

    // 2. Extract Servers from Watch Page
    const servers = [];
    const watchSource = watchHtml || postHtml;

    // Look for <li data-id="229904" data-server="0" class="server--item..."><span>VideoTube</span></li>
    const serverItemMatches = [...watchSource.matchAll(/<li[^>]*data-id="([^"]+)"[^>]*data-server="([^"]+)"[^>]*class="[^"]*server--item[^"]*"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/gi)];

    for (const s of serverItemMatches) {
      const postId = s[1];
      const serverIdx = s[2];
      const serverName = cleanText(s[3]);

      servers.push({
        name: serverName,
        server: `${postId}__${serverIdx}`,
      });
    }

    // Default iframe if available
    const defaultIframeMatch = watchSource.match(/<div class="player--iframe"[^>]*>[\s\S]*?<iframe[^>]*src="([^"]+)"/i);
    const defaultEmbed = defaultIframeMatch ? defaultIframeMatch[1] : '';

    if (servers.length === 0 && defaultEmbed) {
      servers.push({
        name: 'سيرفر البث الافتراضي',
        server: `default__0`,
      });
    }

    const post = {
      id,
      title,
      poster,
      quality,
      year,
      duration,
      language,
      genres,
      story,
      imdb,
      defaultEmbed,
    };

    return jsonResponse({ post, servers }, 200, 600);
  } catch (error) {
    return jsonResponse(
      {
        error: 'Failed to load movie details',
        message: error.message,
      },
      500
    );
  }
}
