const BASE = '/api';

export function getAuthToken() {
  return localStorage.getItem('tc_auth_token') || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem('tc_auth_token', token);
  else localStorage.removeItem('tc_auth_token');
}

async function request(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('topcinema-unauthorized'));
    const err = await res.json().catch(() => ({ error: 'يرجى إدخال رمز المرور' }));
    throw new Error(err.error || 'يرجى إدخال رمز المرور');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `API ${res.status}` }));
    throw new Error(err.error || `API ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Content & Feed
  home: () => request(`${BASE}/home`),
  catalog: (page = 1, category = '', q = '') => {
    const p = new URLSearchParams({ page });
    if (category) p.set('category', category);
    if (q) p.set('q', q);
    return request(`${BASE}/catalog?${p}`);
  },
  post: (id) => request(`${BASE}/post/${id}`),
  resolve: (id, server) => request(`${BASE}/resolve/${id}/${server}?_cb=${Date.now()}`),

  // Auth
  login: async (passcode, remember = true) => {
    const data = await request(`${BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ passcode, remember }),
    });
    if (data.token) setAuthToken(data.token);
    return data;
  },
  verifyAuth: () => request(`${BASE}/auth/verify`),
  logout: async () => {
    setAuthToken(null);
    return request(`${BASE}/auth/logout`, { method: 'POST' }).catch(() => ({ ok: true }));
  },

  // Cloud D1 Favorites (Categorized)
  getFavorites: (type = '', profile = 'default') => {
    const p = new URLSearchParams({ profile });
    if (type) p.set('type', type);
    return request(`${BASE}/favorites?${p}`);
  },
  addFavorite: (item, profile = 'default') =>
    request(`${BASE}/favorites?profile=${profile}`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  removeFavorite: (id, profile = 'default') =>
    request(`${BASE}/favorites?id=${encodeURIComponent(id)}&profile=${profile}`, {
      method: 'DELETE',
    }),

  // Cloud D1 History
  getHistory: (profile = 'default') => request(`${BASE}/history?profile=${profile}`),
  saveProgress: (item, profile = 'default') =>
    request(`${BASE}/history?profile=${profile}`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  clearHistory: (id = '', profile = 'default') => {
    const q = id ? `?id=${encodeURIComponent(id)}&profile=${profile}` : `?profile=${profile}`;
    return request(`${BASE}/history${q}`, { method: 'DELETE' });
  },

  // Recommendations
  getRecommendations: (profile = 'default') => request(`${BASE}/recommendations?profile=${profile}`),
};
