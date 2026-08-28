<script>
  import { isInWatchlist, toggleWatchlist } from '../store.js';

  let { item } = $props();

  let inList = $state(false);

  $effect(() => {
    if (item?.id) {
      inList = isInWatchlist(item.id);
    }
  });

  function handleWatchlistToggle() {
    if (!item) return;
    inList = toggleWatchlist(item);
  }
</script>

{#if item}
  <section class="hero" aria-label="العمل المميز">
    <!-- Ambient Depth Background Glow -->
    <div class="hero-ambient-glow" style="background-image: url('{item.backdrop || item.poster || '/icons/icon.svg'}')"></div>

    <!-- Crisp Cinematic Backdrop -->
    <div class="hero-backdrop-wrap">
      <img
        class="hero-backdrop"
        src={item.backdrop || item.poster || '/icons/icon.svg'}
        alt={item.title}
        loading="eager"
        fetchpriority="high"
        decoding="async"
      />
      <!-- Netflix-style Multi-Stop Vignette Gradients -->
      <div class="hero-vignette-left"></div>
      <div class="hero-vignette-bottom"></div>
      <div class="hero-vignette-top"></div>
    </div>

    <!-- Foreground Content & Metadata -->
    <div class="hero-content">
      <div class="meta-row">
        {#if item.kind}
          <span class="badge badge-kind">{item.kind}</span>
        {/if}
        {#if item.quality}
          <span class="badge badge-quality">{item.quality}</span>
        {/if}
        {#if item.imdb}
          <span class="badge badge-imdb">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="#f5c518">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
            <span>{item.imdb}</span>
          </span>
        {/if}
        {#if item.year}
          <span class="badge badge-year">{item.year}</span>
        {/if}
      </div>

      <h1 class="hero-title">{item.title}</h1>

      {#if item.genres?.length}
        <div class="genre-tags">
          {#each item.genres.slice(0, 4) as g}
            <span class="tag">{g}</span>
          {/each}
        </div>
      {/if}

      {#if item.story}
        <p class="hero-story">{item.story}</p>
      {/if}

      <div class="hero-actions">
        <a href={'/watch/' + item.id} class="btn-primary">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span>مشاهدة الآن</span>
        </a>

        <button type="button" class="btn-secondary" class:active={inList} onclick={handleWatchlistToggle}>
          {#if inList}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
            </svg>
            <span>في قائمتي</span>
          {:else}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            <span>أضف لقائمتي</span>
          {/if}
        </button>
      </div>
    </div>
  </section>
{/if}

<style>
  .hero {
    position: relative;
    width: 100%;
    min-height: 520px;
    min-height: min(80svh, 660px);
    display: flex;
    align-items: center;
    padding: calc(76px + env(safe-area-inset-top, 0px)) 48px 60px;
    margin-bottom: 24px;
    overflow: hidden;
    background: #07090e;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }

  /* Ambient Glow Layer */
  .hero-ambient-glow {
    position: absolute;
    inset: -20px;
    background-size: cover;
    background-position: center;
    filter: blur(60px) opacity(0.35) saturate(1.8);
    z-index: 1;
    transform: scale(1.1);
    pointer-events: none;
  }

  /* Backdrop Poster Wrap */
  .hero-backdrop-wrap {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    overflow: hidden;
  }

  .hero-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: auto;
    width: 65%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    filter: brightness(0.9) contrast(1.05);
    transition: transform 0.8s ease;
  }

  .hero:hover .hero-backdrop {
    transform: scale(1.03);
  }

  /* Cinematic Vignettes for Arabic (RTL Layout) */
  .hero-vignette-left {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to right,
      transparent 0%,
      rgba(7, 9, 14, 0.3) 35%,
      rgba(7, 9, 14, 0.85) 60%,
      rgba(7, 9, 14, 1) 85%
    );
  }

  .hero-vignette-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 140px;
    background: linear-gradient(to top, rgba(7, 9, 14, 1) 0%, transparent 100%);
  }

  .hero-vignette-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 80px;
    background: linear-gradient(to bottom, rgba(7, 9, 14, 0.8) 0%, transparent 100%);
  }

  /* Content */
  .hero-content {
    position: relative;
    z-index: 3;
    max-width: 620px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 700;
    backdrop-filter: blur(10px);
  }

  .badge-featured {
    background: rgba(229, 9, 20, 0.2);
    border: 1px solid rgba(229, 9, 20, 0.4);
    color: #ff4d57;
  }

  .badge-quality {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    letter-spacing: 0.5px;
  }

  .badge-imdb {
    background: rgba(245, 197, 24, 0.15);
    color: #f5c518;
    border: 1px solid rgba(245, 197, 24, 0.35);
  }

  .badge-year {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
    border: 1px solid var(--border-glass);
  }
  .badge-kind {
    background: rgba(37, 99, 235, 0.85);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .hero-title {
    font-size: clamp(27px, 4.6vw, 46px);
    font-weight: 900;
    line-height: 1.22;
    letter-spacing: -0.5px;
    color: #ffffff;
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.9);
  }

  .genre-tags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tag {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.09);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    font-weight: 500;
  }

  .hero-story {
    font-size: 14.5px;
    color: rgba(255, 255, 255, 0.75);
    line-height: 1.75;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
  }

  .hero-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 13px 28px;
    border-radius: var(--radius-pill);
    background: linear-gradient(135deg, var(--accent), #b30710);
    color: #fff;
    font-weight: 700;
    font-size: 15.5px;
    box-shadow: 0 6px 25px var(--accent-glow);
    transition: all var(--transition-fast);
    cursor: pointer;
  }

  .btn-primary:hover {
    transform: translateY(-2px) scale(1.03);
    box-shadow: 0 8px 32px var(--accent-glow);
    background: linear-gradient(135deg, #ff1a26, var(--accent));
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 13px 22px;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    font-weight: 600;
    font-size: 14.5px;
    backdrop-filter: blur(16px);
    transition: all var(--transition-fast);
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.35);
    transform: translateY(-2px);
  }

  .btn-secondary.active {
    background: rgba(16, 185, 129, 0.22);
    border-color: var(--success);
    color: var(--success);
  }

  @media (max-width: 900px) {
    .hero {
      min-height: 460px;
      min-height: min(68svh, 560px);
      padding: calc(64px + env(safe-area-inset-top, 0px)) 20px 34px;
      align-items: flex-end;
    }
    .hero-backdrop {
      width: 100%;
      opacity: 0.55;
    }
    .hero-vignette-left {
      background: linear-gradient(to top, rgba(7, 9, 14, 0.96) 18%, rgba(7, 9, 14, 0.55) 70%, transparent 100%);
    }
    .hero-story {
      font-size: 13.5px;
      -webkit-line-clamp: 2;
    }
    .hero-actions .btn-primary,
    .hero-actions .btn-secondary {
      min-height: 46px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero:hover .hero-backdrop {
      transform: none;
    }
    .btn-primary:hover,
    .btn-secondary:hover {
      transform: none;
    }
  }
</style>
