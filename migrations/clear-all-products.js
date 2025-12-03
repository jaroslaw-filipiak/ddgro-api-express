const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import the Products model
const Products = require('../models/Products');

/**
 * Clear All Products Script
 * This script removes ALL products from the database
 * Use with caution!
 */

async function clearAllProducts() {
  try {
    console.log('🗑️  Starting product deletion...\n');

    // Count existing products
    const count = await Products.countDocuments();
    console.log(`📊 Found ${count} products in database`);

    if (count === 0) {
      console.log('✅ Database is already empty');
      return;
    }

    // Show confirmation
    console.log(`\n⚠️  WARNING: This will DELETE all ${count} products!`);
    console.log('⚠️  This action cannot be undone!\n');

    // Delete all products
    const result = await Products.deleteMany({});
    console.log(`✅ Successfully deleted ${result.deletedCount} products`);

    // Verify deletion
    const remainingCount = await Products.countDocuments();
    if (remainingCount === 0) {
      console.log('✅ Database verified empty');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} products still remain`);
    }

  } catch (error) {
    console.error('❌ Error clearing products:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  // Check if MONGODB_URI is available
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables');
    console.log('💡 Make sure you have a .env file with MONGODB_URI set');
    process.exit(1);
  }

  console.log('📡 Connecting to MongoDB...');
  console.log('🔗 Database:', process.env.MONGODB_URI.replace(/\/\/.*@/, '//***@')); // Hide credentials

  // Connect to MongoDB
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('📡 Connected to MongoDB\n');
      return clearAllProducts();
    })
    .then(() => {
      console.log('\n🎉 Product deletion completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Operation failed:', error);
      process.exit(1);
    });
}

module.exports = { clearAllProducts };
