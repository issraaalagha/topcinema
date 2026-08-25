<script>
  import { api } from '../api.js';
  import Player from '../player/Player.svelte';

  let { id } = $props();

  let data = $state(null);
  let error = $state('');
  let selectedServer = $state(null);
  let stream = $state(null);
  let resolving = $state(false);
  let resolveError = $state('');

  $effect(() => {
    api
      .post(id)
      .then((d) => {
        data = d;
        const preferred = d.servers?.find((s) => /streamwish|filelions/i.test(s.name)) || d.servers?.[0];
        if (preferred) pick(preferred);
      })
      .catch((e) => (error = e.message));
  });

  async function pick(srv) {
    selectedServer = srv;
    stream = null;
    resolveError = '';
    resolving = true;
    try {
      const r = await api.resolve(id, srv.server);
      if (r.ok) stream = r;
      else resolveError = 'هذا السيرفر يحتاج بروكسي (غير مدعوم في النسخة التجريبية) — اختر StreamWish أو Filelions';
    } catch (e) {
      resolveError = 'فشل حل الرابط: ' + e.message;
    } finally {
      resolving = false;
    }
  }
</script>

{#if error}
  <div class="status error">{error}</div>
{:else if !data}
  <div class="status">
    <div class="loader"></div>
    <p style="margin-top: 16px;">جارٍ التحميل…</p>
  </div>
{:else}
  <div class="watch">
    <div class="player-col">
      {#if resolving}
        <div class="player-shell status">
          <div class="loader small"></div>
          <p style="margin-top: 12px;">جارٍ تحليل الرابط من السيرفر… ⚡</p>
        </div>
      {:else if stream}
        <Player src={stream.url} title={data.post.title} poster={data.post.poster} />
      {:else}
        <div class="player-shell status">{resolveError || 'اختر سيرفرًا للمشاهدة'}</div>
      {/if}

      <div class="servers">
        <h3>سيرفرات المشاهدة</h3>
        <div class="server-list">
          {#each data.servers as srv (srv.server)}
            <button
              class="srv"
              class:active={selectedServer?.server === srv.server}
              onclick={() => pick(srv)}
            >
              {srv.name}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="info-col">
      <img class="poster" src={data.post.poster || '/icons/icon.svg'} alt={data.post.title} />
      <h1>{data.post.title}</h1>
      <div class="badges">
        {#if data.post.quality}<span class="badge">{data.post.quality}</span>{/if}
        {#if data.post.year}<span class="badge">{data.post.year}</span>{/if}
        {#if data.post.duration}<span class="badge">{data.post.duration} دقيقة</span>{/if}
        {#if data.post.language}<span class="badge">{data.post.language}</span>{/if}
      </div>
      {#if data.post.genres?.length}
        <p class="genres">{data.post.genres.join(' • ')}</p>
      {/if}
      {#if data.post.story}
        <p class="story">{data.post.story}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .status {
    display: grid;
    place-items: center;
    min-height: 300px;
    color: var(--text-dim);
    background: var(--bg-2);
    border-radius: var(--radius);
  }
  .status.error {
    color: var(--accent-2);
  }
  .loader {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(229, 9, 20, 0.2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .loader.small {
    width: 36px;
    height: 36px;
    border-width: 3px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .watch {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 22px;
    padding: 20px 22px;
    align-items: start;
  }
  .player-shell {
    aspect-ratio: 16/9;
    min-height: 300px;
  }
  .servers {
    margin-top: 16px;
  }
  h3 {
    font-size: 15px;
    margin-bottom: 10px;
    color: var(--text-dim);
    font-weight: 600;
  }
  .server-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .srv {
    padding: 8px 15px;
    border-radius: 10px;
    background: var(--bg-2);
    border: 1px solid #232838;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-dim);
    transition: all 0.15s;
    position: relative;
    overflow: hidden;
  }
  .srv::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent, rgba(229, 9, 20, 0.1));
    opacity: 0;
    transition: opacity 0.15s;
  }
  .srv:hover::before {
    opacity: 1;
  }
  .srv:hover {
    border-color: #39415a;
    color: var(--text);
    transform: translateY(-1px);
  }
  .srv.active {
    background: linear-gradient(135deg, var(--accent), #c7010e);
    border-color: var(--accent);
    color: #fff;
    box-shadow: 0 4px 12px rgba(229, 9, 20, 0.3);
  }
  .info-col .poster {
    width: 190px;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    margin-bottom: 14px;
  }
  h1 {
    font-size: 21px;
    line-height: 1.5;
    margin-bottom: 10px;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .badge {
    background: var(--bg-3);
    border: 1px solid #262c3d;
    color: var(--text-dim);
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 8px;
  }
  .genres {
    color: var(--accent-2);
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .story {
    color: var(--text-dim);
    font-size: 14px;
    line-height: 1.9;
  }
  @media (max-width: 900px) {
    .watch {
      grid-template-columns: 1fr;
      padding: 16px;
      gap: 16px;
    }
    .info-col .poster {
      display: none;
    }
    h1 {
      font-size: 18px;
    }
    .servers {
      margin-top: 12px;
    }
    .server-list {
      gap: 6px;
    }
    .srv {
      padding: 7px 12px;
      font-size: 12px;
    }
  }
  @media (max-width: 500px) {
    .watch {
      padding: 12px;
    }
    .player-shell {
      min-height: 200px;
    }
    .badges {
      font-size: 10.5px;
    }
    .story {
      font-size: 13px;
      line-height: 1.7;
    }
  }
</style>
