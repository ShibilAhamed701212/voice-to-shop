import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

describe('Health Check & Providers API', () => {
  it('GET /health returns 200 and status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('PS06 Mock Service API');
  });

  it('GET /api/providers returns all providers (at least 40)', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(40);
  });

  it('GET /api/providers?service=AC%20Repair&pincode=560064 filters accurately', async () => {
    const res = await request(app).get('/api/providers?service=AC%20Repair&pincode=560064');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.providers.length).toBeGreaterThan(0);
    
    // Check that returned providers match criteria
    for (const p of res.body.providers) {
      expect(p.category).toContain('AC');
      expect(p.location.pincode).toBe('560064');
    }
  });

  it('POST /api/providers/search returns ranked matching providers', async () => {
    const res = await request(app)
      .post('/api/providers/search')
      .send({
        service: 'AC Repair',
        problem: 'AC not cooling',
        pincode: '560064',
        date: '2026-09-21',
        preferred_time: '18:00'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.providers.length).toBeGreaterThanOrEqual(2);
    
    const topProvider = res.body.providers[0];
    expect(topProvider.name).toBe('Rahul Kumar');
    expect(topProvider.price).toBe(399);
  });

  it('GET /api/providers/:id returns individual provider details', async () => {
    const res = await request(app).get('/api/providers/AC001');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.provider.name).toBe('Rahul Kumar');
    expect(res.body.provider.rating).toBe(4.7);
  });

  it('GET /api/providers/:id/availability returns slots', async () => {
    const res = await request(app).get('/api/providers/AC001/availability?date=2026-09-21');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.slots.length).toBeGreaterThan(0);
  });
});
