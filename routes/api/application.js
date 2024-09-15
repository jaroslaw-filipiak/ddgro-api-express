const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const Application = require('../../models/Application');
const PDFDocument = require('pdfkit');
const pdfmake = require('pdfmake');
const Handlebars = require('handlebars');

const { createZBIORCZA_TP } = require('../../utils/create-zbiorcza-tp');
const Products = require('../../models/Products');

const sendEmail = require('../../services/sendEmail');

router.post('/', async function (req, res, next) {
  const data = req.body;

  try {
    const application = await Application.create(data);
    application.save();

    res.json(201, {
      message: `Otzymaliśmy formularz... przygotowywanie do wysłania PDF`,
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

    const products_spiral =
      (await Products.aggregate(
        createPipeline('spiral', Object.values(zbiorcza_TP.m_spiral)),
      )) || [];
    console.log('products_spiral:', products_spiral);

    const products_standard =
      (await Products.aggregate(
        createPipeline('standard', Object.values(zbiorcza_TP.m_standard)),
      )) || [];
    console.log('products_standard:', products_standard);

    const products_max =
      (await Products.aggregate(
        createPipeline('max', Object.values(zbiorcza_TP.m_max)),
      )) || [];
    console.log('products_max:', products_max);

    const products_raptor =
      (await Products.aggregate(
        createPipeline('raptor', Object.values(zbiorcza_TP.m_raptor)),
      )) || [];
    console.log('products_raptor:', products_raptor);

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
    const excludeFromRaptor = ['10-17']; //TODO: UPDATE

    const filterProducts = (products, excludes) => {
      if (!Array.isArray(products)) {
        console.error('Expected products to be an array', products);
        throw new Error('Invalid products array');
      }
      return products.filter(
        (product) => !excludes.includes(product.height_mm),
      );
    };

    const filteredSpiral = filterProducts(products_spiral, excludeFromSpiral);
    const filteredStandard = filterProducts(
      products_standard,
      excludeFromStandard,
    );
    const filteredMax = filterProducts(products_max, excludeFromMax);
    const filteredRaptor = filterProducts(products_raptor, excludeFromRaptor);

    console.log('filteredSpiral:', filteredSpiral);
    console.log('filteredStandard:', filteredStandard);
    console.log('filteredMax:', filteredMax);
    console.log('filteredRaptor:', filteredRaptor);

    let orderArr = [];

    if (application.type === 'slab') {
      orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax];
    } else if (application.type === 'wood') {
      orderArr = [
        ...filteredSpiral,
        ...filteredStandard,
        ...filteredMax,
        ...filteredRaptor,
      ];
    }

    console.log('orderArr before filtering:', orderArr);

    const filterOrder = (arr, lowest, highest) => {
      if (!Array.isArray(arr)) {
        console.error('Expected arr to be an array', arr);
        throw new Error('Invalid order array');
      }

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

    if (!Array.isArray(order)) {
      console.error('Expected order to be an array', order);
      throw new Error('Invalid order array');
    }

    console.log('Filtered order:', order);

    res.status(200).json({
      application: application,
      order: order,
      zbiorcza_TP: zbiorcza_TP,
    });
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    res.status(400).json({ message: e.message, error: e });
  }
});

router.post('/send-order-summary/:id', async function (req, res, next) {
  console.log('req.body:', req.body);
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
    const products_raptor = await Products.aggregate(
      createPipeline('raptor', Object.values(zbiorcza_TP.m_raptor)),
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
    const excludeFromRaptor = [
      '10-17',
      '17-30',
      '350-550',
      '550-750',
      '750-950',
    ];

    const filterProducts = (products, excludes) =>
      products.filter((product) => !excludes.includes(product.height_mm));

    const filteredSpiral = filterProducts(products_spiral, excludeFromSpiral);
    const filteredStandard = filterProducts(
      products_standard,
      excludeFromStandard,
    );
    const filteredMax = filterProducts(products_max, excludeFromMax);
    const filteredRaptor = filterProducts(products_raptor, excludeFromRaptor);

    let orderArr = [];

    if (application.type === 'slab') {
      orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax];
    } else if (application.type === 'wood') {
      orderArr = [
        ...filteredSpiral,
        ...filteredStandard,
        ...filteredMax,
        ...filteredRaptor,
      ];
    }

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

    items = addCountAndPriceToItems(items, 'spiral', zbiorcza_TP.main_keys);
    items = addCountAndPriceToItems(items, 'standard', zbiorcza_TP.main_keys);
    items = addCountAndPriceToItems(items, 'max', zbiorcza_TP.main_keys);
    items = addCountAndPriceToItems(items, 'raptor', zbiorcza_TP.main_keys);

    // Add products from application.products with full info

    /**
     *
     *  Nie każdy element posiada height_mm, dlatego trzeba to sprawdzić
     *
     *
     */

    const additionalProducts = application.products || [];
    additionalProducts.forEach((additionalProduct) => {
      const existingItem = items.find(
        (item) => item.height_mm === additionalProduct?.height_mm,
      );
      /**
       *
       *  Zastosowanie tylko do produktów / wsporników które mają height_mm
       *
       */

      if (
        existingItem &&
        existingItem.height_mm === additionalProduct.height_mm
      ) {
        existingItem.count += additionalProduct.count;
        existingItem.total_price = (
          existingItem.count * existingItem.price_net
        ).toFixed(2);
      } else {
        items.push({
          ...additionalProduct,
          count: additionalProduct.count,
          price_net: additionalProduct.price_net,
          total_price: (
            additionalProduct.count * additionalProduct.price_net
          ).toFixed(2),
        });
      }
    });

    /**
     *
     *  Jeszcze jezeli user wybierze dodatkowe akcesoria z kroku nr 5
     *
     *
     */

    const additionalAccessories = application.accessories || [];

    // Recalculate total price of the full order
    const totalOrderPrice = items
      .reduce((sum, item) => sum + parseFloat(item.total_price), 0)
      .toFixed(2);
    const total = new Intl.NumberFormat('pl-PL', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(totalOrderPrice);

    // Define fonts for pdfmake
    const fonts = {
      Roboto: {
        normal: path.join(__dirname, '../../public/fonts/Roboto-Regular.ttf'),
        bold: path.join(__dirname, '../../public/fonts/Roboto-Bold.ttf'),
        italics: path.join(__dirname, '../../public/fonts/Roboto-Italic.ttf'),
        bolditalics: path.join(
          __dirname,
          '../../public/fonts/Roboto-BoldItalic.ttf',
        ),
      },
    };

    const printer = new pdfmake(fonts);

    const createPDF = async (items, total) => {
      const docDefinition = {
        pageOrientation: 'landscape', // Set the orientation to landscape
        content: [
          { text: 'Twoje zamówienie', style: 'header' },
          { text: 'Zestawienie wsporników', style: 'subheader' },
          {
            style: 'tableExample',
            table: {
              headerRows: 1,
              body: [
                [
                  { text: 'Nazwa Skrócona', style: 'tableHeader' },
                  { text: 'Nazwa', style: 'tableHeader' },
                  { text: 'Wysokość [mm]', style: 'tableHeader' },
                  { text: 'Ilość', style: 'tableHeader' },
                  { text: 'Cena katalogowa netto', style: 'tableHeader' },
                  { text: 'Łącznie netto', style: 'tableHeader' },
                ],
                ...items.map((item) => [
                  item.short_name || 'N/A', // Default to 'N/A' if undefined
                  item.name || 'N/A', // Default to 'N/A' if undefined
                  item.height_mm || '--', // Default to 0 if undefined
                  item.count || 0, // Default to 0 if undefined
                  item.price_net || 0, // Default to 0 if undefined
                  item.total_price || 0,
                ]),
              ],
            },
          },
          {
            text: `Łącznie netto: ${total}`,
            alignment: 'right',
            margin: [0, 20, 0, 0],
          },
        ],
        styles: {
          header: {
            fontSize: 9,
            bold: true,
          },
          subheader: {
            fontSize: 10,
            bold: true,
            margin: [0, 10, 0, 5],
          },
          tableHeader: {
            bold: true,
            fontSize: 9,
            color: 'black',
          },
          tableExample: {
            width: '100%',
            fontSize: 9,
            margin: [0, 5, 0, 15],
          },
        },
      };

      // Create PDF document
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const filePath = path.join(__dirname, 'zestawienie.pdf');
      pdfDoc.pipe(fs.createWriteStream(filePath));
      pdfDoc.end();

      return new Promise((resolve, reject) => {
        pdfDoc.on('end', () => {
          resolve(filePath);
        });
        pdfDoc.on('error', (err) => {
          reject(err);
        });
      });
    };

    const pdfFilePath = await createPDF(items, total);
    console.log('PDF File Path:', pdfFilePath);

    // Check if the file exists
    if (!fs.existsSync(pdfFilePath)) {
      return res.status(500).json({ message: 'Failed to create PDF file.' });
    }

    const emailOptions = {
      from: `"DDGRO" "<${process.env.MAIL_USERNAME}>" `,
      to: to,
      subject: 'Twoje zestawienie wsporników DDGRO',
      template: 'order',
      context: {
        items,
        total,
      },
      attachments: [
        {
          filename: 'podsumowanie_wspornikow.pdf',
          path: pdfFilePath,
          contentType: 'application/pdf',
        },
      ],
    };

    console.log('Email Options:', emailOptions);

    await sendEmail(emailOptions);
    // Clean up the file after sending the email
    fs.unlink(pdfFilePath, (err) => {
      if (err) console.error('Failed to delete temporary PDF file:', err);
    });

    res.status(200).json({ message: 'Oferta została wysłana!' });
  } catch (e) {
    res.status(400).json({
      message: `Wystąpił problem z wygenerowaniem oferty PDF (${e})`,
      error: e,
    });
  }
});

module.exports = router;
