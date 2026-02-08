const mongoose = require('mongoose');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables from parent directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import the Products model
const Products = require('../models/Products');

/**
 * Excel Products Import Script - November 2025
 * This script:
 * 1. Reads Excel file with multiple sheets
 * 2. Skips first 2 rows in each sheet (row 1: column names, row 2: Polish helper text)
 * 3. Shows preview of each sheet with column info and first product
 * 4. Asks for confirmation before importing each sheet
 * 5. Imports products from selected sheets only
 * 6. Maps columns: product_group, series, id, distance_code, type,
 *    name_pl, name_en, name_de, name_fr, name_es,
 *    height_mm, height_from, height_to, price_pln, price_eur, price_usd
 */

// Helper function to ask user yes/no questions
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(
        normalized === 'y' ||
          normalized === 'yes' ||
          normalized === 't' ||
          normalized === 'tak',
      );
    });
  });
}

// Global log buffer to save to file
let logBuffer = [];
let logFileBuffer = []; // Separate buffer for clean file log

// Override console.log to capture to buffer
const originalLog = console.log;
const originalError = console.error;

function captureLog(...args) {
  const message = args.join(' ');
  logBuffer.push(message);
  originalLog(...args);
}

function captureError(...args) {
  const message = args.join(' ');
  logBuffer.push('ERROR: ' + message);
  originalError(...args);
}

// Add to clean log (for file only)
function addToFileLog(message) {
  logFileBuffer.push(message);
}

async function importProductsFromExcel() {
  try {
    // Reset log buffers
    logBuffer = [];
    logFileBuffer = [];

    // Start capturing logs
    console.log = captureLog;
    console.error = captureError;

    console.log('🚀 Starting Excel products import...');
    console.log(`📅 Data: ${new Date().toLocaleString('pl-PL')}`);

    // Initialize clean file log
    addToFileLog('========================================');
    addToFileLog('EXCEL PRODUCTS IMPORT LOG');
    addToFileLog('========================================');
    addToFileLog(`Date: ${new Date().toLocaleString('pl-PL')}`);
    addToFileLog('');

    // Step 1: Read Excel file
    const products = await readExcelFile();

    // Step 2: Clear existing products (optional)
    await clearExistingProducts();

    // Step 3: Save products to database
    await saveProductsBatch(products);

    console.log('✅ Excel import completed successfully!');

    // Save log to file
    await saveLogToFile();
  } catch (error) {
    console.error('❌ Import failed:', error);
    await saveLogToFile();
    throw error;
  } finally {
    // Restore original console
    console.log = originalLog;
    console.error = originalError;
  }
}

async function saveLogToFile() {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const logPath = path.join(
      __dirname,
      '../temp',
      `import-log-${timestamp}.txt`,
    );

    const logContent = logFileBuffer.join('\n');
    fs.writeFileSync(logPath, logContent, 'utf8');

    originalLog(`\n📝 Log zapisany: ${logPath}`);
  } catch (error) {
    originalError('⚠️  Nie udało się zapisać logu:', error.message);
  }
}

async function clearExistingProducts() {
  console.log('\n🗑️  Usuwanie istniejących produktów...');

  const count = await Products.countDocuments();

  if (count > 0) {
    await Products.deleteMany({});
    console.log(`✅ Usunięto ${count} produktów\n`);
  } else {
    console.log(`✅ Baza pusta (0 produktów)\n`);
  }
}

async function readExcelFile() {
  console.log('\n📥 Czytanie pliku Excel...');

  const excelPath = path.join(__dirname, '../temp/products.xlsx');

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel file not found at: ${excelPath}`);
  }

  // Read the Excel file
  const workbook = XLSX.readFile(excelPath);
  console.log(`📊 Znaleziono ${workbook.SheetNames.length} zakładek w pliku`);
  console.log(`⚠️  Pierwsze 2 wiersze = nagłówki (pomijane)\n`);

  const allProducts = [];
  const seenProductIds = new Set(); // Track product IDs to prevent duplicates
  const duplicatesList = []; // Track details of duplicates for logging
  let importedSheets = 0;
  let skippedSheets = 0;
  let duplicatesSkipped = 0;
  /** Suma wierszy spełniających warunki (product_group, series, id) w zakładkach, które użytkownik zaimportował */
  let totalEligibleRowsInImportedSheets = 0;

  // Track all skipped products with reasons
  const skippedProducts = [];

  // Process each sheet
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheetName = workbook.SheetNames[i];
    const worksheet = workbook.Sheets[sheetName];

    // Check if sheet is visible (skip hidden sheets)
    if (worksheet['!hidden']) {
      console.log(`⏭️  Skipping hidden sheet: "${sheetName}"`);
      skippedSheets++;
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(
      `📄 Zakładka ${i + 1}/${workbook.SheetNames.length}: "${sheetName}"`,
    );
    console.log(`${'='.repeat(60)}`);

    // Convert sheet to JSON - use row 1 as headers, skip row 2 (helper text)
    // First get all data as array of arrays to inspect structure
    const rawArrayData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
      header: 1, // Return as array of arrays
    });

    // Get column names from row 1 (index 0)
    const columnHeaders = rawArrayData[0] || [];

    // Get data rows starting from row 3 (index 2) - skip row 1 (headers) and row 2 (Polish descriptions)
    const dataRows = rawArrayData.slice(2);

    // Convert array format to object format using row 1 as keys
    const jsonData = dataRows.map((row) => {
      const obj = {};
      columnHeaders.forEach((header, index) => {
        if (header) {
          // Only map non-empty headers
          obj[header] = row[index] || '';
        }
      });
      return obj;
    });

    // Build product_group map by series for this sheet (for auto-fill)
    const productGroupBySeries = {};
    jsonData.forEach((row) => {
      const pg = (row.product_group || row['product group'] || row['grupa produktu'])?.toString().trim();
      const ser = (row.series || row['seria'])?.toString().trim();
      if (pg && ser && !productGroupBySeries[ser]) {
        productGroupBySeries[ser] = pg;
      }
    });

    // For backward compatibility - jsonDataRaw should include row 2
    const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
    });

    // Count valid products (have required fields)
    let validProductCount = 0;
    jsonData.forEach((row) => {
      const hasRequired = row.product_group && row.series && row.id;
      if (hasRequired) validProductCount++;
    });

    if (validProductCount === 0) {
      console.log(
        `⚠️  Ta zakładka nie zawiera produktów (puste lub niepoprawne dane)`,
      );
      console.log(`❌ POMIŃ TĘ ZAKŁADKĘ\n`);
      skippedSheets++;
      continue; // Skip empty sheets automatically
    }

    // Show column headers (first row keys)
    const columns = Object.keys(jsonData[0] || {});

    // Analyze what series are in this sheet
    const seriesInSheet = new Set();
    const productGroupsInSheet = new Set();
    jsonData.forEach((row) => {
      if (row.series) seriesInSheet.add(row.series);
      if (row.product_group) productGroupsInSheet.add(row.product_group);
    });

    console.log(`📊 Serie: ${Array.from(seriesInSheet).join(', ')}`);

    // Show first 3 VALID products as preview
    console.log(`\n📌 Pierwsze 3 produkty:`);
    let shown = 0;
    for (let i = 0; i < jsonData.length && shown < 3; i++) {
      const row = jsonData[i];
      const hasRequired = row.product_group && row.series && row.id;
      if (!hasRequired) continue;

      shown++;
      const namePl = row.name_pl || 'Brak nazwy';
      const displayName =
        namePl.length > 60 ? namePl.substring(0, 57) + '...' : namePl;
      console.log(
        `   ${shown}. [${row.series}] ${displayName} (ID: ${row.id})`,
      );
    }

    // Ask user if they want to import this sheet
    console.log('\n' + '─'.repeat(60));
    console.log(`❓ Czy zaimportować zakładkę "${sheetName}"?`);
    console.log(`   📊 Zawiera: ${validProductCount} produktów`);
    console.log(`   📋 Serie: ${Array.from(seriesInSheet).join(', ')}`);
    const shouldImport = await askQuestion(`   Importować? [y/n]: `);

    if (!shouldImport) {
      console.log(`⏭️  Pominięto zakładkę "${sheetName}"\n`);
      addToFileLog(`SKIPPED: Sheet "${sheetName}" - user choice`);
      addToFileLog('');
      skippedSheets++;
      continue;
    }

    const rowsWithId = jsonData.filter(
      (row) => (row.id || row['ID'] || '').toString().trim()
    ).length;
    totalEligibleRowsInImportedSheets += rowsWithId;

    console.log(`⏳ Importowanie...`);
    addToFileLog(`IMPORTING SHEET: "${sheetName}"`);
    addToFileLog(`  Products count: ${validProductCount}`);
    addToFileLog(`  Series: ${Array.from(seriesInSheet).join(', ')}`);

    // Transform each row to product format
    let sheetProductCount = 0;
    let sheetDuplicates = 0;
    for (let idx = 0; idx < jsonData.length; idx++) {
      const row = jsonData[idx];
      const product = transformExcelRowToProduct(row, sheetName, productGroupBySeries, skippedProducts);
      if (product) {
        // Check if we've already seen this product ID
        const productIdStr = product.id.toString();
        if (seenProductIds.has(productIdStr)) {
          sheetDuplicates++;
          duplicatesSkipped++;
          duplicatesList.push({
            id: productIdStr,
            series: product.series,
            sheet: sheetName,
            name: product.name.pl.substring(0, 60),
          });
          continue; // Skip duplicate
        }

        // Add to set and list
        seenProductIds.add(productIdStr);
        allProducts.push(product);
        sheetProductCount++;

        // Log to file
        addToFileLog(
          `  + [${productIdStr}] ${
            product.series
          } - ${product.name.pl.substring(0, 70)}`,
        );
      }
    }

    if (sheetDuplicates > 0) {
      console.log(
        `✅ Dodano ${sheetProductCount} produktów z "${sheetName}" (pominięto ${sheetDuplicates} duplikatów)`,
      );
      addToFileLog(
        `  Result: ${sheetProductCount} products added, ${sheetDuplicates} duplicates skipped`,
      );
    } else {
      console.log(`✅ Dodano ${sheetProductCount} produktów z "${sheetName}"`);
      addToFileLog(`  Result: ${sheetProductCount} products added`);
    }
    addToFileLog('');
    importedSheets++;
  }

  const notImported = totalEligibleRowsInImportedSheets - allProducts.length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 PODSUMOWANIE:`);
  console.log(`   📋 Wierszy spełniających warunki (w zaimportowanych zakładkach): ${totalEligibleRowsInImportedSheets}`);
  console.log(`   📦 Zaimportowano produktów: ${allProducts.length}`);
  if (notImported > 0) {
    console.log(`   ❌ Nie zaimportowano: ${notImported} (duplikaty: ${duplicatesSkipped}, błędy walidacji: ${skippedProducts.length})`);
  }
  console.log(`   ✅ Zaimportowano zakładek: ${importedSheets}`);
  console.log(`   ⏭️  Pominięto zakładek: ${skippedSheets}`);
  if (duplicatesSkipped > 0 && notImported === 0) {
    console.log(`   🔄 Pominięto duplikatów: ${duplicatesSkipped}`);
  }
  if (skippedProducts.length > 0 && notImported === 0) {
    console.log(`   ⚠️  Pominięto produktów z błędami: ${skippedProducts.length}`);
  }

  // Verify no duplicates in final array
  const finalIds = allProducts.map((p) => p.id.toString());
  const uniqueIds = new Set(finalIds);
  if (finalIds.length !== uniqueIds.size) {
    console.log(
      `   ⚠️  UWAGA: Wykryto ${
        finalIds.length - uniqueIds.size
      } duplikatów w końcowej tablicy!`,
    );
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Log skipped products details
  if (skippedProducts.length > 0) {
    console.log(`\n⚠️  PRODUKTY POMINIĘTE Z POWODU BŁĘDÓW (${skippedProducts.length}):`);
    console.log(`${'─'.repeat(80)}`);

    // Group by reason
    const byReason = {};
    skippedProducts.forEach(skip => {
      if (!byReason[skip.reason]) {
        byReason[skip.reason] = [];
      }
      byReason[skip.reason].push(skip);
    });

    Object.entries(byReason).forEach(([reason, products]) => {
      console.log(`\n❌ ${reason} (${products.length} produktów):`);
      products.slice(0, 10).forEach(skip => {
        console.log(`   • Arkusz: "${skip.sheet}" | ID: ${skip.id || 'BRAK'} | Series: ${skip.series || 'BRAK'}`);
        if (skip.height_mm) console.log(`     height_mm: ${skip.height_mm}`);
      });
      if (products.length > 10) {
        console.log(`   ... i ${products.length - 10} więcej`);
      }
    });
    console.log(`${'─'.repeat(80)}\n`);
  }

  // Add summary to file log
  addToFileLog('========================================');
  addToFileLog('SUMMARY');
  addToFileLog('========================================');
  addToFileLog(`Eligible rows in imported sheets: ${totalEligibleRowsInImportedSheets}`);
  addToFileLog(`Total products to save: ${allProducts.length}`);
  addToFileLog(`Not imported: ${notImported} (duplicates: ${duplicatesSkipped}, validation errors: ${skippedProducts.length})`);
  addToFileLog(`Sheets imported: ${importedSheets}`);
  addToFileLog(`Sheets skipped: ${skippedSheets}`);
  addToFileLog('');
  addToFileLog('Pominięte pozycje – szczegóły poniżej (DUPLICATES i VALIDATION ERRORS).');
  addToFileLog('');

  // Log detailed list of duplicates if any (do pliku i konsoli)
  if (duplicatesList.length > 0) {
    console.log(
      `\n🔄 SZCZEGÓŁOWA LISTA POMINIĘTYCH DUPLIKATÓW (${duplicatesList.length}):`,
    );
    console.log(`${'─'.repeat(80)}`);

    addToFileLog('========================================');
    addToFileLog(`POMINIĘTE – DUPLIKATY (${duplicatesList.length} pozycji)`);
    addToFileLog('========================================');

    duplicatesList.forEach((dup, idx) => {
      const truncName =
        dup.name.length > 50 ? dup.name.substring(0, 47) + '...' : dup.name;
      console.log(`${idx + 1}. [${dup.id}] ${dup.series}`);
      console.log(`   📄 Zakładka: "${dup.sheet}"`);
      console.log(`   📝 ${truncName}`);

      addToFileLog(`${idx + 1}. ID: ${dup.id}`);
      addToFileLog(`   Series: ${dup.series}`);
      addToFileLog(`   Sheet: "${dup.sheet}"`);
      addToFileLog(`   Name: ${dup.name}`);
      addToFileLog('');
    });
    console.log(`${'─'.repeat(80)}\n`);
  }

  // Lista pominiętych z powodu błędów walidacji – do pliku logu
  if (skippedProducts.length > 0) {
    addToFileLog('========================================');
    addToFileLog(`POMINIĘTE – BŁĘDY WALIDACJI (${skippedProducts.length} pozycji)`);
    addToFileLog('========================================');
    const byReason = {};
    skippedProducts.forEach((skip) => {
      if (!byReason[skip.reason]) byReason[skip.reason] = [];
      byReason[skip.reason].push(skip);
    });
    Object.entries(byReason).forEach(([reason, items]) => {
      addToFileLog(`Powód: ${reason} (${items.length})`);
      items.forEach((skip, idx) => {
        addToFileLog(`  ${idx + 1}. Sheet: "${skip.sheet}" | ID: ${skip.id || '–'} | Series: ${skip.series || '–'}`);
        if (skip.height_mm) addToFileLog(`     height_mm: ${skip.height_mm}`);
      });
      addToFileLog('');
    });
  }

  return allProducts;
}

/**
 * Convert distance_code to local image path (zgodne z download-images-from-gdrive.js)
 * Obsługiwane formaty: z (QTY), bez (QTY), RAP-XL-*, akcesoria
 */
function distanceCodeToImagePath(distanceCode) {
  if (!distanceCode) return null;

  const code = distanceCode.toString().trim();

  // PREFIX-HEIGHT_FROM-HEIGHT_TO-TYPE-(QTY)
  const withQty = code.match(/^[A-Z]+-(\d+)-(\d+)-([A-Z0-9]+)-\((\d+)\)$/i);
  if (withQty) {
    const [, heightFrom, heightTo, type, qty] = withQty;
    return `products/${heightFrom}-${heightTo}-${type.toLowerCase()}-${qty}pcs.jpg`;
  }

  // PREFIX-HEIGHT_FROM-HEIGHT_TO-TYPE (bez (QTY)) – STA-220-320-K3, SPI-090-110-D3, MAX-350-550-DAD
  const noQty = code.match(/^[A-Z]+-(\d+)-(\d+)-([A-Z0-9]+)$/i);
  if (noQty) {
    const [, heightFrom, heightTo, type] = noQty;
    return `products/${heightFrom}-${heightTo}-${type.toLowerCase()}.jpg`;
  }

  // RAP-XL-NUM-NUM
  const rapXl = code.match(/^RAP-XL-(\d+)-(\d+)$/i);
  if (rapXl) {
    const [, a, b] = rapXl;
    return `products/rap-xl-${a}-${b}.jpg`;
  }

  // Akcesoria: PREFIX-NAME-(QTY)
  const altMatch = code.match(/^[A-Z]+-([A-Z0-9-]+)-\((\d+)\)$/i);
  if (altMatch) {
    const [, name, qty] = altMatch;
    return `products/${name.toLowerCase()}-${qty}pcs.jpg`;
  }

  return null;
}

function transformExcelRowToProduct(row, sheetName, productGroupBySeries = {}, skippedProducts = []) {
  // Column mapping based on your Excel structure:
  // product_group, series, id, distance_code, type,
  // name_pl, name_en, name_de, name_fr, name_es,
  // height_mm, height_from, height_to, price_pln, price_eur, price_usd

  // Handle both possible field names (with or without spaces)
  let product_group = (
    row.product_group ||
    row['product group'] ||
    row['grupa produktu']
  )
    ?.toString()
    .trim();
  const series = (row.series || row['seria'])?.toString().trim();
  const id = (row.id || row['ID'])?.toString().trim();
  const height_mm = (row.height_mm || '')?.toString().trim();

  // Skip rows with missing series or id
  if (!series || !id) {
    return null;
  }

  // Auto-fill product_group from series map if missing
  if (!product_group && series && productGroupBySeries[series]) {
    product_group = productGroupBySeries[series];
    console.log(`   🔧 Auto-uzupełniono product_group dla ${id} (${series}): "${product_group}"`);
  }

  // Skip rows with missing essential data after auto-fill
  if (!product_group) {
    skippedProducts.push({
      sheet: sheetName,
      id: id,
      series: series,
      height_mm: height_mm,
      reason: 'Brak product_group (nie można auto-uzupełnić)'
    });
    return null;
  }

  // Get Polish name (required by model validation)
  const name_pl = (row.name_pl || row['nazwa_pl'] || '')?.toString().trim();

  // Skip rows without Polish name (required for validation)
  if (!name_pl || name_pl.length === 0) {
    skippedProducts.push({
      sheet: sheetName,
      id: id,
      series: series,
      height_mm: height_mm,
      reason: 'Brak polskiej nazwy (name_pl)'
    });
    return null;
  }

  try {
    // Generate unique key from product_group, series, and id
    const key = `${product_group}-${series}-${id}`.toUpperCase();

    // Parse height values
    const height_mm_raw = row.height_mm?.toString().trim();

    // Normalize height_mm format to "XX - YY mm" regardless of Excel format
    const normalizeHeightMm = (value) => {
      if (!value) return '';

      // If already has " mm" suffix and spaces, return as is
      if (value.match(/^\d+\s*-\s*\d+\s*mm$/i)) {
        // Ensure consistent spacing: "XX - YY mm"
        const cleaned = value.replace(/\s*mm$/i, '').trim();
        const parts = cleaned.split(/\s*-\s*/);
        if (parts.length === 2) {
          return `${parts[0]} - ${parts[1]} mm`;
        }
      }

      // If format is "XX-YY" without spaces/unit, add them
      const match = value.match(/^(\d+)\s*-\s*(\d+)/);
      if (match) {
        return `${match[1]} - ${match[2]} mm`;
      }

      // If single number (e.g., "60 mm", "2 mm"), return as is
      if (value.match(/^\d+\s*mm$/i)) {
        return value.replace(/\s*mm$/i, '').trim() + ' mm';
      }

      // If just a number, add " mm"
      if (value.match(/^\d+$/)) {
        return value + ' mm';
      }

      // Return original if unrecognized format
      return value;
    };

    const height_mm = normalizeHeightMm(height_mm_raw);
    const height_from = row.height_from ? parseInt(row.height_from) : null;
    const height_to = row.height_to ? parseInt(row.height_to) : null;

    // Parse prices
    const parsePriceSafe = (value) => {
      if (!value) return 0;
      const cleaned = value.toString().replace(',', '.').trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };

    return {
      key: key,
      id: parseFloat(id) || id,
      product_group: product_group,
      series: series,
      type: row.type?.toString().trim() || '',
      distance_code: row.distance_code?.toString().trim() || '',

      // Multilingual names
      name: {
        pl: name_pl, // Already validated above
        en: (row.name_en || row['nazwa_en'] || '')?.toString().trim(),
        de: (row.name_de || row['nazwa_de'] || '')?.toString().trim(),
        fr: (row.name_fr || row['nazwa_fr'] || '')?.toString().trim(),
        es: (row.name_es || row['nazwa_es'] || '')?.toString().trim(),
      },

      // Height information
      height_mm: height_mm || '',
      height_from: height_from,
      height_to: height_to,

      // Pricing
      price_unit: 'unit',
      price: {
        PLN: parsePriceSafe(row.price_pln),
        EUR: parsePriceSafe(row.price_eur),
        USD: parsePriceSafe(row.price_usd),
      },

      // Image path - generated from distance_code to match local files
      image_url:
        distanceCodeToImagePath(row.distance_code) || 'placeholder-96-68.png',
      height_inch: row.height_inch?.toString().trim() || '',
      packaging: parseInt(row.packaging) || 0,
      packaging_dimensions: { cm: '', inch: '' },
      packaging_weight: { kg: 0, lbs: 0 },
      euro_palet_products: 0,
      euro_palet_packages: 0,
      pallet_dimensions: { cm: '', inch: '' },
      pallet_weight: { kg: 0, lbs: 0 },
      catalog_number: null,

      // System objects
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

      // Track which sheet this came from
      source_sheet: sheetName,
    };
  } catch (error) {
    console.error(`Error transforming row from sheet "${sheetName}":`, error);
    console.error('Row data:', row);
    return null;
  }
}

async function saveProductsBatch(products) {
  console.log('\n💾 Saving products to database...');

  let created = 0;
  let errors = 0;
  const batchSize = 50;

  // Process in batches for better performance
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);

    try {
      const result = await Products.insertMany(batch, {
        ordered: false, // Continue on errors
        lean: true,
      });
      created += result.length;
      if (result.length > 0) {
        console.log(
          `   ✅ Batch ${Math.floor(i / batchSize) + 1}: ${
            result.length
          } produktów`,
        );
      }
    } catch (error) {
      // Handle bulk insert errors
      if (error.writeErrors) {
        created += batch.length - error.writeErrors.length;
        errors += error.writeErrors.length;

        console.log(
          `   ⚠️  Batch ${Math.floor(i / batchSize) + 1}: ${
            batch.length - error.writeErrors.length
          } OK, ${error.writeErrors.length} błędów`,
        );

        // Log first 3 errors for debugging
        if (error.writeErrors.length > 0) {
          console.error(`\n   Przykładowe błędy:`);
          error.writeErrors.slice(0, 3).forEach((err, idx) => {
            // Get the product that failed
            const failedProduct = batch[err.index];
            const productId = failedProduct?.id || 'unknown';

            // Extract error message from various possible locations
            let msg = '';
            if (err.err && err.err.message) {
              msg = err.err.message;
            } else if (err.errmsg) {
              msg = err.errmsg;
            } else if (err.message) {
              msg = err.message;
            } else {
              msg = JSON.stringify(err);
            }

            // Shorten duplicate key errors
            if (msg.includes('E11000') || msg.includes('duplicate key')) {
              console.error(
                `   ${
                  idx + 1
                }. [ID: ${productId}] Duplikat - produkt już istnieje w bazie`,
              );
            } else if (msg.includes('validation failed')) {
              // Extract specific validation error
              const validationMatch = msg.match(
                /Path `([^`]+)` is required|`([^`]+)` is required/,
              );
              if (validationMatch) {
                const field = validationMatch[1] || validationMatch[2];
                console.error(
                  `   ${
                    idx + 1
                  }. [ID: ${productId}] Brak wymaganego pola: ${field}`,
                );
              } else {
                console.error(
                  `   ${
                    idx + 1
                  }. [ID: ${productId}] Błąd walidacji: ${msg.substring(
                    0,
                    100,
                  )}...`,
                );
              }
            } else {
              console.error(
                `   ${idx + 1}. [ID: ${productId}] ${msg.substring(0, 120)}`,
              );
            }
          });
          if (error.writeErrors.length > 3) {
            console.error(`   ... i ${error.writeErrors.length - 3} więcej\n`);
          }
        }
      } else {
        console.error(
          `❌ Batch ${Math.floor(i / batchSize) + 1} failed:`,
          error.message,
        );
        errors += batch.length;
      }
    }
  }

  console.log(`\n📊 WYNIK IMPORTU:`);
  console.log(`   ✅ Zapisano: ${created} produktów`);
  if (errors > 0) {
    console.log(
      `   ❌ Błędów: ${errors} produktów (duplikaty lub błędy walidacji)`,
    );
  }

  // Add to file log
  addToFileLog('========================================');
  addToFileLog('DATABASE SAVE RESULT');
  addToFileLog('========================================');
  addToFileLog(`Successfully saved: ${created} products`);
  if (errors > 0) {
    addToFileLog(
      `Errors: ${errors} products (duplicates or validation errors)`,
    );
  }
  addToFileLog('');
  addToFileLog('Import completed at: ' + new Date().toLocaleString('pl-PL'));
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
  console.log(
    '🔗 Database:',
    process.env.MONGODB_URI.replace(/\/\/.*@/, '//***@'),
  ); // Hide credentials

  // Connect to MongoDB using environment variable
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('📡 Connected to MongoDB');
      return importProductsFromExcel();
    })
    .then(() => {
      console.log('\n🎉 Excel import completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Import failed:', error);
      process.exit(1);
    });
}

module.exports = { importProductsFromExcel };
