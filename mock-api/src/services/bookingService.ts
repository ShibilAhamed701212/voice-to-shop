import { readSeed } from '../lib/store.js';
import { isIsoDate } from '../lib/time.js';
import { AvailabilityService } from './availabilityService.js';
import { Booking, BookingStatus, getState, persist } from './bookingStore.js';

export type { Booking, BookingStatus } from './bookingStore.js';

export type BookingResult = { success: boolean; booking?: Booking; error?: string };

interface Customer {
  customer_id: string;
  name: string;
}

let customers: Customer[] | null = null;
function customerName(id: string): string | undefined {
  if (!customers) customers = readSeed<Customer[]>('customers.json');
  return customers.find(c => c.customer_id.toLowerCase() === id.toLowerCase())?.name;
}

function generateId(prefix: string): string {
  const existing = new Set(getState().bookings.map(b => b.booking_id));
  for (let i = 0; i < 50; i++) {
    const id = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!existing.has(id)) return id;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

/** Text fields callers may change through PATCH. Slot changes must go through reschedule. */
const PATCHABLE_TEXT = ['problem', 'customer_name'] as const;
const MAX_TEXT_LENGTH = 500;
const TERMINAL: BookingStatus[] = ['cancelled', 'completed', 'provider_cancelled'];
/**
 * Status changes PATCH may make. Cancelling goes through /cancel, and nothing may move a
 * booking out of a terminal status: re-activating it would hold a slot that may have been
 * booked by someone else since.
 */
const PATCHABLE_STATUS: BookingStatus[] = ['completed'];

export class BookingService {
  static getAll(): Booking[] {
    return getState().bookings;
  }

  static getById(id: string): Booking | undefined {
    const key = id.toLowerCase();
    return getState().bookings.find(b => b.booking_id.toLowerCase() === key);
  }

  /**
   * Check-and-insert runs synchronously on Node's single thread, so two requests
   * can never both see a slot as free: the second one gets SLOT_UNAVAILABLE.
   */
  static create(params: {
    customer_id: string;
    customer_name?: string;
    provider_id: string;
    service?: string;
    problem?: string;
    date: string;
    start_time: string;
    end_time?: string;
    price?: number;
  }): BookingResult {
    const provider = AvailabilityService.getRecord(params.provider_id);
    if (!provider || provider.status !== 'active') return { success: false, error: 'PROVIDER_NOT_FOUND' };
    if (!isIsoDate(params.date) || !AvailabilityService.isBookableDate(params.date)) {
      return { success: false, error: 'INVALID_DATE' };
    }

    const slot = AvailabilityService.findSlot(provider.provider_id, params.date, params.start_time);
    if (!slot || !slot.available) return { success: false, error: 'SLOT_UNAVAILABLE' };

    const booking: Booking = {
      booking_id: generateId(provider.provider_id.slice(0, 2)),
      customer_id: params.customer_id,
      customer_name: params.customer_name || customerName(params.customer_id) || 'Valued Customer',
      provider_id: provider.provider_id,
      provider_name: provider.name,
      service: params.service || provider.category,
      problem: params.problem || 'Home service request',
      date: params.date,
      start_time: slot.start,
      end_time: slot.end,
      price: provider.price,
      currency: provider.currency || 'INR',
      status: 'confirmed',
      created_at: new Date().toISOString(),
      location: provider.location
    };

    getState().bookings.unshift(booking);
    persist();
    return { success: true, booking };
  }

  static update(id: string, updates: Record<string, unknown>): BookingResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, error: 'BOOKING_NOT_FOUND' };

    for (const field of PATCHABLE_TEXT) {
      const value = updates[field];
      if (value !== undefined && (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH)) {
        return { success: false, error: 'INVALID_FIELD' };
      }
    }
    const status = updates.status;
    if (status !== undefined && status !== booking.status) {
      if (!PATCHABLE_STATUS.includes(status as BookingStatus) || TERMINAL.includes(booking.status)) {
        return { success: false, error: 'INVALID_STATUS_CHANGE' };
      }
    }

    for (const field of PATCHABLE_TEXT) {
      if (typeof updates[field] === 'string') booking[field] = (updates[field] as string).trim();
    }
    if (status !== undefined) booking.status = status as BookingStatus;
    booking.updated_at = new Date().toISOString();
    persist();
    return { success: true, booking };
  }

  static cancel(id: string, reason?: string): BookingResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (booking.status === 'cancelled') return { success: false, error: 'ALREADY_CANCELLED' };
    if (TERMINAL.includes(booking.status)) return { success: false, error: 'BOOKING_NOT_ACTIVE' };

    booking.status = 'cancelled';
    booking.cancel_reason = reason;
    booking.updated_at = new Date().toISOString();
    persist();
    return { success: true, booking };
  }

  static reschedule(id: string, newDate: string, newStartTime: string): BookingResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (TERMINAL.includes(booking.status)) return { success: false, error: 'BOOKING_NOT_ACTIVE' };

    const slot = AvailabilityService.findSlot(booking.provider_id, newDate, newStartTime, booking.booking_id);
    if (!slot || !slot.available) return { success: false, error: 'NEW_SLOT_UNAVAILABLE' };

    booking.date = slot.date;
    booking.start_time = slot.start;
    booking.end_time = slot.end;
    booking.status = 'rescheduled';
    booking.updated_at = new Date().toISOString();
    persist();
    return { success: true, booking };
  }
}
