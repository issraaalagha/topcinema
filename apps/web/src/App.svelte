<script>
  import Home from './lib/pages/Home.svelte';
  import Watch from './lib/pages/Watch.svelte';
  import Admin from './lib/pages/Admin.svelte';
  import TV from './lib/pages/TV.svelte';
  import Account from './lib/pages/Account.svelte';
  import Browse from './lib/pages/Browse.svelte';
  import Login from './lib/components/Login.svelte';
  import SearchOverlay from './lib/components/SearchOverlay.svelte';
  import { getWatchlist, syncFromCloud } from './lib/store.js';
  import { api, getAuthToken } from './lib/api.js';
  import { category, setCategory } from './lib/category.svelte.js';

  function getCurrentLocation() {
    if (typeof window === 'undefined') return { path: '/', search: '' };

    // Auto upgrade legacy hash urls (e.g., /#/watch/xyz -> /watch/xyz)
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      const cleanPath = window.location.hash.slice(1);
      window.history.replaceState(null, '', cleanPath);
    }

    return {
      path: window.location.pathname || '/',
      search: window.location.search || ''
    };
  }

  let currentLoc = $state(getCurrentLocation());
  let isScrolled = $state(false);
  let watchlistCount = $state(0);
  let isAuthenticated = $state(!!getAuthToken());
  let userRole = $state(localStorage.getItem('tc_role') || 'viewer');
  let username = $state(localStorage.getItem('tc_username') || '');
  let checkingAuth = $state(!!getAuthToken());
  let searchOpen = $state(false);
  let browseOpen = $state(false);
  let moreOpen = $state(false);

  // Netflix-style category navigation (shared state with Home)
  const NAV_CATS = [
    { id: 'movies', label: 'أفلام' },
    { id: 'series', label: 'مسلسلات' },
    { id: 'anime', label: 'أنمي' },
    { id: 'action', label: 'أكشن' },
    { id: 'horror', label: 'رعب' },
  ];
  const NAV_CATS_MORE = [
    { id: 'comedy', label: 'كوميديا' },
    { id: 'drama', label: 'دراما' },
    { id: 'scifi', label: 'خيال علمي' },
  ];
  const ALL_CATS = [{ id: '', label: 'الرئيسية' }, ...NAV_CATS, ...NAV_CATS_MORE];

  function isCatActive(id) {
    return category.value === id && currentLoc.path === '/';
  }

  function pickCategory(id) {
    setCategory(id);
    moreOpen = false;
    browseOpen = false;
    if (currentLoc.path !== '/') navigateTo('/');
  }

  function syncWatchlist() {
    watchlistCount = getWatchlist().length;
  }

  $effect(() => {
    syncWatchlist();
    window.addEventListener('topcinema-store-change', syncWatchlist);
    return () => window.removeEventListener('topcinema-store-change', syncWatchlist);
  });

  $effect(() => {
    // Verify the saved token against the server (also refreshes role/username)
    if (getAuthToken()) {
      api
        .verifyAuth()
        .then((res) => {
          if (res.authenticated) {
            isAuthenticated = true;
            userRole = res.role || 'viewer';
            username = res.username || '';
            localStorage.setItem('tc_role', userRole);
            localStorage.setItem('tc_username', username);
            syncFromCloud();
          } else {
            isAuthenticated = false;
            api.logout();
          }
        })
        .catch(() => {
          isAuthenticated = !!getAuthToken();
        })
        .finally(() => {
          checkingAuth = false;
        });
    } else {
      checkingAuth = false;
    }

    const handleUnauthorized = () => {
      isAuthenticated = false;
      localStorage.removeItem('tc_role');
      localStorage.removeItem('tc_username');
    };
    window.addEventListener('topcinema-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('topcinema-unauthorized', handleUnauthorized);
  });

  $effect(() => {
    const handleScroll = () => {
      isScrolled = window.scrollY > 20;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  });

  function navigateTo(url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.location.href = url;
      return;
    }
    window.history.pushState(null, '', url);
    currentLoc = getCurrentLocation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLinkClick(e) {
    const anchor = e.target.closest('a');
    if (!anchor) return;
    // Cards that open the details modal manage their own click behavior
    if (anchor.hasAttribute('data-modal-link')) return;
    const href = anchor.getAttribute('href');
    if (href && (href.startsWith('/') || href.startsWith('#/'))) {
      e.preventDefault();
      const targetUrl = href.startsWith('#/') ? href.slice(1) : href;
      navigateTo(targetUrl);
    }
  }

  $effect(() => {
    const onPopState = () => {
      currentLoc = getCurrentLocation();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onPopState);
    };
  });

  const route = $derived.by(() => {
    const p = currentLoc.path;
    const watchMatch = p.match(/^\/watch\/(.+)/);
    if (watchMatch) return { page: 'watch', id: decodeURIComponent(watchMatch[1].split('?')[0]) };
    if (p === '/watchlist') return { page: 'home', tab: 'watchlist' };
    if (p === '/admin') return { page: 'admin' };
    if (p === '/tv') return { page: 'tv' };
    if (p === '/account') return { page: 'account' };
    const browseMatch = p.match(/^\/browse\/([a-z-]+)$/);
    if (browseMatch) return { page: 'browse', listId: browseMatch[1] };
    return { page: 'home', tab: 'all' };
  });

  const isAdminRoute = $derived(route.page === 'admin');
  const canAdmin = $derived(userRole === 'owner' || userRole === 'admin');

  function handleAuthenticated(res) {
    isAuthenticated = true;
    if (res?.role) {
      userRole = res.role;
      localStorage.setItem('tc_role', res.role);
    }
    if (res?.username) {
      username = res.username;
      localStorage.setItem('tc_username', res.username);
    }
    syncFromCloud();
  }

  async function handleLogout() {
    await api.logout();
    isAuthenticated = false;
    localStorage.removeItem('tc_role');
    localStorage.removeItem('tc_username');
    if (isAdminRoute) window.history.pushState(null, '', '/');
    currentLoc = getCurrentLocation();
  }
</script>

<svelte:window onclick={handleLinkClick} />

<SearchOverlay open={searchOpen} onClose={() => (searchOpen = false)} />

{#if browseOpen}
  <div class="sheet-overlay" role="dialog" aria-modal="true" aria-label="تصفح التصنيفات">
    <div class="sheet-backdrop" role="presentation" onclick={() => (browseOpen = false)}></div>
    <div class="sheet">
      <div class="sheet-handle"></div>
      <h3 class="sheet-title">تصفح التصنيفات</h3>
      <div class="sheet-list">
        {#each ALL_CATS as c (c.id || 'home')}
          <button
            type="button"
            class="sheet-item"
            class:active={isCatActive(c.id)}
            onclick={() => pickCategory(c.id)}
          >
            <span>{c.label}</span>
            <span class="sheet-arrow">‹</span>
          </button>
        {/each}
        <a href="/watchlist" class="sheet-item" onclick={() => (browseOpen = false)}>
          <span>قائمتي {#if watchlistCount > 0}({watchlistCount}){/if}</span>
          <span class="sheet-arrow">‹</span>
        </a>
      </div>
    </div>
  </div>
{/if}

{#if route.page !== 'tv'}
<header class="topbar {isScrolled ? 'scrolled' : ''}">
  <div class="topbar-inner">
    <a href="/" class="brand" aria-label="FreeWatch الرئيسية">
      <img class="brand-mark-img" src="/icons/logo-mark.png" alt="FreeWatch" width="40" height="40" />
    </a>

    <nav class="nav-links" aria-label="القائمة الرئيسية">
      <a href="/" class="nav-link {currentLoc.path === '/' && !category.value ? 'active' : ''}">الرئيسية</a>

      {#each NAV_CATS as c (c.id)}
        <button
          type="button"
          class="nav-link cat-desktop {isCatActive(c.id) ? 'active' : ''}"
          onclick={() => pickCategory(c.id)}
        >
          {c.label}
        </button>
      {/each}

      <details class="more cat-desktop" bind:open={moreOpen}>
        <summary class="nav-link">المزيد ▾</summary>
        <div class="more-menu">
          {#each NAV_CATS_MORE as c (c.id)}
            <button type="button" class:active={isCatActive(c.id)} onclick={() => pickCategory(c.id)}>
              {c.label}
            </button>
          {/each}
        </div>
      </details>

      <button
        type="button"
        class="nav-link cat-mobile {browseOpen ? 'active' : ''}"
        onclick={() => (browseOpen = !browseOpen)}
      >
        تصفح ▾
      </button>

      <a href="/watchlist" class="nav-link {currentLoc.path === '/watchlist' ? 'active' : ''}">
        <span>قائمتي</span>
        {#if watchlistCount > 0}
          <span class="count-badge">{watchlistCount}</span>
        {/if}
      </a>
    </nav>

    <div class="header-actions">
      {#if isAuthenticated}
        <button
          type="button"
          class="search-nav-btn"
          onclick={() => (searchOpen = true)}
          title="بحث سريع (Esc للإغلاق)"
          aria-label="بحث سريع"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <span class="search-nav-text">بحث سريع...</span>
        </button>
      {/if}

      {#if isAuthenticated}
        <a href="/account" class="account-btn {currentLoc.path === '/account' ? 'active' : ''}" title="حسابي" aria-label="حسابي">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </a>
        {#if canAdmin}
          <a href="/admin" class="admin-btn {isAdminRoute ? 'active' : ''}" title="لوحة التحكم" aria-label="لوحة التحكم">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </a>
        {/if}
        <button type="button" class="lock-btn" onclick={handleLogout} title="قفل المنصة وتسجيل الخروج" aria-label="قفل المنصة">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm3 8.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5 1.5.67 1.5 1.5z"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>
</header>
{/if}

<main>
  {#if !isAuthenticated && route.page !== 'tv'}
    {#if !checkingAuth}
      <Login onAuthenticated={handleAuthenticated} />
    {/if}
  {:else if isAdminRoute}
    {#if canAdmin}
      <Admin role={userRole} {username} />
    {:else}
      <div class="admin-denied">
        <p>🔒 لوحة التحكم متاحة للمشرفين فقط</p>
        <a href="/" class="back-home">العودة للرئيسية</a>
      </div>
    {/if}
  {:else if route.page === 'tv'}
    <TV />
  {:else if route.page === 'account'}
    <Account />
  {:else if route.page === 'browse'}
    <Browse listId={route.listId} />
  {:else if route.page === 'home'}
    <Home initialTab={route.tab} />
  {:else if route.page === 'watch'}
    <Watch id={route.id} />
  {/if}
</main>

{#if isAuthenticated && route.page !== 'tv' && route.page !== 'admin'}
  <nav class="bottom-nav" aria-label="التنقل السريع">
    <a href="/" class="bn-item {currentLoc.path === '/' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg>
      <span>الرئيسية</span>
    </a>
    <button type="button" class="bn-item" class:active={searchOpen} onclick={() => (searchOpen = true)}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 14z"/></svg>
      <span>تصفح</span>
    </button>
    <a href="/watchlist" class="bn-item {currentLoc.path === '/watchlist' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-4.5 7 4.5V5c0-1.1-.9-2-2-2z"/></svg>
      <span>قائمتي</span>
    </a>
    <a href="/account" class="bn-item {currentLoc.path === '/account' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      <span>حسابي</span>
    </a>
  </nav>
{/if}

{#if route.page !== 'tv'}
<footer class="app-footer">
  <div class="footer-content">
    <div class="footer-brand">
      <img class="footer-logo" src="/icons/logo-mark.png" alt="FreeWatch" width="34" height="34" />
      <span class="footer-title">FreeWatch — freewatch.uk</span>
    </div>
    <p class="footer-disclaimer">
      منصة لمشاهدة الأفلام والمسلسلات بجودة عالية وبدون إعلانات مزعجة • محمي بسحابة Cloudflare D1 🛡️
    </p>
    <p class="footer-copy">© 2026 FreeWatch. جميع الحقوق محفوظة.</p>
  </div>
</footer>
{/if}

<style>
  :global(html),
  :global(body) {
    overflow-x: clip; /* kill any accidental horizontal wobble */
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    width: 100%;
    padding: 12px 18px;
    background: transparent;
    transition: background var(--transition-normal), backdrop-filter var(--transition-normal), border-color var(--transition-normal);
    border-bottom: 1px solid transparent;
  }
  .topbar.scrolled {
    background: rgba(3, 7, 18, 0.82);
    backdrop-filter: blur(16px);
    border-bottom-color: var(--border-glass);
    box-shadow: var(--shadow-md);
  }
  .topbar-inner {
    max-width: 1440px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-mark-img {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    transition: transform var(--transition-fast);
  }
  .brand:hover .brand-mark-img {
    transform: scale(1.06);
  }
  .nav-links {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 13px;
    border-radius: var(--radius-sm);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-secondary);
    background: transparent;
    border: 0;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    position: relative;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .nav-link:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.07);
  }
  /* Netflix-style active: white text + red underline bar */
  .nav-link.active {
    color: #fff;
    background: transparent;
    font-weight: 800;
  }
  .nav-link.active::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 12px;
    right: 12px;
    height: 2.5px;
    border-radius: 3px;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
  }
  .more {
    position: relative;
  }
  .more summary {
    list-style: none;
  }
  .more summary::-webkit-details-marker {
    display: none;
  }
  .more-menu {
    position: absolute;
    top: calc(100% + 10px);
    inset-inline-start: 0;
    min-width: 160px;
    background: rgba(16, 18, 24, 0.97);
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    padding: 6px;
    display: flex;
    flex-direction: column;
    z-index: 60;
  }
  .more-menu button {
    padding: 10px 14px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13.5px;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }
  .more-menu button:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
  }
  .more-menu button.active {
    color: var(--accent);
    font-weight: 800;
  }
  .cat-mobile {
    display: none;
  }
  .count-badge {
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    box-shadow: 0 0 6px var(--accent-glow);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .search-nav-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    color: var(--text-muted);
    font-size: 13.5px;
    transition: all var(--transition-fast);
  }
  .search-nav-btn:hover {
    background: var(--bg-card);
    border-color: var(--border-hover);
    color: var(--text);
  }
  .lock-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    color: var(--text);
    display: grid;
    place-items: center;
    cursor: pointer;
    font-size: 15px;
    transition: all var(--transition-fast);
  }
  .lock-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    transform: scale(1.08);
  }
  .account-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    color: var(--text);
    display: grid;
    place-items: center;
    transition: all var(--transition-fast);
  }
  .account-btn:hover,
  .account-btn.active {
    border-color: rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.15);
  }
  /* ── Mobile bottom navigation (Netflix pattern) ── */
  .bottom-nav {
    display: none;
  }

  .admin-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
    display: grid;
    place-items: center;
    font-size: 15px;
    transition: all var(--transition-fast);
  }
  .admin-btn:hover,
  .admin-btn.active {
    border-color: rgba(229, 9, 20, 0.5);
    background: rgba(229, 9, 20, 0.15);
    transform: scale(1.08);
  }
  .admin-denied {
    text-align: center;
    padding: 100px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--text-secondary);
  }
  .back-home {
    padding: 10px 22px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .app-footer {
    margin-top: 60px;
    padding: 40px 24px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border-glass);
  }
  .footer-content {
    max-width: 1440px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
  }
  .footer-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .footer-title {
    font-weight: 700;
    font-size: 16px;
  }
  .footer-disclaimer {
    color: var(--text-muted);
    font-size: 13.5px;
    max-width: 500px;
  }
  .footer-copy {
    color: var(--text-muted);
    font-size: 12px;
    margin-top: 8px;
  }

  @media (max-width: 768px) {
    main {
      padding-bottom: 62px;
    }
    .nav-links {
      display: none;
    }
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 150;
      display: flex;
      justify-content: space-around;
      padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
      background: rgba(10, 12, 17, 0.96);
      backdrop-filter: blur(14px);
      border-top: 1px solid var(--border-glass);
    }
    .bn-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      min-width: 64px;
      min-height: 44px;
      justify-content: center;
      padding: 4px 6px;
      border: 0;
      background: transparent;
      color: var(--text-muted);
      font-size: 10.5px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      font-family: inherit;
    }
    .bn-item.active {
      color: var(--accent);
    }
    .topbar {
      padding: 10px 12px;
    }
    .topbar-inner {
      gap: 9px;
    }
    .brand-mark-img {
      width: 34px;
      height: 34px;
      border-radius: 10px;
    }
    .nav-links {
      gap: 0;
    }
    .nav-link {
      padding: 8px 8px;
      font-size: 12.5px;
    }
    .cat-desktop {
      display: none;
    }
    .cat-mobile {
      display: inline-flex;
    }
    .header-actions {
      gap: 6px;
    }
    .search-nav-btn {
      padding: 8px;
    }
    .search-nav-text {
      display: none;
    }
    .admin-btn,
    .lock-btn {
      width: 34px;
      height: 34px;
    }
  }

  /* ── Mobile browse bottom-sheet ── */
  .sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
  }
  .sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
  }
  .sheet {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 78svh;
    overflow-y: auto;
    background: rgba(16, 18, 24, 0.98);
    border-radius: 22px 22px 0 0;
    border-top: 1px solid var(--border-glass);
    padding: 10px 18px calc(22px + env(safe-area-inset-bottom, 0px));
    animation: sheet-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
    overscroll-behavior: contain;
  }
  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
  .sheet-handle {
    width: 44px;
    height: 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.2);
    margin: 6px auto 14px;
  }
  .sheet-title {
    font-size: 15px;
    font-weight: 800;
    margin-bottom: 10px;
  }
  .sheet-list {
    display: flex;
    flex-direction: column;
  }
  .sheet-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 10px;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: transparent;
    color: var(--text-secondary);
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .sheet-item:hover,
  .sheet-item.active {
    color: var(--text);
  }
  .sheet-item.active {
    color: var(--accent);
    font-weight: 800;
  }
  .sheet-arrow {
    color: var(--text-muted);
    font-size: 18px;
  }
</style>
