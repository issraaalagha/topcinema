#!/usr/bin/env python3
"""
Browser-based Video Extractor for Protected Servers
Uses Playwright to bypass Cloudflare and anti-bot protection
"""

import asyncio
import json
import re
import tempfile
import shutil
from typing import Dict, Optional
from playwright.async_api import async_playwright, Page, Browser
from urllib.parse import urlparse

class BrowserExtractor:
    def __init__(self):
        self.browser: Optional[Browser] = None
        self.context = None
        
    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage'
            ]
        )
        
        self.context = await self.browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            viewport={'width': 1920, 'height': 1080},
            locale='en-US',
            timezone_id='America/New_York'
        )
        
        return self
        
    async def __aexit__(self, *args):
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
    
    async def extract_video_url(self, page_url: str, server_name: str) -> Optional[str]:
        """Extract video URL from a streaming server"""
        page = await self.context.new_page()
        
        try:
            await page.goto(page_url, wait_until='networkidle', timeout=30000)
            await page.wait_for_timeout(3000)
            
            video_url = await self._intercept_video_requests(page)
            
            if not video_url:
                video_url = await self._extract_from_dom(page)
            
            if not video_url:
                video_url = await self._extract_from_js(page, server_name)
            
            return video_url
            
        except Exception as e:
            print(f"Error extracting from {server_name}: {e}")
            return None
        finally:
            await page.close()
    
    async def _intercept_video_requests(self, page: Page) -> Optional[str]:
        """Intercept network requests to find video URLs"""
        video_urls = []
        
        async def handle_request(request):
            url = request.url
            if any(ext in url for ext in ['.m3u8', '.mp4', '.ts']):
                if '.m3u8' in url or '.mp4' in url:
                    video_urls.append(url)
        
        page.on('request', handle_request)
        
        try:
            play_selectors = [
                'button[aria-label*="Play"]',
                'button.plyr__control[data-plyr="play"]',
                '.video-js .vjs-big-play-button',
                'button[class*="play"]'
            ]
            
            for selector in play_selectors:
                try:
                    await page.click(selector, timeout=2000)
                    await page.wait_for_timeout(2000)
                    break
                except:
                    continue
        except:
            pass
        
        return video_urls[0] if video_urls else None
    
    async def _extract_from_dom(self, page: Page) -> Optional[str]:
        """Extract video URL from DOM elements"""
        selectors = [
            'video source[src]',
            'video[src]',
            'iframe[src*="player"]'
        ]
        
        for selector in selectors:
            try:
                element = await page.query_selector(selector)
                if element:
                    src = await element.get_attribute('src')
                    if src and ('.m3u8' in src or '.mp4' in src):
                        return src
            except:
                continue
        
        return None
    
    async def _extract_from_js(self, page: Page, server_name: str) -> Optional[str]:
        """Extract video URL from JavaScript variables"""
        
        patterns = {
            'StreamWish': [
                r'file:"([^"]+\.m3u8[^"]*)"',
                r'source:\s*"([^"]+\.m3u8[^"]*)"'
            ],
            'Mixdrop': [
                r'wurl="([^"]+)"',
                r'MDCore\.wurl="([^"]+)"'
            ],
            'Doodstream': [
                r'/pass_md5/([^/\s"]+)',
            ],
            'UpDown': [
                r'sources:\s*\[{file:"([^"]+)"',
                r'file:"([^"]+\.m3u8[^"]*)"'
            ]
        }
        
        try:
            content = await page.content()
            
            if server_name in patterns:
                for pattern in patterns[server_name]:
                    matches = re.findall(pattern, content)
                    if matches:
                        url = matches[0]
                        
                        if server_name == 'Mixdrop' and not url.startswith('http'):
                            url = f"https:{url}"
                        elif server_name == 'Doodstream':
                            base = urlparse(await page.url).netloc
                            url = f"https://{base}/pass_md5/{url}"
                        
                        return url
        except Exception as e:
            print(f"JS extraction error: {e}")
        
        return None


async def extract_all_servers(movie_id: str) -> Dict[str, Optional[str]]:
    """Extract video URLs from all servers for a movie"""
    
    import requests
    base_url = "https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php"
    
    server_names = [
        'VideoTube', 'UpDown', 'StreamWish', 'Doodstream',
        'Filelions', 'Streamtape', 'LuluStream', 'Mixdrop'
    ]
    
    servers = {}
    session = requests.Session()
    
    print(f"\n🎬 Extracting videos for movie ID: {movie_id}\n")
    
    for i, name in enumerate(server_names):
        try:
            response = session.post(
                base_url,
                data={'id': movie_id, 'i': str(i)},
                headers={'X-Requested-With': 'XMLHttpRequest'}
            )
            
            if response.status_code == 200:
                match = re.search(r'src="([^"]+)"', response.text)
                if match:
                    servers[name] = match.group(1)
                    print(f"✓ {name}: {match.group(1)}")
        except Exception as e:
            print(f"✗ {name}: {e}")
    
    print(f"\n📡 Found {len(servers)} server URLs\n")
    
    results = 
    
    async with BrowserExtractor() as extractor:
        for name, url in servers.items():
            print(f"🔍 Extracting from {name}...")
            
            video_url = await extractor.extract_video_url(url, name)
            results[name] = video_url
            
            if video_url:
                print(f"✓ Success: {video_url[:80]}...")
            else:
                print(f"✗ Failed")
            print()
    
    return results


async def main():
    movie_id = "240823"
    
    results = await extract_all_servers(movie_id)
    
    print("\n" + "="*60)
    print("📊 EXTRACTION RESULTS")
    print("="*60 + "\n")
    
    for server, url in results.items():
        status = "✓" if url else "✗"
        print(f"{status} {server:15} {url or 'Not extracted'}")
    
    # Use tempfile for secure writing
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        temp_path = f.name
    
    # Move to current directory with safe name
    final_name = 'extraction_results.json'
    shutil.move(temp_path, final_name)
    print(f"\n💾 Results saved to {final_name}")


if __name__ == "__main__":
    asyncio.run(main())
