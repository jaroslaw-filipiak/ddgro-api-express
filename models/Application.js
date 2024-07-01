const express = require("express");
const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema({
  type: {
    type: String,
  },
  total_area: {
    type: Number,
  },
  count: {
    type: Number,
  },
  gap_between_slabs: {
    type: Number,
  },
  lowest: {
    type: Number,
  },
  highest: {
    type: Number,
  },
  terrace_thickness: {
    type: Number,
  },
  distance_between_supports: {
    type: Number,
  },
  joist_height: {
    type: Number,
  },
  slab_width: {
    type: Number,
  },
  slab_height: {
    type: Number,
  },
  slab_thickness: {
    type: Number,
  },
  tiles_per_row: {
    type: Number,
  },
  sum_of_tiles: {
    type: Number,
  },
  support_type: {
    type: String,
  },
  main_system: {
    type: String,
  },
  name_surname: {
    type: String,
  },
  email: {
    type: String,
  },
  profession: {
    type: String,
  },
  terms_accepted: {
    type: Boolean,
  },
  slabs_count: {
    type: Number,
  },
  supports_count: {
    type: Number,
  },
  products: {
    type: Array,
  },
  accessories: {
    type: Array,
  },
  additional_accessories: {
    type: Array,
  },
  m_standard: {
    type: Array,
  },
  m_spiral: {
    type: Array,
  },
  m_max: {
    type: Array,
  },
  m_alu: {
    type: Array,
  },
});

module.exports = mongoose.model("Application", ApplicationSchema);
