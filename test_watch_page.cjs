const https = require('https');

const target = 'https://topcinemaa.co/%d9%81%d9%8a%d9%84%d9%85-backrooms-2026-%d9%85%d8%aa%d8%b1%d8%ac%d9%85-%d8%a7%d9%88%d9%86-%d9%84%d8%a7%d9%8a%d9%86/watch/';

https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Watch page body length:', body.length);

    // Look for watch servers
    const serversMatch = body.match(/<ul class="[^"]*WatchServers[^"]*"[\s\S]*?<\/ul>/i) ||
                         body.match(/<div class="[^"]*watch--servers--list[^"]*"[\s\S]*?<\/div>/i) ||
                         body.match(/<ul class="[^"]*servers[^"]*"[\s\S]*?<\/ul>/i);
    console.log('Servers list HTML:', serversMatch ? serversMatch[0] : 'N/A');

    // Look for embed iframe or player
    const iframeMatch = body.match(/<div id="EmbedCode"[\s\S]*?<\/div>/i) || body.match(/<iframe[^>]*src="([^"]+)"/i);
    console.log('Embed/Player:', iframeMatch ? iframeMatch[0] : 'N/A');

    // Look for list of servers items
    const serverItems = [...body.matchAll(/<li[^>]*data-[^>]*>([\s\S]*?)<\/li>/gi)] ||
                        [...body.matchAll(/<li[^>]*class="[^"]*server[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)];
    console.log('Server items found:', serverItems.length);
    serverItems.forEach((s, idx) => console.log(`Server item ${idx}:`, s[0]));

    // Check all li inside ul
    const allLis = [...body.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/gi)];
    const serverLis = allLis.filter(l => l[1].includes('server') || l[1].includes('data') || l[2].includes('سيرفر') || l[2].includes('Stream') || l[2].includes('Fembed') || l[2].includes('Dood'));
    console.log('Filtered server LIs:', serverLis.map(l => ({ attrs: l[1], inner: l[2].replace(/<[^>]+>/g, '').trim() })));
  });
});
