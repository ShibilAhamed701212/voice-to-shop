import { Router, Request, Response } from 'express';
import { AgentAction, handleMessage } from '../agent/agent.js';
import { handleClaudeMessage, isClaudeConfigured } from '../agent/claudeAgent.js';

const router = Router();
const MAKE_TIMEOUT_MS = 30000;

function turnInput(req: Request) {
  const { session_id, customer_id, message, action } = req.body ?? {};
  return {
    session_id: typeof session_id === 'string' ? session_id.slice(0, 100) : undefined,
    customer_id: typeof customer_id === 'string' ? customer_id.slice(0, 20) : undefined,
    message: typeof message === 'string' ? message.slice(0, 1000) : '',
    action: action && typeof action === 'object' ? (action as AgentAction) : undefined
  };
}

function localReply(req: Request) {
  return handleMessage(turnInput(req));
}

/** Make scenarios return different shapes depending on the Webhook Response module; normalise them. */
function normaliseMakeReply(raw: unknown, sessionId: string): Record<string, unknown> {
  let data = raw as Record<string, unknown>;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = { text: data };
    }
  }
  const text = data.text ?? data.reply ?? data.response ?? data.message ?? data.output;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Make scenario responded without a "text" field. Add a Webhook Response module that returns JSON with a "text" property.');
  }
  return { session_id: sessionId, response_type: 'voice', ...data, text, source: 'make' };
}

/**
 * POST /api/agent/message
 * body: { session_id, customer_id, message, action?, mode?: 'auto' | 'claude' | 'local' | 'make', language? }
 * 'auto' (default) uses Claude when ANTHROPIC_API_KEY is set, otherwise the rule-based agent.
 * In 'make' mode the turn is forwarded to MAKE_WEBHOOK_URL; if Make is unreachable
 * the built-in agent answers instead and the reply carries `fallback: true`.
 */
router.post('/agent/message', async (req: Request, res: Response) => {
  const { mode, session_id, customer_id, message, language } = req.body ?? {};
  const webhook = process.env.MAKE_WEBHOOK_URL;

  if (mode === 'local') return res.json(localReply(req));
  if (mode !== 'make') {
    if (!isClaudeConfigured()) {
      const reply = localReply(req);
      return res.json(mode === 'claude' ? { ...reply, fallback: true, notice: 'ANTHROPIC_API_KEY is not set on the server, so the offline agent answered.' } : reply);
    }
    try {
      return res.json(await handleClaudeMessage(turnInput(req)));
    } catch (err) {
      console.error('[agent] Claude failed, using offline agent:', err instanceof Error ? err.message : err);
      return res.json({ ...localReply(req), fallback: true, notice: 'The AI agent is unavailable right now, so the offline agent answered.' });
    }
  }

  if (!webhook) {
    return res.json({
      ...localReply(req),
      fallback: true,
      notice: 'MAKE_WEBHOOK_URL is not configured on the server, so the built-in agent answered.'
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAKE_TIMEOUT_MS);
  try {
    const upstream = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, customer_id, message, input_type: 'voice', language: language || 'en-IN' }),
      signal: controller.signal
    });
    const body = await upstream.text();
    if (!upstream.ok) throw new Error(`Make returned HTTP ${upstream.status}: ${body.slice(0, 200)}`);
    res.json(normaliseMakeReply(body, session_id));
  } catch (err) {
    const reason = err instanceof Error ? (err.name === 'AbortError' ? 'Make did not respond within 30 seconds' : err.message) : String(err);
    console.error('[agent] Make webhook failed, using built-in agent:', reason);
    res.json({ ...localReply(req), fallback: true, notice: `Make.com webhook failed (${reason}). The built-in agent answered instead.` });
  } finally {
    clearTimeout(timer);
  }
});

/** Legacy endpoint used by the original demo and Make docs — always the built-in agent. */
router.post('/make-simulator', (req: Request, res: Response) => {
  res.json(localReply(req));
});

export default router;
