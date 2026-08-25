<script>
  import { onMount } from 'svelte';
  import Plyr from 'plyr';
  import Hls from 'hls.js';
  import 'plyr/dist/plyr.css';

  let { src, title = '', poster = null, autoplay = true } = $props();

  let videoEl;
  let player;
  let hls;

  onMount(() => {
    if (!videoEl) return;

    // إعداد Plyr مع الترجمة العربية
    player = new Plyr(videoEl, {
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
        menuBack: 'رجوع للقائمة السابقة',
        speed: 'السرعة',
        normal: 'عادي',
        quality: 'الجودة',
        loop: 'تكرار',
        start: 'بداية',
        end: 'نهاية',
        all: 'الكل',
        reset: 'إعادة ضبط',
        disabled: 'معطّل',
        enabled: 'مفعّل',
        advertisement: 'إعلان',
        qualityBadge: {
          2160: '4K',
          1440: 'HD',
          1080: 'HD',
          720: 'HD',
          576: 'SD',
          480: 'SD',
        },
      },
      ratio: '16:9',
      autoplay,
      storage: { enabled: true, key: 'topcinema-player' },
    });

    // إعداد HLS
    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hls.loadSource(src);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // إضافة quality selector
        const availableQualities = hls.levels.map((l) => l.height);
        player.quality = {
          default: availableQualities[0],
          options: availableQualities,
          forced: true,
          onChange: (quality) => {
            if (quality === 0) {
              hls.currentLevel = -1; // Auto
            } else {
              hls.levels.forEach((level, index) => {
                if (level.height === quality) {
                  hls.currentLevel = index;
                }
              });
            }
          },
        };

        if (autoplay) videoEl.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('HLS Error:', data);
          player.destroy();
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      videoEl.src = src;
    }

    return () => {
      player?.destroy();
      hls?.destroy();
    };
  });
</script>

<div class="plyr-wrapper">
  <video bind:this={videoEl} {poster} playsinline crossorigin="anonymous">
    <track kind="captions" />
  </video>
</div>

<style>
  .plyr-wrapper {
    position: relative;
    width: 100%;
    background: #000;
    border-radius: var(--radius);
    overflow: hidden;
  }

  /* تخصيص Plyr للـ RTL */
  .plyr-wrapper :global(.plyr) {
    direction: ltr; /* Player controls تبقى LTR */
  }

  .plyr-wrapper :global(.plyr--video) {
    background: #000;
  }

  /* تخصيص الألوان */
  .plyr-wrapper :global(.plyr--video .plyr__control--overlaid) {
    background: var(--accent);
  }

  .plyr-wrapper :global(.plyr--video .plyr__control:hover) {
    background: var(--accent);
  }

  .plyr-wrapper :global(.plyr__controls) {
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
    padding: 20px;
  }

  .plyr-wrapper :global(.plyr__progress__buffer),
  .plyr-wrapper :global(.plyr__volume--display) {
    color: var(--accent);
  }

  .plyr-wrapper :global(.plyr--full-ui input[type='range']) {
    color: var(--accent);
  }

  /* Mobile optimizations */
  @media (max-width: 600px) {
    .plyr-wrapper :global(.plyr__controls) {
      padding: 15px 10px;
    }

    .plyr-wrapper :global(.plyr__control) {
      padding: 8px;
    }
  }
</style>
