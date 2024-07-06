const mongoose = require("mongoose");
const Products = require("../models/Products");

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

  delete m_spiral_sum[""];
  delete m_spiral_sum["220-320"];
  delete m_spiral_sum["320-420"];
  delete m_spiral_sum["350-550"];
  delete m_spiral_sum["550-750"];
  delete m_spiral_sum["750-950"];

  delete m_standard_sum["10-17"];
  delete m_standard_sum["17-30"];
  delete m_standard_sum["350-550"];
  delete m_standard_sum["550-750"];
  delete m_standard_sum["750-950"];

  delete m_standard_sum["10-17"];
  delete m_standard_sum["17-30"];
  delete m_standard_sum["30-50"];

  return {
    m_spiral: m_spiral_sum,
    m_standard: m_standard_sum,
    m_max: m_max_sum,
  };
};

module.exports = { createZBIORCZA_TP };
