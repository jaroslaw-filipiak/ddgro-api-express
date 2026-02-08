/**
 * Testy zasad podstawiania (PRODUCT_SUBSTITUTION_README.md)
 * STANDARD → niższe: SPIRAL, wyższe: MAX
 * SPIRAL → wyższe: MAX
 * MAX → niższe: SPIRAL
 * RAPTOR → brak podstawień
 */

const {
  parseRangeKey,
  keysWithCount,
  getKeysPerSeries,
} = require('../substitution-rules');

describe('parseRangeKey', () => {
  it('parsuje "350-550" na { from: 350, to: 550 }', () => {
    expect(parseRangeKey('350-550')).toEqual({ from: 350, to: 550 });
  });
  it('parsuje "30-45" na { from: 30, to: 45 }', () => {
    expect(parseRangeKey('30-45')).toEqual({ from: 30, to: 45 });
  });
  it('zwraca null dla pustego stringa', () => {
    expect(parseRangeKey('')).toBeNull();
    expect(parseRangeKey(null)).toBeNull();
    expect(parseRangeKey(undefined)).toBeNull();
  });
  it('zwraca null dla nieprawidłowego formatu', () => {
    expect(parseRangeKey('abc')).toBeNull();
    expect(parseRangeKey('30')).toBeNull();
  });
});

describe('keysWithCount', () => {
  it('zwraca tylko klucze z count > 0', () => {
    const matrix = { '30-45': 10, '45-70': 0, '70-120': 5 };
    expect(keysWithCount(matrix)).toEqual(['30-45', '70-120']);
  });
  it('zwraca pustą tablicę dla null/undefined', () => {
    expect(keysWithCount(null)).toEqual([]);
    expect(keysWithCount(undefined)).toEqual([]);
  });
  it('pomija pusty string jako klucz', () => {
    const matrix = { '': 1, '30-45': 2 };
    expect(keysWithCount(matrix)).toContain('30-45');
    expect(keysWithCount(matrix).includes('')).toBe(false);
  });
});

describe('getKeysPerSeries – RAPTOR (brak podstawień)', () => {
  it('zwraca tylko raptorKeys, reszta pusta', () => {
    const application = { main_system: 'raptor' };
    const zbiorcza_TP = {
      m_spiral: { '17-30': 5 },
      m_standard: { '120-220': 10 },
      m_max: {},
      m_raptor: { '125-155': 20, '155-185': 30 },
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
    expect(result.standardKeys).toEqual([]);
    expect(result.maxKeys).toEqual([]);
    expect(result.raptorKeys).toEqual(['125-155', '155-185']);
  });
});

describe('getKeysPerSeries – STANDARD (niższe→SPIRAL, wyższe→MAX)', () => {
  it('dla zakresu 150–500 mm zwraca SPIRAL (to<30), STANDARD 30–420, MAX >420', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: { '10-17': 5, '17-30': 3 },
      m_standard: { '120-220': 10, '220-320': 15, '320-420': 20 },
      m_max: { '150-350': 0, '350-550': 25 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['10-17']);
    expect(result.standardKeys).toEqual(['120-220', '220-320', '320-420']);
    expect(result.maxKeys).toEqual(['350-550']);
    expect(result.raptorKeys).toEqual([]);
  });

  it('nie dodaje zakresów MAX które nie przekraczają 420', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: {},
      m_standard: { '320-420': 10 },
      m_max: { '150-350': 5 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.maxKeys).toEqual([]);
  });
});

describe('getKeysPerSeries – SPIRAL (wyższe→MAX)', () => {
  it('dla zakresu 100–250 mm zwraca SPIRAL + MAX >210', () => {
    const application = { main_system: 'spiral' };
    const zbiorcza_TP = {
      m_spiral: { '150-170': 10, '190-210': 15 },
      m_standard: {},
      m_max: { '150-350': 20 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['150-170', '190-210']);
    expect(result.standardKeys).toEqual([]);
    expect(result.maxKeys).toEqual(['150-350']);
    expect(result.raptorKeys).toEqual([]);
  });

  it('nie dodaje MAX gdy żaden zakres nie przekracza 210', () => {
    const application = { main_system: 'spiral' };
    const zbiorcza_TP = {
      m_spiral: { '90-110': 10 },
      m_standard: {},
      m_max: { '45-75': 5 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.maxKeys).toEqual([]);
  });
});

describe('getKeysPerSeries – MAX (niższe→SPIRAL)', () => {
  it('dla zakresu 30–100 mm zwraca SPIRAL (to<45) + MAX', () => {
    const application = { main_system: 'max' };
    const zbiorcza_TP = {
      m_spiral: { '17-30': 5, '30-50': 10 },
      m_standard: {},
      m_max: { '45-75': 15, '75-150': 20 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['17-30']);
    expect(result.standardKeys).toEqual([]);
    expect(result.maxKeys).toEqual(['45-75', '75-150']);
    expect(result.raptorKeys).toEqual([]);
  });

  it('nie dodaje SPIRAL gdy żaden zakres nie jest <45', () => {
    const application = { main_system: 'max' };
    const zbiorcza_TP = {
      m_spiral: { '90-110': 10 },
      m_standard: {},
      m_max: { '75-150': 20 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
  });
});

describe('getKeysPerSeries – default (wszystkie systemy)', () => {
  it('zwraca wszystkie klucze gdy main_system nieznany', () => {
    const application = { main_system: 'unknown' };
    const zbiorcza_TP = {
      m_spiral: { '17-30': 1 },
      m_standard: { '120-220': 2 },
      m_max: { '350-550': 3 },
      m_raptor: { '125-155': 4 },
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['17-30']);
    expect(result.standardKeys).toEqual(['120-220']);
    expect(result.maxKeys).toEqual(['350-550']);
    expect(result.raptorKeys).toEqual(['125-155']);
  });
});

describe('getKeysPerSeries – scenariusze podstawiania (ok. 20 przypadków)', () => {
  it('1. STANDARD: tylko w zakresie 30–420 mm – brak podstawień', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: {},
      m_standard: { '120-220': 50, '220-320': 50 },
      m_max: {},
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
    expect(result.standardKeys).toEqual(['120-220', '220-320']);
    expect(result.maxKeys).toEqual([]);
  });

  it('2. STANDARD: granica 420 – zakres MAX "320-420" (to=420) NIE wchodzi do maxKeys', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: {},
      m_standard: { '320-420': 100 },
      m_max: { '320-420': 10 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.maxKeys).toEqual([]);
  });

  it('3. STANDARD: wiele zakresów MAX >420 (350-550, 550-750, 750-950)', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: {},
      m_standard: { '320-420': 50 },
      m_max: { '350-550': 20, '550-750': 15, '750-950': 10 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.maxKeys).toEqual(['350-550', '550-750', '750-950']);
  });

  it('4. STANDARD: SPIRAL "17-30" (to=30) NIE wchodzi do spiralKeys (wymóg to<30)', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: { '17-30': 5 },
      m_standard: { '30-45': 20 },
      m_max: {},
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
  });

  it('5. STANDARD: oba podstawienia – SPIRAL (to<30) + MAX (to>420)', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: { '10-17': 8 },
      m_standard: { '120-220': 100, '320-420': 80 },
      m_max: { '350-550': 40 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['10-17']);
    expect(result.standardKeys).toEqual(['120-220', '320-420']);
    expect(result.maxKeys).toEqual(['350-550']);
  });

  it('6. STANDARD: puste m_standard, tylko m_max >420 – standardKeys [], maxKeys niepuste', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: {},
      m_standard: {},
      m_max: { '550-750': 60 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.standardKeys).toEqual([]);
    expect(result.maxKeys).toEqual(['550-750']);
  });

  it('7. SPIRAL: tylko w zakresie 10–210 mm – brak podstawienia MAX', () => {
    const application = { main_system: 'spiral' };
    const zbiorcza_TP = {
      m_spiral: { '90-110': 30, '150-170': 40 },
      m_standard: {},
      m_max: { '45-75': 10, '75-150': 20 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['90-110', '150-170']);
    expect(result.maxKeys).toEqual([]);
  });

  it('8. SPIRAL: granica 210 – MAX musi mieć to>210 (150-350 wchodzi)', () => {
    const application = { main_system: 'spiral' };
    const zbiorcza_TP = {
      m_spiral: { '190-210': 50 },
      m_standard: {},
      m_max: { '150-350': 50 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.maxKeys).toEqual(['150-350']);
  });

  it('9. SPIRAL: wiele zakresów MAX >210', () => {
    const application = { main_system: 'spiral' };
    const zbiorcza_TP = {
      m_spiral: { '150-170': 20 },
      m_standard: {},
      m_max: { '150-350': 15, '350-550': 10, '750-950': 5 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.maxKeys).toEqual(['150-350', '350-550', '750-950']);
  });

  it('10. MAX: tylko w zakresie 45–950 mm – brak podstawienia SPIRAL', () => {
    const application = { main_system: 'max' };
    const zbiorcza_TP = {
      m_spiral: { '90-110': 20 },
      m_standard: {},
      m_max: { '75-150': 50, '350-550': 30 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
    expect(result.maxKeys).toEqual(['75-150', '350-550']);
  });

  it('11. MAX: granica 45 – SPIRAL "30-50" (to=50) NIE wchodzi do spiralKeys (wymóg to<45)', () => {
    const application = { main_system: 'max' };
    const zbiorcza_TP = {
      m_spiral: { '30-50': 25 },
      m_standard: {},
      m_max: { '45-75': 50 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
  });

  it('12. MAX: tylko SPIRAL to<45 (10-17, 17-30)', () => {
    const application = { main_system: 'max' };
    const zbiorcza_TP = {
      m_spiral: { '10-17': 5, '17-30': 10 },
      m_standard: {},
      m_max: { '45-75': 30 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['10-17', '17-30']);
    expect(result.maxKeys).toEqual(['45-75']);
  });

  it('13. RAPTOR: mimo pełnych macierzy innych systemów – tylko raptorKeys', () => {
    const application = { main_system: 'raptor' };
    const zbiorcza_TP = {
      m_spiral: { '90-110': 10 },
      m_standard: { '120-220': 20 },
      m_max: { '350-550': 30 },
      m_raptor: { '125-155': 40, '185-215': 60 },
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
    expect(result.standardKeys).toEqual([]);
    expect(result.maxKeys).toEqual([]);
    expect(result.raptorKeys).toEqual(['125-155', '185-215']);
  });

  it('14. RAPTOR: kilka zakresów RAPTOR', () => {
    const application = { main_system: 'raptor' };
    const zbiorcza_TP = {
      m_spiral: {},
      m_standard: {},
      m_max: {},
      m_raptor: { '15-35': 5, '95-125': 10, '215-245': 15 },
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.raptorKeys).toEqual(['15-35', '95-125', '215-245']);
  });

  it('15. default: puste macierze – wszystkie klucze puste', () => {
    const application = { main_system: 'other' };
    const zbiorcza_TP = {
      m_spiral: {},
      m_standard: {},
      m_max: {},
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
    expect(result.standardKeys).toEqual([]);
    expect(result.maxKeys).toEqual([]);
    expect(result.raptorKeys).toEqual([]);
  });

  it('16. STANDARD: tylko SPIRAL (niska wys.) – standardKeys puste, spiralKeys nie', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: { '10-17': 20 },
      m_standard: {},
      m_max: {},
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['10-17']);
    expect(result.standardKeys).toEqual([]);
    expect(result.maxKeys).toEqual([]);
  });

  it('17. SPIRAL: zakres przy 210 (190-210) + MAX 150-350 – oba systemy', () => {
    const application = { main_system: 'spiral' };
    const zbiorcza_TP = {
      m_spiral: { '190-210': 40 },
      m_standard: {},
      m_max: { '150-350': 60 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['190-210']);
    expect(result.maxKeys).toEqual(['150-350']);
  });

  it('18. MAX: niskie wys. – SPIRAL 17-30 + MAX 45-75, 75-150', () => {
    const application = { main_system: 'max' };
    const zbiorcza_TP = {
      m_spiral: { '17-30': 20 },
      m_standard: {},
      m_max: { '45-75': 40, '75-150': 40 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['17-30']);
    expect(result.maxKeys).toEqual(['45-75', '75-150']);
  });

  it('19. STANDARD: pełny zakres z podstawieniami – spiral 10-17, standard 30-420, max 350-950', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: { '10-17': 5 },
      m_standard: { '30-45': 10, '120-220': 50, '320-420': 30 },
      m_max: { '350-550': 25, '550-750': 15, '750-950': 5 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual(['10-17']);
    expect(result.standardKeys).toEqual(['30-45', '120-220', '320-420']);
    expect(result.maxKeys).toEqual(['350-550', '550-750', '750-950']);
  });

  it('20. Klucze z count=0 są pomijane (keysWithCount)', () => {
    const application = { main_system: 'standard' };
    const zbiorcza_TP = {
      m_spiral: { '10-17': 0 },
      m_standard: { '120-220': 100, '220-320': 0 },
      m_max: { '350-550': 50 },
      m_raptor: {},
    };
    const result = getKeysPerSeries(application, zbiorcza_TP);
    expect(result.spiralKeys).toEqual([]);
    expect(result.standardKeys).toEqual(['120-220']);
    expect(result.maxKeys).toEqual(['350-550']);
  });
});
