const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Load environment variables from parent directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import the updated Products model
const Products = require('../models/Products');

/**
 * Fresh Products Import Script - February 2025
 * This script:
 * 1. Drops all existing products
 * 2. Imports fresh data from CSV
 * 3. Creates products with new enhanced schema
 */

async function freshImportProducts() {
  try {
    console.log('🚀 Starting fresh products import...');

    // Step 1: Drop all existing products
    await dropExistingProducts();

    // Step 2: Import new products from CSV
    await importProductsFromCSV();

    console.log('✅ Fresh import completed successfully!');
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

async function dropExistingProducts() {
  console.log('🗑️ Dropping all existing products...');
  
  const count = await Products.countDocuments();
  console.log(`Found ${count} existing products to remove`);
  
  if (count > 0) {
    await Products.deleteMany({});
    console.log('✅ All existing products removed');
  } else {
    console.log('✅ No existing products to remove');
  }
}

async function importProductsFromCSV() {
  console.log('📥 Importing products from CSV...');

  const csvPath = path.join(__dirname, '../temp/new-data.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.log('⚠️ CSV file not found at:', csvPath);
    return;
  }

  const products = [];
  let lineNumber = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath, { encoding: 'utf8' })
      .pipe(csv({
        separator: ',',
        skipEmptyLines: true,
        headers: false, // We'll handle headers manually
      }))
      .on('data', (row) => {
        lineNumber++;
        
        // Skip the first two header rows
        if (lineNumber <= 2) {
          if (lineNumber === 1) {
            console.log('📋 Header row 1:', Object.values(row).slice(0, 10));
          }
          return;
        }

        try {
          // Convert row object to array
          const rowArray = Object.values(row);
          
          // Skip empty rows
          if (!rowArray[0] || rowArray[0].trim() === '') {
            return;
          }

          const productData = transformCSVRowToProduct(rowArray);
          if (productData) {
            products.push(productData);
            if (products.length % 10 === 0) {
              console.log(`📊 Processed ${products.length} products...`);
            }
          }
        } catch (error) {
          console.error(`Error processing row ${lineNumber}:`, error);
        }
      })
      .on('end', async () => {
        console.log(`📊 Total processed: ${products.length} products from CSV`);
        
        try {
          await saveProductsBatch(products);
          resolve();
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
}

function transformCSVRowToProduct(row) {
  // CSV Column mapping based on your file structure:
  // 0: key, 1: product_group, 2: series, 3: id, 4: image_url, 5: distance_code, 
  // 6: type, 7: name_pl, 8: name_en, 9: name_de, 10: name_fr, 11: name_es,
  // 12: height_mm, 13: height_inch, 14: packaging, 15-16: packaging_dimensions,
  // 17-18: packaging_weight, 19: euro_palet_products, 20: euro_palet_packages,
  // 21-22: pallet_dimensions, 23-24: pallet_weight, 25: price_unit,
  // 26: price_PLN, 27: price_EUR, 28: price_USD, 29: catalog_number
  // + Auto-added: language_currency_map, vat_rates (default values)

  const key = row[0]?.trim();
  const product_group = row[1]?.trim();
  const series = row[2]?.trim();
  const id = row[3]?.trim();

  // Skip rows with missing essential data
  if (!key || !product_group || !series || !id) {
    return null;
  }

  try {
    return {
      key: key,
      id: parseFloat(id) || id,
      product_group: product_group,
      series: series,
      type: row[6]?.trim(),
      distance_code: row[5]?.trim(),
      image_url: row[4]?.trim(),
      
      // Multilingual names
      name: {
        pl: row[7]?.trim() || '',
        en: row[8]?.trim() || '',
        de: row[9]?.trim() || '',
        fr: row[10]?.trim() || '',
        es: row[11]?.trim() || '',
      },
      
      // Dimensions
      height_mm: row[12]?.trim(),
      height_inch: row[13]?.trim(),
      
      // Packaging
      packaging: parseInt(row[14]) || 0,
      packaging_dimensions: {
        cm: row[15]?.trim(),
        inch: row[16]?.trim(),
      },
      packaging_weight: {
        kg: parseFloat(row[17]) || 0,
        lbs: parseFloat(row[18]) || 0,
      },
      
      // Pallet information
      euro_palet_products: parseInt(row[19]) || 0,
      euro_palet_packages: parseInt(row[20]) || 0,
      pallet_dimensions: {
        cm: row[21]?.trim(),
        inch: row[22]?.trim(),
      },
      pallet_weight: {
        kg: parseFloat(row[23]) || 0,
        lbs: parseFloat(row[24]) || 0,
      },
      
      // Pricing
      price_unit: row[25]?.trim() || 'unit',
      price: {
        PLN: parseFloat(row[26]?.replace(',', '.')) || 0,
        EUR: parseFloat(row[27]?.replace(',', '.')) || 0,
        USD: parseFloat(row[28]?.replace(',', '.')) || 0,
      },
      catalog_number: parseInt(row[29]) || null,
      
      // Default system objects
      language_currency_map: {
        pl: 'PLN',
        en: 'USD',
        de: 'EUR',
        fr: 'EUR',
        es: 'EUR',
      },
      vat_rates: {
        PL: 23,
        DE: 19,
        FR: 20,
        ES: 21,
        US: 0,
        default: 23,
      },
    };
  } catch (error) {
    console.error('Error transforming row:', error, row.slice(0, 5));
    return null;
  }
}

async function saveProductsBatch(products) {
  console.log('💾 Saving products to database...');
  
  let created = 0;
  let errors = 0;
  const batchSize = 50;

  // Process in batches for better performance
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    
    try {
      const result = await Products.insertMany(batch, { 
        ordered: false, // Continue on errors
        lean: true 
      });
      created += result.length;
      console.log(`✅ Saved batch ${Math.floor(i/batchSize) + 1}: ${result.length} products`);
    } catch (error) {
      // Handle bulk insert errors
      if (error.writeErrors) {
        created += (batch.length - error.writeErrors.length);
        errors += error.writeErrors.length;
        
        console.log(`⚠️ Batch ${Math.floor(i/batchSize) + 1}: ${batch.length - error.writeErrors.length} saved, ${error.writeErrors.length} errors`);
        
        // Log first few errors for debugging
        error.writeErrors.slice(0, 3).forEach(err => {
          console.error(`   Error: ${err.errmsg}`);
        });
      } else {
        console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
        errors += batch.length;
      }
    }
  }

  console.log(`📈 Import results:`);
  console.log(`   ✅ Created: ${created} products`);
  console.log(`   ❌ Errors: ${errors} products`);
  
  // Show sample of imported products
  const sampleProducts = await Products.find({}).limit(3).lean();
  console.log(`📋 Sample imported products:`);
  sampleProducts.forEach(product => {
    console.log(`   - ${product.key}: ${product.name?.pl || 'No name'}`);
  });
  
  console.log(`\n✨ Each product includes:`);
  console.log(`   📊 Complete pricing (PLN, EUR, USD)`);
  console.log(`   🌍 Language-currency mapping`);
  console.log(`   💰 VAT rates for all countries`);
  console.log(`   📦 Enhanced packaging information`);
}

// Run import if called directly
if (require.main === module) {
  // Check if MONGODB_URI is available
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables');
    console.log('💡 Make sure you have a .env file with MONGODB_URI set');
    process.exit(1);
  }

  console.log('📡 Using MongoDB URI from .env file');
  console.log('🔗 Database:', process.env.MONGODB_URI.replace(/\/\/.*@/, '//***@')); // Hide credentials
  
  // Connect to MongoDB using environment variable
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('📡 Connected to MongoDB');
      return freshImportProducts();
    })
    .then(() => {
      console.log('🎉 Fresh import completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Import failed:', error);
      process.exit(1);
    });
}

module.exports = { freshImportProducts }; 