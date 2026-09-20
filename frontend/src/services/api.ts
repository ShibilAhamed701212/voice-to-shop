import { Provider, Booking } from '../types';

const BASE_URL = import.meta.env.VITE_MOCK_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

export async function checkHealth(): Promise<{ status: string; service: string }> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return await res.json();
  } catch (err) {
    return { status: 'offline', service: 'Unavailable' };
  }
}

export async function fetchProviders(service?: string, pincode?: string): Promise<Provider[]> {
  try {
    let url = `${BASE_URL}/api/providers`;
    const params = new URLSearchParams();
    if (service) params.append('service', service);
    if (pincode) params.append('pincode', pincode);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url);
    const data = await res.json();
    return data.providers || [];
  } catch {
    return [];
  }
}

export async function fetchBooking(id: string): Promise<Booking | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/bookings/${id}`);
    const data = await res.json();
    return data.booking || null;
  } catch {
    return null;
  }
}
