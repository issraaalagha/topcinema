const fs = require('fs');

function unpack(p, a, c, k) {
  while (c--) {
    if (k[c]) {
      const reg = new RegExp('\\b' + c.toString(a) + '\\b', 'g');
      p = p.replace(reg, k[c]);
    }
  }
  return p;
}

async function test() {
  const embedRes = await fetch('https://streamwish.to/e/xz3s3ap3q9ue', {
    headers: { 'Referer': 'https://mycima.com/' }
  });
  const html = await embedRes.text();
  
  const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
  if (!packedMatch) return console.log("No packed data");
  
  const [_, p, a, c, kStr] = packedMatch;
  const k = kStr.split('|');
  const unpackedCode = unpack(p, parseInt(a, 10), parseInt(c, 10), k);
  
  const m3u8Match = unpackedCode.match(/https?:\/\/[^"']+\.m3u8[^"']*/i) || unpackedCode.match(/"hls2":\s*"([^"]+)"/i);
  if (!m3u8Match) return console.log("No m3u8");
  
  const masterUrl = m3u8Match[1] || m3u8Match[0];
  console.log("Master:", masterUrl);
  
  const masterRes = await fetch(masterUrl, { headers: { 'Referer': 'https://streamwish.to/' } });
  const masterText = await masterRes.text();
  console.log("Master Content:", masterText.substring(0, 200));
  
  const lines = masterText.split('\n');
  let variantUrl = lines.find(l => l && !l.startsWith('#'));
  if (variantUrl && !variantUrl.startsWith('http')) {
    variantUrl = new URL(variantUrl, masterUrl).toString();
  }
  console.log("Variant:", variantUrl);
  
  const variantRes = await fetch(variantUrl, { headers: { 'Referer': 'https://streamwish.to/' } });
  const variantText = await variantRes.text();
  
  const vlines = variantText.split('\n');
  let tsUrl = vlines.find(l => l && !l.startsWith('#') && l.endsWith('.ts'));
  if (tsUrl && !tsUrl.startsWith('http')) {
    tsUrl = new URL(tsUrl, variantUrl).toString();
  }
  console.log("TS:", tsUrl);
  
  // Fetch TS without referer to check CORS
  const tsRes = await fetch(tsUrl, { method: 'OPTIONS' });
  console.log("TS OPTIONS CORS:", tsRes.headers.get('access-control-allow-origin'));
  
  const tsResGet = await fetch(tsUrl);
  console.log("TS GET Status:", tsResGet.status);
  console.log("TS GET CORS:", tsResGet.headers.get('access-control-allow-origin'));
}

test().catch(console.error);
