import { NextFunction, Request, Response } from 'express';

/**
 * Small in-memory fixed-window limiter for the endpoints that call paid upstream APIs
 * (Claude, ElevenLabs, Make). Per client IP and per process, which matches the
 * single-instance deployment. Set the limit to 0 to disable it.
 */
export function rateLimit(options: { windowMs: number; max: () => number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const max = options.max();
    if (!max) return next();

    const now = Date.now();
    if (hits.size > 10_000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }
    const key = req.ip || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' });
    }
    next();
  };
}

/** Requests per minute per IP for agent and voice endpoints (RATE_LIMIT_PER_MINUTE, default 30, 0 = off). */
export function perMinuteLimit(): number {
  const raw = process.env.RATE_LIMIT_PER_MINUTE;
  if (raw === undefined || raw === '') return 30;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 30;
}
