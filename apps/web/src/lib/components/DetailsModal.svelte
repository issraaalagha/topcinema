<script>
  import { api } from '../api.js';

  let { item, onClose } = $props();

  let details = $state(null);
  let loading = $state(true);
  let inList = $state(false);

  $effect(() => {
    if (!item?.id) return;
    api
      .post(item.id)
      .then((d) => (details = d.post || null))
      .catch(() => (details = null));
  });

  $effect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  });

  function stop(e) {
    e.stopPropagation();
  }

  function go() {
    onClose?.();
    window.history.pushState(null, '', '/watch/' + item.id);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-label={item.title}>
  <div class="modal-backdrop" role="presentation" onclick={onClose}></div>

  <div class="modal" onclick={stop} role="presentation">
    <button type="button" class="x-btn" onclick={onClose} aria-label="إغلاق">✕</button>

    <div class="m-hero">
      <img src={details?.backdrop || item.backdrop || item.poster || '/icons/icon.svg'} alt="" />
      <div class="m-hero-fade"></div>
      <span class="m-brand">FREEWATCH</span>
      <h2 class="m-title">{item.title}</h2>
      <div class="m-hero-actions">
        <button type="button" class="go-play" onclick={go}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <span>عرض</span>
        </button>
      </div>
    </div>

    <div class="m-body">
      {#if loading}
        <div class="m-skel"><div class="sk a"></div><div class="sk b"></div><div class="sk c"></div></div>
      {:else if details}
        <div class="m-cols">
          <div class="m-col">
            {#if details.year}<p><span class="lbl">السنة:</span> {details.year}</p>{/if}
            {#if details.duration}<p><span class="lbl">المدة:</span> {details.duration} دقيقة</p>{/if}
            {#if details.seasons?.length}<p><span class="lbl">المواسم:</span> {details.seasons.length}</p>{/if}
            {#if details.language}<p><span class="lbl">اللغة:</span> {details.language}</p>{/if}
          </div>
          <div class="m-col">
            {#if details.cast?.length}
              <p><span class="lbl">بطولة:</span> {details.cast.slice(0, 4).map((c) => c.name).join('، ')}</p>
            {/if}
            {#if details.genres?.length}
              <p><span class="lbl">التصنيفات:</span> {details.genres.join('، ')}</p>
            {/if}
          </div>
        </div>
        {#if details.story}
          <p class="m-story">{details.story}</p>
        {/if}
      {:else}
        <p class="m-loading">جارٍ تحميل التفاصيل…</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 400;
    display: grid;
    place-items: center;
    padding: clamp(10px, 3vh, 40px) 14px;
  }
  .modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(8px);
  }
  .modal {
    position: relative;
    width: min(860px, 94vw);
    max-height: min(88svh, 860px);
    overflow-y: auto;
    border-radius: 14px;
    background: #14161c;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 40px 110px rgba(0, 0, 0, 0.85);
    animation: modal-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
    overscroll-behavior: contain;
  }
  @keyframes modal-in {
    from { opacity: 0; transform: translateY(26px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .x-btn {
    position: absolute;
    top: 14px;
    inset-inline-start: 14px;
    z-index: 5;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 0;
    background: rgba(10, 12, 16, 0.85);
    color: #fff;
    font-size: 15px;
    cursor: pointer;
  }
  .x-btn:hover {
    background: rgba(229, 9, 20, 0.9);
  }
  .m-hero {
    position: relative;
    aspect-ratio: 16 / 8.2;
    overflow: hidden;
  }
  .m-hero img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 22%;
  }
  .m-hero-fade {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, #14161c 4%, rgba(20, 22, 28, 0.25) 55%, rgba(20, 22, 28, 0.45) 100%);
  }
  .m-brand {
    position: absolute;
    top: 16px;
    inset-inline-end: 22px;
    color: var(--accent, #e50914);
    font-weight: 900;
    font-size: 13px;
    letter-spacing: 2.5px;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
  }
  .m-title {
    position: absolute;
    bottom: 58px;
    inset-inline-end: 26px;
    max-width: 75%;
    font-size: clamp(24px, 3.4vw, 38px);
    font-weight: 900;
    color: #fff;
    text-shadow: 0 4px 22px rgba(0, 0, 0, 0.9);
    line-height: 1.25;
  }
  .m-hero-actions {
    position: absolute;
    bottom: 20px;
    inset-inline-end: 26px;
  }
  .go-play {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 30px;
    border: 0;
    border-radius: 8px;
    background: #fff;
    color: #0b0d12;
    font-size: 16px;
    font-weight: 800;
    font-family: inherit;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .go-play:hover {
    transform: scale(1.04);
  }
  .m-body {
    padding: 18px 26px 26px;
  }
  .m-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 28px;
    margin-bottom: 14px;
  }
  .m-col p {
    font-size: 13.5px;
    color: rgba(255, 255, 255, 0.82);
    line-height: 1.9;
  }
  .lbl {
    color: rgba(255, 255, 255, 0.45);
  }
  .m-story {
    font-size: 14px;
    line-height: 1.85;
    color: rgba(255, 255, 255, 0.9);
  }
  .m-loading,
  .m-skel {
    padding: 10px 0 20px;
    color: var(--text-muted);
    font-size: 13.5px;
  }
  .sk {
    height: 14px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.07);
    margin-bottom: 10px;
  }
  .sk.a { width: 70%; }
  .sk.b { width: 90%; }
  .sk.c { width: 55%; }

  @media (max-width: 640px) {
    .m-hero {
      aspect-ratio: 16 / 10;
    }
    .m-title {
      inset-inline-end: 18px;
      max-width: 85%;
    }
    .m-hero-actions {
      inset-inline-end: 18px;
    }
    .m-cols {
      grid-template-columns: 1fr;
    }
    .m-body {
      padding: 16px 18px 22px;
    }
  }
</style>
