const http = require('http');

const apps = [
  '68e275a9a91463f340ed5078',  // First app (working)
  '68e285008c40ff76f2ba636a',  // Second app (broken PDF)
];

async function fetchApp(appId) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:3001/api/application/preview/${appId}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

(async () => {
  for (const appId of apps) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`APPLICATION: ${appId}`);
    console.log('='.repeat(60));

    const data = await fetchApp(appId);

    console.log('\nBasic Info:');
    console.log('  Type:', data.application.type);
    console.log('  Main System:', data.application.main_system);
    console.log('  Support Type:', data.application.support_type);
    console.log('  Language:', data.application.lang || 'NOT SET');
    console.log('  Range:', data.application.lowest, '-', data.application.highest);

    console.log('\nOrder Items:', data.order.length);
    data.order.forEach((item, i) => {
      console.log(`  ${i+1}. [${item.series}] ${item.height_mm || 'N/A'} x ${Math.round(item.count || 0)}`);
    });

    console.log('\nBefore Dedup:', data.beforeDeduplicationOrder.length);

    console.log('\nZbiorcza TP:');
    const nonZeroStandard = Object.entries(data.zbiorcza_TP.m_standard || {})
      .filter(([k, v]) => v > 0);
    console.log('  m_standard non-zero:', nonZeroStandard.length);
    nonZeroStandard.forEach(([k, v]) => {
      console.log(`    ${k}: ${v.toFixed(2)}`);
    });
  }

  console.log('\n' + '='.repeat(60));
})();
