# 🎬 Video Players Guide

## المشغلات المتاحة:

### 1. **Player.svelte** (الافتراضي - Custom Player)
- ✅ خفيف جداً (~20KB)
- ✅ مخصص بالكامل للعربية و RTL
- ✅ دعم Chromecast
- ✅ HLS.js مدمج
- ✅ تحكم كامل في UI
- ❌ لا يوجد quality selector تلقائي
- ❌ لا يوجد PiP button

### 2. **PlayerPlyr.svelte** (البديل - Plyr)
- ✅ UI احترافي جاهز
- ✅ ترجمة عربية كاملة
- ✅ Quality selector تلقائي
- ✅ PiP (Picture-in-Picture)
- ✅ Airplay support
- ✅ Speed control
- ✅ Keyboard shortcuts
- ✅ Local storage للإعدادات
- ❌ أثقل (~80KB مع Plyr)
- ❌ يحتاج CSS customization للـ RTL الكامل

---

## 🔄 كيفية التبديل:

### في `Watch.svelte`:

```svelte
<script>
  // استخدام Custom Player (الافتراضي)
  import Player from '$lib/player/Player.svelte';
  
  // أو استخدام Plyr Player
  // import Player from '$lib/player/PlayerPlyr.svelte';
</script>

{#if stream}
  <Player src={stream} title={data.title} poster={data.poster} />
{/if}
```

---

## 📦 التثبيت:

```bash
# Plyr مثبت بالفعل في package.json
npm install

# إذا لم يكن مثبت:
npm install plyr
```

---

## 🎨 تخصيص Plyr:

### الألوان:
```css
/* في PlayerPlyr.svelte */
.plyr-wrapper :global(.plyr--video .plyr__control--overlaid) {
  background: var(--accent); /* لون الزر الكبير */
}

.plyr-wrapper :global(.plyr--video .plyr__control:hover) {
  background: var(--accent); /* لون hover */
}
```

### الترجمة العربية:
جميع النصوص مترجمة في الكود - راجع `i18n` object في `PlayerPlyr.svelte`

---

## 📱 Chromecast:

### Custom Player:
```javascript
// الكود موجود في cast.js
import { ensureCast, startCast } from '$lib/cast.js';

// Cast button في Player.svelte
{#if castReady}
  <button class="cast-btn" onclick={onCast}>
    <svg>...</svg>
  </button>
{/if}
```

### Plyr Player:
Plyr **لا يدعم** Chromecast مباشرة، لكن يمكن إضافة custom button:

```javascript
// إضافة cast button لـ Plyr
player.on('ready', () => {
  const castBtn = document.createElement('button');
  castBtn.innerHTML = '📺';
  castBtn.onclick = async () => {
    await startCast(src, { title, poster });
  };
  player.elements.controls.appendChild(castBtn);
});
```

---

## ⚡ الأداء:

| Feature | Custom Player | Plyr Player |
|---------|--------------|-------------|
| Bundle Size | ~20KB | ~80KB |
| Initial Load | سريع جداً | متوسط |
| Memory | قليل | متوسط |
| Customization | 100% | 70% |
| RTL Support | ممتاز | جيد |
| Features | أساسي | متقدم |

---

## 🚀 التوصية:

- **للاستخدام الحالي:** استمر بـ **Custom Player**
  - خفيف وسريع
  - مخصص للعربية
  - Chromecast يعمل

- **للترقية المستقبلية:** استخدم **Plyr Player**
  - إذا احتجت quality selector
  - إذا احتجت PiP
  - إذا احتجت speed control

---

## 📝 ملاحظات:

1. **Chromecast SDK** محمّل في `index.html` ويعمل مع كلا المشغلين
2. **HLS.js** مشترك بين المشغلين
3. يمكنك إنشاء hybrid player يجمع مزايا الاثنين
4. جميع المكتبات تعمل مع Cloudflare Pages بدون مشاكل
