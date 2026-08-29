// Shared list builders — power both the home rows (page 1 teaser) and the
// full /browse/{listId} pages (paginated). Arabic-first titles with CJK/en
// fallback via mergeListTitles.

import { tmdbFetch, mapListItem, mergeListTitles } from './_tmdb.js';

const ANIME_FILTERS = { with_genres: 16, with_original_language: 'ja' };

async function merged(env, path, params) {
  const [ar, en] = await Promise.all([
    tmdbFetch(env, path, params, 'ar').catch(() => ({ results: [] })),
    tmdbFetch(env, path, params, 'en').catch(() => ({ results: [] })),
  ]);
  const merged = mergeListTitles(ar.results || [], en.results || []);
  return {
    items: merged,
    totalPages: Math.min(ar.total_pages || en.total_pages || 1, 500),
  };
}

// /tv/airing_today ignores discover filters — fetch 3 pages and filter
// client-side for Animation + Japanese origin, dedup by id.
async function animeAiring(env) {
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
  return { items: out, totalPages: 3 };
}

const mapAll = (results, type) =>
  results.map((r) => mapListItem(r, type)).filter((i) => i.title && i.poster);

export const LISTS = {
  trending: {
    title: 'الأكثر رواجاً هذا الأسبوع 🔥',
    async load(env, page) {
      const { items, totalPages } = await merged(env, '/trending/all/week', { page });
      return {
        items: mapAll(items, 'mixed'),
        totalPages: Math.min(totalPages, 500),
      };
    },
  },
  'recent-movies': {
    title: 'أحدث الأفلام الرائجة ✨',
    async load(env, page) {
      const { items, totalPages } = await merged(env, '/movie/popular', { page });
      return { items: mapAll(items, 'movie'), totalPages: Math.min(totalPages, 500) };
    },
  },
  'onair-tv': {
    title: 'مسلسلات تُعرض حالياً 📺',
    async load(env, page) {
      const { items, totalPages } = await merged(env, '/tv/on_the_air', { page });
      return { items: mapAll(items, 'tv'), totalPages: Math.min(totalPages, 500) };
    },
  },
  'top-rated': {
    title: 'الأعلى تقييماً على الإطلاق 🌟',
    async load(env, page) {
      const { items, totalPages } = await merged(env, '/movie/top_rated', { page });
      return { items: mapAll(items, 'movie'), totalPages: Math.min(totalPages, 500) };
    },
  },
  'anime-hot': {
    title: 'أنمي الياباني الأنجح 🎌',
    async load(env, page) {
      const { items, totalPages } = await merged(env, '/discover/tv', {
        ...ANIME_FILTERS,
        page,
        sort_by: 'popularity.desc',
      });
      return { items: mapAll(items, 'tv'), totalPages: Math.min(totalPages, 500) };
    },
  },
  'anime-new': {
    title: 'أحدث الأنمي المضافة 🎴',
    async load(env, page) {
      const { items, totalPages } = await merged(env, '/discover/tv', {
        ...ANIME_FILTERS,
        page,
        sort_by: 'first_air_date.desc',
      });
      return { items: mapAll(items, 'tv'), totalPages: Math.min(totalPages, 500) };
    },
  },
  'anime-airing': {
    title: 'حلقات الأنمي الجديدة اليوم ⚡',
    maxPage: 3,
    async load(env, page) {
      if (page > 3) return { items: [], totalPages: 3 };
      const { items } = await animeAiring(env);
      return { items: mapAll(items, 'tv'), totalPages: 3 };
    },
  },
};

export const HOME_LIST_ORDER = [
  'trending',
  'recent-movies',
  'onair-tv',
  'top-rated',
  'anime-hot',
  'anime-airing',
  'anime-new',
];
