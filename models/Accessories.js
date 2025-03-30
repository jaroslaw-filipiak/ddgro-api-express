const mongoose = require('mongoose');

const AccessoriesSchema = new mongoose.Schema({
  code: {
    type: Number,
  },
  name: {
    type: String,
  },
  short_name: {
    type: String,
  },
  height_mm: {
    type: Number,
  },
  height_inch: {
    type: String,
  },
  packaging: {
    type: Number,
  },
  euro_palet: {
    type: Number,
  },
  for_type: {
    type: String,
  },
  system: {
    type: String,
  },
  price_net: {
    type: Number,
  },
});

module.exports = mongoose.model('Accessories', AccessoriesSchema);
