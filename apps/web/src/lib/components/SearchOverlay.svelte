<script>
  import { api } from '../api.js';

  let { open = false, onClose } = $props();

  let q = $state('');
  let results = $state(null);
  let loading = $state(false);
  let inputEl = $state(null);
  let timer;

  $effect(() => {
    if (open) {
      q = '';
      results = null;
      setTimeout(() => inputEl?.focus(), 60);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  });

  function onInput() {
    clearTimeout(timer);
    const term = q.trim();
    if (!term) {
      results = null;
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(async () => {
      try {
        const d = await api.catalog(1, '', term);
        results = d.items || [];
      } catch {
        results = [];
      } finally {
        loading = false;
      }
    }, 280);
  }

  function go(id) {
    onClose?.();
    window.history.pushState(null, '', '/watch/' + id);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function onKey(e) {
    if (e.key === 'Escape') onClose?.();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="search-overlay" role="dialog" aria-modal="true" aria-label="البحث السريع">
    <div class="overlay-backdrop" role="presentation" onclick={onClose}></div>

    <div class="panel">
      <div class="panel-head">
        <div class="input-box">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="s-icon">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 14z"/>
          </svg>
          <input
            bind:this={inputEl}
            bind:value={q}
            oninput={onInput}
            type="search"
            placeholder="اكتب اسم فيلم أو مسلسل…"
            autocomplete="off"
          />
          <button type="button" class="close" onclick={onClose} aria-label="إغلاق البحث">✕</button>
        </div>
      </div>

      <div class="results-area">
        {#if loading}
          <p class="hint">جارٍ البحث…</p>
        {:else if !q.trim()}
          <p class="hint">ابدأ بالكتابة للبحث في كل الأفلام والمسلسلات ⚡</p>
        {:else if results?.length === 0}
          <p class="hint">لا توجد نتائج مطابقة لـ "{q}"</p>
        {:else if results?.length}
          <div class="grid">
            {#each results as it (it.id)}
              <button type="button" class="r-card" onclick={() => go(it.id)}>
                <img src={it.poster || '/icons/icon.svg'} alt={it.title} loading="lazy" />
                <span class="r-kind">{it.kind}</span>
                <span class="r-title" title={it.title}>{it.title}</span>
                <span class="r-year">{it.year}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .search-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: clamp(12px, 4vh, 60px) 16px;
  }
  .overlay-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(4, 6, 10, 0.72);
    backdrop-filter: blur(10px);
  }
  .panel {
    position: relative;
    width: 100%;
    max-width: 860px;
    max-height: min(82svh, 780px);
    display: flex;
    flex-direction: column;
    border-radius: 18px;
    background: rgba(16, 18, 24, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8);
    overflow: hidden;
  }
  .panel-head {
    padding: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .input-box {
    position: relative;
    display: flex;
    align-items: center;
  }
  .s-icon {
    position: absolute;
    inset-inline-start: 15px;
    color: var(--text-muted);
    pointer-events: none;
  }
  input {
    width: 100%;
    padding: 14px 48px 14px 46px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: var(--text);
    font-size: 16px; /* prevents iOS zoom */
    font-family: inherit;
    outline: none;
  }
  input:focus {
    border-color: rgba(229, 9, 20, 0.65);
  }
  .close {
    position: absolute;
    inset-inline-end: 12px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 0;
    background: rgba(255, 255, 255, 0.12);
    color: var(--text);
    cursor: pointer;
  }
  .close:hover {
    background: rgba(255, 255, 255, 0.22);
  }
  .results-area {
    overflow-y: auto;
    padding: 16px;
    min-height: 180px;
    overscroll-behavior: contain;
  }
  .hint {
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
    padding: 40px 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
    gap: 14px 10px;
  }
  .r-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font-family: inherit;
    text-align: center;
    cursor: pointer;
    border-radius: 10px;
  }
  .r-card img {
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid var(--border-glass);
    transition: transform 0.25s ease, border-color 0.2s;
  }
  .r-card:hover img {
    transform: translateY(-3px);
    border-color: var(--accent);
  }
  .r-kind {
    align-self: center;
    margin-top: 6px;
    font-size: 10px;
    font-weight: 800;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .r-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .r-year {
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
