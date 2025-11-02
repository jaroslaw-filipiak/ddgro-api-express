const mongoose = require('mongoose');

// Define available languages - Polish is default
const SUPPORTED_LANGUAGES = ['pl', 'en', 'de', 'fr', 'es'];
const DEFAULT_LANGUAGE = 'pl';

// Define which fields need multilanguage support
const MULTILINGUAL_FIELDS = ['name', 'short_name', 'description'];

const ProductsSchema = new mongoose.Schema(
  {
    // Key/identifier from CSV first column
    key: {
      type: String,
      unique: true,
      sparse: true,
    },
    id: {
      type: mongoose.Schema.Types.Mixed, // Changed to Mixed to support decimal format like 102.010411
      required: true,
      unique: true,
    },
    // Product categorization
    product_group: {
      type: String,
      required: true, // This is always present in CSV (Kategoria)
    },
    series: {
      type: String,
      required: true, // This is always present in CSV (Grupa)
      /*
      "spiral"
      "podstawki-tarasowe"
      "max"
      "raptor"
      "standard"
      */
    },
    type: {
      type: String, // tiles, wood, tiles & wood, etc. TODO: tiles poprzednio slab
    },
    distance_code: {
      type: String, // Short name/code like STA-030-045-K3-(100)
    },
    // Image management
    image_url: {
      type: String, // Google Drive URLs
    },
    // Multilingual product names
    name: {
      type: Object,
      default: {},
      validate: {
        validator: function (value) {
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
    // Physical dimensions
    height_mm: {
      type: String,
    },
    height_inch: {
      type: String,
    },
    // Packaging information
    packaging: {
      type: Number, // Number of pieces per package
    },
    packaging_dimensions: {
      cm: {
        type: String, // e.g., "60 × 50 × 40"
      },
      inch: {
        type: String, // e.g., "23 5/8 × 19 11/16 × 15 3/4"
      },
    },
    packaging_weight: {
      kg: {
        type: Number,
      },
      lbs: {
        type: Number,
      },
    },
    // Pallet information
    euro_palet_products: {
      type: Number, // Total products per pallet
    },
    euro_palet_packages: {
      type: Number, // Number of packages per pallet (renamed from euro_palet)
    },
    pallet_dimensions: {
      cm: {
        type: String, // e.g., "120 × 100 × 220"
      },
      inch: {
        type: String, // e.g., "47 1/4 × 39 3/8 × 86 5/8"
      },
    },
    pallet_weight: {
      kg: {
        type: Number,
      },
      lbs: {
        type: Number,
      },
    },
    // Pricing information
    price_unit: {
      type: String,
      enum: ['unit', 'packaging'],
      default: 'unit',
    },
    price: {
      type: Object,
      default: {},
      validate: {
        validator: function (value) {
          return value && value['PLN'] !== undefined;
        },
        message: (props) => `PLN price is required`,
      },
    },
    catalog_number: {
      type: Number, // Reference number in price list
    },
    // Map language to currency code for automatic conversion
    language_currency_map: {
      type: Object,
      default: {
        pl: 'PLN',
        en: 'USD',
        de: 'EUR',
        fr: 'EUR',
        es: 'EUR',
      },
    },
    // VAT rates by country
    vat_rates: {
      type: Object,
      default: {
        PL: 23,
        DE: 19,
        FR: 20,
        ES: 21,
        US: 0,
        default: 23,
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

// Pre-save hook for data validation and processing
ProductsSchema.pre('save', function (next) {
  // Generate key from product info if not provided
  if (!this.key && this.distance_code && this.packaging) {
    this.key = `${this.distance_code} ${this.packaging}pcs`;
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

// Get comprehensive packaging information
ProductsSchema.methods.getPackagingInfo = function () {
  return {
    pieces_per_package: this.packaging,
    dimensions: this.packaging_dimensions,
    weight: this.packaging_weight,
    products_per_pallet: this.euro_palet_products,
    packages_per_pallet: this.euro_palet_packages,
    pallet_dimensions: this.pallet_dimensions,
    pallet_weight: this.pallet_weight,
  };
};

// Calculate total package weight for given quantity
ProductsSchema.methods.calculateShippingWeight = function (quantity) {
  if (!this.packaging_weight || !this.packaging_weight.kg) {
    return null;
  }

  const packagesNeeded = Math.ceil(quantity / this.packaging);
  const totalWeight = packagesNeeded * this.packaging_weight.kg;

  return {
    quantity: quantity,
    packages_needed: packagesNeeded,
    total_weight_kg: totalWeight,
    total_weight_lbs: totalWeight * 2.20462, // Convert kg to lbs
  };
};

// Get product type information
ProductsSchema.methods.getTypeInfo = function () {
  const typeMapping = {
    tiles: { 
      name: 'Płyty', 
      description: 'Do płyt tarasowych',
      icon: 'tiles'
    },
    wood: { 
      name: 'Legary', 
      description: 'Do legarów drewnianych',
      icon: 'wood'
    },
    'tiles & wood': { 
      name: 'Uniwersalny', 
      description: 'Do płyt i legarów',
      icon: 'universal'
    },
  };

  return typeMapping[this.type] || { 
    name: this.type, 
    description: this.type,
    icon: 'default'
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
