# دليل النشر السريع 🚀

## الخطوة 1: نشر Cloudflare Workers API ⚡

### تثبيت Wrangler:
```bash
npm install -g wrangler
```

### تسجيل الدخول:
```bash
wrangler login
```

### النشر:
```bash
cd workers
wrangler deploy extraction-api.js --name topcinema-api
```

### التحقق:
```bash
curl https://topcinema-api.YOUR_SUBDOMAIN.workers.dev/
```

**يجب أن تحصل على:**
```json
{
  "name": "TopCinema Video Extraction API",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

---

## الخطوة 2: تحديث المشغل باستخدام API 🎬

افتح `player.html` وحدّث السطر:

```javascript
// من:
const API_URL = 'https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php';

// إلى:
const API_URL = 'https://topcinema-api.YOUR_SUBDOMAIN.workers.dev/api';
```

---

## الخطوة 3: نشر المشغل على Cloudflare Pages 📄

### الطريقة الأولى: من لوحة التحكم

1. اذهب إلى: https://dash.cloudflare.com
2. Pages → Create a project → Upload assets
3. ارفع ملف `player.html`
4. Deploy!

### الطريقة الثانية: من Git

```bash
# تهيئة Git (إذا لم يكن موجوداً)
git init
git add .
git commit -m "Initial commit - TopCinema Player"

# ربط مع GitHub
git remote add origin https://github.com/YOUR_USERNAME/topcinema.git
git push -u origin main

# من Cloudflare Dashboard:
# Pages → Connect to Git → اختر المشروع → Deploy
```

**إعدادات Build:**
- Build command: (فارغ)
- Build output directory: `/`
- Root directory: `/`

---

## الخطوة 4: اختبار شامل 🧪

### اختبر API:
```bash
# احصل على السيرفرات
curl https://topcinema-api.YOUR_SUBDOMAIN.workers.dev/api/servers/240823

# استخرج فيديو
curl https://topcinema-api.YOUR_SUBDOMAIN.workers.dev/api/extract/240823/2
```

### اختبر المشغل:
1. افتح: https://topcinema.pages.dev
2. اختر سيرفر StreamWish أو Mixdrop
3. يجب أن يبدأ التشغيل تلقائياً

### اختبر Chromecast:
1. تأكد من وجود جهاز Chromecast في الشبكة
2. افتح المشغل على Chrome
3. اضغط زر "Cast to TV"
4. اختر الجهاز

---

## الخطوة 5: استخراج محلي باستخدام Playwright 🎭

### تثبيت المتطلبات:
```bash
pip install playwright requests
playwright install chromium
```

### التشغيل:
```bash
python browser_extractor.py
```

### النتيجة:
سيتم حفظ جميع روابط الفيديو في `extraction_results.json`

---

## إعدادات متقدمة ⚙️

### تفعيل HTTPS للـ Cast:

إذا كنت تختبر محلياً، استخدم:

```bash
# تثبيت mkcert
# Windows:
choco install mkcert

# Mac:
brew install mkcert

# Linux:
sudo apt install mkcert

# إنشاء شهادة
mkcert -install
mkcert localhost 127.0.0.1

# تشغيل HTTPS server
npx http-server -S -C localhost+1.pem -K localhost+1-key.pem
```

---

## استكشاف الأخطاء الشائعة 🔧

### خطأ: "Worker exceeded CPU time limit"
**الحل:** قلّل عدد السيرفرات المعالجة في نفس الوقت

```javascript
// في extraction-api.js
// بدلاً من معالجة 8 سيرفرات دفعة واحدة
// عالج 3 سيرفرات فقط في البداية
const serverNames = ['StreamWish', 'Mixdrop', 'LuluStream'];
```

### خطأ: "CORS blocked"
**الحل:** تأكد من وجود CORS headers في Worker:

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
```

### خطأ: "Chromecast not found"
**الحل:**
1. تأكد من استخدام HTTPS
2. تحقق من أن Chromecast في نفس الشبكة
3. جرّب إعادة تشغيل Chromecast

---

## المراقبة والتحليلات 📊

### تفعيل Cloudflare Analytics:

1. اذهب إلى Worker → Metrics
2. شاهد:
   - عدد الطلبات
   - وقت الاستجابة
   - معدل الأخطاء

### إضافة Custom Logging:

```javascript
// في extraction-api.js
console.log({
  timestamp: new Date().toISOString(),
  movieId,
  serverIndex,
  success: !!videoUrl
});
```

---

## تحسين الأداء ⚡

### 1. تفعيل Caching:

```javascript
// في extraction-api.js
const cacheKey = new Request(`${movieId}-${serverIndex}`, request);
const cache = caches.default;

// Check cache first
let response = await cache.match(cacheKey);
if (response) return response;

// ... extract video URL ...

// Cache for 1 hour
response = new Response(JSON.stringify(result), {
  headers: {
    ...corsHeaders,
    'Cache-Control': 'public, max-age=3600'
  }
});

await cache.put(cacheKey, response.clone());
return response;
```

### 2. Parallel Processing:

```javascript
// معالجة متوازية للسيرفرات
const results = await Promise.all(
  serverIndices.map(i => fetchServerIframe(movieId, i))
);
```

---

## النسخ الاحتياطي 💾

### حفظ النتائج:

```bash
# حفظ جميع روابط الفيديو
python browser_extractor.py > results_$(date +%Y%m%d).txt

# أو استخدم jq لمعالجة JSON
python browser_extractor.py
cat extraction_results.json | jq '.[] | select(.video_url != null)'
```

---

## الأمان 🔒

### Best Practices:

1. ✅ لا تكشف API keys في الكود
2. ✅ استخدم Environment Variables:

```bash
# في wrangler.toml
[vars]
ALLOWED_ORIGINS = "https://topcinema.pages.dev"
```

```javascript
// في Worker
if (!env.ALLOWED_ORIGINS.includes(request.headers.get('Origin'))) {
  return new Response('Forbidden', { status: 403 });
}
```

3. ✅ حدّد Rate Limiting:

```javascript
// مثال بسيط
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 30;
  
  const requests = rateLimitMap.get(ip) || [];
  const recentRequests = requests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return true;
}
```

---

## الخلاصة ✅

بعد اتباع هذه الخطوات، سيكون لديك:

- ✅ API عالمي على Cloudflare Workers
- ✅ مشغ فيديو حديث على Cloudflare Pages
- ✅ دعم Chromecast كامل
- ✅ استخراج محلي باستخدام Playwright
- ✅ 8 سيرفرات احتياطية

**الروابط النهائية:**
- API: `https://topcinema-api.YOUR_SUBDOMAIN.workers.dev`
- Player: `https://topcinema.pages.dev`

---

<div align="center">

**🎉 مبروك! مشروعك الآن جاهز للإنتاج**

</div>
