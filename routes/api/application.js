const express = require('express');
const router = express.Router();
const Application = require('../../models/Application');

const { createZBIORCZA_TP } = require('../../utils/create-zbiorcza-tp');
const Products = require('../../models/Products');

const sendEmail = require('../../services/sendEmail');

router.post('/', async function (req, res, next) {
  const data = req.body;

  try {
    const application = await Application.create(data);
    application.save();

    res.json(201, {
      message: `Formularz został wysłany!, numer referencyjny: ${application._id}`,
      id: application._id,
    });
  } catch (e) {
    res.json(400, { message: e, error: e });
  }
});

router.get('/preview/:id', async function (req, res, next) {
  const id = req.params.id;

  try {
    const application = await Application.findById(id);
    const zbiorcza_TP = createZBIORCZA_TP(application);

    if (!application) {
      res.json(404, { message: 'Nie znaleziono formularza!' });
    }

    const main_keys = Object.keys(zbiorcza_TP.main_keys);

    // SPIRAL >> STANDARD >> MAX

    // ======================================================================
    //
    // 1. SPIRAL
    //
    // ======================================================================

    const values_spiral = Object.values(zbiorcza_TP.m_spiral);

    const pipeline_spiral = [
      {
        $match: { height_mm: { $in: main_keys }, type: application.type },
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: main_keys.map((key, index) => ({
                case: { $eq: ['$height_mm', key] },
                then: index,
              })),
              default: main_keys.length, // Ensures any unmatched documents appear last
            },
          },
          count: {
            $arrayElemAt: [
              values_spiral,
              {
                $indexOfArray: [main_keys, '$height_mm'],
              },
            ],
          },
        },
      },
      {
        $sort: { sortKey: 1 },
      },
      {
        $project: { sortKey: 0 }, // Remove the sortKey field from the final output
      },
    ];

    const products_spiral = await Products.aggregate(pipeline_spiral);

    // ======================================================================
    //
    // 2. STANDARD
    //
    // ======================================================================

    const values_standard = Object.values(zbiorcza_TP.m_standard);

    const pipeline_standard = [
      {
        $match: { height_mm: { $in: main_keys }, type: application.type },
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: main_keys.map((key, index) => ({
                case: { $eq: ['$height_mm', key] },
                then: index,
              })),
              default: main_keys.length, // Ensures any unmatched documents appear last
            },
          },
          count: {
            $arrayElemAt: [
              values_standard,
              {
                $indexOfArray: [main_keys, '$height_mm'],
              },
            ],
          },
        },
      },
      {
        $sort: { sortKey: 1 },
      },
      {
        $project: { sortKey: 0 }, // Remove the sortKey field from the final output
      },
    ];

    const products_standard = await Products.aggregate(pipeline_standard);

    // ======================================================================
    //
    // 3 MAX
    //
    // ======================================================================

    const values_max = Object.values(zbiorcza_TP.m_max);

    const pipeline_max = [
      {
        $match: { height_mm: { $in: main_keys }, type: application.type },
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: main_keys.map((key, index) => ({
                case: { $eq: ['$height_mm', key] },
                then: index,
              })),
              default: main_keys.length, // Ensures any unmatched documents appear last
            },
          },
          count: {
            $arrayElemAt: [
              values_max,
              {
                $indexOfArray: [main_keys, '$height_mm'],
              },
            ],
          },
        },
      },
      {
        $sort: { sortKey: 1 },
      },
      {
        $project: { sortKey: 0 }, // Remove the sortKey field from the final output
      },
    ];

    const products_max = await Products.aggregate(pipeline_max);

    // ======================================================================
    //
    // REMOVE UNUSED VALUES FROM SPIRAL
    //
    // ======================================================================

    const excludeFromSpiral = [
      '10-17',
      '120-220',
      '220-320',
      '320-420',
      '350-550',
      '550-750',
      '750-950',
    ];
    let filteredSpiral = products_spiral.filter(
      (product) => !excludeFromSpiral.includes(product.height_mm),
    );

    // ======================================================================
    //
    // REMOVE UNUSED VALUES FROM STANDARD
    //
    // ======================================================================

    const excludeFromStandard = [
      '10-17',
      '17-30',
      '350-550',
      '550-750',
      '750-950',
    ];
    let filteredStandard = products_spiral.filter(
      (product) => !excludeFromStandard.includes(product.height_mm),
    );

    // ======================================================================
    //
    // REMOVE UNUSED VALUES FROM MAX
    //
    // ======================================================================

    const excludeFromMax = ['10-17', '17-30', '30-50'];
    let filteredMax = products_spiral.filter(
      (product) => !excludeFromMax.includes(product.height_mm),
    );

    // ======================================================================
    //
    // TIME TO CREATE ORDER
    // SPIRAL >> STANDARD >> MAX
    //
    // ======================================================================

    // 1. Take all products from main system with his range

    const orderArr = [
      ...products_spiral,
      ...products_standard,
      ...products_max,
    ];

    function filterOrder(arr, lowest, highest) {
      return arr.filter((product) => {
        const [min, max] = product.height_mm.split('-').map(Number);
        return min <= highest && max >= lowest; // Retain ranges that overlap with the provided range
      });
    }

    const order = filterOrder(
      orderArr,
      parseInt(application.lowest),
      parseInt(application.highest),
    );

    res.status(200).json({
      application: application,
      // system: application.main_system,
      // type: application.type,
      order: order,
      // products_spiral: filteredSpiral,
      // products_standard: filteredStandard,
      // products_max: filteredMax,
      zbiorcza_TP: zbiorcza_TP,
    });
  } catch (e) {
    res.status(400).json({ message: e, error: e });
  }
});

router.post('/send-email', async (req, res) => {
  const { to, subject, templateName, replacements } = req.body;

  try {
    await sendEmail(to, subject, templateName, replacements);
    res.status(200).send('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).send('Error sending email');
  }
});

module.exports = router;
