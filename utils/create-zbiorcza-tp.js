const mongoose = require("mongoose");
const Products = require("../models/Products");

const summary = (items) => {
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

  return {
    m_spiral: m_spiral_sum,
    m_standard: m_standard_sum,
    m_max: m_max_sum,
  };
};

module.exports = { createZBIORCZA_TP };
