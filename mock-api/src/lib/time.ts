/**
 * Calendar helpers. All "today" logic runs in the service's local timezone
 * (Asia/Kolkata by default) so slot availability matches what customers see.
 * Set APP_FIXED_NOW (ISO timestamp) to freeze the clock for tests and demos.
 */
export const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

export function now(): Date {
  return process.env.APP_FIXED_NOW ? new Date(process.env.APP_FIXED_NOW) : new Date();
}

function zonedParts(d: Date): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

export function today(): string {
  return zonedParts(now()).date;
}

export function minutesNow(): number {
  return zonedParts(now()).minutes;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function plusOneHour(start: string): string {
  return fromMinutes(toMinutes(start) + 60);
}

/** "18:00" -> "6 PM", "18:30" -> "6:30 PM" */
export function formatTime(t: string): string {
  const total = toMinutes(t);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** "18:00","19:00" -> "6 to 7 PM"; "11:00","12:00" -> "11 AM to 12 PM". Use joiner "and" after "between". */
export function formatRange(start: string, end: string, joiner: 'to' | 'and' = 'to'): string {
  const a = formatTime(start);
  const b = formatTime(end);
  const [aNum, aSuf] = a.split(' ');
  const [, bSuf] = b.split(' ');
  return aSuf === bSuf ? `${aNum} ${joiner} ${b}` : `${a} ${joiner} ${b}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "today", "tomorrow", or "Wednesday, 7 Oct" */
export function formatDay(iso: string, ref: string = today()): string {
  const delta = diffDays(ref, iso);
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  const [, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(iso)]}, ${d} ${MONTHS[m - 1]}`;
}
