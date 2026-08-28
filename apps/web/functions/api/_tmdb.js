// TMDB API helpers — catalog, details, and CineSrc playback mapping.
// Credentials come exclusively from environment (TMDB_API_KEY secret).

export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p';

export function tmdbKey(env) {
  return (env && env.TMDB_API_KEY) || '';
}

export function imgUrl(path, size = 'w500') {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${TMDB_IMG}/${size}${path}`;
}

/**
 * TMDB fetch with Arabic-first, English-fallback behavior.
 * Returns parsed JSON. Throws on HTTP errors.
 */
export async function tmdbFetch(env, path, params = {}, language = 'ar') {
  const key = tmdbKey(env);
  if (!key) throw new Error('TMDB_API_KEY is not configured');

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', language);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    // Arabic metadata can be sparse; retry in English once on failure
    if (language === 'ar') {
      return tmdbFetch(env, path, params, 'en');
    }
    throw new Error(`TMDB ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch details with English fallback fields merged for sparse Arabic data.
 */
export async function tmdbDetails(env, type, id, append = '') {
  const ar = await tmdbFetch(env, `/${type}/${id}`, append ? { append_to_response: append } : {}, 'ar');
  try {
    const en = await tmdbFetch(env, `/${type}/${id}`, append ? { append_to_response: append } : {}, 'en');
    return {
      ...en,
      ...Object.fromEntries(Object.entries(ar).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))),
      // Overview: prefer Arabic when non-empty
      overview: (ar.overview && ar.overview.trim()) || en.overview || '',
      title: (ar.title || ar.name) && (ar.title || ar.name).trim() ? (ar.title || ar.name) : (en.title || en.name),
      original_title: en.title || en.name,
    };
  } catch {
    return ar;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared response mappers (match the legacy topcinemaa response shapes so the
// Svelte frontend keeps working without changes).
// ─────────────────────────────────────────────────────────────────────────────

export function mapListItem(item, type) {
  const date = item.release_date || item.first_air_date || '';
  const year = date ? date.slice(0, 4) : '';
  const genres = (item.genre_ids || [])
    .map((gid) => GENRE_MAP_AR[gid])
    .filter(Boolean);
  return {
    id: `${type}-${item.id}`,
    tmdbId: item.id,
    type,
    title: (item.title || item.name || '').trim(),
    poster: imgUrl(item.poster_path, 'w500'),
    backdrop: imgUrl(item.backdrop_path, 'w780'),
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
