import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetStore } from '../src/services/bookingStore.js';

describe('Health, config & providers API', () => {
  beforeAll(() => resetStore());

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('PS06 Mock Service API');
  });

  it('GET /api/config exposes feature flags but no secrets', async () => {
    const res = await request(app).get('/api/config');
    expect(res.body.today).toBe('2026-09-20');
    expect(res.body.make_webhook_configured).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/sk_|hook\.eu/);
  });

  it('GET /api/meta lists categories and areas', async () => {
    const res = await request(app).get('/api/meta');
    expect(res.body.categories).toHaveLength(8);
    expect(res.body.areas.length).toBeGreaterThanOrEqual(8);
  });

  it('GET /api/providers returns all providers (at least 40)', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(40);
  });

  it('GET /api/providers filters by service and pincode', async () => {
    const res = await request(app).get('/api/providers?service=AC%20Repair&pincode=560064');
    expect(res.body.providers.length).toBeGreaterThan(0);
    for (const p of res.body.providers) {
      expect(p.category).toContain('AC');
      expect(p.location.pincode).toBe('560064');
    }
  });

  it('GET /api/providers?category=Plumbing&date= only returns providers with a free slot that day', async () => {
    const res = await request(app).get('/api/providers?category=Plumbing&date=2026-09-21');
    expect(res.body.providers.length).toBeGreaterThan(0);
    for (const p of res.body.providers) {
      expect(p.category).toBe('Plumbing');
      expect(p.availability.every((s: any) => s.date === '2026-09-21')).toBe(true);
      expect(p.availability.some((s: any) => s.available)).toBe(true);
    }
  });

  it('POST /api/providers/search ranks the best value exact-time match first', async () => {
    const res = await request(app).post('/api/providers/search').send({
      service: 'AC Repair',
      problem: 'AC not cooling',
      pincode: '560064',
      date: '2026-09-21',
      preferred_time: '18:00'
    });
    expect(res.body.providers.length).toBeGreaterThanOrEqual(2);
    expect(res.body.providers[0].name).toBe('Rahul Kumar');
    expect(res.body.providers[0].price).toBe(399);
    expect(res.body.providers[0].matched_slot.start).toBe('18:00');
  });

  it('availability rolls forward with the calendar (no stale hardcoded dates)', async () => {
    const res = await request(app).get('/api/providers/AC001/availability');
    const dates = new Set(res.body.slots.map((s: any) => s.date));
    expect(dates.size).toBe(14);
    expect(dates.has('2026-09-20')).toBe(true);
    expect(dates.has('2026-10-03')).toBe(true);
  });

  it('same-day slots within the next hour are not bookable', async () => {
    const res = await request(app).get('/api/providers/AC004/availability?date=2026-09-20');
    const nine = res.body.slots.find((s: any) => s.start === '09:00');
    const eve = res.body.slots.find((s: any) => s.start === '18:00');
    expect(nine.available).toBe(false);
    expect(eve.available).toBe(true);
  });

  it('GET /api/providers/:id returns provider details', async () => {
    const res = await request(app).get('/api/providers/AC001');
    expect(res.body.provider.name).toBe('Rahul Kumar');
    expect(res.body.provider.rating).toBe(4.7);
  });

  it('manual block and unblock of a slot', async () => {
    const block = await request(app).patch('/api/providers/AC005/availability').send({ date: '2026-09-23', start_time: '10:00', available: false });
    expect(block.status).toBe(200);
    expect(block.body.slots.find((s: any) => s.start === '10:00').available).toBe(false);
    const again = await request(app).patch('/api/providers/AC005/availability').send({ date: '2026-09-23', start_time: '10:00', available: false });
    expect(again.status).toBe(409);
    const unblock = await request(app).patch('/api/providers/AC005/availability').send({ date: '2026-09-23', start_time: '10:00', available: true });
    expect(unblock.body.slots.find((s: any) => s.start === '10:00').available).toBe(true);
  });
});
