import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import request from 'supertest';
import app from '../src/server.js';
import { resetStore } from '../src/services/bookingStore.js';
import { resetClaudeSessions, setClaudeClient } from '../src/agent/claudeAgent.js';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

/** Scripted stand-in for the Messages API: each call returns the next scripted turn. */
function fakeClient(script: Block[][]) {
  const calls: any[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: any) => {
          calls.push(structuredClone(params));
          const content = script.shift();
          if (!content) throw new Error('script exhausted');
          return { content, stop_reason: content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn' };
        }
      }
    }
  };
  return { client: client as unknown as Anthropic, calls };
}

const tool = (id: string, name: string, input: Record<string, unknown> = {}): Block => ({ type: 'tool_use', id, name, input });
const text = (t: string): Block => ({ type: 'text', text: t });
const say = (message: string, extra: Record<string, unknown> = {}) =>
  request(app).post('/api/agent/message').send({ session_id: 'claude-s1', customer_id: 'C001', message, mode: 'claude', ...extra });

describe('Claude agent (mocked API)', () => {
  beforeEach(() => {
    resetStore();
    resetClaudeSessions();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
    setClaudeClient(null);
  });

  it('searches, proposes, and books only after a later explicit yes', async () => {
    const { client, calls } = fakeClient([
      [tool('t1', 'search_providers', { service: 'AC Repair', problem: 'AC not cooling', pincode: '560064', date: '2026-09-21', preferred_time: '18:00' })],
      [text('Rahul Kumar is ₹399 at 6 PM tomorrow. Want him?')],
      [tool('t2', 'propose_booking', { provider_id: 'AC001', date: '2026-09-21', start_time: '18:00' })],
      [text('Shall I book it?')],
      [tool('t3', 'confirm_pending_action')],
      [text('Booked!')]
    ]);
    setClaudeClient(client);

    const r1 = await say("AC not cooling, 560064, tomorrow evening");
    expect(r1.body.source).toBe('claude');
    expect(r1.body.stage).toBe('options');
    expect(r1.body.options[0].name).toBe('Rahul Kumar');
    expect(r1.body.state.pincode).toBe('560064');

    const r2 = await say('Yes, Rahul');
    expect(r2.body.stage).toBe('confirming');
    expect(r2.body.proposal.provider_id).toBe('AC001');
    expect(r2.body.booking).toBeUndefined();

    const r3 = await say('Yes, book it');
    expect(r3.body.stage).toBe('booked');
    expect(r3.body.booking.status).toBe('confirmed');
    expect(r3.body.booking.start_time).toBe('18:00');

    // Request shape: model, fallbacks, strict tools, low effort.
    expect(calls[0].model).toBe('claude-opus-5-5');
    expect(calls[0].fallbacks).toBe('default');
    expect(calls[0].output_config.effort).toBe('low');
    expect(calls[0].tools.every((t: any) => t.strict === true)).toBe(true);
    // History is append-only across turns.
    expect(calls[4].messages.slice(0, calls[2].messages.length)).toEqual(calls[2].messages);
  });

  it('refuses to execute a proposal in the same turn it was made', async () => {
    const { client, calls } = fakeClient([
      [tool('t1', 'propose_booking', { provider_id: 'AC001', date: '2026-09-21', start_time: '18:00' }), tool('t2', 'confirm_pending_action')],
      [text('Shall I book it?')]
    ]);
    setClaudeClient(client);
    const r = await say('Book Rahul tomorrow at 6 pm');
    expect(r.body.booking).toBeUndefined();
    expect(r.body.stage).toBe('confirming');
    const toolResults = calls[1].messages.at(-1).content;
    expect(JSON.parse(toolResults[1].content).error).toBe('NEEDS_USER_CONFIRMATION');
  });

  it('falls back to the offline agent when the API fails', async () => {
    setClaudeClient({ beta: { messages: { create: async () => { throw new Error('boom'); } } } } as unknown as Anthropic);
    const r = await say('My AC is not cooling');
    expect(r.body.fallback).toBe(true);
    expect(r.body.source).toBe('local');
    expect(r.body.text).toContain('PIN code');
  });
});
