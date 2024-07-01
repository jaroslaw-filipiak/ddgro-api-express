const express = require("express");
const mongoose = require("mongoose");

const ProductsSchema = new mongoose.Schema({
  id: {
    type: Number,
  },
  series: {
    type: String,
  },
  type: {
    type: String,
  },
  distance_code: {
    type: String || Number,
  },
  name: {
    type: String,
  },
  short_name: {
    type: String,
  },
  height_mm: {
    type: String,
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
  price_net: {
    type: Number,
  },
});

module.exports = mongoose.model("Products", ProductsSchema);
