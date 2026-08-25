<script>
  import Hls from 'hls.js';
  import { requestCast, initCastFramework } from '../cast.js';
  import { getProgress, updateProgress } from '../store.js';

  let { id = null, src, title = '', poster = null, autoplay = true } = $props();

  let videoEl = $state();
  let containerEl = $state();
  let playing = $state(false);
  let muted = $state(false);
  let volume = $state(1);
  let currentTime = $state(0);
  let duration = $state(0);
  let buffered = $state(0);
  let showControls = $state(true);
  let levels = $state([]);
  let currentLevel = $state(-1);
  let fullscreen = $state(false);
  let casting = $state(false);
  let error = $state('');
  let loadingMedia = $state(true);
  let playbackRate = $state(1);
  let showSettings = $state(false);
  let hideTimer;
  let lastSavedTime = 0;
  let restored = false;
  let retryCount = 0;

  let hls;

  $effect(() => {
    if (!videoEl || !src) return;
    loadingMedia = true;
    error = '';
    restored = false;
    retryCount = 0;

    if (hls) {
      hls.destroy();
      hls = null;
    }

    const saved = id ? getProgress(id) : null;
    const initialSeekTime =
      saved && saved.currentTime > 5 && saved.currentTime < (saved.duration - 15)
        ? saved.currentTime
        : 0;

    const isMp4 = src.includes('.mp4') || src.includes('video/mp4');
    const isHlsStream = !isMp4 && (src.includes('.m3u8') || src.includes('mpegurl') || (src.includes('/api/proxy') && !src.includes('.mp4')));

    if (isHlsStream && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 60 * 1000 * 1000,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 20000,
        levelLoadingTimeOut: 20000,
      });

      hls.loadSource(src);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        levels = hls.levels.map((l, i) => ({
          i,
          label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`,
        }));
        currentLevel = hls.currentLevel;

        if (initialSeekTime > 0 && !restored) {
          videoEl.currentTime = initialSeekTime;
          restored = true;
        }

        if (autoplay) {
          videoEl.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => {
        if (hls.autoLevelEnabled) currentLevel = -1;
        else currentLevel = d.level;
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (retryCount < 4) {
                retryCount++;
                console.warn(`[Player] HLS Network Error, retrying attempt ${retryCount}...`);
                hls.startLoad();
              } else {
                error = 'تعذر تشغيل البث من هذا السيرفر — يُرجى التبديل لسيرفر آخر من القائمة';
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[Player] HLS Media Error, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              error = 'تعذر تشغيل البث — جرّب سيرفراً آخر من القائمة بالأسفل';
              break;
          }
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') || !isHlsStream) {
      // Native HLS for Safari/iOS or Direct MP4 streams
      videoEl.src = src;
      if (initialSeekTime > 0 && !restored) {
        videoEl.currentTime = initialSeekTime;
        restored = true;
      }
      if (autoplay) videoEl.play().catch(() => {});
    } else {
      error = 'المتصفح لا يدعم تشغيل هذا التنسيق';
    }

    return () => {
      hls?.destroy();
      hls = null;
    };
  });

  $effect(() => {
    initCastFramework();
  });

  function fmt(t) {
    if (!Number.isFinite(t) || t < 0) return '0:00';
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function togglePlay() {
    if (!videoEl) return;
    videoEl.paused ? videoEl.play() : videoEl.pause();
  }

  function seek(e) {
    if (!duration || !videoEl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    videoEl.currentTime = Math.min(Math.max(frac, 0), 1) * duration;
  }

  function handleBarKeyDown(e) {
    if (!videoEl || !duration) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 10 : -10;
      videoEl.currentTime = Math.min(Math.max(videoEl.currentTime + step, 0), duration);
    }
  }

  function handleGlobalKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.code === 'Space' || e.key === 'k') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFs();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMute();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (videoEl) videoEl.currentTime = Math.min(videoEl.currentTime + 10, duration);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (videoEl) videoEl.currentTime = Math.max(videoEl.currentTime - 10, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (videoEl) {
        volume = Math.min(volume + 0.1, 1);
        videoEl.volume = volume;
        videoEl.muted = false;
        muted = false;
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (videoEl) {
        volume = Math.max(volume - 0.1, 0);
        videoEl.volume = volume;
        if (volume === 0) muted = true;
      }
    }
  }

  function handleTimeUpdate() {
    if (!videoEl) return;
    currentTime = videoEl.currentTime;
    if (id && duration > 0 && Math.abs(currentTime - lastSavedTime) > 4) {
      lastSavedTime = currentTime;
      updateProgress({ id, title, poster }, currentTime, duration);
    }
  }

  function setLevel(i) {
    if (!hls) return;
    hls.currentLevel = i;
    currentLevel = i;
  }

  function setRate(r) {
    playbackRate = r;
    if (videoEl) videoEl.playbackRate = r;
    showSettings = false;
  }

  function toggleMute() {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    muted = videoEl.muted;
  }

  function toggleFs() {
    if (!containerEl) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else containerEl.requestFullscreen?.();
  }

  function onFsChange() {
    fullscreen = !!document.fullscreenElement;
  }

  function wake() {
    showControls = true;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (playing && !showSettings) showControls = false;
    }, 3200);
  }

  async function onCast() {
    try {
      const res = await requestCast(videoEl, src, { title, poster });
      if (res) {
        casting = true;
        videoEl?.pause();
      }
    } catch (e) {
      alert(e.message || 'تعذر الاتصال بالشاشة. تأكد أن التلفزيون والجهاز متصلان بنفس شبكة WiFi.');
    }
  }

  async function togglePiP() {
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoEl.requestPictureInPicture) {
        await videoEl.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP error:', e);
    }
  }
</script>

<svelte:document onfullscreenchange={onFsChange} onkeydown={handleGlobalKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="player {fullscreen ? 'fs' : ''}"
  bind:this={containerEl}
  onpointermove={wake}
  onpointerleave={() => playing && !showSettings && (showControls = false)}
>
  <video
    bind:this={videoEl}
    {poster}
    playsinline
    preload="auto"
    crossorigin="anonymous"
    onplay={() => { playing = true; wake(); }}
    onpause={() => { playing = false; showControls = true; }}
    ontimeupdate={handleTimeUpdate}
    ondurationchange={() => { if (videoEl) duration = videoEl.duration; }}
    onprogress={() => {
      if (videoEl?.buffered?.length) buffered = videoEl.buffered.end(videoEl.buffered.length - 1);
    }}
    oncanplay={() => (loadingMedia = false)}
    onwaiting={() => (loadingMedia = true)}
    onclick={togglePlay}
  >
    <track kind="captions" />
  </video>

  {#if loadingMedia && !error}
    <div class="spinner" aria-label="جارٍ التحميل"></div>
  {/if}

  {#if error}
    <div class="err" role="alert">
      <div class="err-icon">⚠️</div>
      <p>{error}</p>
    </div>
  {/if}

  {#if !playing && !error}
    <button
      type="button"
      class="big-play"
      onclick={togglePlay}
      aria-label="تشغيل الفيديو"
    >
      <svg viewBox="0 0 24 24" width="38" height="38" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
    </button>
  {/if}

  <!-- Controls Bar -->
  <div class="controls" class:visible={showControls}>
    <!-- Scrubbing Timeline -->
    <div
      class="bar"
      role="slider"
      tabindex="0"
      aria-label="شريط وقت الفيديو"
      aria-valuenow={Math.round(currentTime)}
      aria-valuemin="0"
      aria-valuemax={Math.round(duration || 100)}
      aria-valuetext={`${fmt(currentTime)} من ${fmt(duration)}`}
      onclick={seek}
      onkeydown={handleBarKeyDown}
    >
      <div
        class="buffered"
        style={'width:' + (duration ? (buffered / duration) * 100 : 0) + '%'}
      ></div>
      <div
        class="played"
        style={'width:' + (duration ? (currentTime / duration) * 100 : 0) + '%'}
      ></div>
      <div
        class="knob"
        style={'left:' + (duration ? (currentTime / duration) * 100 : 0) + '%'}
      ></div>
    </div>

    <div class="buttons">
      <!-- Play/Pause -->
      <button
        type="button"
        class="ctrl-btn"
        onclick={togglePlay}
        aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
      >
        {#if playing}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        {/if}
      </button>

      <!-- Time Display -->
      <span class="time">{fmt(currentTime)} / {fmt(duration)}</span>

      <div class="spacer"></div>

      <!-- Quality Selector (if multi-resolution HLS) -->
      {#if levels.length > 1}
        <select
          class="quality-select"
          onchange={(e) => setLevel(+e.target.value)}
          value={currentLevel}
          aria-label="جودة البث"
        >
          <option value="-1">تلقائي (Auto)</option>
          {#each levels as l (l.i)}
            <option value={l.i}>{l.label}</option>
          {/each}
        </select>
      {/if}

      <!-- Speed Selector Menu -->
      <div class="speed-menu-wrap">
        <button
          type="button"
          class="ctrl-btn speed-btn"
          onclick={() => (showSettings = !showSettings)}
          aria-label="سرعة التشغيل"
        >
          {playbackRate}x
        </button>
        {#if showSettings}
          <div class="speed-dropdown">
            {#each [0.5, 0.75, 1, 1.25, 1.5, 2] as rate}
              <button
                type="button"
                class="speed-opt"
                class:active={playbackRate === rate}
                onclick={() => setRate(rate)}
              >
                {rate}x
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Volume / Mute -->
      <button
        type="button"
        class="ctrl-btn"
        onclick={toggleMute}
        aria-label={muted || volume === 0 ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
      >
        {#if muted || volume === 0}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
        {/if}
      </button>

      <input
        class="vol"
        type="range"
        min="0"
        max="1"
        step="0.05"
        bind:value={volume}
        oninput={(e) => {
          if (videoEl) {
            videoEl.volume = +e.target.value;
            videoEl.muted = false;
            muted = false;
          }
        }}
        aria-label="مستوى الصوت"
      />

      <!-- Picture in Picture (PiP) -->
      <button
        type="button"
        class="ctrl-btn"
        onclick={togglePiP}
        title="صورة داخل صورة (PiP)"
        aria-label="صورة داخل صورة"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>
        </svg>
      </button>

      <!-- Chromecast -->
      <button
        type="button"
        class="ctrl-btn cast-btn"
        class:active={casting}
        onclick={onCast}
        title="بث إلى الشاشة الذكية (Chromecast / Smart TV)"
        aria-label="بث إلى الشاشة الذكية"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M21 3H3a2 2 0 0 0-2 2v3h2V5h18v14h-7v2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM1 18v3h3a3 3 0 0 0-3-3zm0-4v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7zm0-4v2a9 9 0 0 1 9 9h2A11 11 0 0 0 1 10z"/>
        </svg>
      </button>

      <!-- Fullscreen -->
      <button
        type="button"
        class="ctrl-btn"
        onclick={toggleFs}
        aria-label={fullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
      >
        {#if fullscreen}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
          </svg>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .player {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: #000;
    border-radius: var(--radius-md);
    overflow: hidden;
    direction: ltr;
    box-shadow: var(--shadow-lg);
  }
  .player.fs {
    border-radius: 0;
    aspect-ratio: auto;
    height: 100vh;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: pointer;
    background: #000;
  }
  .spinner {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 52px;
    height: 52px;
    border: 4px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.85s linear infinite;
    pointer-events: none;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .err {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(7, 9, 14, 0.92);
    backdrop-filter: blur(10px);
    color: #ff4d57;
    font-weight: 700;
    font-size: 15px;
    direction: rtl;
    padding: 24px;
    text-align: center;
  }
  .err-icon {
    font-size: 32px;
  }
  .big-play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), #9e040c);
    color: #fff;
    display: grid;
    place-items: center;
    box-shadow: 0 8px 32px var(--accent-glow);
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  }
  .big-play:hover {
    transform: scale(1.1);
    box-shadow: 0 10px 40px var(--accent-glow);
  }
  .controls {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    padding: 30px 18px 14px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.6) 60%, transparent 100%);
    opacity: 0;
    transition: opacity var(--transition-normal);
    pointer-events: none;
  }
  .controls.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .bar {
    position: relative;
    height: 6px;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.2);
    cursor: pointer;
    margin-bottom: 10px;
    outline: none;
    transition: height var(--transition-fast);
  }
  .bar:hover, .bar:focus-visible {
    height: 8px;
  }
  .buffered,
  .played {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: var(--radius-pill);
  }
  .buffered {
    background: rgba(255, 255, 255, 0.35);
  }
  .played {
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
  }
  .knob {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
    transition: transform var(--transition-fast);
  }
  .bar:hover .knob {
    transform: translate(-50%, -50%) scale(1.2);
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;
  }
  .ctrl-btn {
    display: grid;
    place-items: center;
    padding: 6px;
    border-radius: var(--radius-sm);
    color: #e2e8f0;
    transition: color var(--transition-fast), transform var(--transition-fast);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .ctrl-btn:hover {
    color: #fff;
    transform: scale(1.1);
  }
  .time {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #cbd5e1;
    font-weight: 500;
  }
  .spacer {
    flex: 1;
  }
  .quality-select {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-size: 12.5px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
  }
  .quality-select option {
    background: #141924;
    color: #fff;
  }
  .speed-menu-wrap {
    position: relative;
  }
  .speed-btn {
    font-size: 12.5px;
    font-weight: 700;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
  }
  .speed-dropdown {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background: #141924;
    border: 1px solid var(--border-glass);
    border-radius: var(--radius-sm);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: var(--shadow-md);
  }
  .speed-opt {
    background: transparent;
    border: none;
    color: #cbd5e1;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    transition: background var(--transition-fast);
  }
  .speed-opt:hover, .speed-opt.active {
    background: var(--accent);
    color: #fff;
  }
  .vol {
    width: 75px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .cast-btn.active {
    color: var(--accent);
  }

  @media (max-width: 600px) {
    .controls {
      padding: 24px 12px 10px;
    }
    .vol {
      display: none;
    }
    .buttons {
      gap: 6px;
    }
    .time {
      font-size: 11px;
    }
    .quality-select {
      font-size: 11px;
      padding: 3px 5px;
    }
  }
</style>
