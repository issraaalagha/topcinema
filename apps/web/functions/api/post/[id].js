// Post details powered by TMDB (Arabic-first).
// Response shape matches the legacy contract so Watch.svelte stays unchanged:
// { post: {...}, servers: [{name, server}] }

import { jsonResponse, CORS_HEADERS, UPSTREAM_URL, fetchHtml } from '../_utils.js';
import { tmdbDetails, tmdbFetch, imgUrl, parseCompositeId, cineSrcEmbedUrl } from '../_tmdb.js';
import { cleanText } from '../_utils.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Best-effort bridge: find matching servers on the legacy topcinemaa site by
 * searching the title. Returns [{name, server}] in the legacy format, or [].
 */
async function legacyServerBridge(title) {
  try {
    const searchHtml = await fetchHtml(`${UPSTREAM_URL}/?s=${encodeURIComponent(title)}`);
    const linkMatch = searchHtml.match(/<article[\s\S]*?<a\s+href="(https:\/\/(?:web\.)?topcinemaa\.(?:co|live)\/([^"\/]+)\/?)"/i);
    if (!linkMatch) return [];

    const watchHtml = await fetchHtml(linkMatch[1]);
    const servers = [];
    const re = /<li[^>]*data-id="([^"]+)"[^>]*data-server="([^"]+)"[^>]*class="[^"]*server--item[^"]*"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/gi;
    for (const m of watchHtml.matchAll(re)) {
      servers.push({
        name: `${cleanText(m[3])} (احتياطي)`,
        server: `${m[1]}__${m[2]}`,
      });
      if (servers.length >= 4) break;
    }
    return servers;
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const parsed = parseCompositeId(params.id);
  if (!parsed) {
    return jsonResponse({ error: 'معرف غير صالح' }, 400);
  }

  try {
    const details = await tmdbDetails(env, parsed.type, parsed.tmdbId, 'external_ids,credits,videos,recommendations');
    if (!details || details.success === false) {
      return jsonResponse({ error: 'العمل غير موجود' }, 404);
    }

    const title = details.title || details.name || '';
    const runtime = details.runtime || details.episode_run_time?.[0] || '';
    const genres = (details.genres || []).map((g) => g.name).filter(Boolean);

    const embedUrl = cineSrcEmbedUrl(parsed);

    // Franchise/collection parts (e.g. Avengers, Mission Impossible)
    let collection = null;
    if (details.belongs_to_collection?.id) {
      try {
        const col = await tmdbFetch(
          env,
          `/collection/${details.belongs_to_collection.id}`,
          {},
          'ar'
        );
        collection = {
          id: col.id,
          name: col.name || details.belongs_to_collection.name || '',
          parts: (col.parts || [])
            .filter((p) => p.release_date) // released parts only
            .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))
            .map((p) => ({
              id: `movie-${p.id}`,
              title: p.title || p.name || '',
              poster: imgUrl(p.poster_path, 'w300'),
              year: (p.release_date || '').slice(0, 4),
              isCurrent: p.id === parsed.tmdbId,
            })),
        };
      } catch {}
    }

    // TV shows: expose the season list (episode counts) for the episodes UI
    const seasons = (details.seasons || [])
      .filter((s) => (s.episode_count || 0) > 0)
      .map((s) => ({
        number: s.season_number,
        name: s.name || `الموسم ${s.season_number}`,
        episodeCount: s.episode_count,
      }));

    const post = {
      id: parsed.raw,
      tmdbId: parsed.tmdbId,
      type: parsed.type,
      season: parsed.season,
      episode: parsed.episode,
      seasons,
      title,
      original_title: details.original_title || title,
      poster: imgUrl(details.poster_path, 'w500'),
      backdrop: imgUrl(details.backdrop_path, 'w780'),
      quality: 'HD 1080',
      year: (details.release_date || details.first_air_date || '').slice(0, 4),
      duration: runtime ? String(runtime) : '',
      language: (details.original_language || '').toUpperCase(),
      genres,
      story: details.overview || '',
      imdb: details.vote_average ? String(Math.round(details.vote_average * 10) / 10) : '',
      imdbId: details.external_ids?.imdb_id || '',
      defaultEmbed: embedUrl,
      collection,
      // Extra TMDB riches for the enhanced watch page
      tagline: details.tagline || '',
      cast: (details.credits?.cast || []).slice(0, 12).map((c) => ({
        name: c.name,
        character: c.character || '',
        photo: imgUrl(c.profile_path, 'w185'),
      })),
      recommendations: (details.recommendations?.results || []).slice(0, 12).map((r) => ({
        id: `${parsed.type}-${r.id}`,
        title: r.title || r.name || '',
        poster: imgUrl(r.poster_path, 'w300'),
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        rating: r.vote_average ? String(Math.round(r.vote_average * 10) / 10) : '',
      })),
    };

    // Primary: CineSrc. Secondary: legacy servers matched by title (best effort).
    const servers = [{ name: parsed.type === 'tv' ? `CineSrc S${parsed.season || 1}E${parsed.episode || 1}` : 'CineSrc 1080p', server: parsed.raw }];
    const bridge = await legacyServerBridge(title);
    servers.push(...bridge);

    return jsonResponse({ post, servers }, 200, 300);
  } catch (error) {
    return jsonResponse({ error: 'تعذر تحميل التفاصيل' }, 500, 0);
  }
}
