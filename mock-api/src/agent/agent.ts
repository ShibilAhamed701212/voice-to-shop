/**
 * Built-in booking agent. Mirrors the Make.com AI Agent contract
 * (make/ai-agent-prompt.md): gather missing details, search real inventory,
 * compare options, require explicit confirmation, then book atomically.
 * It never invents providers, prices or slots — everything comes from the services.
 */
import { readSeed } from '../lib/store.js';
import { addDays, formatDay, formatRange, formatTime, minutesNow, toMinutes, today } from '../lib/time.js';
import { AvailabilityService, Provider, TimeSlot, getCatalog } from '../services/availabilityService.js';
import { ACTIVE_STATUSES } from '../services/bookingStore.js';
import { Booking, BookingService } from '../services/bookingService.js';
import { ProviderService, nearestSlot } from '../services/providerService.js';
import * as nlu from './nlu.js';

export type Stage =
  | 'gathering'
  | 'options'
  | 'confirming'
  | 'booked'
  | 'confirm_cancel'
  | 'reschedule_ask'
  | 'confirm_reschedule';

export interface AgentState {
  service: string | null;
  problem: string | null;
  pincode: string | null;
  area: string | null;
  date: string | null;
  time: string | null;
  provider_id: string | null;
  provider_name: string | null;
  price: number | null;
  booking_id: string | null;
}

export interface AgentAction {
  type: 'select' | 'confirm' | 'decline' | 'cancel_booking' | 'reschedule_booking' | 'reset';
  provider_id?: string;
  date?: string;
  start_time?: string;
  booking_id?: string;
}

export interface ProviderOption extends Provider {
  slots: TimeSlot[];
  recommended_slot: TimeSlot;
  badges: string[];
}

export interface Proposal {
  kind: 'booking' | 'reschedule' | 'cancel';
  provider_id: string;
  provider_name: string;
  service: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  booking_id?: string;
}

export interface AgentResponse {
  session_id: string;
  response_type: 'voice';
  source: 'local' | 'claude';
  text: string;
  stage: Stage;
  state: AgentState;
  options: ProviderOption[];
  proposal?: Proposal;
  booking?: Booking;
  suggestions: string[];
  error?: string;
}

interface Session {
  id: string;
  customer_id: string;
  stage: Stage;
  state: AgentState;
  awaiting: 'service' | 'pincode' | 'date' | null;
  lastOffTopic?: boolean;
  results: Provider[];
  page: number;
  options: ProviderOption[];
  proposal?: Proposal;
  updatedAt: number;
}

interface Customer {
  customer_id: string;
  name: string;
  default_location?: { pincode: string; area: string; city: string };
}

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 3;
const sessions = new Map<string, Session>();

const SERVICE_NOUNS: Record<string, [string, string]> = {
  'AC Repair': ['AC technician', 'AC technicians'],
  Plumbing: ['plumber', 'plumbers'],
  Electrical: ['electrician', 'electricians'],
  Cleaning: ['cleaning team', 'cleaning teams'],
  'Washing Machine Repair': ['washing machine technician', 'washing machine technicians'],
  'Refrigerator Repair': ['refrigerator technician', 'refrigerator technicians'],
  'TV Repair': ['TV technician', 'TV technicians'],
  Carpentry: ['carpenter', 'carpenters']
};

/** Lowercases for mid-sentence use but keeps acronyms: "AC not cooling" stays, "Tap leaking" -> "tap leaking". */
function phrase(text: string): string {
  return /^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

function noun(service: string | null, plural = false): string {
  const pair = (service && SERVICE_NOUNS[service]) || ['technician', 'technicians'];
  return plural ? pair[1] : pair[0];
}

let customersCache: Customer[] | null = null;
function getCustomer(id: string): Customer | undefined {
  if (!customersCache) customersCache = readSeed<Customer[]>('customers.json');
  return customersCache.find(c => c.customer_id.toLowerCase() === id.toLowerCase());
}

function servedAreas(): nlu.Area[] {
  const seen = new Map<string, nlu.Area>();
  for (const p of getCatalog()) seen.set(p.location.pincode, { pincode: p.location.pincode, area: p.location.area });
  return [...seen.values()];
}

function emptyState(): AgentState {
  return {
    service: null, problem: null, pincode: null, area: null, date: null, time: null,
    provider_id: null, provider_name: null, price: null, booking_id: null
  };
}

function getSession(id: string, customerId: string): Session {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [key, s] of sessions) if (s.updatedAt < cutoff) sessions.delete(key);

  let s = sessions.get(id);
  if (!s) {
    s = { id, customer_id: customerId, stage: 'gathering', state: emptyState(), awaiting: null, results: [], page: 0, options: [], updatedAt: Date.now() };
    sessions.set(id, s);
  }
  s.customer_id = customerId || s.customer_id;
  s.updatedAt = Date.now();
  return s;
}

export function resetSessions(): void {
  sessions.clear();
}

function startNewRequest(s: Session, keepLocation = true): void {
  const { pincode, area, booking_id } = s.state;
  s.state = emptyState();
  if (keepLocation) Object.assign(s.state, { pincode, area });
  s.state.booking_id = booking_id;
  s.stage = 'gathering';
  s.awaiting = null;
  s.results = [];
  s.page = 0;
  s.options = [];
  s.proposal = undefined;
}

function respond(s: Session, text: string, extra: Partial<AgentResponse> = {}): AgentResponse {
  return {
    session_id: s.id,
    response_type: 'voice',
    source: 'local',
    text,
    stage: s.stage,
    state: { ...s.state },
    options: extra.options ?? (s.stage === 'options' || s.stage === 'confirming' ? s.options : []),
    proposal: s.proposal,
    suggestions: extra.suggestions ?? suggestionsFor(s),
    ...extra
  };
}

function suggestionsFor(s: Session): string[] {
  switch (s.stage) {
    case 'options':
      return ['Book the first one', 'The cheapest one', 'Show other options', 'Make it tomorrow morning'];
    case 'confirming':
      return ['Yes, book it', 'No, show other options'];
    case 'confirm_cancel':
    case 'confirm_reschedule':
      return ['Yes, go ahead', 'No, keep it as is'];
    case 'reschedule_ask':
      return ['Tomorrow morning', 'Day after tomorrow evening', 'This weekend'];
    case 'booked':
      return ['Reschedule to the day after', 'Cancel this booking', 'Book another service'];
    default:
      if (s.awaiting === 'pincode') {
        const c = getCustomer(s.customer_id);
        return [c?.default_location ? 'Use my saved address' : '560064', 'Koramangala', '560076'];
      }
      if (s.awaiting === 'date') return ['Today', 'Tomorrow evening', 'This weekend', 'As soon as possible'];
      return ["My AC isn't cooling", 'Kitchen tap is leaking', 'Need a deep home cleaning', 'Fan stopped working'];
  }
}

// ---------- Entry point ----------

export function handleMessage(input: {
  session_id?: string;
  customer_id?: string;
  message?: string;
  action?: AgentAction;
}): AgentResponse {
  const s = getSession(input.session_id || 'default', input.customer_id || 'C001');
  const text = (input.message || '').trim();

  if (input.action) {
    const handled = handleAction(s, input.action, text);
    if (handled) return handled;
  }

  if (!text) return respond(s, repromptFor(s));

  if (nlu.intents.reset(text)) {
    startNewRequest(s);
    if (!nlu.detectService(text)) return respond(s, 'Sure, what else needs fixing?');
  }

  if (nlu.intents.help(text) && !nlu.detectService(text)) {
    return respond(s, "Tell me what needs fixing, your area, and when — I'll find a pro and book only after you say yes.");
  }

  switch (s.stage) {
    case 'confirming':
      return onConfirming(s, text);
    case 'confirm_cancel':
      return onConfirmCancel(s, text);
    case 'reschedule_ask':
    case 'confirm_reschedule':
      return onReschedule(s, text);
    case 'booked':
      return onBooked(s, text);
    case 'options':
      return onOptions(s, text);
    default:
      return onGathering(s, text);
  }
}

function handleAction(s: Session, action: AgentAction, text: string): AgentResponse | null {
  switch (action.type) {
    case 'reset':
      startNewRequest(s, false);
      return respond(s, 'New session started. What can I help you fix today?');
    case 'select': {
      if (!action.provider_id) return null;
      const provider = ProviderService.getById(action.provider_id);
      if (!provider) return respond(s, "I couldn't find that provider. Please pick one of the options shown.");
      const date = action.date || s.state.date || today();
      const slots = AvailabilityService.getProviderSlots(provider.provider_id, date);
      const slot = slots.find(x => x.start === action.start_time && x.available) || nearestSlot(slots, action.start_time || s.state.time || undefined);
      if (!slot) return respond(s, `${provider.name} has no free slots ${formatDay(date)}. Please choose another option.`);
      if (!s.state.service) s.state.service = provider.category;
      return propose(s, provider, slot);
    }
    case 'confirm':
      if (s.stage === 'confirming') return executeBooking(s);
      if (s.stage === 'confirm_cancel') return executeCancel(s);
      if (s.stage === 'confirm_reschedule') return executeReschedule(s);
      return null;
    case 'decline':
      if (s.stage === 'confirming') return backToOptions(s, "No problem, I won't book that.");
      if (s.stage === 'confirm_cancel' || s.stage === 'confirm_reschedule') return keepBooking(s);
      return null;
    case 'cancel_booking': {
      const booking = action.booking_id ? BookingService.getById(action.booking_id) : findTargetBooking(s);
      return proposeCancel(s, booking);
    }
    case 'reschedule_booking': {
      const booking = action.booking_id ? BookingService.getById(action.booking_id) : findTargetBooking(s);
      if (!booking) return respond(s, "I couldn't find an active booking to reschedule.");
      s.state.booking_id = booking.booking_id;
      if (action.date) return proposeReschedule(s, booking, action.date, action.start_time || booking.start_time);
      return onReschedule(s, text || 'reschedule');
    }
  }
  return null;
}

function repromptFor(s: Session): string {
  switch (s.stage) {
    case 'confirming':
      return `Should I book ${s.proposal?.provider_name}? Yes or no?`;
    case 'options':
      return 'Which one? Say a name, "the first one", or "the cheapest".';
    default:
      return askNext(s);
  }
}

// ---------- Gathering ----------

function onGathering(s: Session, text: string): AgentResponse {
  const wantsCancel = nlu.intents.cancelBooking(text);
  const wantsReschedule = nlu.intents.reschedule(text);
  if ((wantsCancel || wantsReschedule) && !nlu.detectService(text)) {
    const booking = findTargetBooking(s);
    if (booking) {
      if (wantsCancel) return proposeCancel(s, booking);
      s.state.booking_id = booking.booking_id;
      return onReschedule(s, text);
    }
    if (wantsCancel && (s.state.service || s.state.date)) {
      startNewRequest(s);
      return respond(s, "Okay, dropped that. Anything else?");
    }
    return respond(s, "You don't have any upcoming bookings. Want to book something?");
  }

  if (nlu.intents.status(text) && !nlu.detectService(text)) return describeBookings(s);

  const unsupported = mergeEntities(s, text);
  if (unsupported) return unsupported;

  if (!s.state.service) {
    if (nlu.isAmbiguousMotor(text)) {
      s.awaiting = 'service';
      return respond(s, 'Which motor — a water pump, a fan, or a washing machine?', { suggestions: ['Water pump', 'Ceiling fan', 'Washing machine'] });
    }
    if (nlu.intents.offTopic(text) || (s.awaiting === 'service' && !nlu.intents.greeting(text) && !nlu.intents.thanks(text) && text.split(/\s+/).length > 3)) {
      const again = s.lastOffTopic;
      s.lastOffTopic = true;
      s.awaiting = 'service';
      return respond(s, again
        ? 'That one’s outside what I do. Anything at home that needs a repair or cleaning?'
        : 'Sorry, I can only book home services like repairs, plumbing and cleaning. Anything need fixing?');
    }
    if (nlu.intents.greeting(text) || nlu.intents.thanks(text)) {
      const name = getCustomer(s.customer_id)?.name.split(' ')[0];
      s.awaiting = 'service';
      return respond(s, `Hi${name ? ` ${name}` : ''}! What needs fixing at home?`);
    }
  }
  return advance(s);
}

/** Pulls every entity out of the utterance into session state. Returns a response if the location is unsupported. */
function mergeEntities(s: Session, text: string): AgentResponse | null {
  const svc = nlu.detectService(text);
  if (svc) {
    s.state.service = svc.service;
    s.state.problem = svc.problem;
  }

  const areas = servedAreas();
  const pin = nlu.detectPincode(text);
  if (pin) {
    const area = areas.find(a => a.pincode === pin);
    if (!area) {
      s.awaiting = 'pincode';
      const examples = areas.slice(0, 4).map(a => `${a.area.split(' / ')[0]} (${a.pincode})`).join(', ');
      return respond(s, `Sorry, we don't have professionals in ${pin.split('').join(' ')} yet. We currently cover Bengaluru — areas like ${examples}. Which area are you in?`);
    }
    s.state.pincode = area.pincode;
    s.state.area = area.area;
  } else {
    const area = nlu.detectArea(text, areas);
    if (area) {
      s.state.pincode = area.pincode;
      s.state.area = area.area;
    } else if (s.awaiting === 'pincode' && (nlu.intents.savedAddress(text) || nlu.intents.affirm(text))) {
      const loc = getCustomer(s.customer_id)?.default_location;
      if (loc) {
        s.state.pincode = loc.pincode;
        s.state.area = loc.area;
      }
    }
  }

  const date = nlu.detectDate(text);
  const { time, flexible } = nlu.detectTime(text);
  if (date) s.state.date = date;
  if (time) s.state.time = time;
  if (flexible && !time) s.state.time = null;
  if (flexible && !date && !s.state.date) s.state.date = today();
  if (time && !date && !s.state.date) {
    // A time with no day: today if there's still enough lead time, otherwise tomorrow.
    s.state.date = toMinutes(time) > minutesNow() + 60 ? today() : addDays(today(), 1);
  }
  return null;
}

function askNext(s: Session): string {
  const { service, problem, pincode, date } = s.state;
  if (!service) {
    const repeat = s.awaiting === 'service';
    s.awaiting = 'service';
    return repeat
      ? 'Sorry, I didn’t catch the problem. Is it AC, plumbing, electrical, cleaning, carpentry, or an appliance?'
      : 'What needs fixing? For example AC, plumbing, electrical, cleaning or an appliance.';
  }
  if (!pincode) {
    s.awaiting = 'pincode';
    const loc = getCustomer(s.customer_id)?.default_location;
    const lead = problem ? `Got it, ${phrase(problem)}.` : 'Sure.';
    const saved = loc ? ` Or should I use your ${loc.area.split(' / ')[0]} address?` : '';
    return `${lead} What's your PIN code or area?${saved}`;
  }
  if (!date) {
    s.awaiting = 'date';
    return `When should the ${noun(service)} come — today, tomorrow, or another day?`;
  }
  s.awaiting = null;
  return '';
}

function advance(s: Session): AgentResponse {
  const question = askNext(s);
  if (question) return respond(s, question);

  if (!AvailabilityService.isBookableDate(s.state.date!)) {
    const last = AvailabilityService.horizonDates().slice(-1)[0];
    const past = s.state.date! < today();
    s.state.date = null;
    s.awaiting = 'date';
    return respond(s, past
      ? "That date has already passed. Which day would you like instead?"
      : `I can only book up to two weeks ahead, until ${formatDay(last)}. Which day works for you?`);
  }
  return runSearch(s);
}

// ---------- Search & options ----------

function runSearch(s: Session, prefix = ''): AgentResponse {
  const { service, problem, pincode, time } = s.state;
  const requested = s.state.date!;
  const dates = AvailabilityService.horizonDates().filter(d => d >= requested);

  let results: Provider[] = [];
  let date = requested;
  for (const d of dates) {
    results = ProviderService.search({ service: service!, problem: problem || undefined, pincode: pincode || undefined, date: d, preferred_time: time || undefined });
    if (results.length) {
      date = d;
      break;
    }
  }

  if (!results.length) {
    s.stage = 'gathering';
    s.state.date = null;
    s.awaiting = 'date';
    return respond(s, `${prefix}I'm sorry, there are no ${noun(service, true)} available in the next two weeks${s.state.area ? ` around ${s.state.area}` : ''}. Would you like to try a different area?`);
  }

  s.state.date = date;
  s.results = results;
  s.page = 0;
  s.stage = 'options';
  s.awaiting = null;
  s.proposal = undefined;
  s.state.provider_id = null;
  s.state.provider_name = null;
  s.state.price = null;

  let lead = prefix;
  if (date !== requested) lead += `Nobody's free ${formatDay(requested)}. `;
  if (results[0].in_area === false) lead += `No ${noun(s.state.service, true)} in ${s.state.area?.split(' / ')[0] ?? s.state.pincode} itself, so these are the nearest options. `;
  return presentPage(s, lead);
}

function buildOptions(s: Session, providers: Provider[]): ProviderOption[] {
  const date = s.state.date!;
  const minPrice = Math.min(...providers.map(p => p.price));
  const maxRating = Math.max(...providers.map(p => p.rating));
  const minEta = Math.min(...providers.map(p => p.eta_minutes));
  return providers.map((p, i) => {
    const slots = p.availability.filter(x => x.date === date);
    const badges: string[] = [];
    if (i === 0 && s.page === 0) badges.push('Recommended');
    if (p.rating === maxRating) badges.push('Top rated');
    if (p.price === minPrice) badges.push('Lowest price');
    if (p.eta_minutes === minEta && providers.length > 1) badges.push('Fastest arrival');
    return { ...p, slots, recommended_slot: p.matched_slot ?? slots.find(x => x.available)!, badges };
  });
}

function presentPage(s: Session, lead = ''): AgentResponse {
  const page = s.results.slice(s.page * PAGE_SIZE, s.page * PAGE_SIZE + PAGE_SIZE);
  s.options = buildOptions(s, page);
  const day = formatDay(s.state.date!);
  const where = s.state.area && s.options[0]?.in_area !== false ? ` near ${s.state.area.split(' / ')[0]}` : '';
  const count = s.options.length;

  const top = s.options[0];
  const reasons: string[] = [];
  if (count > 1 && s.state.time && top.recommended_slot.start === s.state.time) reasons.push('matches your preferred time');
  if (count > 1 && top.badges.includes('Top rated')) reasons.push('has the highest rating');
  if (count > 1 && top.badges.includes('Lowest price')) reasons.push('is the most affordable');
  const why = count > 1 && reasons.length ? ` — ${reasons[0].replace(/^(has|is|matches) /, m => ({ 'has ': '', 'is ': '', 'matches ': 'matches ' })[m]!)}` : '';

  // Spoken aloud: name only the top pick; the cards show the rest.
  const intro = s.page === 0
    ? `I found ${count === 1 ? 'one' : count} ${noun(s.state.service, count !== 1)}${where} for ${day}.`
    : `${count} more options for ${day}.`;
  const pick = `${top.name}, ₹${top.price}, rated ${top.rating}, at ${formatTime(top.recommended_slot.start)}`;
  const close = count === 1 ? `${pick}. Book it?` : `Best pick: ${pick}${why}. Want them?`;
  const text = `${lead}${intro} ${close}`;
  return respond(s, text.trim());
}

function onOptions(s: Session, text: string): AgentResponse {
  const svc = nlu.detectService(text);
  if (svc && svc.service !== s.state.service) {
    startNewRequest(s);
    mergeEntities(s, text);
    return advance(s);
  }

  if (nlu.intents.cancelBooking(text) && !/\bbooking\b/i.test(text)) {
    startNewRequest(s);
    return respond(s, "Okay, I've dropped that search. What else can I help with?");
  }

  const names = s.options.map(o => o.name);
  const byName = nlu.matchProviderName(text, names);
  const ordinal = nlu.detectOrdinal(text);
  const pref = nlu.detectPreference(text);
  const { time } = nlu.detectTime(text);
  const pin = nlu.detectPincode(text) || nlu.detectArea(text, servedAreas())?.pincode;
  const date = nlu.detectDate(text);

  // Changing where/when means a fresh search.
  if ((pin && pin !== s.state.pincode) || (date && date !== s.state.date && byName === null)) {
    const unsupported = mergeEntities(s, text);
    if (unsupported) return unsupported;
    return advance(s);
  }

  let pick: ProviderOption | undefined;
  if (byName !== null) pick = s.options[byName];
  else if (ordinal !== null) pick = s.options.at(ordinal);
  else if (pref === 'cheapest') pick = [...s.options].sort((a, b) => a.price - b.price)[0];
  else if (pref === 'best_rated') pick = [...s.options].sort((a, b) => b.rating - a.rating)[0];
  else if (pref === 'fastest') pick = [...s.options].sort((a, b) => toMinutes(a.recommended_slot.start) - toMinutes(b.recommended_slot.start) || a.eta_minutes - b.eta_minutes)[0];

  if (!pick && time) {
    pick = s.options.find(o => o.slots.some(x => x.start === time && x.available));
    if (!pick) {
      s.state.time = time;
      return runSearch(s, `Let me look for ${formatTime(time)} instead. `);
    }
  }

  if (!pick && nlu.intents.showMore(text)) {
    if ((s.page + 1) * PAGE_SIZE < s.results.length) {
      s.page += 1;
      return presentPage(s);
    }
    return respond(s, `That's everyone free ${formatDay(s.state.date!)}. Try another day or time?`, {
      suggestions: ['Check tomorrow', 'Try the morning', 'Book the first one']
    });
  }

  if (!pick && nlu.intents.affirm(text) && !nlu.intents.deny(text)) pick = s.options[0];

  if (pick) {
    const slot = (time && pick.slots.find(x => x.start === time && x.available)) || pick.recommended_slot;
    return propose(s, pick, slot);
  }

  if (nlu.intents.deny(text)) {
    return respond(s, 'No problem. Would you like a different day or time, or should I show more options?', {
      suggestions: ['Show other options', 'Try tomorrow morning', 'Start over']
    });
  }

  if (nlu.intents.offTopic(text)) return respond(s, `I can only help with home services. Want ${s.options[0].name}, or another option?`);
  return respond(s, 'Which one? Say a name, "the first one", or tap a time.');
}

function propose(s: Session, provider: Provider, slot: TimeSlot): AgentResponse {
  s.stage = 'confirming';
  s.state.date = slot.date;
  s.state.time = slot.start;
  s.state.provider_id = provider.provider_id;
  s.state.provider_name = provider.name;
  s.state.price = provider.price;
  s.proposal = {
    kind: 'booking',
    provider_id: provider.provider_id,
    provider_name: provider.name,
    service: s.state.service || provider.category,
    date: slot.date,
    start_time: slot.start,
    end_time: slot.end,
    price: provider.price
  };
  if (!s.options.some(o => o.provider_id === provider.provider_id)) {
    s.options = [{ ...provider, slots: AvailabilityService.getProviderSlots(provider.provider_id, slot.date), recommended_slot: slot, badges: [] }];
  }
  return respond(s, `${provider.name}, ${formatDay(slot.date)} ${formatRange(slot.start, slot.end)}, ₹${provider.price}. Shall I book it?`);
}

function backToOptions(s: Session, lead: string): AgentResponse {
  s.proposal = undefined;
  s.state.provider_id = null;
  s.state.provider_name = null;
  s.state.price = null;
  if (!s.results.length) {
    s.stage = 'gathering';
    return respond(s, `${lead} What would you like to do instead?`);
  }
  s.stage = 'options';
  return respond(s, `${lead} Pick another option, or tell me a different day or time.`);
}

function onConfirming(s: Session, text: string): AgentResponse {
  const p = s.proposal!;
  const { time } = nlu.detectTime(text);
  const date = nlu.detectDate(text);
  const byName = nlu.matchProviderName(text, s.options.map(o => o.name));
  const ordinal = nlu.detectOrdinal(text);
  const otherPick = byName !== null ? s.options[byName] : ordinal !== null ? s.options.at(ordinal) : undefined;

  if (otherPick && otherPick.provider_id !== p.provider_id) {
    const slot = (time && otherPick.slots.find(x => x.start === time && x.available)) || otherPick.recommended_slot;
    return propose(s, otherPick, slot);
  }

  if (time || date) {
    const targetDate = date || p.date;
    const slots = AvailabilityService.getProviderSlots(p.provider_id, targetDate);
    const exact = slots.find(x => x.start === (time || p.start_time) && x.available);
    const provider = ProviderService.getById(p.provider_id)!;
    if (exact) return propose(s, provider, exact);
    const near = nearestSlot(slots, time || p.start_time);
    if (near) {
      const r = propose(s, provider, near);
      r.text = `${p.provider_name} isn't free at ${formatTime(time || p.start_time)}${date ? ` ${formatDay(targetDate)}` : ''}. The closest slot is ${formatRange(near.start, near.end)}. ${r.text}`;
      return r;
    }
    s.state.date = targetDate;
    if (time) s.state.time = time;
    return runSearch(s, `${p.provider_name} has no free slots ${formatDay(targetDate)}. `);
  }

  if (nlu.intents.deny(text) || nlu.intents.showMore(text)) return backToOptions(s, "No problem, I won't book that.");
  if (nlu.intents.affirm(text)) return executeBooking(s);

  return respond(s, `Should I book ${p.provider_name}? Just say yes or no.`);
}

function executeBooking(s: Session): AgentResponse {
  const p = s.proposal!;
  const result = BookingService.create({
    customer_id: s.customer_id,
    provider_id: p.provider_id,
    service: s.state.service || p.service,
    problem: s.state.problem || undefined,
    date: p.date,
    start_time: p.start_time
  });

  if (!result.success || !result.booking) {
    if (result.error === 'SLOT_UNAVAILABLE') {
      s.state.time = p.start_time;
      const r = runSearch(s, "I'm sorry, that slot was just taken by another customer. ");
      return { ...r, error: 'SLOT_UNAVAILABLE' };
    }
    return respond(s, "I'm unable to complete the booking right now — the booking system returned an error. Please try again in a moment.", { error: result.error });
  }

  const b = result.booking;
  s.stage = 'booked';
  s.proposal = undefined;
  s.state.booking_id = b.booking_id;
  s.options = [];
  s.results = [];
  return respond(
    s,
    `Booked! ${b.provider_name} arrives ${formatDay(b.date)} between ${formatRange(b.start_time, b.end_time, 'and')}, ₹${b.price}. Your booking ID is ${b.booking_id}.`,
    { booking: b }
  );
}

// ---------- Existing bookings ----------

function upcomingBookings(customerId: string): Booking[] {
  const t = today();
  return BookingService.getAll()
    .filter(b => b.customer_id.toLowerCase() === customerId.toLowerCase() && ACTIVE_STATUSES.includes(b.status) && b.date >= t)
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}

function findTargetBooking(s: Session): Booking | undefined {
  if (s.state.booking_id) {
    const b = BookingService.getById(s.state.booking_id);
    if (b && ACTIVE_STATUSES.includes(b.status)) return b;
  }
  return upcomingBookings(s.customer_id)[0];
}

function describeBookings(s: Session): AgentResponse {
  const list = upcomingBookings(s.customer_id);
  if (!list.length) return respond(s, "You don't have any upcoming bookings. What can I book for you?");
  const lines = list.slice(0, 3).map(b => `${b.provider_name} for ${phrase(b.service)} ${formatDay(b.date)} from ${formatRange(b.start_time, b.end_time)}, booking ${b.booking_id}`);
  return respond(s, `You have ${list.length} upcoming booking${list.length > 1 ? 's' : ''}: ${lines.join('; ')}.`);
}

function onBooked(s: Session, text: string): AgentResponse {
  if (nlu.intents.cancelBooking(text)) return proposeCancel(s, findTargetBooking(s));
  if (nlu.intents.reschedule(text)) return onReschedule(s, text);
  if (nlu.intents.status(text)) return describeBookings(s);

  if (nlu.detectService(text)) {
    startNewRequest(s);
    mergeEntities(s, text);
    return advance(s);
  }
  if (nlu.intents.thanks(text)) return respond(s, "You're welcome! Anything else?");
  if (nlu.intents.deny(text)) return respond(s, 'Alright. Have a great day!');

  const b = s.state.booking_id ? BookingService.getById(s.state.booking_id) : undefined;
  const summary = b ? `You're booked with ${b.provider_name} ${formatDay(b.date)}, ${formatRange(b.start_time, b.end_time)}. ` : '';
  return respond(s, `${summary}Anything else?`);
}

function proposeCancel(s: Session, booking: Booking | undefined): AgentResponse {
  if (!booking || !ACTIVE_STATUSES.includes(booking.status)) {
    return respond(s, "I couldn't find an active booking to cancel.");
  }
  s.state.booking_id = booking.booking_id;
  s.stage = 'confirm_cancel';
  s.proposal = {
    kind: 'cancel',
    booking_id: booking.booking_id,
    provider_id: booking.provider_id,
    provider_name: booking.provider_name,
    service: booking.service,
    date: booking.date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    price: booking.price
  };
  return respond(s, `Cancel your ${booking.provider_name} visit ${formatDay(booking.date)} at ${formatTime(booking.start_time)}?`);
}

function onConfirmCancel(s: Session, text: string): AgentResponse {
  if (nlu.intents.affirm(text) && !nlu.intents.deny(text)) return executeCancel(s);
  if (nlu.intents.deny(text)) return keepBooking(s);
  return respond(s, `Should I cancel booking ${s.proposal?.booking_id}? Please say yes or no.`);
}

function executeCancel(s: Session): AgentResponse {
  const id = s.proposal!.booking_id!;
  const result = BookingService.cancel(id, 'Cancelled by customer via voice agent');
  s.proposal = undefined;
  if (!result.success) {
    s.stage = 'booked';
    return respond(s, `I couldn't cancel ${id}: ${result.error === 'ALREADY_CANCELLED' ? 'it was already cancelled' : 'it is no longer active'}.`, { error: result.error });
  }
  startNewRequest(s);
  s.state.booking_id = null;
  return respond(s, `Done, booking ${id} is cancelled. Anything else?`, { booking: result.booking });
}

function keepBooking(s: Session): AgentResponse {
  s.proposal = undefined;
  s.stage = 'booked';
  return respond(s, 'Okay, no changes made. Anything else?');
}

function onReschedule(s: Session, text: string): AgentResponse {
  const booking = findTargetBooking(s);
  if (!booking) {
    s.stage = 'gathering';
    return respond(s, "I couldn't find an active booking to reschedule.");
  }
  s.state.booking_id = booking.booking_id;

  if (s.stage === 'confirm_reschedule') {
    const date = nlu.detectDate(text);
    const { time } = nlu.detectTime(text);
    if (!date && !time) {
      if (nlu.intents.affirm(text) && !nlu.intents.deny(text)) return executeReschedule(s);
      if (nlu.intents.deny(text)) return keepBooking(s);
    }
  }

  const date = nlu.detectDate(text);
  const { time } = nlu.detectTime(text);
  if (!date && !time) {
    s.stage = 'reschedule_ask';
    s.proposal = undefined;
    return respond(s, `Sure, when should ${booking.provider_name} come instead?`);
  }
  return proposeReschedule(s, booking, date || booking.date, time || booking.start_time);
}

function proposeReschedule(s: Session, booking: Booking, date: string, time: string): AgentResponse {
  if (!AvailabilityService.isBookableDate(date)) {
    s.stage = 'reschedule_ask';
    return respond(s, 'I can only move bookings to a date within the next two weeks. Which day works?');
  }
  const slots = AvailabilityService.getProviderSlots(booking.provider_id, date, booking.booking_id);
  let slot = slots.find(x => x.start === time && x.available) || nearestSlot(slots, time);
  let lead = '';
  if (!slot) {
    slot = ProviderService.upcomingSlots(booking.provider_id, date, 1, booking.booking_id)[0];
    if (!slot) {
      s.stage = 'reschedule_ask';
      return respond(s, `${booking.provider_name} has no free slots from ${formatDay(date)} onwards. Would you like to cancel and book someone else instead?`);
    }
    lead = `${booking.provider_name} is fully booked ${formatDay(date)}. The next free slot is`;
  } else if (slot.start !== time) {
    lead = `${booking.provider_name} isn't free at ${formatTime(time)}. The closest slot is`;
  }
  if (slot.date === booking.date && slot.start === booking.start_time) {
    s.stage = 'booked';
    return respond(s, `Your booking is already ${formatDay(slot.date)} from ${formatRange(slot.start, slot.end)}. Would you like a different time?`);
  }

  s.stage = 'confirm_reschedule';
  s.proposal = {
    kind: 'reschedule',
    booking_id: booking.booking_id,
    provider_id: booking.provider_id,
    provider_name: booking.provider_name,
    service: booking.service,
    date: slot.date,
    start_time: slot.start,
    end_time: slot.end,
    price: booking.price
  };
  const offer = lead || `${booking.provider_name} is available`;
  return respond(s, `${offer} ${formatDay(slot.date)} ${formatRange(slot.start, slot.end)}. Move it there?`);
}

function executeReschedule(s: Session): AgentResponse {
  const p = s.proposal!;
  const result = BookingService.reschedule(p.booking_id!, p.date, p.start_time);
  s.proposal = undefined;
  if (!result.success || !result.booking) {
    s.stage = 'reschedule_ask';
    return respond(s, 'Sorry, that slot was just taken. Which other day or time would work?', { error: result.error });
  }
  s.stage = 'booked';
  const b = result.booking;
  return respond(s, `Done, moved to ${formatDay(b.date)} ${formatRange(b.start_time, b.end_time)}.`, { booking: b });
}
