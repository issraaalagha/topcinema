<script>
  import { api } from '../api.js';
  import Row from '../components/Row.svelte';

  let { listId } = $props();

  let items = $state([]);
  let title = $state('');
  let page = $state(0);
  let totalPages = $state(1);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state('');

  $effect(() => {
    listId;
    reset();
  });

  function reset() {
    items = [];
    page = 0;
    totalPages = 1;
    error = '';
    load();
  }

  async function load() {
    const next = page + 1;
    loading = true;
    try {
      const d = await api.browseList(listId, next);
      title = d.title || title;
      totalPages = d.total_pages || 1;
      items = [...items, ...(d.items || [])];
      page = next;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function loadMore() {
    if (loadingMore || page >= totalPages) return;
    loadingMore = true;
    load();
  }
</script>

<div class="browse-page">
  <header class="browse-topbar">
    <a href="/" class="back-link">← عودة للرئيسية</a>
    <h1>{title || '…'}</h1>
  </header>

  {#if error}
    <p class="browse-error">⚠️ {error}</p>
    <button type="button" class="retry" onclick={() => reset()}>إعادة المحاولة</button>
  {:else}
    <Row title="" items={items} variant="grid" />

    {#if loading && items.length === 0}
      <p class="loading">جارٍ التحميل…</p>
    {:else if page < totalPages}
      <div class="more-wrap">
        <button type="button" class="load-more" disabled={loadingMore} onclick={loadMore}>
          {loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'}
        </button>
      </div>
    {:else if items.length}
      <p class="end-note">وصلت إلى النهاية — {items.length} عمل</p>
    {/if}
  {/if}
</div>

<style>
  .browse-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 20px 0 60px;
    min-height: 70vh;
  }
  .browse-topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 22px 4px;
  }
  .back-link {
    color: var(--text-secondary);
    font-size: 13px;
    padding: 8px 14px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    white-space: nowrap;
  }
  .browse-topbar h1 {
    font-size: 21px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .browse-error {
    color: #ff6b74;
    text-align: center;
    padding: 40px 20px 10px;
  }
  .retry {
    display: block;
    margin: 0 auto;
    padding: 10px 24px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-glass);
    background: var(--bg-surface);
    color: var(--text);
    cursor: pointer;
  }
  .loading,
  .end-note {
    text-align: center;
    color: var(--text-muted);
    padding: 24px 0;
    font-size: 13.5px;
  }
  .more-wrap {
    text-align: center;
    padding: 18px 0 10px;
  }
  .load-more {
    padding: 12px 34px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-glass);
    background: var(--bg-surface);
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .load-more:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .load-more:disabled {
    opacity: 0.6;
    cursor: wait;
  }
</style>
