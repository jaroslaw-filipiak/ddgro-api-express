### DDGRO API Express

Backend API dla kalkulatora tarasów - system generowania ofert z automatycznym doborem produktów, generowaniem PDF i wysyłką email.

## Opis Projektu

**Stack:** Express.js + MongoDB + SendGrid + PDFMake

**Główny Flow:**
1. Formularz → Zapis zgłoszenia (Application) w MongoDB
2. Preview → Przetworzenie macierzy wsporników (m_spiral, m_standard, m_max, m_raptor) przez `create-zbiorcza-tp.js`
3. Dobór produktów → Agregacja MongoDB z filtrowaniem po wysokości, typie i serii
4. Logika substytucji → Uzupełnienie braków wysokości między systemami
5. Selekcja wariantów → Dobór K3/D3 (3mm) lub K5/D5 (5mm) według `gap_between_slabs`
6. Generacja PDF → PDFMake (A4 landscape, 3 strony: oferta, QR kod katalogu, marketing)
7. Email SendGrid → Równolegle do klienta (multilingual) i właściciela (rozszerzony template)

## System Dobierania Wsporników

### 1. Przetwarzanie Macierzy (`create-zbiorcza-tp.js`)
- **Input:** `application.m_spiral/m_standard/m_max/m_raptor` - tablice obiektów `{range: "10-17", count_in_range: 15}`
- **Proces:** Grupowanie po zakresach wysokości i sumowanie `count_in_range`
- **Output:** Obiekt `{main_keys, m_spiral, m_standard, m_max, m_raptor}` gdzie każdy system to `{"10-17": 15, "17-30": 22, ...}`
- **Fallback:** Jeśli `main_system` pusty → wybór pierwszego systemu z produktami (kolejność: standard → max → spiral → raptor)

### 2. Agregacja Produktów MongoDB
**Pipeline:**
- `$match`: `height_mm` IN formatowane main_keys ("10-17" → "10 - 17 mm"), `type` regex (tiles 3/tiles 5 based on gap_between_slabs), `series` regex
- `$addFields`: dodanie `count` z macierzy i `sortKey` dla zachowania kolejności wysokości
- `$sort`: sortowanie po `sortKey`

**Mapowanie typu:**
- `application.type = "slab"` + `gap_between_slabs = 3` → `type: "tiles 3"`
- `application.type = "slab"` + `gap_between_slabs = 5` → `type: "tiles 5"`
- `application.type = "wood"` → `type: "wood"`

### 3. Wykluczenia Wysokości
Po agregacji usuwane są niestandardowe zakresy dla każdego systemu:

- **Spiral:** `120-220, 220-320, 320-420, 350-550, 550-750, 750-950`
- **Standard:** `10-17, 17-30, 350-550, 550-750, 750-950`
- **Max:** `10-17, 17-30, 30-50`
- **Raptor:** `10-17`

### 4. Logika Substytucji (według `main_system`)

**RAPTOR:**
```
orderArr = [filteredRaptor]  // Bez substytucji
```

**STANDARD:**
```
Lower:  Spiral where height.to < 30mm      (pokrycie 10-30mm)
Main:   Standard                            (pokrycie 30-420mm)
Upper:  Max where height.from > 420mm       (pokrycie >420mm)
```

**SPIRAL:**
```
Main:   Spiral                              (pokrycie 10-210mm)
Upper:  Max where height.from > 210mm       (pokrycie >210mm)
```

**MAX:**
```
Lower:  Spiral where height.to < 45mm      (pokrycie <45mm)
Main:   Max                                 (pokrycie 45-950mm)
```

**FALLBACK (brak main_system):**
- `type="slab"` → `[Spiral, Standard, Max]`
- `type="wood"` → `[Spiral, Standard, Max, Raptor]`

### 5. Filtrowanie po Zakresie Wysokości
```javascript
filterOrder(orderArr, application.lowest, application.highest)
// Zachowuje produkty gdzie height range overlaps z lowest-highest
// Np. lowest=50, highest=300 → zachowa "30 - 50 mm" (50≤50), "120 - 220 mm" (120≤300), odrzuci "320 - 420 mm" (320>300)
```

### 6. Selekcja Wariantów K3/K5
**Proces:**
1. Grupowanie produktów po `series + height_mm`
2. Dla grup z wieloma produktami:
   - `gap_between_slabs = 3` → szukaj K3 lub D3 w `key` lub `distance_code` (np. "STA-030-045-K3-(100)")
   - `gap_between_slabs = 5` → szukaj K5 lub D5
3. Fallback: jeśli brak wariantu → użyj pierwszego produktu z grupy

**Przykład:**
```
Grupa: standard + "30 - 50 mm"
├─ Product A: key="030-050 K3 100pcs" → wybrany dla gap=3
└─ Product B: key="030-050 K5 100pcs" → wybrany dla gap=5
```

### 7. Dodanie Additional Accessories
- Pobrane z `application.additional_accessories[]` (tablica `{id, count}`)
- Fetch pełnych danych produktu z MongoDB po `id`
- Dodane do końcowej listy `order[]` z przypisanym `count`

**Kluczowe Mechanizmy:**
- **Multilingual:** 5 języków (pl/en/de/fr/es) w modelach Products i translations
- **Autentykacja:** Passport.js (JWT + Local), bcrypt, role-based access
- **Custom IDs:** Numeryczne `id` zamiast MongoDB `_id` dla lookupów
- **Email Templates:** Handlebars z obsługą base64 attachments

**API Endpoints:**
- `POST /api/application` - Utworzenie zgłoszenia
- `GET /api/application/preview/:id` - Podgląd zamówienia z doborem produktów
- `POST /api/application/send-order-summary/:id` - Generacja PDF + wysyłka email
- `GET /api/products`, `GET /api/products/series/:series` - Pobieranie produktów
- `POST /api/auth/login`, `POST /api/auth/register` - Autentykacja JWT

**Response Format:** `{ success: boolean, data: any, message?: string }`

---

### DEVELOPMENT -> DEPLOY === git push `dev`

backend: https://ddgro-api-express-development.onrender.com
baza danych: ddgro-development.7j22j.mongodb.net
front: na vercelu na preview branch

### PRODUKCJA -> DEPLOY === git push `master`

backend: https://ddgro-api-express.onrender.com
baza danych: szacus-mo.0vhmjmz.mongodb.net
front: https://kalkulator.ddgro.eu/
