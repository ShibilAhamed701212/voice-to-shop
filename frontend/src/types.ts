export interface TimeSlot {
  date: string;
  start: string;
  end: string;
  available: boolean;
}

export interface Location {
  pincode: string;
  area: string;
  city: string;
}

export interface Provider {
  provider_id: string;
  name: string;
  category: string;
  location: Location;
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
  matched_slot?: TimeSlot;
  in_area?: boolean;
}

export interface ProviderOption extends Provider {
  slots?: TimeSlot[];
  recommended_slot?: TimeSlot;
  badges?: string[];
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'rescheduled' | 'completed' | 'provider_cancelled';

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
  location?: Location;
}

export interface Customer {
  customer_id: string;
  name: string;
  phone?: string;
  email?: string;
  default_location?: Location;
}

export type Stage =
  | 'gathering'
  | 'options'
  | 'confirming'
  | 'booked'
  | 'confirm_cancel'
  | 'reschedule_ask'
  | 'confirm_reschedule';

export interface AgentState {
  service: string | null;
  problem: string | null;
  pincode: string | null;
  area?: string | null;
  date: string | null;
  time: string | null;
  provider_id?: string | null;
  provider_name?: string | null;
  price?: number | null;
  booking_id?: string | null;
}

export interface Proposal {
  kind: 'booking' | 'reschedule' | 'cancel';
  provider_id: string;
  provider_name: string;
  service: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  booking_id?: string;
}

export interface AgentAction {
  type: 'select' | 'confirm' | 'decline' | 'cancel_booking' | 'reschedule_booking' | 'reset';
  provider_id?: string;
  date?: string;
  start_time?: string;
  booking_id?: string;
}

/** Reply from the built-in agent or a Make.com scenario (which may omit most fields). */
export interface AgentReply {
  session_id: string;
  text: string;
  source: 'local' | 'claude' | 'make';
  stage?: Stage;
  state?: Partial<AgentState>;
  options?: ProviderOption[];
  proposal?: Proposal;
  booking?: Booking;
  suggestions?: string[];
  error?: string;
  fallback?: boolean;
  notice?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  at: number;
  reply?: AgentReply;
  via?: 'voice' | 'text' | 'tap';
}

export interface ServerConfig {
  today: string;
  timezone: string;
  horizon_days: number;
  claude_configured: boolean;
  claude_model: string;
  make_webhook_configured: boolean;
  elevenlabs_configured: boolean;
}

export interface Meta {
  categories: { name: string; count: number; min_price: number }[];
  areas: (Location & { count: number })[];
}
