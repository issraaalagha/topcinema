<script>
  import { api } from '../api.js';

  let { role = 'admin' } = $props();

  let tab = $state('users');
  let users = $state([]);
  let stats = $state(null);
  let loading = $state(true);
  let message = $state('');
  let error = $state('');

  // create form
  let newUsername = $state('');
  let newPassword = $state('');
  let newRole = $state('viewer');
  let creating = $state(false);

  // reset password modal state
  let resetTarget = $state(null);
  let resetPass = $state('');
  let contentTab = $state('users');
  let contentUser = $state('');
  let contentData = $state(null);
  let contentLoading = $state(false);

  const isOwner = $derived(role === 'owner');

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [u, s] = await Promise.all([api.listUsers(), api.getStats().catch(() => null)]);
      users = u.users || [];
      stats = s?.stats || null;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function loadContent() {
    if (!contentUser) return;
    contentLoading = true;
    try {
      contentData = await api.adminContent(contentUser);
    } catch (e) {
      error = e.message;
    } finally {
      contentLoading = false;
    }
  }

  async function adminRemove(kind, id) {
    try {
      const r = await api.adminDeleteContent(contentUser, kind, id);
      if (r.ok) {
        flash('🗑️ ' + r.message);
        await loadContent();
      } else error = r.error;
    } catch (e) {
      error = e.message;
    }
  }

  loadAll();

  function flash(msg) {
    message = msg;
    setTimeout(() => (message = ''), 2500);
  }

  async function handleCreate(e) {
    if (e) e.preventDefault();
    if (creating) return;
    creating = true;
    error = '';
    try {
      const r = await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      if (r.ok) {
        flash(`✅ تم إنشاء الحساب ${r.username}`);
        newUsername = '';
        newPassword = '';
        newRole = 'viewer';
        await loadAll();
      } else {
        error = r.error || 'فشل الإنشاء';
      }
    } catch (e2) {
      error = e2.message;
    } finally {
      creating = false;
    }
  }

  async function toggleActive(u) {
    try {
      const r = await api.updateUser({ id: u.id, active: u.active ? 0 : 1 });
      if (r.ok) {
        flash(u.active ? `⛔ تم تعطيل ${u.username}` : `✅ تم تفعيل ${u.username}`);
        await loadAll();
      } else error = r.error;
    } catch (e) {
      error = e.message;
    }
  }

  async function handleDelete(u) {
    if (!confirm(`حذف الحساب "${u.username}" نهائياً؟`)) return;
    try {
      const r = await api.deleteUser(u.id);
      if (r.ok) {
        flash(`🗑️ تم حذف ${u.username}`);
        await loadAll();
      } else error = r.error;
    } catch (e) {
      error = e.message;
    }
  }

  async function handleReset(e) {
    if (e) e.preventDefault();
    if (!resetPass || resetPass.length < 6) {
      error = 'كلمة المرور: 6 أحرف على الأقل';
      return;
    }
    try {
      const r = await api.updateUser({ id: resetTarget.id, password: resetPass });
      if (r.ok) {
        flash(`🔑 تم تغيير كلمة مرور ${resetTarget.username}`);
        resetTarget = null;
        resetPass = '';
      } else error = r.error;
    } catch (e) {
      error = e.message;
    }
  }

  function roleLabel(r) {
    return r === 'owner' ? '👑 المالك' : r === 'admin' ? '🛡️ مشرف' : '👤 زائر';
  }
</script>

<div class="admin-page">
  <header class="admin-topbar">
    <a href="#/" class="back-link">← عودة للموقع</a>
    <h1>لوحة التحكم</h1>
    <span class="role-chip">{roleLabel(role)}</span>
  </header>

  <div class="tabs">
    <button type="button" class="tab" class:active={tab === 'users'} onclick={() => (tab = 'users')}>
      المستخدمون
    </button>
    <button type="button" class="tab" class:active={tab === 'stats'} onclick={() => (tab = 'stats')}>
      إحصائيات
    </button>
    <button type="button" class="tab" class:active={tab === 'content'} onclick={() => (tab = 'content')}>
      إدارة المحتوى
    </button>
  </div>

  {#if message}
    <div class="toast ok">{message}</div>
  {/if}
  {#if error}
    <div class="toast err">⚠️ {error}</div>
  {/if}

  {#if loading}
    <div class="loading">جارٍ التحميل…</div>
  {:else if tab === 'users'}
    <form class="create-card" onsubmit={handleCreate}>
      <h3>➕ إنشاء حساب جديد</h3>
      <div class="create-row">
        <input type="text" placeholder="اسم المستخدم (لاتيني)" bind:value={newUsername} />
        <input type="password" placeholder="كلمة المرور" bind:value={newPassword} />
        <select bind:value={newRole}>
          <option value="viewer">زائر</option>
          {#if isOwner}
            <option value="admin">مشرف</option>
          {/if}
        </select>
        <button type="submit" disabled={creating}>
          {creating ? '...' : 'إنشاء'}
        </button>
      </div>
    </form>

    <div class="users-table-wrap">
      <table class="users-table">
        <thead>
          <tr>
            <th>المستخدم</th>
            <th>الدور</th>
            <th>الحالة</th>
            <th>سجل المشاهدة</th>
            <th>أُنشئ في</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {#each users as u (u.id)}
            <tr class:inactive={!u.active}>
              <td class="username">{u.username}</td>
              <td>{roleLabel(u.role)}</td>
              <td>
                <span class="status" class:on={u.active}>{u.active ? 'نشط' : 'معطّل'}</span>
              </td>
              <td>{u.history_count ?? 0}</td>
              <td class="date">{(u.created_at || '').slice(0, 10)}</td>
              <td class="actions">
                {#if u.username !== 'owner'}
                  <button type="button" class="act" onclick={() => toggleActive(u)}>
                    {u.active ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button type="button" class="act" onclick={() => { resetTarget = u; resetPass = ''; }}>
                    كلمة المرور
                  </button>
                  {#if u.role !== 'owner'}
                    <button type="button" class="act danger" onclick={() => handleDelete(u)}>
                      حذف
                    </button>
                  {/if}
                {:else}
                  <span class="muted">حساب النظام</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if resetTarget}
      <div class="modal-overlay" role="presentation" onclick={() => (resetTarget = null)}>
        <form class="modal" role="dialog" onclick={(e) => e.stopPropagation()} onsubmit={handleReset}>
          <h3>🔑 تغيير كلمة مرور: {resetTarget.username}</h3>
          <input type="password" placeholder="كلمة المرور الجديدة" bind:value={resetPass} />
          <div class="modal-actions">
            <button type="button" class="act" onclick={() => (resetTarget = null)}>إلغاء</button>
            <button type="submit" class="act primary">حفظ</button>
          </div>
        </form>
      </div>
    {/if}
  {:else if tab === 'content'}
    <div class="create-card">
      <h3>🗂️ إدارة مفضلة وسجل المستخدمين</h3>
      <div class="create-row">
        <select bind:value={contentUser} onchange={() => { contentData = null; if (contentUser) loadContent(); }}>
          <option value="" disabled selected>اختر مستخدماً…</option>
          {#each users as u (u.id)}
            <option value={u.username}>{u.username} {u.active ? '' : '(معطل)'}</option>
          {/each}
        </select>
      </div>

      {#if contentLoading}
        <p class="loading">جارٍ التحميل…</p>
      {:else if contentData}
        {#if contentData.favorites?.length}
          <h4>المفضلة ({contentData.favorites.length}) <button type="button" class="mini danger" onclick={() => adminRemove('favorites', '')}>مسح الكل</button></h4>
          <div class="c-list">
            {#each contentData.favorites as f (f.item_id)}
              <div class="c-row">
                <span class="c-title">{f.title}</span>
                <button type="button" class="mini danger" onclick={() => adminRemove('favorites', f.item_id)}>حذف</button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="c-empty">لا مفضلة لهذا المستخدم</p>
        {/if}

        {#if contentData.history?.length}
          <h4>سجل المشاهدة ({contentData.history.length}) <button type="button" class="mini danger" onclick={() => adminRemove('history', '')}>مسح الكل</button></h4>
          <div class="c-list">
            {#each contentData.history as h (h.item_id)}
              <div class="c-row">
                <span class="c-title">{h.title}</span>
                <span class="c-pct">{h.percent || 0}%</span>
                <button type="button" class="mini danger" onclick={() => adminRemove('history', h.item_id)}>حذف</button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="c-empty">لا سجل مشاهدة لهذا المستخدم</p>
        {/if}
      {:else}
        <p class="c-empty">اختر مستخدماً لعرض محتواه</p>
      {/if}
    </div>
  {:else if tab === 'stats'}
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-num">{stats?.users ?? '—'}</span>
        <span class="stat-label">إجمالي الحسابات</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{stats?.activeUsers ?? '—'}</span>
        <span class="stat-label">حسابات نشطة</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{stats?.historyCount ?? '—'}</span>
        <span class="stat-label">عناصر سجل المشاهدة</span>
      </div>
      <div class="stat-card">
        <span class="stat-num">{stats?.favoritesCount ?? '—'}</span>
        <span class="stat-label">عناصر المفضلة</span>
      </div>
    </div>

    {#if stats?.topWatched?.length}
      <div class="top-card">
        <h3>🔥 الأكثر مشاهدة</h3>
        {#each stats.topWatched as t (t.item_id)}
          <div class="top-row">
            <span class="top-title">{t.title}</span>
            <span class="top-views">{t.views} مشاهدة</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .admin-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 20px 60px;
  }
  .admin-topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 22px;
  }
  .admin-topbar h1 {
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
  .back-link:hover { color: var(--text); }
  .role-chip {
    padding: 6px 14px;
    border-radius: var(--radius-pill);
    background: rgba(229, 9, 20, 0.15);
    border: 1px solid rgba(229, 9, 20, 0.4);
    font-size: 12.5px;
    font-weight: 700;
  }
  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }
  .tab {
    padding: 9px 22px;
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
    font-size: 13.5px;
    font-weight: 600;
  }
  .toast.ok {
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #34d399;
  }
  .toast.err {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
  }
  .loading {
    text-align: center;
    padding: 60px 0;
    color: var(--text-muted);
  }
  .create-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 18px 20px;
    margin-bottom: 20px;
  }
  .create-card h3 {
    font-size: 14.5px;
    margin-bottom: 12px;
  }
  .create-row {
    display: grid;
    grid-template-columns: 1.2fr 1.2fr 0.8fr auto;
    gap: 10px;
  }
  .create-row input,
  .create-row select {
    padding: 11px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-glass);
    background: var(--bg-card);
    color: var(--text);
    font-size: 13.5px;
    outline: none;
  }
  .create-row input:focus,
  .create-row select:focus {
    border-color: rgba(229, 9, 20, 0.6);
  }
  .create-row button {
    padding: 11px 22px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: #fff;
    font-weight: 800;
    cursor: pointer;
  }
  .users-table-wrap {
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }
  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
    min-width: 640px;
  }
  .users-table th {
    text-align: right;
    padding: 13px 16px;
    color: var(--text-muted);
    font-size: 12px;
    border-bottom: 1px solid var(--border-glass);
  }
  .users-table td {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  tr.inactive td { opacity: 0.45; }
  .username { font-weight: 700; }
  .status {
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    font-size: 11.5px;
    font-weight: 700;
    background: rgba(239, 68, 68, 0.14);
    color: #f87171;
  }
  .status.on {
    background: rgba(16, 185, 129, 0.14);
    color: #34d399;
  }
  .date { color: var(--text-muted); font-size: 12px; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .act {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-glass);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
  }
  .act:hover { color: var(--text); border-color: var(--border-hover); }
  .act.danger {
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }
  .act.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 700;
  }
  .muted { color: var(--text-muted); font-size: 12px; }

  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.65);
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .modal {
    width: 100%;
    max-width: 380px;
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 22px;
  }
  .modal h3 { font-size: 15px; margin-bottom: 14px; }
  .modal input {
    width: 100%;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-glass);
    background: var(--bg-card);
    color: var(--text);
    margin-bottom: 14px;
  }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

  .c-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }
  .c-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
  }
  .c-title {
    flex: 1;
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .c-pct {
    color: var(--text-muted);
    font-size: 12px;
  }
  .c-empty {
    color: var(--text-muted);
    font-size: 13.5px;
    padding: 8px 0 16px;
  }
  .create-card h4 {
    font-size: 13.5px;
    margin: 14px 0 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 22px;
  }
  .stat-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 22px;
    text-align: center;
  }
  .stat-num {
    display: block;
    font-size: 34px;
    font-weight: 900;
    background: linear-gradient(to top, #fff, #e50914);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .stat-label {
    color: var(--text-muted);
    font-size: 12.5px;
    font-weight: 600;
  }
  .top-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-md);
    padding: 18px 20px;
  }
  .top-card h3 { font-size: 14.5px; margin-bottom: 12px; }
  .top-row {
    display: flex;
    justify-content: space-between;
    padding: 9px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 13.5px;
  }
  .top-row:last-child { border: 0; }
  .top-views { color: var(--text-muted); font-size: 12.5px; }

  @media (max-width: 720px) {
    .create-row { grid-template-columns: 1fr; }
  }
</style>
