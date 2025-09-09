const mongoose = require('mongoose');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Migration script to change 'tiles' to 'slab' in Products collection
// Date: 2025-09-08
// Purpose: Align database with frontend naming convention

// MongoDB Atlas connection string should be in your environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB Atlas
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('MongoDB Atlas connected');
    migrateTilesToSlab();
  })
  .catch((err) => {
    console.error('MongoDB Atlas connection error:', err);
  });

async function migrateTilesToSlab() {
  try {
    console.log('Starting tiles to slab migration...');

    // Update all documents where type is 'tiles' to 'slab'
    const result = await mongoose.connection.db
      .collection('products')
      .updateMany({ type: 'tiles' }, { $set: { type: 'slab' } });

    console.log(`Migration completed successfully!`);
    console.log(`Documents matched: ${result.matchedCount}`);
    console.log(`Documents modified: ${result.modifiedCount}`);

    // Verify the change
    const slabCount = await mongoose.connection.db
      .collection('products')
      .countDocuments({ type: 'slab' });
    const tilesCount = await mongoose.connection.db
      .collection('products')
      .countDocuments({ type: 'tiles' });

    console.log(`Verification:`);
    console.log(`- Products with type 'slab': ${slabCount}`);
    console.log(`- Products with type 'tiles': ${tilesCount}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Export for testing purposes

module.exports = { migrateTilesToSlab };
