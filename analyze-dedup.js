const https = require('http');

const req = https.get('http://localhost:3001/api/application/preview/68e275a9a91463f340ed5078', (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      console.log('=== PORÓWNANIE PRZED I PO DEDUPLIKACJI ===\n');
      console.log('Przed deduplikacją:', json.beforeDeduplicationOrder.length, 'produktów');
      console.log('Po deduplikacji:', json.order.length, 'produktów');
      console.log('Usunięto duplikatów:', json.beforeDeduplicationOrder.length - json.order.length);

      console.log('\n=== PRODUKTY PRZED DEDUPLIKACJĄ ===');
      json.beforeDeduplicationOrder.forEach((item, i) => {
        console.log(`${i+1}. [${item.series}] ${item.height_mm} - ${item.name.en.substring(0, 50)}`);
      });

      console.log('\n=== PRODUKTY PO DEDUPLIKACJI ===');
      json.order.forEach((item, i) => {
        console.log(`${i+1}. [${item.series}] ${item.height_mm} - ${item.name.en.substring(0, 50)}`);
      });

      // Find duplicates
      console.log('\n=== USUNIĘTE DUPLIKATY ===');
      const orderKeys = new Set(json.order.map(item => `${item.series}-${item.height_mm}`));
      json.beforeDeduplicationOrder.forEach((item, i) => {
        const key = `${item.series}-${item.height_mm}`;
        const isDuplicate = json.beforeDeduplicationOrder.findIndex(x => `${x.series}-${x.height_mm}` === key) !== i;
        if (isDuplicate) {
          console.log(`❌ DUPLIKAT: [${item.series}] ${item.height_mm} - ${item.name.en.substring(0, 50)}`);
        }
      });

    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});
