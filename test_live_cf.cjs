const https = require('https');

function testEndpoint(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, json });
        } catch (e) {
          resolve({ status: res.statusCode, error: 'Not JSON', preview: body.substring(0, 300) });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing /api/home...');
  const homeRes = await testEndpoint('https://topcinema-9j3.pages.dev/api/home');
  console.log('Home Status:', homeRes.status);
  if (homeRes.json) {
    console.log('Home Rows count:', homeRes.json.rows?.length);
    if (homeRes.json.rows?.[0]) {
      console.log('Row 0 Title:', homeRes.json.rows[0].title);
      console.log('Row 0 Items count:', homeRes.json.rows[0].items?.length);
      console.log('Sample item:', homeRes.json.rows[0].items?.[0]);
    }
  } else {
    console.log('Home Failed:', homeRes);
  }

  console.log('\nTesting /api/catalog?category=action...');
  const catRes = await testEndpoint('https://topcinema-9j3.pages.dev/api/catalog?category=action');
  console.log('Catalog Status:', catRes.status);
  if (catRes.json) {
    console.log('Catalog items count:', catRes.json.items?.length);
    console.log('Sample item:', catRes.json.items?.[0]);
  } else {
    console.log('Catalog Failed:', catRes);
  }
}

run();
