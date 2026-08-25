// Chromecast Web Sender integration
let ready = false;

export function castAvailable() {
  return new Promise((resolve) => {
    if (window.cast && window.cast.framework) return resolve(true);
    const handler = (e) => resolve(!!e.detail?.loaded);
    window.addEventListener('cast-available', handler, { once: true });
    setTimeout(() => resolve(!!(window.cast && window.cast.framework)), 4000);
  });
}

export async function ensureCast() {
  if (ready) return true;
  if (!(await castAvailable())) return false;
  const { cast } = window;
  const context = cast.framework.CastContext.getInstance();
  context.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: cast.AutoJoinPolicy.TAB_AND_ORIGIN_SCOPED,
    language: 'ar',
  });
  ready = true;
  return true;
}

export async function startCast(url, { title = '', poster = null } = {}) {
  if (!(await ensureCast())) throw new Error('CAST_UNAVAILABLE');
  const { cast, chrome } = window;
  const context = cast.framework.CastContext.getInstance();
  const session = await context.requestSession();
  const mediaInfo = new chrome.cast.media.MediaInfo(url, 'application/x-mpegurl');
  mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
  mediaInfo.metadata.title = title;
  if (poster) mediaInfo.metadata.images = [new chrome.cast.Image(poster)];
  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;
  request.currentTime = 0;
  await session.loadMedia(request);
  return session;
}

export function castState() {
  if (!(window.cast && window.cast.framework)) return 'NO_CAST';
  const context = window.cast.framework.CastContext.getInstance();
  const s = context.getCastState();
  return s; // CONNECTED / NOT_CONNECTED / CONNECTING
}
