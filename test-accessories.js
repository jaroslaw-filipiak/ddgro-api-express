const http = require('http');

console.log('Testing accessories fix...\n');

const req = http.get('http://localhost:3001/api/application/preview/68e275a9a91463f340ed5078', (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      console.log('=== TESTING ACCESSORIES IN ORDER ===\n');

      const accessories = json.order.filter(item =>
        item.series === 'Akcesoria wsporniki tarasowe' ||
        item.code?.includes('AKCW')
      );

      if (accessories.length === 0) {
        console.log('❌ No accessories found in order!');
        console.log('\nChecking application.additional_accessories:');
        console.log(JSON.stringify(json.application.additional_accessories, null, 2));
      } else {
        accessories.forEach((item, i) => {
          console.log(`Accessory ${i+1}:`);
          console.log(`  ID: ${item.id}`);
          console.log(`  Name (PL): ${item.name?.pl || 'MISSING'}`);
          console.log(`  Name (EN): ${item.name?.en || 'MISSING'}`);
          console.log(`  Price PLN: ${item.price?.PLN || 'MISSING'}`);
          console.log(`  Price EUR: ${item.price?.EUR || 'MISSING'}`);
          console.log(`  Count: ${item.count}`);
          console.log(`  Total Price: ${item.total_price}`);
          console.log('  Has language_currency_map:', !!item.language_currency_map);
          console.log('');
        });

        console.log('✅ Accessories test completed!');
      }

    } catch (e) {
      console.error('Error:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});
