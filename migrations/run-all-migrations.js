const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * Migration Runner Script
 * 
 * Uruchamia wszystkie migracje w odpowiedniej kolejności jako osobne procesy
 * 
 * Użycie:
 *   node migrations/run-all-migrations.js [env]
 * 
 * Parametry:
 *   env - 'dev' lub 'prod' (domyślnie: dev)
 * 
 * Przykłady:
 *   node migrations/run-all-migrations.js dev
 *   node migrations/run-all-migrations.js prod
 * 
 * WAŻNE: Przed uruchomieniem na produkcji:
 *   1. Zrób backup bazy danych
 *   2. Sprawdź, że MONGODB_URI wskazuje na właściwe środowisko
 *   3. Przetestuj najpierw na dev
 */

const MIGRATIONS = [
  {
    name: 'migrate-products-02-2025',
    file: 'migrate-products-02-2025.js',
    description: 'Migracja struktury produktów (multilanguage, multi-currency)',
  },
  {
    name: 'migrate-accessories-02-2025',
    file: 'migrate-accessories-02-2025.js',
    description: 'Migracja struktury akcesoriów (multilanguage, multi-currency)',
  },
  {
    name: 'fix-height-format-09-2025',
    file: 'fix-height-format-09-2025.js',
    description: 'Naprawa formatu height_mm w produktach',
  },
  {
    name: 'change-tiles-to-slab-09-2025',
    file: 'change-tiles-to-slab-09-2025.js',
    description: 'Zmiana typu z tiles na slab',
  },
];

const args = process.argv.slice(2);
const environment = args[0] || 'dev';

// Mapowanie środowisk do baz danych
const DB_INFO = {
  dev: {
    name: 'Development',
    uri: 'ddgro-development.7j22j.mongodb.net',
  },
  prod: {
    name: 'Production',
    uri: 'szacus-mo.0vhmjmz.mongodb.net',
  },
};

function runMigration(migrationFile) {
  return new Promise((resolve, reject) => {
    const migrationPath = path.join(__dirname, migrationFile);
    const child = spawn('node', [migrationPath], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Migration exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log('====================================');
  console.log('🚀 Database Migration Runner');
  console.log('====================================');
  console.log(`Środowisko: ${DB_INFO[environment]?.name || environment}`);
  
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    console.error('❌ BŁĄD: MONGODB_URI nie jest ustawiony w .env');
    console.log('💡 Sprawdź plik .env i upewnij się, że zawiera MONGODB_URI');
    process.exit(1);
  }

  // Sprawdź czy URI wskazuje na właściwe środowisko
  const dbInfo = DB_INFO[environment];
  if (dbInfo && !MONGODB_URI.includes(dbInfo.uri)) {
    console.warn(`⚠️  UWAGA: MONGODB_URI nie zawiera '${dbInfo.uri}'`);
    console.warn(`   Upewnij się, że łączysz się z właściwą bazą danych!`);
    console.warn(`   Aktualny URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    
    if (environment === 'prod') {
      console.error('\n❌ PRZERWANO: Wykryto próbę uruchomienia na produkcji z niewłaściwym URI');
      console.error('   Ze względów bezpieczeństwa migracja została przerwana');
      console.error('\n💡 Jak ustawić właściwe URI dla produkcji:');
      console.error('   1. Ustaw MONGODB_URI w .env na URI produkcyjnej bazy');
      console.error('   2. Albo użyj: MONGODB_URI="..." node migrations/run-all-migrations.js prod');
      process.exit(1);
    }
  }

  console.log(`Baza danych: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
  console.log(`Liczba migracji: ${MIGRATIONS.length}`);
  console.log('====================================\n');

  // Pokaż listę migracji
  console.log('Lista migracji do wykonania:');
  MIGRATIONS.forEach((migration, index) => {
    console.log(`  ${index + 1}. ${migration.name}`);
    console.log(`     ${migration.description}`);
  });
  console.log('');

  const results = [];
  
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const migration = MIGRATIONS[i];
    console.log(`\n📦 [${i + 1}/${MIGRATIONS.length}] Uruchamianie: ${migration.name}`);
    console.log(`   ${migration.description}`);
    console.log('   ' + '-'.repeat(50));

    try {
      const startTime = Date.now();
      
      await runMigration(migration.file);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ ${migration.name} - ukończono w ${duration}s`);

      results.push({
        name: migration.name,
        status: 'success',
        duration: `${duration}s`,
      });

    } catch (error) {
      console.error(`\n❌ Błąd w migracji ${migration.name}:`, error.message);
      results.push({
        name: migration.name,
        status: 'error',
        error: error.message,
      });

      // W produkcji zatrzymaj się przy błędzie
      if (environment === 'prod') {
        console.error('\n❌ PRZERWANO: Błąd podczas migracji na produkcji');
        console.error('   Napraw błąd przed kontynuowaniem');
        process.exit(1);
      }

      // W dev kontynuuj z ostrzeżeniem
      console.warn(`⚠️  Pomijam tę migrację i kontynuuję...`);
    }
  }

  // Podsumowanie
  console.log('\n====================================');
  console.log('📊 Podsumowanie migracji');
  console.log('====================================');
  results.forEach((result) => {
    if (result.status === 'success') {
      console.log(`✅ ${result.name} - ${result.duration}`);
    } else if (result.status === 'error') {
      console.log(`❌ ${result.name} - ${result.error}`);
    }
  });

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  console.log(`\nUkończono: ${successCount}/${MIGRATIONS.length}`);
  if (errorCount > 0) {
    console.log(`Błędy: ${errorCount}`);
  }

  console.log('\n✅ Wszystkie migracje przetworzone');
  
  if (errorCount > 0) {
    process.exit(1);
  }
}

// Uruchom jeśli wywołano bezpośrednio
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main, MIGRATIONS };

