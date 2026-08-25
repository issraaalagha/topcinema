<script>
  import Home from './lib/pages/Home.svelte';
  import Watch from './lib/pages/Watch.svelte';
  import PasscodeGate from './lib/components/PasscodeGate.svelte';
  import { getWatchlist, syncFromCloud } from './lib/store.js';
  import { api, getAuthToken } from './lib/api.js';

  let hash = $state(location.hash || '#/');
  let isScrolled = $state(false);
  let watchlistCount = $state(0);
  let isAuthenticated = $state(!!getAuthToken());
  let checkingAuth = $state(true);

  function syncWatchlist() {
    watchlistCount = getWatchlist().length;
  }

  $effect(() => {
    syncWatchlist();
    window.addEventListener('topcinema-store-change', syncWatchlist);
    return () => window.removeEventListener('topcinema-store-change', syncWatchlist);
  });

  $effect(() => {
    // Check auth on load
    api
      .verifyAuth()
      .then((res) => {
        isAuthenticated = !!res.authenticated;
        if (isAuthenticated) syncFromCloud();
      })
      .catch(() => {
        // if offline or error, maintain token state
        isAuthenticated = !!getAuthToken();
      })
      .finally(() => {
        checkingAuth = false;
      });

    const handleUnauthorized = () => {
      isAuthenticated = false;
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

  window.addEventListener('hashchange', () => {
    hash = location.hash || '#/';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const route = $derived.by(() => {
    const watchMatch = hash.match(/^#\/watch\/(.+)/);
    if (watchMatch) return { page: 'watch', id: decodeURIComponent(watchMatch[1].split('?')[0]) };
    if (hash === '#/watchlist') return { page: 'home', tab: 'watchlist' };
    return { page: 'home', tab: 'all' };
  });

  function handleAuthenticated() {
    isAuthenticated = true;
    syncFromCloud();
  }

  async function handleLogout() {
    await api.logout();
    isAuthenticated = false;
  }
</script>

{#if !isAuthenticated && !checkingAuth}
  <!-- Master Passcode Security Gate -->
  <PasscodeGate onAuthenticated={handleAuthenticated} />
{/if}

<header class="topbar {isScrolled ? 'scrolled' : ''}">
  <div class="topbar-inner">
    <a href="#/" class="brand" aria-label="توب سينما الرئيسية">
      <span class="brand-mark">TC</span>
      <span class="brand-name">توب سينما</span>
    </a>

    <nav class="nav-links" aria-label="القائمة الرئيسية">
      <a href="#/" class="nav-link {hash === '#/' ? 'active' : ''}">الرئيسية</a>
      <a href="#/watchlist" class="nav-link {hash === '#/watchlist' ? 'active' : ''}">
        <span>قائمتي</span>
        {#if watchlistCount > 0}
          <span class="count-badge">{watchlistCount}</span>
        {/if}
      </a>
    </nav>

    <div class="header-actions">
      <a href="#/" class="search-nav-btn" title="البحث">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span class="search-nav-text">بحث سريع...</span>
      </a>

      {#if isAuthenticated}
        <button type="button" class="lock-btn" onclick={handleLogout} title="قفل المنصة وتسجيل الخروج" aria-label="قفل المنصة">
          🔒
        </button>
      {/if}
    </div>
  </div>
</header>

<main>
  {#if route.page === 'home'}
    <Home initialTab={route.tab} />
  {:else if route.page === 'watch'}
    <Watch id={route.id} />
  {/if}
</main>

<footer class="app-footer">
  <div class="footer-content">
    <div class="footer-brand">
      <span class="brand-mark sm">TC</span>
      <span class="footer-title">توب سينما — TopCinema</span>
    </div>
    <p class="footer-disclaimer">
      منصة لمشاهدة الأفلام والمسلسلات بجودة عالية وبدون إعلانات مزعجة • محمي بسحابة Cloudflare D1 🛡️
    </p>
    <p class="footer-copy">© 2026 توب سينما. جميع الحقوق محفوظة.</p>
  </div>
</footer>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    width: 100%;
    padding: 14px 24px;
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
  .brand-mark {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-sm);
    background: linear-gradient(135deg, var(--accent), #b20710);
    color: #fff;
    font-weight: 900;
    font-size: 16px;
    display: grid;
    place-items: center;
    box-shadow: 0 4px 14px var(--accent-glow);
  }
  .brand-mark.sm {
    width: 30px;
    height: 30px;
    font-size: 13px;
  }
  .brand-name {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(to right, #fff, var(--text-secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .nav-links {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius-pill);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    transition: all var(--transition-fast);
  }
  .nav-link:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.08);
  }
  .nav-link.active {
    color: #fff;
    background: var(--bg-surface);
    border: 1px solid var(--border-glass);
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
    .topbar {
      padding: 10px 16px;
    }
    .search-nav-text {
      display: none;
    }
    .search-nav-btn {
      padding: 8px;
      border-radius: 50%;
    }
    .brand-name {
      font-size: 17px;
    }
    .nav-link {
      padding: 6px 12px;
      font-size: 13px;
    }
  }
</style>
