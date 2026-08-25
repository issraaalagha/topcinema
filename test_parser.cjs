const https = require('https');

https.get('https://topcinemaa.co', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    // Look for all Block--Item and Small--Box
    const itemRegex = /<div class="(?:Block--Item|Small--Box)"[\s\S]*?<\/a>\s*<\/div>/gi;
    const matches = body.match(itemRegex) || [];
    console.log('Total items matched:', matches.length);
    
    if (matches.length > 0) {
      console.log('--- FULL ITEM 1 ---');
      console.log(matches[0]);
    }
  });
});
