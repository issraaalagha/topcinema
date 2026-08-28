import { jsonResponse, CORS_HEADERS } from '../_utils.js';
import { getSession } from '../_auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const session = await getSession(request, env);

  return jsonResponse({
    ok: true,
    authenticated: !!session,
    username: session?.sub || null,
    role: session?.role || null,
  });
}
