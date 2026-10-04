import { readRuntime, readSeed, writeRuntime } from '../lib/store.js';
import { addDays, diffDays, today } from '../lib/time.js';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'completed'
  | 'provider_cancelled';

export interface Booking {
  booking_id: string;
  customer_id: string;
  customer_name?: string;
  provider_id: string;
  provider_name: string;
  service: string;
  problem: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  currency: string;
  status: BookingStatus;
  created_at: string;
  updated_at?: string;
  cancel_reason?: string;
  location?: {
    pincode: string;
    area: string;
    city: string;
  };
}

/** Statuses that hold a provider's time slot. */
export const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'rescheduled'];

/** The seed file was authored as if "today" were this date; it is shifted to the real today on first run. */
const SEED_BASE_DATE = '2026-09-20';
const STATE_FILE = 'state.json';

interface StoreState {
  bookings: Booking[];
  /** Manually blocked slots (provider|date|start), e.g. a provider marking themselves busy. */
  blocks: string[];
}

let state: StoreState | null = null;

function seedState(): StoreState {
  const offset = diffDays(SEED_BASE_DATE, today());
  const bookings = readSeed<Booking[]>('bookings.seed.json').map(b => ({
    ...b,
    date: addDays(b.date, offset),
    created_at: new Date(Date.parse(b.created_at) + offset * 86400000).toISOString()
  }));
  return { bookings, blocks: [] };
}

export function getState(): StoreState {
  if (!state) {
    const stored = readRuntime<StoreState>(STATE_FILE);
    state = stored ?? seedState();
    if (!stored) persist();
  }
  return state;
}

export function persist(): void {
  if (state) writeRuntime(STATE_FILE, state);
}

/** Restores the seeded dataset (used by tests and the /api/admin/reset endpoint). */
export function resetStore(): void {
  state = seedState();
  persist();
}

export function slotKey(providerId: string, date: string, start: string): string {
  return `${providerId.toUpperCase()}|${date}|${start}`;
}

/** Every slot currently held by an active booking or a manual block. */
export function occupiedKeys(excludeBookingId?: string): Set<string> {
  const { bookings, blocks } = getState();
  const keys = new Set(blocks);
  for (const b of bookings) {
    if (b.booking_id === excludeBookingId) continue;
    if (ACTIVE_STATUSES.includes(b.status)) keys.add(slotKey(b.provider_id, b.date, b.start_time));
  }
  return keys;
}
