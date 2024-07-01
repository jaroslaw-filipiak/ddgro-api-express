const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Products = require("../../models/Products");

router.get("/", async function (req, res, next) {
  try {
    const products = await Products.find();
    res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
