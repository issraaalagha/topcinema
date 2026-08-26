// Cloudflare Pages API Utilities & HTML Parsers

export const UPSTREAM_URL = 'https://web.topcinemaa.live';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(data, status = 200, maxAge = 300) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge * 2}, stale-while-revalidate=${maxAge * 4}`,
      ...CORS_HEADERS,
    },
  });
}

export async function fetchHtml(url, referer = UPSTREAM_URL) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) {
    throw new Error(`Upstream error: ${res.status}`);
  }
  return res.text();
}

export function parseMovieItems(html) {
  const items = [];
  const seenIds = new Set();
  const itemRegex = /<div class="(?:Block--Item|Small--Box)"[\s\S]*?<\/a>\s*<\/div>/gi;
  const matches = html.match(itemRegex) || [];

  for (const block of matches) {
    try {
      const linkMatch = block.match(/<a\s+href="https:\/\/(?:web\.)?topcinemaa\.(?:co|live)\/([^"\/]+)\/?"/i);
      if (!linkMatch) continue;
      
      const slug = linkMatch[1];
      if (seenIds.has(slug)) continue;

      const titleMatch = block.match(/title="([^"]+)"/i) || block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const title = titleMatch ? cleanText(titleMatch[1]) : '';

      const posterMatch = block.match(/data-src="([^"]+)"/i) || block.match(/src="([^"]+)"/i);
      const poster = posterMatch ? posterMatch[1] : '';

      const qualityMatch = block.match(/<div[^>]*class="[^"]*ribbon[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                           block.match(/<span[^>]*class="[^"]*quality[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const quality = qualityMatch ? cleanText(qualityMatch[1]) : '';

      const imdbMatch = block.match(/<span[^>]*class="[^"]*imdb[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                        block.match(/<div[^>]*class="[^"]*imdbBox[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const imdb = imdbMatch ? cleanText(imdbMatch[1]).replace(/[^0-9.]/g, '') : '';

      const genres = [];
      const genresBlock = block.match(/<ul class="Genres">([\s\S]*?)<\/ul>/i);
      if (genresBlock) {
        const liMatches = [...genresBlock[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)];
        for (const li of liMatches) {
          const g = cleanText(li[1]);
          if (g) genres.push(g);
        }
      }

      const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
      const year = yearMatch ? yearMatch[1] : '';

      if (title && slug) {
        seenIds.add(slug);
        items.push({
          id: slug,
          title,
          poster,
          quality,
          imdb,
          genres,
          year,
        });
      }
    } catch (e) {
      // skip corrupted item
    }
  }

  return items;
}

export function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unpack(p, a, c, k, e, d) {
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
  }
  return p;
}
