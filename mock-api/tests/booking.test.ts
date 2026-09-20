import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetProvidersCache } from '../src/services/availabilityService.js';
import { resetBookingsCache } from '../src/services/bookingService.js';

describe('Booking API & Availability Lifecycle', () => {
  const testDate = '2026-09-22';
  const testTime = '10:00';
  let createdBookingId = '';

  beforeAll(() => {
    resetProvidersCache();
    resetBookingsCache();
  });

  it('POST /api/bookings successfully creates a booking', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        customer_id: 'C001',
        provider_id: 'AC001',
        service: 'AC Repair',
        problem: 'AC not cooling',
        date: testDate,
        start_time: testTime,
        end_time: '11:00',
        price: 399
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.booking_id).toBeDefined();
    expect(res.body.status).toBe('confirmed');
    expect(res.body.provider.name).toBe('Rahul Kumar');
    createdBookingId = res.body.booking_id;
  });

  it('POST /api/bookings prevents double booking of the same slot', async () => {
    // First booking takes the slot
    await request(app)
      .post('/api/bookings')
      .send({
        customer_id: 'C001',
        provider_id: 'AC001',
        service: 'AC Repair',
        problem: 'Initial booking',
        date: '2026-09-22',
        start_time: '14:00',
        end_time: '15:00',
        price: 399
      });

    // Second booking on exact same slot must be rejected
    const res = await request(app)
      .post('/api/bookings')
      .send({
        customer_id: 'C002',
        provider_id: 'AC001',
        service: 'AC Repair',
        problem: 'Second customer requesting same slot',
        date: '2026-09-22',
        start_time: '14:00',
        end_time: '15:00',
        price: 399
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('SLOT_UNAVAILABLE');
  });

  it('GET /api/bookings/:id retrieves the created booking', async () => {
    const res = await request(app).get(`/api/bookings/${createdBookingId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.booking_id).toBe(createdBookingId);
  });

  it('POST /api/bookings/:id/reschedule updates booking and handles slot changes', async () => {
    const newDate = '2026-09-22';
    const newTime = '18:00';

    const res = await request(app)
      .post(`/api/bookings/${createdBookingId}/reschedule`)
      .send({
        date: newDate,
        start_time: newTime
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('rescheduled');
    expect(res.body.booking.start_time).toBe(newTime);
  });

  it('POST /api/bookings/:id/cancel cancels booking and releases the slot', async () => {
    const res = await request(app)
      .post(`/api/bookings/${createdBookingId}/cancel`)
      .send({ reason: 'Customer requested cancellation' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('cancelled');

    // Slot 18:00 should now be released
    const slotCheck = await request(app).get('/api/providers/AC001/availability?date=2026-09-22');
    const slot = slotCheck.body.slots.find((s: any) => s.start === '18:00');
    expect(slot.available).toBe(true);
  });
});
