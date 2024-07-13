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

    const orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax];

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

//   const id = req.params.id;
//   const { to, name } = req.body;

//   try {
//     const application = await Application.findById(id);
//     const zbiorcza_TP = createZBIORCZA_TP(application);

//     if (!application) {
//       res.json(404, { message: 'Nie znaleziono formularza!' });
//     }

//     const main_keys = Object.keys(zbiorcza_TP.main_keys);

//     // SPIRAL >> STANDARD >> MAX

//     // ======================================================================
//     //
//     // 1. SPIRAL
//     //
//     // ======================================================================

//     const values_spiral = Object.values(zbiorcza_TP.m_spiral);

//     const pipeline_spiral = [
//       {
//         $match: {
//           height_mm: { $in: main_keys },
//           type: application.type,
//           series: 'spiral',
//         },
//       },
//       {
//         $addFields: {
//           sortKey: {
//             $switch: {
//               branches: main_keys.map((key, index) => ({
//                 case: { $eq: ['$height_mm', key] },
//                 then: index,
//               })),
//               default: main_keys.length, // Ensures any unmatched documents appear last
//             },
//           },
//           count: {
//             $arrayElemAt: [
//               values_spiral,
//               {
//                 $indexOfArray: [main_keys, '$height_mm'],
//               },
//             ],
//           },
//         },
//       },
//       {
//         $sort: { sortKey: 1 },
//       },
//       {
//         $project: { sortKey: 0 }, // Remove the sortKey field from the final output
//       },
//     ];

//     const products_spiral = await Products.aggregate(pipeline_spiral);

//     // ======================================================================
//     //
//     // 2. STANDARD
//     //
//     // ======================================================================

//     const values_standard = Object.values(zbiorcza_TP.m_standard);

//     const pipeline_standard = [
//       {
//         $match: {
//           height_mm: { $in: main_keys },
//           type: application.type,
//           series: 'standard',
//         },
//       },
//       {
//         $addFields: {
//           sortKey: {
//             $switch: {
//               branches: main_keys.map((key, index) => ({
//                 case: { $eq: ['$height_mm', key] },
//                 then: index,
//               })),
//               default: main_keys.length, // Ensures any unmatched documents appear last
//             },
//           },
//           count: {
//             $arrayElemAt: [
//               values_standard,
//               {
//                 $indexOfArray: [main_keys, '$height_mm'],
//               },
//             ],
//           },
//         },
//       },
//       {
//         $sort: { sortKey: 1 },
//       },
//       {
//         $project: { sortKey: 0 }, // Remove the sortKey field from the final output
//       },
//     ];

//     const products_standard = await Products.aggregate(pipeline_standard);

//     // ======================================================================
//     //
//     // 3 MAX
//     //
//     // ======================================================================

//     const values_max = Object.values(zbiorcza_TP.m_max);

//     const pipeline_max = [
//       {
//         $match: {
//           height_mm: { $in: main_keys },
//           type: application.type,
//           series: 'max',
//         },
//       },
//       {
//         $addFields: {
//           sortKey: {
//             $switch: {
//               branches: main_keys.map((key, index) => ({
//                 case: { $eq: ['$height_mm', key] },
//                 then: index,
//               })),
//               default: main_keys.length, // Ensures any unmatched documents appear last
//             },
//           },
//           count: {
//             $arrayElemAt: [
//               values_max,
//               {
//                 $indexOfArray: [main_keys, '$height_mm'],
//               },
//             ],
//           },
//         },
//       },
//       {
//         $sort: { sortKey: 1 },
//       },
//       {
//         $project: { sortKey: 0 }, // Remove the sortKey field from the final output
//       },
//     ];

//     const products_max = await Products.aggregate(pipeline_max);

//     // ======================================================================
//     //
//     // REMOVE UNUSED VALUES FROM SPIRAL
//     //
//     // ======================================================================

//     const excludeFromSpiral = [
//       '10-17',
//       '120-220',
//       '220-320',
//       '320-420',
//       '350-550',
//       '550-750',
//       '750-950',
//     ];
//     let filteredSpiral = products_spiral.filter(
//       (product) => !excludeFromSpiral.includes(product.height_mm),
//     );

//     // ======================================================================
//     //
//     // REMOVE UNUSED VALUES FROM STANDARD
//     //
//     // ======================================================================

//     const excludeFromStandard = [
//       '10-17',
//       '17-30',
//       '350-550',
//       '550-750',
//       '750-950',
//     ];
//     let filteredStandard = products_standard.filter(
//       (product) => !excludeFromStandard.includes(product.height_mm),
//     );

//     // ======================================================================
//     //
//     // REMOVE UNUSED VALUES FROM MAX
//     //
//     // ======================================================================

//     const excludeFromMax = ['10-17', '17-30', '30-50'];
//     let filteredMax = products_max.filter(
//       (product) => !excludeFromMax.includes(product.height_mm),
//     );

//     // ======================================================================
//     //
//     // TIME TO CREATE ORDER
//     // SPIRAL >> STANDARD >> MAX
//     //
//     // ======================================================================

//     // 1. Take all products from main system with his range

//     const orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax];

//     function filterOrder(arr, lowest, highest) {
//       return arr.filter((product) => {
//         const [min, max] = product.height_mm.split('-').map(Number);
//         return min <= highest && max >= lowest; // Retain ranges that overlap with the provided range
//       });
//     }

//     const itemsWithPricesAsFloat = filterOrder(
//       orderArr,
//       parseInt(application.lowest),
//       parseInt(application.highest),
//     );

//     const items = products_standard;

//     // const items = itemsWithPricesAsFloat.map((item) => {
//     //   return {
//     //     ...item,
//     //     count: Math.round(item.count) || 0,
//     //   };
//     // });

//     const emailOptions = {
//       from: '"DDGRO" <info@j-filipiak.pl',
//       to: to,
//       subject: 'Twoje zestawienie wsporników DDGRO',
//       template: 'order',
//       context: {
//         name,
//         items,
//       },
//     };

//     sendEmail(emailOptions);
//     res.send('Email is being sent.');
//   } catch (e) {
//     res.status(400).json({ message: e, error: e });
//   }
// });

router.post('/send-order-summary/:id', async (req, res) => {
  const id = req.params.id;
  const { to, name } = req.body;

  try {
    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ message: 'Nie znaleziono formularza!' });
    }

    const zbiorcza_TP = createZBIORCZA_TP(application);
    const main_keys = Object.keys(zbiorcza_TP.main_keys);

    // Common aggregation steps to reduce repetition
    const getPipeline = (seriesName, items) => [
      {
        $match: {
          height_mm: { $in: main_keys }, // main_keys must include all possible height_mm values from items
          type: application.type,
          series: seriesName,
        },
      },
      {
        $addFields: {
          count: {
            $let: {
              vars: {
                countValue: {
                  $filter: {
                    input: items, // Passed array of items with count
                    as: 'item',
                    cond: { $eq: ['$$item.height_mm', '$height_mm'] },
                  },
                },
              },
              in: { $ifNull: [{ $arrayElemAt: ['$$countValue.count', 0] }, 0] },
            },
          },
        },
      },
      {
        $sort: { height_mm: 1 }, // Sorting by height_mm for better organization, adjust as necessary
      },
    ];

    const products_spiral = await Products.aggregate(
      getPipeline('spiral', Object.values(zbiorcza_TP.m_spiral)),
    );
    const products_standard = await Products.aggregate(
      getPipeline('standard', Object.values(zbiorcza_TP.m_standard)),
    );
    const products_max = await Products.aggregate(
      getPipeline('max', Object.values(zbiorcza_TP.m_max)),
    );

    // Function to filter excluded ranges
    const filterProducts = (products, excludes) =>
      products.filter((product) => !excludes.includes(product.height_mm));

    const filteredSpiral = filterProducts(products_spiral, [
      '10-17',
      '120-220',
      '220-320',
      '320-420',
      '350-550',
      '550-750',
      '750-950',
    ]);
    const filteredStandard = filterProducts(products_standard, [
      '10-17',
      '17-30',
      '350-550',
      '550-750',
      '750-950',
    ]);
    const filteredMax = filterProducts(products_max, [
      '10-17',
      '17-30',
      '30-50',
    ]);

    const orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax];

    const items = orderArr
      .filter((product) => {
        const [min, max] = product.height_mm.split('-').map(Number);
        return (
          min <= parseInt(application.highest) &&
          max >= parseInt(application.lowest)
        );
      })
      .map((item) => ({
        ...item,
        count: Math.round(item.count || 0),
      }));

    const emailOptions = {
      from: '"DDGRO" <info@j-filipiak.pl>',
      to: to,
      subject: 'Twoje zestawienie wsporników DDGRO',
      template: 'order',
      context: {
        name,
        items,
      },
    };

    console.log('Values Standard:', Object.values(zbiorcza_TP.m_standard));
    console.log('Values Max:', Object.values(zbiorcza_TP.m_max));
    console.log('Main Keys:', main_keys);

    await sendEmail(emailOptions);
    res.send('Email is being sent.');
  } catch (e) {
    console.error('Error during order summary creation', e);
    res
      .status(400)
      .json({ message: 'Error during order summary creation', error: e });
  }
});

module.exports = router;
