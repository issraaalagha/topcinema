<script>
  import { api } from '../api.js';
  import Row from '../components/Row.svelte';

  let rows = $state([]);
  let loading = $state(true);
  let error = $state('');
  let q = $state('');
  let results = $state(null);
  let searchTimer;

  $effect(() => {
    api
      .home()
      .then((d) => (rows = d.rows))
      .catch((e) => (error = e.message))
      .finally(() => (loading = false));
  });

  function onSearch() {
    clearTimeout(searchTimer);
    const term = q.trim();
    if (!term) {
      results = null;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const d = await api.catalog(1, '', term);
        results = d.items;
      } catch {
        results = [];
      }
    }, 350);
  }
</script>

<div class="search-wrap">
  <input
    type="search"
    placeholder="ابحث عن فيلم أو مسلسل…"
    bind:value={q}
    oninput={onSearch}
    autocomplete="off"
  />
</div>

{#if loading}
  <div class="status">جارٍ التحميل…</div>
{:else if error}
  <div class="status error">خطأ: {error}</div>
{:else if results}
  <Row title={'نتائج البحث (' + results.length + ')'} items={results} />
{:else}
  {#each rows as row (row.id)}
    <Row title={row.title} items={row.items} />
  {/each}
{/if}

<style>
  .search-wrap {
    padding: 18px 22px 0;
  }
  input {
    width: 100%;
    padding: 13px 18px;
    border-radius: 13px;
    border: 1px solid #232838;
    background: var(--bg-2);
    color: var(--text);
    font-size: 15px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus {
    border-color: var(--accent);
  }
  .status {
    padding: 60px 22px;
    text-align: center;
    color: var(--text-dim);
  }
  .status.error {
    color: var(--accent-2);
  }
</style>
