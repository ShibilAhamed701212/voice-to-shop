import fs from 'fs';
import path from 'path';
import { AvailabilityService } from './availabilityService.js';
import { ProviderService } from './providerService.js';

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
  status: 'pending' | 'confirmed' | 'cancelled' | 'rescheduled' | 'completed' | 'provider_cancelled';
  created_at: string;
  location?: {
    pincode: string;
    area: string;
    city: string;
  };
}

function getDataPath(filename: string): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'data', filename),
    path.join(__dirname, '..', 'data', filename),
    path.resolve(process.cwd(), 'data', filename),
    path.resolve(process.cwd(), 'mock-api', 'data', filename)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const DATA_FILE = getDataPath('bookings.json');
let bookingsCache: Booking[] = [];
let seedBookingsBackup: Booking[] = [];

function loadBookings(): Booking[] {
  if (bookingsCache.length === 0) {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      seedBookingsBackup = JSON.parse(raw);
      bookingsCache = JSON.parse(raw);
    }
  }
  return bookingsCache;
}

export function saveBookings(): void {
  if (process.env.NODE_ENV === 'test') return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(bookingsCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving bookings to disk:', err);
  }
}

export function resetBookingsCache(): void {
  if (seedBookingsBackup.length > 0) {
    bookingsCache = JSON.parse(JSON.stringify(seedBookingsBackup));
  } else {
    bookingsCache = [];
    loadBookings();
  }
}

export class BookingService {
  static getAll(): Booking[] {
    return loadBookings();
  }

  static getById(id: string): Booking | undefined {
    const list = loadBookings();
    return list.find(b => b.booking_id.toLowerCase() === id.toLowerCase());
  }

  static create(params: {
    customer_id: string;
    customer_name?: string;
    provider_id: string;
    service: string;
    problem: string;
    date: string;
    start_time: string;
    end_time?: string;
    price?: number;
  }): { success: boolean; booking?: Booking; error?: string } {
    const provider = ProviderService.getById(params.provider_id);
    if (!provider) {
      return { success: false, error: 'PROVIDER_NOT_FOUND' };
    }

    const endTime = params.end_time || `${parseInt(params.start_time.split(':')[0]) + 1}:00`;

    // Check slot availability and lock
    const reserved = AvailabilityService.reserveSlot(params.provider_id, params.date, params.start_time, endTime);
    if (!reserved) {
      return { success: false, error: 'SLOT_UNAVAILABLE' };
    }

    // Generate dynamic booking ID (e.g., AC2841)
    const prefix = provider.provider_id.slice(0, 2);
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const bookingId = `${prefix}${randomNum}`;

    const newBooking: Booking = {
      booking_id: bookingId,
      customer_id: params.customer_id,
      customer_name: params.customer_name || 'Valued Customer',
      provider_id: provider.provider_id,
      provider_name: provider.name,
      service: params.service || provider.category,
      problem: params.problem || 'Home service request',
      date: params.date,
      start_time: params.start_time,
      end_time: endTime,
      price: params.price || provider.price,
      currency: provider.currency || 'INR',
      status: 'confirmed',
      created_at: new Date().toISOString(),
      location: provider.location
    };

    const bookings = loadBookings();
    bookings.unshift(newBooking);
    saveBookings();

    return { success: true, booking: newBooking };
  }

  static update(id: string, updates: Partial<Booking>): Booking | undefined {
    const bookings = loadBookings();
    const index = bookings.findIndex(b => b.booking_id.toLowerCase() === id.toLowerCase());
    if (index === -1) return undefined;

    bookings[index] = { ...bookings[index], ...updates };
    saveBookings();
    return bookings[index];
  }

  static cancel(id: string, reason?: string): { success: boolean; booking?: Booking; error?: string } {
    const booking = this.getById(id);
    if (!booking) {
      return { success: false, error: 'BOOKING_NOT_FOUND' };
    }

    if (booking.status === 'cancelled') {
      return { success: false, error: 'ALREADY_CANCELLED' };
    }

    // Release provider slot
    AvailabilityService.releaseSlot(booking.provider_id, booking.date, booking.start_time);

    booking.status = 'cancelled';
    saveBookings();

    return { success: true, booking };
  }

  static reschedule(id: string, newDate: string, newStartTime: string, newEndTime?: string): { success: boolean; booking?: Booking; error?: string } {
    const booking = this.getById(id);
    if (!booking) {
      return { success: false, error: 'BOOKING_NOT_FOUND' };
    }

    const endTime = newEndTime || `${parseInt(newStartTime.split(':')[0]) + 1}:00`;

    // Try reserving new slot
    const reserved = AvailabilityService.reserveSlot(booking.provider_id, newDate, newStartTime, endTime);
    if (!reserved) {
      return { success: false, error: 'NEW_SLOT_UNAVAILABLE' };
    }

    // Release old slot
    AvailabilityService.releaseSlot(booking.provider_id, booking.date, booking.start_time);

    // Update booking
    booking.date = newDate;
    booking.start_time = newStartTime;
    booking.end_time = endTime;
    booking.status = 'rescheduled';
    saveBookings();

    return { success: true, booking };
  }
}
