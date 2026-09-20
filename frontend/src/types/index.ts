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
  availability: {
    date: string;
    start: string;
    end: string;
    available: boolean;
  }[];
  status: string;
}

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

export interface ConversationState {
  service: string | null;
  problem: string | null;
  pincode: string | null;
  date: string | null;
  time: string | null;
}

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  state?: ConversationState;
  options?: Provider[];
  booking?: Booking;
}

export interface MakeWebhookResponse {
  session_id: string;
  response_type: 'voice' | 'text';
  text: string;
  state?: ConversationState;
  options?: Provider[];
  booking?: Booking;
  error?: string;
}
