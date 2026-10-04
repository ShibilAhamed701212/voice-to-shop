import { API_BASE } from './api';
import type { AgentAction, AgentReply } from '../types';
import type { AgentMode } from './settings';

interface TurnParams {
  sessionId: string;
  customerId: string;
  message: string;
  action?: AgentAction;
  mode: AgentMode;
  customWebhook: string;
  language: string;
}

/** Accepts the built-in agent's reply or any reasonable Make.com webhook response. */
export function normaliseReply(raw: any, sessionId: string, source: AgentReply['source']): AgentReply {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = { text: data };
    }
  }
  const text = data?.text ?? data?.reply ?? data?.response ?? data?.message ?? data?.output;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('The agent replied without any text. If you use Make.com, add a Webhook Response module that returns JSON with a "text" field.');
  }
  return {
    ...data,
    session_id: data.session_id || sessionId,
    text,
    source: data.source || source,
    options: Array.isArray(data.options) ? data.options : undefined,
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : undefined
  };
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const textBody = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return textBody;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('timed out');
    if (err instanceof TypeError) throw new Error('network error');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTurn(p: TurnParams): Promise<AgentReply> {
  const local = async (mode: AgentMode) =>
    normaliseReply(
      await postJson(
        `${API_BASE}/api/agent/message`,
        { session_id: p.sessionId, customer_id: p.customerId, message: p.message, action: p.action, mode, language: p.language },
        35000
      ),
      p.sessionId,
      'local'
    );

  if (p.mode === 'make' && p.customWebhook.trim()) {
    try {
      const raw = await postJson(
        p.customWebhook.trim(),
        { session_id: p.sessionId, customer_id: p.customerId, message: p.message, input_type: 'voice', language: p.language },
        30000
      );
      return normaliseReply(raw, p.sessionId, 'make');
    } catch (err: any) {
      const reply = await local('local');
      return { ...reply, fallback: true, notice: `Your Make.com webhook failed (${err.message}). The built-in agent answered instead.` };
    }
  }

  try {
    return await local(p.mode);
  } catch (err: any) {
    throw new Error(err.message === 'network error' ? "Can't reach the VoiceFix server. Make sure the API is running." : `The agent request failed (${err.message}).`);
  }
}
