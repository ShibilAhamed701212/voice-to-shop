import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetStore } from '../src/services/bookingStore.js';

describe('Booking API & availability lifecycle', () => {
  let createdBookingId = '';

  beforeAll(() => resetStore());

  it('POST /api/bookings creates a booking with the provider price', async () => {
    const res = await request(app).post('/api/bookings').send({
      customer_id: 'C001',
      provider_id: 'AC001',
      service: 'AC Repair',
      problem: 'AC not cooling',
      date: '2026-09-22',
      start_time: '10:00',
      price: 1 // client-supplied price must be ignored
    });
    expect(res.status).toBe(201);
    expect(res.body.booking_id).toMatch(/^AC\d{4}$/);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.provider.name).toBe('Rahul Kumar');
    expect(res.body.price).toBe(399);
    expect(res.body.booking.customer_name).toBe('Ananya Sharma');
    createdBookingId = res.body.booking_id;
  });

  it('prevents double booking of the same slot and suggests alternatives', async () => {
    const res = await request(app).post('/api/bookings').send({
      customer_id: 'C002',
      provider_id: 'AC001',
      date: '2026-09-22',
      start_time: '10:00'
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SLOT_UNAVAILABLE');
    expect(res.body.alternatives.length).toBeGreaterThan(0);
    expect(res.body.alternatives.every((s: any) => !(s.date === '2026-09-22' && s.start === '10:00'))).toBe(true);
  });

  it('only one of many concurrent requests for a slot succeeds', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app).post('/api/bookings').send({ customer_id: `C00${i + 1}`, provider_id: 'AC002', date: '2026-09-23', start_time: '18:00' })
      )
    );
    expect(attempts.filter(r => r.status === 201)).toHaveLength(1);
    expect(attempts.filter(r => r.status === 409)).toHaveLength(4);
  });

  it('rejects slots outside the provider schedule and past dates', async () => {
    const offSchedule = await request(app).post('/api/bookings').send({ customer_id: 'C001', provider_id: 'AC001', date: '2026-09-22', start_time: '13:00' });
    expect(offSchedule.status).toBe(409);
    const past = await request(app).post('/api/bookings').send({ customer_id: 'C001', provider_id: 'AC001', date: '2026-09-01', start_time: '10:00' });
    expect(past.body.error).toBe('INVALID_DATE');
    const missing = await request(app).post('/api/bookings').send({ customer_id: 'C001' });
    expect(missing.status).toBe(400);
  });

  it('GET /api/bookings/:id and customer filter', async () => {
    const one = await request(app).get(`/api/bookings/${createdBookingId}`);
    expect(one.body.booking.booking_id).toBe(createdBookingId);
    const mine = await request(app).get('/api/bookings?customer_id=c001');
    expect(mine.body.bookings.some((b: any) => b.booking_id === createdBookingId)).toBe(true);
    expect(mine.body.bookings.every((b: any) => b.customer_id === 'C001')).toBe(true);
  });

  it('reschedule moves the booking and frees the old slot', async () => {
    const res = await request(app).post(`/api/bookings/${createdBookingId}/reschedule`).send({ date: '2026-09-22', start_time: '18:00' });
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('rescheduled');
    expect(res.body.booking.start_time).toBe('18:00');
    expect(res.body.booking.end_time).toBe('19:00');

    const slots = await request(app).get('/api/providers/AC001/availability?date=2026-09-22');
    expect(slots.body.slots.find((s: any) => s.start === '10:00').available).toBe(true);
    expect(slots.body.slots.find((s: any) => s.start === '18:00').available).toBe(false);
  });

  it('cancel releases the slot and cannot be repeated', async () => {
    const res = await request(app).post(`/api/bookings/${createdBookingId}/cancel`).send({ reason: 'Customer request' });
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');

    const slots = await request(app).get('/api/providers/AC001/availability?date=2026-09-22');
    expect(slots.body.slots.find((s: any) => s.start === '18:00').available).toBe(true);

    const again = await request(app).post(`/api/bookings/${createdBookingId}/cancel`).send({});
    expect(again.body.error).toBe('ALREADY_CANCELLED');
  });

  it('PATCH only updates whitelisted fields', async () => {
    const res = await request(app).patch('/api/bookings/AC1435').send({ problem: 'Updated note', price: 1, provider_id: 'XX' });
    expect(res.body.booking.problem).toBe('Updated note');
    expect(res.body.booking.price).not.toBe(1);
    expect(res.body.booking.provider_id).toBe('AC006');
  });

  it('malformed JSON returns a JSON 400', async () => {
    const res = await request(app).post('/api/bookings').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_JSON');
  });
});
