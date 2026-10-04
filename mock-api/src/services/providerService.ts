import { isIsoDate, isTime, toMinutes } from '../lib/time.js';
import { occupiedKeys } from './bookingStore.js';
import { AvailabilityService, Provider, ProviderRecord, TimeSlot, getCatalog } from './availabilityService.js';

export interface ProviderSearchParams {
  service?: string;
  category?: string;
  problem?: string;
  pincode?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  preferred_time?: string;
}

/** Higher is better: rewards rating, lightly penalises price. */
export function valueScore(p: { rating: number; price: number }): number {
  return p.rating * 2 - p.price / 200;
}

function matchesService(p: ProviderRecord, service?: string, problem?: string): boolean {
  const s = (service || '').toLowerCase().trim();
  const prob = (problem || '').toLowerCase().trim();
  if (!s && !prob) return true;
  const cat = p.category.toLowerCase();
  if (s && (cat.includes(s) || s.includes(cat))) return true;
  if (prob && (cat.includes(prob) || prob.includes(cat))) return true;
  return p.services.some(svc => {
    const lsvc = svc.toLowerCase();
    return (s && (lsvc.includes(s) || s.includes(lsvc))) || (prob && (lsvc.includes(prob) || prob.includes(lsvc)));
  });
}

/** Picks the available slot closest to the preferred time (or the earliest one). */
export function nearestSlot(slots: TimeSlot[], preferred?: string): TimeSlot | undefined {
  const free = slots.filter(s => s.available);
  if (!free.length) return undefined;
  if (!preferred) return free[0];
  const target = toMinutes(preferred);
  return free.reduce((best, s) =>
    Math.abs(toMinutes(s.start) - target) < Math.abs(toMinutes(best.start) - target) ? s : best
  );
}

function activeRecords(): ProviderRecord[] {
  return getCatalog().filter(p => p.status === 'active');
}

export class ProviderService {
  /** Plain filtering for listings (explorer UI, GET /api/providers). */
  static getAll(filters: ProviderSearchParams = {}): Provider[] {
    let list = activeRecords();
    if (filters.category) {
      const c = filters.category.toLowerCase();
      list = list.filter(p => p.category.toLowerCase() === c);
    }
    if (filters.service) list = list.filter(p => matchesService(p, filters.service));
    if (filters.pincode) list = list.filter(p => p.location.pincode === filters.pincode!.trim());

    const occupied = occupiedKeys();
    const date = isIsoDate(filters.date) ? filters.date : undefined;
    const time = filters.start_time || filters.preferred_time;
    const dates = date ? [date] : AvailabilityService.horizonDates();
    let providers = list.map(p => AvailabilityService.toProvider(p, dates, occupied));

    if (date) {
      providers = providers.filter(p =>
        time ? p.availability.some(s => s.start === time && s.available) : p.availability.some(s => s.available)
      );
    }
    return providers;
  }

  static getById(id: string): Provider | undefined {
    const record = AvailabilityService.getRecord(id);
    return record ? AvailabilityService.toProvider(record, AvailabilityService.horizonDates()) : undefined;
  }

  /**
   * Ranked search used by the voice agent and Make.com tool calls.
   * With a date: only providers with a free slot that day, exact time matches first,
   * then by closeness to the preferred time, then by value (rating vs price).
   */
  static search(params: ProviderSearchParams): Provider[] {
    const service = params.service || params.category;
    let records = activeRecords().filter(p => matchesService(p, service, params.problem));

    let inArea = true;
    if (params.pincode) {
      const pin = params.pincode.trim();
      const direct = records.filter(p => p.location.pincode === pin);
      if (direct.length) records = direct;
      else inArea = false;
    }

    const occupied = occupiedKeys();
    const preferred = isTime(params.preferred_time) ? params.preferred_time : isTime(params.start_time) ? params.start_time : undefined;
    const date = isIsoDate(params.date) ? params.date : undefined;

    if (!date) {
      const dates = AvailabilityService.horizonDates();
      return records
        .map(r => {
          const p = AvailabilityService.toProvider(r, dates, occupied);
          return { ...p, in_area: inArea, matched_slot: p.availability.find(s => s.available) };
        })
        .sort((a, b) => valueScore(b) - valueScore(a));
    }

    const target = preferred ? toMinutes(preferred) : 0;
    return records
      .map(r => {
        const p = AvailabilityService.toProvider(r, [date], occupied);
        return { ...p, in_area: inArea, matched_slot: nearestSlot(p.availability, preferred) };
      })
      .filter(p => p.matched_slot)
      .sort((a, b) => {
        const da = Math.abs(toMinutes(a.matched_slot!.start) - target);
        const db = Math.abs(toMinutes(b.matched_slot!.start) - target);
        if (preferred && (da === 0) !== (db === 0)) return da === 0 ? -1 : 1;
        if (preferred && da !== db) return da - db;
        return valueScore(b) - valueScore(a);
      });
  }

  /** The next few free slots for one provider, starting from a date. */
  static upcomingSlots(providerId: string, fromDate: string, limit = 3, excludeBookingId?: string): TimeSlot[] {
    const dates = AvailabilityService.horizonDates().filter(d => d >= fromDate);
    const out: TimeSlot[] = [];
    for (const d of dates) {
      for (const s of AvailabilityService.getProviderSlots(providerId, d, excludeBookingId)) {
        if (s.available) out.push(s);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}
