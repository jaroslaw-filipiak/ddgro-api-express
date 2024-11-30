const express = require('express');

const router = express.Router();
const Application = require('../../models/Application');

const pdfmake = require('pdfmake');

const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const path = require('path');
const puppeteer = require('puppeteer');

const { createZBIORCZA_TP } = require('../../utils/create-zbiorcza-tp');
const Products = require('../../models/Products');
const Accessories = require('../../models/Accessories');

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

    // console.log('main_keys', main_keys);

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
    // console.log('products_spiral:', products_spiral);

    const products_standard =
      (await Products.aggregate(
        createPipeline('standard', Object.values(zbiorcza_TP.m_standard)),
      )) || [];
    // console.log('products_standard:', products_standard);

    const products_max =
      (await Products.aggregate(
        createPipeline('max', Object.values(zbiorcza_TP.m_max)),
      )) || [];
    // console.log('products_max:', products_max);

    const products_raptor =
      (await Products.aggregate(
        createPipeline('raptor', Object.values(zbiorcza_TP.m_raptor)),
      )) || [];
    // console.log('products_raptor:', products_raptor);

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

    // console.log('filteredSpiral:', filteredSpiral);
    // console.log('filteredStandard:', filteredStandard);
    // console.log('filteredMax:', filteredMax);
    // console.log('filteredRaptor:', filteredRaptor);

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

    // console.log('orderArr before filtering:', orderArr);

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

    // console.log('Filtered order:', order);

    res.status(200).json({
      order: order,
      application: application,
      zbiorcza_TP: zbiorcza_TP,
    });
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    res.status(400).json({ message: e.message, error: e });
  }
});

router.get('/preview-pdf/:id', async function (req, res, next) {
  try {
    const id = req.params.id;

    // Find the application in the database
    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({ message: 'Nie znaleziono formularza!' });
    }

    // Read the HTML template file
    const templatePath = path.join(
      __dirname,
      '../../templates/pdf/template2.html',
    );
    const template = await readFile(templatePath, 'utf8'); // Use the promisified `readFile`

    // Send the template as raw HTML content
    res.send(template); // Use send() instead of render()
  } catch (e) {
    console.error('Error:', e.message, e.stack);
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
     *
     * Oprócz produktów jeszcze dodatkowe akcesoria
     *
     */

    const additionalAccessories = application.additional_accessories || [];
    additionalAccessories.forEach((additionalAccessory) => {
      console.log('additionalAccessory:', additionalAccessory);
      // Always add as a new item, don't try to find existing ones
      items.push({
        ...additionalAccessory,
        count: Number(additionalAccessory.count),
        price_net: Number(additionalAccessory.price_net),
        total_price: (
          Number(additionalAccessory.count) *
          Number(additionalAccessory.price_net)
        ).toFixed(2),
      });
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

    /**
     *
     *
     *  Tworzenie pdfa
     *
     *
     */

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
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [40, 60, 40, 60],
        header: {
          columns: [
            {
              // Company logo
              image: path.join(__dirname, '../../public/images/logo.png'),
              width: 150,
              margin: [40, 20, 0, 0],
            },
            {
              // Company info
              stack: [
                { text: 'DDGRO Sp. z o.o.', style: 'companyName' },
                { text: 'ul. Przykładowa 123', style: 'companyInfo' },
                { text: '00-000 Warszawa', style: 'companyInfo' },
                { text: 'NIP: 000-000-00-00', style: 'companyInfo' },
                { text: 'tel: +48 000 000 000', style: 'companyInfo' },
              ],
              alignment: 'right',
              margin: [0, 20, 40, 0],
            },
          ],
        },
        footer: function (currentPage, pageCount) {
          return {
            columns: [
              {
                text: 'www.ddgro.com',
                alignment: 'left',
                margin: [40, 0, 0, 0],
              },
              {
                text: `Strona ${currentPage} z ${pageCount}`,
                alignment: 'right',
                margin: [0, 0, 40, 0],
              },
            ],
            margin: [40, 20],
            fontSize: 8,
            color: '#666666',
          };
        },
        content: [
          { text: 'Zestawienie wsporników', style: 'mainHeader' },
          {
            text: `Data utworzenia: ${new Date().toLocaleDateString('pl-PL')}`,
            style: 'dateText',
          },
          {
            table: {
              headerRows: 1,
              widths: ['15%', '25%', '15%', '15%', '15%', '15%'],
              body: [
                [
                  { text: 'Nazwa Skrócona', style: 'tableHeader' },
                  { text: 'Nazwa', style: 'tableHeader' },
                  { text: 'Wysokość [mm]', style: 'tableHeader' },
                  { text: 'Ilość', style: 'tableHeader' },
                  { text: 'Cena katalogowa\nnetto', style: 'tableHeader' },
                  { text: 'Łącznie netto', style: 'tableHeader' },
                ],
                ...items.map((item, i) => [
                  { text: item.short_name || 'N/A', style: 'tableCell' },
                  { text: item.name || 'N/A', style: 'tableCell' },
                  { text: item.height_mm || '--', style: 'tableCell' },
                  {
                    text: item.count || 0,
                    style: 'tableCell',
                    alignment: 'right',
                  },
                  {
                    text: new Intl.NumberFormat('pl-PL', {
                      minimumFractionDigits: 2,
                    }).format(item.price_net || 0),
                    style: 'tableCell',
                    alignment: 'right',
                  },
                  {
                    text: new Intl.NumberFormat('pl-PL', {
                      minimumFractionDigits: 2,
                    }).format(item.total_price || 0),
                    style: 'tableCell',
                    alignment: 'right',
                  },
                ]),
              ],
            },
            layout: {
              hLineWidth: function (i, node) {
                return i === 0 || i === 1 || i === node.table.body.length
                  ? 2
                  : 1;
              },
              vLineWidth: function (i) {
                return 0; // No vertical lines
              },
              hLineColor: function (i, node) {
                return i === 0 || i === 1 || i === node.table.body.length
                  ? '#2F528F'
                  : '#CCCCCC';
              },
              paddingLeft: function (i) {
                return 8;
              },
              paddingRight: function (i) {
                return 8;
              },
              paddingTop: function (i) {
                return 8;
              },
              paddingBottom: function (i) {
                return 8;
              },
            },
          },
          {
            columns: [
              { width: '*', text: '' },
              {
                width: 'auto',
                table: {
                  body: [
                    [
                      { text: 'Suma netto:', style: 'totalLabel' },
                      { text: total + ' PLN', style: 'totalAmount' },
                    ],
                  ],
                },
                layout: 'noBorders',
                margin: [0, 20, 0, 0],
              },
            ],
          },
          {
            text: [
              '\nUwaga: ',
              {
                text: 'Przedstawiona oferta ma charakter informacyjny i nie stanowi oferty handlowej w rozumieniu Art.66 § 1 Kodeksu Cywilnego.',
                italics: true,
              },
            ],
            style: 'disclaimer',
            margin: [0, 20, 0, 0],
          },
        ],
        styles: {
          mainHeader: {
            fontSize: 24,
            bold: true,
            color: '#2F528F',
            margin: [0, 20, 0, 10],
          },
          companyName: {
            fontSize: 14,
            bold: true,
            color: '#2F528F',
          },
          companyInfo: {
            fontSize: 8,
            color: '#666666',
          },
          dateText: {
            fontSize: 10,
            color: '#666666',
            margin: [0, 0, 0, 20],
          },
          tableHeader: {
            fontSize: 10,
            bold: true,
            color: '#2F528F',
            fillColor: '#F2F2F2',
            alignment: 'left',
          },
          tableCell: {
            fontSize: 9,
            color: '#333333',
          },
          totalLabel: {
            fontSize: 12,
            bold: true,
            color: '#2F528F',
            alignment: 'right',
            margin: [0, 0, 10, 0],
          },
          totalAmount: {
            fontSize: 12,
            bold: true,
            color: '#2F528F',
            alignment: 'right',
          },
          disclaimer: {
            fontSize: 8,
            color: '#666666',
          },
        },
        defaultStyle: {
          font: 'Roboto',
        },
      };

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

    // const createPDF = async (items, total) => {
    //   const docDefinition = {
    //     pageOrientation: 'landscape', // Set the orientation to landscape
    //     content: [
    //       { text: 'Twoje zamówienie', style: 'header' },
    //       { text: 'Zestawienie wsporników', style: 'subheader' },
    //       {
    //         style: 'tableExample',
    //         table: {
    //           headerRows: 1,
    //           body: [
    //             [
    //               { text: 'Nazwa Skrócona', style: 'tableHeader' },
    //               { text: 'Nazwa', style: 'tableHeader' },
    //               { text: 'Wysokość [mm]', style: 'tableHeader' },
    //               { text: 'Ilość', style: 'tableHeader' },
    //               { text: 'Cena katalogowa netto', style: 'tableHeader' },
    //               { text: 'Łącznie netto', style: 'tableHeader' },
    //             ],
    //             ...items.map((item) => [
    //               item.short_name || 'N/A',
    //               item.name || 'N/A',
    //               item.height_mm || '--',
    //               item.count || 0,
    //               item.price_net || 0,
    //               item.total_price || 0,
    //             ]),
    //           ],
    //         },
    //       },
    //       {
    //         text: `Łącznie netto: ${total}`,
    //         alignment: 'right',
    //         margin: [0, 20, 0, 0],
    //       },
    //     ],
    //     styles: {
    //       header: {
    //         fontSize: 14,
    //         bold: true,
    //       },
    //       subheader: {
    //         fontSize: 10,
    //         bold: true,
    //         margin: [0, 10, 0, 5],
    //       },
    //       tableHeader: {
    //         bold: true,
    //         fontSize: 9,
    //         color: 'black',
    //       },
    //       tableExample: {
    //         width: '100%',
    //         fontSize: 7,
    //         margin: [0, 5, 0, 15],
    //       },
    //     },
    //   };

    //   // Create PDF document
    //   const pdfDoc = printer.createPdfKitDocument(docDefinition);
    //   const filePath = path.join(__dirname, 'zestawienie.pdf');
    //   pdfDoc.pipe(fs.createWriteStream(filePath));
    //   pdfDoc.end();

    //   return new Promise((resolve, reject) => {
    //     pdfDoc.on('end', () => {
    //       resolve(filePath);
    //     });
    //     pdfDoc.on('error', (err) => {
    //       reject(err);
    //     });
    //   });
    // };

    const pdfFilePath = await createPDF(items, total);

    // Check if the file exists
    if (!fs.existsSync(pdfFilePath)) {
      return res.status(500).json({
        message:
          'Nie udało się utoworzyć pliku PDF. Skontaktuj się z administratorem',
      });
    }

    const emailOptions = {
      from: `"DDGRO" <${process.env.MAIL_USERNAME}>`,
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

    await sendEmail(emailOptions);
    // Clean up the file after sending the email
    fs.unlink(pdfFilePath, (err) => {
      if (err) console.error('Failed to delete temporary PDF file:', err);
    });

    res.status(200).json({ message: 'Oferta została wysłana!' });
  } catch (e) {
    res.status(400).json({ message: e.message, error: e });
  }
});

module.exports = router;
