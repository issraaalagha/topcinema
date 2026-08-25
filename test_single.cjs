const https = require('https');

const target = 'https://topcinemaa.co/%d9%81%d9%8a%d9%84%d9%85-backrooms-2026-%d9%85%d8%aa%d8%b1%d8%ac%d9%85-%d8%a7%d9%88%d9%86-%d9%84%d8%a7%d9%8a%d9%86/';

https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Single movie body length:', body.length);

    // Extract title
    const titleMatch = body.match(/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || body.match(/<title>([\s\S]*?)<\/title>/i);
    console.log('Title:', titleMatch ? titleMatch[1].trim() : 'N/A');

    // Extract story
    const storyMatch = body.match(/<div class="story">([\s\S]*?)<\/div>/i);
    console.log('Story:', storyMatch ? storyMatch[1].replace(/<[^>]+>/g, '').trim() : 'N/A');

    // Extract servers
    const serversMatch = body.match(/<ul class="WatchServers">([\s\S]*?)<\/ul>/i) || body.match(/<div class="watch--servers--list">([\s\S]*?)<\/div>/i);
    console.log('Servers HTML:', serversMatch ? serversMatch[1] : 'N/A');

    // Extract iframe / embed code
    const iframeMatch = body.match(/<div id="EmbedCode">([\s\S]*?)<\/div>/i) || body.match(/<iframe[^>]*src="([^"]+)"/i);
    console.log('Iframe HTML:', iframeMatch ? iframeMatch[0] : 'N/A');

    // Extract taxonomies / info
    const taxMatch = body.match(/<ul class="RightTaxContent">([\s\S]*?)<\/ul>/i);
    console.log('Taxonomies HTML:', taxMatch ? taxMatch[1] : 'N/A');
  });
});
