/**
 * Video Extractor Service
 * Enterprise-grade video URL extraction with multi-strategy fallback
 * Supports: Direct HLS/MP4, iframe embedding with ad-blocking
 * @module VideoExtractor
 * @version 2.0.0
 */

const EXTRACTION_STRATEGIES = {
  DIRECT: 'direct',
  IFRAME: 'iframe',
  PROXY: 'proxy'
};

const VIDEO_QUALITY = {
  AUTO: 'auto',
  HD_1080: '1080p',
  HD_720: '720p',
  SD_480: '480p'
};

/**
 * Server-specific extractors
 * Each extractor attempts to parse the embed page and extract direct video URLs
 */
const EXTRACTORS = {
  /**
   * VidTube Extractor
   * Parses VidTube embed pages for JWPlayer configuration
   */
  vidtube: {
    name: 'VidTube',
    patterns: [/vidtube\.one/i, /down\.vidtube/i],
    
    async extract(embedUrl) {
      try {
        // Fetch the embed page HTML
        const response = await fetch(embedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://topcinemaa.co/'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        
        // Strategy 1: JWPlayer setup patterns
        const jwPatterns = [
          /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
          /file:\s*["']([^"']+\.mp4[^"']*)["']/i,
          /"file"\s*:\s*["']([^"']+)["']/i,
          /sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i
        ];
        
        for (const pattern of jwPatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            const url = match[1];
            // Validate URL
            if (url.startsWith('http') && (url.includes('.m3u8') || url.includes('.mp4'))) {
              return {
                success: true,
                strategy: EXTRACTION_STRATEGIES.DIRECT,
                url,
                type: url.includes('.m3u8') ? 'hls' : 'mp4',
                quality: VIDEO_QUALITY.AUTO,
                server: 'VidTube'
              };
            }
          }
        }
        
        // Strategy 2: Look for video element sources
        const videoSrcMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i);
        if (videoSrcMatch && videoSrcMatch[1]) {
          return {
            success: true,
            strategy: EXTRACTION_STRATEGIES.DIRECT,
            url: videoSrcMatch[1],
            type: 'mp4',
            quality: VIDEO_QUALITY.AUTO,
            server: 'VidTube'
          };
        }
        
        // Strategy 3: Fallback to iframe with ad-blocking
        return {
          success: true,
          strategy: EXTRACTION_STRATEGIES.IFRAME,
          url: embedUrl,
          requiresAdBlock: true,
          type: 'embed',
          server: 'VidTube'
        };
        
      } catch (error) {
        console.error('[VidTube Extractor] Error:', error);
        return {
          success: false,
          error: error.message,
          fallbackToIframe: true,
          embedUrl
        };
      }
    }
  },

  /**
   * LuluStream Extractor
   */
  lulustream: {
    name: 'LuluStream',
    patterns: [/lulustream/i, /luluvdo/i],
    
    async extract(embedUrl) {
      try {
        const response = await fetch(embedUrl);
        const html = await response.text();
        
        // LuluStream typically uses m3u8
        const patterns = [
          /file:\s*["']([^"']+\.m3u8[^"']*)["']/i,
          /hlsUrl\s*[:=]\s*["']([^"']+)["']/i,
          /source\s+src=["']([^"']+\.m3u8[^"']*)["']/i
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            return {
              success: true,
              strategy: EXTRACTION_STRATEGIES.DIRECT,
              url: match[1],
              type: 'hls',
              quality: VIDEO_QUALITY.AUTO,
              server: 'LuluStream'
            };
          }
        }
        
        return {
          success: true,
          strategy: EXTRACTION_STRATEGIES.IFRAME,
          url: embedUrl,
          requiresAdBlock: false,
          type: 'embed',
          server: 'LuluStream'
        };
        
      } catch (error) {
        return {
          success: false,
          error: error.message,
          fallbackToIframe: true,
          embedUrl
        };
      }
    }
  },

  /**
   * StreamWish Extractor
   */
  streamwish: {
    name: 'StreamWish',
    patterns: [/streamwish/i, /awish\.pro/i],
    
    async extract(embedUrl) {
      try {
        const response = await fetch(embedUrl);
        const html = await response.text();
        
        const patterns = [
          /sources:\s*\[\{[^}]*file:\s*["']([^"']+)["']/i,
          /"file":"([^"]+\.m3u8[^"]*)"/i,
          /file:\s*["']([^"']+\.m3u8[^"']*)["']/i
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            return {
              success: true,
              strategy: EXTRACTION_STRATEGIES.DIRECT,
              url: match[1],
              type: 'hls',
              quality: VIDEO_QUALITY.AUTO,
              server: 'StreamWish'
            };
          }
        }
        
        return {
          success: true,
          strategy: EXTRACTION_STRATEGIES.IFRAME,
          url: embedUrl,
          requiresAdBlock: true,
          type: 'embed',
          server: 'StreamWish'
        };
        
      } catch (error) {
        return {
          success: false,
          error: error.message,
          fallbackToIframe: true,
          embedUrl
        };
      }
    }
  },

  /**
   * Generic/Fallback Extractor
   */
  generic: {
    name: 'Generic',
    patterns: [/.*/],
    
    async extract(embedUrl) {
      try {
        const response = await fetch(embedUrl);
        const html = await response.text();
        
        // Try common video URL patterns
        const allPatterns = [
          /file:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
          /file:\s*["']([^"']+\.mp4[^"']*)["']/gi,
          /"file"\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
          /src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi
        ];
        
        for (const pattern of allPatterns) {
          const matches = [...html.matchAll(pattern)];
          if (matches.length > 0) {
            const url = matches[0][1];
            if (url.startsWith('http')) {
              return {
                success: true,
                strategy: EXTRACTION_STRATEGIES.DIRECT,
                url,
                type: url.includes('.m3u8') ? 'hls' : 'mp4',
                quality: VIDEO_QUALITY.AUTO,
                server: 'Generic'
              };
            }
          }
        }
        
        // Fallback to iframe
        return {
          success: true,
          strategy: EXTRACTION_STRATEGIES.IFRAME,
          url: embedUrl,
          requiresAdBlock: true,
          type: 'embed',
          server: 'Generic'
        };
        
      } catch (error) {
        return {
          success: false,
          error: error.message,
          fallbackToIframe: true,
          embedUrl
        };
      }
    }
  }
};

/**
 * Main extraction coordinator
 * Selects appropriate extractor and handles fallbacks
 */
class VideoExtractorService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Extract video URL from server embed URL
   * @param {string} embedUrl - Server embed URL
   * @param {string} serverName - Server name for hint
   * @returns {Promise<Object>} Extraction result
   */
  async extract(embedUrl, serverName = '') {
    // Check cache first
    const cacheKey = `${embedUrl}_${serverName}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('[VideoExtractor] Cache hit:', serverName);
        return cached.result;
      }
      this.cache.delete(cacheKey);
    }

    console.log('[VideoExtractor] Extracting:', serverName, embedUrl);

    // Select extractor
    let extractor = EXTRACTORS.generic;
    
    for (const [key, ex] of Object.entries(EXTRACTORS)) {
      if (ex.patterns.some(p => p.test(embedUrl) || p.test(serverName))) {
        extractor = ex;
        break;
      }
    }

    console.log('[VideoExtractor] Using extractor:', extractor.name);

    try {
      const result = await extractor.extract(embedUrl);
      
      // Cache successful results
      if (result.success) {
        this.cache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }

      return result;
      
    } catch (error) {
      console.error('[VideoExtractor] Fatal error:', error);
      return {
        success: false,
        error: error.message,
        fallbackToIframe: true,
        embedUrl
      };
    }
  }

  /**
   * Clear extraction cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
export const videoExtractor = new VideoExtractorService();

export { EXTRACTION_STRATEGIES, VIDEO_QUALITY };
