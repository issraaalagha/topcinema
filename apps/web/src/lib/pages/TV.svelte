<script>
  /**
   * FreeWatch TV Mode (/tv) — 10-foot UI for TV browsers (Tizen/webOS/Chromium)
   * Full D-pad navigation: arrows move focus, Enter plays, Escape goes back.
   * Arabic subtitles ride along automatically in direct playback.
   */
  import { api, getAuthToken } from '../api.js';
  import { getContinueWatching } from '../store.js';
  import EnhancedPlayer from '../player/EnhancedPlayer.svelte';

  let authed = $state(!!getAuthToken());
  let passcode = $state('');
  let loginError = $state('');

  let rows = $state([]);
  let continueWatching = $state([]);
  let loading = $state(true);

  let focus = $state({ r: 0, i: 0 });
  let playing = $state(null); // {url, copyUrl, type, title, poster, subtitleUrl}

  const flat = $derived(rows.map((r) => r.items));

  function totalInRow(r) {
    return (flat[r] || []).length;
  }

  function focusCell(r, i) {
    if (r < 0 || r >= flat.length) return;
    const count = totalInRow(r);
    if (!count) return;
    const clamped = ((i % count) + count) % count;
    focus = { r, i: clamped };
    const el = document.querySelector(`[data-cell="${r}-${clamped}"]`);
    el?.focus();
  }

  function onKey(e) {
    if (loginScreen) {
      handleLoginKey(e);
      return;
    }
    if (playing) {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 10009) {
        playing = null;
      }
      return;
    }
    switch (e.key) {
      case 'ArrowRight': focusCell(focus.r, focus.i + 1); break;
      case 'ArrowLeft': focusCell(focus.r, focus.i - 1); break;
      case 'ArrowDown': focusCell(focus.r + 1, focus.i); break;
      case 'ArrowUp': focusCell(focus.r - 1, focus.i); break;
      case 'Enter': {
        const it = flat[focus.r]?.[focus.i];
        if (it) play(it);
        break;
      }
    }
  }

  // TV remotes send keyCode 10009 (back) on Tizen — map to Escape
  function handleLoginKey(e) {
    if (e.key === 'Enter') submitLogin();
  }

  async function submitLogin() {
    loginError = '';
    try {
      const res = await api.login({ passcode: passcode.trim() }, true);
      if (res.ok) {
        authed = true;
        await load();
      } else {
        loginError = res.error || 'رمز غير صحيح';
      }
    } catch (e) {
      loginError = e.message;
    }
  }

  async function load() {
    loading = true;
    try {
      continueWatching = getContinueWatching();
      const d = await api.home();
      rows = (d.rows || []).map((r) => ({ title: r.title, items: r.items || [] }));
      if (continueWatching.length) {
        rows.unshift({ title: 'متابعة المشاهدة', items: continueWatching });
      }
    } catch (e) {
      rows = [];
    } finally {
      loading = false;
      focusCell(0, 0);
    }
  }

  if (authed) load();

  $effect(() => {
    if (authed && !loading && flat.length) focusCell(focus.r, focus.i);
  });

  async function play(it) {
    try {
      // Resume from the saved position for this exact item/episode
      let resume = 0;
      try {
        const h = await api.getHistory();
        const hit = (h.items || []).find((x) => x.id === it.id);
        if (hit && hit.currentTime > 30) resume = hit.currentTime;
      } catch {}

      const r = await api.resolve(it.id, it.id);
      if (r.ok && r.url) {
        playing = {
          url: r.url,
          resumeAt: resume,
          type: r.type || 'hls',
          title: it.title,
          poster: it.poster || '',
          subtitleUrl:
            it.type === 'movie' || it.type === 'tv'
              ? `/api/subtitles/${it.type}/${it.tmdbId}`
              : ''
        };
      } else if (r.embedUrl) {
        playing = { url: r.embedUrl, resumeAt: resume, type: 'iframe', title: it.title, poster: it.poster || '', subtitleUrl: '' };
      }
    } catch {
      // ignore — stay on grid
    }
  }

  const loginScreen = $derived(!authed);
</script>

<svelte:window onkeydown={onKey} />

<div class="tv-page">
  {#if loginScreen}
    <div class="tv-login">
      <img src="/icons/logo-mark.png" alt="FreeWatch" width="84" height="84" />
      <h1>free<em>watch</em></h1>
      <p>أدخل رمز المالك باستخدام أزرار الريموت</p>
      {#if loginError}<p class="err">{loginError}</p>{/if}
      <div class="pass-display">{passcode.replace(/./g, '•') || '—'}</div>
      <div class="pad">
        {#each ['1','2','3','4','5','6','7','8','9','حذف','0','دخول'] as key (key)}
          <button
            type="button"
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                if (key === 'دخول') submitLogin();
                else if (key === 'حذف') passcode = passcode.slice(0, -1);
                else passcode += key;
              }
            }}
            onclick={() => {
              if (key === 'دخول') submitLogin();
              else if (key === 'حذف') passcode = passcode.slice(0, -1);
              else passcode += key;
            }}
          >
            {key === 'حذف' ? '⌫' : key === 'دخول' ? '✓ دخول' : key}
          </button>
        {/each}
      </div>
      <p class="hint">استخدم أسهم الريموت للتنقل و OK للاختيار — أو افتح الموقع على جوالك وسجّل الدخول ثم افتحه هنا</p>
    </div>
  {:else if playing}
    <div class="tv-player">
      <EnhancedPlayer
        src={playing.url}
        title={playing.title}
        poster={playing.poster}
        type={playing.type}
        strategy="direct"
        subtitleUrl={playing.type === 'iframe' ? '' : playing.subtitleUrl}
        resumeAt={playing.resumeAt || 0}
      />
      <p class="tv-back-hint">اضغط زر الرجوع/Escape للعودة إلى القائمة</p>
    </div>
  {:else}
    <header class="tv-topbar">
      <img src="/icons/logo-mark.png" alt="FreeWatch" width="46" height="46" />
      <span class="tv-wordmark">free<em>watch</em><i>.uk</i></span>
      <span class="tv-hint">⬅ ➡ ⬆ ⬇ للتنقل • OK للتشغيل</span>
    </header>

    {#if loading}
      <p class="tv-loading">جارٍ التحميل…</p>
    {:else}
      {#each rows as row, r (row.title)}
        {#if totalInRow(r)}
          <section class="tv-row">
            <h2>{row.title}</h2>
            <div class="tv-track">
              {#each flat[r] as it, i (`${it.id}_${i}`)}
                <button
                  type="button"
                  class="tv-card"
                  data-cell={r + '-' + i}
                  class:focused={focus.r === r && focus.i === i}
                  onclick={() => play(it)}
                >
                  <img src={it.backdrop || it.poster || '/icons/icon.svg'} alt={it.title} loading="lazy" />
                  <span class="tv-name">{it.title}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    {/if}
  {/if}
</div>

<style>
  .tv-page {
    min-height: 100vh;
    background: #05070c;
    padding-bottom: 40px;
  }
  .tv-login {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
  }
  .tv-login h1 {
    font-size: 40px;
    font-weight: 900;
    direction: ltr;
    color: #fff;
  }
  .tv-login h1 em {
    font-style: normal;
    background: linear-gradient(135deg, var(--accent, #e50914), #ff4d57);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .tv-login p {
    color: rgba(255, 255, 255, 0.6);
    font-size: 15px;
  }
  .tv-login .err {
    color: #ff6b74;
    font-weight: 700;
  }
  .pass-display {
    font-size: 34px;
    letter-spacing: 8px;
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 14px;
    padding: 12px 40px;
    min-width: 260px;
  }
  .pad {
    display: grid;
    grid-template-columns: repeat(3, 92px);
    gap: 10px;
  }
  .pad button {
    height: 58px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
  }
  .pad button:hover,
  .pad button:focus-visible {
    background: var(--accent, #e50914);
    border-color: var(--accent, #e50914);
    outline: none;
  }
  .hint {
    max-width: 520px;
    font-size: 12.5px;
    line-height: 1.7;
  }

  .tv-topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 22px 40px 10px;
  }
  .tv-wordmark {
    font-size: 28px;
    font-weight: 900;
    direction: ltr;
    color: #fff;
    margin-inline-end: 18px;
  }
  .tv-wordmark em {
    font-style: normal;
    background: linear-gradient(135deg, var(--accent, #e50914), #ff4d57);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .tv-wordmark i {
    font-style: normal;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.4);
  }
  .tv-hint {
    margin-inline-start: auto;
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
  }
  .tv-loading {
    text-align: center;
    color: rgba(255, 255, 255, 0.55);
    padding: 80px 0;
  }

  .tv-row {
    margin: 26px 0 6px;
  }
  .tv-row h2 {
    font-size: 21px;
    font-weight: 800;
    color: #fff;
    padding: 0 40px 10px;
  }
  .tv-track {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding: 4px 40px 16px;
    scrollbar-width: none;
  }
  .tv-track::-webkit-scrollbar {
    display: none;
  }
  .tv-card {
    flex: 0 0 300px;
    width: 300px;
    overflow: hidden;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font-family: inherit;
    text-align: start;
    cursor: pointer;
    border-radius: 14px;
    outline: none;
  }
  .tv-card img {
    width: 300px;
    max-width: 300px;
    height: 169px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 14px;
    border: 3px solid rgba(255, 255, 255, 0.08);
    transition: transform 0.25s ease, border-color 0.2s, box-shadow 0.2s;
  }
  .tv-card.focused img {
    transform: scale(1.05);
    border-color: var(--accent, #e50914);
    box-shadow: 0 14px 44px rgba(229, 9, 20, 0.4);
  }
  .tv-card:focus-visible {
    outline: none;
  }
  .tv-name {
    display: block;
    margin-top: 8px;
    font-size: 15px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tv-card.focused .tv-name {
    color: #fff;
  }

  .tv-player {
    position: fixed;
    inset: 0;
    z-index: 500;
    background: #000;
  }
  .tv-player :global(.enterprise-player-wrapper) {
    height: 100%;
    border-radius: 0;
  }
  .tv-back-hint {
    position: absolute;
    bottom: 18px;
    inset-inline-start: 0;
    inset-inline-end: 0;
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
  }
</style>
