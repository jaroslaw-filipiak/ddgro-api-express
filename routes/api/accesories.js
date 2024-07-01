const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Accessories = require("../../models/Accessories");

router.get("/", async function (req, res, next) {
  try {
    const accessories = await Accessories.find();
    res.status(200).json({ data: accessories });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
