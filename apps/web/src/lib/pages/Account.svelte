<script>
  import { api, myProfile } from '../api.js';

  let tab = $state('favorites');
  let favorites = $state([]);
  let history = $state([]);
  let loading = $state(true);
  let message = $state('');
  const username = myProfile();

  function flash(msg) {
    message = msg;
    setTimeout(() => (message = ''), 2200);
  }

  async function load() {
    loading = true;
    try {
      const [f, h] = await Promise.all([api.getFavorites(), api.getHistory()]);
      favorites = f.items || [];
      history = h.items || [];
    } catch {
      favorites = [];
      history = [];
    } finally {
      loading = false;
    }
  }

  load();

  async function removeFavorite(id) {
    await api.removeFavorite(id).catch(() => {});
    favorites = favorites.filter((f) => f.id !== id && f.item_id !== id);
    flash('تمت الإزالة من المفضلة');
  }

  async function removeHistory(id) {
    await api.clearHistory(id).catch(() => {});
    history = history.filter((h) => h.id !== id);
    flash('تم الحذف من السجل');
  }

  async function clearAllHistory() {
    if (!confirm('مسح سجل المشاهدة بالكامل؟')) return;
    await api.clearHistory().catch(() => {});
    history = [];
    flash('تم مسح السجل بالكامل');
  }

  async function clearAllFavorites() {
    if (!confirm('مسح كل المفضلة؟')) return;
    await api.clearFavorites().catch(() => {});
    favorites = [];
    flash('تم مسح المفضلة بالكامل');
  }
</script>

<div class="account-page">
  <header class="account-topbar">
    <a href="/" class="back-link">← عودة للموقع</a>
    <h1>حسابي</h1>
    <span class="user-chip">👤 {username}</span>
  </header>

  {#if message}
    <div class="toast">{message}</div>
  {/if}

  <div class="tabs">
    <button type="button" class="tab" class:active={tab === 'favorites'} onclick={() => (tab = 'favorites')}>
      المفضلة ({favorites.length})
    </button>
    <button type="button" class="tab" class:active={tab === 'history'} onclick={() => (tab = 'history')}>
      سجل المشاهدة ({history.length})
    </button>
  </div>

  {#if loading}
    <p class="loading">جارٍ التحميل…</p>
  {:else if tab === 'favorites'}
    <div class="list-actions">
      {#if favorites.length}
        <button type="button" class="mini danger" onclick={clearAllFavorites}>مسح كل المفضلة</button>
      {/if}
    </div>
    {#if favorites.length === 0}
      <p class="empty">لا توجد عناصر في المفضلة بعد</p>
    {:else}
      <div class="grid">
        {#each favorites as f (f.item_id || f.id)}
          <div class="fav-card">
            <a href={'/watch/' + (f.item_id || f.id)}>
              <img src={f.poster || '/icons/icon.svg'} alt={f.title} loading="lazy" />
              <span class="f-title">{f.title}</span>
            </a>
            <button type="button" class="mini danger" onclick={() => removeFavorite(f.item_id || f.id)}>
              إزالة
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="list-actions">
      {#if history.length}
        <button type="button" class="mini danger" onclick={clearAllHistory}>مسح كل السجل</button>
      {/if}
    </div>
    {#if history.length === 0}
      <p class="empty">سجل المشاهدة فارغ</p>
    {:else}
      <div class="history-list">
        {#each history as h (h.id)}
          <div class="history-row">
            <img src={h.poster || '/icons/icon.svg'} alt={h.title} loading="lazy" />
            <div class="h-info">
              <a href={'/watch/' + h.id} class="h-title">{h.title}</a>
              <div class="h-progress">
                <div class="h-bar"><div class="h-fill" style={'width:' + (h.percent || 0) + '%'}></div></div>
                <span class="h-meta">
                  {Math.floor((h.currentTime || 0) / 60)} دقيقة • {h.percent || 0}%
                </span>
              </div>
            </div>
            <button type="button" class="mini danger" onclick={() => removeHistory(h.id)}>حذف</button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .account-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 20px 60px;
  }
  .account-topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
  }
  .account-topbar h1 {
    font-size: 22px;
    font-weight: 800;
    flex: 1;
  }
  .back-link {
    color: var(--text-secondary);
    font-size: 13.5px;
    padding: 8px 14px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
  }
  .user-chip {
    padding: 6px 14px;
    border-radius: var(--radius-pill);
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.4);
    font-size: 12.5px;
    font-weight: 700;
  }
  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }
  .tab {
    padding: 9px 20px;
    border-radius: var(--radius-pill);
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    color: var(--text-secondary);
    font-weight: 700;
    font-size: 13.5px;
    cursor: pointer;
  }
  .tab.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .toast {
    padding: 11px 16px;
    border-radius: var(--radius-sm);
    margin-bottom: 14px;
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #34d399;
    font-size: 13.5px;
    font-weight: 600;
  }
  .loading,
  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 50px 0;
  }
  .list-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 12px;
  }
  .mini {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-glass);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
  }
  .mini:hover {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .mini.danger {
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px 12px;
  }
  .fav-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: center;
  }
  .fav-card img {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-glass);
  }
  .fav-card a:hover img {
    border-color: var(--border-hover);
  }
  .f-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fav-card .mini {
    align-self: center;
  }
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .history-row {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 12px 14px;
  }
  .history-row img {
    width: 60px;
    height: 84px;
    object-fit: cover;
    border-radius: 8px;
  }
  .h-info {
    flex: 1;
    min-width: 0;
  }
  .h-title {
    display: block;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .h-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 5px;
  }
  .h-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
  }
  .h-meta {
    font-size: 11.5px;
    color: var(--text-muted);
  }
</style>
