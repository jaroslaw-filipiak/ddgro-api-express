// Simulate the PDF generation logic to see what items would be included

const simulate = (appId, orderItems, zbiorczaTP) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Simulating PDF for ${appId}`);
  console.log('='.repeat(60));

  console.log('\n1. Starting items (after dedup):', orderItems.length);
  orderItems.forEach((item, i) => {
    console.log(`   ${i+1}. [${item.series}] ${item.height_mm}`);
  });

  // Simulate addCountAndPriceToItems
  const addCountAndPriceToItems = (items, series, countObj) => {
    const filteredItems = items.filter((item) => {
      const itemCount = Math.round(countObj[item.height_mm] || 0);
      return itemCount > 0;
    });

    const seenHeights = new Set();
    const dedupedItems = [];

    filteredItems.forEach((item) => {
      if (item.series?.toLowerCase() === series.toLowerCase()) {
        if (!seenHeights.has(item.height_mm)) {
          seenHeights.add(item.height_mm);
          const count = Math.round(countObj[item.height_mm] || 0);
          dedupedItems.push({ ...item, count });
        }
      }
    });

    return dedupedItems;
  };

  // OLD WAY (overwriting) - THIS WAS THE BUG
  console.log('\n2. OLD WAY (overwriting each time):');
  let itemsOld = [...orderItems];
  itemsOld = addCountAndPriceToItems(itemsOld, 'spiral', zbiorczaTP.main_keys);
  console.log('   After spiral:', itemsOld.length);
  itemsOld = addCountAndPriceToItems(itemsOld, 'standard', zbiorczaTP.main_keys);
  console.log('   After standard:', itemsOld.length);
  itemsOld = addCountAndPriceToItems(itemsOld, 'max', zbiorczaTP.main_keys);
  console.log('   After max:', itemsOld.length);
  itemsOld = addCountAndPriceToItems(itemsOld, 'raptor', zbiorczaTP.main_keys);
  console.log('   After raptor:', itemsOld.length);
  console.log('   Final items (OLD):');
  itemsOld.forEach((item, i) => {
    console.log(`     ${i+1}. [${item.series}] ${item.height_mm} x ${item.count}`);
  });

  // NEW WAY (accumulating) - THIS IS THE FIX
  console.log('\n3. NEW WAY (accumulating):');
  let itemsNew = [...orderItems];
  const spiralItems = addCountAndPriceToItems(itemsNew, 'spiral', zbiorczaTP.main_keys);
  const standardItems = addCountAndPriceToItems(itemsNew, 'standard', zbiorczaTP.main_keys);
  const maxItems = addCountAndPriceToItems(itemsNew, 'max', zbiorczaTP.main_keys);
  const raptorItems = addCountAndPriceToItems(itemsNew, 'raptor', zbiorczaTP.main_keys);
  console.log('   Spiral items:', spiralItems.length);
  console.log('   Standard items:', standardItems.length);
  console.log('   Max items:', maxItems.length);
  console.log('   Raptor items:', raptorItems.length);
  itemsNew = [...spiralItems, ...standardItems, ...maxItems, ...raptorItems];
  console.log('   Final items (NEW):', itemsNew.length);
  console.log('   Final items (NEW):');
  itemsNew.forEach((item, i) => {
    console.log(`     ${i+1}. [${item.series}] ${item.height_mm} x ${item.count}`);
  });
};

// Simulate for both apps
const app1Order = [
  { series: 'Standard', height_mm: '45-70' },
  { series: 'Standard', height_mm: '70-120' },
  { series: 'Standard', height_mm: '120-220' },
];

const app1Zbiorcza = {
  main_keys: {
    '45-70': 62.18,
    '70-120': 163.64,
    '120-220': 98.18,
  },
};

const app2Order = [
  { series: 'Standard', height_mm: '70-120' },
  { series: 'Standard', height_mm: '120-220' },
];

const app2Zbiorcza = {
  main_keys: {
    '70-120': 131.82,
    '120-220': 268.18,
  },
};

simulate('68e275a9a91463f340ed5078', app1Order, app1Zbiorcza);
simulate('68e285008c40ff76f2ba636a', app2Order, app2Zbiorcza);
