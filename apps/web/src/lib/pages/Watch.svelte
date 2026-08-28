<script>
  import { untrack } from 'svelte';
  import { api } from '../api.js';
  import EnhancedPlayer from '../player/EnhancedPlayer.svelte';
  import { isInWatchlist, toggleWatchlist } from '../store.js';

  let { id } = $props();

  let data = $state(null);
  let error = $state('');
  let selectedServer = $state(null);
  let stream = $state(null);
  let resolving = $state(false);
  let resolveError = $state('');
  let inList = $state(false);
  let copied = $state(false);
  let resumeAt = $state(0);
  let failoverCount = $state(0);
  let copiedStream = $state(false);
  let selectedSeason = $state(null);
  let selectedEpisode = $state(null);
  let episodes = $state([]);
  let loadingEpisodes = $state(false);

  const PROGRESS_SAVE_INTERVAL = 15; // seconds

  // Per-episode identity for TV: tv-108978-1-5 → resolve/history per episode
  const isTv = $derived(data?.post?.type === 'tv');
  const effectiveId = $derived(
    isTv && selectedSeason && selectedEpisode
      ? `tv-${data.post.tmdbId}-${selectedSeason}-${selectedEpisode}`
      : id
  );

  function episodeLabel() {
    return isTv && selectedSeason && selectedEpisode
      ? ` — الموسم ${selectedSeason} الحلقة ${selectedEpisode}`
      : '';
  }

  async function loadEpisodes(seasonNumber) {
    if (!data?.post?.tmdbId) return;
    loadingEpisodes = true;
    episodes = [];
    try {
      const r = await api.getEpisodes(data.post.tmdbId, seasonNumber);
      episodes = r.episodes || [];
    } catch {
      episodes = [];
    } finally {
      loadingEpisodes = false;
    }
  }

  async function selectSeason(n) {
    if (selectedSeason === n) return;
    selectedSeason = n;
    selectedEpisode = null;
    await loadEpisodes(n);
  }

  async function selectEpisode(n) {
    selectedEpisode = n;
    resumeAt = 0;
    // Restore this episode's saved position if any
    try {
      const h = await api.getHistory();
      const hit = (h.items || []).find((i) => i.id === effectiveId);
      resumeAt = hit && hit.currentTime > 30 ? hit.currentTime : 0;
    } catch {}
    const srv = selectedServer || data?.servers?.[0];
    if (srv) pick(srv);
  }

  function syncWatchlistStatus() {
    if (id) inList = isInWatchlist(id);
  }

  $effect(() => {
    syncWatchlistStatus();
    window.addEventListener('topcinema-store-change', syncWatchlistStatus);
    return () => window.removeEventListener('topcinema-store-change', syncWatchlistStatus);
  });

  $effect(() => {
    const currentId = id;
    if (!currentId) return;

    untrack(() => {
      data = null;
      error = '';
      stream = null;
      resolveError = '';

      api
        .post(currentId)
        .then(async (d) => {
          data = d;
          syncWatchlistStatus();

          const preferred =
            d.servers?.find((s) => /cinesrc/i.test(s.name)) ||
            d.servers?.find((s) => /vidtube|videotube/i.test(s.name)) ||
            d.servers?.find((s) => /updown/i.test(s.name)) ||
            d.servers?.[0];

          // TV: pick season/episode (history first, else S1E1) before playing
          if (d.post.type === 'tv' && d.post.seasons?.length) {
            let histS = null, histE = null;
            try {
              const h = await api.getHistory();
              const items = h.items || [];
              const lastEp = items.find(
                (i) => typeof i.id === 'string' && i.id.startsWith(`tv-${d.post.tmdbId}-`)
              );
              if (lastEp) {
                const parts = lastEp.id.split('-');
                histS = parseInt(parts[2], 10);
                histE = parseInt(parts[3], 10);
              }
              const base = items.find((i) => i.id === currentId);
              const resumeSrc = lastEp || base;
              if (resumeSrc && resumeSrc.currentTime > 30) resumeAt = resumeSrc.currentTime;
            } catch {}

            const validSeason = d.post.seasons.find((s) => s.number === histS);
            await selectSeason(histS && validSeason ? histS : d.post.seasons[0].number);
            selectedEpisode = histE || episodes[0]?.number || 1;
          } else {
            // Movie: restore last playback position before mounting the player
            try {
              const h = await api.getHistory();
              const hit = (h.items || []).find((i) => i.id === currentId);
              if (hit && hit.currentTime > 30) resumeAt = hit.currentTime;
            } catch {}
          }

          if (preferred) pick(preferred);
        })
        .catch((e) => (error = e.message));
    });
  });

  function fallbackEmbedUrl() {
    if (isTv && selectedSeason && selectedEpisode) {
      return `https://cinesrc.st/embed/tv/${data.post.tmdbId}?s=${selectedSeason}&e=${selectedEpisode}`;
    }
    return data?.post?.defaultEmbed || '';
  }

  async function pick(srv, isAutoFailover = false) {
    selectedServer = srv;
    stream = null;
    resolveError = '';
    resolving = true;
    if (!isAutoFailover) failoverCount = 0;

    try {
      const r = await api.resolve(effectiveId, effectiveId);

      // Hybrid strategy: clean HLS/MP4 when extraction succeeds,
      // otherwise fall back to the host's own embed player.
      if (r.ok && r.url) {
        console.log('[Watch] Resolved Stream URL:', r.url);
        stream = {
          url: r.url,
          copyUrl: new URL(r.url, location.origin).href,
          type: r.type || (r.url.includes('.mp4') ? 'mp4' : 'hls'),
          server: srv.name
        };
        resolving = false;
        return;
      }

      const embedUrl = r.embedUrl || fallbackEmbedUrl();
      if (embedUrl) {
        stream = { url: embedUrl, type: 'iframe', server: srv.name };
      } else {
        resolveError = r.error || 'تعذر الحصول على رابط السيرفر';
      }
    } catch (e) {
      console.error('[Watch] Error:', e);
      const embedUrl = fallbackEmbedUrl();
      if (embedUrl) {
        stream = { url: embedUrl, type: 'iframe', server: srv.name };
      } else {
        resolveError = 'فشل معالجة رابط السيرفر: ' + e.message;
      }
    } finally {
      resolving = false;
    }
  }

  let lastProgressSave = 0;
  function handleTimeUpdate(currentTime, duration) {
    if (!data?.post || !currentTime || !duration) return;
    const now = Date.now();
    if (now - lastProgressSave < PROGRESS_SAVE_INTERVAL * 1000) return;
    lastProgressSave = now;

    api
      .saveProgress({
        id: effectiveId,
        title: data.post.title + episodeLabel(),
        poster: data.post.poster,
        quality: data.post.quality,
        currentTime,
        duration,
      })
      .catch(() => {});
  }

  function handleStreamError(reason) {
    console.warn('[Watch] Stream error:', reason);
    const servers = data?.servers || [];
    if (!servers.length || !selectedServer) return;
    if (failoverCount >= servers.length - 1) {
      resolveError = 'فشل جميع السيرفرات — جرب تحديث الصفحة لاحقاً';
      return;
    }
    const idx = servers.findIndex((s) => s.server === selectedServer.server);
    const next = servers[(idx + 1) % servers.length];
    if (next && next.server !== selectedServer.server) {
      failoverCount += 1;
      resolveError = `تعذر التشغيل على ${selectedServer.name} — تجربة ${next.name} تلقائياً…`;
      pick(next, true);
    }
  }

  function handleWatchlistToggle() {
    if (!data?.post) return;
    inList = toggleWatchlist({
      id,
      title: data.post.title,
      poster: data.post.poster,
      quality: data.post.quality,
      imdb: data.post.imdb,
      genres: data.post.genres,
    });
  }

  async function handleShare() {
    const url = window.location.href;
    const title = data?.post?.title || 'توب سينما';
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {}
    }
    navigator.clipboard?.writeText(url);
    copied = true;
    setTimeout(() => (copied = false), 2500);
  }
</script>

{#if error}
  <div class="watch-error">
    <div class="err-icon">⚠️</div>
    <h2>تعذر فتح صفحة العرض</h2>
    <p>{error}</p>
    <a href="/" class="back-link">العودة للرئيسية</a>
  </div>
{:else if !data}
  <div class="watch-loading">
    <div class="loader"></div>
    <p>جارٍ تجهيز مشغل وتفاصيل العمل…</p>
  </div>
{:else}
  <div class="watch-container">
    <div class="player-col">
      <!-- Native HTML5 / HLS Player Shell -->
      <div class="player-wrapper">
        {#if data.servers?.length === 0}
          <div class="player-shell error-msg">
            <p>لا توجد سيرفرات VIP متاحة لهذا العمل حالياً.</p>
          </div>
        {:else if resolving}
          <div class="player-shell loading">
            <div class="loader small"></div>
            <p>جارٍ تحليل السيرفر وفك تشفير البث المباشر… ⚡</p>
          </div>
        {:else if stream}
          <EnhancedPlayer
            src={stream.url}
            title={data.post.title}
            poster={data.post.poster}
            type={stream.type}
            strategy="direct"
            subtitleUrl={stream.type === 'iframe'
              ? ''
              : `/api/subtitles/${data.post.type}/${data.post.tmdbId}`}
            {resumeAt}
            onTimeUpdate={handleTimeUpdate}
            onError={handleStreamError}
            onEnded={() => console.log('[Watch] Playback ended')}
            onClose={() => {
              stream = null;
              resumeAt = 0;
            }}
          />
        {:else}
          <div class="player-shell error-msg">
            <p>{resolveError || 'يرجى اختيار أحد سيرفرات المشاهدة بالأسفل للبدء'}</p>
          </div>
        {/if}
      </div>

      <!-- Episodes (TV only) -->
      {#if isTv && data.post.seasons?.length}
        <div class="episodes-section">
          <div class="episodes-header">
            <span class="episodes-title">الحلقات 🎞️</span>
            {#if !loadingEpisodes && episodes.length}
              <span class="episodes-hint">{episodes.length} حلقة في الموسم {selectedSeason}</span>
            {/if}
          </div>
          <div class="seasons-row">
            {#each data.post.seasons as s (s.number)}
              <button
                type="button"
                class="season-btn"
                class:active={selectedSeason === s.number}
                onclick={() => selectSeason(s.number)}
              >
                {s.number === 0 ? 'حلقات خاصة' : `الموسم ${s.number}`}
              </button>
            {/each}
          </div>
          {#if loadingEpisodes}
            <div class="episodes-loading"><div class="loader small"></div></div>
          {:else}
            <div class="episodes-list">
              {#each episodes as ep (ep.number)}
                <button
                  type="button"
                  class="episode-btn"
                  class:active={selectedEpisode === ep.number}
                  onclick={() => selectEpisode(ep.number)}
                  title={ep.name}
                >
                  <span class="ep-num">{ep.number}</span>
                  <span class="ep-name">{ep.name}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Server Switcher Bar -->
      <div class="servers-section">
        <div class="servers-header">
          <span class="servers-title">سيرفرات البث المباشر (بدون إعلانات):</span>
          <span class="servers-hint">إذا واجهت بطئاً أو توقفاً، بدّل السيرفر</span>
        </div>
        <div class="server-list">
          {#each data.servers as srv (srv.server)}
            <button
              type="button"
              class="srv-btn"
              class:active={selectedServer?.server === srv.server}
              onclick={() => pick(srv)}
            >
              <span class="srv-dot"></span>
              <span class="srv-name">{srv.name}</span>
            </button>
          {/each}
        </div>
        {#if stream?.type === 'iframe' && data.post.type && data.post.tmdbId}
          <a
            class="subtitle-download"
            href={`/api/subtitles/${data.post.type}/${data.post.tmdbId}`}
            download="topcinema-arabic.vtt"
          >
            ⬇️ تحميل الترجمة العربية (ارفعها من زر Subtitles في المشغل إن لم تظهر)
          </a>
        {/if}
        {#if stream && stream.type !== 'iframe'}
          <button
            type="button"
            class="subtitle-download"
            onclick={() => {
              navigator.clipboard?.writeText(stream.copyUrl || '');
              copiedStream = true;
              setTimeout(() => (copiedStream = false), 2500);
            }}
          >
            {copiedStream ? '✅ تم نسخ رابط البث — الصقه في Web Video Caster أو VLC' : '🔗 نسخ رابط البث المباشر (للتشغيل في Web Video Caster / VLC / التلفاز)'}
          </button>
        {/if}
      </div>
    </div>

    <!-- Info Column -->
    <div class="info-col">
      <div class="poster-card">
        <img
          class="poster"
          src={data.post.poster || '/icons/icon.svg'}
          alt={data.post.title}
        />
      </div>

      <div class="info-body">
        <h1 class="movie-title">{data.post.title}</h1>

        <div class="meta-badges">
          {#if data.post.quality}
            <span class="badge quality">{data.post.quality}</span>
          {/if}
          {#if data.post.year}
            <span class="badge year">{data.post.year}</span>
          {/if}
          {#if data.post.duration}
            <span class="badge duration">{data.post.duration} دقيقة</span>
          {/if}
          {#if data.post.language}
            <span class="badge lang">{data.post.language}</span>
          {/if}
        </div>

        <div class="action-buttons">
          <button
            type="button"
            class="action-btn"
            class:active={inList}
            onclick={handleWatchlistToggle}
          >
            {#if inList}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
              </svg>
              <span>في قائمتي</span>
            {:else}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              <span>أضف لقائمتي</span>
            {/if}
          </button>

          <button type="button" class="action-btn" onclick={handleShare}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
            <span>{copied ? 'تم نسخ الرابط!' : 'مشاركة'}</span>
          </button>
        </div>

        {#if data.post.genres?.length}
          <div class="genres-row">
            <span class="genres-label">التصنيف:</span>
            <span class="genres-text">{data.post.genres.join(' • ')}</span>
          </div>
        {/if}

        {#if data.post.story}
          <div class="story-section">
            <h3>القصة:</h3>
            <p class="story-text">{data.post.story}</p>
          </div>
        {/if}

        {#if data.post.collection?.parts?.length > 1}
          <div class="collection-section">
            <h3>🎬 السلسلة: {data.post.collection.name}</h3>
            <div class="collection-row">
              {#each data.post.collection.parts as part (part.id)}
                <a
                  class="collection-item"
                  class:current={part.isCurrent}
                  href={'/watch/' + part.id}
                >
                  <img src={part.poster || '/icons/icon.svg'} alt={part.title} loading="lazy" />
                  <span class="c-title">{part.title}</span>
                  <span class="c-year">{part.year || '—'}</span>
                </a>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .watch-container {
    max-width: 1440px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 28px;
    padding: 24px;
    align-items: start;
  }
  .player-wrapper {
    width: 100%;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #000;
    box-shadow: var(--shadow-lg);
  }
  .player-shell {
    aspect-ratio: 16/9;
    min-height: 340px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-surface);
    color: var(--text-secondary);
    padding: 20px;
    text-align: center;
  }
  .player-shell.error-msg {
    color: #ff4d57;
    font-weight: 600;
  }
  .loader {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(229, 9, 20, 0.2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .loader.small {
    width: 38px;
    height: 38px;
    border-width: 3px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .servers-section {
    margin-top: 20px;
    padding: 18px 20px;
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
  }
  .servers-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .servers-title {
    font-weight: 700;
    font-size: 14.5px;
    color: var(--text);
  }
  .servers-hint {
    font-size: 12px;
    color: var(--text-muted);
  }
  .server-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .srv-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-radius: var(--radius-pill);
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    transition: all var(--transition-fast);
    cursor: pointer;
  }
  .srv-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: background var(--transition-fast);
  }
  .srv-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
    border-color: var(--border-hover);
    transform: translateY(-1px);
  }
  .srv-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    box-shadow: 0 4px 14px var(--accent-glow);
  }
  .srv-btn.active .srv-dot {
    background: #fff;
    box-shadow: 0 0 6px #fff;
  }
  .subtitle-download {
    display: inline-block;
    margin-top: 12px;
    padding: 8px 14px;
    border-radius: var(--radius-pill);
    background: rgba(16, 185, 129, 0.12);
    border: 1px dashed rgba(16, 185, 129, 0.5);
    color: var(--success, #10b981);
    font-size: 12.5px;
    font-weight: 600;
    transition: all var(--transition-fast);
  }
  .subtitle-download:hover {
    background: rgba(16, 185, 129, 0.22);
    transform: translateY(-1px);
  }
  .episodes-section {
    margin-top: 20px;
    padding: 18px 20px;
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
  }
  .episodes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .episodes-title {
    font-weight: 700;
    font-size: 14.5px;
    color: var(--text);
  }
  .episodes-hint {
    font-size: 12px;
    color: var(--text-muted);
  }
  .seasons-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }
  .season-btn {
    padding: 7px 15px;
    border-radius: var(--radius-pill);
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .season-btn:hover {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .season-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    box-shadow: 0 3px 10px var(--accent-glow);
  }
  .episodes-loading {
    display: flex;
    justify-content: center;
    padding: 18px 0;
  }
  .episodes-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .episode-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 7px 12px;
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
    font-size: 12.5px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .episode-btn:hover {
    color: var(--text);
    border-color: var(--border-hover);
    transform: translateY(-1px);
  }
  .episode-btn.active {
    border-color: var(--accent);
    color: #fff;
    background: rgba(229, 9, 20, 0.18);
  }
  .ep-num {
    min-width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    font-weight: 800;
    font-size: 11.5px;
  }
  .episode-btn.active .ep-num {
    background: var(--accent);
  }
  .ep-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .info-col {
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .poster-card {
    aspect-ratio: 2/3;
    width: 100%;
    max-width: 220px;
    margin: 0 auto;
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-md);
    border: 1px solid var(--border-glass);
  }
  .poster {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .movie-title {
    font-size: 22px;
    font-weight: 800;
    line-height: 1.35;
    margin-bottom: 12px;
  }
  .meta-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }
  .badge {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 11.5px;
    font-weight: 700;
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
  }
  .badge.quality {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .action-buttons {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }
  .action-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: var(--radius-pill);
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    transition: all var(--transition-fast);
    cursor: pointer;
  }
  .action-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: var(--border-hover);
  }
  .action-btn.active {
    background: rgba(16, 185, 129, 0.15);
    border-color: var(--success);
    color: var(--success);
  }
  .genres-row {
    font-size: 13px;
    margin-bottom: 8px;
  }
  .genres-label {
    color: var(--text-muted);
    margin-inline-end: 6px;
  }
  .genres-text {
    color: var(--accent-hover);
    font-weight: 600;
  }
  .story-section h3 {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .story-text {
    font-size: 13.5px;
    color: var(--text-secondary);
    line-height: 1.7;
  }
  .collection-section {
    border-top: 1px solid var(--border-glass);
    padding-top: 14px;
  }
  .collection-section h3 {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text-muted);
    margin-bottom: 10px;
  }
  .collection-row {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: thin;
  }
  .collection-item {
    flex: 0 0 86px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }
  .collection-item img {
    width: 86px;
    height: 129px;
    object-fit: cover;
    border-radius: 8px;
    border: 2px solid transparent;
    transition: all var(--transition-fast);
  }
  .collection-item:hover img {
    transform: translateY(-2px);
    border-color: var(--border-hover);
  }
  .collection-item.current img {
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }
  .c-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .collection-item.current .c-title {
    color: var(--accent);
  }
  .c-year {
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .watch-loading, .watch-error {
    text-align: center;
    padding: 100px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .back-link {
    padding: 10px 22px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  @media (max-width: 900px) {
    .watch-container {
      grid-template-columns: 1fr;
      padding: 16px;
      gap: 20px;
    }
    .poster-card {
      display: none;
    }
    .movie-title {
      font-size: 19px;
    }
  }
</style>
