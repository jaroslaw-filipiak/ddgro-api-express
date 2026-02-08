/**
 * Testy E2E – prawdziwe scenariusze użytkownika.
 * Tworzymy aplikacje w bazie, wywołujemy GET /preview/:id, sprawdzamy wynik.
 * Wymaga: MONGODB_URI w .env oraz zaimportowanych produktów w kolekcji Products.
 *
 * Uruchom: npm test -- application-preview.e2e.test.js
 * (albo cały zestaw – testy E2E pominą się, gdy brak MONGODB_URI)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const Application = require('../../../models/Application');
const app = require('../../../app');

const hasDb = !!process.env.MONGODB_URI;

function buildMatrix(rangesWithCounts) {
  return rangesWithCounts.map(([range, count]) => ({
    range,
    count_in_range: count,
  }));
}

const describeE2E = hasDb ? describe : describe.skip;

describeE2E('E2E: GET /api/application/preview/:id – realne scenariusze', () => {
  let createdIds = [];

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => {
        mongoose.connection.once('open', resolve);
      });
    }
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await Application.deleteMany({ _id: { $in: createdIds } });
    }
    await mongoose.connection.close();
  });

  it('STANDARD 150–500 mm: w zamówieniu są produkty STANDARD i MAX (podstawienie wyższych)', async () => {
    const doc = await Application.create({
      main_system: 'standard',
      type: 'slab',
      lowest: 150,
      highest: 500,
      gap_between_slabs: 3,
      supports_count: 576,
      additional_accessories: [],
      m_spiral: [],
      m_standard: buildMatrix([
        ['120-220', 100],
        ['220-320', 100],
        ['320-420', 100],
      ]),
      m_max: buildMatrix([['350-550', 80]]),
      m_raptor: [],
    });
    createdIds.push(doc._id);

    const res = await request(app)
      .get(`/api/application/preview/${doc._id}`)
      .expect(200);

    expect(res.body.order).toBeDefined();
    expect(Array.isArray(res.body.order)).toBe(true);

    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('standard');
    expect(series).toContain('max');

    const maxItems = res.body.order.filter((p) => (p.series || '').toLowerCase() === 'max');
    expect(maxItems.length).toBeGreaterThan(0);
    const hasHighRange = maxItems.some((p) => (p.height_mm || '').includes('350') || (p.height_mm || '').includes('550'));
    expect(hasHighRange).toBe(true);
  });

  it('SPIRAL 100–250 mm: w zamówieniu są SPIRAL i MAX (podstawienie wyższych >210)', async () => {
    const doc = await Application.create({
      main_system: 'spiral',
      type: 'slab',
      lowest: 100,
      highest: 250,
      gap_between_slabs: 3,
      supports_count: 400,
      additional_accessories: [],
      m_spiral: buildMatrix([
        ['90-110', 50],
        ['150-170', 100],
        ['190-210', 50],
      ]),
      m_standard: [],
      m_max: buildMatrix([['150-350', 100]]),
      m_raptor: [],
    });
    createdIds.push(doc._id);

    const res = await request(app)
      .get(`/api/application/preview/${doc._id}`)
      .expect(200);

    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('spiral');
    expect(series).toContain('max');
  });

  it('MAX 30–100 mm: w zamówieniu są SPIRAL i MAX (podstawienie niższych <45)', async () => {
    const doc = await Application.create({
      main_system: 'max',
      type: 'slab',
      lowest: 30,
      highest: 100,
      gap_between_slabs: 3,
      supports_count: 200,
      additional_accessories: [],
      m_spiral: buildMatrix([['17-30', 30], ['30-50', 70]]),
      m_standard: [],
      m_max: buildMatrix([['45-75', 50], ['75-150', 50]]),
      m_raptor: [],
    });
    createdIds.push(doc._id);

    const res = await request(app)
      .get(`/api/application/preview/${doc._id}`)
      .expect(200);

    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('spiral');
    expect(series).toContain('max');
  });

  it('RAPTOR 150–208 mm: w zamówieniu tylko RAPTOR (brak podstawień)', async () => {
    const doc = await Application.create({
      main_system: 'raptor',
      type: 'wood',
      lowest: 150,
      highest: 208,
      gap_between_slabs: 3,
      supports_count: 576,
      additional_accessories: [],
      m_spiral: [],
      m_standard: [],
      m_max: [],
      m_raptor: buildMatrix([
        ['125-155', 40],
        ['155-185', 303],
        ['185-215', 233],
      ]),
    });
    createdIds.push(doc._id);

    const res = await request(app)
      .get(`/api/application/preview/${doc._id}`)
      .expect(200);

    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('raptor');
    expect(series.filter((s) => s && s !== 'raptor').length).toBe(0);
  });

  it('STANDARD 200–400 mm: tylko STANDARD (brak podstawień – w zakresie 30–420)', async () => {
    const doc = await Application.create({
      main_system: 'standard',
      type: 'slab',
      lowest: 200,
      highest: 400,
      gap_between_slabs: 3,
      supports_count: 300,
      additional_accessories: [],
      m_spiral: [],
      m_standard: buildMatrix([['120-220', 100], ['220-320', 100], ['320-420', 100]]),
      m_max: [],
      m_raptor: [],
    });
    createdIds.push(doc._id);
    const res = await request(app).get(`/api/application/preview/${doc._id}`).expect(200);
    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('standard');
    expect(series.filter((s) => s === 'max').length).toBe(0);
  });

  it('STANDARD 15–25 mm: tylko SPIRAL (podstawienie niższych <30)', async () => {
    const doc = await Application.create({
      main_system: 'standard',
      type: 'slab',
      lowest: 15,
      highest: 25,
      gap_between_slabs: 3,
      supports_count: 100,
      additional_accessories: [],
      m_spiral: buildMatrix([['10-17', 30], ['17-30', 70]]),
      m_standard: [],
      m_max: [],
      m_raptor: [],
    });
    createdIds.push(doc._id);
    const res = await request(app).get(`/api/application/preview/${doc._id}`).expect(200);
    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('spiral');
  });

  it('STANDARD 400–600 mm: STANDARD + MAX (podstawienie wyższych)', async () => {
    const doc = await Application.create({
      main_system: 'standard',
      type: 'slab',
      lowest: 400,
      highest: 600,
      gap_between_slabs: 3,
      supports_count: 250,
      additional_accessories: [],
      m_spiral: [],
      m_standard: buildMatrix([['320-420', 80]]),
      m_max: buildMatrix([['350-550', 100], ['550-750', 70]]),
      m_raptor: [],
    });
    createdIds.push(doc._id);
    const res = await request(app).get(`/api/application/preview/${doc._id}`).expect(200);
    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('standard');
    expect(series).toContain('max');
  });

  it('SPIRAL 50–200 mm: tylko SPIRAL (w zakresie 10–210, brak podstawienia)', async () => {
    const doc = await Application.create({
      main_system: 'spiral',
      type: 'slab',
      lowest: 50,
      highest: 200,
      gap_between_slabs: 3,
      supports_count: 200,
      additional_accessories: [],
      m_spiral: buildMatrix([['50-70', 50], ['90-110', 50], ['150-170', 100]]),
      m_standard: [],
      m_max: [],
      m_raptor: [],
    });
    createdIds.push(doc._id);
    const res = await request(app).get(`/api/application/preview/${doc._id}`).expect(200);
    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('spiral');
    expect(series.filter((s) => s === 'max').length).toBe(0);
  });

  it('MAX 100–400 mm: tylko MAX (w zakresie 45–950, brak podstawienia)', async () => {
    const doc = await Application.create({
      main_system: 'max',
      type: 'slab',
      lowest: 100,
      highest: 400,
      gap_between_slabs: 3,
      supports_count: 300,
      additional_accessories: [],
      m_spiral: [],
      m_standard: [],
      m_max: buildMatrix([['75-150', 100], ['150-350', 100], ['350-550', 100]]),
      m_raptor: [],
    });
    createdIds.push(doc._id);
    const res = await request(app).get(`/api/application/preview/${doc._id}`).expect(200);
    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('max');
    expect(series.filter((s) => s === 'spiral').length).toBe(0);
  });

  it('RAPTOR 80–120 mm (wood): tylko RAPTOR', async () => {
    const doc = await Application.create({
      main_system: 'raptor',
      type: 'wood',
      lowest: 80,
      highest: 120,
      gap_between_slabs: 3,
      supports_count: 150,
      additional_accessories: [],
      m_spiral: [],
      m_standard: [],
      m_max: [],
      m_raptor: buildMatrix([['65-95', 50], ['95-125', 100]]),
    });
    createdIds.push(doc._id);
    const res = await request(app).get(`/api/application/preview/${doc._id}`).expect(200);
    const series = [...new Set(res.body.order.map((p) => (p.series || '').toLowerCase()))];
    expect(series).toContain('raptor');
    expect(series.filter((s) => s && s !== 'raptor').length).toBe(0);
  });

  it('pełny flow: POST tworzy aplikację, GET preview zwraca zamówienie', async () => {
    const payload = {
      main_system: 'standard',
      type: 'slab',
      lowest: 200,
      highest: 450,
      gap_between_slabs: 3,
      supports_count: 300,
      additional_accessories: [],
      m_spiral: [],
      m_standard: buildMatrix([
        ['120-220', 80],
        ['220-320', 120],
        ['320-420', 100],
      ]),
      m_max: buildMatrix([['350-550', 50]]),
      m_raptor: [],
    };

    const createRes = await request(app)
      .post('/api/application')
      .send(payload)
      .expect(201);

    const id = createRes.body.id;
    expect(id).toBeDefined();
    createdIds.push(id);

    const previewRes = await request(app)
      .get(`/api/application/preview/${id}`)
      .expect(200);

    expect(previewRes.body.application).toBeDefined();
    expect(previewRes.body.application.main_system).toBe('standard');
    expect(previewRes.body.application.lowest).toBe(200);
    expect(previewRes.body.application.highest).toBe(450);
    expect(previewRes.body.order.length).toBeGreaterThan(0);
  });
});
