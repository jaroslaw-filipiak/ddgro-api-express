const mongoose = require('mongoose');

/*
 *
 * Tą kolekcję robie całkowicie @deprecated z tego względu, że
 * akcesoria są w produktach jako AKCW- także wolałbym mieć wszystko w jednej kolekcji
 *
 */
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
