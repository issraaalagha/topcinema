// TMDB API client — aligned with official guidance
// (https://developer.themoviedb.org/docs/getting-started):
//   • Auth via Bearer Read Access Token header (recommended), api_key fallback
//   • Edge caching through Cloudflare Cache API (data is slow-changing)
//   • 429 handling honoring Retry-After
// Credentials come exclusively from environment secrets.

export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p';

export function tmdbKey(env) {
  return (env && env.TMDB_API_KEY) || '';
}

export function tmdbReadToken(env) {
  return (env && env.TMDB_READ_TOKEN) || '';
}

export function imgUrl(path, size = 'w500') {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${TMDB_IMG}/${size}${path}`;
}

// Edge-cache TTLs per endpoint family (seconds). TMDB data is slow-changing;
// trending/catalog feeds stay fresh-ish, details are effectively static.
const CACHE_TTL_RULES = [
  [/\/trending|\/movie\/popular|\/tv\/popular|\/tv\/on_the_air|\/search\//, 300],
  [/\/season\//, 21600],
  [/\/movie\/\d+|\/tv\/\d+/, 21600],
];

function cacheTtlFor(pathname) {
  for (const [re, ttl] of CACHE_TTL_RULES) {
    if (re.test(pathname)) return ttl;
  }
  return 600;
}

/**
 * Single TMDB GET with: Bearer auth, 429 retry (Retry-After, capped),
 * and Cloudflare edge caching so repeat views never hit TMDB.
 */
async function tmdbGet(env, path, params, language) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('language', language);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const token = tmdbReadToken(env);
  if (token) url.searchParams.delete('api_key');
  else {
    const key = tmdbKey(env);
    if (!key) throw new Error('TMDB credentials are not configured');
    url.searchParams.set('api_key', key);
  }

  const target = url.toString();
  const ttl = cacheTtlFor(url.pathname);

  // 1. Edge cache lookup (production Pages Functions only)
  const cache = caches.default;
  let cacheKey = new Request(target);
  let hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  // 2. Miss → fetch with the recommended auth mechanism
  const headers = { accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await fetch(target, { headers });

  // 3. Respect 429 with a single capped retry
  if (res.status === 429) {
    const retryAfter = Math.min(parseFloat(res.headers.get('retry-after') || '1') || 1, 2);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    res = await fetch(target, { headers });
  }

  if (!res.ok) throw new Error(`TMDB ${res.status}`);

  // 4. Populate the edge cache with our own TTL policy
  const body = await res.text();
  const cached = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });
  try {
    await cache.put(cacheKey, cached.clone());
  } catch {}

  return JSON.parse(body);
}

export async function tmdbFetch(env, path, params = {}, language = 'ar') {
  try {
    return await tmdbGet(env, path, params, language);
  } catch (err) {
    // Arabic metadata can 404 on rare legacy entries — retry once in English
    if (language === 'ar') return tmdbGet(env, path, params, 'en');
    throw err;
  }
}

/**
 * Details with Arabic-first fields merged over the English payload.
 * Both fetches are edge-cached, so the dual-language merge costs TMDB
 * nothing on repeat views.
 */
export async function tmdbDetails(env, type, id, append = '') {
  const [en, ar] = await Promise.all([
    tmdbFetch(env, `/${type}/${id}`, append ? { append_to_response: append } : {}, 'en'),
    tmdbFetch(env, `/${type}/${id}`, append ? { append_to_response: append } : {}, 'ar').catch(() => ({})),
  ]);

  return {
    ...en,
    ...Object.fromEntries(
      Object.entries(ar).filter(
        ([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
      )
    ),
    overview: (ar.overview && ar.overview.trim()) || en.overview || '',
    title:
      (ar.title || ar.name) && (ar.title || ar.name).trim()
        ? ar.title || ar.name
        : en.title || en.name,
    original_title: en.title || en.name,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared response mappers (match the legacy topcinemaa response shapes so the
// Svelte frontend keeps working without changes).
// ─────────────────────────────────────────────────────────────────────────────

export function mapListItem(item, type) {
  const date = item.release_date || item.first_air_date || '';
  const year = date ? date.slice(0, 4) : '';
  const genreIds = item.genre_ids || [];
  const genres = genreIds.map((gid) => GENRE_MAP_AR[gid]).filter(Boolean);
  // Type badge: anime is animation-genre TV, everything TV-ish is a series
  const kind =
    type === 'movie' ? 'فيلم' : genreIds.includes(16) ? 'أنمي' : 'مسلسل';
  return {
    id: `${type}-${item.id}`,
    tmdbId: item.id,
    type,
    kind,
    title: (item.title || item.name || '').trim(),
    poster: imgUrl(item.poster_path, 'w500'),
    backdrop: imgUrl(item.backdrop_path, 'w780'),
    story: (item.overview || '').trim(),
    quality: (item.vote_average || 0) >= 7 ? 'HD 1080' : 'HD',
    rating: item.vote_average ? String(Math.round(item.vote_average * 10) / 10) : '',
    genres,
    year,
  };
}

export const GENRE_MAP_AR = {
  28: 'أكشن', 12: 'مغامرة', 16: 'أنمي', 35: 'كوميديا', 80: 'جريمة',
  99: 'وثائقي', 18: 'دراما', 10751: 'عائلي', 14: 'فانتازيا', 36: 'تاريخي',
  27: 'رعب', 10402: 'موسيقى', 9648: 'غموض', 10749: 'رومانسي',
  878: 'خيال علمي', 53: 'إثارة', 10752: 'حربي', 37: 'غربي', 10759: 'أكشن ومغامرة',
  10762: 'أطفال', 10763: 'أخبار', 10764: 'واقعي', 10765: 'خيال علمي وفانتازيا',
  10766: 'مسلسل يومي', 10767: 'حواري', 10768: 'حربي وسياسي', 10770: 'تلفزيوني',
};

export const TMDB_GENRE_IDS = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
  horror: 27, music: 10402, mystery: 9648, romance: 10749,
  scifi: 878, thriller: 53, war: 10752, western: 37,
};

/**
 * Parse our composite id: "movie-969681" | "tv-94605" | "tv-94605-1-8".
 */
export function parseCompositeId(id) {
  const raw = decodeURIComponent(id || '');
  const parts = raw.split('-');
  if (parts.length < 2) return null;
  const type = parts[0] === 'tv' ? 'tv' : 'movie';
  const tmdbId = parseInt(parts[1], 10);
  if (!tmdbId) return null;
  const season = type === 'tv' && parts[2] ? parseInt(parts[2], 10) : null;
  const episode = type === 'tv' && parts[3] ? parseInt(parts[3], 10) : null;
  return { type, tmdbId, season, episode, raw };
}

/**
 * CineSrc embed URL from TMDB coordinates (official docs format).
 * movie: https://cinesrc.st/embed/movie/{tmdbId}
 * tv:    https://cinesrc.st/embed/tv/{tmdbId}?s={season}&e={episode}
 */
export function cineSrcEmbedUrl({ type, tmdbId, season, episode }) {
  if (type === 'tv') {
    const s = season || 1;
    const e = episode || 1;
    return `https://cinesrc.st/embed/tv/${tmdbId}?s=${s}&e=${e}`;
  }
  return `https://cinesrc.st/embed/movie/${tmdbId}`;
}
