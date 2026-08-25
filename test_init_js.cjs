const https = require('https');

const target = 'https://topcinemaa.co/wp-content/themes/movies2023/Init.js';

https.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    // Find server--item click handler
    const match = body.match(/\.server--item[\s\S]*?\n\s*\}\);/i) || body.match(/server--item[\s\S]{1,400}/i);
    console.log('Init.js snippet:', match ? match[0] : 'N/A');
    
    // Search for ajax / post requests
    const ajaxCalls = [...body.matchAll(/\$\.ajax\(\{[\s\S]*?\}\);/gi)];
    console.log('Ajax calls count:', ajaxCalls.length);
    ajaxCalls.forEach((a, i) => console.log(`Ajax ${i}:`, a[0].substring(0, 300)));
  });
});
