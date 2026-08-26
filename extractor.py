#!/usr/bin/env python3
"""
TopCinema Video Extractor
Extracts direct video URLs from multiple streaming servers
"""

import requests
import re
import json
from typing import Dict, List, Optional
from urllib.parse import urlparse, urljoin
import time
import tempfile
import os

class TopCinemaExtractor:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://topcinemaa.co/',
            'Accept': '*/*',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
        })
        
    def get_server_urls(self, movie_id: str) -> Dict[str, str]:
        """Get all server iframe URLs from TopCinema"""
        servers = {}
        base_url = "https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php"
        
        server_names = [
            'VideoTube', 'UpDown', 'StreamWish', 'Doodstream', 
            'Filelions', 'Streamtape', 'LuluStream', 'Mixdrop'
        ]
        
        for i, name in enumerate(server_names):
            try:
                response = self.session.post(
                    base_url,
                    data={'id': movie_id, 'i': str(i)},
                    headers={'X-Requested-With': 'XMLHttpRequest'}
                )
                
                if response.status_code == 200:
                    # Extract iframe src
                    match = re.search(r'src="([^"]+)"', response.text)
                    if match:
                        servers[name] = match.group(1)
                        print(f"✓ {name}: {match.group(1)}")
                
                time.sleep(0.5)
            except Exception as e:
                print(f"✗ {name}: {e}")
                
        return servers
    
    def extract_doodstream(self, url: str) -> Optional[str]:
        """Extract video from Doodstream"""
        try:
            response = self.session.get(url)
            html = response.text
            
            # Doodstream uses pass_md5 token system
            pass_match = re.search(r'/pass_md5/([^/]+)/', html)
            if pass_match:
                token = pass_match.group(1)
                # Build download URL
                base = urlparse(url).netloc
                return f"https://{base}/pass_md5/{token}"
                
        except Exception as e:
            print(f"Doodstream error: {e}")
        return None
    
    def extract_streamtape(self, url: str) -> Optional[str]:
        """Extract video from Streamtape"""
        try:
            response = self.session.get(url)
            html = response.text
            
            # Streamtape obfuscation pattern
            match = re.search(r"robotlink'\).innerHTML = '([^']+)' \+ \('([^']+)'\)", html)
            if match:
                part1, part2 = match.groups()
                video_url = f"https:{part1}{part2}"
                return video_url
                
        except Exception as e:
            print(f"Streamtape error: {e}")
        return None
    
    def extract_mixdrop(self, url: str) -> Optional[str]:
        """Extract video from Mixdrop"""
        try:
            response = self.session.get(url)
            html = response.text
            
            # Mixdrop uses MDCore with packed JS
            match = re.search(r'wurl="([^"]+)"', html)
            if match:
                encoded = match.group(1)
                # Mixdrop URL pattern
                return f"https:{encoded}"
                
        except Exception as e:
            print(f"Mixdrop error: {e}")
        return None
    
    def extract_filelions(self, url: str) -> Optional[str]:
        """Extract video from Filelions"""
        try:
            response = self.session.get(url)
            html = response.text
            
            # Filelions uses similar pattern to other hosts
            match = re.search(r'file:"([^"]+\.m3u8[^"]*)"', html)
            if match:
                return match.group(1)
                
        except Exception as e:
            print(f"Filelions error: {e}")
        return None
    
    def extract_all(self, movie_id: str) -> Dict[str, Optional[str]]:
        """Extract video URLs from all available servers"""
        print(f"\n🎬 Extracting videos for movie ID: {movie_id}\n")
        
        # Get server URLs
        servers = self.get_server_urls(movie_id)
        print(f"\n📡 Found {len(servers)} servers\n")
        
        results = {}
        
        # Extract from each server
        extractors = {
            'Doodstream': self.extract_doodstream,
            'Streamtape': self.extract_streamtape,
            'Mixdrop': self.extract_mixdrop,
            'Filelions': self.extract_filelions
        }
        
        for server_name, server_url in servers.items():
            print(f"🔍 Extracting from {server_name}...")
            
            if server_name in extractors:
                video_url = extractors[server_name](server_url)
                results[server_name] = video_url
                
                if video_url:
                    print(f"✓ Success: {video_url[:80]}...")
                else:
                    print(f"✗ Failed")
            else:
                results[server_name] = None
                print(f"⚠ No extractor available yet")
            
            print()
        
        return results


def main():
    extractor = TopCinemaExtractor()
    
    # Test with Mutiny (2026)
    movie_id = "240823"
    
    results = extractor.extract_all(movie_id)
    
    print("\n" + "="*60)
    print("📊 EXTRACTION RESULTS")
    print("="*60 + "\n")
    
    for server, url in results.items():
        status = "✓" if url else "✗"
        print(f"{status} {server:15} {url or 'Not extracted'}")
    
    # Save results using secure temp file
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', dir=os.getcwd()) as f:
        json.dump(results, f, indent=2)
        output_file = f.name
    
    print(f"\n💾 Results saved to {output_file}")


if __name__ == "__main__":
    main()
