<script>
  import Home from './lib/pages/Home.svelte';
  import Watch from './lib/pages/Watch.svelte';

  let hash = $state(location.hash || '#/');
  window.addEventListener('hashchange', () => {
    hash = location.hash || '#/';
    window.scrollTo({ top: 0 });
  });

  const route = $derived.by(() => {
    const m = hash.match(/^#\/watch\/(\d+)/);
    if (m) return { page: 'watch', id: +m[1] };
    return { page: 'home' };
  });
</script>

<header class="topbar">
  <a href="#/" class="brand">
    <span class="brand-mark">TC</span>
    <span class="brand-name">توب سينما</span>
  </a>
</header>

<main>
  {#if route.page === 'home'}
    <Home />
  {:else}
    <Watch id={route.id} />
  {/if}
</main>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 22px;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid #1d2230;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    background: linear-gradient(135deg, var(--accent), #8b0000);
    font-weight: 800;
    font-size: 15px;
    color: #fff;
  }
  .brand-name {
    font-weight: 700;
    font-size: 19px;
  }
</style>
