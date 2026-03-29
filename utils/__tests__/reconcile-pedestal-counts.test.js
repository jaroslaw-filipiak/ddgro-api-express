const {
  reconcilePedestalLineCounts,
} = require('../reconcile-pedestal-counts');

const price2 = () => 2;

describe('reconcilePedestalLineCounts', () => {
  it('sumuje do supports_count (case 25–63 mm: 34.59+129.73+155.68 → 320)', () => {
    const items = [
      { id: 1, count: 34.5945945945946 },
      { id: 2, count: 129.7297297297297 },
      { id: 3, count: 155.67567567567565 },
    ];
    const out = reconcilePedestalLineCounts(items, 320, price2);
    const sum = out.reduce((s, x) => s + x.count, 0);
    expect(sum).toBe(320);
    expect(out.map((x) => x.count)).toEqual([34, 130, 156]);
  });

  it('Math.round na liniach dałby 321 — tu nadal 320', () => {
    const raw = [34.5945945945946, 129.7297297297297, 155.67567567567565];
    const naive = raw.map((r) => Math.round(r)).reduce((a, b) => a + b, 0);
    expect(naive).toBe(321);
    const out = reconcilePedestalLineCounts(
      raw.map((count, i) => ({ count, id: i })),
      320,
      price2,
    );
    expect(out.reduce((s, x) => s + x.count, 0)).toBe(320);
  });
});
