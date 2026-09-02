// Home feed — page-1 teasers of the shared list builders (_lists.js).

import { jsonResponse, CORS_HEADERS } from './_utils.js';
import { HOME_LIST_ORDER, LISTS } from './_lists.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const built = await Promise.all(
      HOME_LIST_ORDER.map(async (id) => {
        const meta = LISTS[id];
        try {
          const { items } = await meta.load(env, 1);
          return { id, title: meta.title, items: items.slice(0, 18) };
        } catch {
          return { id, title: meta.title, items: [] };
        }
      })
    );

    const rows = built.filter((r) => r.items.length > 0);
    return jsonResponse({ rows }, 200, 600);
  } catch (error) {
    return jsonResponse(
      { error: 'Failed to load home feed', rows: [] },
      500
    );
  }
}
