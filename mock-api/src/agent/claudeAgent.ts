/**
 * Claude-powered booking agent. Claude handles the conversation; every fact
 * (providers, prices, slots, bookings) comes from tools backed by the real services.
 *
 * Safety rail enforced in code, not just the prompt: bookings, cancellations and
 * reschedules happen only via `confirm_pending_action`, which refuses to run unless a
 * proposal was shown to the user in an EARLIER turn — so the user always has to say
 * yes after seeing the exact details.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readSeed } from '../lib/store.js';
import { formatDay, formatRange, isIsoDate, isTime, today } from '../lib/time.js';
import { AvailabilityService, Provider, getCatalog } from '../services/availabilityService.js';
import { ACTIVE_STATUSES } from '../services/bookingStore.js';
import { Booking, BookingService } from '../services/bookingService.js';
import { ProviderService } from '../services/providerService.js';
import type { AgentAction, AgentResponse, AgentState, Proposal, ProviderOption, Stage } from './agent.js';

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 6;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

type Message = Anthropic.Beta.BetaMessageParam;

interface ClaudeSession {
  id: string;
  customerId: string;
  messages: Message[];
  turn: number;
  state: AgentState;
  proposal?: Proposal & { turn: number };
  updatedAt: number;
}

interface Customer {
  customer_id: string;
  name: string;
  default_location?: { pincode: string; area: string; city: string };
}

const sessions = new Map<string, ClaudeSession>();
let client: Anthropic | null = null;

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Tests inject a fake client. */
export function setClaudeClient(c: Anthropic | null): void {
  client = c;
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

export function resetClaudeSessions(): void {
  sessions.clear();
}

const CATEGORIES = [...new Set(getCatalog().map(p => p.category))];

function areas(): string {
  const seen = new Map<string, string>();
  for (const p of getCatalog()) seen.set(p.location.pincode, p.location.area);
  return [...seen].map(([pin, area]) => `${area} (${pin})`).join(', ');
}

// Stable system prompt (cacheable): no dates or per-user data here.
const SYSTEM_PROMPT = `You are VoiceFix, a friendly voice assistant that books home-service professionals in Bengaluru.

Your replies are spoken aloud by text-to-speech, so:
- Keep every reply to one or two short sentences, ideally under 25 words. Never ramble.
- No markdown, lists, emoji or symbols other than ₹. Write naturally, like a helpful person on the phone.
- The screen already shows provider cards with all details, so never read out every option. Name only your top pick (name, price, time) and ask if they want it.
- Ask for one missing thing at a time.

What you can book: ${CATEGORIES.join(', ')}.
Areas served: ${areas()}.

How to work:
- Understand the problem from natural speech, including Hinglish ("kal shaam" = tomorrow evening, "AC thanda nahi kar raha" = AC not cooling). If the request is vague (e.g. "fix my motor"), ask one short clarifying question (water pump, fan, or washing machine?).
- You need a service, a location (PIN code or area — offer the customer's saved address), and a day. Time is optional. Resolve relative dates yourself using today's date from the context message.
- Call search_providers as soon as you have service, location and day. Never invent providers, prices, ratings or slots.
- When the user picks someone (or accepts your suggestion), call propose_booking, then ask "Shall I book it?" in a few words.
- Only after the user clearly says yes in their NEXT message, call confirm_pending_action. Ambiguous answers need a quick re-check. Never claim something is booked unless the tool returned success.
- For cancellations and reschedules use list_my_bookings, then propose_cancel or propose_reschedule, then confirm_pending_action after a clear yes.
- If a slot is taken, say so briefly and offer the nearest alternative.
- Politely decline anything unrelated to home services in one sentence and steer back (e.g. "I can only help book home services — anything at home need fixing?").
- Use the customer's first name occasionally, not every turn.`;

const s = (description: string) => ({ type: 'string' as const, description });
const nullable = (description: string) => ({ type: ['string', 'null'] as ('string' | 'null')[], description });

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'search_providers',
    description: 'Find available professionals for a service, area and day. Results are also shown to the user as cards. Returns the top matches with their free slots that day.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: CATEGORIES, description: 'Service category' },
        problem: s('Short description of the issue, e.g. "AC not cooling"'),
        pincode: s('6-digit PIN code of the customer'),
        date: s('Day in YYYY-MM-DD'),
        preferred_time: nullable('Preferred start time HH:MM (24h), or null if flexible')
      },
      required: ['service', 'problem', 'pincode', 'date', 'preferred_time'],
      additionalProperties: false
    }
  },
  {
    name: 'get_provider_slots',
    description: "List one provider's free slots for a day (and the next free slots if that day is full).",
    strict: true,
    input_schema: {
      type: 'object',
      properties: { provider_id: s('Provider ID, e.g. AC001'), date: s('Day in YYYY-MM-DD') },
      required: ['provider_id', 'date'],
      additionalProperties: false
    }
  },
  {
    name: 'propose_booking',
    description: 'Prepare a booking and show the user a confirmation card. Does NOT book. Afterwards ask the user to confirm.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        provider_id: s('Provider ID'),
        date: s('Day in YYYY-MM-DD'),
        start_time: s('Slot start HH:MM (24h), must be one of the provider free slots')
      },
      required: ['provider_id', 'date', 'start_time'],
      additionalProperties: false
    }
  },
  {
    name: 'list_my_bookings',
    description: "List the customer's upcoming active bookings.",
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }
  },
  {
    name: 'propose_cancel',
    description: 'Prepare cancellation of a booking and show a confirmation card. Does NOT cancel.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { booking_id: s('Booking ID, e.g. AC2841') },
      required: ['booking_id'],
      additionalProperties: false
    }
  },
  {
    name: 'propose_reschedule',
    description: 'Prepare moving a booking to a new slot with the same provider and show a confirmation card. Does NOT move it.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { booking_id: s('Booking ID'), date: s('New day YYYY-MM-DD'), start_time: s('New slot start HH:MM') },
      required: ['booking_id', 'date', 'start_time'],
      additionalProperties: false
    }
  },
  {
    name: 'confirm_pending_action',
    description: 'Execute the booking, cancellation or reschedule that was proposed earlier. Only call after the user explicitly said yes in their latest message.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }
  }
];

function getCustomer(id: string): Customer | undefined {
  return readSeed<Customer[]>('customers.json').find(c => c.customer_id.toLowerCase() === id.toLowerCase());
}

function getSession(id: string, customerId: string): ClaudeSession {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [key, sess] of sessions) if (sess.updatedAt < cutoff) sessions.delete(key);
  let sess = sessions.get(id);
  if (!sess || sess.customerId !== customerId) {
    sess = {
      id,
      customerId,
      messages: [],
      turn: 0,
      updatedAt: Date.now(),
      state: { service: null, problem: null, pincode: null, area: null, date: null, time: null, provider_id: null, provider_name: null, price: null, booking_id: null }
    };
    sessions.set(id, sess);
  }
  sess.updatedAt = Date.now();
  return sess;
}

function contextNote(sess: ClaudeSession): string {
  const c = getCustomer(sess.customerId);
  const loc = c?.default_location;
  return `[Context — not from the user] Today is ${today()} (${formatDay(today(), '1970-01-01')}). Customer: ${c?.name ?? 'Guest'} (${sess.customerId})${loc ? `, saved address ${loc.area} ${loc.pincode}` : ''}.`;
}

/** Everything a single turn produced for the UI. */
interface TurnEffects {
  options?: ProviderOption[];
  proposal?: Proposal;
  booking?: Booking;
  error?: string;
}

function toOptions(providers: Provider[], date: string): ProviderOption[] {
  const top = providers.slice(0, 3);
  if (!top.length) return [];
  const minPrice = Math.min(...top.map(p => p.price));
  const maxRating = Math.max(...top.map(p => p.rating));
  return top.map((p, i) => {
    const slots = p.availability.filter(x => x.date === date);
    const badges = [i === 0 ? 'Recommended' : '', p.rating === maxRating ? 'Top rated' : '', p.price === minPrice ? 'Lowest price' : ''].filter(Boolean);
    const rec = p.matched_slot ?? slots.find(x => x.available)!;
    return { ...p, slots, recommended_slot: rec, badges };
  });
}

function runTool(sess: ClaudeSession, name: string, input: Record<string, any>, fx: TurnEffects): unknown {
  switch (name) {
    case 'search_providers': {
      const { service, problem, pincode, date, preferred_time } = input;
      if (!AvailabilityService.isBookableDate(date)) {
        return { error: 'DATE_OUT_OF_RANGE', bookable_from: today(), bookable_until: AvailabilityService.horizonDates().slice(-1)[0] };
      }
      const pref = isTime(preferred_time) ? preferred_time : null;
      const results = ProviderService.search({ service, problem, pincode, date, preferred_time: pref ?? undefined });
      const area = getCatalog().find(p => p.location.pincode === pincode)?.location.area ?? null;
      Object.assign(sess.state, { service, problem, pincode, area, date, time: pref });
      fx.options = toOptions(results, date);
      if (!results.length) {
        const next = ProviderService.search({ service, pincode }).find(p => p.matched_slot);
        return { results: [], next_available: next?.matched_slot ? { provider: next.name, date: next.matched_slot.date, start: next.matched_slot.start } : null };
      }
      return {
        in_customer_area: results[0].in_area !== false,
        results: results.slice(0, 3).map(p => ({
          provider_id: p.provider_id,
          name: p.name,
          price_inr: p.price,
          rating: p.rating,
          reviews: p.review_count,
          experience_years: p.experience_years,
          best_slot: p.matched_slot ? p.matched_slot.start : null,
          free_slots: p.availability.filter(x => x.available).map(x => x.start)
        })),
        more_results: Math.max(0, results.length - 3)
      };
    }
    case 'get_provider_slots': {
      const record = AvailabilityService.getRecord(input.provider_id);
      if (!record) return { error: 'PROVIDER_NOT_FOUND' };
      const free = AvailabilityService.getProviderSlots(record.provider_id, input.date).filter(x => x.available).map(x => x.start);
      return free.length
        ? { provider: record.name, date: input.date, free_slots: free }
        : { provider: record.name, date: input.date, free_slots: [], next_free: ProviderService.upcomingSlots(record.provider_id, input.date, 3) };
    }
    case 'propose_booking': {
      const provider = ProviderService.getById(input.provider_id);
      if (!provider) return { error: 'PROVIDER_NOT_FOUND' };
      const slot = AvailabilityService.findSlot(provider.provider_id, input.date, input.start_time);
      if (!slot?.available) {
        return { error: 'SLOT_UNAVAILABLE', alternatives: ProviderService.upcomingSlots(provider.provider_id, isIsoDate(input.date) ? input.date : today(), 3) };
      }
      const proposal: Proposal = {
        kind: 'booking',
        provider_id: provider.provider_id,
        provider_name: provider.name,
        service: sess.state.service || provider.category,
        date: slot.date,
        start_time: slot.start,
        end_time: slot.end,
        price: provider.price
      };
      sess.proposal = { ...proposal, turn: sess.turn };
      Object.assign(sess.state, { provider_id: provider.provider_id, provider_name: provider.name, price: provider.price, date: slot.date, time: slot.start });
      if (!sess.state.service) sess.state.service = provider.category;
      fx.proposal = proposal;
      return { proposed: true, summary: `${provider.name}, ${formatDay(slot.date)} ${formatRange(slot.start, slot.end)}, ₹${provider.price}`, next_step: 'Ask the user to confirm.' };
    }
    case 'list_my_bookings': {
      const t = today();
      const list = BookingService.getAll()
        .filter(b => b.customer_id === sess.customerId && ACTIVE_STATUSES.includes(b.status) && b.date >= t)
        .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
      return { bookings: list.map(b => ({ booking_id: b.booking_id, provider: b.provider_name, service: b.service, date: b.date, time: `${b.start_time}-${b.end_time}`, status: b.status })) };
    }
    case 'propose_cancel':
    case 'propose_reschedule': {
      const b = BookingService.getById(input.booking_id);
      if (!b || b.customer_id !== sess.customerId) return { error: 'BOOKING_NOT_FOUND' };
      if (!ACTIVE_STATUSES.includes(b.status)) return { error: 'BOOKING_NOT_ACTIVE' };
      let slot = { date: b.date, start: b.start_time, end: b.end_time };
      if (name === 'propose_reschedule') {
        const target = AvailabilityService.findSlot(b.provider_id, input.date, input.start_time, b.booking_id);
        if (!target?.available) return { error: 'SLOT_UNAVAILABLE', alternatives: ProviderService.upcomingSlots(b.provider_id, isIsoDate(input.date) ? input.date : today(), 3, b.booking_id) };
        slot = target;
      }
      const proposal: Proposal = {
        kind: name === 'propose_cancel' ? 'cancel' : 'reschedule',
        booking_id: b.booking_id,
        provider_id: b.provider_id,
        provider_name: b.provider_name,
        service: b.service,
        date: slot.date,
        start_time: slot.start,
        end_time: slot.end,
        price: b.price
      };
      sess.proposal = { ...proposal, turn: sess.turn };
      sess.state.booking_id = b.booking_id;
      fx.proposal = proposal;
      return { proposed: true, next_step: 'Ask the user to confirm.' };
    }
    case 'confirm_pending_action': {
      const p = sess.proposal;
      if (!p) return { error: 'NOTHING_TO_CONFIRM' };
      if (p.turn >= sess.turn) return { error: 'NEEDS_USER_CONFIRMATION', detail: 'The user has not seen this proposal yet. Ask them to confirm first.' };
      sess.proposal = undefined;
      if (p.kind === 'booking') {
        const r = BookingService.create({
          customer_id: sess.customerId,
          provider_id: p.provider_id,
          service: p.service,
          problem: sess.state.problem || undefined,
          date: p.date,
          start_time: p.start_time
        });
        if (!r.success || !r.booking) {
          fx.error = r.error;
          return { error: r.error, alternatives: ProviderService.upcomingSlots(p.provider_id, p.date, 3) };
        }
        fx.booking = r.booking;
        sess.state.booking_id = r.booking.booking_id;
        return { success: true, booking_id: r.booking.booking_id, when: `${formatDay(r.booking.date)} ${formatRange(r.booking.start_time, r.booking.end_time)}`, price_inr: r.booking.price };
      }
      const r = p.kind === 'cancel'
        ? BookingService.cancel(p.booking_id!, 'Cancelled by customer via voice agent')
        : BookingService.reschedule(p.booking_id!, p.date, p.start_time);
      if (!r.success || !r.booking) {
        fx.error = r.error;
        return { error: r.error };
      }
      fx.booking = r.booking;
      return { success: true, booking_id: r.booking.booking_id, status: r.booking.status };
    }
  }
  return { error: 'UNKNOWN_TOOL' };
}

/** Turns a UI tap into words Claude understands. */
function actionText(action: AgentAction | undefined, message: string): string {
  if (!action) return message;
  switch (action.type) {
    case 'select':
      return `${message || 'I choose this one'} (provider_id ${action.provider_id}, ${action.date} ${action.start_time})`;
    case 'confirm':
      return message || 'Yes, go ahead.';
    case 'decline':
      return message || 'No, not that.';
    case 'cancel_booking':
      return `Cancel my booking ${action.booking_id ?? ''}`.trim();
    case 'reschedule_booking':
      return `Reschedule my booking ${action.booking_id ?? ''}`.trim();
    default:
      return message;
  }
}

function stageFor(sess: ClaudeSession, fx: TurnEffects): Stage {
  if (sess.proposal) return sess.proposal.kind === 'booking' ? 'confirming' : sess.proposal.kind === 'cancel' ? 'confirm_cancel' : 'confirm_reschedule';
  if (fx.booking && fx.booking.status !== 'cancelled') return 'booked';
  if (fx.options?.length) return 'options';
  return 'gathering';
}

function suggestionsFor(stage: Stage): string[] {
  switch (stage) {
    case 'options':
      return ['Book the first one', 'The cheapest one', 'Any other time?'];
    case 'confirming':
    case 'confirm_cancel':
    case 'confirm_reschedule':
      return ['Yes, go ahead', 'No, change it'];
    case 'booked':
      return ['Move it to tomorrow morning', 'Cancel this booking', 'Book another service'];
    default:
      return ["My AC isn't cooling", 'Kitchen tap is leaking', 'Use my saved address'];
  }
}

async function runLoop(sess: ClaudeSession, fx: TurnEffects): Promise<string> {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' }, // conversational turns: fast and terse
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: sess.messages
    });

    if (response.stop_reason === 'refusal') {
      return "Sorry, I can't help with that. I can book home services like repairs, plumbing or cleaning.";
    }
    sess.messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    const textOut = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    if (response.stop_reason === 'pause_turn') continue;
    if (!toolUses.length) {
      return textOut;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map(t => {
      try {
        return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(runTool(sess, t.name, t.input as Record<string, any>, fx)) };
      } catch (err) {
        return { type: 'tool_result', tool_use_id: t.id, content: `Tool failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
      }
    });
    sess.messages.push({ role: 'user', content: results });
  }
  return '';
}

export async function handleClaudeMessage(input: {
  session_id?: string;
  customer_id?: string;
  message?: string;
  action?: AgentAction;
}): Promise<AgentResponse> {
  const sess = getSession(input.session_id || 'default', input.customer_id || 'C001');
  if (input.action?.type === 'reset') {
    sessions.delete(sess.id);
    return handleClaudeMessage({ ...input, action: undefined, message: input.message || 'Hi' });
  }

  sess.turn += 1;
  const text = actionText(input.action, (input.message || '').trim()) || 'Hi';
  // History is append-only so the prompt cache and thinking blocks stay valid.
  const historyLength = sess.messages.length;
  sess.messages.push({ role: 'user', content: [{ type: 'text', text: `${contextNote(sess)}\n\n${text}` }] });

  const fx: TurnEffects = {};
  let reply = '';
  try {
    reply = await runLoop(sess, fx);
  } catch (err) {
    // Drop this turn so the history never ends on an unanswered tool call; the caller falls back.
    sess.messages.splice(historyLength);
    sess.turn -= 1;
    throw err;
  }

  if (!reply) reply = fx.booking ? `Done. Your booking ID is ${fx.booking.booking_id}.` : 'Sorry, could you say that again?';

  const stage = stageFor(sess, fx);
  return {
    session_id: sess.id,
    response_type: 'voice',
    source: 'claude',
    text: reply,
    stage,
    state: { ...sess.state },
    options: fx.options ?? [],
    proposal: sess.proposal ? (({ turn: _t, ...p }) => p)(sess.proposal) : undefined,
    booking: fx.booking,
    suggestions: suggestionsFor(stage),
    error: fx.error
  };
}

