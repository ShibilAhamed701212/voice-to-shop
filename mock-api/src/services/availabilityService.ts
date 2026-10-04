import { readSeed } from '../lib/store.js';
import { addDays, isIsoDate, minutesNow, toMinutes, today } from '../lib/time.js';
import { getState, occupiedKeys, persist, slotKey } from './bookingStore.js';

export interface TimeSlot {
  date: string;
  start: string;
  end: string;
  available: boolean;
}

export interface ScheduleSlot {
  start: string;
  end: string;
}

export interface ProviderRecord {
  provider_id: string;
  name: string;
  category: string;
  location: { pincode: string; area: string; city: string };
  rating: number;
  review_count: number;
  experience_years: number;
  price: number;
  currency: string;
  eta_minutes: number;
  phone: string;
  services: string[];
  /** Daily working slots; availability is generated from this for a rolling window. */
  schedule: ScheduleSlot[];
  status: string;
}

export interface Provider extends Omit<ProviderRecord, 'schedule'> {
  availability: TimeSlot[];
  /** Best slot for the requested date/time (search results only). */
  matched_slot?: TimeSlot;
  /** False when no provider serves the requested PIN code and nearby ones are shown instead. */
  in_area?: boolean;
}

/** How many days ahead customers can book. */
export const HORIZON_DAYS = 14;
/** Same-day slots must start at least this far in the future. */
const LEAD_MINUTES = 60;

let catalog: ProviderRecord[] | null = null;

export function getCatalog(): ProviderRecord[] {
  if (!catalog) catalog = readSeed<ProviderRecord[]>('providers.json');
  return catalog;
}

export class AvailabilityService {
  static getRecord(providerId: string): ProviderRecord | undefined {
    const id = providerId.toLowerCase();
    return getCatalog().find(p => p.provider_id.toLowerCase() === id);
  }

  static horizonDates(): string[] {
    const start = today();
    return Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(start, i));
  }

  static isBookableDate(date: string): boolean {
    return isIsoDate(date) && this.horizonDates().includes(date);
  }

  static slotsFor(record: ProviderRecord, date: string, occupied: Set<string> = occupiedKeys()): TimeSlot[] {
    if (!this.isBookableDate(date)) return [];
    const isToday = date === today();
    const cutoff = minutesNow() + LEAD_MINUTES;
    return record.schedule.map(s => ({
      date,
      start: s.start,
      end: s.end,
      available:
        !occupied.has(slotKey(record.provider_id, date, s.start)) && !(isToday && toMinutes(s.start) < cutoff)
    }));
  }

  static toProvider(record: ProviderRecord, dates: string[], occupied: Set<string> = occupiedKeys()): Provider {
    const { schedule: _schedule, ...rest } = record;
    return { ...rest, availability: dates.flatMap(d => this.slotsFor(record, d, occupied)) };
  }

  static getProviderSlots(providerId: string, date?: string, excludeBookingId?: string): TimeSlot[] {
    const record = this.getRecord(providerId);
    if (!record) return [];
    const occupied = occupiedKeys(excludeBookingId);
    const dates = date ? [date] : this.horizonDates();
    return dates.flatMap(d => this.slotsFor(record, d, occupied));
  }

  static findSlot(providerId: string, date: string, startTime: string, excludeBookingId?: string): TimeSlot | undefined {
    return this.getProviderSlots(providerId, date, excludeBookingId).find(s => s.start === startTime);
  }

  static isSlotAvailable(providerId: string, date: string, startTime: string, excludeBookingId?: string): boolean {
    return this.findSlot(providerId, date, startTime, excludeBookingId)?.available ?? false;
  }

  /** Manually blocks a free slot. Returns false if it doesn't exist or is already taken. */
  static reserveSlot(providerId: string, date: string, startTime: string): boolean {
    if (!this.isSlotAvailable(providerId, date, startTime)) return false;
    getState().blocks.push(slotKey(providerId, date, startTime));
    persist();
    return true;
  }

  /** Removes a manual block. Slots held by bookings are released by cancelling the booking. */
  static releaseSlot(providerId: string, date: string, startTime: string): boolean {
    const state = getState();
    const key = slotKey(providerId, date, startTime);
    const before = state.blocks.length;
    state.blocks = state.blocks.filter(k => k !== key);
    if (state.blocks.length === before) return false;
    persist();
    return true;
  }
}
