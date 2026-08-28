// Arabic subtitles via OpenSubtitles, converted to WebVTT.
// Requires OPENSUBTITLES_API_KEY secret (consumer key). Returns 404 with a
// clear message when unconfigured so the player can silently skip the track.
//
// Flow: TMDB external_ids → IMDb ID → OpenSubtitles search (languages=ar)
//       → best-matching file → download link → SRT → VTT passthrough.

import { jsonResponse, CORS_HEADERS } from '../../_utils.js';
import { tmdbFetch } from '../../_tmdb.js';

const OS_BASE = 'https://api.opensubtitles.com/api/v1';

function osKey(env) {
  return (env && env.OPENSUBTITLES_API_KEY) || '';
}

function osHeaders(key) {
  return {
    'Api-Key': key,
    'User-Agent': 'TopCinema v1.0',
    accept: 'application/json',
  };
}

// ── SRT → VTT ────────────────────────────────────────────────────────────────
function srtToVtt(srt) {
  const body = srt
    .replace(/\r+/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body;
}

export async function onRequest(context) {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const key = osKey(env);
  if (!key) {
    return jsonResponse({ error: 'OPENSUBTITLES_API_KEY غير مضبوط بعد' }, 404);
  }

  const type = params.type === 'tv' ? 'tv' : 'movie';
  const tmdbId = parseInt(params.tmdbId, 10);
  if (!tmdbId) return jsonResponse({ error: 'معرف غير صالح' }, 400);

  try {
    // 1. Resolve IMDb id via TMDB
    const details = await tmdbFetch(env, `/${type}/${tmdbId}`, { append_to_response: 'external_ids' }, 'en');
    const imdbId = details.external_ids?.imdb_id;
    if (!imdbId) return jsonResponse({ error: 'لا يوجد IMDb ID لهذا العمل' }, 404);

    // 2. Search Arabic subtitles
    const searchUrl = new URL(`${OS_BASE}/subtitles`);
    searchUrl.searchParams.set('imdb_id', imdbId.replace(/\D/g, ''));
    searchUrl.searchParams.set('languages', 'ar');
    searchUrl.searchParams.set('type', type);
    const searchRes = await fetch(searchUrl.toString(), { headers: osHeaders(key) });
    if (!searchRes.ok) return jsonResponse({ error: `OpenSubtitles search ${searchRes.status}` }, 502);
    const searchData = await searchRes.json();

    const candidates = (searchData.data || []).filter((s) => s.attributes?.files?.length);
    if (candidates.length === 0) return jsonResponse({ error: 'لا توجد ترجمة عربية متاحة بعد' }, 404);

    // Prefer full releases over forced/hearing-impaired, then newest
    candidates.sort((a, b) => {
      const score = (s) => {
        const f = s.attributes;
        return (
          (f.ai_translated ? -2 : 0) +
          (f.hearing_impaired ? -1 : 0) +
          (f.machine_translated ? -1 : 0) +
          (/(forced)/i.test(f.release || '') ? -2 : 0)
        );
      };
      return score(b) - score(a) || (b.attributes.upload_date || '').localeCompare(a.attributes.upload_date || '');
    });

    const chosen = candidates[0];
    const fileId = chosen.attributes.files[0].file_id;

    // 3. Request a download link
    const dlRes = await fetch(`${OS_BASE}/download`, {
      method: 'POST',
      headers: { ...osHeaders(key), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
    });
    if (!dlRes.ok) return jsonResponse({ error: `OpenSubtitles download ${dlRes.status}` }, 502);
    const dlData = await dlRes.json();
    if (!dlData.link) return jsonResponse({ error: 'تعذر الحصول على رابط الترجمة' }, 502);

    // 4. Fetch + convert to VTT
    const srtRes = await fetch(dlData.link);
    if (!srtRes.ok) return jsonResponse({ error: 'تعذر تحميل ملف الترجمة' }, 502);
    const vtt = srtToVtt(await srtRes.text());

    return new Response(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'فشل جلب الترجمة' }, 500);
  }
}
