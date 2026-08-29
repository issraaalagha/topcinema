<script>
  import { isInWatchlist, toggleWatchlist } from '../store.js';
  import DetailsModal from './DetailsModal.svelte';

  let { title, items = [], isContinueWatching = false, variant = 'row', listHref = '' } = $props();

  let detailsItem = $state(null);

  // Scroll-reveal (IntersectionObserver, reduced-motion aware)
  let sectionEl = $state();
  let revealed = $state(false);
  $effect(() => {
    if (!sectionEl) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealed = true;
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          revealed = true;
          io.disconnect();
        }
      },
      { rootMargin: '60px' }
    );
    io.observe(sectionEl);
    return () => io.disconnect();
  });

  // Desktop hover preview card (Netflix-style expand)
  let preview = $state(null);
  let previewTimer = null;
  let hideTimer = null;

  function canHover() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }
  function showPreview(e, it) {
    if (!canHover() || variant === 'ranked') return;
    const card = e.currentTarget; // capture NOW — nullified after the handler
    if (!card) return;
    clearTimeout(hideTimer);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const r = card.getBoundingClientRect();
      const panelW = Math.min(340, Math.round(r.width * 1.6));
      const left = Math.max(10, Math.min(r.left - (panelW - r.width) / 2, window.innerWidth - panelW - 10));
      const top = Math.max(74, Math.min(r.top - 40, window.innerHeight - 390));
      preview = { item: it, top, left, width: panelW };
    }, 420);
  }
  function cancelHide() {
    clearTimeout(hideTimer);
  }
  function hidePreviewSoon() {
    clearTimeout(previewTimer);
    hideTimer = setTimeout(() => (preview = null), 140);
  }
  function hidePreviewNow() {
    clearTimeout(previewTimer);
    preview = null;
  }
  function togglePreviewList(e, it) {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(it);
    preview = preview ? { ...preview, saved: undefined } : null;
  }

  let trackEl = $state();

  function scroll(dir) {
    if (!trackEl) return;
    const amount = dir === 'left' ? -420 : 420;
    trackEl.scrollBy({ left: amount, behavior: 'smooth' });
  }

  function handleBookmark(e, it) {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(it);
  }
</script>

{#if items && items.length > 0}
  <section class="row" class:revealed bind:this={sectionEl} aria-label={title}>
    <div class="row-header">
      <h2>
        {#if listHref}
          <a class="row-title-link" href={listHref}>
            {title}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M14.71 5.71l-.71.71 4.3 4.29H2v2h16.3l-4.3 4.29.71.71 5.29-5.29z" transform="scale(-1,1) translate(-24,0)"/>
            </svg>
          </a>
        {:else}
          {title}
        {/if}
      </h2>
      <div class="nav-arrows">
        <button
          type="button"
          class="arrow-btn"
          onclick={() => scroll('right')}
          aria-label="التمرير لليمين"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </button>
        <button
          type="button"
          class="arrow-btn"
          onclick={() => scroll('left')}
          aria-label="التمرير لليسار"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M15.41 7.41L10.83 12l4.58 4.59L14 18l-6-6 6-6 1.41 1.41z"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="track" class:grid={variant === 'grid'} class:ranked={variant === 'ranked'} onscroll={hidePreviewNow} bind:this={trackEl}>
      {#each items as it, idx (`${it.id || ''}_${idx}`)}
        {#if variant === 'ranked'}
          <a class="ranked-card" href={'/watch/' + it.id}>
            <span class="rank-num">{idx + 1}</span>
            <div class="rank-poster">
              <img
                loading="lazy"
                src={it.poster || '/icons/icon.svg'}
                alt={it.title}
                width="130"
                height="195"
              />
              {#if it.kind}
                <span class="kind-badge kind-{it.type}">{it.kind}</span>
              {/if}
            </div>
            <p class="name">{it.title}</p>
          </a>
        {:else}
        <a
          class="card"
          href={'/watch/' + it.id}
          data-modal-link="1"
          onclick={(e) => { e.preventDefault(); detailsItem = it; }}
          onmouseenter={(e) => showPreview(e, it)}
          onmouseleave={hidePreviewSoon}
        >
          <div class="poster-wrap">
            <img
              loading="lazy"
              src={it.poster || '/icons/icon.svg'}
              alt={it.title}
              width="150"
              height="225"
            />

            <!-- Cinematic hover shade + play affordance (pointer devices) -->
            <div class="hover-shade" aria-hidden="true">
              <span class="play-circle">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </span>
            </div>

            {#if it.kind}
              <span class="kind-badge kind-{it.type}">{it.kind}</span>
            {/if}

            {#if it.isNew}
              <span class="new-chip">جديد</span>
            {/if}

            {#if it.quality}
              <span class="quality">{it.quality}</span>
            {/if}

            {#if it.imdb}
              <span class="imdb">★ {it.imdb}</span>
            {/if}

            <!-- Quick Watchlist Action Button on hover -->
            <button
              type="button"
              class="quick-bookmark"
              class:saved={isInWatchlist(it.id)}
              onclick={(e) => handleBookmark(e, it)}
              title={isInWatchlist(it.id) ? 'إزالة من قائمتي' : 'إضافة إلى قائمتي'}
              aria-label="حفظ في قائمتي"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                {#if isInWatchlist(it.id)}
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                {:else}
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-4.5 7 4.5V5c0-1.1-.9-2-2-2zm0 15l-5-3.18L7 18V5h10v13z"/>
                {/if}
              </svg>
            </button>

            <!-- Progress bar for continue watching -->
            {#if isContinueWatching && it.percent}
              <div class="progress-bar-wrap">
                <div class="progress-bar-fill" style={'width: ' + it.percent + '%'}></div>
              </div>
            {/if}
          </div>

          <p class="name" title={it.title}>{it.title}</p>
          <p class="meta">
            {[it.genres?.slice(0, 2).join(' • '), it.year].filter(Boolean).join(' • ') || it.kind || ''}
          </p>
        </a>
        {/if}
      {/each}
    </div>

    {#if preview}
      <div
        class="preview-panel"
        style="top:{preview.top}px; left:{preview.left}px; width:{preview.width}px"
        onmouseenter={cancelHide}
        onmouseleave={hidePreviewSoon}
      >
        {#if variant === 'ranked'}
          <span class="p-top10">TOP&nbsp;10</span>
        {/if}
        <img class="p-back" src={preview.item.backdrop || preview.item.poster || '/icons/icon.svg'} alt="" />
        <div class="p-body">
          <div class="p-title-row">
            {#if preview.item.kind}<span class="p-kind">{preview.item.kind}</span>{/if}
            {#if preview.item.rating}<span class="p-rating">{preview.item.rating} ★</span>{/if}
            {#if preview.item.year}<span class="p-year">{preview.item.year}</span>{/if}
          </div>
          <h4 class="p-title">{preview.item.title}</h4>
          {#if preview.item.genres?.length}
            <p class="p-genres">{preview.item.genres.slice(0, 3).join(' • ')}</p>
          {/if}
          {#if preview.item.story}
            <p class="p-story">{preview.item.story}</p>
          {/if}
          <div class="p-actions">
            <a class="p-play" href={'/watch/' + preview.item.id} onclick={hidePreviewNow}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              تشغيل
            </a>
            <button type="button" class="p-add" onclick={(e) => togglePreviewList(e, preview.item)}>
              + قائمتي
            </button>
            <button
              type="button"
              class="p-info"
              aria-label="تفاصيل"
              title="تفاصيل"
              onclick={() => { const it = preview?.item; preview = null; if (it) detailsItem = it; }}
            >
              ⓘ
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if detailsItem}
      <DetailsModal item={detailsItem} onClose={() => (detailsItem = null)} />
    {/if}
  </section>
{/if}

<style>
  .row {
    margin: 28px 0 10px;
    position: relative;
  /* Scroll-reveal */
  .row:not(.revealed) {
    opacity: 0;
    transform: translateY(26px);
  }
  .row.revealed {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 0.55s ease, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* ── Ranked (Top 10) variant ── */
  .track.ranked {
    align-items: flex-end;
    gap: 0;
  }
  .ranked-card {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-end;
    position: relative;
    text-decoration: none;
    scroll-snap-align: start;
    padding: 4px 2px 10px;
  }
  .rank-num {
    font-size: 148px;
    font-weight: 900;
    line-height: 0.76;
    letter-spacing: -10px;
    color: #07090e;
    -webkit-text-stroke: 3px rgba(255, 255, 255, 0.42);
    margin-inline-end: -24px;
    z-index: 0;
    user-select: none;
    font-family: 'Arial Black', 'Alexandria', sans-serif;
  }
  .rank-poster {
    position: relative;
    z-index: 1;
    width: 132px;
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-md);
    border: 1px solid var(--border-glass);
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  }
  .ranked-card:hover .rank-poster {
    transform: translateY(-6px) scale(1.04);
    box-shadow: var(--shadow-lg);
  }
  .rank-poster img {
    width: 100%;
    height: auto;
    aspect-ratio: 2/3;
    object-fit: cover;
    display: block;
  }
  .ranked-card .name {
    position: absolute;
    bottom: -4px;
    inset-inline-end: 6px;
    max-width: 120px;
    z-index: 2;
    display: none;
  }

  /* ── Hover preview panel ── */
  .preview-panel {
    position: fixed;
    z-index: 250;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(18, 20, 26, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.8);
    animation: panel-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
    pointer-events: auto;
  }
  @keyframes panel-in {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }
  .p-back {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    display: block;
  }
  .p-body {
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .p-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    font-weight: 700;
  }
  .p-kind {
    color: #60a5fa;
  }
  .p-rating {
    color: #f5c518;
  }
  .p-year {
    color: var(--text-muted);
  }
  .p-title {
    font-size: 15.5px;
    font-weight: 800;
    color: #fff;
    line-height: 1.3;
  }
  .p-genres {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .p-story {
    font-size: 12.5px;
    color: var(--text-secondary);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .p-actions {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }
  .p-play {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: #fff;
    font-size: 12.5px;
    font-weight: 700;
  }
  .p-play:hover {
    background: #ff1a26;
  }
  .p-add {
    padding: 8px 14px;
    border-radius: var(--radius-pill);
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .p-add:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .p-info {
    min-width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    font-family: Georgia, serif;
  }
  .p-info:hover {
    background: rgba(255, 255, 255, 0.25);
  }
  .p-top10 {
    position: absolute;
    top: 0;
    inset-inline-start: 0;
    z-index: 3;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1px;
    padding: 4px 10px;
    border-radius: 0 0 8px 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .row:not(.revealed) {
      opacity: 1;
      transform: none;
    }
    .row.revealed {
      transition: none;
    }
    .preview-panel {
      animation: none;
    }
  }
  }
  .row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 22px;
    margin-bottom: 14px;
  }
  h2 {
    font-size: 20px;
    font-weight: 700;
    position: relative;
    padding-inline-start: 14px;
    letter-spacing: -0.3px;
  }
  .row-title-link {
    color: var(--text);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: color var(--transition-fast);
  }
  .row-title-link:hover {
    color: var(--accent);
  }
  .row-title-link:hover svg {
    color: var(--accent);
  }
  h2::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 18px;
    border-radius: 4px;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }
  .nav-arrows {
    display: flex;
    gap: 6px;
  }
  .arrow-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
    display: grid;
    place-items: center;
    transition: all var(--transition-fast);
  }
  .arrow-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    transform: scale(1.08);
  }
  .track {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding: 6px 22px 18px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    /* trailing-edge fade (RTL: left end) */
    mask-image: linear-gradient(to left, transparent 0, #000 26px);
    -webkit-mask-image: linear-gradient(to left, transparent 0, #000 26px);
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  /* Full-browse grid variant (watchlist / search results) */
  .track.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
    gap: 16px 14px;
    overflow-x: visible;
    padding: 6px 22px 20px;
  }
  .track.grid .card {
    flex: initial;
    width: 100%;
  }
  .track.grid .name,
  .track.grid .meta {
    max-width: 100%;
  }
  .card {
    flex: 0 0 150px;
    scroll-snap-align: start;
    display: flex;
    flex-direction: column;
    outline: none;
  }
  .poster-wrap {
    position: relative;
    aspect-ratio: 2/3;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: linear-gradient(135deg, var(--bg-surface), var(--bg-card));
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--border-glass);
    transition: transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal);
  }
  .card:hover .poster-wrap {
    transform: translateY(-6px) scale(1.03);
    box-shadow: var(--shadow-lg);
    border-color: var(--border-hover);
  }
  .card:focus-visible .poster-wrap {
    border-color: var(--accent);
    box-shadow: var(--shadow-glow);
  }
  .poster-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }
  /* Cinematic hover shade + play affordance */
  .hover-shade {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0.12) 55%);
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
  }
  .play-circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: rgba(229, 9, 20, 0.94);
    border: 2px solid rgba(255, 255, 255, 0.85);
    color: #fff;
    box-shadow: 0 8px 26px rgba(229, 9, 20, 0.55);
    transform: scale(0.55);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    padding-inline-start: 3px;
  }
  @media (hover: hover) and (pointer: fine) {
    .card:hover .hover-shade,
    .card:focus-visible .hover-shade {
      opacity: 1;
    }
    .card:hover .play-circle,
    .card:focus-visible .play-circle {
      transform: scale(1);
    }
    .card:hover .poster-wrap img {
      transform: scale(1.08);
    }
  }
  .new-chip {
    position: absolute;
    bottom: 8px;
    inset-inline-start: 8px;
    background: rgba(16, 185, 129, 0.9);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
  }
  .quality {
    position: absolute;
    top: 8px;
    inset-inline-start: 8px;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(6px);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .kind-badge {
    position: absolute;
    top: 8px;
    inset-inline-end: 8px;
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
    letter-spacing: 0.3px;
  }
  .kind-movie {
    background: rgba(229, 9, 20, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .kind-tv {
    background: rgba(37, 99, 235, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .imdb {
    position: absolute;
    bottom: 8px;
    inset-inline-end: 8px;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(6px);
    color: var(--gold);
    font-size: 10.5px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid rgba(245, 197, 24, 0.3);
  }
  .quick-bookmark {
    position: absolute;
    top: 8px;
    inset-inline-end: 8px;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-pill);
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(6px);
    color: #fff;
    display: grid;
    place-items: center;
    opacity: 0;
    transform: scale(0.8);
    transition: all var(--transition-fast);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .card:hover .quick-bookmark,
  .quick-bookmark.saved {
    opacity: 1;
    transform: scale(1);
  }
  .quick-bookmark.saved {
    color: var(--accent);
    background: rgba(0, 0, 0, 0.85);
  }
  .quick-bookmark:hover {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .progress-bar-wrap {
    position: absolute;
    bottom: 0;
    inset-inline: 0;
    height: 4px;
    background: rgba(0, 0, 0, 0.6);
  }
  .progress-bar-fill {
    height: 100%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
  }
  .name {
    margin-top: 10px;
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--text);
  }
  .meta {
    margin-top: 3px;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  @media (max-width: 768px) {
    .nav-arrows {
      display: none;
    }
    .row {
      margin: 20px 0 8px;
    }
    .row-header {
      padding: 0 16px;
      margin-bottom: 10px;
    }
    .track {
      padding: 4px 16px 14px;
      gap: 12px;
    }
    .card {
      flex: 0 0 126px;
    }
    .ranked-card {
      flex: 0 0 auto;
      padding: 2px 0 8px;
    }
    .rank-num {
      font-size: 96px;
      letter-spacing: -6px;
      margin-inline-end: -16px;
      -webkit-text-stroke-width: 2px;
    }
    .rank-poster {
      width: 100px;
    }
    .track.grid {
      grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
      padding: 4px 16px 16px;
      gap: 14px 10px;
    }
    .name {
      font-size: 12.5px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card:hover .poster-wrap,
    .card:hover .poster-wrap img {
      transform: none;
    }
    .poster-wrap img,
    .play-circle,
    .hover-shade {
      transition: opacity 0.15s ease;
    }
    .play-circle {
      transform: none;
    }
  }
</style>
