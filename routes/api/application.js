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

const sendEmail = require('../../services/sendEmail');
const translations = require('../../translations');

router.post('/', async function (req, res, next) {
  const data = req.body;

  try {
    const application = await Application.create(data);
    application.save();

    res.status(201).json({
      message: `Application created successfully`,
      id: application._id,
      lang: application.lang,
    });
  } catch (e) {
    res.status(400).json({ message: e, error: e });
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
          series: { $regex: new RegExp(`^${series}$`, 'i') }, // case-insensitive match
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
  const startTime = Date.now();
  const id = req.params.id;
  const { to } = req.body;

  try {
    console.log('📧 Send order summary - Starting process');

    const dbStart = Date.now();
    const application = await Application.findById(id);
    const applicationLang = application.lang || 'pl';

    const t = translations[applicationLang] || translations.pl || {};

    if (!application) {
      return res.status(404).json({ message: 'Nie znaleziono formularza!' });
    }

    const zbiorcza_TP = createZBIORCZA_TP(application);
    const main_keys = Object.keys(zbiorcza_TP.main_keys);

    const getPriceNet = (item) => {
      // Use language_currency_map to get correct currency
      if (item.price && item.language_currency_map) {
        const currency =
          item.language_currency_map[applicationLang] ||
          item.language_currency_map['pl'] ||
          'PLN';
        return Number(item.price[currency]) || Number(item.price.PLN) || 0;
      }

      // Fallback to PLN price if available
      if (item.price && item.price.PLN) {
        return Number(item.price.PLN) || 0;
      }

      return 0;
    };

    const createPipeline = (series, values, heightKeys) => [
      {
        $match: {
          height_mm: { $in: heightKeys },
          type: application.type,
          series: { $regex: new RegExp(`^${series}$`, 'i') },
        },
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: heightKeys.map((key, index) => ({
                case: { $eq: ['$height_mm', key] },
                then: index,
              })),
              default: heightKeys.length,
            },
          },
          count: {
            $arrayElemAt: [
              values,
              {
                $indexOfArray: [heightKeys, '$height_mm'],
              },
            ],
          },
        },
      },
      {
        $sort: { sortKey: 1 },
      },
      {
        $project: { sortKey: 0 },
      },
    ];

    const products_spiral = await Products.aggregate(
      createPipeline(
        'spiral',
        Object.values(zbiorcza_TP.m_spiral),
        Object.keys(zbiorcza_TP.m_spiral),
      ),
    );
    const products_standard = await Products.aggregate(
      createPipeline(
        'standard',
        Object.values(zbiorcza_TP.m_standard),
        Object.keys(zbiorcza_TP.m_standard),
      ),
    );
    const products_max = await Products.aggregate(
      createPipeline(
        'max',
        Object.values(zbiorcza_TP.m_max),
        Object.keys(zbiorcza_TP.m_max),
      ),
    );
    const products_raptor = await Products.aggregate(
      createPipeline(
        'raptor',
        Object.values(zbiorcza_TP.m_raptor),
        Object.keys(zbiorcza_TP.m_raptor),
      ),
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
      const filteredItems = items.filter((item) => {
        const itemCount = Math.round(countObj[item.height_mm] || 0);
        return itemCount > 0;
      });

      return filteredItems.map((item) => {
        if (item.series === series) {
          const count = Math.round(countObj[item.height_mm] || 0);
          const priceNet = getPriceNet(item);
          item.count = count;
          item.total_price = (count * priceNet).toFixed(2);
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
        existingItem.count += Number(additionalProduct.count) || 0;
        const priceNet = getPriceNet(existingItem);
        existingItem.total_price = (existingItem.count * priceNet).toFixed(2);
      } else {
        const priceNet = getPriceNet(additionalProduct);
        items.push({
          ...additionalProduct,
          count: Number(additionalProduct.count) || 0,
          total_price: (
            (Number(additionalProduct.count) || 0) * priceNet
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
      const count = Number(additionalAccessory.count) || 0;
      const priceNet = getPriceNet(additionalAccessory);

      items.push({
        ...additionalAccessory,
        count: count,
        total_price: (count * priceNet).toFixed(2),
      });
    });

    // Recalculate total price of the full order using rounded counts
    const totalOrderPrice = items
      .reduce((sum, item) => {
        const roundedCount = Math.round(item.count || 0);
        const itemTotal = roundedCount * getPriceNet(item);
        return sum + itemTotal;
      }, 0)
      .toFixed(2);

    // TODO: Tutaj based on lang
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
      const getExpiryDate = () => {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        return date.toLocaleDateString(
          `${applicationLang}-${applicationLang.toUpperCase()}`,
        );
      };

      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [40, 120, 40, 60],
        header: function (currentPage) {
          const commonHeader = {
            columns: [
              {
                image: path.join(__dirname, '../../public/images/logo.png'),
                width: 150,
                margin: [40, 20, 0, 0],
              },
              {
                stack: [
                  { text: 'Deck-Dry Polska sp. z o.o. ', style: 'companyName' },
                  { text: 'ul. Wenus 73A', style: 'companyInfo' },
                  { text: '80-299 Gdańsk', style: 'companyInfo' },
                  { text: 'NIP: 5841183361', style: 'companyInfo' },
                ],
                alignment: 'right',
                margin: [0, 20, 40, 0],
              },
            ],
          };

          if (currentPage === 1) {
            return {
              stack: [
                commonHeader,
                {
                  columns: [
                    {
                      width: '*',
                      text: t.pdf.offerTitle,
                      style: 'offerTitle',
                      alignment: 'center',
                    },
                  ],
                  margin: [0, 10, 0, 0],
                },
                {
                  columns: [
                    {
                      width: '*',
                      text: [
                        {
                          text: t.pdf.dateCreated + '  ',
                          style: 'dateLabel',
                        },
                        {
                          text: new Date().toLocaleDateString(
                            `${applicationLang}-${applicationLang.toUpperCase()}`,
                          ),
                          style: 'dateValue',
                        },
                        {
                          text: t.pdf.validUntil + '  ',
                          style: 'dateLabel',
                        },
                        { text: getExpiryDate(), style: 'dateValue' },
                      ],
                      alignment: 'center',
                    },
                  ],
                  margin: [0, 5, 0, 0],
                },
                {
                  columns: [
                    {
                      width: '50%',
                      stack: [
                        { text: t.pdf.salesDepartment, style: 'contactHeader' },
                        {
                          text: 'Adam Runo | +48 508 000 813 | adam.runo@ddgro.eu',
                          style: 'contactInfo',
                        },
                      ],
                      margin: [40, 5, 0, 0],
                    },
                    {
                      width: '50%',
                      stack: [
                        {
                          text: t.pdf.customerService,
                          style: 'contactHeader',
                        },
                        {
                          text: 'Greta Sosnowska | +48 517 062 150 | greta.sosnowska@ddgro.eu',
                          style: 'contactInfo',
                        },
                      ],
                      margin: [0, 5, 40, 0],
                    },
                  ],
                },
                {
                  text: t.pdf.producer,
                  style: 'producerInfo',
                  alignment: 'center',
                  margin: [0, 5, 0, 0],
                },
              ],
            };
          }
          return commonHeader;
        },
        footer: function (currentPage, pageCount) {
          return {
            columns: [
              { text: 'www.ddgro.com', alignment: 'left' },
              {
                text: `${
                  applicationLang === 'pl' ? 'Strona' : 'Page'
                } ${currentPage} ${
                  applicationLang === 'pl' ? 'z' : 'of'
                } ${pageCount}`,
                alignment: 'right',
              },
            ],
            margin: [40, 0, 40, 40],
            fontSize: 8,
            color: '#666666',
          };
        },
        content: [
          { text: t.pdf.supportsList, style: 'mainHeader' },
          {
            table: {
              headerRows: 1,
              widths: ['40%', '15%', '15%', '15%', '15%'],
              body: [
                [
                  { text: t.pdf.name, style: 'tableHeader' },
                  { text: t.pdf.height, style: 'tableHeader' },
                  { text: t.pdf.quantity, style: 'tableHeader' },
                  { text: t.pdf.catalogPrice, style: 'tableHeader' },
                  { text: t.pdf.totalNet, style: 'tableHeader' },
                ],
                ...items.map((item) => [
                  {
                    text:
                      item.name?.[applicationLang] ||
                      item.name?.pl ||
                      item.name ||
                      'N/A',
                    style: 'tableCell',
                  },
                  { text: item.height_mm || '--', style: 'tableCell' },
                  {
                    text: Math.round(item.count || 0),
                    style: 'tableCell',
                    alignment: 'right',
                  },
                  {
                    text: new Intl.NumberFormat(
                      `${applicationLang}-${applicationLang.toUpperCase()}`,
                      {
                        minimumFractionDigits: 2,
                      },
                    ).format(getPriceNet(item)),
                    style: 'tableCell',
                    alignment: 'right',
                  },
                  {
                    text: new Intl.NumberFormat(
                      `${applicationLang}-${applicationLang.toUpperCase()}`,
                      {
                        minimumFractionDigits: 2,
                      },
                    ).format(Math.round(item.count || 0) * getPriceNet(item)),
                    style: 'tableCell',
                    alignment: 'right',
                  },
                ]),
              ],
            },
            layout: {
              hLineWidth: function (i, node) {
                return 1;
              },
              vLineWidth: function (i) {
                return 1;
              },
              hLineColor: function (i, node) {
                return '#CCCCCC';
              },
              vLineColor: function (i) {
                return '#CCCCCC';
              },
              fillColor: function (rowIndex, node, columnIndex) {
                return rowIndex % 2 === 0 && rowIndex !== 0 ? '#F9F9F9' : null;
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
                      { text: t.pdf.totalNetSum, style: 'totalLabel' },
                      { text: total + ' PLN', style: 'totalAmount' },
                    ],
                  ],
                },
                layout: 'noBorders',
                margin: [0, 20, 0, 0],
              },
            ],
          },
          // {
          //   text: [
          //     '\nUwaga: ',
          //     {
          //       text: 'Przedstawiona oferta ma charakter informacyjny i nie stanowi oferty handlowej w rozumieniu Art.66 § 1 Kodeksu Cywilnego.',
          //       italics: true,
          //     },
          //   ],
          //   style: 'disclaimer',
          //   margin: [0, 20, 0, 20],
          // },
          { text: '', pageBreak: 'before' },
          {
            stack: [
              {
                text: t.pdf.catalogTitle,
                style: 'qrTitle',
                alignment: 'center',
                margin: [0, 60, 0, 10],
              },
              {
                // TODO: przygotowac katalogi w wersjach jezykowych  i podmienic na produkcji
                text: 'ddgro.eu/ddgro-' + applicationLang,
                style: 'qrLink',
                alignment: 'center',
                margin: [0, 0, 0, 40],
              },
              {
                image: path.join(__dirname, '../../public/images/qr-code.png'),
                width: 240,
                alignment: 'center',
                margin: [0, 0, 0, 0],
              },
            ],
          },
          { text: '', pageBreak: 'before' },
          {
            image: path.join(__dirname, '../../public/images/footer-image.png'),
            width: 400,
            alignment: 'center',
            margin: [0, 20, 0, 40],
          },
          {
            text: t.pdf.whyOrderFromUs,
            style: 'footerHeader',
            alignment: 'center',
            margin: [0, 0, 0, 20],
          },
          {
            ul: t.pdf.benefits,
            style: 'footerList',
            alignment: 'center',
            margin: [100, 0, 100, 0],
            type: 'none',
          },
        ],
        styles: {
          mainHeader: {
            fontSize: 24,
            bold: true,
            margin: [0, 20, 0, 10],
          },
          companyName: {
            fontSize: 14,
            bold: true,
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
            alignment: 'right',
            margin: [0, 0, 10, 0],
          },
          totalAmount: {
            fontSize: 12,
            bold: true,
            alignment: 'right',
          },
          disclaimer: {
            fontSize: 8,
            color: '#666666',
          },
          footerHeader: {
            fontSize: 12,
            bold: true,
          },
          footerList: {
            fontSize: 10,
            color: '#333333',
          },
          offerTitle: {
            fontSize: 16,
            bold: true,
            color: '#000000',
          },
          dateLabel: {
            fontSize: 10,
            color: '#666666',
          },
          dateValue: {
            fontSize: 10,
            bold: true,
            color: '#000000',
          },
          contactHeader: {
            fontSize: 10,
            bold: true,
            color: '#666666',
          },
          contactInfo: {
            fontSize: 9,
            color: '#000000',
          },
          producerInfo: {
            fontSize: 8,
            color: '#666666',
          },
          qrTitle: {
            fontSize: 16,
            bold: true,
            color: '#000000',
          },
          qrLink: {
            fontSize: 12,
            color: '#000000',
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

    const pdfFilePath = await createPDF(items, total);
    // Check if the file exists
    if (!fs.existsSync(pdfFilePath)) {
      return res.status(500).json({
        message:
          'Nie udało się utoworzyć pliku PDF. Skontaktuj się z administratorem',
      });
    }
    const emailOptions = {
      from: `DDGRO.EU <noreply@ddpedestals.eu>`,
      to: to,
      subject: `${
        process.env.NODE_ENV === 'development'
          ? t.email.devSubject
          : t.email.subject
      }`,
      template: `order_${applicationLang}`,
      context: {
        items,
        total,
      },
      attachments: [
        {
          filename: (() => {
            switch (applicationLang) {
              case 'pl':
                return 'podsumowanie_wspornikow.pdf';
              case 'de':
                return 'stützen_zusammenfassung.pdf';
              case 'fr':
                return 'résumé_des_supports.pdf';
              case 'es':
                return 'resumen_de_soportes.pdf';
              default:
                return 'ddgro_offer.pdf';
            }
          })(),
          path: pdfFilePath,
          contentType: 'application/pdf',
        },
      ],
    };
    // do właściciela zawsze po polsku przychodzi info
    const toOwnerOptions = {
      from: `DDGRO.EU <noreply@ddpedestals.eu>`,
      to: 'jozef.baar@ddgro.eu',
      subject: 'Informacja o nowym zamówieniu',
      template: 'order_ext',
      context: {
        // Original data
        items,
        total,
        // Additional application data
        applicationId: application._id,
        clientEmail: application.email,
        formData: {
          type: application.type,
          totalArea: application.total_area,
          count: application.count,
          gapBetweenSlabs: application.gap_between_slabs,
          lowest: application.lowest,
          highest: application.highest,
          terraceThickness: application.terrace_thickness,
          distanceBetweenSupports: application.distance_between_supports,
          joistHeight: application.joist_height,
          slabWidth: application.slab_width,
          slabHeight: application.slab_height,
          slabThickness: application.slab_thickness,
          tilesPerRow: application.tiles_per_row,
          sumOfTiles: application.sum_of_tiles,
          supportType: application.support_type,
          mainSystem: application.main_system,
          nameSurname: application.name_surname,
          phone: application.phone,
          proffesion: application.proffesion,
          slabsCount: application.slabs_count,
          supportsCount: application.supports_count,
          createdAt: application.created_at,
          // Include arrays if they exist
          products: application.products || [],
          accessories: application.accessories || [],
          additionalAccessories: application.additional_accessories || [],
        },
      },
      attachments: [
        {
          filename: `oferta_wyslana_do_klienta_id_#${application._id}.pdf`,
          path: pdfFilePath,
          contentType: 'application/pdf',
        },
      ],
    };

    try {
      // development
      if (process.env.NODE_ENV === 'development') {
        const toDeveloperOptions = {
          from: `DDGRO.EU <noreply@ddpedestals.eu>`,
          to: 'joozef.baar@ddgro.eu',
          subject: '[DEV] Informacja o nowym zamówieniu',
          template: 'order_ext',
          context: {
            // Original data
            items,
            total,
            // Additional application data
            applicationId: application._id,
            clientEmail: application.email,
            formData: {
              type: application.type,
              totalArea: application.total_area,
              count: application.count,
              gapBetweenSlabs: application.gap_between_slabs,
              lowest: application.lowest,
              highest: application.highest,
              terraceThickness: application.terrace_thickness,
              distanceBetweenSupports: application.distance_between_supports,
              joistHeight: application.joist_height,
              slabWidth: application.slab_width,
              slabHeight: application.slab_height,
              slabThickness: application.slab_thickness,
              tilesPerRow: application.tiles_per_row,
              sumOfTiles: application.sum_of_tiles,
              supportType: application.support_type,
              mainSystem: application.main_system,
              nameSurname: application.name_surname,
              phone: application.phone,
              proffesion: application.proffesion,
              slabsCount: application.slabs_count,
              supportsCount: application.supports_count,
              createdAt: application.created_at,
              // Include arrays if they exist
              products: application.products || [],
              accessories: application.accessories || [],
              additionalAccessories: application.additional_accessories || [],
            },
          },
          attachments: [
            {
              filename: `oferta_wyslana_do_klienta_id_#${application._id}.pdf`,
              path: pdfFilePath,
              contentType: 'application/pdf',
            },
          ],
        };

        // Send both emails and wait for completion
        await Promise.all([
          sendEmail(emailOptions),
          sendEmail(toDeveloperOptions),
        ]);
      } else {
        // production
        await Promise.all([sendEmail(emailOptions), sendEmail(toOwnerOptions)]);
      }
    } finally {
      // Clean up the file after ALL emails are sent
      // Use setTimeout to ensure nodemailer has finished processing the file
      setTimeout(() => {
        fs.unlink(pdfFilePath, (err) => {
          if (err) console.error('Failed to delete temporary PDF file:', err);
          else console.log('Temporary PDF file deleted successfully');
        });
      }, 1000); // 1 second delay - file is read into memory as base64
    }

    res.status(200).json({
      message: t.email.offerSent,
      environment: process.env.NODE_ENV,
    });
  } catch (e) {
    console.error('Error:', e.message, e.stack);
    res.status(400).json({ message: e.message, error: e });
  }
});

module.exports = router;
