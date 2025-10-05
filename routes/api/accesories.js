const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Accessories = require('../../models/Accessories');
const Products = require('../../models/Products');

/*
 * @deprecated z tego względu, że akcesoria pobieram z kolekcji produktów
 *
 */

// router.get('/', async function (req, res, next) {
//   try {
//     const accessories = await Accessories.find();
//     res.status(200).json({ data: accessories });
//   } catch (error) {
//     next(error);
//   }
// });

/*
 * Accessories from the Products collection
 * Accessories are identified by the 'AKCW-' prefix in their distance_code
 */

/*
 *
 * { id: 110.041011 } => SBR 200x200x3 60pcs
 * { id: 110.043011 } => SBR 220x220x3 60pcs
 *
 */

router.get('/', async function (req, res, next) {
  try {
    const products = await Products.find({
      distance_code: { $regex: 'AKCW-' },
    });
    res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
});

/*
 * Accessories for the Raptor series
 *
 */
router.get('/for-raptor', async function (req, res, next) {
  const ids = [106.120111, 106.110111];

  try {
    const products = await Products.find({
      id: { $in: ids },
    });
    res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
});

/*
 * Accessories for the Standard series
 *
 */
router.get('/for-standard', async function (req, res, next) {
  const ids = [110.011031, 110.042011, 102.060111, 110.041011];

  try {
    const products = await Products.find({
      id: { $in: ids },
    });
    res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
});

/*
 * Accessories for the Spiral series
 *
 */
router.get('/for-spiral', async function (req, res, next) {
  const ids = [110.013021, 110.042011, 110.041011, 110.051011];

  try {
    const products = await Products.find({
      id: { $in: ids },
    });
    res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
});

/*
 * Accessories for the Max series
 *
 */
router.get('/for-max', async function (req, res, next) {
  const ids = [110.013021, 110.043011, 110.041011, 110.051011];

  try {
    const products = await Products.find({
      id: { $in: ids },
    });
    res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
