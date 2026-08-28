/**
 * Chromecast Manager Service
 * Enterprise-grade Chromecast integration for video casting
 * @module CastManager
 * @version 1.0.0
 */

class CastManager {
  constructor() {
    this.session = null;
    this.mediaSession = null;
    this.available = false;
    this.connected = false;
    this.listeners = new Map();
    this.initPromise = null;
  }

  /**
   * Initialize Chromecast framework
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      // Check if cast framework is already loaded
      if (window.chrome?.cast) {
        this.setupCastFramework();
        resolve();
        return;
      }

      // Load Cast SDK
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      
      script.onload = () => {
        // Wait for cast framework to be ready
        window['__onGCastApiAvailable'] = (isAvailable) => {
          if (isAvailable) {
            this.setupCastFramework();
            resolve();
          } else {
            reject(new Error('Cast API not available'));
          }
        };
      };

      script.onerror = () => {
        reject(new Error('Failed to load Cast SDK'));
      };

      document.head.appendChild(script);
    });

    return this.initPromise;
  }

  /**
   * Setup Cast Framework
   */
  setupCastFramework() {
    const cast = window.chrome?.cast;
    if (!cast || !cast.framework || !cast.framework.CastContext) {
      console.log('[CastManager] Cast framework not loaded or available on this browser');
      return;
    }
    const context = cast.framework.CastContext.getInstance();

    // Configure cast options
    context.setOptions({
      receiverApplicationId: cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: cast.AutoJoinPolicy.ORIGIN_SCOPED,
      language: 'ar',
      resumeSavedSession: true
    });

    this.available = true;

    // Listen for session state changes
    context.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event) => this.handleSessionStateChanged(event)
    );

    context.addEventListener(
      cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      (event) => this.handleCastStateChanged(event)
    );

    console.log('[CastManager] Chromecast framework initialized');
  }

  /**
   * Handle session state changes
   */
  handleSessionStateChanged(event) {
    const cast = window.chrome.cast;
    
    switch (event.sessionState) {
      case cast.framework.SessionState.SESSION_STARTED:
        this.session = event.session;
        this.connected = true;
        this.emit('connected', {
          name: this.session.getCastDevice().friendlyName
        });
        console.log('[CastManager] Cast session started');
        break;

      case cast.framework.SessionState.SESSION_ENDED:
        this.session = null;
        this.mediaSession = null;
        this.connected = false;
        this.emit('disconnected');
        console.log('[CastManager] Cast session ended');
        break;

      case cast.framework.SessionState.SESSION_RESUMED:
        this.session = event.session;
        this.connected = true;
        this.emit('resumed');
        console.log('[CastManager] Cast session resumed');
        break;
    }
  }

  /**
   * Handle cast state changes
   */
  handleCastStateChanged(event) {
    const cast = window.chrome.cast;
    
    switch (event.castState) {
      case cast.framework.CastState.NO_DEVICES_AVAILABLE:
        this.available = false;
        this.emit('devicesChanged', { available: false });
        break;

      case cast.framework.CastState.NOT_CONNECTED:
        this.connected = false;
        break;

      case cast.framework.CastState.CONNECTING:
        this.emit('connecting');
        break;

      case cast.framework.CastState.CONNECTED:
        this.connected = true;
        break;
    }
  }

  /**
   * Cast video to Chromecast device
   * @param {Object} options - Video options
   * @param {string} options.url - Video URL (HLS or MP4)
   * @param {string} options.title - Video title
   * @param {string} options.poster - Poster image URL
   * @param {number} options.currentTime - Start time in seconds
   * @returns {Promise<void>}
   */
  async cast({ url, title = '', poster = '', currentTime = 0, subtitleUrl = '' }) {
    if (!this.available) {
      throw new Error('Chromecast not available');
    }

    const cast = window.chrome.cast;
    const context = cast.framework.CastContext.getInstance();

    try {
      // Request session if not connected
      if (!this.session) {
        await context.requestSession();
        // Wait for session to be established
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!this.session) {
        throw new Error('Failed to establish cast session');
      }

      // Detect content type
      const contentType = url.includes('.m3u8') 
        ? 'application/x-mpegURL' 
        : 'video/mp4';

      // Create media info
      const mediaInfo = new cast.media.MediaInfo(url, contentType);
      mediaInfo.metadata = new cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title;
      mediaInfo.metadata.images = poster ? [
        new cast.Image(poster)
      ] : [];

      // Create load request
      const request = new cast.media.LoadRequest(mediaInfo);
      request.currentTime = currentTime;
      request.autoplay = true;

      // Arabic subtitle track — best-effort only: a rejected track must
      // never break the cast itself.
      if (subtitleUrl) {
        try {
          const sub = new cast.media.Track(1, cast.media.TrackType.TEXT);
          sub.trackContentId = subtitleUrl;
          sub.trackContentType = 'text/vtt';
          sub.subtype = cast.media.TextTrackType.SUBTITLES;
          sub.name = 'العربية';
          sub.language = 'ar';
          mediaInfo.tracks = [sub];
          request.activeTrackIds = [1];
        } catch (subErr) {
          console.warn('[CastManager] Subtitle track skipped:', subErr);
        }
      }

      // Load media
      const session = cast.framework.CastContext.getInstance().getCurrentSession();
      await session.loadMedia(request);

      this.mediaSession = session.getMediaSession();
      
      this.emit('mediaLoaded', {
        title,
        url,
        contentType
      });

      console.log('[CastManager] Media loaded:', title);

    } catch (error) {
      console.error('[CastManager] Cast error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Ensure a cast session exists (initializes framework on first use)
   * @returns {Promise<Object>} the active session
   */
  async requestSession() {
    await this.initialize();
    if (this.session) return this.session;

    const cast = window.chrome.cast;
    const context = cast.framework.CastContext.getInstance();
    await context.requestSession();
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.session = context.getCurrentSession();
    if (!this.session) {
      throw new Error('Failed to establish cast session');
    }
    return this.session;
  }

  /**
   * Legacy-compatible alias used by EnhancedPlayer
   * @param {string} url
   * @param {Object} options
   */
  async castMedia(url, options = {}) {
    return this.cast({
      url,
      title: options.title,
      poster: options.poster,
      currentTime: options.currentTime || 0,
      subtitleUrl: options.subtitleUrl || '',
    });
  }

  /**
   * Toggle play/pause
   */
  togglePlay() {
    if (!this.mediaSession) return;

    const cast = window.chrome.cast;
    const controller = new cast.framework.RemotePlayerController(
      new cast.framework.RemotePlayer()
    );

    if (this.mediaSession.playerState === cast.media.PlayerState.PLAYING) {
      controller.playOrPause();
    } else {
      controller.playOrPause();
    }
  }

  /**
   * Seek to position
   * @param {number} seconds - Time in seconds
   */
  seek(seconds) {
    if (!this.mediaSession) return;

    const cast = window.chrome.cast;
    const player = new cast.framework.RemotePlayer();
    const controller = new cast.framework.RemotePlayerController(player);

    player.currentTime = seconds;
    controller.seek();
  }

  /**
   * Set volume
   * @param {number} level - Volume level (0-1)
   */
  setVolume(level) {
    if (!this.session) return;

    const cast = window.chrome.cast;
    const player = new cast.framework.RemotePlayer();
    const controller = new cast.framework.RemotePlayerController(player);

    player.volumeLevel = Math.max(0, Math.min(1, level));
    controller.setVolumeLevel();
  }

  /**
   * Stop casting and disconnect
   */
  disconnect() {
    if (!this.session) return;

    const cast = window.chrome.cast;
    const context = cast.framework.CastContext.getInstance();
    
    context.endCurrentSession(true);
  }

  /**
   * Check if Chromecast is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.available;
  }

  /**
   * Check if currently connected to a device
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get current device name
   * @returns {string}
   */
  getDeviceName() {
    return this.session?.getCastDevice()?.friendlyName || '';
  }

  /**
   * Event emitter
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => callback(data));
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}

// Singleton instance
export const castManager = new CastManager();
