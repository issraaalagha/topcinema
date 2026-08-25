// Universal Cast & Screen Sharing Integration (Chromecast + Remote Playback + AirPlay)
let castInitialized = false;

export function isCastFrameworkAvailable() {
  return typeof window !== 'undefined' && !!(window.cast && window.cast.framework);
}

export async function initCastFramework() {
  if (castInitialized) return true;
  if (!isCastFrameworkAvailable()) return false;
  try {
    const { cast, chrome } = window;
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED,
      language: 'ar',
    });
    castInitialized = true;
    return true;
  } catch (e) {
    console.warn('Cast initialization error:', e);
    return false;
  }
}

export async function requestCast(videoEl, url, { title = '', poster = null } = {}) {
  // 1. Try Google Cast SDK if framework is available
  if (isCastFrameworkAvailable() || (await initCastFramework())) {
    try {
      const { cast, chrome } = window;
      const context = cast.framework.CastContext.getInstance();
      const session = await context.requestSession();
      if (session) {
        const mediaInfo = new chrome.cast.media.MediaInfo(url, 'application/x-mpegurl');
        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = title;
        if (poster) mediaInfo.metadata.images = [new chrome.cast.Image(poster)];
        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        request.currentTime = videoEl?.currentTime || 0;
        await session.loadMedia(request);
        return { type: 'chromecast', session };
      }
    } catch (e) {
      const msg = String(e).toLowerCase();
      if (msg.includes('cancel') || msg.includes('user_cancel') || msg.includes('abort')) {
        return null;
      }
      console.warn('Chromecast requestSession failed, trying fallbacks...', e);
    }
  }

  // 2. Try Native Remote Playback API (Standard in Modern Chromium/Chrome/Edge)
  if (videoEl && 'remote' in videoEl && typeof videoEl.remote.prompt === 'function') {
    try {
      await videoEl.remote.prompt();
      return { type: 'remote-playback' };
    } catch (e) {
      const msg = String(e).toLowerCase();
      if (msg.includes('cancel') || msg.includes('abort')) {
        return null;
      }
      console.warn('Remote playback prompt failed:', e);
    }
  }

  // 3. Try Apple AirPlay (Safari / iOS / macOS)
  if (videoEl && typeof videoEl.webkitShowPlaybackTargetPicker === 'function') {
    try {
      videoEl.webkitShowPlaybackTargetPicker();
      return { type: 'airplay' };
    } catch (e) {
      console.warn('AirPlay prompt failed:', e);
    }
  }

  throw new Error(
    'تعذر العثور على أجهزة بث متصلة (Chromecast أو Smart TV أو AirPlay). تأكد أن الشاشة وجهازك متصلان بنفس شبكة الـ Wi-Fi.'
  );
}

export function castState() {
  if (!isCastFrameworkAvailable()) return 'NO_CAST';
  const context = window.cast.framework.CastContext.getInstance();
  return context.getCastState();
}
