const mongoose = require('mongoose');
const Products = require('../models/Products');

const summary = (items, keysToKeep) => {
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.range]) {
      acc[item.range] = [];
    }
    acc[item.range].push(item);
    return acc;
  }, {});

  const summary = Object.entries(grouped).reduce((acc, [range, items]) => {
    const total = items.reduce((sum, item) => sum + item.count_in_range, 0);
    acc[range] = total;
    return acc;
  }, {});

  return summary;
};

const createZBIORCZA_TP = (application) => {
  const m_spiral_sum = summary(application.m_spiral);
  const m_standard_sum = summary(application.m_standard);
  const m_max_sum = summary(application.m_max);
  const m_raptor_sum = summary(application.m_raptor);

  // Remove empty keys from all matrices
  delete m_spiral_sum[''];
  delete m_standard_sum[''];
  delete m_max_sum[''];
  delete m_raptor_sum[''];

  let main_keys = '';

  switch (application.main_system) {
    case 'spiral':
      main_keys = m_spiral_sum;
      break;
    case 'standard':
      main_keys = m_standard_sum;
      break;
    case 'max':
      main_keys = m_max_sum;
      break;
    case 'raptor':
      main_keys = m_raptor_sum;
      break;
  }

  // FALLBACK: If main_system has no products (all values are 0 or empty),
  // use first available system with products
  const hasProducts = (matrix) => {
    return Object.values(matrix).some(count => count > 0);
  };

  if (!hasProducts(main_keys)) {
    // Try systems in order: standard -> max -> spiral -> raptor
    // Standard/Max have more products in database than Spiral
    const fallbackOrder = [
      { name: 'standard', matrix: m_standard_sum },
      { name: 'max', matrix: m_max_sum },
      { name: 'spiral', matrix: m_spiral_sum },
      { name: 'raptor', matrix: m_raptor_sum }
    ];

    for (const system of fallbackOrder) {
      if (hasProducts(system.matrix)) {
        main_keys = system.matrix;
        console.log(`FALLBACK: Using ${system.name} instead of ${application.main_system}`);
        break;
      }
    }
  }

  return {
    main_keys: main_keys,
    m_spiral: m_spiral_sum,
    m_standard: m_standard_sum,
    m_max: m_max_sum,
    m_raptor: m_raptor_sum,
  };
};

module.exports = { createZBIORCZA_TP };
