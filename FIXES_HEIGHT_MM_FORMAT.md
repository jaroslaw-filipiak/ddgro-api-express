# Naprawa problemu z formatem height_mm po imporcie produktów

**Data:** 3 grudnia 2025
**Problem:** Puste PDF z ceną 0.00 PLN po imporcie nowych produktów
**Przyczyna:** Zmiana formatu `height_mm` z `"120-220"` na `"120 - 220 mm"`

---

## Spis treści

1. [Problem początkowy](#problem-początkowy)
2. [Analiza przyczyny](#analiza-przyczyny)
3. [Znalezione błędy](#znalezione-błędy)
4. [Wprowadzone poprawki](#wprowadzone-poprawki)
5. [Flow systemu - jak to działa](#flow-systemu---jak-to-działa)
6. [Testowanie](#testowanie)

---

## Problem początkowy

Po imporcie produktów z Excel do MongoDB (migracja `import-products-from-excel.js`), system generował **puste PDF z ceną 0.00 PLN** dla wszystkich zamówień, mimo że:
- Obliczenia liczby wsporników działały poprawnie (np. 576 wsporników)
- Produkty istniały w bazie danych (71 produktów)
- API endpoint `/preview` zwracał pustą tablicę `order: []`

### Przykładowe zamówienie
- **Type:** wood
- **Main system:** raptor
- **Zakres wysokości:** 150-208 mm
- **Obliczona liczba wsporników:** 576
- **Oczekiwany rezultat:** Lista produktów Standard i Max z cenami
- **Rzeczywisty rezultat:** Pusta lista, PDF z ceną 0.00 PLN

---

## Analiza przyczyny

### Format height_mm przed importem
```javascript
"120-220"  // bez spacji, bez jednostki
```

### Format height_mm po imporcie
```javascript
"120 - 220 mm"  // ze spacjami i jednostką
```

Ta zmiana formatu złamała **wszystkie porównania i lookup** w kodzie, które zakładały stary format.

---

## Znalezione błędy

### 1. Puste klucze w macierzach (create-zbiorcza-tp.js)

**Lokalizacja:** `server/utils/create-zbiorcza-tp.js:28`

**Problem:**
```javascript
delete m_spiral_sum[''];  // Tylko spiral był czyszczony

// Inne serie (standard, max, raptor) mogły mieć puste klucze
```

**Skutek:**
- Dla `main_system="raptor"` w zakresie 150-208mm (gdzie Raptor nie ma produktów), macierz `m_raptor` miała klucz `""` z wartością `576`
- `main_keys` zawierało pusty string, więc query szukało produktów z `height_mm=""`
- Brak wyników z bazy

**Fix:**
```javascript
delete m_spiral_sum[''];
delete m_standard_sum[''];
delete m_max_sum[''];
delete m_raptor_sum[''];
```

---

### 2. createPipeline używał main_keys dla wszystkich serii (application.js)

**Lokalizacja:** `server/routes/api/application.js:77` (endpoint `/preview`)

**Problem:**
```javascript
const createPipeline = (series, values) => {
  // Używało main_keys dla WSZYSTKICH serii
  const formattedKeys = main_keys.map(formatHeightMm);
  // ...
}

const products_spiral = await Products.aggregate(
  createPipeline('spiral', Object.values(zbiorcza_TP.m_spiral))
);
```

**Skutek:**
- Każda seria (spiral, standard, max, raptor) używała kluczy z `main_keys`
- Dla `main_system="raptor"` wszystkie serie szukały produktów Raptor (których nie było w zakresie)
- Standard i Max nie używały swoich własnych kluczy

**Fix:**
```javascript
const createPipeline = (series, values, heightKeys) => {
  // Każda seria używa swoich kluczy
  const formattedKeys = heightKeys.map(formatHeightMm);
  // ...
}

const products_spiral = await Products.aggregate(
  createPipeline('spiral', Object.values(zbiorcza_TP.m_spiral), Object.keys(zbiorcza_TP.m_spiral))
);
```

**Powtórzono fix:** Linia 414 (endpoint `/send-order-summary`)

---

### 3. filterProducts nie normalizował formatu (application.js)

**Lokalizacja:** `server/routes/api/application.js:170`

**Problem:**
```javascript
const excludeFromSpiral = ['120-220', '220-320', ...];  // Format: "120-220"

const filterProducts = (products, excludes) => {
  return products.filter(
    (product) => !excludes.includes(product.height_mm)  // "120 - 220 mm" !== "120-220"
  );
};
```

**Skutek:**
- Porównanie `"120 - 220 mm" === "120-220"` zawsze false
- Filtrowanie nie działało - produkty nie były wykluczane

**Fix:**
```javascript
const filterProducts = (products, excludes) => {
  // Normalizacja przez formatHeightMm
  const normalizedExcludes = excludes.map(formatHeightMm);

  return products.filter(
    (product) => !normalizedExcludes.includes(product.height_mm)
  );
};
```

---

### 4. filterOrder błędnie parsował height_mm (application.js)

**Lokalizacja:** `server/routes/api/application.js:219` i `556`

**Problem:**
```javascript
const filterOrder = (arr, lowest, highest) => {
  return arr.filter((product) => {
    const [min, max] = product.height_mm.split('-').map(Number);
    // "120 - 220 mm".split('-') → ["120 ", " 220 mm"]
    // Number(" 220 mm") → NaN
    return min <= highest && max >= lowest;
  });
};
```

**Skutek:**
- Split po `-` dawał `["120 ", " 220 mm"]`
- `Number(" 220 mm")` zwracał `NaN`
- Wszystkie produkty były odrzucane (NaN nie pasuje do żadnego zakresu)
- **Order zawsze pusty!**

**Fix:**
```javascript
const filterOrder = (arr, lowest, highest) => {
  return arr.filter((product) => {
    // Usunięcie " mm" i split ze spacjami
    const cleaned = product.height_mm.replace(/ mm$/, '').trim();
    const parts = cleaned.split(/\s*-\s*/);
    if (parts.length !== 2) return false;

    const min = parseInt(parts[0]);
    const max = parseInt(parts[1]);

    if (isNaN(min) || isNaN(max)) return false;

    return min <= highest && max >= lowest;
  });
};
```

**Powtórzono fix:** Linia 556 (endpoint `/send-order-summary`)

---

### 5. addCountAndPriceToItems nie normalizował kluczy (application.js)

**Lokalizacja:** `server/routes/api/application.js:630`

**Problem:**
```javascript
function addCountAndPriceToItems(items, series, countObj) {
  return items
    .filter((item) => {
      const itemCount = Math.round(countObj[item.height_mm] || 0);
      // countObj["120-220"] ma wartość 576
      // item.height_mm = "120 - 220 mm"
      // countObj["120 - 220 mm"] = undefined → 0
      return itemCount > 0 && item.series?.toLowerCase() === series.toLowerCase();
    })
    // ...
}
```

**Skutek:**
- `countObj` ma klucze w formacie `"120-220"` (z macierzy `m_standard`)
- Produkty mają `height_mm = "120 - 220 mm"`
- Lookup `countObj["120 - 220 mm"]` zwracał `undefined`
- Wszystkie produkty miały `count = 0` i były filtrowane
- **Items zawsze puste!**

**Fix:**
```javascript
function addCountAndPriceToItems(items, series, countObj) {
  // Normalizacja "120 - 220 mm" → "120-220"
  const normalizeHeight = (heightMm) => {
    if (!heightMm) return '';
    return heightMm.replace(/ mm$/, '').replace(/\s+/g, '');
  };

  return items
    .filter((item) => {
      const normalizedHeight = normalizeHeight(item.height_mm);
      const itemCount = Math.round(countObj[normalizedHeight] || 0);
      return itemCount > 0 && item.series?.toLowerCase() === series.toLowerCase();
    })
    .map((item) => {
      const normalizedHeight = normalizeHeight(item.height_mm);
      const count = Math.round(countObj[normalizedHeight] || 0);
      // ...
    });
}
```

---

## Wprowadzone poprawki

### Zmienione pliki

#### 1. `server/utils/create-zbiorcza-tp.js`
```diff
- delete m_spiral_sum[''];
+ // Remove empty keys from all matrices
+ delete m_spiral_sum[''];
+ delete m_standard_sum[''];
+ delete m_max_sum[''];
+ delete m_raptor_sum[''];
```

#### 2. `server/routes/api/application.js`

**Zmiany w endpoint `/preview` (linie 77-149):**
- createPipeline: dodano parametr `heightKeys`
- Wszystkie wywołania aggregate: dodano trzeci parametr z kluczami

**Zmiany w funkcji filterProducts (linia 170-182):**
- Dodano normalizację `excludes` przez `formatHeightMm`

**Zmiany w funkcji filterOrder (linia 212-231 i 554-568):**
- Poprawne parsowanie `"120 - 220 mm"`
- Obsługa edge cases (brak "-", NaN)

**Zmiany w endpoint `/send-order-summary` (linie 414-491):**
- createPipeline: dodano parametr `heightKeys`
- Wszystkie wywołania aggregate: dodano trzeci parametr z kluczami

**Zmiany w funkcji addCountAndPriceToItems (linia 630-658):**
- Dodano helper `normalizeHeight`
- Normalizacja przed lookup w `countObj`

**Dodano debug logi (linie 685-691 i 1205-1214):**
```javascript
console.log('📊 Items after combining all series:', items.length);
console.log('📧 Creating PDF...', { itemsCount, totalPrice });
```

---

## Flow systemu - jak to działa

### 1. Formularz frontendowy → MongoDB

```
Frontend (Next.js)
└─ Użytkownik wypełnia formularz (7 kroków)
   ├─ Type: slab / wood
   ├─ Dimensions: width, height
   ├─ Range: lowest, highest (mm)
   ├─ Support type: type1-4
   ├─ Main system: spiral / standard / max / raptor
   └─ Gap between slabs: 3mm / 5mm

Redux (formSlice.js)
└─ Obliczenia w czasie rzeczywistym
   ├─ Liczba płytek/desek
   ├─ Liczba wsporników
   └─ Macierze dla każdego systemu:
      ├─ m_spiral: { "10-17": 0, "17-30": 192, ... }
      ├─ m_standard: { "120-220": 576, ... }
      ├─ m_max: { "150-350": 576, ... }
      └─ m_raptor: { "": 576 }  ← Problem!

API POST /api/application
└─ Zapis do MongoDB
   └─ Collection: applications
```

### 2. MongoDB → Products (baza danych)

```
Products Collection (71 produktów)
├─ Series: spiral, standard, max, raptor, alu, clever level
├─ Type: "tiles 3", "tiles 5", "wood", "tiles 3, tiles 5, wood"
├─ height_mm: "120 - 220 mm"  ← Format ze spacjami!
├─ price: { PLN: 16.24, EUR: 3.75, USD: 4.12 }
└─ name: { pl: "Wspornik...", en: "Support...", ... }
```

### 3. API GET /preview/:id → Przygotowanie zamówienia

```javascript
// 1. Pobranie aplikacji z MongoDB
const application = await Application.findById(id);
// {
//   type: "wood",
//   main_system: "raptor",
//   gap_between_slabs: 3,
//   lowest: 150,
//   highest: 208,
//   m_standard: [{ range: "120-220", count_in_range: 576 }, ...],
//   m_max: [{ range: "150-350", count_in_range: 576 }, ...],
//   m_raptor: [{ range: "", count_in_range: 576 }, ...],  ← Pusty klucz!
// }

// 2. Stworzenie zbiórczych macierzy
const zbiorcza_TP = createZBIORCZA_TP(application);
// {
//   m_spiral: { "10-17": 0, "17-30": 0, "30-50": 0, ... },
//   m_standard: { "120-220": 576, "220-320": 0, ... },  ← 576 wsporników!
//   m_max: { "150-350": 576, ... },                     ← 576 wsporników!
//   m_raptor: { "15-35": 0, "35-65": 0, ... },          ← Puste klucze usunięte
//   main_keys: { "15-35": 0, ... }  // main_system=raptor
// }

// 3. Formatowanie kluczy dla query
const formatHeightMm = (key) => {
  // "120-220" → "120 - 220 mm"
  if (!key || key.includes(' mm')) return key;
  const parts = key.split('-');
  if (parts.length === 2) {
    return `${parts[0]} - ${parts[1]} mm`;
  }
  return key;
};

// 4. Query do MongoDB dla każdej serii
const createPipeline = (series, values, heightKeys) => {
  const formattedKeys = heightKeys.map(formatHeightMm);
  // ["10 - 17 mm", "17 - 30 mm", "120 - 220 mm", "220 - 320 mm", ...]

  const productType = getProductType(application.type, application.gap_between_slabs);
  // type="wood" → productType="wood"
  // type="slab" + gap=3 → productType="tiles 3"
  // type="slab" + gap=5 → productType="tiles 5"

  return [
    {
      $match: {
        height_mm: { $in: formattedKeys },    // "120 - 220 mm" in array
        type: { $regex: /wood/i },             // "wood" matches
        series: { $regex: /^standard$/i }      // "Standard" matches
      }
    },
    {
      $addFields: {
        count: {
          $arrayElemAt: [
            values,                             // [0, 0, ..., 576, ...]
            { $indexOfArray: [formattedKeys, '$height_mm'] }
          ]
        }
      }
    }
  ];
};

const products_standard = await Products.aggregate(
  createPipeline('standard', Object.values(zbiorcza_TP.m_standard), Object.keys(zbiorcza_TP.m_standard))
);
// Rezultat:
// [
//   { height_mm: "30 - 45 mm", count: 0, series: "Standard", price: {PLN: 11.52}, ... },
//   { height_mm: "120 - 220 mm", count: 576, series: "Standard", price: {PLN: 16.24}, ... },
//   ...
// ]

const products_max = await Products.aggregate(
  createPipeline('max', Object.values(zbiorcza_TP.m_max), Object.keys(zbiorcza_TP.m_max))
);
// [
//   { height_mm: "75 - 150 mm", count: 0, series: "Max", ... },
//   { height_mm: "150 - 350 mm", count: 576, series: "Max", price: {PLN: 34.01}, ... },
// ]

// 5. Filtrowanie niepotrzebnych zakresów
const excludeFromStandard = ['10-17', '17-30', '350-550', '550-750', '750-950'];
const normalizedExcludes = excludeFromStandard.map(formatHeightMm);
// ["10 - 17 mm", "17 - 30 mm", ...]

const filteredStandard = products_standard.filter(
  (product) => !normalizedExcludes.includes(product.height_mm)
);
// Usuwa produkty spoza dostępnych zakresów Standard

// 6. Łączenie wszystkich serii
let orderArr = [...filteredSpiral, ...filteredStandard, ...filteredMax, ...filteredRaptor];

// 7. Filtrowanie po zakresie wysokości zamówienia
const filterOrder = (arr, lowest, highest) => {
  return arr.filter((product) => {
    const cleaned = product.height_mm.replace(/ mm$/, '').trim();
    const parts = cleaned.split(/\s*-\s*/);
    const [min, max] = parts.map(x => parseInt(x));
    // "120 - 220 mm" → [120, 220]

    return min <= highest && max >= lowest;
    // 120 <= 208 && 220 >= 150 → TRUE (overlap)
    // 30 <= 208 && 45 >= 150 → FALSE (no overlap)
  });
};

let order = filterOrder(orderArr, 150, 208);
// Rezultat:
// [
//   { height_mm: "120 - 220 mm", count: 576, series: "Standard", ... },
//   { height_mm: "150 - 350 mm", count: 576, series: "Max", ... },
// ]

// 8. Selekcja wariantu produktu (gap 3mm vs 5mm)
order = selectProductByGap(order, application.gap_between_slabs);

// 9. Dodanie dodatkowych akcesoriów
const additionalAccessories = application.additional_accessories || [];
// Pobieranie pełnych danych z Products.find()

// 10. Response
res.json({
  order: order,
  application: application,
  zbiorcza_TP: zbiorcza_TP
});
```

### 4. API POST /send-order-summary/:id → Generowanie PDF i Email

```javascript
// Kroki 1-9 identyczne jak w /preview

// 10. addCountAndPriceToItems - Filtrowanie i dodanie cen
function addCountAndPriceToItems(items, series, countObj) {
  const normalizeHeight = (heightMm) => {
    // "120 - 220 mm" → "120-220"
    return heightMm.replace(/ mm$/, '').replace(/\s+/g, '');
  };

  return items
    .filter((item) => {
      const normalizedHeight = normalizeHeight(item.height_mm);
      // "120 - 220 mm" → "120-220"

      const itemCount = Math.round(countObj[normalizedHeight] || 0);
      // countObj = { "120-220": 576, ... }
      // countObj["120-220"] = 576 ✓

      return itemCount > 0 && item.series?.toLowerCase() === series.toLowerCase();
    })
    .map((item) => {
      const normalizedHeight = normalizeHeight(item.height_mm);
      const count = Math.round(countObj[normalizedHeight] || 0);
      const priceNet = getPriceNet(item);

      return {
        ...item,
        count: count,
        total_price: (count * priceNet).toFixed(2)
      };
    });
}

const standardItems = addCountAndPriceToItems(items, 'standard', zbiorcza_TP.m_standard);
// [
//   {
//     height_mm: "120 - 220 mm",
//     count: 576,
//     series: "Standard",
//     price: { PLN: 16.24 },
//     total_price: "9354.24"
//   }
// ]

const maxItems = addCountAndPriceToItems(items, 'max', zbiorcza_TP.m_max);
// [
//   {
//     height_mm: "150 - 350 mm",
//     count: 576,
//     series: "Max",
//     price: { PLN: 34.01 },
//     total_price: "19589.76"
//   }
// ]

items = [...spiralItems, ...standardItems, ...maxItems, ...raptorItems];

// 11. Obliczenie sumy
const totalOrderPrice = items.reduce((sum, item) => {
  const roundedCount = Math.round(item.count || 0);
  const itemTotal = roundedCount * getPriceNet(item);
  return sum + itemTotal;
}, 0).toFixed(2);
// 9354.24 + 19589.76 = 28944.00 PLN

// 12. Formatowanie dla locale
const locale = getLocale(applicationLang); // "pl-PL"
const total = new Intl.NumberFormat(locale, {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(totalOrderPrice);
// "28 944,00"

// 13. Generowanie PDF
const createPDF = async (items, total) => {
  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    content: [
      { text: t.pdf.supportsList, style: 'mainHeader' },
      {
        table: {
          headerRows: 1,
          body: [
            [t.pdf.name, t.pdf.height, t.pdf.quantity, t.pdf.catalogPrice, t.pdf.totalNet],
            ...items.map((item) => [
              item.name?.[applicationLang] || item.name?.pl,
              item.height_mm || '--',
              Math.round(item.count || 0),
              new Intl.NumberFormat(locale).format(getPriceNet(item)),
              new Intl.NumberFormat(locale).format(Math.round(item.count) * getPriceNet(item))
            ])
          ]
        }
      },
      {
        columns: [
          { width: '*', text: '' },
          {
            table: {
              body: [[
                { text: t.pdf.totalNetSum, style: 'totalLabel' },
                { text: total + ' ' + currency, style: 'totalAmount' }
              ]]
            }
          }
        ]
      }
    ]
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const filePath = path.join(__dirname, 'zestawienie.pdf');
  pdfDoc.pipe(fs.createWriteStream(filePath));
  pdfDoc.end();

  return filePath;
};

const pdfFilePath = await createPDF(items, total);

// 14. Wysyłka email
await sendEmail({
  from: 'DDGRO.EU <contact@ddgro.eu>',
  to: to,
  subject: t.email.subject,
  template: `order_${applicationLang}`,
  context: { items, total },
  attachments: [{
    filename: 'podsumowanie_wspornikow.pdf',
    path: pdfFilePath
  }]
});

// 15. Response
res.status(200).json({
  message: t.email.offerSent,
  environment: process.env.NODE_ENV
});
```

---

## Testowanie

### Test 1: Endpoint /preview

```bash
curl -s http://localhost:3001/api/application/preview/6930749e06860951d414b8a8
```

**Oczekiwany rezultat:**
```json
{
  "order": [
    {
      "height_mm": "120 - 220 mm",
      "series": "Standard",
      "count": 576,
      "price": { "PLN": 16.24 }
    },
    {
      "height_mm": "75 - 150 mm",
      "series": "Max",
      "count": 0,
      "price": { "PLN": 22.32 }
    },
    {
      "height_mm": "150 - 350 mm",
      "series": "Max",
      "count": 576,
      "price": { "PLN": 34.01 }
    }
  ]
}
```

**Faktyczny rezultat:** ✅ Zgodny

### Test 2: Obliczenie cen

```javascript
Standard 120-220mm: 576 × 16.24 PLN = 9,354.24 PLN
Max 150-350mm:      576 × 34.01 PLN = 19,589.76 PLN
───────────────────────────────────────────────────
SUMA:                               28,944.00 PLN ✓
```

### Test 3: Endpoint /send-order-summary

```bash
curl -X POST http://localhost:3001/api/application/send-order-summary/6930749e06860951d414b8a8 \
  -H "Content-Type: application/json" \
  -d '{"to":"info@j-filipiak.pl"}'
```

**Oczekiwany rezultat:**
```json
{
  "message": "Oferta została wysłana!",
  "environment": "development"
}
```

**Faktyczny rezultat:** ✅ Zgodny

**Wygenerowany PDF:**
- Zawiera 2 produkty (Standard + Max)
- Liczby: 576 + 576
- Suma: 28,944.00 PLN
- ✅ PDF zawiera dane

---

## Deployment

### Development (branch: dev)

```bash
git add .
git commit -m "fix: normalize height_mm format after products import

- Remove empty keys from all matrices (spiral, standard, max, raptor)
- Fix createPipeline to use series-specific keys instead of main_keys
- Normalize height_mm in filterProducts before comparison
- Fix filterOrder to properly parse '120 - 220 mm' format
- Normalize height_mm in addCountAndPriceToItems for countObj lookup

Closes #issue-number"

git push origin dev
```

**Auto-deploy:** https://ddgro-api-express-development.onrender.com

### Production (branch: master)

```bash
git checkout master
git merge dev
git push origin master
```

**Auto-deploy:** https://ddgro-api-express.onrender.com

---

## Wnioski

### Przyczyna główna
**Niekonsystentny format `height_mm`** w różnych częściach systemu:
- Frontend/macierze: `"120-220"`
- Baza danych: `"120 - 220 mm"`
- Porównania zakładały stary format

### Rozwiązanie
**Normalizacja formatu** w każdym miejscu porównania:
1. Helper `formatHeightMm`: `"120-220"` → `"120 - 220 mm"`
2. Helper `normalizeHeight`: `"120 - 220 mm"` → `"120-220"`
3. Regex split: `/\s*-\s*/` zamiast `split('-')`

### Zapobieganie problemom w przyszłości

#### ⚠️ WAŻNE: Import z Excel
Dodano normalizację formatu podczas importu w `import-products-from-excel.js`:

```javascript
const normalizeHeightMm = (value) => {
  // Normalizuje WSZYSTKIE formaty do "XX - YY mm"
  // "120-220" → "120 - 220 mm"
  // "120 - 220" → "120 - 220 mm"
  // "120-220mm" → "120 - 220 mm"
  // "60" → "60 mm"
  // "2 mm" → "2 mm"
};
```

**Skutek:** Niezależnie od formatu w pliku Excel, `height_mm` **ZAWSZE** zostanie zapisany jako `"XX - YY mm"`.

#### 📋 Standardowy format height_mm
Od teraz obowiązuje **JEDEN standardowy format**:

```
Zakres:  "120 - 220 mm"  (cyfry - spacja - myślnik - spacja - cyfry - spacja - mm)
Pojedynczy: "60 mm"      (cyfra - spacja - mm)
```

#### 🔄 Ponowny import
Przy ponownym imporcie produktów z Excel:
1. ✅ Format zostanie automatycznie znormalizowany
2. ✅ Wszystkie naprawione endpointy będą działać poprawnie
3. ✅ PDF i ceny będą generowane prawidłowo

**Nie trzeba żadnych dodatkowych działań!**

### Best Practices
1. **Zawsze używać helpers do transformacji** zamiast bezpośrednich operacji string
2. **Testy jednostkowe** dla funkcji porównujących formaty
3. **Walidacja danych** przy imporcie - jednolity format (✅ dodano)
4. **Dokumentacja formatu** w schemacie MongoDB
5. **Normalizacja at source** - przekształcaj dane przy wejściu do systemu, nie w wielu miejscach

---

## Kontakt

W razie pytań lub problemów:
- **Email:** jarek@j-filipiak.pl
- **GitHub Issues:** https://github.com/your-repo/issues
