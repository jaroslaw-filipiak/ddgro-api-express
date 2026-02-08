# Testy automatyczne (Jest)

## Uruchomienie

```bash
cd server
npm install   # pierwszy raz – instaluje Jest i supertest
npm test      # wszystkie testy (E2E uruchomią się tylko przy ustawionym MONGODB_URI)
npm run test:watch   # tryb watch (przy zmianach)
```

Tylko testy E2E (wymagają bazy):

```bash
npm test -- application-preview.e2e.test.js
```

## Co jest testowane

### 1. Zasady podstawiania (`utils/__tests__/substitution-rules.test.js`) – ok. 35 testów

- **parseRangeKey** – parsowanie klucza zakresu (np. `"350-550"` → `{ from: 350, to: 550 }`)
- **keysWithCount** – wybór kluczy z macierzy z count > 0
- **getKeysPerSeries** – zestaw kluczy per seria według `main_system` (RAPTOR, STANDARD, SPIRAL, MAX)
- **Scenariusze podstawiania (ok. 20 przypadków)** – m.in.:
  - STANDARD: tylko w zakresie 30–420 (brak podstawień), granica 420, wiele MAX >420, SPIRAL to&lt;30, oba podstawienia, puste m_standard
  - SPIRAL: tylko 10–210 (brak MAX), granica 210, wiele MAX >210
  - MAX: tylko 45–950 (brak SPIRAL), granica 45, tylko SPIRAL to&lt;45
  - RAPTOR: tylko raptorKeys mimo pełnych innych macierzy, kilka zakresów
  - default, puste macierze, klucze z count=0

### 2. Zbiorcza TP (`utils/__tests__/create-zbiorcza-tp.test.js`)

- Grupowanie po `range` i sumowanie `count_in_range`
- Ustawianie `main_keys` według `main_system`
- Usuwanie pustego klucza
- Fallback na inny system, gdy główny nie ma produktów

### 3. Endpoint preview z mockami (`routes/api/__tests__/application-preview-substitution.test.js`)

- **404** gdy aplikacja nie istnieje
- **STANDARD + zakres 150–500 mm** – zamówienie zawiera produkty STANDARD i MAX (wyższe)
- **RAPTOR** – zamówienie zawiera tylko RAPTOR (brak podstawień)

Używają mocków `Application.findById` i `Products.aggregate` – **działają bez bazy**.

### 4. E2E – realne scenariusze (`routes/api/__tests__/application-preview.e2e.test.js`) – 12 scenariuszy

Symulacja pełnego procesu użytkownika: **tworzenie aplikacji w bazie** → **GET preview** → asercje na prawdziwej odpowiedzi.

- **STANDARD 150–500 mm** – STANDARD + MAX (podstawienie wyższych)
- **STANDARD 200–400 mm** – tylko STANDARD (brak podstawień)
- **STANDARD 15–25 mm** – tylko SPIRAL (podstawienie niższych)
- **STANDARD 400–600 mm** – STANDARD + MAX
- **SPIRAL 100–250 mm** – SPIRAL + MAX (>210)
- **SPIRAL 50–200 mm** – tylko SPIRAL (brak podstawienia)
- **MAX 30–100 mm** – SPIRAL + MAX (podstawienie <45)
- **MAX 100–400 mm** – tylko MAX (brak podstawienia)
- **RAPTOR 150–208 mm** – tylko RAPTOR
- **RAPTOR 80–120 mm** – tylko RAPTOR
- **Pełny flow** – POST tworzy aplikację, GET preview zwraca zamówienie

**Wymagania:** w `.env` ustawione `MONGODB_URI` (baza deweloperska) oraz zaimportowane produkty w kolekcji `Products`.  
Gdy `MONGODB_URI` brak, ten blok jest **pomijany** (`describe.skip`), reszta testów działa normalnie.

Domyślnie **połączenie z MongoDB jest dozwolone**. Aby wymusić brak połączenia (np. w CI): `TEST_MOCK_DB=1 npm test`.

## Dodawanie nowych scenariuszy

1. **Logika podstawiania** – dopisać przypadki w `utils/__tests__/substitution-rules.test.js` (np. nowy `main_system` lub granice zakresów).
2. **Preview** – w `routes/api/__tests__/application-preview-substitution.test.js` dodać `it(...)` z mockiem `Application.findById` i `Products.aggregate`, potem asercje na `res.body.order` (serie, zakresy, ilości).
