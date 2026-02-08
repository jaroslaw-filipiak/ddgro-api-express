/**
 * Testy createZBIORCZA_TP – podsumowanie macierzy i wybór main_keys
 */

const { createZBIORCZA_TP } = require('../create-zbiorcza-tp');

function makeMatrixItems(ranges) {
  return ranges.map(([range, count]) => ({ range, count_in_range: count }));
}

describe('createZBIORCZA_TP', () => {
  it('grupuje po range i sumuje count_in_range', () => {
    const application = {
      main_system: 'standard',
      m_standard: [
        { range: '120-220', count_in_range: 10 },
        { range: '120-220', count_in_range: 5 },
        { range: '220-320', count_in_range: 20 },
      ],
      m_spiral: [],
      m_max: [],
      m_raptor: [],
    };
    const result = createZBIORCZA_TP(application);
    expect(result.m_standard['120-220']).toBe(15);
    expect(result.m_standard['220-320']).toBe(20);
  });

  it('ustawia main_keys według main_system', () => {
    const application = {
      main_system: 'standard',
      m_standard: makeMatrixItems([['30-45', 10], ['120-220', 20]]),
      m_spiral: makeMatrixItems([['17-30', 5]]),
      m_max: [],
      m_raptor: [],
    };
    const result = createZBIORCZA_TP(application);
    expect(Object.keys(result.main_keys)).toEqual(['30-45', '120-220']);
    expect(result.main_keys['30-45']).toBe(10);
    expect(result.main_keys['120-220']).toBe(20);
  });

  it('dla main_system raptor zwraca main_keys z m_raptor', () => {
    const application = {
      main_system: 'raptor',
      m_standard: [],
      m_spiral: [],
      m_max: [],
      m_raptor: makeMatrixItems([['125-155', 40], ['155-185', 60]]),
    };
    const result = createZBIORCZA_TP(application);
    expect(Object.keys(result.main_keys)).toEqual(['125-155', '155-185']);
  });

  it('usuwa pusty klucz z macierzy', () => {
    const application = {
      main_system: 'standard',
      m_standard: [
        { range: '', count_in_range: 1 },
        { range: '30-45', count_in_range: 10 },
      ],
      m_spiral: [],
      m_max: [],
      m_raptor: [],
    };
    const result = createZBIORCZA_TP(application);
    expect(result.m_standard['']).toBeUndefined();
    expect(result.m_standard['30-45']).toBe(10);
  });

  it('fallback: gdy main_system nie ma produktów, używa innego systemu', () => {
    const application = {
      main_system: 'standard',
      m_standard: [], // brak produktów w main
      m_spiral: [],
      m_max: makeMatrixItems([['350-550', 50]]),
      m_raptor: [],
    };
    const result = createZBIORCZA_TP(application);
    expect(Object.keys(result.main_keys).length).toBeGreaterThan(0);
    expect(result.main_keys['350-550']).toBe(50);
  });
});
