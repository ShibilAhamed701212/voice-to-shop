# PS-06 Live Demo Script & Walkthrough

This demo script matches the required evaluation criteria for the **PS-06 Challenge: Service Booking Voice Agent**.

---

## Demo Overview
- **Scenario**: A user reports an air conditioning cooling problem via microphone and requests an appointment for tomorrow evening.
- **Orchestration**: Make.com AI Agent identifies missing information (PIN code), searches providers, compares options, prompts for confirmation, creates the booking via REST API, locks the slot, and responds back in voice.

---

## Turn-by-Turn Script

### Turn 1: Initial Request (Missing PIN code)
1. **User Action**: Click the glowing **`🎙️ Talk to Service Agent`** button.
2. **User Speaks**:
   > *"My AC isn't cooling properly. I need someone tomorrow evening."*
3. **System Behavior**:
   - Audio is converted to text (STT).
   - Sent to Make.com Webhook.
   - Make AI Agent extracts:
     - `service`: AC Repair
     - `problem`: AC not cooling properly
     - `date`: 2026-09-21
     - `time`: 18:00 (Evening)
     - `pincode`: **Missing**
4. **Agent Vocalizes**:
   > *"Sure. What is your PIN code?"*

---

### Turn 2: Providing Location & Comparing Options
1. **User Speaks**:
   > *"560064."*
2. **System Behavior**:
   - Make AI Agent receives the PIN code `560064`.
   - Calls the `search_providers` tool via HTTP.
   - Provider API filters deterministically:
     - Rahul Kumar (₹399, Rating: 4.7, Slot: 18:00–19:00, ETA: 25 min)
     - Arun Services (₹349, Rating: 4.5, Slot: 19:00–20:00, ETA: 35 min)
   - Make AI Agent compares the options and notes that Rahul matches the exact requested 6 PM slot while Arun is ₹50 cheaper at 7 PM.
3. **Agent Vocalizes**:
   > *"I found three AC technicians available tomorrow evening. Rahul Kumar is ₹399 with a 4.7 rating and is available from 6 to 7 PM. Arun Services is ₹349 with a 4.5 rating and is available from 7 to 8 PM. Would you like Rahul at 6 PM?"*
4. **UI Updates**:
   - Provider comparison cards appear on screen with badges for Price, Rating, ETA, and Available Slot.

---

### Turn 3: Provider Selection (Pre-Booking Verification)
1. **User Speaks**:
   > *"Yes."*
2. **System Behavior**:
   - Make AI Agent selects Rahul Kumar.
   - **Crucial Rule**: Does NOT book automatically. Asks for explicit, final confirmation with price and time.
3. **Agent Vocalizes**:
   > *"Rahul Kumar is ₹399 and available tomorrow from 6 to 7 PM. Shall I confirm the booking?"*

---

### Turn 4: Explicit Confirmation & Booking Execution
1. **User Speaks**:
   > *"Yes, book him."*
2. **System Behavior**:
   - Make AI Agent detects explicit confirmation.
   - Calls `create_booking` tool.
   - Booking API locks slot `2026-09-21 18:00-19:00` (prevents double booking).
   - Dynamic booking ID generated: `AC2841`.
   - Notification module triggers confirmation.
3. **Agent Vocalizes**:
   > *"Your AC technician is booked. Rahul Kumar will arrive tomorrow between 6 and 7 PM. The estimated cost is ₹399. Your booking ID is AC2841."*
4. **UI Updates**:
   - Confirmed Booking Pass appears with Booking ID `AC2841`, technician details, arrival window, and cost.

---

## Edge Case Demonstrations

### Edge Case A: Double Booking Prevention
- If another user attempts to book the 6 PM slot for Rahul Kumar:
- Provider API returns `409 Conflict: SLOT_UNAVAILABLE`.
- Make AI Agent immediately catches the error:
  > *"I'm sorry, that slot was just booked by another customer. Arun Services is available from 7 to 8 PM for ₹349. Would you like Arun instead?"*

### Edge Case B: Multilingual Support (Hindi)
- User speaks:
  > *"Mera AC thanda nahi kar raha hai, kal shaam ko koi aa sakta hai?"*
- Agent responds in Hindi:
  > *"Zaroor. Kripya apna PIN code ya ilaaqa batayein?"*
