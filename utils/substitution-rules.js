/**
 * Zasady podstawiania produktów (zgodne z PRODUCT_SUBSTITUTION_README.md).
 * STANDARD → niższe: SPIRAL, wyższe: MAX
 * SPIRAL → wyższe: MAX
 * MAX → niższe: SPIRAL
 * RAPTOR → brak podstawień
 */

/**
 * Parsuje klucz zakresu "350-550" → { from: 350, to: 550 }
 * @param {string} key
 * @returns {{ from: number, to: number } | null}
 */
function parseRangeKey(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-').map((s) => parseInt(s.trim(), 10));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
    return { from: parts[0], to: parts[1] };
  return null;
}

/**
 * Zwraca klucze z macierzy (obiekt range → count) mające count > 0
 * @param {Record<string, number>} matrix
 * @returns {string[]}
 */
function keysWithCount(matrix) {
  return Object.keys(matrix || {}).filter(
    (k) => k && matrix[k] != null && Number(matrix[k]) > 0,
  );
}

/**
 * Zwraca zestaw kluczy per seria do zapytania produktów (pipeline),
 * zgodnie z zasadami podstawiania i main_system.
 * @param {{ main_system: string }} application
 * @param {{ m_spiral: Record<string,number>, m_standard: Record<string,number>, m_max: Record<string,number>, m_raptor: Record<string,number> }} zbiorcza_TP
 * @returns {{ spiralKeys: string[], standardKeys: string[], maxKeys: string[], raptorKeys: string[] }}
 */
function getKeysPerSeries(application, zbiorcza_TP) {
  const spiralKeys = keysWithCount(zbiorcza_TP.m_spiral);
  const standardKeys = keysWithCount(zbiorcza_TP.m_standard);
  const maxKeys = keysWithCount(zbiorcza_TP.m_max);
  const raptorKeys = keysWithCount(zbiorcza_TP.m_raptor);

  switch (application.main_system) {
    case 'raptor':
      return {
        spiralKeys: [],
        standardKeys: [],
        maxKeys: [],
        raptorKeys,
      };
    case 'standard':
      return {
        // SPIRAL dla niskich wysokości: klucz "17-30" ma to=30 — musi być <= 30,
        // inaczej cały bucket znika z oferty (tylko STANDARD 30–45, 45–70).
        spiralKeys: spiralKeys.filter((k) => {
          const r = parseRangeKey(k);
          return r && r.to <= 30;
        }),
        standardKeys,
        maxKeys: maxKeys.filter((k) => {
          const r = parseRangeKey(k);
          return r && r.to > 420;
        }),
        raptorKeys: [],
      };
    case 'spiral':
      return {
        spiralKeys,
        standardKeys: [],
        maxKeys: maxKeys.filter((k) => {
          const r = parseRangeKey(k);
          return r && r.to > 210;
        }),
        raptorKeys: [],
      };
    case 'max':
      return {
        spiralKeys: spiralKeys.filter((k) => {
          const r = parseRangeKey(k);
          return r && r.to <= 45;
        }),
        standardKeys: [],
        maxKeys,
        raptorKeys: [],
      };
    default:
      return {
        spiralKeys,
        standardKeys,
        maxKeys,
        raptorKeys,
      };
  }
}

module.exports = {
  parseRangeKey,
  keysWithCount,
  getKeysPerSeries,
};
