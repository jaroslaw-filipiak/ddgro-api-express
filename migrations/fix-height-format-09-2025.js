const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// MongoDB Atlas connection string should be in your environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// Use the existing Products model
const Products = require('../models/Products');

// Connect to MongoDB Atlas
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('MongoDB Atlas connected');
    fixHeightFormat();
  })
  .catch((err) => {
    console.error('MongoDB Atlas connection error:', err);
  });

async function fixHeightFormat() {
  try {
    console.log('Starting height_mm format migration...');

    // Find all products where height_mm contains " - " and " mm"
    // This will match patterns like "30 - 50 mm", "10 - 15 mm", etc.
    const query = {
      height_mm: {
        $regex: /\d+\s*-\s*\d+\s*mm/i,
        $exists: true,
        $ne: null,
      },
    };

    const productsToUpdate = await Products.find(query);

    console.log(
      `Found ${productsToUpdate.length} products with height_mm format to fix`,
    );

    if (productsToUpdate.length === 0) {
      console.log(
        'No products found with the specified format. Migration complete.',
      );
      mongoose.connection.close();
      return;
    }

    // Show some examples of what will be changed
    console.log('\nExamples of changes that will be made:');
    productsToUpdate.slice(0, 5).forEach((product, index) => {
      const originalValue = product.height_mm;
      const newValue = convertHeightFormat(originalValue);
      console.log(`${index + 1}. "${originalValue}" → "${newValue}"`);
    });

    // Ask for confirmation (comment out in production)
    console.log(
      `\nProceeding with migration of ${productsToUpdate.length} products...`,
    );

    let updatedCount = 0;
    let errorCount = 0;

    for (const product of productsToUpdate) {
      try {
        const originalValue = product.height_mm;
        const newValue = convertHeightFormat(originalValue);

        await Products.updateOne(
          { _id: product._id },
          { $set: { height_mm: newValue } },
        );

        updatedCount++;

        if (updatedCount % 50 === 0) {
          console.log(
            `Progress: ${updatedCount}/${productsToUpdate.length} products updated`,
          );
        }
      } catch (error) {
        console.error(`Error updating product ${product._id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nMigration completed!`);
    console.log(`✅ Successfully updated: ${updatedCount} products`);

    if (errorCount > 0) {
      console.log(`❌ Errors encountered: ${errorCount} products`);
    }

    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Migration error:', error);
    mongoose.connection.close();
  }
}

/**
 * Convert height format from "30 - 50 mm" to "30-50"
 * @param {string} heightValue - Original height value
 * @returns {string} - Converted height value
 */
function convertHeightFormat(heightValue) {
  if (!heightValue || typeof heightValue !== 'string') {
    return heightValue;
  }

  // Remove " mm" suffix (case insensitive)
  let converted = heightValue.replace(/\s*mm$/i, '');

  // Remove spaces around dashes: "30 - 50" → "30-50"
  converted = converted.replace(/\s*-\s*/g, '-');

  return converted;
}

// Export for testing purposes
module.exports = {
  convertHeightFormat,
  fixHeightFormat,
};
