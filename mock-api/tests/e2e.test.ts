import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetProvidersCache } from '../src/services/availabilityService.js';
import { resetBookingsCache } from '../src/services/bookingService.js';

describe('PS-06 End-to-End Demo Conversation Scenario', () => {
  const sessionId = `TEST_E2E_${Date.now()}`;
  const customerId = 'C001';

  beforeAll(() => {
    resetProvidersCache();
    resetBookingsCache();
  });

  it('Step 1: User states AC problem without location -> Agent requests PIN code', async () => {
    const res = await request(app)
      .post('/api/make-simulator')
      .send({
        session_id: sessionId,
        customer_id: customerId,
        message: "My AC isn't cooling properly. I need someone tomorrow evening.",
        input_type: 'voice',
        language: 'en-IN'
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toContain('What is your PIN code?');
    expect(res.body.state.service).toBe('AC Repair');
  });

  it('Step 2: User provides PIN code -> Agent searches providers and compares options', async () => {
    const res = await request(app)
      .post('/api/make-simulator')
      .send({
        session_id: sessionId,
        customer_id: customerId,
        message: '560064',
        input_type: 'voice',
        language: 'en-IN'
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toContain('Rahul Kumar');
    expect(res.body.text).toContain('399');
    expect(res.body.text).toContain('Arun Services');
    expect(res.body.options.length).toBeGreaterThanOrEqual(2);
  });

  it('Step 3: User selects Rahul Kumar -> Agent asks explicit confirmation before booking', async () => {
    const res = await request(app)
      .post('/api/make-simulator')
      .send({
        session_id: sessionId,
        customer_id: customerId,
        message: 'Yes, Rahul Kumar',
        input_type: 'voice',
        language: 'en-IN'
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toContain('Rahul Kumar is ₹399');
    expect(res.body.text).toContain('Shall I confirm the booking?');
    expect(res.body.booking).toBeUndefined(); // Must NOT have booked yet!
  });

  it('Step 4: User explicitly confirms -> Booking is created and confirmed with ID and time', async () => {
    const res = await request(app)
      .post('/api/make-simulator')
      .send({
        session_id: sessionId,
        customer_id: customerId,
        message: 'Yes, book him.',
        input_type: 'voice',
        language: 'en-IN'
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toContain('Your ac repair technician is booked');
    expect(res.body.text).toContain('Rahul Kumar');
    expect(res.body.text).toContain('booking ID is');
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.status).toBe('confirmed');
  });
});
