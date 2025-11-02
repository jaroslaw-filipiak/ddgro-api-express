const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// MongoDB Atlas connection string should be in your environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// Define the Products schema directly in the migration script to avoid circular dependencies
const ProductsSchema = new mongoose.Schema(
  {
    id: Number,
    series: String,
    product_group: String,
    type: String,
    distance_code: mongoose.Schema.Types.Mixed,
    code: mongoose.Schema.Types.Mixed,
    name: mongoose.Schema.Types.Mixed,
    short_name: mongoose.Schema.Types.Mixed,
    description: mongoose.Schema.Types.Mixed,
    height_mm: String,
    height_inch: String,
    packaging: Number,
    euro_palet: Number,
    price_net: Number,
    price: Object,
    language_currency_map: Object,
    vat_rates: Object,
  },
  {
    strict: false, // Allow all fields for migration
    timestamps: true,
  },
);

const Products = mongoose.model('Products', ProductsSchema);

// Connect to MongoDB Atlas
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('MongoDB Atlas connected');
    migrateProducts();
  })
  .catch((err) => {
    console.error('MongoDB Atlas connection error:', err);
  });

async function migrateProducts() {
  try {
    console.log('Starting migration...');
    let totalUpdated = 0;

    // 1. Add code field as duplicate of distance_code
    console.log('Adding code field as duplicate of distance_code...');
    const productsWithDistanceCode = await Products.find({
      distance_code: { $exists: true },
    });

    for (const product of productsWithDistanceCode) {
      await Products.updateOne(
        { _id: product._id },
        { $set: { code: product.distance_code } },
      );
    }

    console.log(
      `Updated code field for ${productsWithDistanceCode.length} products`,
    );
    totalUpdated += productsWithDistanceCode.length;

    // 2. Add product_group field as duplicate of series
    console.log('Adding product_group field as duplicate of series...');
    const productsWithSeries = await Products.find({
      series: { $exists: true },
    });

    for (const product of productsWithSeries) {
      await Products.updateOne(
        { _id: product._id },
        { $set: { product_group: product.series } },
      );
    }

    console.log(
      `Updated product_group field for ${productsWithSeries.length} products`,
    );
    totalUpdated += productsWithSeries.length;

    // 3. Convert single string name/short_name to multilanguage format
    console.log('Converting text fields to multilanguage format...');
    const productsWithStringName = await Products.find({
      name: { $type: 'string' },
    });

    for (const product of productsWithStringName) {
      const nameUpdate = { name: { pl: product.name } };

      if (typeof product.short_name === 'string') {
        nameUpdate.short_name = { pl: product.short_name };
      }

      await Products.updateOne({ _id: product._id }, { $set: nameUpdate });
    }

    console.log(
      `Converted name/short_name for ${productsWithStringName.length} products`,
    );
    totalUpdated += productsWithStringName.length;

    // 4. Convert single price value to PLN format
    console.log('Converting price to multi-currency format...');
    const productsWithNumberPrice = await Products.find({
      price_net: { $exists: true, $ne: null },
    });

    for (const product of productsWithNumberPrice) {
      await Products.updateOne(
        { _id: product._id },
        { $set: { price: { PLN: product.price_net } } },
      );
    }

    console.log(
      `Converted price for ${productsWithNumberPrice.length} products`,
    );
    totalUpdated += productsWithNumberPrice.length;

    // 5. Set default language_currency_map and vat_rates for all products
    console.log('Setting default language_currency_map and vat_rates...');

    const defaultLanguageCurrencyMap = {
      pl: 'PLN',
      en: 'USD',
      de: 'EUR',
      fr: 'EUR',
      es: 'EUR',
    };

    const defaultVatRates = {
      PL: 23,
      DE: 19,
      FR: 20,
      ES: 21,
      US: 0,
      default: 23,
    };

    const result = await Products.updateMany(
      { language_currency_map: { $exists: false } },
      {
        $set: {
          language_currency_map: defaultLanguageCurrencyMap,
          vat_rates: defaultVatRates,
        },
      },
    );

    console.log(`Set default maps for ${result.modifiedCount} products`);
    totalUpdated += result.modifiedCount;

    console.log(
      `Migration completed successfully. Total updates: ${totalUpdated}`,
    );

    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Migration error:', error);
    mongoose.connection.close();
  }
}
