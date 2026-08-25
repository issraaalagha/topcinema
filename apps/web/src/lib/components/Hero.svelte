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
    <!-- Backdrop Image with layered gradients -->
    <div class="hero-bg-container">
      <img
        class="hero-bg"
        src={item.poster || '/icons/icon.svg'}
        alt={item.title}
        loading="eager"
        fetchpriority="high"
      />
      <div class="hero-gradient-overlay"></div>
    </div>

    <!-- Content -->
    <div class="hero-content">
      <div class="meta-row">
        {#if item.quality}
          <span class="badge badge-quality">{item.quality}</span>
        {/if}
        {#if item.imdb}
          <span class="badge badge-imdb">★ {item.imdb} IMDb</span>
        {/if}
        {#if item.year}
          <span class="badge badge-year">{item.year}</span>
        {/if}
      </div>

      <h1 class="hero-title">{item.title}</h1>

      {#if item.genres?.length}
        <div class="genre-tags">
          {#each item.genres.slice(0, 3) as g}
            <span class="tag">{g}</span>
          {/each}
        </div>
      {/if}

      {#if item.story}
        <p class="hero-story">{item.story}</p>
      {/if}

      <div class="hero-actions">
        <a href={'#/watch/' + item.id} class="btn-primary">
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
    min-height: 480px;
    display: flex;
    align-items: flex-end;
    padding: 60px 36px 40px;
    margin-bottom: 18px;
    overflow: hidden;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }
  .hero-bg-container {
    position: absolute;
    inset: 0;
    z-index: 1;
  }
  .hero-bg {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    filter: blur(20px) brightness(0.4) saturate(1.4);
    transform: scale(1.15);
  }
  .hero-gradient-overlay {
    position: absolute;
    inset: 0;
    background: 
      linear-gradient(to top, var(--bg) 5%, transparent 65%),
      linear-gradient(to right, rgba(7, 9, 14, 0.95) 0%, rgba(7, 9, 14, 0.7) 40%, transparent 100%),
      radial-gradient(ellipse at 80% 20%, rgba(229, 9, 20, 0.15), transparent 70%);
  }
  .hero-content {
    position: relative;
    z-index: 2;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .badge {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 700;
    backdrop-filter: blur(8px);
  }
  .badge-quality {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .badge-imdb {
    background: rgba(245, 197, 24, 0.2);
    color: var(--gold);
    border: 1px solid rgba(245, 197, 24, 0.4);
  }
  .badge-year {
    background: var(--bg-surface);
    color: var(--text-secondary);
    border: 1px solid var(--border-glass);
  }
  .hero-title {
    font-size: 38px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.5px;
    text-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
  }
  .genre-tags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tag {
    font-size: 12.5px;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.08);
    padding: 3px 10px;
    border-radius: var(--radius-pill);
  }
  .hero-story {
    font-size: 14.5px;
    color: var(--text-secondary);
    line-height: 1.7;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }
  .hero-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 26px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--accent), #b30710);
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    box-shadow: 0 6px 24px var(--accent-glow);
    transition: all var(--transition-fast);
  }
  .btn-primary:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 8px 30px var(--accent-glow);
    background: linear-gradient(135deg, var(--accent-hover), var(--accent));
  }
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: var(--radius-md);
    background: var(--bg-glass);
    border: 1px solid var(--border-glass);
    color: var(--text);
    font-weight: 600;
    font-size: 14px;
    backdrop-filter: blur(12px);
    transition: all var(--transition-fast);
  }
  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: var(--border-hover);
    transform: translateY(-2px);
  }
  .btn-secondary.active {
    background: rgba(16, 185, 129, 0.18);
    border-color: var(--success);
    color: var(--success);
  }

  @media (max-width: 768px) {
    .hero {
      min-height: 380px;
      padding: 32px 18px 26px;
    }
    .hero-title {
      font-size: 26px;
    }
    .hero-story {
      font-size: 13.5px;
      -webkit-line-clamp: 2;
    }
    .btn-primary, .btn-secondary {
      padding: 10px 18px;
      font-size: 13.5px;
    }
  }
</style>
