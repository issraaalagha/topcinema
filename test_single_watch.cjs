const https = require('https');

const target = 'https://topcinemaa.co/%d9%81%d9%8a%d9%84%d9%85-backrooms-2026-%d9%85%d8%aa%d8%b1%d8%ac%d9%85-%d8%a7%d9%88%d9%86-%d9%84%d8%a7%d9%8a%d9%86/';

https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    // Look for watch links
    const watchLinks = [...body.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*(?:watch|btn|download)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    console.log('Watch/Action links:', watchLinks.map(m => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() })));
    
    // Look for any links with watch or play
    const allLinks = [...body.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const filtered = allLinks.filter(l => l[1].includes('watch') || l[2].includes('مشاهدة') || l[2].includes('سيرفر'));
    console.log('Filtered watch links:', filtered.map(m => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() })));

    // Check for iframes or embeds anywhere in body
    const iframes = [...body.matchAll(/<iframe[^>]*src="([^"]+)"/gi)];
    console.log('Iframes found:', iframes.map(i => i[1]));

    // Check for any JavaScript embed data or servers array
    const scripts = [...body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    const relevantScripts = scripts.filter(s => s[1].includes('server') || s[1].includes('embed') || s[1].includes('player') || s[1].includes('ajax'));
    console.log('Relevant scripts count:', relevantScripts.length);
    relevantScripts.slice(0, 3).forEach((s, idx) => console.log(`Script ${idx}:`, s[1].substring(0, 300)));
  });
});
