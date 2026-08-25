const https = require('https');

const target = 'https://topcinemaa.co/%d9%81%d9%8a%d9%84%d9%85-backrooms-2026-%d9%85%d8%aa%d8%b1%d8%ac%d9%85-%d8%a7%d9%88%d9%86-%d9%84%d8%a7%d9%8a%d9%86/watch/';

https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    // Check all script tags content or src
    const scripts = [...body.matchAll(/<script[^>]*src="([^"]+)"/gi)];
    console.log('Script files:', scripts.map(s => s[1]));
    
    // Check any inline script handling server--item
    const inline = [...body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    const serverScript = inline.filter(s => s[1].includes('server--item') || s[1].includes('data-server') || s[1].includes('EmbedCode'));
    console.log('Server inline scripts found:', serverScript.length);
    serverScript.forEach(s => console.log(s[1]));
  });
});
