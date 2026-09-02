// Cast-link generator: returns a single public permalink (single quality +
// audio group) for the current CineSrc title, for cast apps that cannot
// send headers/cookies (Web Video Cast, TV players). Session required
// (middleware default-deny); the extractor token is injected server-side
// and never reaches the client bundle.

import { jsonResponse, CORS_HEADERS } from './_utils.js';
import { getSession } from './_auth.js';

const Q_ALLOW = new Set(['2160', '1080', '720']);
const CINE_RE = /^(movie|tv)-\d+(?:-\d+)?(?:-\d+)?$/;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse({ ok: false, error: 'يرجى تسجيل الدخول' }, 401, 0);
  }

  const url = new URL(request.url);
  const cine = (url.searchParams.get('cine') || '').trim();
  const q = (url.searchParams.get('q') || '1080').trim();

  if (!CINE_RE.test(cine)) {
    return jsonResponse({ ok: false, error: 'معرف غير صالح' }, 400, 0);
  }
  if (!Q_ALLOW.has(q)) {
    return jsonResponse({ ok: false, error: 'جودة غير مدعومة' }, 400, 0);
  }
  if (!env?.EXTRACTOR_URL || !env?.EXTRACTOR_TOKEN) {
    return jsonResponse({ ok: false, error: 'خدمة الكاست غير مهيأة' }, 503, 0);
  }

  const base = String(env.EXTRACTOR_URL).replace(/\/$/, '');
  const castUrl = `${base}/hls/${env.EXTRACTOR_TOKEN}?cine=${encodeURIComponent(cine)}&q=${q}&ref=${encodeURIComponent('https://cinesrc.st/')}`;

  return jsonResponse({ ok: true, url: castUrl, q }, 200, 0);
}
