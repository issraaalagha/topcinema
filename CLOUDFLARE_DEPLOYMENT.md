# 🌐 Cloudflare Pages Deployment Guide

## 📋 المتطلبات:
- حساب Cloudflare (مجاني)
- Git repository (GitHub, GitLab, or Bitbucket)
- المشروع جاهز للـ build

---

## 🚀 الطريقة الأولى: عبر Cloudflare Dashboard (الأسهل)

### 1. ربط Repository:
1. اذهب إلى [Cloudflare Dashboard](https://dash.cloudflare.com)
2. اختر **Pages** من القائمة الجانبية
3. اضغط **Create a project**
4. اختر **Connect to Git**
5. اختر GitHub/GitLab
6. اختر repository المشروع

### 2. إعدادات Build:
```yaml
Framework preset: Vite
Build command: npm run build
Build output directory: apps/web/dist
Root directory: apps/web
Node version: 18
```

### 3. Environment Variables (اختياري):
```
NODE_VERSION=18
```

### 4. Deploy:
اضغط **Save and Deploy** ✅

---

## 🛠️ الطريقة الثانية: عبر Wrangler CLI

### 1. تثبيت Wrangler:
```bash
npm install -g wrangler

# تسجيل الدخول
wrangler login
```

### 2. Build المشروع:
```bash
cd apps/web
npm install
npm run build
```

### 3. Deploy:
```bash
# من داخل apps/web
wrangler pages deploy dist --project-name=topcinema
```

---

## 🔧 ملف wrangler.toml (اختياري)

إذا أردت استخدام Cloudflare Workers أيضاً:

```toml
name = "topcinema"
compatibility_date = "2024-08-25"
pages_build_output_dir = "dist"

[build]
command = "npm run build"

[[pages]]
functions_dir = "./functions"
```

---

## 🌍 Custom Domain

بعد Deploy الأول:

1. اذهب إلى **Pages** > **topcinema** > **Custom domains**
2. اضغط **Set up a custom domain**
3. أدخل نطاقك (مثلاً: `cinema.example.com`)
4. اتبع التعليمات لإضافة CNAME record

---

## ⚡ Cloudflare Workers (للـ API Proxy - اختياري)

إذا احتجت CORS bypass أو caching للـ API:

### إنشاء Worker:

```javascript
// functions/_middleware.js
export async function onRequest(context) {
  const response = await context.next();
  
  // إضافة CORS headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  return newResponse;
}
```

### API Proxy Example:

```javascript
// functions/api/movies/[id].js
export async function onRequestGet(context) {
  const { id } = context.params;
  const apiUrl = `https://topcinemaa.co/api/movie/${id}`;
  
  // Cache في Cloudflare
  const cache = caches.default;
  let response = await cache.match(apiUrl);
  
  if (!response) {
    response = await fetch(apiUrl);
    // Cache لمدة ساعة
    const cacheResponse = response.clone();
    context.waitUntil(
      cache.put(apiUrl, cacheResponse)
    );
  }
  
  return response;
}
```

---

## 🔒 Environment Variables (متغيرات البيئة)

في Cloudflare Dashboard:

1. **Pages** > **topcinema** > **Settings** > **Environment variables**
2. أضف:
```
NODE_ENV=production
VITE_API_URL=https://topcinemaa.co
```

---

## 📊 Performance Optimizations

### 1. في `vite.config.js`:

```javascript
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'player': ['hls.js', 'plyr'],
          'svelte': ['svelte']
        }
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true // إزالة console.log
      }
    }
  }
}
```

### 2. Headers للـ Caching:

إنشاء `_headers` file في `apps/web/public`:

```
/*
  Cache-Control: public, max-age=3600
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.png
  Cache-Control: public, max-age=31536000, immutable

/*.jpg
  Cache-Control: public, max-age=31536000, immutable

/*.svg
  Cache-Control: public, max-age=31536000, immutable
```

### 3. Redirects (اختياري):

إنشاء `_redirects` file في `apps/web/public`:

```
# SPA Fallback
/*    /index.html   200
```

---

## 🐛 استكشاف الأخطاء:

### Build Failed؟
1. تأكد أن `package.json` في `apps/web` وليس الـ root
2. تأكد من `NODE_VERSION=18` في Environment Variables
3. تحقق من الـ logs في Cloudflare Dashboard

### 404 Errors؟
1. أضف `_redirects` file كما بالأعلى
2. تأكد أن `hash router` يعمل في Svelte (موجود بالفعل `#/`)

### CORS Issues؟
1. استخدم Cloudflare Workers middleware
2. أو اطلب من صاحب الـ API إضافة domain الخاص بك

---

## 📱 PWA Support (تطبيق Progressive Web App)

الملفات موجودة بالفعل:
- ✅ `manifest.webmanifest`
- ✅ Icons في `/icons`
- ✅ Service worker (يمكن إضافته)

لإضافة Service Worker:

```javascript
// apps/web/public/sw.js
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('topcinema-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/icons/icon.svg'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

ثم في `main.js`:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

## 🎯 Checklist قبل Deploy:

- [ ] `npm run build` يعمل بدون أخطاء
- [ ] تأكدت من حجم الـ bundle (يجب أن يكون < 1MB)
- [ ] أضفت `_headers` و `_redirects`
- [ ] اختبرت على localhost بـ `npm run preview`
- [ ] حذفت `console.log` من الكود
- [ ] تأكدت من عمل Chromecast SDK من external CDN
- [ ] اختبرت على أجهزة مختلفة

---

## 📈 Monitoring & Analytics

بعد Deploy:

1. **Web Analytics** (مجاني من Cloudflare):
   - Pages > Settings > Web Analytics
   - أضف الـ script في `index.html`

2. **Sentry** للـ Error Tracking (اختياري):
   ```bash
   npm install @sentry/svelte
   ```

---

## 💰 التكلفة:

- **Cloudflare Pages**: مجاني تماماً
  - Unlimited requests
  - 500 builds/month
  - Unlimited bandwidth

- **Cloudflare Workers**: مجاني حتى
  - 100,000 requests/day
  - 10ms CPU time

**للاستخدام الشخصي: 100% مجاني!** ✅

---

## 🔗 روابط مفيدة:

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Vite Deployment](https://vitejs.dev/guide/static-deploy.html)

---

## 🆘 دعم:

إذا واجهت مشاكل:
1. راجع Build logs في Cloudflare Dashboard
2. جرب Build محلياً أولاً: `npm run build && npm run preview`
3. تحقق من [Cloudflare Community](https://community.cloudflare.com/)
