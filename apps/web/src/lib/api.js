const BASE = '/api';

async function j(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const api = {
  home: () => j(`${BASE}/home`),
  catalog: (page = 1, category = '', q = '') => {
    const p = new URLSearchParams({ page });
    if (category) p.set('category', category);
    if (q) p.set('q', q);
    return j(`${BASE}/catalog?${p}`);
  },
  post: (id) => j(`${BASE}/post/${id}`),
  resolve: (id, server) => j(`${BASE}/resolve/${id}/${server}`),
};
