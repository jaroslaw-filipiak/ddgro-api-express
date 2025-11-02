const http = require('http');

const appId = '68e285008c40ff76f2ba636a';

console.log(`Testing application ${appId}...\n`);

const req = http.get(`http://localhost:3001/api/application/preview/${appId}`, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      console.log('=== APPLICATION ANALYSIS ===\n');
      console.log('Application ID:', json.application._id);
      console.log('Type:', json.application.type);
      console.log('Main System:', json.application.main_system);
      console.log('Lowest:', json.application.lowest);
      console.log('Highest:', json.application.highest);
      console.log('Support Type:', json.application.support_type);
      console.log('Language:', json.application.lang || 'NOT SET');
      console.log('Email:', json.application.email);

      console.log('\n=== ORDER ITEMS ===');
      console.log('Total items in order:', json.order.length);
      console.log('\nItems breakdown:');
      json.order.forEach((item, i) => {
        console.log(`${i+1}. [${item.series}] ${item.height_mm || 'NO HEIGHT'} - Count: ${item.count || 'NO COUNT'} - Name: ${item.name?.en?.substring(0, 40) || 'NO NAME'}`);
      });

      console.log('\n=== BEFORE DEDUPLICATION ===');
      console.log('Total before dedup:', json.beforeDeduplicationOrder.length);

      console.log('\n=== ZBIORCZA_TP MAIN_KEYS ===');
      const mainKeys = Object.keys(json.zbiorcza_TP.main_keys);
      console.log('Main keys count:', mainKeys.length);
      console.log('Main keys:', mainKeys.join(', '));

      console.log('\n=== ZBIORCZA_TP M_STANDARD ===');
      const standardCounts = json.zbiorcza_TP.m_standard;
      const nonZeroCounts = Object.entries(standardCounts).filter(([key, value]) => value > 0);
      console.log('Non-zero standard counts:', nonZeroCounts.length);
      nonZeroCounts.forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });

      console.log('\n=== ADDITIONAL ACCESSORIES ===');
      console.log('Count:', json.application.additional_accessories?.length || 0);
      if (json.application.additional_accessories?.length > 0) {
        json.application.additional_accessories.forEach(acc => {
          console.log(`  - ${acc.name} (ID: ${acc.id}, Count: ${acc.count})`);
        });
      }

    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});
