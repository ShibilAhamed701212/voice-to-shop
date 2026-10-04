/**
 * Rule-based language understanding for the built-in booking agent.
 * Handles English plus common Hinglish phrasing ("kal shaam", "AC thanda nahi"),
 * and the quirks of speech-to-text output (spoken digits, "560 064").
 */
import { addDays, fromMinutes, today, weekdayOf } from '../lib/time.js';

export interface ServiceMatch {
  service: string;
  problem: string;
}

interface ServiceRule {
  service: string;
  patterns: RegExp[];
  problems: [RegExp, string][];
  fallbackProblem: string;
}

// Order matters for ties: e.g. "fridge not cooling" must beat "AC ... cooling".
const SERVICE_RULES: ServiceRule[] = [
  {
    service: 'Refrigerator Repair',
    patterns: [/\bfridge/, /refrigerator/, /freezer/],
    problems: [
      [/not cool|no cool|warm|thanda nahi/, 'Fridge not cooling'],
      [/gas|leak/, 'Gas leakage'],
      [/compressor/, 'Compressor issue'],
      [/thermostat/, 'Thermostat fault'],
      [/noise|sound/, 'Fridge making noise']
    ],
    fallbackProblem: 'Refrigerator issue'
  },
  {
    service: 'Washing Machine Repair',
    patterns: [/washing machine/, /\bwasher\b/, /\bdrum\b/, /laundry/],
    problems: [
      [/spin|drum/, 'Drum not spinning'],
      [/drain|water/, 'Drainage blockage'],
      [/motor/, 'Motor issue'],
      [/noise|sound|vibrat/, 'Machine making noise']
    ],
    fallbackProblem: 'Washing machine issue'
  },
  {
    service: 'AC Repair',
    patterns: [/\ba\.?c\b/, /air ?condition/, /\baircon/, /\bcooling\b/, /split unit/],
    problems: [
      [/not cool|no cool|isn'?t cool|warm|thanda nahi|cooling/, 'AC not cooling'],
      [/gas|refill/, 'AC gas refill'],
      [/install/, 'AC installation'],
      [/leak|drip/, 'AC water leakage'],
      [/noise|sound/, 'AC making noise'],
      [/service|maint|clean/, 'AC maintenance']
    ],
    fallbackProblem: 'AC repair'
  },
  {
    service: 'TV Repair',
    patterns: [/\btv\b/, /television/, /\bled\b/, /\bscreen\b/, /wall mount/],
    problems: [
      [/blank|black|no picture|display/, 'LED screen blank'],
      [/audio|sound/, 'Audio distortion'],
      [/mount/, 'Wall mount setup'],
      [/power|turn on|switch on/, 'TV not powering on']
    ],
    fallbackProblem: 'TV issue'
  },
  {
    service: 'Plumbing',
    patterns: [/\btaps?\b/, /leak/, /water pump/, /\bpump\b/, /\bmotor pump\b/, /\bpipes?\b/, /plumb/, /\bdrain/, /toilet/, /flush/, /\bsink\b/, /faucet/, /clog/, /\bnal\b/, /bathroom fitting/],
    problems: [
      [/pump|motor/, 'Water pump repair'],
      [/tap|faucet|nal/, 'Tap leaking'],
      [/drain|clog|block/, 'Drain blocked'],
      [/pipe/, 'Pipe leakage'],
      [/toilet|flush/, 'Toilet / flush issue'],
      [/leak/, 'Water leakage']
    ],
    fallbackProblem: 'Plumbing issue'
  },
  {
    service: 'Electrical',
    patterns: [/electric/, /wiring/, /switch/, /\bfans?\b/, /pankha/, /short circuit/, /\bpower\b/, /socket/, /\bfuse/, /\blights?\b/, /inverter/, /bijli/, /\bmcb\b/, /trip/],
    problems: [
      [/short circuit|spark/, 'Short circuit'],
      [/fan|pankha/, 'Fan repair'],
      [/switch|socket/, 'Switchboard issue'],
      [/inverter/, 'Inverter wiring'],
      [/fuse|mcb|trip|power/, 'Power trip / fuse'],
      [/light/, 'Lights not working']
    ],
    fallbackProblem: 'Electrical fault'
  },
  {
    service: 'Cleaning',
    patterns: [/clean/, /\bsofa\b/, /\bdust/, /safai/, /sanitiz/, /\bmaid\b/],
    problems: [
      [/sofa/, 'Sofa shampooing'],
      [/kitchen/, 'Kitchen deep clean'],
      [/bathroom/, 'Bathroom sanitization'],
      [/full|whole|house|home|deep/, 'Deep home cleaning']
    ],
    fallbackProblem: 'Home cleaning'
  },
  {
    service: 'Carpentry',
    patterns: [/carpent/, /\bdoors?\b/, /\block\b/, /furniture/, /cabinet/, /\bshel(f|ves)/, /hinge/, /\bwood/, /wardrobe/, /\bbed\b/],
    problems: [
      [/lock/, 'Door lock installation'],
      [/assembl|furniture|bed|wardrobe/, 'Furniture assembly'],
      [/hinge|cabinet/, 'Cabinet hinge repair'],
      [/shel/, 'Custom shelving'],
      [/door/, 'Door repair']
    ],
    fallbackProblem: 'Carpentry work'
  }
];

export const SERVICES = SERVICE_RULES.map(r => r.service);

/** "fix my motor" could be a water pump, fan or washing machine. */
export function isAmbiguousMotor(text: string): boolean {
  const t = text.toLowerCase();
  return /\bmotors?\b/.test(t) && !detectService(t.replace(/\bmotors?\b/g, ''));
}

export function detectService(text: string): ServiceMatch | null {
  const t = text.toLowerCase();
  let best: { rule: ServiceRule; score: number } | null = null;
  for (const rule of SERVICE_RULES) {
    const score = rule.patterns.filter(p => p.test(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { rule, score };
  }
  if (!best) return null;
  const problem = best.rule.problems.find(([re]) => re.test(t))?.[1] ?? best.rule.fallbackProblem;
  return { service: best.rule.service, problem };
}

// ---------- Location ----------

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9'
};

/** "five six zero zero six four" / "560 064" / "double six" -> "560064" (pincode detection only). */
function collapseDigits(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/\b(double|triple)\s+(\w+)\b/g, (m, mult, word) => {
    const d = DIGIT_WORDS[word] ?? (/^\d$/.test(word) ? word : null);
    return d ? d.repeat(mult === 'double' ? 2 : 3) : m;
  });
  t = t.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, w => DIGIT_WORDS[w]);
  return t.replace(/(\d)[\s-]+(?=\d)/g, '$1');
}

export function detectPincode(text: string): string | null {
  const m = collapseDigits(text).match(/(?<!\d)(\d{6})(?!\d)/);
  return m ? m[1] : null;
}

export interface Area {
  pincode: string;
  area: string;
}

export function detectArea(text: string, areas: Area[]): Area | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
  for (const a of areas) {
    const aliases = a.area
      .toLowerCase()
      .split('/')
      .map(s => s.trim())
      .flatMap(s => [s, s.replace(/\s+layout$/, ''), s.replace(/\s+/g, '')]);
    if (a.area.toLowerCase().includes('electronic city')) aliases.push('ecity', 'e city');
    if (aliases.some(alias => alias.length >= 3 && t.includes(` ${alias} `))) return a;
  }
  return null;
}

// ---------- Date ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAY_PATTERNS: [RegExp, number][] = [
  [/\bsun(day)?s?\b/, 0],
  [/\bmon(day)?s?\b/, 1],
  [/\btue(s|sday)?s?\b/, 2],
  [/\bwed(nesday)?s?\b/, 3],
  [/\bthu(r|rs|rsday)?s?\b/, 4],
  [/\bfri(day)?s?\b/, 5],
  [/\bsat(urday)?s?\b/, 6]
];

function resolveDayOfMonth(day: number, month: number | null, ref: string): string | null {
  const [y, m] = ref.split('-').map(Number);
  let year = y;
  let mon = month ?? m;
  const build = () => `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (day < 1 || day > 31) return null;
  let iso = build();
  if (iso < ref) {
    if (month === null) {
      mon += 1;
      if (mon > 12) { mon = 1; year += 1; }
    } else {
      year += 1;
    }
    iso = build();
  }
  // Reject impossible dates like 31 Feb.
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

export function detectDate(text: string, ref: string = today()): string | null {
  const t = text.toLowerCase();

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  if (/day after tomorrow|\bparso\b|\bparson\b/.test(t)) return addDays(ref, 2);
  if (/\b(tomorrow|tmrw|tmr|tomorow|kal)\b/.test(t)) return addDays(ref, 1);
  if (/\b(today|tonight|aaj|right now|asap|immediately|urgent(ly)?|as soon as possible)\b/.test(t)) return ref;
  if (/\bnext week\b/.test(t)) return addDays(ref, 7);
  if (/\b(this )?weekend\b/.test(t)) {
    const delta = (6 - weekdayOf(ref) + 7) % 7;
    return addDays(ref, delta);
  }

  const monthName = MONTHS.join('|');
  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthName})[a-z]*\\b`));
  if (dm) return resolveDayOfMonth(Number(dm[1]), MONTHS.indexOf(dm[2]) + 1, ref);
  const md = t.match(new RegExp(`\\b(${monthName})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (md) return resolveDayOfMonth(Number(md[2]), MONTHS.indexOf(md[1]) + 1, ref);
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) return resolveDayOfMonth(Number(slash[1]), Number(slash[2]), ref);
  // "on the 7th" / "the 7th" — but not "the 3rd one" (that's picking an option).
  const ordinal = t.match(/\b(?:on\s+(?:the\s+)?|the\s+)(\d{1,2})(?:st|nd|rd|th)\b(?!\s+(?:one|option|provider|technician|person))/);
  if (ordinal) return resolveDayOfMonth(Number(ordinal[1]), null, ref);

  for (const [re, dow] of WEEKDAY_PATTERNS) {
    if (re.test(t)) {
      let delta = (dow - weekdayOf(ref) + 7) % 7;
      if (/\bnext\s+\w*day/.test(t) && delta === 0) delta = 7;
      return addDays(ref, delta);
    }
  }
  return null;
}

// ---------- Time ----------

export interface TimeMatch {
  time: string | null;
  flexible: boolean;
}

export function detectTime(text: string): TimeMatch {
  const t = text.toLowerCase();
  const flexible = /\b(any ?time|whenever|earliest|asap|soonest|first available|as soon as possible|no preference|doesn'?t matter|any slot)\b/.test(t);

  const ampm = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3].startsWith('p')) h += 12;
    const m = Number(ampm[2] || 0);
    if (h < 24 && m < 60) return { time: fromMinutes(h * 60 + m), flexible };
  }

  const h24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const period = periodTime(t);

  const loose = t.match(/\b(?:at|around|by|after|before|about)\s+(\d{1,2})(?::(\d{2}))?(?:\s*o'?clock)?\b(?!\s*(?:st|nd|rd|th|%|rupees|rs|days?|hours?|mins?|minutes?))/) ||
    t.match(/\b(\d{1,2})\s*(?:o'?clock|baje)\b/);

  if (h24 && !loose) {
    const h = Number(h24[1]);
    const adjusted = period && period >= '12:00' && h < 12 ? h + 12 : h;
    return { time: fromMinutes(adjusted * 60 + Number(h24[2])), flexible };
  }

  if (loose) {
    let h = Number(loose[1]);
    const m = Number(loose[2] || 0);
    if (h <= 23 && m < 60) {
      if (h < 12) {
        // Use the spoken period when present ("6 baje shaam"), else assume working hours.
        if (period) {
          if (period >= '12:00') h += 12;
        } else if (h >= 1 && h <= 7) {
          h += 12;
        }
      }
      return { time: fromMinutes(h * 60 + m), flexible };
    }
  }

  if (period) return { time: period, flexible };
  return { time: null, flexible };
}

function periodTime(t: string): string | null {
  if (/\b(early morning)\b/.test(t)) return '09:00';
  if (/\b(morning|subah|savere|before noon)\b/.test(t)) return '10:00';
  if (/\b(noon|midday|lunch ?time)\b/.test(t)) return '12:00';
  if (/\b(afternoon|dopahar|dopeher)\b/.test(t)) return '15:00';
  if (/\b(evening|shaam|sham|after work|after office)\b/.test(t)) return '18:00';
  if (/\b(night|tonight|raat)\b/.test(t)) return '19:00';
  return null;
}

// ---------- Intents ----------

const has = (t: string, re: RegExp) => re.test(t.toLowerCase());

export const intents = {
  affirm: (t: string) =>
    has(t, /\b(yes|yeah|yea|yep|yup|ya|sure|ok|okay|okey|alright|confirm(ed)?|go ahead|do it|book (it|him|her|them|that|this)|please book|sounds good|perfect|great|haan|haa|han|ji|theek hai|thik hai|correct|right|absolutely|definitely|of course|fine|proceed|lock it)\b/),
  deny: (t: string) =>
    has(t, /\b(no|nope|nah|don'?t|do not|not now|wait|hold on|stop|nahi|nahin|mat|never ?mind|not that|change)\b/),
  cancelBooking: (t: string) =>
    has(t, /\bcancel\b/) && !has(t, /\bcancel that\b|\bdon'?t cancel\b/),
  reschedule: (t: string) =>
    has(t, /\b(reschedule|re-schedule|postpone|prepone|move (it|my|the)|shift (it|my|the)|change (the |my )?(booking )?(time|date|slot|day))\b/),
  reset: (t: string) =>
    has(t, /\b(start over|restart|new booking|new request|reset|begin again|another (service|booking)|book another|something else)\b/),
  help: (t: string) => has(t, /\b(help|what can you do|how does (this|it) work|what do you do)\b/),
  greeting: (t: string) => has(t, /^\s*(hi|hello|hey|hii+|namaste|namaskar|good (morning|afternoon|evening))\b/),
  thanks: (t: string) => has(t, /\b(thanks|thank you|thx|dhanyavad|shukriya)\b/),
  offTopic: (t: string) =>
    has(t, /\b(supermarket|grocery|groceries|restaurant|food|weather|news|movie|song|music|joke|cricket|score|taxi|cab|uber|flight|train|hotel|doctor|hospital|pharmacy|medicine|shopping|buy|order|recipe|stock|bitcoin)\b|\b(who|what) (is|are) (the )?(capital|president|prime minister)\b/),
  status: (t: string) =>
    has(t, /\b(my bookings?|booking status|when is (my|the) (technician|booking|appointment)|what did i book|upcoming)\b/),
  showMore: (t: string) =>
    has(t, /\b(other|more|different|another|else|alternative)\s+(options?|providers?|technicians?|ones?|choices|people|times?|slots?)\b|\bshow (me )?more\b|\bany(one|body) else\b/),
  savedAddress: (t: string) => has(t, /\b(saved|default|my|usual|registered|home) (address|location|place)\b|\buse (my|the) (address|location)\b|\bsame (address|location|place)\b/)
};

/** "first", "option 2", "the third one" -> 0-based index. */
export function detectOrdinal(text: string): number | null {
  const t = text.toLowerCase();
  if (/\b(first|1st|option (one|1)|number (one|1)|#1)\b/.test(t)) return 0;
  if (/\b(second|2nd|option (two|2)|number (two|2)|#2)\b/.test(t)) return 1;
  if (/\b(third|3rd|option (three|3)|number (three|3)|#3)\b/.test(t)) return 2;
  if (/\b(last one|the last)\b/.test(t)) return -1;
  return null;
}

export type Preference = 'cheapest' | 'best_rated' | 'fastest' | null;

export function detectPreference(text: string): Preference {
  const t = text.toLowerCase();
  if (/\b(cheapest|lowest price|least expensive|budget|cheaper|affordable|sasta)\b/.test(t)) return 'cheapest';
  if (/\b(best rated|highest rated|top rated|best one|most experienced|best reviews?|highest rating)\b/.test(t)) return 'best_rated';
  if (/\b(fastest|quickest|earliest|soonest|nearest)\b/.test(t)) return 'fastest';
  return null;
}

const GENERIC_NAME_TOKENS = new Set([
  'services', 'service', 'repairs', 'repair', 'solutions', 'experts', 'expert', 'works', 'home', 'care',
  'the', 'and', 'pro', 'pros', 'tech', 'technicians', 'kumar', 'cooling', 'electricals', 'plumbing', 'cleaning'
]);

/** Matches a spoken provider name against candidates; returns the best index or null. */
export function matchProviderName(text: string, names: string[]): number | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
  let best: { idx: number; score: number } | null = null;
  names.forEach((name, idx) => {
    const tokens = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    let score = 0;
    for (const tok of tokens) {
      if (tok.length < 3) continue;
      if (t.includes(` ${tok} `)) score += GENERIC_NAME_TOKENS.has(tok) ? 0.25 : 1;
    }
    if (t.includes(` ${tokens.join(' ')} `)) score += 2;
    if (score >= 1 && (!best || score > best.score)) best = { idx, score };
  });
  return best ? (best as { idx: number }).idx : null;
}
