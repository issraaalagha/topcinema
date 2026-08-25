<script>
  /**
   * Enhanced Video Player with Chromecast Support
   * Enterprise-grade player with HLS/MP4 support, quality switching, and casting
   * @component EnhancedPlayer
   */
  import { onMount, onDestroy } from 'svelte';
  import { castManager } from '../services/castManager.js';
  import Hls from 'hls.js';

  let { 
    src, 
    title = '', 
    poster = '', 
    type = 'auto',
    strategy = 'direct',
    requiresAdBlock = false,
    onError = null,
    onReady = null 
  } = $props();

  let videoElement = $state(null);
  let iframeElement = $state(null);
  let hls = $state(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let isMuted = $state(false);
  let isFullscreen = $state(false);
  let showControls = $state(true);
  let controlsTimeout = $state(null);
  let loading = $state(true);
  let error = $state(null);
  
  // Chromecast state
  let castAvailable = $state(false);
  let castConnected = $state(false);
  let castDeviceName = $state('');

  // Quality levels for HLS
  let qualityLevels = $state([]);
  let currentQuality = $state(-1); // -1 = auto

  $effect(() => {
    if (src && videoElement && strategy === 'direct') {
      cleanup();
      initializeDirectPlayer();
    }
  });

  onMount(() => {
    initializeChromecast();
    // Auto-hide controls after 3 seconds
    startControlsTimer();
  });

  onDestroy(() => {
    cleanup();
  });

  function initializeDirectPlayer() {
    if (!videoElement || !src) return;
    loading = true;
    error = null;

    // Detect video type
    const videoType = type === 'auto' ? detectType(src) : type;

    if (videoType === 'hls') {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90
        });

        hls.loadSource(src);
        hls.attachMedia(videoElement);

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log('[Player] HLS manifest loaded, levels:', data.levels.length);
          
          // Extract quality levels
          qualityLevels = data.levels.map((level, index) => ({
            index,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
            label: `${level.height}p`
          }));
          
          loading = false;
          onReady?.();
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error('[Player] Fatal HLS error:', data);
            error = 'فشل تحميل الفيديو. يرجى تجربة سيرفر آخر.';
            onError?.(data);
          }
        });

      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        videoElement.src = src;
        loading = false;
      } else {
        error = 'المتصفح لا يدعم تشغيل HLS';
        onError?.('HLS not supported');
      }
    } else {
      // MP4 or other formats
      videoElement.src = src;
      loading = false;
    }

    // Video event listeners
    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('play', () => isPlaying = true);
    videoElement.addEventListener('pause', () => isPlaying = false);
    videoElement.addEventListener('volumechange', handleVolumeChange);
    videoElement.addEventListener('error', handleVideoError);
  }

  function detectType(url) {
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.mp4')) return 'mp4';
    return 'mp4'; // default
  }

  function handleLoadedMetadata() {
    duration = videoElement.duration;
    onReady?.();
  }

  function handleTimeUpdate() {
    currentTime = videoElement.currentTime;
  }

  function handleVolumeChange() {
    volume = videoElement.volume;
    isMuted = videoElement.muted;
  }

  function handleVideoError(e) {
    console.error('[Player] Video error:', e);
    error = 'خطأ في تحميل الفيديو';
    onError?.(e);
  }

  async function initializeChromecast() {
    try {
      await castManager.initialize();
      castAvailable = castManager.isAvailable();
      
      castManager.on('connected', (device) => {
        castConnected = true;
        castDeviceName = device.name;
        console.log('[Player] Cast connected:', device.name);
      });

      castManager.on('disconnected', () => {
        castConnected = false;
        castDeviceName = '';
        console.log('[Player] Cast disconnected');
      });

    } catch (err) {
      console.warn('[Player] Chromecast init failed:', err);
    }
  }

  function togglePlay() {
    if (!videoElement) return;
    
    if (castConnected) {
      castManager.togglePlay();
    } else {
      if (isPlaying) {
        videoElement.pause();
      } else {
        videoElement.play();
      }
    }
  }

  function seek(seconds) {
    if (!videoElement) return;
    
    if (castConnected) {
      castManager.seek(seconds);
    } else {
      videoElement.currentTime = seconds;
    }
  }

  function handleProgressClick(e) {
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    seek(pos * duration);
  }

  function setVolume(val) {
    if (!videoElement) return;
    videoElement.volume = val;
  }

  function toggleMute() {
    if (!videoElement) return;
    videoElement.muted = !videoElement.muted;
  }

  function toggleFullscreen() {
    const container = videoElement?.parentElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen();
      isFullscreen = true;
    } else {
      document.exitFullscreen();
      isFullscreen = false;
    }
  }

  function changeQuality(index) {
    if (!hls) return;
    hls.currentLevel = index;
    currentQuality = index;
  }

  async function castVideo() {
    if (!castAvailable) return;

    try {
      await castManager.cast({
        url: src,
        title,
        poster,
        currentTime: videoElement?.currentTime || 0
      });
    } catch (err) {
      console.error('[Player] Cast error:', err);
    }
  }

  function stopCast() {
    castManager.disconnect();
  }

  function startControlsTimer() {
    clearTimeout(controlsTimeout);
    showControls = true;
    controlsTimeout = setTimeout(() => {
      if (isPlaying) showControls = false;
    }, 3000);
  }

  function handleMouseMove() {
    startControlsTimer();
  }

  function cleanup() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    castManager.removeAllListeners();
  }

  function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

{#if strategy === 'iframe'}
  <!-- Iframe Fallback with Ad-Blocking Hint -->
  <div class="iframe-container" class:ad-block={requiresAdBlock}>
    {#if requiresAdBlock}
      <div class="ad-block-notice">
        <span class="shield-icon">🛡️</span>
        <span>يتم حظر الإعلانات تلقائياً</span>
      </div>
    {/if}
    <iframe
      bind:this={iframeElement}
      {src}
      {title}
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      sandbox="allow-same-origin allow-scripts allow-presentation"
    ></iframe>
  </div>
{:else}
  <!-- Direct Video Player -->
  <div 
    class="player-container" 
    class:fullscreen={isFullscreen}
    onmousemove={handleMouseMove}
  >
    <video
      bind:this={videoElement}
      {poster}
      preload="metadata"
      playsinline
      onclick={togglePlay}
    ></video>

    {#if loading}
      <div class="player-loading">
        <div class="spinner"></div>
        <p>جارٍ تحميل الفيديو…</p>
      </div>
    {/if}

    {#if error}
      <div class="player-error">
        <div class="error-icon">⚠️</div>
        <p>{error}</p>
      </div>
    {/if}

    {#if castConnected}
      <div class="cast-overlay">
        <div class="cast-icon">📺</div>
        <p class="cast-device">يتم البث على: {castDeviceName}</p>
        <button class="cast-stop" onclick={stopCast}>إيقاف البث</button>
      </div>
    {/if}

    <!-- Custom Controls -->
    <div class="controls" class:visible={showControls && !loading && !error}>
      <!-- Progress Bar -->
      <div class="progress-bar" onclick={handleProgressClick}>
        <div class="progress-filled" style="width: {(currentTime / duration) * 100}%"></div>
        <div class="progress-handle" style="left: {(currentTime / duration) * 100}%"></div>
      </div>

      <div class="controls-row">
        <!-- Play/Pause -->
        <button class="ctrl-btn" onclick={togglePlay}>
          {#if isPlaying}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          {/if}
        </button>

        <!-- Time -->
        <span class="time-display">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div class="spacer"></div>

        <!-- Quality Selector (HLS only) -->
        {#if qualityLevels.length > 0}
          <div class="quality-menu">
            <button class="ctrl-btn quality-btn">
              <span class="quality-label">
                {currentQuality === -1 ? 'تلقائي' : qualityLevels[currentQuality]?.label}
              </span>
            </button>
            <div class="quality-dropdown">
              <button 
                class="quality-option"
                class:active={currentQuality === -1}
                onclick={() => changeQuality(-1)}
              >
                تلقائي
              </button>
              {#each qualityLevels as level}
                <button
                  class="quality-option"
                  class:active={currentQuality === level.index}
                  onclick={() => changeQuality(level.index)}
                >
                  {level.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Volume -->
        <button class="ctrl-btn" onclick={toggleMute}>
          {#if isMuted || volume === 0}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
          {/if}
        </button>

        <!-- Chromecast Button -->
        {#if castAvailable}
          <button class="ctrl-btn cast-btn" onclick={castVideo}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
            </svg>
          </button>
        {/if}

        <!-- Fullscreen -->
        <button class="ctrl-btn" onclick={toggleFullscreen}>
          {#if isFullscreen}
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
{/if}

<style>
  .player-container {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: #000;
    overflow: hidden;
    border-radius: 12px;
  }

  .player-container.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    border-radius: 0;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: pointer;
  }

  .player-loading,
  .player-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    z-index: 10;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-top-color: #e50914;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon {
    font-size: 48px;
  }

  .cast-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: rgba(0, 0, 0, 0.9);
    color: #fff;
    z-index: 10;
  }

  .cast-icon {
    font-size: 64px;
  }

  .cast-device {
    font-size: 18px;
    font-weight: 600;
  }

  .cast-stop {
    padding: 12px 28px;
    border-radius: 8px;
    background: #e50914;
    color: #fff;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
  }

  .cast-stop:hover {
    background: #c4070f;
  }

  .controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, transparent 100%);
    padding: 40px 20px 16px;
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 20;
  }

  .controls.visible {
    opacity: 1;
  }

  .progress-bar {
    height: 5px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    margin-bottom: 12px;
    cursor: pointer;
    position: relative;
  }

  .progress-filled {
    height: 100%;
    background: #e50914;
    border-radius: 3px;
    transition: width 0.1s;
  }

  .progress-handle {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    background: #e50914;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .progress-bar:hover .progress-handle {
    opacity: 1;
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ctrl-btn {
    background: transparent;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
  }

  .ctrl-btn:hover {
    transform: scale(1.1);
  }

  .time-display {
    font-size: 13px;
    color: #fff;
    font-weight: 500;
    user-select: none;
  }

  .spacer {
    flex: 1;
  }

  .quality-menu {
    position: relative;
  }

  .quality-btn {
    font-size: 13px;
    font-weight: 600;
  }

  .quality-label {
    min-width: 60px;
    text-align: center;
  }

  .quality-dropdown {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 8px;
    background: rgba(20, 20, 20, 0.95);
    border-radius: 8px;
    padding: 6px;
    display: none;
    flex-direction: column;
    gap: 2px;
    min-width: 100px;
  }

  .quality-menu:hover .quality-dropdown {
    display: flex;
  }

  .quality-option {
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 13px;
    text-align: right;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .quality-option:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .quality-option.active {
    background: #e50914;
  }

  .cast-btn {
    color: #4FC3F7;
  }

  /* Iframe Styles */
  .iframe-container {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
  }

  .ad-block-notice {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    background: rgba(16, 185, 129, 0.9);
    color: #fff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .shield-icon {
    font-size: 14px;
  }

  iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  @media (max-width: 768px) {
    .controls {
      padding: 30px 12px 12px;
    }

    .ctrl-btn {
      padding: 4px;
    }

    .time-display {
      font-size: 11px;
    }
  }
</style>
