const https = require('https');
const querystring = require('querystring');

const postData = querystring.stringify({
  id: '229904',
  i: '2' // StreamWish
});

const req = https.request('https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Referer': 'https://topcinemaa.co/',
    'X-Requested-With': 'XMLHttpRequest'
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Server response:', body);
  });
});

req.write(postData);
req.end();
