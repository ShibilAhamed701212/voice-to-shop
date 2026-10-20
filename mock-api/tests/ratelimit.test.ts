import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';

describe('rate limiting of paid-API endpoints', () => {
  afterEach(() => {
    process.env.RATE_LIMIT_PER_MINUTE = '0';
  });

  it('returns 429 with Retry-After once an IP exceeds RATE_LIMIT_PER_MINUTE', async () => {
    process.env.RATE_LIMIT_PER_MINUTE = '3';
    const turn = () => request(app).post('/api/agent/message').send({ mode: 'local', session_id: 'rl-test', message: 'hi' });
    for (let i = 0; i < 3; i++) expect((await turn()).status).toBe(200);

    const limited = await turn();
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    // The voice proxy shares the same budget; plain REST endpoints are not limited.
    expect((await request(app).post('/api/voice/tts').send({ text: 'hi' })).status).toBe(429);
    expect((await request(app).get('/api/providers')).status).toBe(200);
  });

  it('is off when RATE_LIMIT_PER_MINUTE is 0', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/agent/message').send({ mode: 'local', session_id: 'rl-off', message: 'hi' });
      expect(res.status).toBe(200);
    }
  });
});
