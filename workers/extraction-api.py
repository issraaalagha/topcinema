"""
TopCinema Video Extraction API
Cloudflare Workers endpoint for direct video URL extraction
"""

import json
from typing import Dict, Optional

# Server extraction patterns
SERVER_PATTERNS = {
    'StreamWish': {
        'patterns': [
            r'file:"([^"]+\.m3u8[^"]*)"',
            r'source:\s*"([^"]+\.m3u8[^"]*)"'
        ]
    },
    'Mixdrop': {
        'patterns': [
            r'wurl="([^"]+)"',
            r'MDCore\.wurl="([^"]+)"'
        ],
        'post_process': lambda url: f"https:{url}" if not url.startswith('http') else url
    },
    'LuluStream': {
        'patterns': [
            r'file:"([^"]+\.m3u8[^"]*)"'
        ]
    }
}

async def fetch_server_iframe(movie_id: str, server_index: int) -> Optional[str]:
    """Fetch iframe URL from TopCinema API"""
    url = "https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php"
    
    response = await fetch(url, {
        'method': 'POST',
        'headers': {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
        },
        'body': f'id={movie_id}&i={server_index}'
    })
    
    html = await response.text()
    
    # Extract iframe src
    import re
    match = re.search(r'src="([^"]+)"', html)
    return match.group(1) if match else None


async def extract_video_url(iframe_url: str, server_name: str) -> Optional[str]:
    """Extract direct video URL from server iframe"""
    try:
        response = await fetch(iframe_url, {
            'headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://topcinemaa.co/'
            }
        })
        
        html = await response.text()
        
        if server_name not in SERVER_PATTERNS:
            return None
        
        config = SERVER_PATTERNS[server_name]
        
        for pattern in config['patterns']:
            import re
            matches = re.findall(pattern, html)
            if matches:
                url = matches[0]
                
                # Apply post-processing if exists
                if 'post_process' in config:
                    url = config['post_process'](url)
                
                return url
        
        return None
        
    except Exception as e:
        print(f"Extraction error: {e}")
        return None


async def handle_request(request):
    """Main request handler for Cloudflare Workers"""
    
    # CORS headers
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS
    if request.method == 'OPTIONS':
        return Response(None, {'status': 204, 'headers': cors_headers})
    
    try:
        url = URL(request.url)
        path = url.pathname
        
        # GET /api/servers/:movieId - Get all server URLs
        if path.startswith('/api/servers/'):
            movie_id = path.split('/')[-1]
            
            servers = []
            server_names = [
                'VideoTube', 'UpDown', 'StreamWish', 'Doodstream',
                'Filelions', 'Streamtape', 'LuluStream', 'Mixdrop'
            ]
            
            for i, name in enumerate(server_names):
                iframe_url = await fetch_server_iframe(movie_id, i)
                if iframe_url:
                    servers.append({
                        'id': i,
                        'name': name,
                        'iframe_url': iframe_url,
                        'extractable': name in SERVER_PATTERNS
                    })
            
            return Response(
                json.dumps({'success': True, 'servers': servers}),
                {'headers': cors_headers}
            )
        
        # POST /api/extract - Extract video URL
        elif path == '/api/extract':
            data = await request.json()
            iframe_url = data.get('iframe_url')
            server_name = data.get('server_name')
            
            if not iframe_url or not server_name:
                return Response(
                    json.dumps({'success': False, 'error': 'Missing parameters'}),
                    {'status': 400, 'headers': cors_headers}
                )
            
            video_url = await extract_video_url(iframe_url, server_name)
            
            if video_url:
                return Response(
                    json.dumps({'success': True, 'video_url': video_url}),
                    {'headers': cors_headers}
                )
            else:
                return Response(
                    json.dumps({'success': False, 'error': 'Could not extract video URL'}),
                    {'status': 404, 'headers': cors_headers}
                )
        
        # GET /api/extract/:movieId/:server - Direct extraction
        elif path.startswith('/api/extract/'):
            parts = path.split('/')
            if len(parts) >= 5:
                movie_id = parts[3]
                server_index = int(parts[4])
                
                server_names = [
                    'VideoTube', 'UpDown', 'StreamWish', 'Doodstream',
                    'Filelions', 'Streamtape', 'LuluStream', 'Mixdrop'
                ]
                
                if server_index >= len(server_names):
                    return Response(
                        json.dumps({'success': False, 'error': 'Invalid server index'}),
                        {'status': 400, 'headers': cors_headers}
                    )
                
                server_name = server_names[server_index]
                iframe_url = await fetch_server_iframe(movie_id, server_index)
                
                if not iframe_url:
                    return Response(
                        json.dumps({'success': False, 'error': 'Could not fetch iframe URL'}),
                        {'status': 404, 'headers': cors_headers}
                    )
                
                video_url = await extract_video_url(iframe_url, server_name)
                
                if video_url:
                    return Response(
                        json.dumps({
                            'success': True,
                            'server': server_name,
                            'iframe_url': iframe_url,
                            'video_url': video_url
                        }),
                        {'headers': cors_headers}
                    )
                else:
                    return Response(
                        json.dumps({
                            'success': False,
                            'server': server_name,
                            'iframe_url': iframe_url,
                            'error': 'Could not extract video URL'
                        }),
                        {'status': 404, 'headers': cors_headers}
                    )
        
        # Default response
        return Response(
            json.dumps({
                'name': 'TopCinema Video Extraction API',
                'version': '1.0.0',
                'endpoints': {
                    'GET /api/servers/:movieId': 'Get all server URLs for a movie',
                    'POST /api/extract': 'Extract video URL from iframe',
                    'GET /api/extract/:movieId/:serverIndex': 'Direct extraction'
                }
            }),
            {'headers': cors_headers}
        )
        
    except Exception as e:
        return Response(
            json.dumps({'success': False, 'error': str(e)}),
            {'status': 500, 'headers': cors_headers}
        )


# Cloudflare Workers entry point
addEventListener('fetch', event => {
    event.respondWith(handle_request(event.request))
})
