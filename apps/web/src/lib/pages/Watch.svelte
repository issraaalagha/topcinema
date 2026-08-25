<script>
  import { api } from '../api.js';
  import EnhancedPlayer from '../player/EnhancedPlayer.svelte';
  import { isInWatchlist, toggleWatchlist } from '../store.js';
  import { videoExtractor } from '../services/videoExtractor.js';

  let { id } = $props();

  let data = $state(null);
  let error = $state('');
  let selectedServer = $state(null);
  let stream = $state(null);
  let resolving = $state(false);
  let resolveError = $state('');
  let inList = $state(false);
  let copied = $state(false);
  let extractionStrategy = $state('direct'); // 'direct' or 'iframe'
  let requiresAdBlock = $state(false);

  function syncWatchlistStatus() {
    if (id) inList = isInWatchlist(id);
  }

  $effect(() => {
    syncWatchlistStatus();
    window.addEventListener('topcinema-store-change', syncWatchlistStatus);
    return () => window.removeEventListener('topcinema-store-change', syncWatchlistStatus);
  });

  $effect(() => {
    data = null;
    error = '';
    stream = null;
    resolveError = '';

    api
      .post(id)
      .then((d) => {
        data = d;
        syncWatchlistStatus();
        // Priority: high-speed direct native servers first (LuluStream, UpDown, StreamWish, FileLions)
        const preferred =
          d.servers?.find((s) => /lulu|updown|streamwish|filelions|vidtube/i.test(s.name)) ||
          d.servers?.[0];
        if (preferred) pick(preferred);
      })
      .catch((e) => (error = e.message));
  });

  async function pick(srv) {
    selectedServer = srv;
    stream = null;
    resolveError = '';
    resolving = true;
    extractionStrategy = 'direct';
    requiresAdBlock = false;

    try {
      const r = await api.resolve(id, srv.server);
      
      if (!r.ok || !r.url) {
        resolveError = r.error || 'تعذر الحصول على رابط السيرفر';
        resolving = false;
        return;
      }

      console.log('[Watch] Resolved Stream URL:', r.url);
      
      stream = {
        url: r.url,
        type: r.type || (r.url.includes('.mp4') ? 'mp4' : 'hls'),
        server: srv.name
      };
      
      extractionStrategy = 'direct';
      requiresAdBlock = false;

    } catch (e) {
      console.error('[Watch] Error:', e);
      resolveError = 'فشل معالجة رابط السيرفر: ' + e.message;
    } finally {
      resolving = false;
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
    <a href="#/" class="back-link">العودة للرئيسية</a>
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
        {#if resolving}
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
            strategy={extractionStrategy}
            requiresAdBlock={requiresAdBlock}
            onError={(err) => {
              console.error('[Player] Error:', err);
              resolveError = 'فشل تشغيل الفيديو. جرب سيرفر آخر.';
            }}
            onReady={() => {
              console.log('[Player] Ready');
            }}
          />
        {:else}
          <div class="player-shell error-msg">
            <p>{resolveError || 'يرجى اختيار أحد سيرفرات المشاهدة بالأسفل للبدء'}</p>
          </div>
        {/if}
      </div>

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
