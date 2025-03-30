const mongoose = require('mongoose');

// Define available languages - Polish is default
const SUPPORTED_LANGUAGES = ['pl', 'en', 'de', 'fr', 'es'];
const DEFAULT_LANGUAGE = 'pl';

// Define which fields need multilanguage support
const MULTILINGUAL_FIELDS = ['name', 'short_name', 'description'];

const ProductsSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    // Duplicate of 'series' for backward compatibility
    series: {
      type: String,
    },
    // New field to replace 'series' in the future
    product_group: {
      type: String,
    },
    type: {
      type: String,
    },
    // Original distance_code field
    distance_code: {
      type: mongoose.Schema.Types.Mixed,
    },
    // Duplicate of distance_code for future use
    code: {
      type: mongoose.Schema.Types.Mixed,
    },
    name: {
      type: Object,
      default: {},
      validate: {
        validator: function (value) {
          // Ensure at least default language exists
          return (
            value &&
            value[DEFAULT_LANGUAGE] &&
            value[DEFAULT_LANGUAGE].length > 0
          );
        },
        message: (props) =>
          `${DEFAULT_LANGUAGE} language is required for name field`,
      },
    },
    short_name: {
      type: Object,
      default: {},
    },
    description: {
      type: Object,
      default: {},
    },
    height_mm: {
      type: String,
    },
    height_inch: {
      type: String,
    },
    packaging: {
      type: Number,
    },
    euro_palet: {
      type: Number,
    },
    // Prices in different currencies
    price: {
      type: Object,
      default: {},
      validate: {
        validator: function (value) {
          // Ensure at least PLN price exists
          return value && value['PLN'] !== undefined;
        },
        message: (props) => `PLN price is required`,
      },
    },
    // Map language to currency code for automatic conversion
    language_currency_map: {
      type: Object,
      default: {
        pl: 'PLN', // Polish Zloty (main currency)
        en: 'USD', // US Dollar
        de: 'EUR', // Euro
        fr: 'EUR', // Euro
        es: 'EUR', // Euro
      },
    },
    // VAT rates by country
    vat_rates: {
      type: Object,
      default: {
        PL: 23, // 23% in Poland
        DE: 19, // 19% in Germany
        FR: 20, // 20% in France
        ES: 21, // 21% in Spain
        US: 0, // No VAT in US (handled by state taxes)
        default: 23, // Default VAT rate (Polish)
      },
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Pre-save hook to synchronize code with distance_code and product_group with series
ProductsSchema.pre('save', function (next) {
  // Sync code with distance_code if distance_code exists
  if (this.distance_code !== undefined && this.isModified('distance_code')) {
    this.code = this.distance_code;
  }

  // Sync product_group with series if series exists
  if (this.series !== undefined && this.isModified('series')) {
    this.product_group = this.series;
  }

  next();
});

// Add instance method to get localized content
ProductsSchema.methods.getLocalized = function (
  field,
  language = DEFAULT_LANGUAGE,
) {
  if (!this[field]) return '';
  return this[field][language] || this[field][DEFAULT_LANGUAGE] || '';
};

// Add instance method to get all available content in user's preferred language
ProductsSchema.methods.getAllLocalized = function (
  language = DEFAULT_LANGUAGE,
  includePriceDetails = false,
) {
  const result = { ...this.toObject() };

  // Replace multilingual fields with localized versions
  MULTILINGUAL_FIELDS.forEach((field) => {
    if (this[field]) {
      result[field] = this.getLocalized(field, language);
    }
  });

  // Handle price localization based on language
  if (this.price) {
    // Get the currency for this language
    const currency =
      this.language_currency_map[language] ||
      this.language_currency_map[DEFAULT_LANGUAGE];

    // Get the price in the requested currency, or fallback to main currency (PLN)
    if (this.price[currency]) {
      result.price_display = {
        amount: this.price[currency],
        currency: currency,
        formatted: this.formatPrice(this.price[currency], currency),
      };
    } else if (this.price['PLN']) {
      // If we don't have the price in requested currency, use PLN as fallback
      result.price_display = {
        amount: this.price['PLN'],
        currency: 'PLN',
        formatted: this.formatPrice(this.price['PLN'], 'PLN'),
      };
    }

    // Include all available prices if requested
    if (includePriceDetails) {
      result.all_prices = this.price;
    } else {
      // Remove the detailed price object if not needed
      delete result.price;
      delete result.language_currency_map;
      delete result.vat_rates;
    }
  }

  return result;
};

// Format price for display
ProductsSchema.methods.formatPrice = function (amount, currency) {
  let locale = 'en';

  // Use appropriate locale for currency
  if (currency === 'PLN') locale = 'pl';
  else if (currency === 'EUR') locale = 'de';

  // Use Intl.NumberFormat for proper currency formatting
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

// Get price with VAT for specific country
ProductsSchema.methods.getPriceWithVAT = function (
  country = 'PL',
  currency = 'PLN',
) {
  if (!this.price || !this.price[currency]) {
    return null;
  }

  // Get VAT rate for the country
  const vatRate =
    this.vat_rates[country] !== undefined
      ? this.vat_rates[country]
      : this.vat_rates.default;

  // Calculate price with VAT
  const netPrice = this.price[currency];
  const grossPrice = netPrice * (1 + vatRate / 100);

  return {
    net: netPrice,
    gross: grossPrice,
    vat_rate: vatRate,
    vat_amount: grossPrice - netPrice,
    currency: currency,
    formatted_net: this.formatPrice(netPrice, currency),
    formatted_gross: this.formatPrice(grossPrice, currency),
  };
};

// Add static method to find by localized field
ProductsSchema.statics.findByLocalized = async function (
  field,
  value,
  language = DEFAULT_LANGUAGE,
) {
  const query = {};
  query[`${field}.${language}`] = value;

  return this.find(query);
};

module.exports = mongoose.model('Products', ProductsSchema);
