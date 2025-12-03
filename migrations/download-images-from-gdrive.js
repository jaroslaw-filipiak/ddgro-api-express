const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const readline = require('readline');

/**
 * Download Product Images from Google Drive
 * 
 * This script:
 * 1. Reads Excel file with Google Drive image URLs
 * 2. Converts distance_code to filename (e.g., STA-030-045-K3-(100) -> 030-045-k3-100pcs.jpg)
 * 3. Downloads images that don't already exist
 * 4. Saves to front/public/assets/products/
 */

const IMAGES_DIR = path.join(__dirname, '../../front/public/assets/products');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Convert distance_code to image filename
 * Input:  STA-030-045-K3-(100) or SPI-010-017-D3-(125)
 * Output: 030-045-k3-100pcs.jpg or 010-017-d3-125pcs.jpg
 */
function distanceCodeToFilename(distanceCode) {
  if (!distanceCode) return null;
  
  const code = distanceCode.toString().trim();
  
  // Pattern: PREFIX-HEIGHT_FROM-HEIGHT_TO-TYPE-(QTY)
  // Examples: STA-030-045-K3-(100), SPI-010-017-D3-(125), MAX-045-075-D3-(54)
  const match = code.match(/^[A-Z]+-(\d+)-(\d+)-([A-Z0-9]+)-\((\d+)\)$/i);
  
  if (match) {
    const [, heightFrom, heightTo, type, qty] = match;
    return `${heightFrom}-${heightTo}-${type.toLowerCase()}-${qty}pcs.jpg`;
  }
  
  // Try alternative patterns for accessories
  // Example: accessories might have different patterns
  const altMatch = code.match(/^([A-Z]+)-([A-Z0-9-]+)-\((\d+)\)$/i);
  if (altMatch) {
    const [, prefix, name, qty] = altMatch;
    return `${name.toLowerCase()}-${qty}pcs.jpg`;
  }
  
  return null;
}

/**
 * Extract Google Drive file ID from URL
 */
function extractGoogleDriveId(url) {
  if (!url) return null;
  
  const urlStr = url.toString().trim();
  if (!urlStr.includes('drive.google.com')) return null;
  
  const idMatch = urlStr.match(/[?&]id=([a-zA-Z0-9_-]+)/) || 
                  urlStr.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  
  return idMatch ? idMatch[1] : null;
}

/**
 * Download file from Google Drive
 * Handles redirects (301, 302, 303) and confirmation pages
 */
function downloadFromGoogleDrive(fileId, outputPath) {
  return new Promise((resolve, reject) => {
    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    const download = (downloadUrl, redirectCount = 0, cookies = '') => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }
      
      const urlObj = new URL(downloadUrl);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,*/*',
        }
      };
      
      if (cookies) {
        options.headers['Cookie'] = cookies;
      }
      
      https.get(options, (response) => {
        // Collect cookies from response
        const setCookies = response.headers['set-cookie'];
        let newCookies = cookies;
        if (setCookies) {
          const cookieValues = setCookies.map(c => c.split(';')[0]).join('; ');
          newCookies = cookies ? `${cookies}; ${cookieValues}` : cookieValues;
        }
        
        // Handle redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          let redirectUrl = response.headers.location;
          
          // Handle relative redirects
          if (redirectUrl && !redirectUrl.startsWith('http')) {
            redirectUrl = `https://${urlObj.hostname}${redirectUrl}`;
          }
          
          if (redirectUrl) {
            download(redirectUrl, redirectCount + 1, newCookies);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        
        // Check content type - if HTML, it might be a confirmation page
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          // Google Drive virus scan warning page - need to extract confirm token
          let body = '';
          response.on('data', chunk => body += chunk);
          response.on('end', () => {
            // Look for confirm token in the page
            const confirmMatch = body.match(/confirm=([0-9A-Za-z_-]+)/);
            if (confirmMatch) {
              const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${confirmMatch[1]}&id=${fileId}`;
              download(confirmUrl, redirectCount + 1, newCookies);
            } else {
              reject(new Error('Got HTML response instead of image'));
            }
          });
          return;
        }
        
        const file = fs.createWriteStream(outputPath);
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve(outputPath);
        });
        
        file.on('error', (err) => {
          fs.unlink(outputPath, () => {}); // Delete partial file
          reject(err);
        });
      }).on('error', reject);
    };
    
    download(url);
  });
}

/**
 * Ask user yes/no question
 */
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'y' || normalized === 'yes' || normalized === 't' || normalized === 'tak');
    });
  });
}

async function main() {
  console.log('🖼️  Product Images Download Script');
  console.log('=' .repeat(60));
  console.log(`📁 Target directory: ${IMAGES_DIR}`);
  
  // Read Excel file
  const excelPath = path.join(__dirname, '../temp/products.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Excel file not found: ${excelPath}`);
    process.exit(1);
  }
  
  const workbook = XLSX.readFile(excelPath);
  console.log(`📊 Found ${workbook.SheetNames.length} sheets\n`);
  
  // Collect all products with images
  const products = [];
  const skippedSheets = ['export (40)', 'Podstawianie poza zakresem wys.'];
  
  for (const sheetName of workbook.SheetNames) {
    if (skippedSheets.some(s => sheetName.includes(s))) {
      continue;
    }
    
    const ws = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    // Skip header rows (0, 1), start from row 2
    for (let r = 2; r < data.length; r++) {
      const row = data[r];
      if (!row || !row[3]) continue; // Skip empty rows
      
      const id = row[3];           // Column D - id
      const imageUrl = row[4];     // Column E - image URL
      const distanceCode = row[5]; // Column F - distance_code
      
      if (imageUrl && distanceCode) {
        const filename = distanceCodeToFilename(distanceCode);
        const googleId = extractGoogleDriveId(imageUrl);
        
        if (filename && googleId) {
          products.push({
            id,
            distanceCode,
            filename,
            googleId,
            imageUrl,
            sheet: sheetName
          });
        }
      }
    }
  }
  
  console.log(`📦 Found ${products.length} products with images\n`);
  
  // Check which images already exist
  const existingFiles = new Set(fs.readdirSync(IMAGES_DIR));
  const toDownload = products.filter(p => !existingFiles.has(p.filename));
  const alreadyExist = products.filter(p => existingFiles.has(p.filename));
  
  console.log(`✅ Already exist: ${alreadyExist.length} images`);
  console.log(`📥 To download: ${toDownload.length} images\n`);
  
  if (toDownload.length === 0) {
    console.log('🎉 All images already downloaded!');
    return;
  }
  
  // Show preview of files to download
  console.log('📋 Files to download:');
  toDownload.slice(0, 10).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.filename} (${p.sheet})`);
  });
  if (toDownload.length > 10) {
    console.log(`   ... and ${toDownload.length - 10} more\n`);
  }
  
  const confirm = await askQuestion('\n❓ Start download? [y/n]: ');
  if (!confirm) {
    console.log('❌ Cancelled');
    process.exit(0);
  }
  
  // Download images
  console.log('\n📥 Downloading...\n');
  
  let downloaded = 0;
  let failed = 0;
  const errors = [];
  
  for (const product of toDownload) {
    const outputPath = path.join(IMAGES_DIR, product.filename);
    
    try {
      process.stdout.write(`   ⏳ ${product.filename}...`);
      await downloadFromGoogleDrive(product.googleId, outputPath);
      
      // Verify file was downloaded (at least 1KB)
      const stats = fs.statSync(outputPath);
      if (stats.size < 1024) {
        throw new Error('File too small (possibly error page)');
      }
      
      console.log(' ✅');
      downloaded++;
    } catch (error) {
      console.log(` ❌ ${error.message}`);
      failed++;
      errors.push({ product, error: error.message });
      
      // Clean up failed download
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`   ✅ Downloaded: ${downloaded}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📁 Total in folder: ${existingFiles.size + downloaded}`);
  
  if (errors.length > 0) {
    console.log('\n⚠️  Failed downloads:');
    errors.slice(0, 10).forEach(e => {
      console.log(`   - ${e.product.filename}: ${e.error}`);
    });
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { distanceCodeToFilename, extractGoogleDriveId };

