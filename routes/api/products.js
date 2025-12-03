const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Products = require('../../models/Products');

router.get('/', async function (req, res, next) {
  const startTime = Date.now();
  try {
    console.log('📊 Products API - Starting query');

    const products = await Products.find();

    const duration = Date.now() - startTime;
    const dataSize = JSON.stringify(products).length;

    console.log(`📊 Products API - Query completed:`, {
      duration: `${duration}ms`,
      count: products.length,
      dataSize: `${Math.round(dataSize / 1024)}KB`,
      memoryUsage: `${Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024,
      )}MB`,
    });

    res.status(200).json({ data: products });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `❌ Products API - Error after ${duration}ms:`,
      error.message,
    );
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

// Get products by series (case-insensitive)
router.get('/series/:series', async function (req, res, next) {
  try {
    let { series } = req.params;

    // Map "clever" slug to "Clever Level"
    if (series.toLowerCase() === 'clever') {
      series = 'Clever Level';
    }

    // Case-insensitive search: matches "standard", "Standard", "STANDARD", etc.
    const products = await Products.find({
      series: new RegExp(`^${series}$`, 'i'),
    });

    // Extract unique ranges from products - checking multiple possible fields
    const ranges = [
      ...new Set(products.map((p) => p.height_mm).filter(Boolean)),
    ];

    res.status(200).json({
      data: {
        products,
        length: products.length,
        ranges,
      },
    });
  } catch (error) {
    next(error);
  }
});
module.exports = router;
