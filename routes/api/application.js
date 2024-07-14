const express = require('express');
const fs = require('fs');
const path = require('path');
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
      message: `Formularz został wysłany!`,
      id: application._id,
    });
  } catch (e) {
    res.json(400, { message: e, error: e });
  }
});

// router.get('/preview/:id', async function (req, res, next) {
//   const id = req.params.id;

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

//     console.log('main_keys', main_keys);

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
//           // count: {
//           //   $arrayElemAt: [
//           //     values_spiral,
//           //     {
//           //       $indexOfArray: [main_keys, '$height_mm'],
//           //     },
//           //   ],
//           // },
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
//           // count: {
//           //   $arrayElemAt: [
//           //     values_standard,
//           //     {
//           //       $indexOfArray: [main_keys, '$height_mm'],
//           //     },
//           //   ],
//           // },
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
//           // count: {
//           //   $arrayElemAt: [
//           //     values_max,
//           //     {
//           //       $indexOfArray: [main_keys, '$height_mm'],
//           //     },
//           //   ],
//           // },
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

//     const order = filterOrder(
//       orderArr,
//       parseInt(application.lowest),
//       parseInt(application.highest),
//     );

//     res.status(200).json({
//       application: application,
//       // system: application.main_system,
//       // type: application.type,
//       order: order,
//       // products_spiral: filteredSpiral,
//       // products_standard: filteredStandard,
//       // products_max: filteredMax,
//       zbiorcza_TP: zbiorcza_TP,
//     });
//   } catch (e) {
//     res.status(400).json({ message: e, error: e });
//   }
// });

router.get('/preview/:id', async function (req, res, next) {
  const id = req.params.id;

  try {
    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({ message: 'Nie znaleziono formularza!' });
    }

    const zbiorcza_TP = createZBIORCZA_TP(application);
    const main_keys = Object.keys(zbiorcza_TP.main_keys);

    console.log('main_keys', main_keys);

    const createPipeline = (series, values) => [
      {
        $match: {
          height_mm: { $in: main_keys },
          type: application.type,
          series: series,
        },
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
              values,
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

    const products_spiral = await Products.aggregate(
      createPipeline('spiral', Object.values(zbiorcza_TP.m_spiral)),
    );
    console.log('products_spiral:', products_spiral);

    const products_standard = await Products.aggregate(
      createPipeline('standard', Object.values(zbiorcza_TP.m_standard)),
    );
    console.log('products_standard:', products_standard);

    const products_max = await Products.aggregate(
      createPipeline('max', Object.values(zbiorcza_TP.m_max)),
    );
    console.log('products_max:', products_max);

    // Filter out unused values
    const excludeFromSpiral = [
      '120-220',
      '220-320',
      '320-420',
      '350-550',
      '550-750',
      '750-950',
    ];
    const excludeFromStandard = [
      '10-17',
      '17-30',
      '350-550',
      '550-750',
      '750-950',
    ];
    const excludeFromMax = ['10-17', '17-30', '30-50'];

    const filterProducts = (products, excludes) =>
      products.filter((product) => !excludes.includes(product.height_mm));

    const filteredSpiral = filterProducts(products_spiral, excludeFromSpiral);
    const filteredStandard = filterProducts(
      products_standard,
      excludeFromStandard,
    );
    const filteredMax = filterProducts(products_max, excludeFromMax);

    console.log('filteredSpiral:', filteredSpiral);
    console.log('filteredStandard:', filteredStandard);
    console.log('filteredMax:', filteredMax);

    const orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax];

    const filterOrder = (arr, lowest, highest) => {
      return arr.filter((product) => {
        const [min, max] = product.height_mm.split('-').map(Number);
        return min <= highest && max >= lowest; // Retain ranges that overlap with the provided range
      });
    };

    const order = filterOrder(
      orderArr,
      parseInt(application.lowest),
      parseInt(application.highest),
    );

    console.log('Filtered order:', order);

    res.status(200).json({
      application: application,
      order: order,
      zbiorcza_TP: zbiorcza_TP,
    });
  } catch (e) {
    res.status(400).json({ message: e.message, error: e });
  }
});

router.post('/send-order-summary/:id', async function (req, res, next) {
  const id = req.params.id;
  const { to } = req.body;

  try {
    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({ message: 'Nie znaleziono formularza!' });
    }

    const zbiorcza_TP = createZBIORCZA_TP(application);
    const main_keys = Object.keys(zbiorcza_TP.main_keys);

    const createPipeline = (series, values) => [
      {
        $match: {
          height_mm: { $in: main_keys },
          type: application.type,
          series: series,
        },
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
              values,
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

    const products_spiral = await Products.aggregate(
      createPipeline('spiral', Object.values(zbiorcza_TP.m_spiral)),
    );
    const products_standard = await Products.aggregate(
      createPipeline('standard', Object.values(zbiorcza_TP.m_standard)),
    );
    const products_max = await Products.aggregate(
      createPipeline('max', Object.values(zbiorcza_TP.m_max)),
    );

    const excludeFromSpiral = [
      '120-220',
      '220-320',
      '320-420',
      '350-550',
      '550-750',
      '750-950',
    ];
    const excludeFromStandard = [
      '10-17',
      '17-30',
      '350-550',
      '550-750',
      '750-950',
    ];
    const excludeFromMax = ['10-17', '17-30', '30-50'];

    const filterProducts = (products, excludes) =>
      products.filter((product) => !excludes.includes(product.height_mm));

    const filteredSpiral = filterProducts(products_spiral, excludeFromSpiral);
    const filteredStandard = filterProducts(
      products_standard,
      excludeFromStandard,
    );
    const filteredMax = filterProducts(products_max, excludeFromMax);

    const orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax];

    const filterOrder = (arr, lowest, highest) => {
      return arr.filter((product) => {
        const [min, max] = product.height_mm.split('-').map(Number);
        return min <= highest && max >= lowest; // Retain ranges that overlap with the provided range
      });
    };

    let items = filterOrder(
      orderArr,
      parseInt(application.lowest),
      parseInt(application.highest),
    );

    // Add count and total price to each item
    // const addCountAndPriceToItems = (items, series, countObj) => {
    //   return items.map((item) => {
    //     if (item.series === series) {
    //       item.count = Math.ceil(countObj[item.height_mm] || 0);
    //       item.total_price = (item.count * item.price_net).toFixed(2);
    //       item.total_price_formatted = new Intl.NumberFormat('pl-PL', {
    //         style: 'decimal',
    //         minimumFractionDigits: 2,
    //         maximumFractionDigits: 2,
    //       }).format(item.total_price);
    //     }
    //     return item;
    //   });
    // };

    function addCountAndPriceToItems(items, series, countObj) {
      // First, filter out items with a count of 0 based on countObj
      const filteredItems = items.filter((item) => {
        const itemCount = Math.ceil(countObj[item.height_mm] || 0);
        return itemCount > 0; // Only include items with a count greater than 0
      });

      // Then, map over filtered items to add count and total price
      return filteredItems.map((item) => {
        if (item.series === series) {
          const count = Math.ceil(countObj[item.height_mm] || 0);
          item.count = count;
          item.total_price = (count * item.price_net).toFixed(2);
          // Assuming price formatting logic is correct and omitted for brevity
        }
        return item;
      });
    }

    // const addCountAndPriceToItems = (items, series, countObj) => {
    //   return items
    //     .map((item) => {
    //       if (item.series === series) {
    //         item.count = Math.ceil(countObj[item.height_mm] || 0);
    //         if (item.count > 0) {
    //           item.total_price = (item.count * item.price_net).toFixed(2);
    //           item.total_price_formatted = new Intl.NumberFormat('pl-PL', {
    //             style: 'decimal',
    //             minimumFractionDigits: 2,
    //             maximumFractionDigits: 2,
    //           }).format(item.total_price);
    //         } else {
    //           item.total_price = 0;
    //           item.total_price_formatted = '0,00';
    //         }
    //       }
    //       return item;
    //     })
    //     .filter((item) => item.count > 0);
    // };

    items = addCountAndPriceToItems(items, 'spiral', zbiorcza_TP.main_keys);
    items = addCountAndPriceToItems(items, 'standard', zbiorcza_TP.main_keys);
    items = addCountAndPriceToItems(items, 'max', zbiorcza_TP.main_keys);

    // Add products from application.products with full info
    const additionalProducts = application.products || [];
    additionalProducts.forEach((additionalProduct) => {
      const existingItem = items.find(
        (item) => item.height_mm === additionalProduct.height_mm,
      );
      if (existingItem) {
        existingItem.count += additionalProduct.count;
        existingItem.total_price = (
          existingItem.count * existingItem.price_net
        ).toFixed(2);
      } else {
        items.push({
          ...additionalProduct,
          // height_mm: additionalProduct.height_mm,
          count: additionalProduct.count,
          price_net: additionalProduct.price_net,
          total_price: (
            additionalProduct.count * additionalProduct.price_net
          ).toFixed(2),
          // series: additionalProduct.series,
          // name: additionalProduct.name, // Ensure the item name is included
          // // Add any other necessary fields here
        });
      }
    });

    // Recalculate total price of the full order
    const totalOrderPrice = items
      .reduce((sum, item) => sum + parseFloat(item.total_price), 0)
      .toFixed(2);
    const total = new Intl.NumberFormat('pl-PL', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(totalOrderPrice);

    // Calculate total price of the full order
    // const totalOrderPrice = items
    //   .reduce((sum, item) => sum + parseFloat(item.total_price), 0)
    //   .toFixed(2);
    // const total = new Intl.NumberFormat('pl-PL', {
    //   style: 'decimal',
    //   minimumFractionDigits: 2,
    //   maximumFractionDigits: 2,
    // }).format(totalOrderPrice);

    const emailOptions = {
      from: '"DDGRO" <info@j-filipiak.pl>',
      to: to,
      subject: 'Twoje zestawienie wsporników DDGRO',
      template: 'order',
      context: {
        items,
        total,
      },
    };

    await sendEmail(emailOptions);
    res.send('Email is being sent. Items have been saved to order_items.json.');
  } catch (e) {
    res.status(400).json({ message: e.message, error: e });
  }
});

module.exports = router;
