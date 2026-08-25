<script>
  import Hls from 'hls.js';
  import { ensureCast, startCast } from '../cast.js';

  let { src, title = '', poster = null, autoplay = true } = $props();

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
  let castReady = $state(false);
  let casting = $state(false);
  let error = $state('');
  let loadingMedia = $state(true);
  let hideTimer;

  let hls;

  $effect(() => {
    if (!videoEl || !src) return;
    loadingMedia = true;
    error = '';
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 });
      hls.loadSource(src);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        levels = hls.levels.map((l, i) => ({ i, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k` }));
        currentLevel = hls.currentLevel;
        if (autoplay) videoEl.play().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => {
        if (hls.autoLevelEnabled) currentLevel = -1;
        else currentLevel = d.level;
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) error = 'تعذر تشغيل البث — جرّب سيرفراً آخر';
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = src;
      if (autoplay) videoEl.play().catch(() => {});
    } else {
      error = 'المتصفح لا يدعم HLS';
    }
    return () => {
      hls?.destroy();
      hls = null;
    };
  });

  $effect(() => {
    ensureCast().then((ok) => (castReady = ok));
  });

  function fmt(t) {
    if (!Number.isFinite(t)) return '0:00';
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  function togglePlay() {
    videoEl.paused ? videoEl.play() : videoEl.pause();
  }

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    // RTL: progress fills from right
    const frac = (rect.right - e.clientX) / rect.width;
    videoEl.currentTime = Math.min(Math.max(frac, 0), 1) * duration;
  }

  function setLevel(i) {
    if (!hls) return;
    hls.currentLevel = i;
    currentLevel = i;
  }

  function toggleMute() {
    videoEl.muted = !videoEl.muted;
    muted = videoEl.muted;
  }

  function toggleFs() {
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
      if (playing) showControls = false;
    }, 3000);
  }

  async function onCast() {
    try {
      await startCast(src, { title, poster });
      casting = true;
      videoEl.pause();
    } catch (e) {
      if (String(e).includes('cancel')) return;
      alert('تعذر الاتصال بالشاشة. تأكد أن التلفزيون والهاتف على نفس شبكة WiFi.');
    }
  }
</script>

<svelte:document onfullscreenchange={onFsChange} />

<div
  class="player {fullscreen ? 'fs' : ''}"
  bind:this={containerEl}
  onpointermove={wake}
  onpointerleave={() => playing && (showControls = false)}
>
  <video
    bind:this={videoEl}
    {poster}
    playsinline
    onplay={() => { playing = true; wake(); }}
    onpause={() => { playing = false; showControls = true; }}
    ontimeupdate={() => { currentTime = videoEl.currentTime; }}
    ondurationchange={() => (duration = videoEl.duration)}
    onprogress={() => {
      if (videoEl.buffered.length) buffered = videoEl.buffered.end(videoEl.buffered.length - 1);
    }}
    onvolumeupdate={() => {}}
    oncanplay={() => (loadingMedia = false)}
    onwaiting={() => (loadingMedia = true)}
    onclick={togglePlay}
  ></video>

  {#if loadingMedia && !error}
    <div class="spinner"></div>
  {/if}

  {#if error}
    <div class="err">{error}</div>
  {/if}

  {#if !playing && !error}
    <button class="big-play" onclick={togglePlay} aria-label="تشغيل">▶</button>
  {/if}

  <div class="controls" class:visible={showControls}>
    <div class="bar" onclick={seek}>
      <div class="buffered" style={'width:' + (duration ? (buffered / duration) * 100 : 0) + '%'}></div>
      <div class="played" style={'width:' + (duration ? (currentTime / duration) * 100 : 0) + '%'}></div>
      <div class="knob" style={'inset-inline-end:' + (duration ? (currentTime / duration) * 100 : 0) + '%'}></div>
    </div>

    <div class="buttons">
      <button onclick={togglePlay} aria-label="تشغيل/إيقاف">{playing ? '⏸' : '▶'}</button>
      <span class="time">{fmt(currentTime)} / {fmt(duration)}</span>

      <div class="spacer"></div>

      {#if levels.length > 1}
        <select
          class="quality"
          onchange={(e) => setLevel(+e.target.value)}
          value={currentLevel}
          aria-label="الجودة"
        >
          <option value="-1">تلقائي</option>
          {#each levels as l (l.i)}
            <option value={l.i}>{l.label}</option>
          {/each}
        </select>
      {/if}

      <button onclick={toggleMute} aria-label="كتم">{muted || volume === 0 ? '🔇' : '🔊'}</button>
      <input
        class="vol"
        type="range"
        min="0"
        max="1"
        step="0.05"
        bind:value={volume}
        oninput={(e) => { videoEl.volume = +e.target.value; videoEl.muted = false; muted = false; }}
      />

      {#if castReady}
        <button class="cast-btn" class:active={casting} onclick={onCast} title="بث إلى الشاشة">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor">
            <path d="M21 3H3a2 2 0 0 0-2 2v3h2V5h18v14h-7v2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM1 18v3h3a3 3 0 0 0-3-3zm0-4v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7zm0-4v2a9 9 0 0 1 9 9h2A11 11 0 0 0 1 10z"/>
          </svg>
        </button>
      {/if}

      <button onclick={toggleFs} aria-label="ملء الشاشة">{fullscreen ? '⛶' : '⛶'}</button>
    </div>
  </div>
</div>

<style>
  .player {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: #000;
    border-radius: var(--radius);
    overflow: hidden;
    direction: ltr;
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
  }
  .spinner {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 46px;
    height: 46px;
    border: 4px solid rgba(255, 255, 255, 0.18);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    pointer-events: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .err {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.75);
    color: var(--accent-2);
    font-weight: 600;
    direction: rtl;
  }
  .big-play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 76px;
    height: 76px;
    border-radius: 50%;
    background: rgba(229, 9, 20, 0.92);
    color: #fff;
    font-size: 26px;
    display: grid;
    place-items: center;
    box-shadow: var(--shadow);
    transition: transform 0.15s;
  }
  .big-play:hover {
    transform: scale(1.08);
  }
  .controls {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    padding: 26px 16px 12px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
    opacity: 0;
    transition: opacity 0.22s;
    pointer-events: none;
  }
  .controls.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .bar {
    position: relative;
    height: 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.22);
    cursor: pointer;
    margin-bottom: 4px;
  }
  .bar:hover {
    height: 7px;
  }
  .buffered,
  .played {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 4px;
  }
  .buffered {
    background: rgba(255, 255, 255, 0.3);
  }
  .played {
    background: var(--accent);
  }
  .knob {
    position: absolute;
    top: 50%;
    transform: translate(50%, -50%);
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
  }
  .buttons button {
    font-size: 17px;
    padding: 5px;
    opacity: 0.92;
  }
  .buttons button:hover {
    opacity: 1;
  }
  .time {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    opacity: 0.9;
  }
  .spacer {
    flex: 1;
  }
  select.quality {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12.5px;
    font-family: inherit;
  }
  select.quality option {
    color: #000;
  }
  .vol {
    width: 70px;
    accent-color: var(--accent);
  }
  .cast-btn.active {
    color: var(--accent-2);
  }
  
  /* Mobile optimizations */
  @media (max-width: 600px) {
    .controls {
      padding: 20px 12px 10px;
    }
    .bar {
      height: 6px;
      margin-bottom: 8px;
    }
    .bar:hover {
      height: 8px;
    }
    .knob {
      width: 15px;
      height: 15px;
    }
    .buttons {
      gap: 8px;
    }
    .buttons button {
      font-size: 16px;
      padding: 6px;
      min-width: 36px;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .time {
      font-size: 11.5px;
    }
    select.quality {
      font-size: 11.5px;
      padding: 5px 7px;
    }
    .vol {
      width: 50px;
    }
    .cast-btn svg {
      width: 19px;
      height: 19px;
    }
  }
  
  @media (max-width: 400px) {
    .vol {
      display: none;
    }
    .buttons {
      gap: 6px;
    }
  }
</style>
