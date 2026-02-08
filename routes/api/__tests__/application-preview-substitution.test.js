/**
 * Test integracyjny: preview zwraca produkty z podstawienia (np. STANDARD + wysokość >420 → MAX)
 * Używa mocków Application i Products – nie wymaga bazy.
 */

const request = require('supertest');

jest.mock('../../../models/Application', () => ({
  findById: jest.fn(),
}));
jest.mock('../../../models/Products', () => ({
  aggregate: jest.fn(),
}));

const Application = require('../../../models/Application');
const Products = require('../../../models/Products');

const app = require('../../../app');

describe('GET /api/application/preview/:id – podstawianie produktów', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('404 gdy aplikacja nie istnieje', async () => {
    Application.findById.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/application/preview/507f1f77bcf86cd799439011')
      .expect(404);
    expect(res.body.message).toMatch(/nie znaleziono/i);
  });

  it('STANDARD + zakres 150–500 mm: zamówienie zawiera STANDARD i MAX (wyższe)', async () => {
    const mockApp = {
      _id: '507f1f77bcf86cd799439011',
      main_system: 'standard',
      type: 'slab',
      lowest: 150,
      highest: 500,
      gap_between_slabs: 3,
      additional_accessories: [],
      m_spiral: [],
      m_standard: [
        { range: '120-220', count_in_range: 100 },
        { range: '220-320', count_in_range: 100 },
        { range: '320-420', count_in_range: 100 },
        { range: '350-550', count_in_range: 80 },
      ],
      m_max: [
        { range: '350-550', count_in_range: 80 },
      ],
      m_raptor: [],
    };

    Application.findById.mockResolvedValue(mockApp);

    Products.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { series: 'standard', height_mm: '120 - 220 mm', key: 'STA-120-220-K3' },
        { series: 'standard', height_mm: '220 - 320 mm', key: 'STA-220-320-K3' },
        { series: 'standard', height_mm: '320 - 420 mm', key: 'STA-320-420-K3' },
      ])
      .mockResolvedValueOnce([
        { series: 'max', height_mm: '350 - 550 mm', key: 'MAX-350-550-K3' },
      ])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/application/preview/507f1f77bcf86cd799439011')
      .expect(200);

    expect(res.body.order).toBeDefined();
    expect(Array.isArray(res.body.order)).toBe(true);

    const seriesInOrder = res.body.order.map((p) => p.series?.toLowerCase());
    expect(seriesInOrder).toContain('standard');
    expect(seriesInOrder).toContain('max');

    const maxItems = res.body.order.filter((p) => p.series?.toLowerCase() === 'max');
    expect(maxItems.length).toBeGreaterThan(0);
    expect(maxItems.some((p) => (p.height_mm || '').includes('350'))).toBe(true);
  });

  it('RAPTOR: zamówienie zawiera tylko RAPTOR (brak podstawień)', async () => {
    const mockApp = {
      _id: '507f1f77bcf86cd799439012',
      main_system: 'raptor',
      type: 'wood',
      lowest: 150,
      highest: 208,
      gap_between_slabs: 3,
      additional_accessories: [],
      m_spiral: [],
      m_standard: [],
      m_max: [],
      m_raptor: [
        { range: '125-155', count_in_range: 40 },
        { range: '155-185', count_in_range: 303 },
        { range: '185-215', count_in_range: 233 },
      ],
    };

    Application.findById.mockResolvedValue(mockApp);

    Products.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { series: 'raptor', height_mm: '125 - 155 mm' },
        { series: 'raptor', height_mm: '155 - 185 mm' },
        { series: 'raptor', height_mm: '185 - 215 mm' },
      ]);

    const res = await request(app)
      .get('/api/application/preview/507f1f77bcf86cd799439012')
      .expect(200);

    const seriesInOrder = [...new Set(res.body.order.map((p) => p.series?.toLowerCase()))];
    expect(seriesInOrder).toContain('raptor');
    expect(seriesInOrder.filter((s) => s && s !== 'raptor').length).toBe(0);
  });
});
