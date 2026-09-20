import { Router, Request, Response } from 'express';
import { ProviderService } from '../services/providerService.js';
import { BookingService } from '../services/bookingService.js';

const router = Router();

// In-memory conversation state for sessions
interface ConversationSession {
  session_id: string;
  customer_id: string;
  step: 'init' | 'awaiting_pincode' | 'presented_options' | 'awaiting_confirmation' | 'booked';
  state: {
    service: string | null;
    problem: string | null;
    pincode: string | null;
    date: string | null;
    time: string | null;
    selected_provider_id: string | null;
    selected_provider_name: string | null;
    price: number | null;
  };
  options?: any[];
  booking_id?: string;
}

const sessions: Map<string, ConversationSession> = new Map();

router.post('/make-simulator', (req: Request, res: Response) => {
  const { session_id = 'S1001', customer_id = 'C001', message = '', language = 'en-IN' } = req.body;
  const lowerMsg = message.toLowerCase().trim();

  let session = sessions.get(session_id);
  if (!session) {
    session = {
      session_id,
      customer_id,
      step: 'init',
      state: {
        service: null,
        problem: null,
        pincode: null,
        date: null,
        time: null,
        selected_provider_id: null,
        selected_provider_name: null,
        price: null
      }
    };
    sessions.set(session_id, session);
  }

  // Turn 1: User states problem (e.g. "My AC is not cooling properly. I need someone tomorrow evening.")
  if (session.step === 'init') {
    // Detect service & problem
    if (lowerMsg.includes('ac') || lowerMsg.includes('cooling') || lowerMsg.includes('air conditioner')) {
      session.state.service = 'AC Repair';
      session.state.problem = 'AC not cooling properly';
    } else if (lowerMsg.includes('tap') || lowerMsg.includes('leak') || lowerMsg.includes('plumb')) {
      session.state.service = 'Plumbing';
      session.state.problem = 'Plumbing issue / leak';
    } else if (lowerMsg.includes('electric') || lowerMsg.includes('power') || lowerMsg.includes('short circuit')) {
      session.state.service = 'Electrical';
      session.state.problem = 'Electrical fault';
    } else if (lowerMsg.includes('clean')) {
      session.state.service = 'Cleaning';
      session.state.problem = 'Home cleaning';
    } else {
      session.state.service = 'Home Service';
      session.state.problem = message;
    }

    if (lowerMsg.includes('tomorrow')) {
      session.state.date = '2026-09-21';
    }
    if (lowerMsg.includes('evening') || lowerMsg.includes('shaam') || lowerMsg.includes('6')) {
      session.state.time = '18:00';
    }

    // Check for pincode in first turn
    const pinMatch = message.match(/\b\d{6}\b/);
    if (pinMatch) {
      session.state.pincode = pinMatch[0];
    }

    if (!session.state.pincode) {
      session.step = 'awaiting_pincode';
      return res.json({
        session_id,
        response_type: 'voice',
        text: 'Sure. What is your PIN code?',
        state: session.state,
        options: []
      });
    }
  }

  // Turn 2: User provides PIN code (e.g. "560064")
  if (session.step === 'awaiting_pincode' || (session.step === 'init' && session.state.pincode)) {
    const pinMatch = message.match(/\b\d{6}\b/);
    if (pinMatch) {
      session.state.pincode = pinMatch[0];
    } else if (lowerMsg.length === 6 && !isNaN(Number(lowerMsg))) {
      session.state.pincode = lowerMsg;
    }

    // Search providers with deterministic matching
    const results = ProviderService.search({
      service: session.state.service || 'AC Repair',
      problem: session.state.problem || 'AC not cooling',
      pincode: session.state.pincode || '560064',
      date: session.state.date || '2026-09-21',
      preferred_time: session.state.time || '18:00'
    });

    const topOptions = results.slice(0, 3);
    session.options = topOptions;
    session.step = 'presented_options';

    if (topOptions.length === 0) {
      return res.json({
        session_id,
        response_type: 'voice',
        text: "I couldn't find an available provider for that time in your area. I can check a nearby area or a different time slot if you'd like.",
        state: session.state,
        options: []
      });
    }

    const p1 = topOptions[0];
    const p2 = topOptions[1];

    let replyText = `I found ${topOptions.length} ${session.state.service || 'service'} technicians available tomorrow evening. `;
    if (p1 && p2) {
      replyText += `${p1.name} is ₹${p1.price} with a ${p1.rating} rating and is available from 6 to 7 PM. ${p2.name} is ₹${p2.price} with a ${p2.rating} rating and is available from 7 to 8 PM. Would you like ${p1.name} at 6 PM?`;
      session.state.selected_provider_id = p1.provider_id;
      session.state.selected_provider_name = p1.name;
      session.state.price = p1.price;
    } else {
      replyText += `${p1.name} is ₹${p1.price} with a ${p1.rating} rating, available at 6 PM. Would you like to select ${p1.name}?`;
      session.state.selected_provider_id = p1.provider_id;
      session.state.selected_provider_name = p1.name;
      session.state.price = p1.price;
    }

    return res.json({
      session_id,
      response_type: 'voice',
      text: replyText,
      state: session.state,
      options: topOptions
    });
  }

  // Turn 3: User chooses provider (e.g. "Yes" or "Rahul" or "Choose Rahul Kumar")
  if (session.step === 'presented_options') {
    if (lowerMsg.includes('arun') || lowerMsg.includes('second')) {
      const p2 = session.options?.[1];
      if (p2) {
        session.state.selected_provider_id = p2.provider_id;
        session.state.selected_provider_name = p2.name;
        session.state.price = p2.price;
        session.state.time = '19:00';
      }
    } else {
      const p1 = session.options?.[0];
      if (p1) {
        session.state.selected_provider_id = p1.provider_id;
        session.state.selected_provider_name = p1.name;
        session.state.price = p1.price;
        session.state.time = '18:00';
      }
    }

    session.step = 'awaiting_confirmation';
    const name = session.state.selected_provider_name || 'Rahul Kumar';
    const price = session.state.price || 399;
    const time = session.state.time === '19:00' ? '7 to 8 PM' : '6 to 7 PM';

    return res.json({
      session_id,
      response_type: 'voice',
      text: `${name} is ₹${price} and available tomorrow from ${time}. Shall I confirm the booking?`,
      state: session.state,
      options: session.options
    });
  }

  // Turn 4: User explicitly confirms booking (e.g. "Yes, book him." or "Confirm booking")
  if (session.step === 'awaiting_confirmation') {
    const isAffirmative = lowerMsg.includes('book') || lowerMsg.includes('yes') || lowerMsg.includes('confirm') || lowerMsg.includes('sure');
    
    if (!isAffirmative) {
      return res.json({
        session_id,
        response_type: 'voice',
        text: 'I will hold off on booking. Would you like to select a different provider or change the time?',
        state: session.state,
        options: session.options
      });
    }

    // Call Booking Service deterministically
    const bookingResult = BookingService.create({
      customer_id: session.customer_id,
      provider_id: session.state.selected_provider_id || 'AC001',
      service: session.state.service || 'AC Repair',
      problem: session.state.problem || 'AC not cooling properly',
      date: session.state.date || '2026-09-21',
      start_time: session.state.time || '18:00',
      price: session.state.price || 399
    });

    if (!bookingResult.success || !bookingResult.booking) {
      if (bookingResult.error === 'SLOT_UNAVAILABLE') {
        return res.json({
          session_id,
          response_type: 'voice',
          text: `I'm sorry, that slot was just taken by another customer. Let me find another available slot or provider for you.`,
          state: session.state,
          error: 'SLOT_UNAVAILABLE'
        });
      }
      return res.json({
        session_id,
        response_type: 'voice',
        text: `I'm unable to complete the booking right now. The booking system returned an error.`,
        state: session.state,
        error: bookingResult.error
      });
    }

    session.step = 'booked';
    session.booking_id = bookingResult.booking.booking_id;
    const b = bookingResult.booking;
    const name = b.provider_name;
    const timeDisplay = b.start_time === '19:00' ? '7 and 8 PM' : '6 and 7 PM';

    return res.json({
      session_id,
      response_type: 'voice',
      text: `Your ${b.service.toLowerCase()} technician is booked. ${name} will arrive tomorrow between ${timeDisplay}. The estimated cost is ₹${b.price}. Your booking ID is ${b.booking_id}.`,
      state: session.state,
      booking: b,
      options: []
    });
  }

  // Already booked or general follow-up
  return res.json({
    session_id,
    response_type: 'voice',
    text: `Your booking ${session.booking_id || ''} is already confirmed. Is there anything else I can assist you with?`,
    state: session.state
  });
});

export default router;
