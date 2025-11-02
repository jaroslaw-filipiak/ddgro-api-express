const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import the Products model
const Products = require('../models/Products');

/**
 * Download Google Drive Images and Update Database Script - February 2025
 * This script:
 * 1. Downloads images from Google Drive URLs
 * 2. Saves them to frontend public/assets/products/
 * 3. Updates database to use local image paths
 * 4. Works with your loader.js system
 */

async function downloadAndUpdateImages() {
  try {
    console.log('🚀 Starting image download and database update...');

    // Step 1: Find products with Google Drive image URLs
    const productsWithImages = await findProductsWithImages();

    // Step 2: Create directories
    await createDirectories();

    // Step 3: Download and update each image
    await processProductImages(productsWithImages);

    console.log('✅ Image download and update completed successfully!');
  } catch (error) {
    console.error('❌ Process failed:', error);
    throw error;
  }
}

async function findProductsWithImages() {
  console.log('🔍 Finding products with Google Drive images...');
  
  const products = await Products.find({
    image_url: { 
      $exists: true, 
      $ne: null, 
      $ne: '',
      $regex: /drive\.google\.com/ 
    }
  }).lean();

  console.log(`📊 Found ${products.length} products with Google Drive images`);
  
  // Show sample URLs for debugging
  if (products.length > 0) {
    console.log('📋 Sample Google Drive URLs:');
    products.slice(0, 3).forEach(product => {
      console.log(`   - ${product.key}: ${product.image_url.substring(0, 60)}...`);
    });
  }

  return products;
}

async function createDirectories() {
  console.log('📁 Creating directories...');
  
  // Path to frontend assets
  const frontendAssetsPath = path.join(__dirname, '../../ddgro-form/public/assets/products');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(frontendAssetsPath)) {
    fs.mkdirSync(frontendAssetsPath, { recursive: true });
    console.log(`✅ Created directory: ${frontendAssetsPath}`);
  } else {
    console.log(`✅ Directory already exists: ${frontendAssetsPath}`);
  }
  
  return frontendAssetsPath;
}

async function processProductImages(products) {
  console.log('📥 Processing product images...');
  
  const frontendAssetsPath = await createDirectories();
  let downloaded = 0;
  let updated = 0;
  let errors = 0;

  for (const product of products) {
    try {
      console.log(`\n🔄 Processing: ${product.key}`);
      
      // Convert Google Drive URL to downloadable format
      const downloadUrl = convertGoogleDriveUrl(product.image_url);
      
      if (!downloadUrl) {
        console.log(`   ⚠️ Could not convert URL for ${product.key}`);
        errors++;
        continue;
      }

      // Generate clean filename
      const filename = generateImageFilename(product.key);
      const filePath = path.join(frontendAssetsPath, filename);
      
      // Download image
      const success = await downloadImage(downloadUrl, filePath);
      
      if (success) {
        downloaded++;
        console.log(`   ✅ Downloaded: ${filename}`);
        
        // Update database with local path
        const localImagePath = `products/${filename}`;
        await Products.updateOne(
          { _id: product._id },
          { 
            $set: { 
              image_url: localImagePath,
              // Keep original URL as backup
              original_image_url: product.image_url 
            } 
          }
        );
        
        updated++;
        console.log(`   🔄 Updated database: ${localImagePath}`);
      } else {
        errors++;
        console.log(`   ❌ Failed to download: ${product.key}`);
      }
      
      // Small delay to be nice to Google's servers
      await sleep(200);
      
    } catch (error) {
      console.error(`   ❌ Error processing ${product.key}:`, error.message);
      errors++;
    }
  }

  console.log(`\n📈 Download results:`);
  console.log(`   ✅ Downloaded: ${downloaded} images`);
  console.log(`   🔄 Updated: ${updated} database records`);
  console.log(`   ❌ Errors: ${errors} failed`);
}

function convertGoogleDriveUrl(url) {
  try {
    // Convert Google Drive sharing URL to direct download URL
    // Multiple formats supported:
    // 1. https://drive.google.com/open?id=FILE_ID&usp=drive_fs
    // 2. https://drive.google.com/file/d/FILE_ID/view
    // 3. https://drive.google.com/file/d/FILE_ID/edit
    // All convert to: https://drive.google.com/uc?export=download&id=FILE_ID
    
    let fileId = null;
    
    // Try format: ?id=FILE_ID
    const fileIdMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      fileId = fileIdMatch[1];
    }
    
    // Try format: /file/d/FILE_ID/
    if (!fileId) {
      const alternativeMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (alternativeMatch && alternativeMatch[1]) {
        fileId = alternativeMatch[1];
      }
    }
    
    // Try format: /d/FILE_ID/
    if (!fileId) {
      const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (dMatch && dMatch[1]) {
        fileId = dMatch[1];
      }
    }
    
    if (fileId) {
      // Use the more reliable download URL format
      return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=1`;
    }
    
    return null;
  } catch (error) {
    console.error('Error converting Google Drive URL:', error);
    return null;
  }
}

function generateImageFilename(productKey) {
  // Convert product key to clean filename
  // "030-045 K3 100pcs" -> "030-045-k3-100pcs.jpg"
  const cleanName = productKey
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // Replace non-alphanumeric with dash
    .replace(/-+/g, '-')          // Replace multiple dashes with single
    .replace(/^-|-$/g, '');       // Remove leading/trailing dashes
  
  return `${cleanName}.jpg`;
}

function downloadImage(url, filePath) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    const request = protocol.get(url, (response) => {
      // Handle redirects (Google Drive uses 301, 302, and 303)
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
        const redirectUrl = response.headers.location;
        console.log(`   🔀 Following redirect (${response.statusCode}) to: ${redirectUrl.substring(0, 50)}...`);
        return downloadImage(redirectUrl, filePath).then(resolve);
      }
      
      if (response.statusCode !== 200) {
        console.log(`   ❌ HTTP ${response.statusCode}: ${url.substring(0, 50)}...`);
        resolve(false);
        return;
      }
      
      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(true);
      });
      
      fileStream.on('error', (error) => {
        console.log(`   ❌ File write error:`, error.message);
        fs.unlink(filePath, () => {}); // Delete partial file
        resolve(false);
      });
    });
    
    request.on('error', (error) => {
      console.log(`   ❌ Request error:`, error.message);
      resolve(false);
    });
    
    request.setTimeout(30000, () => {
      console.log(`   ⏰ Request timeout for ${url.substring(0, 50)}...`);
      request.abort();
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run script if called directly
if (require.main === module) {
  // Check if MONGODB_URI is available
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables');
    console.log('💡 Make sure you have a .env file with MONGODB_URI set');
    process.exit(1);
  }

  console.log('📡 Using MongoDB URI from .env file');
  
  // Connect to MongoDB using environment variable
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('📡 Connected to MongoDB');
      return downloadAndUpdateImages();
    })
    .then(() => {
      console.log('🎉 Image processing completed successfully');
      console.log('\n📝 Next steps:');
      console.log('   1. Check ddgro-form/public/assets/products/ for downloaded images');
      console.log('   2. Verify your NEXT_PUBLIC_IMAGE_BASE_URL in frontend .env');
      console.log('   3. Test image loading with your loader.js');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Process failed:', error);
      process.exit(1);
    });
}

module.exports = { downloadAndUpdateImages }; 