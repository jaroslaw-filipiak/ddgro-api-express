# DDGRO Backend - Lista Zmian

## Wersja 2.1.5 — 2026-03-29

### Oferta PDF / podstawienia serii (STANDARD + SPIRAL przy niskiej wysokości)

**Problem:** Przy `main_system: standard` i zakresie wysokości obejmującym mm poniżej 30 (np. lowest 25 mm) macierz `m_spiral` ma niezerowy bucket **`17-30`**, ale klucz ten ma `to = 30` w `parseRangeKey`, więc warunek **`to < 30`** go wykluczał. W efekcie `spiralKeys` było puste, w PDF tylko STANDARD, a suma sztuk z linii nie zgadzała się z `supports_count`.

**Zmiany:**

| Obszar | Plik | Opis |
|--------|------|------|
| Klucze SPIRAL/MAX przy podstawieniach | `utils/substitution-rules.js` | Dla **standard**: `r.to <= 30` (włącza **`17-30`**). Dla **max**: `r.to <= 45` (spójna granica). |
| Kolejność produktów w ofercie | `routes/api/application.js` | `standardLower`: `height.to <= 30`; `maxLower`: `height.to <= 45` (dwa miejsca: główny flow + send-order). |
| Testy | `utils/__tests__/substitution-rules.test.js` | Zaktualizowane oczekiwania (m.in. **`17-30`** w `spiralKeys` przy STANDARD). |

**Wpływ:** Przy hybrydzie STANDARD pojawia się linia **SPIRAL** dla niskich zakresów; suma z macierzy znowu przechodzi przez pipeline produktów.

---

### Zgodność ilości w PDF z `supports_count` (podpory vs podkładki)

**Problem:** Ilości z macierzy są ułamkowe; **`Math.round` na każdej linii** dawało sumę większą niż `supports_count` (np. 35+130+156 = **321** przy **320**), co rozjeżdżało się z podkładkami ustawionymi na `supports_count`.

**Zmiany:**

| Obszar | Plik | Opis |
|--------|------|------|
| Rekonsyliacja całkowitych sztuk | `utils/reconcile-pedestal-counts.js` | Nowa funkcja: metoda **największych reszt** — suma linii podpór = `application.supports_count`. |
| Generowanie zamówienia / PDF | `routes/api/application.js` | `addCountAndPriceToItems` zostawia **surowe** wartości z macierzy; po złożeniu spiral+standard+max+raptor wywołanie **`reconcilePedestalLineCounts`** (przed `application.products` i akcesoriami). |
| Testy | `utils/__tests__/reconcile-pedestal-counts.test.js` | Scenariusz z realnym rozjazdem 321 → 320. |

**Wpływ:** W PDF suma sztuk **podpór regulowanych** zgadza się z **`supports_count`** i z ilością podkładek, gdy ta wynika z `supports_count`.

---

**Wersja aplikacji:** `VER` w `.env` / zmiennych środowiska oraz `version` w `server/package.json` — **2.1.5** (endpoint główny zwraca `version` z `process.env.VER`).

---

## Data: 2025-09-09

### ❗ KRYTYCZNE ZMIANY W OBLICZENIACH I GENEROWANIU PDF

---

## 1. 🗄️ MIGRACJA BAZY DANYCH

### Zmienione: Typy produktów w bazie danych
**Plik:** `migrations/change-tiles-to-slab-09-2025.js`

**Opis:** Stworzono i wykonano migrację zmieniającą wszystkie produkty z `type: "tiles"` na `type: "slab"` w kolekcji `products`.

**Szczegóły:**
- **Przed:** Produkty miały `type: "tiles"`
- **Po:** Wszystkie produkty mają `type: "slab"`
- **Powód:** Unifikacja z frontendem, który przesyła `application.type: "slab"`

**Wpływ:** 
- ✅ Pipeline MongoDB teraz właściwie znajduje produkty
- ✅ Naprawiono problem z pustymi tablicami produktów

---

## 2. 🔍 WYSZUKIWANIE PRODUKTÓW W BAZIE

### Zmienione: Pipeline MongoDB - wyszukiwanie case-insensitive
**Plik:** `routes/api/application.js`
**Linie:** 278, 57

**Przed:**
```javascript
series: series,  // exact match
```

**Po:**
```javascript
series: { $regex: new RegExp(`^${series}$`, 'i') }, // case-insensitive match
```

**Wpływ:**
- ✅ Teraz znajduje produkty z seriami `"Spiral"`, `"Standard"`, `"Max"` gdy szuka `"spiral"`, `"standard"`, `"max"`
- ✅ Naprawiono problem z pustymi wynikami przez niezgodność wielkości liter

### Zmienione: Klucze wysokości w pipeline
**Plik:** `routes/api/application.js`
**Linie:** 307-334

**Przed:** Używał `main_keys` dla wszystkich serii
**Po:** Używa specyficznych kluczy dla każdej serii:
- `Object.keys(zbiorcza_TP.m_spiral)` dla spiral
- `Object.keys(zbiorcza_TP.m_standard)` dla standard
- `Object.keys(zbiorcza_TP.m_max)` dla max
- `Object.keys(zbiorcza_TP.m_raptor)` dla raptor

**Wpływ:**
- ✅ Każda seria produktów teraz używa własnych zakresów wysokości
- ✅ Poprawiono dopasowanie produktów do obliczeń

---

## 3. 💰 OBLICZENIA CEN I ILOŚCI

### Zmienione: Funkcja `getPriceNet` - obsługa wielowalutowości
**Plik:** `routes/api/application.js`
**Linie:** 255-271

**Dodano zabezpieczenia:**
```javascript
const getPriceNet = (item) => {
  // Use language_currency_map to get correct currency
  if (item.price && item.language_currency_map) {
    const currency = item.language_currency_map[applicationLang] || 
                     item.language_currency_map['pl'] || 'PLN';
    return Number(item.price[currency]) || Number(item.price.PLN) || 0;
  }
  
  // Fallback to PLN price if available
  if (item.price && item.price.PLN) {
    return Number(item.price.PLN) || 0;
  }
  
  return 0;
};
```

**Wpływ:**
- ✅ Naprawiono błąd `Cannot read properties of undefined (reading 'pl')`
- ✅ Dodano fallback na PLN gdy brak language_currency_map
- ✅ Poprawiona obsługa różnych walut (EUR, USD, PLN)

### Zmienione: Zaokrąglanie ilości produktów
**Plik:** `routes/api/application.js`
**Linie:** 401, 408

**Przed:**
```javascript
const itemCount = Math.ceil(countObj[item.height_mm] || 0);
const count = Math.ceil(countObj[item.height_mm] || 0);
```

**Po:**
```javascript
const itemCount = Math.round(countObj[item.height_mm] || 0);
const count = Math.round(countObj[item.height_mm] || 0);
```

**Wpływ:**
- ❗ **KRYTYCZNE:** Zmiana sposobu zaokrąglania z "zawsze w górę" na "matematyczne"
- Przykład: `11.517745302713985` → **Przed:** `12` → **Po:** `12` (bez zmiany w tym przypadku)
- Przykład: `11.4` → **Przed:** `12` → **Po:** `11` (różnica!)

### Naprawiono: Referencja do `zbiorcza_TP.main_keys`
**Plik:** `routes/api/application.js`
**Linie:** 417-420

**Przed:** `zbiorcza_TP.heightKeys` (nie istniało)
**Po:** `zbiorcza_TP.main_keys`

**Wpływ:**
- ✅ Naprawiono błąd `Cannot read properties of undefined (reading '17-30')`
- ✅ Funkcja `addCountAndPriceToItems` teraz działa poprawnie

---

## 4. 📄 GENEROWANIE PDF

### Zmienione: Struktura tabeli PDF
**Plik:** `routes/api/application.js`
**Linie:** 717, 726-734

**Przed:** 6 kolumn z "short_name"
```
| Short Name | Name | Height | Quantity | Price | Total |
```

**Po:** 5 kolumn bez "short_name"
```
| Name | Height | Quantity | Price | Total |
```

**Szerokości kolumn:**
- **Przed:** `['15%', '25%', '15%', '15%', '15%', '15%']`
- **Po:** `['40%', '15%', '15%', '15%', '15%']`

### Zmienione: Wielojęzyczność nazw produktów w PDF
**Plik:** `routes/api/application.js`
**Linie:** 634-640

**Przed:**
```javascript
{ text: item.name?.pl || item.name || 'N/A', style: 'tableCell' }
```

**Po:**
```javascript
{ text: item.name?.[applicationLang] || item.name?.pl || item.name || 'N/A', style: 'tableCell' }
```

**Wpływ:**
- ✅ PDF teraz pokazuje nazwy produktów w języku użytkownika (pl, en, de, fr, es)
- ✅ Fallback na polski jeśli brak tłumaczenia

### Zmienione: Wyświetlanie ilości w PDF
**Plik:** `routes/api/application.js**
**Linie:** 643

**Przed:**
```javascript
text: item.count || 0,
```

**Po:**
```javascript
text: Math.round(item.count || 0),
```

**Wpływ:**
- ✅ W PDF pokazywane są zaokrąglone ilości (12 zamiast 11.517745302713985)

### Zmienione: Obliczanie ceny całkowitej w PDF
**Plik:** `routes/api/application.js`
**Linie:** 660-665

**Przed:** Używał `item.total_price`
**Po:** Oblicza na bieżąco:
```javascript
format(Math.round(item.count || 0) * getPriceNet(item))
```

**Wpływ:**
- ✅ Naprawiono problem z cenami 0,00 w PDF
- ✅ Cena całkowita = zaokrąglona_ilość × cena_jednostkowa

### Zmienione: Obliczanie sumy końcowej
**Plik:** `routes/api/application.js`
**Linie:** 452-458

**Przed:**
```javascript
const totalOrderPrice = items.reduce((sum, item) => {
  const itemTotal = parseFloat(item.total_price);
  return sum + itemTotal;
}, 0).toFixed(2);
```

**Po:**
```javascript
const totalOrderPrice = items.reduce((sum, item) => {
  const roundedCount = Math.round(item.count || 0);
  const itemTotal = roundedCount * getPriceNet(item);
  return sum + itemTotal;
}, 0).toFixed(2);
```

**Wpływ:**
- ✅ Suma końcowa używa zaokrąglonych ilości
- ✅ Konsystentność między pozycjami a sumą końcową

---

## 5. 🛠️ POPRAWKI TECHNICZNE

### Dodano: Obsługa błędów w tłumaczeniach
**Plik:** `routes/api/application.js`
**Linia:** 246

**Przed:**
```javascript
const t = translations[applicationLang];
```

**Po:**
```javascript
const t = translations[applicationLang] || translations.pl || {};
```

**Wpływ:**
- ✅ Fallback na polski gdy brak tłumaczeń dla języka
- ✅ Naprawiono potencjalne błędy `Cannot read properties of undefined`

### Usunięto: Debug logi
**Plik:** `routes/api/application.js`

**Usunięto wszystkie console.log związane z debugowaniem:**
- Logi kroków (STEP 1-9)
- Debug informacje o produktach
- Szczegółowe logi błędów

**Wpływ:**
- ✅ Czysty output w logach production
- ✅ Lepsza wydajność

---

## 6. 📊 WPŁYW NA OBLICZENIA

### ❗ WAŻNE: Zmiany w logice biznesowej

**Co się zmieniło w obliczeniach:**
1. **Zaokrąglanie:** `Math.ceil()` → `Math.round()`
2. **Klucze wysokości:** Każda seria używa własnych zakresów
3. **Wyszukiwanie produktów:** Case-insensitive match
4. **Ceny:** Poprawione obliczanie z fallbackami

**Co POZOSTAŁO bez zmian:**
- ✅ Logika `createZBIORCZA_TP()`
- ✅ Matryce `m_spiral`, `m_standard`, `m_max`, `m_raptor`
- ✅ Filtrowanie według `application.type`
- ✅ Filtry `excludeFrom*`
- ✅ Dodawanie `application.products` i `additional_accessories`

---

## 7. 🧪 TESTOWANIE

**Zalecane testy przed wdrożeniem:**
1. Test z różnymi ilościami (sprawdzić zaokrąglanie)
2. Test z różnymi językami (pl, en, de, fr, es)
3. Test z różnymi walutami
4. Porównanie sum PDF vs obliczenia backend
5. Test z dodatkowymi produktami i akcesoriami

---

## 8. 📝 PLIKI ZMODYFIKOWANE

1. **`migrations/change-tiles-to-slab-09-2025.js`** - NOWY PLIK
2. **`routes/api/application.js`** - GŁÓWNE ZMIANY
3. **`models/Application.js`** - komentarz o misleading nazwie `products`

---

## 9. 🚨 UWAGI DLA DEVELOPERA

1. **Migracja** została wykonana - wszystkie produkty mają teraz `type: "slab"`
2. **Backup** - zalecane zrobienie backup bazy przed wdrożeniem
3. **Testowanie** - szczególnie sprawdzić różnice w zaokrąglaniu
4. **Monitorowanie** - sprawdzić czy sumy się zgadzają z oczekiwaniami klientów

---

**Autor:** Claude Code Assistant  
**Data:** 2025-09-09  
**Wersja:** 1.0