<script>
  import { isInWatchlist, toggleWatchlist } from '../store.js';

  let { title, items = [], isContinueWatching = false } = $props();

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
  <section class="row" aria-label={title}>
    <div class="row-header">
      <h2>{title}</h2>
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

    <div class="track" bind:this={trackEl}>
      {#each items as it, idx (`${it.id || ''}_${idx}`)}
        <a class="card" href={'#/watch/' + it.id}>
          <div class="poster-wrap">
            <img
              loading="lazy"
              src={it.poster || '/icons/icon.svg'}
              alt={it.title}
              width="150"
              height="225"
            />

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
          {#if it.genres?.length}
            <p class="meta">{it.genres.slice(0, 2).join(' • ')}</p>
          {:else if it.year}
            <p class="meta">{it.year}</p>
          {/if}
        </a>
      {/each}
    </div>
  </section>
{/if}

<style>
  .row {
    margin: 28px 0 10px;
    position: relative;
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
    .name {
      font-size: 12.5px;
    }
  }
</style>
