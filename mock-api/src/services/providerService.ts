import { AvailabilityService, Provider } from './availabilityService.js';

export interface ProviderSearchParams {
  service?: string;
  problem?: string;
  pincode?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  preferred_time?: string;
}

export class ProviderService {
  static getAll(filters?: ProviderSearchParams): Provider[] {
    let list = AvailabilityService.getProviders();

    if (!filters) return list;

    if (filters.service) {
      const term = filters.service.toLowerCase().trim();
      list = list.filter(p => 
        p.category.toLowerCase().includes(term) ||
        p.services.some(s => s.toLowerCase().includes(term))
      );
    }

    if (filters.pincode) {
      const pin = filters.pincode.trim();
      list = list.filter(p => p.location.pincode === pin);
    }

    const time = filters.start_time || filters.preferred_time;
    if (filters.date) {
      list = list.filter(p => {
        const slotsOnDate = p.availability.filter(s => s.date === filters.date);
        if (slotsOnDate.length === 0) return false;
        if (time) {
          return slotsOnDate.some(s => s.start === time && s.available);
        }
        return slotsOnDate.some(s => s.available);
      });
    }

    return list;
  }

  static getById(id: string): Provider | undefined {
    const providers = AvailabilityService.getProviders();
    return providers.find(p => p.provider_id.toLowerCase() === id.toLowerCase());
  }

  static search(params: ProviderSearchParams): Provider[] {
    const { service, problem, pincode, date, preferred_time } = params;
    let list = AvailabilityService.getProviders();

    // Match service category or problem description
    if (service || problem) {
      const s = (service || '').toLowerCase();
      const prob = (problem || '').toLowerCase();
      
      list = list.filter(p => {
        const cat = p.category.toLowerCase();
        const matchesCategory = s && (cat.includes(s) || s.includes(cat));
        const matchesServices = p.services.some(svc => {
          const lsvc = svc.toLowerCase();
          return (s && (lsvc.includes(s) || s.includes(lsvc))) || 
                 (prob && (lsvc.includes(prob) || prob.includes(lsvc)));
        });
        const matchesProblem = prob && (cat.includes(prob) || prob.includes(cat));
        return matchesCategory || matchesServices || matchesProblem;
      });
    }

    // Filter by pincode if provided
    if (pincode) {
      const pin = pincode.trim();
      const directMatches = list.filter(p => p.location.pincode === pin);
      // If direct pincode matches exist, prioritize them
      if (directMatches.length > 0) {
        list = directMatches;
      }
    }

    // Filter or score by availability
    if (date) {
      const targetTime = preferred_time || '18:00';
      list = list.filter(p => {
        // Does provider serve on date?
        const daySlots = p.availability.filter(s => s.date === date);
        return daySlots.length > 0;
      });

      // Sort deterministically:
      // 1. Providers with exact available slot at preferred_time first
      // 2. Providers with any available slot on that date
      // 3. Rating descending, price ascending
      list.sort((a, b) => {
        const aExact = a.availability.some(s => s.date === date && s.start === targetTime && s.available);
        const bExact = b.availability.some(s => s.date === date && s.start === targetTime && s.available);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aHasAny = a.availability.some(s => s.date === date && s.available);
        const bHasAny = b.availability.some(s => s.date === date && s.available);
        if (aHasAny && !bHasAny) return -1;
        if (!aHasAny && bHasAny) return 1;

        // Better price (value) then rating
        if (a.price !== b.price) return a.price - b.price;
        return b.rating - a.rating;
      });
    } else {
      // Default sort by rating and price
      list.sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return b.rating - a.rating;
      });
    }

    return list;
  }
}
