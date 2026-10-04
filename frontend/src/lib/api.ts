import type { Booking, Customer, Meta, Provider, ServerConfig, TimeSlot } from '../types';

/** Same-origin by default: Vite proxies /api in dev, Express serves the app in production. */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public code: string, public status: number, public body?: any) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new ApiError(body?.error || `HTTP_${res.status}`, res.status, body);
  return body as T;
}

export const api = {
  health: () => request<{ status: string; version: string }>('/health'),
  config: () => request<ServerConfig>('/api/config'),
  meta: () => request<Meta>('/api/meta'),
  customers: () => request<{ customers: Customer[] }>('/api/customers').then(r => r.customers),

  providers: (params: { category?: string; pincode?: string; date?: string }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
    return request<{ providers: Provider[] }>(`/api/providers?${q}`).then(r => r.providers);
  },
  slots: (providerId: string, date?: string) =>
    request<{ slots: TimeSlot[] }>(`/api/providers/${providerId}/availability${date ? `?date=${date}` : ''}`).then(r => r.slots),

  bookings: (customerId: string) =>
    request<{ bookings: Booking[] }>(`/api/bookings?customer_id=${encodeURIComponent(customerId)}`).then(r => r.bookings),
  createBooking: (body: { customer_id: string; provider_id: string; date: string; start_time: string; problem?: string; service?: string }) =>
    request<{ booking: Booking }>('/api/bookings', { method: 'POST', body: JSON.stringify(body) }).then(r => r.booking),
  cancelBooking: (id: string, reason?: string) =>
    request<{ booking: Booking }>(`/api/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }).then(r => r.booking),
  rescheduleBooking: (id: string, date: string, start_time: string) =>
    request<{ booking: Booking }>(`/api/bookings/${id}/reschedule`, { method: 'POST', body: JSON.stringify({ date, start_time }) }).then(r => r.booking),

  resetDemo: () => request<{ message: string }>('/api/admin/reset', { method: 'POST' })
};

export function errorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'UNKNOWN';
  switch (code) {
    case 'SLOT_UNAVAILABLE':
    case 'NEW_SLOT_UNAVAILABLE':
      return 'That slot was just taken. Please pick another time.';
    case 'NETWORK_ERROR':
      return "Can't reach the booking server. Is the API running?";
    case 'INVALID_DATE':
      return 'That date is outside the bookable window.';
    case 'ALREADY_CANCELLED':
      return 'This booking is already cancelled.';
    case 'BOOKING_NOT_ACTIVE':
      return 'This booking can no longer be changed.';
    case 'RESET_DISABLED':
      return 'Resetting demo data is disabled on this server.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
