<script>
  /**
   * 🎬 TopCinema Enterprise Player (2026 Standards)
   * Powered by official Plyr Library + HLS.js + Google Cast Framework
   * @component EnhancedPlayer
   */
  import { onMount, onDestroy, untrack } from 'svelte';
  import Plyr from 'plyr';
  import Hls from 'hls.js';
  import 'plyr/dist/plyr.css';
  import { castManager } from '../services/castManager.js';

  let {
    src,
    title = '',
    poster = '',
    type = 'auto',
    strategy = 'direct',
    subtitleUrl = '',
    resumeAt = 0,
    onTimeUpdate = null,
    onError = null,
    onEnded = null,
    onClose = null,
    onReady = null
  } = $props();

  let videoElement = $state(null);
  let player = $state(null);
  let hlsInstance = $state(null);
  let castAvailable = $state(false);
  let castConnected = $state(false);
  let castDeviceName = $state('');

  // Embedded-host mode: some servers only allow playback inside their own player iframe.
  const isEmbedFrame = $derived(type === 'iframe');

  // CineSrc embeds accept official URL params: brand accent, quality hint,
  // intro auto-skip, and a close-button back channel.
  // NOTE: deliberately NOT passing subtitlelang — CineSrc's own Arabic tracks
  // are frequently malformed and their player toasts on auto-select failure.
  // Arabic comes from our /api/subtitles in direct mode, or manual upload in
  // embed mode (their player remembers the choice per title).
  const embedSrc = $derived.by(() => {
    if (!src || !isEmbedFrame) return src;
    try {
      const u = new URL(src, window.location.origin);
      if (u.hostname.endsWith('cinesrc.st')) {
        u.searchParams.set('color', '#e50914');
        u.searchParams.set('quality', '1080');
        u.searchParams.set('autoskip', 'true');
        u.searchParams.set('back', 'close');
        if (resumeAt && Number.isFinite(resumeAt) && resumeAt > 30) {
          u.searchParams.set('t', String(Math.floor(resumeAt)));
        }
      }
      return u.toString();
    } catch {
      return src;
    }
  });

  // Official postMessage bridge (https://cinesrc.st/docs): surface playback
  // progress, errors, end-of-stream, and the player's back/close action.
  $effect(() => {
    if (!isEmbedFrame) return;
    const handler = (event) => {
      if (event.origin !== 'https://cinesrc.st') return;
      const data = event.data || {};
      const evtType = String(data.type || '');
      if (!evtType.startsWith('cinesrc:')) return;
      if (evtType === 'cinesrc:timeupdate' && onTimeUpdate) {
        onTimeUpdate(data.currentTime, data.duration);
      } else if (evtType === 'cinesrc:error' && onError) {
        onError(data.error || 'stream error');
      } else if (evtType === 'cinesrc:ended' && onEnded) {
        onEnded();
      } else if (evtType === 'cinesrc:close' && onClose) {
        onClose();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });

  // Native playback path: forward <video> progress through the same callback.
  $effect(() => {
    if (isEmbedFrame || !videoElement) return;
    const handler = () => {
      if (onTimeUpdate && videoElement) {
        onTimeUpdate(videoElement.currentTime, videoElement.duration);
      }
    };
    videoElement.addEventListener('timeupdate', handler);
    return () => videoElement.removeEventListener('timeupdate', handler);
  });

  function initPlayer() {
    if (!videoElement || !src || isEmbedFrame) return;

    // Destroy existing instances cleanly
    cleanup();

    const PlyrConstructor = (typeof Plyr === 'function' ? Plyr : Plyr?.default) || window.Plyr;
    if (!PlyrConstructor) {
      console.warn('[Plyr] Constructor not found');
      return;
    }

    // 1. Setup Plyr Instance with Full 2026 Features & Arabic Localization
    player = new PlyrConstructor(videoElement, {
      controls: [
        'play-large',
        'play',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'settings',
        'pip',
        'airplay',
        'fullscreen',
      ],
      settings: ['quality', 'speed', 'loop'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      i18n: {
        restart: 'إعادة',
        rewind: 'رجوع {seektime}s',
        play: 'تشغيل',
        pause: 'إيقاف',
        fastForward: 'تقديم {seektime}s',
        seek: 'بحث',
        seekLabel: '{currentTime} من {duration}',
        played: 'تم تشغيله',
        buffered: 'محمّل مؤقتاً',
        currentTime: 'الوقت الحالي',
        duration: 'المدة',
        volume: 'الصوت',
        mute: 'كتم',
        unmute: 'إلغاء الكتم',
        enableCaptions: 'تفعيل الترجمة',
        disableCaptions: 'إيقاف الترجمة',
        download: 'تحميل',
        enterFullscreen: 'ملء الشاشة',
        exitFullscreen: 'خروج من ملء الشاشة',
        frameTitle: 'مشغل الفيديو لـ {title}',
        captions: 'ترجمات',
        settings: 'الإعدادات',
        pip: 'صورة في صورة',
        menuBack: 'رجوع',
        speed: 'السرعة',
        normal: 'عادي',
        quality: 'الجودة',
        loop: 'تكرار',
        reset: 'إعادة ضبط',
        disabled: 'معطّل',
        enabled: 'مفعّل',
        qualityBadge: {
          2160: '4K',
          1440: '2K',
          1080: 'FHD',
          720: 'HD',
          480: 'SD',
          360: 'SD',
        },
      },
      ratio: '16:9',
      autoplay: true,
      keyboard: { focused: true, global: true },
      tooltips: { controls: true, seek: true },
      captions: { active: true, language: 'ar', immediate: true },
      storage: { enabled: true, key: 'topcinema-player' }
    });

    const isHls = type === 'hls' || src.includes('.m3u8');

    // 2. Setup HLS.js streaming engine for M3U8
    if (isHls && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });

      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(videoElement);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        const availableQualities = hlsInstance.levels.map((l) => l.height).filter(Boolean);
        if (availableQualities.length > 0) {
          player.quality = {
            default: availableQualities[0],
            options: [0, ...availableQualities], // 0 = Auto
            forced: true,
            onChange: (q) => {
              if (q === 0) {
                hlsInstance.currentLevel = -1; // Auto
              } else {
                hlsInstance.levels.forEach((level, index) => {
                  if (level.height === q) hlsInstance.currentLevel = index;
                });
              }
            },
          };
        }
        onReady?.();
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('[Plyr HLS] Fatal Error:', data);
          onError?.(data);
        }
      });
    } else if (isHls && videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple Safari HLS
      videoElement.src = src;
      onReady?.();
    } else {
      // Direct MP4 / WebM stream
      videoElement.src = src;
      onReady?.();
    }
  }

  function cleanup() {
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch {}
      hlsInstance = null;
    }
    if (player) {
      try { player.destroy(); } catch {}
      player = null;
    }
  }

  async function initCast() {
    try {
      await castManager.initialize();
      castAvailable = castManager.isAvailable();

      castManager.on('connected', (device) => {
        castConnected = true;
        castDeviceName = device.name;
      });

      castManager.on('disconnected', () => {
        castConnected = false;
        castDeviceName = '';
      });
    } catch {}
  }

  async function handleCast() {
    if (!src) return;
    try {
      await castManager.initialize();
      const castUrl = src.startsWith('http') ? src : `${window.location.origin}${src}`;
      await castManager.castMedia(castUrl, {
        title: title || 'FreeWatch',
        poster: poster || '',
        currentTime: player?.currentTime || 0,
        subtitleUrl: subtitleUrl
          ? (subtitleUrl.startsWith('http') ? subtitleUrl : `${window.location.origin}${subtitleUrl}`)
          : ''
      });
      // Local playback hands off to the TV
      player?.pause?.();
    } catch (err) {
      console.warn('[Cast] Failed:', err);
    }
  }

  $effect(() => {
    const currentSrc = src;
    if (isEmbedFrame) return;
    if (currentSrc && videoElement) {
      untrack(() => {
        initPlayer();
      });
    }
  });

  onMount(() => {
    initCast();
    initPlayer();
  });

  onDestroy(() => {
    cleanup();
  });
</script>

<div class="enterprise-player-wrapper">
  {#if isEmbedFrame}
    <!-- Embedded host player (used when direct extraction is blocked upstream).
         allow-scripts + allow-same-origin together would let the embed remove
         its own sandbox; untrusted hosts get neither same-origin nor forms. -->
    <iframe
      class="embed-frame"
      src={embedSrc}
      title={title || 'مشغل الفيديو'}
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      referrerpolicy="origin"
      sandbox="allow-scripts allow-presentation"
    ></iframe>
  {:else}
  <!-- Chromecast Floating Trigger Button -->
  {#if castAvailable}
    <button 
      class="cast-action-btn" 
      class:active={castConnected}
      onclick={handleCast}
      title={castConnected ? `يتم البث على: ${castDeviceName}` : 'بث عبر Chromecast'}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
      </svg>
      <span>{castConnected ? castDeviceName : 'Chromecast'}</span>
    </button>
  {/if}

  <!-- Official Plyr Native HTML5 Video Element -->
  <video
    bind:this={videoElement}
    {src}
    {poster}
    playsinline
    preload="metadata"
  >
    {#if subtitleUrl}
      <track
        kind="subtitles"
        label="العربية"
        srclang="ar"
        src={subtitleUrl}
        default
      />
    {/if}
  </video>
  {/if}
</div>

<style>
  .enterprise-player-wrapper {
    position: relative;
    width: 100%;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
  }

  .embed-frame {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    background: #000;
  }

  /* ─────────────────────────────────────────────────────────────────────────────
     2026 Enterprise Plyr Theme Overrides (Netflix High-Gloss Dark Theme)
     ───────────────────────────────────────────────────────────────────────────── */
  .enterprise-player-wrapper :global(.plyr) {
    --plyr-color-main: #e50914;
    --plyr-video-background: #000000;
    --plyr-menu-background: rgba(18, 20, 26, 0.95);
    --plyr-menu-color: #ffffff;
    --plyr-badge-text-color: #ffffff;
    --plyr-badge-background: #e50914;
    --plyr-font-family: inherit;
    --plyr-font-size-base: 14px;
    --plyr-control-radius: 8px;
    direction: ltr;
    border-radius: 12px;
    overflow: hidden;
  }

  /* Big Center Play Button */
  .enterprise-player-wrapper :global(.plyr--video .plyr__control--overlaid) {
    background: rgba(229, 9, 20, 0.92);
    border: 2.5px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 8px 32px rgba(229, 9, 20, 0.55), 0 0 24px rgba(229, 9, 20, 0.35);
    width: 72px;
    height: 72px;
    border-radius: 50%;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
  }

  .enterprise-player-wrapper :global(.plyr--video .plyr__control--overlaid:hover) {
    transform: translate(-50%, -50%) scale(1.15);
    background: #ff0f1f;
  }

  .enterprise-player-wrapper :global(.plyr--video .plyr__control--overlaid svg) {
    width: 32px;
    height: 32px;
    margin-left: 4px;
  }

  /* Controls Bar Gradient & Blur */
  .enterprise-player-wrapper :global(.plyr__controls) {
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%);
    padding: 30px 16px 14px;
  }

  .enterprise-player-wrapper :global(.plyr__menu__container) {
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8);
    border-radius: 10px;
  }

  /* Floating Cast Button */
  .cast-action-btn {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 18, 24, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    color: #fff;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cast-action-btn:hover {
    background: rgba(229, 9, 20, 0.9);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }

  .cast-action-btn.active {
    background: #e50914;
    border-color: #ff4d58;
    color: #fff;
  }
</style>
