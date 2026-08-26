/**
 * TopCinema Video Extraction API
 * Cloudflare Workers endpoint for direct video URL extraction
 */

// Server extraction patterns
const SERVER_PATTERNS = {
  'StreamWish': {
    patterns: [
      /file:"([^"]+\.m3u8[^"]*)"/,
      /source:\s*"([^"]+\.m3u8[^"]*)"/
    ]
  },
  'Mixdrop': {
    patterns: [
      /wurl="([^"]+)"/,
      /MDCore\.wurl="([^"]+)"/
    ],
    postProcess: (url) => url.startsWith('http') ? url : `https:${url}`
  },
  'LuluStream': {
    patterns: [
      /file:"([^"]+\.m3u8[^"]*)"/
    ]
  }
};

/**
 * Fetch iframe URL from TopCinema API
 */
async function fetchServerIframe(movieId, serverIndex) {
  const url = 'https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php';
  
  const formData = new URLSearchParams();
  formData.append('id', movieId);
  formData.append('i', serverIndex);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData.toString()
    });
    
    const html = await response.text();
    const match = html.match(/src="([^"]+)"/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error fetching iframe:', error);
    return null;
  }
}

/**
 * Extract direct video URL from server iframe
 */
async function extractVideoUrl(iframeUrl, serverName) {
  try {
    const response = await fetch(iframeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://topcinemaa.co/'
      }
    });
    
    const html = await response.text();
    
    if (!SERVER_PATTERNS[serverName]) {
      return null;
    }
    
    const config = SERVER_PATTERNS[serverName];
    
    for (const pattern of config.patterns) {
      const match = html.match(pattern);
      if (match) {
        let url = match[1];
        
        // Apply post-processing if exists
        if (config.postProcess) {
          url = config.postProcess(url);
        }
        
        return url;
      }
    }
    
    return null;
    
  } catch (error) {
    console.error('Extraction error:', error);
    return null;
  }
}

/**
 * CORS headers
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

/**
 * Main request handler
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  try {
    // GET /api/servers/:movieId - Get all server URLs
    if (path.startsWith('/api/servers/')) {
      const movieId = path.split('/').pop();
      
      const serverNames = [
        'VideoTube', 'UpDown', 'StreamWish', 'Doodstream',
        'Filelions', 'Streamtape', 'LuluStream', 'Mixdrop'
      ];
      
      const servers = [];
      
      for (let i = 0; i < serverNames.length; i++) {
        const iframeUrl = await fetchServerIframe(movieId, i);
        if (iframeUrl) {
          servers.push({
            id: i,
            name: serverNames[i],
            iframe_url: iframeUrl,
            extractable: SERVER_PATTERNS[serverNames[i]] !== undefined
          });
        }
      }
      
      return new Response(
        JSON.stringify({ success: true, servers }),
        { headers: corsHeaders }
      );
    }
    
    // POST /api/extract - Extract video URL
    if (path === '/api/extract' && request.method === 'POST') {
      const data = await request.json();
      const { iframe_url, server_name } = data;
      
      if (!iframe_url || !server_name) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing parameters' }),
          { status: 400, headers: corsHeaders }
        );
      }
      
      const videoUrl = await extractVideoUrl(iframe_url, server_name);
      
      if (videoUrl) {
        return new Response(
          JSON.stringify({ success: true, video_url: videoUrl }),
          { headers: corsHeaders }
        );
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'Could not extract video URL' }),
          { status: 404, headers: corsHeaders }
        );
      }
    }
    
    // GET /api/extract/:movieId/:serverIndex - Direct extraction
    if (path.startsWith('/api/extract/')) {
      const parts = path.split('/').filter(p => p);
      
      if (parts.length >= 4) {
        const movieId = parts[2];
        const serverIndex = parseInt(parts[3]);
        
        const serverNames = [
          'VideoTube', 'UpDown', 'StreamWish', 'Doodstream',
          'Filelions', 'Streamtape', 'LuluStream', 'Mixdrop'
        ];
        
        if (serverIndex >= serverNames.length) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid server index' }),
            { status: 400, headers: corsHeaders }
          );
        }
        
        const serverName = serverNames[serverIndex];
        const iframeUrl = await fetchServerIframe(movieId, serverIndex);
        
        if (!iframeUrl) {
          return new Response(
            JSON.stringify({ success: false, error: 'Could not fetch iframe URL' }),
            { status: 404, headers: corsHeaders }
          );
        }
        
        const videoUrl = await extractVideoUrl(iframeUrl, serverName);
        
        if (videoUrl) {
          return new Response(
            JSON.stringify({
              success: true,
              server: serverName,
              iframe_url: iframeUrl,
              video_url: videoUrl
            }),
            { headers: corsHeaders }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              server: serverName,
              iframe_url: iframeUrl,
              error: 'Could not extract video URL'
            }),
            { status: 404, headers: corsHeaders }
          );
        }
      }
    }
    
    // Default response - API documentation
    return new Response(
      JSON.stringify({
        name: 'TopCinema Video Extraction API',
        version: '1.0.0',
        endpoints: {
          'GET /api/servers/:movieId': 'Get all server URLs for a movie',
          'POST /api/extract': 'Extract video URL from iframe (body: {iframe_url, server_name})',
          'GET /api/extract/:movieId/:serverIndex': 'Direct extraction (0-7)'
        },
        example: {
          get_servers: '/api/servers/240823',
          extract: '/api/extract/240823/2'
        }
      }),
      { headers: corsHeaders }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Cloudflare Workers entry point
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
