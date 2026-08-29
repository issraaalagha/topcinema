const BASE = '/api';

// Per-account data: favorites/history live under the logged-in username
export function myProfile() {
  return localStorage.getItem('tc_username') || 'default';
}

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
  post: (id) => request(`${BASE}/post/${encodeURIComponent(id)}`),
  resolve: (id, server) => request(`${BASE}/resolve/${encodeURIComponent(id)}/${encodeURIComponent(server)}?_cb=${Date.now()}`),
  getEpisodes: (tmdbId, season) => request(`${BASE}/episodes/${tmdbId}/${season}`),

  // Auth
  login: async (identifier, secret, remember = true) => {
    // Accepts {username, password} or {passcode}
    const payload =
      typeof identifier === 'object' && identifier !== null
        ? { ...identifier, remember }
        : { passcode: identifier, remember };
    const data = await request(`${BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.token) setAuthToken(data.token);
    return data;
  },
  verifyAuth: () => request(`${BASE}/auth/verify`),
  logout: async () => {
    setAuthToken(null);
    return request(`${BASE}/auth/logout`, { method: 'POST' }).catch(() => ({ ok: true }));
  },

  // Admin — users management (owner/admin roles)
  listUsers: () => request(`${BASE}/auth/users`),
  createUser: (u) =>
    request(`${BASE}/auth/users`, { method: 'POST', body: JSON.stringify(u) }),
  updateUser: (u) =>
    request(`${BASE}/auth/users`, { method: 'PATCH', body: JSON.stringify(u) }),
  deleteUser: (id) =>
    request(`${BASE}/auth/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getStats: () => request(`${BASE}/auth/stats`),
  adminContent: (user) =>
    request(`${BASE}/admin/content?user=${encodeURIComponent(user)}`),
  adminDeleteContent: (user, kind, id = '') =>
    request(
      `${BASE}/admin/content?user=${encodeURIComponent(user)}&kind=${kind}${id ? '&id=' + encodeURIComponent(id) : ''}`,
      { method: 'DELETE' }
    ),
  clearFavorites: (profile = myProfile()) =>
    request(`${BASE}/favorites?profile=${encodeURIComponent(profile)}`, { method: 'DELETE' }),

  // Cloud D1 Favorites (Categorized)
  getFavorites: (type = '', profile = myProfile()) => {
    const p = new URLSearchParams({ profile });
    if (type) p.set('type', type);
    return request(`${BASE}/favorites?${p}`);
  },
  addFavorite: (item, profile = myProfile()) =>
    request(`${BASE}/favorites?profile=${profile}`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  removeFavorite: (id, profile = myProfile()) =>
    request(`${BASE}/favorites?id=${encodeURIComponent(id)}&profile=${profile}`, {
      method: 'DELETE',
    }),

  // Cloud D1 History
  getHistory: (profile = myProfile()) => request(`${BASE}/history?profile=${profile}`),
  saveProgress: (item, profile = myProfile()) =>
    request(`${BASE}/history?profile=${profile}`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  clearHistory: (id = '', profile = myProfile()) => {
    const q = id ? `?id=${encodeURIComponent(id)}&profile=${profile}` : `?profile=${profile}`;
    return request(`${BASE}/history${q}`, { method: 'DELETE' });
  },

  // Recommendations
  getRecommendations: (profile = myProfile()) => request(`${BASE}/recommendations?profile=${profile}`),
};
