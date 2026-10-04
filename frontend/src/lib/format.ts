let referenceToday: string | null = null;

/** Use the server's "today" so relative labels match the agent's wording. */
export function setReferenceToday(iso: string) {
  referenceToday = iso;
}

export function localToday(): string {
  if (referenceToday) return referenceToday;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function formatTime(t: string): string {
  const [h24, m] = t.split(':').map(Number);
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${suffix}` : `${h} ${suffix}`;
}

export function formatRange(start: string, end: string): string {
  const a = formatTime(start);
  const b = formatTime(end);
  return a.split(' ')[1] === b.split(' ')[1] ? `${a.split(' ')[0]}–${b}` : `${a}–${b}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayShort(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

export function dayNumber(iso: string): number {
  return Number(iso.split('-')[2]);
}

export function formatDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${weekdayShort(iso)}, ${d} ${MONTHS[m - 1]}`;
}

/** "Today", "Tomorrow" or "Wed, 7 Oct" */
export function formatDay(iso: string): string {
  const delta = diffDays(localToday(), iso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  return formatDate(iso);
}

export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');
}

/** Stable hue per id for avatar colours. */
export function hueFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
  completed: 'Completed',
  provider_cancelled: 'Cancelled by pro'
};

export function uid(prefix = 'id'): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${Date.now().toString(36).slice(-4)}`;
}
