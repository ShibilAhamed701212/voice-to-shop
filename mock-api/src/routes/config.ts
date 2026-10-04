import { Router, Request, Response } from 'express';
import { HORIZON_DAYS, getCatalog } from '../services/availabilityService.js';
import { resetStore } from '../services/bookingStore.js';
import { resetSessions } from '../agent/agent.js';
import { CLAUDE_MODEL, isClaudeConfigured, resetClaudeSessions } from '../agent/claudeAgent.js';
import { TIMEZONE, today } from '../lib/time.js';

const router = Router();

/** Feature flags the frontend needs; never exposes secret values. */
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    today: today(),
    timezone: TIMEZONE,
    horizon_days: HORIZON_DAYS,
    claude_configured: isClaudeConfigured(),
    claude_model: CLAUDE_MODEL,
    make_webhook_configured: Boolean(process.env.MAKE_WEBHOOK_URL),
    elevenlabs_configured: Boolean(process.env.ELEVENLABS_API_KEY)
  });
});

/** Categories and service areas for filters. */
router.get('/meta', (_req: Request, res: Response) => {
  const catalog = getCatalog().filter(p => p.status === 'active');
  const categories = new Map<string, { name: string; count: number; min_price: number }>();
  const areas = new Map<string, { pincode: string; area: string; city: string; count: number }>();
  for (const p of catalog) {
    const c = categories.get(p.category) ?? { name: p.category, count: 0, min_price: Infinity };
    c.count += 1;
    c.min_price = Math.min(c.min_price, p.price);
    categories.set(p.category, c);
    const a = areas.get(p.location.pincode) ?? { ...p.location, count: 0 };
    a.count += 1;
    areas.set(p.location.pincode, a);
  }
  res.json({ success: true, categories: [...categories.values()], areas: [...areas.values()] });
});

/** Restores seed data. Disabled in production unless ALLOW_RESET=true. */
router.post('/admin/reset', (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_RESET !== 'true') {
    return res.status(403).json({ success: false, error: 'RESET_DISABLED' });
  }
  resetStore();
  resetSessions();
  resetClaudeSessions();
  res.json({ success: true, message: 'Demo data restored' });
});

export default router;
