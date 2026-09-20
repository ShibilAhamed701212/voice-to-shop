import fs from 'fs';
import path from 'path';

export interface TimeSlot {
  date: string;
  start: string;
  end: string;
  available: boolean;
}

export interface Provider {
  provider_id: string;
  name: string;
  category: string;
  location: {
    pincode: string;
    area: string;
    city: string;
  };
  rating: number;
  review_count: number;
  experience_years: number;
  price: number;
  currency: string;
  eta_minutes: number;
  phone: string;
  services: string[];
  availability: TimeSlot[];
  status: string;
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

const DATA_FILE = getDataPath('providers.json');
let providersCache: Provider[] = [];
let seedBackup: Provider[] = [];

function loadProviders(): Provider[] {
  if (providersCache.length === 0) {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      seedBackup = JSON.parse(raw);
      providersCache = JSON.parse(raw);
    }
  }
  return providersCache;
}

export function saveProviders(): void {
  if (process.env.NODE_ENV === 'test') return; // Do not overwrite disk during test runs
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(providersCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving providers to disk:', err);
  }
}

export function resetProvidersCache(): void {
  if (seedBackup.length > 0) {
    providersCache = JSON.parse(JSON.stringify(seedBackup));
  } else {
    providersCache = [];
    loadProviders();
  }
}

export class AvailabilityService {
  static getProviders(): Provider[] {
    return loadProviders();
  }

  static getProviderSlots(providerId: string, date?: string): TimeSlot[] {
    const providers = loadProviders();
    const provider = providers.find(p => p.provider_id.toLowerCase() === providerId.toLowerCase());
    if (!provider) return [];
    if (date) {
      return provider.availability.filter(slot => slot.date === date);
    }
    return provider.availability;
  }

  static isSlotAvailable(providerId: string, date: string, startTime: string): boolean {
    const slots = this.getProviderSlots(providerId, date);
    const targetSlot = slots.find(s => s.start === startTime);
    return targetSlot ? targetSlot.available : false;
  }

  static reserveSlot(providerId: string, date: string, startTime: string, endTime?: string): boolean {
    const providers = loadProviders();
    const provider = providers.find(p => p.provider_id.toLowerCase() === providerId.toLowerCase());
    if (!provider) return false;

    let slot = provider.availability.find(s => s.date === date && s.start === startTime);
    if (!slot) {
      // If slot not explicitly listed, create it as booked if valid time
      slot = {
        date,
        start: startTime,
        end: endTime || `${parseInt(startTime.split(':')[0]) + 1}:00`,
        available: false
      };
      provider.availability.push(slot);
      saveProviders();
      return true;
    }

    if (!slot.available) {
      return false; // Already booked!
    }

    slot.available = false;
    saveProviders();
    return true;
  }

  static releaseSlot(providerId: string, date: string, startTime: string): boolean {
    const providers = loadProviders();
    const provider = providers.find(p => p.provider_id.toLowerCase() === providerId.toLowerCase());
    if (!provider) return false;

    const slot = provider.availability.find(s => s.date === date && s.start === startTime);
    if (slot) {
      slot.available = true;
      saveProviders();
      return true;
    }
    return false;
  }
}
