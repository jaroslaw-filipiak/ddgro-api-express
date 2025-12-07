# Propozycja Rozwiązania - Problem Duplikacji Wsporników

## Problem

Frontend oblicza WSZYSTKIE 4 systemy (spiral, standard, max, raptor) jednocześnie, przypisując **każdemu** pełne 576 wsporników.

Dla aplikacji `6930749e06860951d414b8a8`:
- main_system: **raptor**
- lowest: 151mm, highest: 207mm
- supports_count: **576**

Rezultat w bazie danych:
- m_standard["120-220"]: **576** wsporników
- m_max["150-350"]: **576** wsporników
- m_spiral (150-170 + 170-190 + 190-210): **576** wsporników
- m_raptor[""]: **576** wsporników (pusty zakres bo Raptor nie ma produktów)

**Łącznie: 2304 wsporników zamiast 576!**

## Analiza Backend vs Frontend

### Backend `/preview` - POPRAWNY ✓
```javascript
const products_spiral = await Products.aggregate(
  createPipeline('spiral', Object.values(zbiorcza_TP.m_spiral), Object.keys(zbiorcza_TP.m_spiral))
);
const products_standard = await Products.aggregate(
  createPipeline('standard', Object.values(zbiorcza_TP.m_standard), Object.keys(zbiorcza_TP.m_standard))
);
```
Każdy series używa swojej macierzy - **OK**.

### Backend `/send-order-summary` - POPRAWNY ✓
```javascript
const spiralItems = addCountAndPriceToItems(items, 'spiral', zbiorcza_TP.m_spiral);
const standardItems = addCountAndPriceToItems(items, 'standard', zbiorcza_TP.m_standard);
```
Każdy series używa swojej macierzy - **OK**.

### Frontend `Step7.js` - BŁĘDNY ✗
```javascript
const handleCalculate = () => {
  handleM_STANDARD();  // każdy dostaje WSZYSTKIE 576
  handleM_SPIRAL();
  handleM_MAX();
  handleM_RAPTOR();
};

const handleM_STANDARD = () => {
  const averageInSection = state.supports_count / conditionLength; // 576 / ilość_przedziałów
  // przypisuje do każdego przedziału
};
```

**Każda funkcja używa `state.supports_count` (576) dla SWOJEGO systemu!**

## Możliwe Rozwiązania

### Opcja 1: Tylko main_system dostaje wsporniki
```javascript
const handleCalculate = () => {
  switch(state.main_system) {
    case 'spiral':
      handleM_SPIRAL();
      break;
    case 'standard':
      handleM_STANDARD();
      break;
    case 'max':
      handleM_MAX();
      break;
    case 'raptor':
      handleM_RAPTOR();
      break;
  }
};
```

**Problem**: Jeśli main_system (np. raptor) nie ma produktów dla danego zakresu, PDF będzie pusty.

### Opcja 2: Priorytet z fallbackiem
```javascript
const handleCalculate = () => {
  // 1. Spróbuj main_system
  const mainSystemHasProducts = checkIfSystemCoversRange(state.main_system, state.lowest, state.highest);

  if (mainSystemHasProducts) {
    handleSystemByName(state.main_system);
  } else {
    // 2. Fallback w kolejności: spiral -> standard -> max -> raptor
    const fallbackOrder = ['spiral', 'standard', 'max', 'raptor'];
    for (const system of fallbackOrder) {
      if (checkIfSystemCoversRange(system, lowest, highest)) {
        handleSystemByName(system);
        break;
      }
    }
  }
};
```

**Zaleta**: Zawsze znajdzie system który ma produkty.
**Wada**: Ignoruje możliwość mixowania systemów.

### Opcja 3: Podział wsporników między systemy (proporcjonalnie)
```javascript
const handleCalculate = () => {
  // 1. Sprawdź które systemy pokrywają zakres lowest-highest
  const systemsInRange = [
    { name: 'spiral', count: countSpiralInRange() },
    { name: 'standard', count: countStandardInRange() },
    { name: 'max', count: countMaxInRange() },
    { name: 'raptor', count: countRaptorInRange() }
  ].filter(s => s.count > 0);

  // 2. Podziel 576 wsporników proporcjonalnie
  const totalPoints = systemsInRange.reduce((sum, s) => sum + s.count, 0);

  systemsInRange.forEach(system => {
    const proportion = system.count / totalPoints;
    const supportsForSystem = Math.round(state.supports_count * proportion);
    handleSystemWithSupports(system.name, supportsForSystem);
  });
};
```

**Zaleta**: Wspiera mix systemów, dzieli wsporniki sprawiedliwie.
**Wada**: Najbardziej skomplikowane.

### Opcja 4: Każdy system tylko dla SWOICH unikalnych zakresów
```javascript
const handleCalculate = () => {
  // 1. Podziel zakres lowest-highest na sekcje gdzie TYLKO JEDEN system ma produkty
  const sections = divideRangeBySystemAvailability(state.lowest, state.highest);

  // 2. Przypisz wsporniki proporcjonalnie do wielkości sekcji
  sections.forEach(section => {
    const supportsForSection = (section.heightRange / totalRange) * state.supports_count;
    handleSystemForSection(section.system, section.range, supportsForSection);
  });
};
```

## Zalecenie

Na podstawie commita "Accumulate items from all series" wygląda że **intencja była aby wspierać mix systemów**.

**Rekomendacja: Opcja 2 (Priorytet z fallbackiem)** jako najprostsze i najbezpieczniejsze rozwiązanie:

1. Spróbuj użyć **main_system**
2. Jeśli nie ma produktów, użyj **pierwszy dostępny** z kolejności
3. **Tylko jeden system** dostaje wszystkie 576 wsporników

To zachowuje kompatybilność wsteczną i zapobiega duplikacji.

## Implementacja (Opcja 2)

```javascript
// front/src/components/form/steps/Step7.js

const handleCalculate = () => {
  const systemsInOrder = [
    state.main_system,  // Najpierw wybrany system
    'spiral',
    'standard',
    'max',
    'raptor'
  ].filter((s, i, arr) => arr.indexOf(s) === i); // Deduplikacja

  // Sprawdź który system ma produkty dla zakresu
  for (const system of systemsInOrder) {
    const hasProducts = checkSystemHasProducts(system, state.lowest, state.highest);
    if (hasProducts) {
      switch(system) {
        case 'spiral':
          handleM_SPIRAL();
          break;
        case 'standard':
          handleM_STANDARD();
          break;
        case 'max':
          handleM_MAX();
          break;
        case 'raptor':
          handleM_RAPTOR();
          break;
      }
      break; // Tylko pierwszy który pasuje!
    }
  }
};

const checkSystemHasProducts = (system, lowest, highest) => {
  const matrices = {
    'spiral': M_SPIRAL(),
    'standard': M_STANDARD(),
    'max': M_MAX(),
    'raptor': M_RAPTOR()
  };

  const matrix = matrices[system];
  return matrix.some(item =>
    item.wys_mm > lowest &&
    item.wys_mm < highest &&
    item.range !== '' // Nie pusty zakres
  );
};
```
