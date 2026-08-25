# 🎬 TopCinema Enhanced Video Player System
## VIP Pure Native Streaming Architecture (No Iframes Allowed)

> **Version:** 3.0.0 (VIP Core)  
> **Date:** August 2026  
> **Status:** ✅ Production Ready

---

## 📋 Executive Summary

نظام تشغيل فيديو أصلي نقي 100% (Pure Native HLS/MP4) يرتكز حصرياً على **Direct URL Extraction**. 
**قرار معماري قطعي:** يُمنع منعاً باتاً استخدام تقنية الـ Iframe Fallback. السيرفرات التي لا تدعم المشغل النقي يتم استبعادها من الواجهة للحفاظ على تجربة خالية من الإعلانات تماماً.

### ✨ Key Features

- ✅ **Strict VIP Extraction** - استخراج روابط M3U8/MP4 نقية عبر API (VideoTube, UpDown, Mixdrop)
- 🚫 **NO Iframe Fallbacks** - لا يوجد تراجع لنظام الإطارات المضمنة (Iframes) تحت أي ظرف
- ✅ **100% Ad-Free Guarantee** - صفر إعلانات ونوافذ منبثقة لأن البث مباشر
- ✅ **Chromecast Support** - بث مباشر إلى Google Chromecast/Android TV
- ✅ **HLS.js Integration** - دعم HTTP Live Streaming على جميع المتصفحات
- ✅ **Adaptive Quality** - جودة تكيفية حسب سرعة الإنترنت
- ✅ **Picture-in-Picture** - مشاهدة عائمة أثناء التصفح
- ✅ **Keyboard Shortcuts** - اختصارات لوحة المفاتيح (Space, ←, →, F, M)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Watch.svelte                         │
│  (VIP Server Filtering + Orchestration)                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│            /api/resolve/[id]/[server]                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Pure Direct Extraction:                         │   │
│  │  • Fetch Embed HTML (Server Side)                │   │
│  │  • Regex / JS Unpacking                          │   │
│  │  • Return Direct .m3u8 or .mp4                   │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├──── Success (Direct URL) ───►
                 │
                 └──── Failure ───► Error Message (No Iframe)
                 
                 ▼
┌─────────────────────────────────────────────────────────┐
│              EnhancedPlayer.svelte                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Rendering Strategy:                             │   │
│  │  • ALWAYS Direct: HTML5 <video> + HLS.js         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
│  ┌──────────────────────────────────────────────────┐  │
│  │  ChromecastManager (optional)                    │  │
│  │  • Device discovery                              │  │
│  │  • Session management                            │  │
│  │  • Remote playback control                       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                 ▲
                 │
                 │ (Network requests)
                 │
┌─────────────────────────────────────────────────────────┐
│              Service Worker (sw.js)                     │
│  • Ad pattern blocking                                  │
│  • Offline caching                                      │
│  • Video stream passthrough (no cache)                  │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
src/
├── lib/
│   ├── services/
│   │   ├── videoExtractor.js       # 🎯 Core extraction logic
│   │   └── chromecast.js           # 📺 Chromecast manager
│   │
│   ├── player/
│   │   ├── EnhancedPlayer.svelte   # 🎬 Main player component
│   │   └── Player.svelte           # (Legacy - can be removed)
│   │
│   └── pages/
│       └── Watch.svelte            # 🎥 Watch page (updated)
│
public/
└── sw.js                           # 🛡️ Service Worker (v2.0)

index.html                          # ✅ SW registration added
```

---

## 🔧 Component API

### 1. **VideoExtractorService**

```javascript
import { videoExtractor } from '$lib/services/videoExtractor.js';

// Extract video URL
const result = await videoExtractor.extract(embedUrl, serverName);

// Result structure:
{
  success: true,
  strategy: 'direct' | 'iframe',
  url: 'https://...',
  type: 'hls' | 'mp4' | 'embed',
  quality: 'auto' | '1080p' | '720p' | '480p',
  server: 'VidTube',
  requiresAdBlock: false
}
```

### 2. **EnhancedPlayer Component**

```svelte
<EnhancedPlayer
  src="https://video-url.m3u8"
  title="Movie Title"
  poster="https://poster-image.jpg"
  type="hls"                    <!-- 'hls' | 'mp4' | 'embed' -->
  strategy="direct"             <!-- 'direct' | 'iframe' -->
  requiresAdBlock={false}
  onError={(err) => console.error(err)}
  onReady={() => console.log('Ready')}
/>
```

### 3. **ChromecastManager**

```javascript
import { chromecastManager } from '$lib/services/chromecast.js';

// Initialize (auto-called by EnhancedPlayer)
await chromecastManager.init();

// Cast video
await chromecastManager.cast({
  url: 'https://video.m3u8',
  title: 'Movie Title',
  poster: 'https://poster.jpg'
});

// Events
chromecastManager.on('connected', (device) => {});
chromecastManager.on('playing', () => {});
chromecastManager.on('error', (err) => {});
```

---

## 🎯 Extraction Strategies

### **Strategy 1: Direct Extraction** ✅ Preferred

```javascript
// VidTube Example
const jwPatterns = [
  /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
  /file:\s*["']([^"']+\.mp4[^"']*)["']/i,
  /"file"\s*:\s*["']([^"']+)["']/i
];

// Extract direct URL from embed HTML
const url = html.match(pattern)[1];
// → Result: Direct HLS/MP4 URL
```

**Advantages:**
- 🚀 Zero latency
- 🎮 Full player controls
- 📱 PiP support
- 📺 Chromecast compatible
- ❌ No ads

### **Strategy 2: Iframe Fallback** 🛡️ With Ad-Blocking

```javascript
// When direct extraction fails
return {
  success: true,
  strategy: 'iframe',
  url: embedUrl,
  requiresAdBlock: true
};
```

**Service Worker blocks:**
- ❌ doubleclick.net
- ❌ googleadservices.com
- ❌ popads, exoclick, adsterra
- ❌ /ads/, /banner, /popup patterns

---

## 🛡️ Ad-Blocking Mechanism

### Service Worker Pattern Matching

```javascript
const AD_PATTERNS = [
  /doubleclick\.net/i,
  /googleadservices\.com/i,
  /googlesyndication\.com/i,
  /\/ads\//i,
  /\/banner/i,
  /clickadu\.com/i,
  /exoclick\.com/i,
  // ... +15 more patterns
];

// Block requests
if (shouldBlockRequest(url)) {
  return new Response('', { status: 204 });
}
```

### Coverage:
- ✅ Display ads
- ✅ Video pre-rolls
- ✅ Pop-ups/pop-unders
- ✅ Banner ads
- ✅ Analytics trackers

---

## 📺 Chromecast Integration

### Features:
1. **Auto-discovery** - يكتشف أجهزة Chromecast تلقائياً
2. **Session management** - إدارة الجلسة والتوصيل
3. **Remote control** - Play/Pause/Seek من الموبايل
4. **Queue support** - إضافة فيديوهات للقائمة

### UI Integration:

```svelte
{#if $castAvailable && !isCasting}
  <button class="cast-btn" onclick={handleCast}>
    📺 Cast to TV
  </button>
{/if}

{#if isCasting}
  <div class="casting-overlay">
    <div class="casting-icon">📺</div>
    <p>يتم البث على: {castDeviceName}</p>
    <button onclick={stopCasting}>إيقاف البث</button>
  </div>
{/if}
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `←` | Rewind 10s |
| `→` | Forward 10s |
| `↑` | Volume +10% |
| `↓` | Volume -10% |
| `F` | Fullscreen |
| `M` | Mute |
| `P` | Picture-in-Picture |
| `0-9` | Jump to 0%-90% |

---

## 🚀 Performance Optimizations

### 1. **Lazy Loading**
```javascript
// HLS.js loaded only when needed
if (!Hls.isSupported()) {
  const HlsLib = await import('hls.js');
}
```

### 2. **Caching Strategy**
```javascript
// Service Worker
if (url.includes('.m3u8') || url.includes('.ts')) {
  // Video: network-only (no cache)
  return fetch(request);
}
```

### 3. **Code Splitting**
```javascript
// vite.config.js
manualChunks(id) {
  if (id.includes('hls.js')) return 'vendor-hls';
  if (id.includes('chromecast')) return 'vendor-cast';
}
```

### 4. **Result Caching**
```javascript
// videoExtractor.js
cache.set(cacheKey, { result, timestamp });
// TTL: 10 minutes
```

---

## 🧪 Testing Checklist

### ✅ Direct Extraction
- [ ] VidTube URLs extract correctly
- [ ] LuluStream HLS streams work
- [ ] StreamWish sources load
- [ ] Generic extractor catches unknowns

### ✅ Fallback System
- [ ] Iframe loads when extraction fails
- [ ] Ad-blocking activates automatically
- [ ] No console errors in fallback mode

### ✅ Player Features
- [ ] HLS streams play smoothly
- [ ] MP4 files work on all browsers
- [ ] Controls respond correctly
- [ ] PiP mode functions
- [ ] Fullscreen works

### ✅ Chromecast
- [ ] Device discovery works
- [ ] Connection establishes
- [ ] Video starts playing on TV
- [ ] Remote control works
- [ ] Disconnect works cleanly

### ✅ Service Worker
- [ ] Registers on page load
- [ ] Ads are blocked in iframes
- [ ] Video streams pass through
- [ ] Offline caching works
- [ ] Updates install automatically

---

## 🐛 Troubleshooting

### Issue: "Video extraction failed"
**Solution:**
1. Check network tab for CORS errors
2. Verify embed URL is accessible
3. Try iframe fallback manually
4. Check extractor patterns in `videoExtractor.js`

### Issue: "Ads still showing in iframe"
**Solution:**
1. Verify Service Worker is registered: `navigator.serviceWorker.controller`
2. Check console for SW logs: `[SW] 🛡️ Blocked: ...`
3. Hard refresh (Ctrl+Shift+R) to update SW
4. Check `AD_PATTERNS` in `public/sw.js`

### Issue: "Chromecast button not appearing"
**Solution:**
1. Ensure HTTPS is used (Chromecast requires secure context)
2. Check `window.__onGCastApiAvailable` in console
3. Verify Cast SDK loaded: `chrome.cast.isAvailable`
4. Check device is on same network

### Issue: "HLS stream not playing"
**Solution:**
1. Check browser support: `Hls.isSupported()`
2. Verify HLS.js imported correctly
3. Check network tab for .m3u8 / .ts file errors
4. Try native HLS on Safari (no HLS.js needed)

---

## 📊 Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| HLS.js | ✅ | ✅ | ✅ Native | ✅ |
| MP4 | ✅ | ✅ | ✅ | ✅ |
| PiP | ✅ | ✅ | ✅ | ✅ |
| Chromecast | ✅ | ❌ | ❌ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Fullscreen API | ✅ | ✅ | ✅ | ✅ |

---

## 🔮 Future Enhancements

### Phase 2 (Q4 2026)
- [ ] **AirPlay Support** - بث إلى Apple TV
- [ ] **Quality Selector UI** - تبديل يدوي بين الجودات
- [ ] **Subtitle Support** - دعم الترجمة (SRT/VTT)
- [ ] **Download Manager** - تحميل الفيديوهات للمشاهدة Offline
- [ ] **Watch History Sync** - مزامنة موضع المشاهدة عبر الأجهزة

### Phase 3 (2027)
- [ ] **AI Video Enhancer** - تحسين الجودة بالذكاء الاصطناعي
- [ ] **Multi-audio Tracks** - دعم صوت متعدد اللغات
- [ ] **Chapter Markers** - علامات الفصول
- [ ] **360° Video Support** - فيديوهات بانورامية
- [ ] **WebRTC P2P Streaming** - بث P2P لتقليل الضغط على السيرفر

---

## 📝 Configuration

### Environment Variables
```bash
# .env (Cloudflare Workers)
ALLOWED_ORIGINS=https://topcinemaa.co,https://www.topcinemaa.co

# Extraction timeout (ms)
EXTRACTION_TIMEOUT=10000

# Cache TTL (seconds)
CACHE_TTL=600
```

### Build Configuration
```javascript
// vite.config.js
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-hls': ['hls.js'],
          'vendor-cast': ['./src/lib/services/chromecast.js']
        }
      }
    }
  }
});
```

---

## 👨‍💻 Developer Notes

### Adding New Server Extractors

```javascript
// src/lib/services/videoExtractor.js

const EXTRACTORS = {
  myserver: {
    name: 'MyServer',
    patterns: [/myserver\.com/i],
    
    async extract(embedUrl) {
      const response = await fetch(embedUrl);
      const html = await response.text();
      
      // Add your extraction logic here
      const match = html.match(/your-pattern/i);
      
      if (match) {
        return {
          success: true,
          strategy: 'direct',
          url: match[1],
          type: 'hls',
          server: 'MyServer'
        };
      }
      
      // Fallback to iframe
      return {
        success: true,
        strategy: 'iframe',
        url: embedUrl,
        requiresAdBlock: true
      };
    }
  }
};
```

### Custom Ad Patterns

```javascript
// public/sw.js

const AD_PATTERNS = [
  // Add your patterns
  /my-ad-network\.com/i,
  /\/tracking\//i,
  /analytics/i
];
```

---

## 📄 License & Credits

**License:** MIT  
**Author:** TopCinema Development Team  
**Powered by:**
- HLS.js - HTML5 video library
- Google Cast SDK - Chromecast integration
- Svelte 5 - Reactive UI framework
- Cloudflare Workers - Edge computing platform

---

## 🆘 Support

للمساعدة الفنية أو الإبلاغ عن مشاكل:
- 📧 Email: support@topcinemaa.co
- 💬 GitHub Issues: [Create Issue](https://github.com/topcinema/web/issues)
- 📱 Telegram: @TopCinemaSupport

---

**Last Updated:** August 25, 2026  
**Documentation Version:** 2.0.0  
**System Status:** 🟢 Production Ready
