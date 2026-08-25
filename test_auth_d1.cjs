const https = require('https');

function postJson(url, data, token = '') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(url, token = '') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const base = 'https://topcinema-9j3.pages.dev';

  console.log('1. Testing Protected /api/home WITHOUT token (should return 401)...');
  const unauthRes = await getJson(`${base}/api/home`);
  console.log('Unauth Status:', unauthRes.status);
  console.log('Unauth Body:', unauthRes.json);

  console.log('\n2. Testing /api/auth/login with passcode "2026"...');
  const loginRes = await postJson(`${base}/api/auth/login`, { passcode: '***REDACTED***', remember: true });
  console.log('Login Status:', loginRes.status);
  console.log('Login Result:', loginRes.json);

  const token = loginRes.json?.token;
  if (!token) {
    console.error('Failed to get token!');
    return;
  }

  console.log('\n3. Testing Protected /api/home WITH token (should return 200)...');
  const authHomeRes = await getJson(`${base}/api/home`, token);
  console.log('Auth Home Status:', authHomeRes.status);
  console.log('Home Rows count:', authHomeRes.json?.rows?.length);

  console.log('\n4. Testing Cloudflare D1 Favorites: Adding a favorite movie...');
  const addFavRes = await postJson(`${base}/api/favorites`, {
    id: 'film-backrooms-2026',
    title: 'فيلم Backrooms 2026',
    poster: 'https://topcinemaa.co/cover.jpg',
    genres: ['رعب', 'خيال علمي'],
    quality: '1080p'
  }, token);
  console.log('Add Fav Status:', addFavRes.status);
  console.log('Add Fav Result:', addFavRes.json);

  console.log('\n5. Testing Cloudflare D1 Favorites: Fetching categorized favorites...');
  const getFavsRes = await getJson(`${base}/api/favorites`, token);
  console.log('Get Favs Status:', getFavsRes.status);
  console.log('Get Favs Items count:', getFavsRes.json?.items?.length);
  console.log('Sample Fav:', getFavsRes.json?.items?.[0]);

  console.log('\n6. Testing Recommendations API...');
  const recRes = await getJson(`${base}/api/recommendations`, token);
  console.log('Rec Status:', recRes.status);
  console.log('Rec Result:', { title: recRes.json?.title, count: recRes.json?.items?.length });
}

run();
