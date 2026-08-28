<script>
  import { isInWatchlist, toggleWatchlist } from '../store.js';

  let { items = [] } = $props();

  let active = $state(0);
  let paused = $state(false);
  let touchX = 0;
  let reducedMotion = false;

  const AUTO_MS = 7000;
  const item = $derived(items[active] || null);

  let inList = $state(false);
  $effect(() => {
    inList = item?.id ? isInWatchlist(item.id) : false;
  });

  // Auto-rotate featured slides (disabled for reduced-motion users)
  $effect(() => {
    if (items.length <= 1 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      active = (active + 1) % items.length;
    }, AUTO_MS);
    return () => clearInterval(t);
  });

  function goTo(i) {
    if (!items.length) return;
    active = ((i % items.length) + items.length) % items.length;
  }

  function onTouchStart(e) {
    touchX = e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) goTo(active + (dx < 0 ? 1 : -1));
  }

  function handleWatchlistToggle() {
    if (!item) return;
    inList = toggleWatchlist(item);
  }
</script>

{#if item}
  <section
    class="hero"
    role="region"
    aria-roledescription="carousel"
    aria-label="الأعمال المميزة"
    onmouseenter={() => (paused = true)}
    onmouseleave={() => (paused = false)}
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
  >
    <!-- Ambient glow of the ACTIVE slide -->
    <div
      class="hero-ambient-glow"
      style="background-image: url('{item.backdrop || item.poster || '/icons/icon.svg'}')"
    ></div>

    <!-- Full-bleed crossfading slides -->
    <div class="hero-slides">
      {#each items as it, i (it.id)}
        <div class="hero-slide" class:active={i === active} aria-hidden={i !== active}>
          <img
            src={it.backdrop || it.poster || '/icons/icon.svg'}
            alt={i === active ? it.title : ''}
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchpriority={i === 0 ? 'high' : 'low'}
            decoding="async"
          />
        </div>
      {/each}

      <div class="vignette-side"></div>
      <div class="vignette-bottom"></div>
      <div class="vignette-top"></div>
    </div>

    {#key active}
      <div class="hero-content">
        <div class="meta-row">
          {#if item.kind}
            <span class="badge badge-kind">{item.kind}</span>
          {/if}
          {#if item.quality}
            <span class="badge badge-quality">{item.quality}</span>
          {/if}
          {#if item.rating}
            <span class="badge badge-imdb">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="#f5c518">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              <span>{item.rating}</span>
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

        {#if items.length > 1}
          <div class="dots" role="tablist" aria-label="التبديل بين الأعمال المميزة">
            {#each items as it, i (it.id)}
              <button
                type="button"
                class="dot"
                class:active={i === active}
                onclick={() => goTo(i)}
                aria-label={it.title}
                aria-current={i === active}
              ></button>
            {/each}
          </div>
        {/if}
      </div>
    {/key}
  </section>
{/if}

<style>
  .hero {
    position: relative;
    width: 100%;
    min-height: 520px;
    min-height: min(82svh, 680px);
    display: flex;
    align-items: center;
    padding: calc(76px + env(safe-area-inset-top, 0px)) 48px 64px;
    margin-bottom: 24px;
    overflow: hidden;
    background: #07090e;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }

  .hero-ambient-glow {
    position: absolute;
    inset: -20px;
    background-size: cover;
    background-position: center;
    filter: blur(70px) opacity(0.3) saturate(1.7);
    z-index: 1;
    transform: scale(1.1);
    pointer-events: none;
    transition: background-image 0.6s ease;
  }

  /* ── Full-bleed crossfading slides ── */
  .hero-slides {
    position: absolute;
    inset: 0;
    z-index: 2;
    overflow: hidden;
  }
  .hero-slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.9s ease;
    pointer-events: none;
  }
  .hero-slide.active {
    opacity: 1;
  }
  .hero-slide img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 24%;
    filter: brightness(0.92) contrast(1.05);
    transform: scale(1.02);
    transition: transform 8s linear;
  }
  .hero-slide.active img {
    transform: scale(1.1); /* subtle Ken Burns while the slide is live */
  }

  /* ── Cinematic vignettes (RTL: content anchored right) ── */
  .vignette-side {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to left,
      rgba(7, 9, 14, 0.97) 0%,
      rgba(7, 9, 14, 0.78) 34%,
      rgba(7, 9, 14, 0.3) 60%,
      rgba(7, 9, 14, 0.05) 85%
    );
  }
  .vignette-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 150px;
    background: linear-gradient(to top, rgba(7, 9, 14, 1) 0%, transparent 100%);
  }
  .vignette-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 90px;
    background: linear-gradient(to bottom, rgba(7, 9, 14, 0.85) 0%, transparent 100%);
  }

  /* ── Content ── */
  .hero-content {
    position: relative;
    z-index: 3;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    animation: content-in 0.55s ease both;
  }
  @keyframes content-in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
  .badge-kind {
    background: rgba(37, 99, 235, 0.85);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.25);
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

  /* ── Dots ── */
  .dots {
    display: flex;
    gap: 7px;
    margin-top: 14px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-pill);
    border: 0;
    background: rgba(255, 255, 255, 0.28);
    cursor: pointer;
    transition: all 0.3s ease;
    padding: 0;
  }
  .dot:hover {
    background: rgba(255, 255, 255, 0.55);
  }
  .dot.active {
    width: 30px;
    background: var(--accent);
    box-shadow: 0 0 12px var(--accent-glow);
  }

  /* ── Mobile ── */
  @media (max-width: 900px) {
    .hero {
      min-height: 480px;
      min-height: min(72svh, 600px);
      padding: calc(64px + env(safe-area-inset-top, 0px)) 20px 40px;
      align-items: flex-end;
    }
    .hero-slide img {
      object-position: center 18%;
    }
    .vignette-side {
      background: linear-gradient(
        to top,
        rgba(7, 9, 14, 0.97) 0%,
        rgba(7, 9, 14, 0.72) 38%,
        rgba(7, 9, 14, 0.35) 68%,
        rgba(7, 9, 14, 0.1) 100%
      );
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
    .hero-slide {
      transition: none;
    }
    .hero-slide img {
      transition: none;
      transform: none;
    }
    .hero-content {
      animation: none;
    }
    .btn-primary:hover,
    .btn-secondary:hover {
      transform: none;
    }
  }
</style>
