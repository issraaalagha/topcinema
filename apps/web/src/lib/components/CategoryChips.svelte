<script>
  let { selected = '', onSelect } = $props();

  const categories = [
    { id: '', label: '🔥 الكل', icon: 'sparkles' },
    { id: 'movies', label: '🎬 أفلام', icon: 'film' },
    { id: 'series', label: '📺 مسلسلات', icon: 'tv' },
    { id: 'anime', label: '⚡ أنمي', icon: 'zap' },
    { id: 'action', label: '💥 أكشن' },
    { id: 'horror', label: '👻 رعب' },
    { id: 'comedy', label: '🍿 كوميديا' },
    { id: 'drama', label: '🎭 دراما' },
    { id: 'scifi', label: '🚀 خيال علمي' },
  ];
</script>

<div class="chips-container" role="toolbar" aria-label="تصنيفات العرض">
  <div class="chips-scroll">
    {#each categories as cat (cat.id)}
      <button
        type="button"
        class="chip {selected === cat.id ? 'active' : ''}"
        onclick={() => onSelect?.(cat.id)}
      >
        <span>{cat.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .chips-container {
    padding: 12px 22px 4px;
    position: relative;
  }
  .chips-scroll {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 8px;
    scroll-snap-type: x proximity;
  }
  .chip {
    flex: 0 0 auto;
    padding: 8px 18px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
    font-size: 13.5px;
    font-weight: 600;
    transition: all var(--transition-fast);
    scroll-snap-align: start;
    white-space: nowrap;
  }
  .chip:hover {
    background: var(--bg-card);
    color: var(--text);
    border-color: var(--border-hover);
    transform: translateY(-1px);
  }
  .chip.active {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
    box-shadow: 0 4px 16px var(--accent-glow);
  }
  @media (max-width: 600px) {
    .chips-container {
      padding: 8px 16px 2px;
    }
    .chip {
      padding: 7px 14px;
      font-size: 12.5px;
    }
  }
</style>
