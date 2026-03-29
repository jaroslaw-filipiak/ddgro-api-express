/**
 * Zamienia ułamkowe ilości z macierzy na liczby całkowite tak, by suma linii
 * zgadzała się z application.supports_count (metoda największych reszt).
 * Zapobiega sytuacji: round(34.59)+round(129.73)+round(155.68) = 321 przy sumie rzeczywistej 320.
 */

function reconcilePedestalLineCounts(items, targetTotal, getPriceNet) {
  if (!Array.isArray(items) || items.length === 0) {
    return items || [];
  }

  const target = Math.round(Number(targetTotal));
  if (!Number.isFinite(target) || target < 0) {
    return items.map((item) => {
      const count = Math.round(Number(item.count) || 0);
      const priceNet = getPriceNet(item);
      return {
        ...item,
        count,
        total_price: (count * priceNet).toFixed(2),
      };
    });
  }

  const raw = items.map((item) => Math.max(0, Number(item.count) || 0));
  const floors = raw.map((r) => Math.floor(r));
  const sumFloors = floors.reduce((a, b) => a + b, 0);
  let deficit = target - sumFloors;

  const byFracDesc = raw
    .map((r, idx) => ({ idx, frac: r - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);

  const delta = new Array(items.length).fill(0);

  if (deficit > 0) {
    let i = 0;
    for (; i < deficit && i < byFracDesc.length; i++) {
      delta[byFracDesc[i].idx] += 1;
    }
    for (let j = 0; j < deficit - i; j++) {
      delta[byFracDesc[j % byFracDesc.length].idx] += 1;
    }
  } else if (deficit < 0) {
    const byFracAsc = [...byFracDesc].reverse();
    let need = -deficit;
    for (let i = 0; i < byFracAsc.length && need > 0; i++) {
      const idx = byFracAsc[i].idx;
      if (floors[idx] + delta[idx] > 0) {
        delta[idx] -= 1;
        need -= 1;
      }
    }
  }

  return items.map((item, idx) => {
    const count = Math.max(0, floors[idx] + delta[idx]);
    const priceNet = getPriceNet(item);
    return {
      ...item,
      count,
      total_price: (count * priceNet).toFixed(2),
    };
  });
}

module.exports = { reconcilePedestalLineCounts };
