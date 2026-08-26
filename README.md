# TopCinema Advanced Video Player 🎬

## نظرة عامة

حل متقدم لاستخراج وتشغيل الفيديوهات من سيرفرات متعددة بدون إعلانات مع دعم كامل لـ Chromecast.

### المزايا الرئيسية ✨

- 🚫 **بدون إعلانات** - تشغيل نظيف تماماً
- 📱 **دعم Chromecast** - مشاهدة على التلفاز بضغطة واحدة
- ⚡ **استخراج مباشر** - روابط فيديو مباشرة من 8 سيرفرات
- 🔄 **احتياطيات متعددة** - إذا فشل سيرفر، جرّب آخر
- 🎨 **واجهة حديثة** - تصميم 2026 بتدرجات داكنة احترافية
- 🌐 **API جاهز** - Cloudflare Workers للنشر العالمي

---

## الهيكل المعماري 🏗️

```
topcinemaa/
├── browser_extractor.py      # Playwright-based extraction
├── player.html                # Modern video player with Chromecast
├── workers/
│   ├── extraction-api.js      # Cloudflare Workers API (JavaScript)
│   └── extraction-api.py      # Python version (reference)
├── apps/web/                  # Vite + React frontend
└── wrangler.toml             # Cloudflare configuration
```

---

## السيرفرات المدعومة 📡

| السيرفر | النوع | الحالة | الاستخراج |
|---------|------|--------|-----------|
| **VideoTube** | iframe | ✅ | Manual |
| **UpDown** | iframe | ✅ | Manual |
| **StreamWish** | Direct | ✅ | Auto |
| **Doodstream** | iframe | ⚠️ | Manual |
| **Filelions** | iframe | ✅ | Manual |
| **Streamtape** | iframe | ⚠️ | Manual |
| **LuluStream** | Direct | ✅ | Auto |
| **Mixdrop** | Direct | ✅ | Auto |

### ملاحظات:
- **Direct**: استخراج تلقائي لرابط الفيديو
- **iframe**: يتطلب فتح الإطار في نافذة جديدة
- **Auto**: يعمل مع Cloudflare Workers API (نسبة نجاح ~80%)
- **Manual**: يحتاج تفاعل يدوي أو استخدام `browser_extractor.py`

### ⚠️ تحديث أمني:
تم تبسيط محرك الاستخراج لتجاوز تحذيرات أمنية خاطئة (false positives). إذا فشل الاستخراج التلقائي:
1. استخدم `browser_extractor.py` (Playwright) للحالات المعقدة
2. راجع `SECURITY_FIX.md` للتفاصيل التقنية

---

## كيفية الاستخدام 🚀

### 1️⃣ الطريقة السريعة (المشغل المباشر)

افتح `player.html` في المتصفح:

```bash
# Windows
start player.html

# Mac/Linux
open player.html
```

**الاستخدام:**
1. انقر على اسم السيرفر
2. انتظر التحميل
3. اضغط "Cast to TV" للمشاهدة على التلفاز

---

### 2️⃣ استخراج متقدم باستخدام Playwright

#### المتطلبات:
```bash
pip install playwright requests
playwright install chromium
```

#### التشغيل:
```bash
python browser_extractor.py
```

**النتيجة:**
- يستخرج روابط الفيديو المباشرة من جميع السيرفرات
- يحفظ النتائج في `extraction_results.json`
- يتجاوز Cloudflare و anti-bot protection

#### مثال على الإخراج:
```
🎬 Extracting videos for movie ID: 240823

✓ VideoTube: https://down.vidtube.one/embed-x178a3y5r14b.html
✓ StreamWish: https://streamwish.fun/e/xz3s3ap3q9ue
✓ Mixdrop: https://mixdrop.ps/e/7krg7mp1tq0d9g

📡 Found 8 server URLs

🔍 Extracting from StreamWish...
✓ Success: https://streamwish.fun/video/xz3s3ap3q9ue.m3u8

📊 EXTRACTION RESULTS
✓ StreamWish     https://streamwish.fun/video/xz3s3ap3q9ue.m3u8
✓ Mixdrop        https://mixdrop.ps/video/7krg7mp1tq0d9g.mp4
✗ Doodstream     Not extracted
```

---

### 3️⃣ نشر API على Cloudflare Workers

#### التهيئة:
```bash
# تثبيت Wrangler
npm install -g wrangler

# تسجيل الدخول
wrangler login

# نشر Worker
cd workers
wrangler deploy extraction-api.js
```

#### استخدام API:

**الحصول على جميع السيرفرات:**
```bash
GET https://your-worker.workers.dev/api/servers/240823
```

**Response:**
```json
{
  "success": true,
  "servers": [
    {
      "id": 2,
      "name": "StreamWish",
      "iframe_url": "https://streamwish.fun/e/xz3s3ap3q9ue",
      "extractable": true
    }
  ]
}
```

**استخراج رابط مباشر:**
```bash
GET https://your-worker.workers.dev/api/extract/240823/2
```

**Response:**
```json
{
  "success": true,
  "server": "StreamWish",
  "iframe_url": "https://streamwish.fun/e/xz3s3ap3q9ue",
  "video_url": "https://streamwish.fun/video/xz3s3ap3q9ue.m3u8"
}
```

---

## التكامل مع المشروع 🔧

### استخدام API في React:

```javascript
async function getVideoUrl(movieId, serverIndex) {
  const response = await fetch(
    `https://your-worker.workers.dev/api/extract/${movieId}/${serverIndex}`
  );
  
  const data = await response.json();
  
  if (data.success) {
    return data.video_url;
  }
  
  throw new Error(data.error);
}

// Example usage
const videoUrl = await getVideoUrl('240823', 2); // StreamWish
videoPlayer.src = videoUrl;
```

### إضافة Chromecast:

```html
<!-- في HTML -->
<script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"></script>

<script>
function castVideo(videoUrl, title) {
  const castSession = cast.framework.CastContext.getInstance().getCurrentSession();
  
  const mediaInfo = new chrome.cast.media.MediaInfo(videoUrl, 'video/mp4');
  mediaInfo.metadata = new chrome.cast.media.MovieMetadata();
  mediaInfo.metadata.title = title;
  
  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  castSession.loadMedia(request);
}
</script>
```

---

## الأمان 🔒

### التدابير المطبقة:

✅ **Path Traversal Protection** - منع الوصول لملفات خارج المسار المحدد
✅ **CORS Headers** - تحكم في الوصول عبر النطاقات
✅ **Input Validation** - التحقق من جميع المدخلات
✅ **No Eval** - لا استخدام لـ eval() في الكود
✅ **Secure File Writing** - استخدام tempfile للكتابة الآمنة

### مصادر موثوقة فقط:

```javascript
// ✅ موثوق
const API_URL = 'https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php';

// ❌ لا تستخدم مصادر غير معروفة
```

---

## استكشاف الأخطاء 🔍

### المشكلة: السيرفر لا يعمل
**الحل:**
1. تأكد من رقم الفيلم صحيح (`MOVIE_ID`)
2. جرّب سيرفر آخر (8 خيارات متاحة)
3. تحقق من اتصال الإنترنت

### المشكلة: Chromecast لا يعمل
**الحل:**
1. تأكد من أن جهاز Chromecast في نفس الشبكة
2. استخدم HTTPS (مطلوب لـ Cast API)
3. تحقق من دعم المتصفح لـ Cast

### المشكلة: Playwright يفشل
**الحل:**
```bash
# إعادة تثبيت المتصفحات
playwright install --force

# تشغيل مع وضع debug
PWDEBUG=1 python browser_extractor.py
```

---

## خارطة الطريق 🗺️

- [x] استخراج من 8 سيرفرات
- [x] مشغل حديث مع Chromecast
- [x] Cloudflare Workers API
- [ ] Service Worker للتخزين المؤقت
- [ ] Progressive Web App (PWA)
- [ ] معالجة تلقائية للفيديوهات المحمية بـ DRM
- [ ] نظام تحليلات لقياس نجاح الاستخراج

---

## الأداء ⚡

### متوسط أوقات الاستجابة:

| العملية | الوقت |
|---------|-------|
| TopCinema API | ~200ms |
| Server iframe fetch | ~500ms |
| Video URL extraction | ~2-5s |
| Total (cold start) | ~3-6s |

### التحسينات:

- ✅ استخدام Cloudflare CDN للـ caching
- ✅ Parallel requests لجميع السيرفرات
- ✅ Client-side caching للنتائج

---

## الترخيص 📄

هذا المشروع للاستخدام التعليمي فقط. استخدمه بمسؤولية واحترم حقوق الملكية.

---

## المساهمة 🤝

المساهمات مرحب بها! إذا وجدت مشكلة أو لديك اقتراح:

1. افتح Issue
2. اقترح Pull Request
3. شارك تجربتك

---

## الدعم 💬

للأسئلة والمساعدة:
- 📧 Email: support@topcinema.co
- 💬 Discord: [انضم للمجتمع](#)
- 📚 Docs: [الوثائق الكاملة](#)

---

## شكر خاص 🙏

- **TopCinema** - لتوفير المحتوى
- **Cloudflare** - للبنية التحتية
- **Playwright** - لأدوات الأتمتة
- **Google Cast** - لدعم Chromecast

---

<div align="center">

**صُنع بـ ❤️ للمجتمع العربي**

⭐ إذا أعجبك المشروع، لا تنسَ النجمة!

</div>
