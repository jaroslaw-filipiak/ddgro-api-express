const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Products = require('../../models/Products');

router.get('/', async function (req, res, next) {
  try {
    const products = await Products.find();
    res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
});

// Get a single product by ID
router.get('/:id', async function (req, res, next) {
  try {
    const { id } = req.params;

    // Find product by numeric ID, not MongoDB's _id
    const product = await Products.findOne({ id: Number(id) });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
});

// Update a product by ID
router.put('/:id', async function (req, res, next) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find and update the product by numeric ID
    const product = await Products.findOneAndUpdate(
      { id: Number(id) },
      updates,
      { new: true, runValidators: true },
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json({
      message: 'Produkt został zaktualizowany',
      data: product,
    });
  } catch (error) {
    next(error);
  }
});
module.exports = router;
