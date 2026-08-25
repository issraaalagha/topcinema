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
  const slug = '%d9%81%d9%8a%d9%84%d9%85-backrooms-2026-%d9%85%d8%aa%d8%b1%d8%ac%d9%85-%d8%a7%d9%88%d9%86-%d9%84%d8%a7%d9%8a%d9%86';
  console.log('Testing /api/post/' + slug + '...');
  const postRes = await testEndpoint(`https://topcinema-9j3.pages.dev/api/post/${slug}`);
  console.log('Post Status:', postRes.status);
  if (postRes.json) {
    console.log('Post Details:', {
      title: postRes.json.post?.title,
      quality: postRes.json.post?.quality,
      year: postRes.json.post?.year,
      duration: postRes.json.post?.duration,
      story: postRes.json.post?.story?.substring(0, 80) + '...',
      serversCount: postRes.json.servers?.length,
      servers: postRes.json.servers
    });

    if (postRes.json.servers?.[0]) {
      const srv = postRes.json.servers.find(s => s.name.includes('StreamWish')) || postRes.json.servers[0];
      console.log('\nTesting /api/resolve/' + slug + '/' + srv.server + '...');
      const resolveRes = await testEndpoint(`https://topcinema-9j3.pages.dev/api/resolve/${slug}/${srv.server}`);
      console.log('Resolve Status:', resolveRes.status);
      console.log('Resolve JSON:', resolveRes.json);
    }
  } else {
    console.log('Post Failed:', postRes);
  }
}

run();
