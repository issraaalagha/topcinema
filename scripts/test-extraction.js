#!/usr/bin/env node

/**
 * TopCinema Extraction Test Suite
 * Tests all server extraction methods
 */

const MOVIE_ID = '240823'; // Mutiny (2026)
const API_BASE = 'https://topcinemaa.co/wp-content/themes/movies2023/Ajaxat/Single/Server.php';

const servers = [
  { id: 0, name: 'VideoTube' },
  { id: 1, name: 'UpDown' },
  { id: 2, name: 'StreamWish' },
  { id: 3, name: 'Doodstream' },
  { id: 4, name: 'Filelions' },
  { id: 5, name: 'Streamtape' },
  { id: 6, name: 'LuluStream' },
  { id: 7, name: 'Mixdrop' }
];

async function testServer(server) {
  try {
    const formData = new URLSearchParams();
    formData.append('id', MOVIE_ID);
    formData.append('i', server.id);

    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData.toString()
    });

    const html = await response.text();
    const match = html.match(/src="([^"]+)"/);

    if (match) {
      const iframeUrl = match[1];
      console.log(`✅ ${server.name.padEnd(15)} ${iframeUrl}`);
      return { success: true, url: iframeUrl };
    } else {
      console.log(`❌ ${server.name.padEnd(15)} No iframe URL found`);
      return { success: false, error: 'No iframe URL' };
    }
  } catch (error) {
    console.log(`❌ ${server.name.padEnd(15)} ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🎬 TopCinema Extraction Test Suite\n');
  console.log(`Movie ID: ${MOVIE_ID}\n`);
  console.log('═'.repeat(70));
  console.log('\n');

  const results = [];

  for (const server of servers) {
    const result = await testServer(server);
    results.push({ server: server.name, ...result });
    
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('\n📊 SUMMARY\n');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Successful: ${successful}/${servers.length}`);
  console.log(`❌ Failed: ${failed}/${servers.length}`);
  console.log(`📈 Success Rate: ${((successful / servers.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n⚠️  Failed Servers:');
    results
      .filter(r => !r.success)
      .forEach(r => console.log(`   - ${r.server}: ${r.error}`));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('\n💡 Next Steps:\n');
  console.log('1. Test extraction with browser_extractor.py for detailed results');
  console.log('2. Deploy API: npm run deploy:worker');
  console.log('3. Test player: npm run serve:player\n');

  return results;
}

// Run tests
runTests().catch(console.error);
