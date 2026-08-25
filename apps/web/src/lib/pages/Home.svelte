<script>
  import { api } from '../api.js';
  import { getContinueWatching, getWatchlist, syncFromCloud } from '../store.js';
  import Hero from '../components/Hero.svelte';
  import Row from '../components/Row.svelte';
  import CategoryChips from '../components/CategoryChips.svelte';
  import SkeletonHero from '../components/SkeletonHero.svelte';
  import SkeletonRow from '../components/SkeletonRow.svelte';

  let { initialTab = 'all' } = $props();

  let rows = $state([]);
  let recommendations = $state(null);
  let heroItem = $state(null);
  let loading = $state(true);
  let error = $state('');
  let q = $state('');
  let results = $state(null);
  let selectedCategory = $state('');
  let watchlistCategory = $state('all');
  let searchTimer;
  let continueWatching = $state([]);
  let watchlist = $state([]);

  function syncLocalData() {
    continueWatching = getContinueWatching();
    watchlist = getWatchlist(watchlistCategory);
  }

  $effect(() => {
    syncLocalData();
    syncFromCloud();
    window.addEventListener('topcinema-store-change', syncLocalData);
    return () => window.removeEventListener('topcinema-store-change', syncLocalData);
  });

  function loadRecommendations() {
    api
      .getRecommendations()
      .then((d) => {
        if (d.items?.length) recommendations = d;
      })
      .catch(() => {});
  }

  function loadHomeData(category = '') {
    loading = true;
    error = '';

    if (category) {
      api
        .catalog(1, category, '')
        .then((d) => {
          rows = [{ id: category, title: 'التصنيف المختار', items: d.items || [] }];
          heroItem = d.items?.[0] || null;
        })
        .catch((e) => (error = e.message))
        .finally(() => (loading = false));
    } else {
      api
        .home()
        .then((d) => {
          rows = d.rows || [];
          const firstRow = d.rows?.[0];
          heroItem = firstRow?.items?.[0] || null;
        })
        .catch((e) => (error = e.message))
        .finally(() => (loading = false));

      loadRecommendations();
    }
  }

  $effect(() => {
    loadHomeData(selectedCategory);
  });

  function handleCategorySelect(catId) {
    selectedCategory = catId;
    q = '';
    results = null;
  }

  function handleWatchlistFilter(type) {
    watchlistCategory = type;
    watchlist = getWatchlist(type);
  }

  function onSearch() {
    clearTimeout(searchTimer);
    const term = q.trim();
    if (!term) {
      results = null;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const d = await api.catalog(1, selectedCategory, term);
        results = d.items || [];
      } catch {
        results = [];
      }
    }, 300);
  }

  function clearSearch() {
    q = '';
    results = null;
  }
</script>

<!-- Search Bar & Filters -->
<div class="home-toolbar">
  <div class="search-wrap">
    <div class="search-input-box">
      <svg class="search-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
      <input
        type="search"
        placeholder="ابحث عن فيلم، مسلسل، ممثل، أو تصنيف…"
        bind:value={q}
        oninput={onSearch}
        autocomplete="off"
      />
      {#if q}
        <button type="button" class="clear-btn" onclick={clearSearch} aria-label="مسح البحث">✕</button>
      {/if}
    </div>
  </div>

  {#if !results && initialTab !== 'watchlist'}
    <CategoryChips selected={selectedCategory} onSelect={handleCategorySelect} />
  {/if}
</div>

{#if initialTab === 'watchlist'}
  <!-- Watchlist View with Categorized Filter -->
  <section class="watchlist-section">
    <div class="watchlist-header">
      <h1 class="page-heading">قائمتي السحابية 🔖</h1>
      <div class="watchlist-filters">
        <button
          type="button"
          class="w-filter {watchlistCategory === 'all' ? 'active' : ''}"
          onclick={() => handleWatchlistFilter('all')}
        >
          🌟 الكل
        </button>
        <button
          type="button"
          class="w-filter {watchlistCategory === 'movie' ? 'active' : ''}"
          onclick={() => handleWatchlistFilter('movie')}
        >
          🎬 أفلام
        </button>
        <button
          type="button"
          class="w-filter {watchlistCategory === 'series' ? 'active' : ''}"
          onclick={() => handleWatchlistFilter('series')}
        >
          📺 مسلسلات
        </button>
        <button
          type="button"
          class="w-filter {watchlistCategory === 'anime' ? 'active' : ''}"
          onclick={() => handleWatchlistFilter('anime')}
        >
          ⚡ أنمي
        </button>
      </div>
    </div>

    {#if watchlist.length === 0}
      <div class="empty-state">
        <span class="empty-icon">🍿</span>
        <h3>لا توجد أعمال في هذا التصنيف بعد</h3>
        <p>استكشف أحدث الأفلام والمسلسلات واضغط على "أضف لقائمتي" لمزامنتها سحابياً والوصول إليها عبر كل أجهزتك.</p>
        <a href="/" class="btn-explore">استكشف الأفلام والمسلسلات</a>
      </div>
    {:else}
      <Row title={`الأعمال المحفوظة (${watchlist.length})`} items={watchlist} />
    {/if}
  </section>
{:else if loading}
  <!-- Shimmer Skeleton Loaders -->
  <SkeletonHero />
  <SkeletonRow />
  <SkeletonRow />
{:else if error}
  <!-- Error State with retry -->
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <h3>تعذر تحميل المحتوى</h3>
    <p>{error}</p>
    <button type="button" class="retry-btn" onclick={() => loadHomeData(selectedCategory)}>
      إعادة المحاولة
    </button>
  </div>
{:else if results}
  <!-- Search Results Grid / Row -->
  <section class="results-section">
    <Row title={`نتائج البحث عن "${q}" (${results.length})`} items={results} />
    {#if results.length === 0}
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <h3>لا توجد نتائج مطابقة</h3>
        <p>جرّب البحث بكلمات مختلفة أو تصفح الأقسام والتصنيفات الأخرى.</p>
      </div>
    {/if}
  </section>
{:else}
  <!-- Hero Spotlight -->
  {#if heroItem && !selectedCategory}
    <Hero item={heroItem} />
  {/if}

  <!-- Continue Watching Section -->
  {#if continueWatching.length > 0}
    <Row
      title="متابعة المشاهدة ⏱️"
      items={continueWatching}
      isContinueWatching={true}
    />
  {/if}

  <!-- Personalized AI Recommendations Row -->
  {#if recommendations?.items?.length && !selectedCategory}
    <Row title={recommendations.title} items={recommendations.items} />
  {/if}

  <!-- Categorized Rows -->
  {#each rows as row, idx (`${row.id || ''}_${idx}`)}
    <Row title={row.title} items={row.items} />
  {/each}
{/if}

<style>
  .home-toolbar {
    max-width: 1440px;
    margin: 0 auto;
    padding: 10px 0;
  }
  .search-wrap {
    padding: 8px 22px;
  }
  .search-input-box {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
  }
  .search-icon {
    position: absolute;
    inset-inline-start: 16px;
    color: var(--text-muted);
    pointer-events: none;
  }
  input {
    width: 100%;
    padding: 14px 46px 14px 44px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-glass);
    background: var(--bg-surface);
    color: var(--text);
    font-size: 15px;
    font-family: inherit;
    outline: none;
    transition: all var(--transition-fast);
    box-shadow: var(--shadow-sm);
  }
  input:focus {
    border-color: var(--accent);
    background: var(--bg-card);
    box-shadow: 0 0 0 3px var(--accent-surface);
  }
  .clear-btn {
    position: absolute;
    inset-inline-end: 14px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    color: var(--text);
    font-size: 12px;
    display: grid;
    place-items: center;
  }
  .clear-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }
  .watchlist-header {
    max-width: 1440px;
    margin: 0 auto;
    padding: 16px 22px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .page-heading {
    font-size: 24px;
    font-weight: 800;
  }
  .watchlist-filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .w-filter {
    padding: 7px 16px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .w-filter:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
  }
  .w-filter.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    box-shadow: 0 4px 14px var(--accent-glow);
  }
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .empty-icon {
    font-size: 48px;
    margin-bottom: 4px;
  }
  .empty-state h3 {
    font-size: 18px;
    font-weight: 700;
  }
  .empty-state p {
    color: var(--text-muted);
    font-size: 14px;
    max-width: 440px;
    line-height: 1.6;
  }
  .btn-explore {
    margin-top: 10px;
    padding: 10px 22px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    box-shadow: 0 4px 16px var(--accent-glow);
  }
  .error-container {
    text-align: center;
    padding: 70px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .error-icon {
    font-size: 42px;
  }
  .error-container h3 {
    font-size: 19px;
    font-weight: 700;
  }
  .error-container p {
    color: #ff4d57;
    font-size: 14px;
  }
  .retry-btn {
    margin-top: 8px;
    padding: 10px 24px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    color: var(--text);
    font-weight: 600;
    transition: all var(--transition-fast);
  }
  .retry-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  @media (max-width: 768px) {
    .search-wrap {
      padding: 6px 16px;
    }
    input {
      padding: 12px 40px 12px 40px;
      font-size: 14px;
    }
    .watchlist-header {
      padding: 10px 16px;
    }
  }
</style>
