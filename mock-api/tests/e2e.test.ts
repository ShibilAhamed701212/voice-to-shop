import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { resetStore } from '../src/services/bookingStore.js';
import { resetSessions } from '../src/agent/agent.js';

const say = (session_id: string, message: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/api/agent/message').send({ session_id, customer_id: 'C001', message, mode: 'local', ...extra });

describe('PS-06 demo conversation (built-in agent)', () => {
  const sid = `E2E_${Date.now()}`;
  let bookingId = '';

  beforeAll(() => {
    resetStore();
    resetSessions();
  });

  it('Step 1: problem without location -> asks for PIN code only', async () => {
    const res = await say(sid, "My AC isn't cooling properly. I need someone tomorrow evening.");
    expect(res.body.text).toContain('PIN code');
    expect(res.body.state.service).toBe('AC Repair');
    expect(res.body.state.date).toBe('2026-09-21');
    expect(res.body.state.time).toBe('18:00');
    expect(res.body.stage).toBe('gathering');
  });

  it('Step 2: PIN code -> searches and compares real options', async () => {
    const res = await say(sid, '560064');
    expect(res.body.stage).toBe('options');
    expect(res.body.text).toContain('Rahul Kumar');
    expect(res.body.text).toContain('₹399');
    expect(res.body.options.map((o: any) => o.name)).toContain('Arun Services');
    expect(res.body.text.split(' ').length).toBeLessThan(40);
    expect(res.body.options.length).toBeGreaterThanOrEqual(2);
    expect(res.body.options[0].badges).toContain('Recommended');
  });

  it('Step 3: selects Rahul -> explicit confirmation, nothing booked yet', async () => {
    const res = await say(sid, 'Yes, Rahul Kumar');
    expect(res.body.stage).toBe('confirming');
    expect(res.body.text).toContain('Rahul Kumar, tomorrow 6 to 7 PM, ₹399');
    expect(res.body.text).toContain('Shall I book it?');
    expect(res.body.booking).toBeUndefined();
    expect(res.body.proposal.provider_id).toBe('AC001');
  });

  it('Step 4: explicit yes -> booking confirmed with ID', async () => {
    const res = await say(sid, 'Yes, book him.');
    expect(res.body.stage).toBe('booked');
    expect(res.body.text).toContain('Booked!');
    expect(res.body.text).toContain('booking ID is');
    expect(res.body.booking.status).toBe('confirmed');
    expect(res.body.booking.start_time).toBe('18:00');
    bookingId = res.body.booking.booking_id;
  });

  it('a second customer cannot get the same slot', async () => {
    const other = `E2E_OTHER_${Date.now()}`;
    await say(other, 'AC not cooling, 560064, tomorrow at 6 pm');
    const res = await request(app).post('/api/agent/message').send({
      session_id: other,
      customer_id: 'C002',
      message: 'Rahul Kumar at 6 pm',
      mode: 'local'
    });
    // Rahul's 6 PM is gone, so the agent offers his nearest free slot instead.
    expect(res.body.proposal?.start_time).not.toBe('18:00');
  });

  it('reschedule via voice requires confirmation', async () => {
    const ask = await say(sid, 'Can you reschedule it to the day after tomorrow at 10 am?');
    expect(ask.body.stage).toBe('confirm_reschedule');
    expect(ask.body.proposal.date).toBe('2026-09-22');
    expect(ask.body.proposal.start_time).toBe('10:00');
    const done = await say(sid, 'yes');
    expect(done.body.booking.booking_id).toBe(bookingId);
    expect(done.body.booking.status).toBe('rescheduled');
  });

  it('cancel via voice requires confirmation', async () => {
    const ask = await say(sid, 'Actually cancel my booking');
    expect(ask.body.stage).toBe('confirm_cancel');
    const keep = await say(sid, 'no wait');
    expect(keep.body.stage).toBe('booked');
    await say(sid, 'cancel the booking');
    const done = await say(sid, 'yes please');
    expect(done.body.booking.status).toBe('cancelled');
  });
});

describe('Agent robustness', () => {
  beforeAll(() => {
    resetStore();
    resetSessions();
  });

  it('collects everything from a single sentence and offers options', async () => {
    const res = await say('one-shot', 'Kitchen tap is leaking in Koramangala, tomorrow morning please');
    // No plumbers serve 560034, so nearby ones are offered.
    expect(res.body.stage).toBe('options');
    expect(res.body.state.service).toBe('Plumbing');
    expect(res.body.state.pincode).toBe('560034');
    expect(res.body.text).toMatch(/nearest options/);
  });

  it('uses the saved address when asked', async () => {
    await say('saved', 'my fan is not working');
    const res = await say('saved', 'use my saved address');
    expect(res.body.state.pincode).toBe('560064');
    expect(res.body.text).toMatch(/When should/);
  });

  it('rejects unsupported PIN codes politely', async () => {
    await say('unsupported', 'need a carpenter');
    const res = await say('unsupported', 'four zero zero zero zero one');
    expect(res.body.text).toMatch(/don't have professionals in 4 0 0 0 0 1/);
    expect(res.body.state.pincode).toBeNull();
  });

  it('declining a proposal never books', async () => {
    await say('decline', 'fridge not cooling 560076 tomorrow evening');
    await say('decline', 'the first one');
    const res = await say('decline', 'no');
    expect(res.body.stage).toBe('options');
    expect(res.body.booking).toBeUndefined();
  });

  it('picks the cheapest option on request', async () => {
    const opts = await say('cheap', 'washing machine drum not spinning in 560037 on the 22nd');
    const cheapest = [...opts.body.options].sort((a: any, b: any) => a.price - b.price)[0];
    const res = await say('cheap', 'the cheapest one');
    expect(res.body.proposal.provider_id).toBe(cheapest.provider_id);
  });

  it('UI actions select and confirm a specific slot', async () => {
    await say('ui', 'TV screen blank, 560064, tomorrow');
    const sel = await say('ui', 'I choose TV032 at 10 AM', { action: { type: 'select', provider_id: 'TV032', date: '2026-09-21', start_time: '10:00' } });
    expect(sel.body.proposal.start_time).toBe('10:00');
    const conf = await say('ui', 'Yes, book it', { action: { type: 'confirm' } });
    expect(conf.body.booking.provider_id).toBe('TV032');
  });

  it('declines off-topic requests and clarifies vague ones', async () => {
    const off = await say('offtopic', 'Can you tell me the nearest supermarket');
    expect(off.body.text).toMatch(/only book home services/);
    const vague = await say('offtopic', 'I need to fix my motors');
    expect(vague.body.text).toMatch(/water pump, a fan, or a washing machine/);
    const pick = await say('offtopic', 'water pump');
    expect(pick.body.state.service).toBe('Plumbing');
  });

  it('auto mode without ANTHROPIC_API_KEY uses the offline agent', async () => {
    const res = await request(app).post('/api/agent/message').send({ session_id: 'auto1', message: 'My AC is not cooling' });
    expect(res.body.source).toBe('local');
    expect(res.body.fallback).toBeUndefined();
  });

  it('legacy /api/make-simulator endpoint still works', async () => {
    const res = await request(app).post('/api/make-simulator').send({ session_id: 'legacy', message: 'My AC is not cooling' });
    expect(res.body.text).toContain('PIN code');
  });

  it('make mode without a webhook falls back to the built-in agent', async () => {
    const res = await request(app).post('/api/agent/message').send({ session_id: 'mk', message: 'hello', mode: 'make' });
    expect(res.body.fallback).toBe(true);
    expect(res.body.text).toBeTruthy();
  });
});
