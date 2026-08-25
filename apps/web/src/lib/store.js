// TopCinema Cloud Sync Reactive Store (Enterprise-Grade 2026)
import { api } from './api.js';

const WATCHLIST_KEY = 'topcinema_watchlist_v1';
const PROGRESS_KEY = 'topcinema_progress_v1';

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('topcinema-store-change', { detail: { key } }));
  } catch (e) {
    console.warn('Storage quota exceeded or unavailable', e);
  }
}

// 🌟 Initial Cloud Sync (Pull from Cloudflare D1)
export async function syncFromCloud() {
  try {
    const [favsRes, histRes] = await Promise.allSettled([
      api.getFavorites(),
      api.getHistory(),
    ]);

    if (favsRes.status === 'fulfilled' && favsRes.value?.items) {
      safeSet(WATCHLIST_KEY, favsRes.value.items);
    }
    if (histRes.status === 'fulfilled' && histRes.value?.items) {
      safeSet(PROGRESS_KEY, histRes.value.items);
    }
  } catch (e) {
    // Graceful fallback to local cache
  }
}

// Watchlist / Favorites API
export function getWatchlist(type = '') {
  const list = safeGet(WATCHLIST_KEY, []);
  if (!type || type === 'all') return list;
  return list.filter((it) => it.item_type === type);
}

export function isInWatchlist(id) {
  const list = safeGet(WATCHLIST_KEY, []);
  return list.some((item) => String(item.id) === String(id));
}

export function toggleWatchlist(item) {
  if (!item || !item.id) return false;
  const list = safeGet(WATCHLIST_KEY, []);
  const index = list.findIndex((i) => String(i.id) === String(item.id));
  let isAdded = false;

  if (index >= 0) {
    list.splice(index, 1);
    isAdded = false;
    // Sync delete to Cloudflare D1
    api.removeFavorite(item.id).catch(() => {});
  } else {
    // Auto-detect item type
    let itemType = item.item_type || 'movie';
    const title = (item.title || '').toLowerCase();
    if (title.includes('انمي') || title.includes('أنمي')) itemType = 'anime';
    else if (title.includes('مسلسل') || title.includes('الحلقة') || title.includes('الموسم')) itemType = 'series';

    const newEntry = {
      id: item.id,
      item_type: itemType,
      title: item.title,
      poster: item.poster,
      quality: item.quality,
      imdb: item.imdb,
      genres: item.genres || [],
      year: item.year || '',
      savedAt: Date.now(),
    };

    list.unshift(newEntry);
    isAdded = true;

    // Sync insert to Cloudflare D1
    api.addFavorite(newEntry).catch(() => {});
  }

  safeSet(WATCHLIST_KEY, list);
  return isAdded;
}

// Continue Watching & Progress API
export function getContinueWatching() {
  const all = safeGet(PROGRESS_KEY, []);
  return all.filter((i) => i.percent >= 3 && i.percent <= 95);
}

export function getProgress(id) {
  const all = safeGet(PROGRESS_KEY, []);
  return all.find((i) => String(i.id) === String(id)) || null;
}

export function updateProgress(item, currentTime, duration) {
  if (!item || !item.id || !duration || duration <= 0) return;
  const percent = Math.round((currentTime / duration) * 100);
  const all = safeGet(PROGRESS_KEY, []);
  const index = all.findIndex((i) => String(i.id) === String(item.id));

  const entry = {
    id: item.id,
    title: item.title,
    poster: item.poster,
    quality: item.quality,
    currentTime,
    duration,
    percent,
    updatedAt: Date.now(),
  };

  if (index >= 0) {
    all.splice(index, 1);
  }
  all.unshift(entry);

  if (all.length > 30) {
    all.length = 30;
  }

  safeSet(PROGRESS_KEY, all);

  // Sync progress to Cloudflare D1 (debounced)
  if (percent % 5 === 0 || percent >= 90) {
    api.saveProgress(entry).catch(() => {});
  }
}
