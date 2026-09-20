# PS-06: Voice-First Service Booking Platform

> **Hackathon Challenge PS-06**: An AI voice agent that understands home-service requests via natural voice, detects missing details, searches and compares providers, obtains explicit user confirmation, completes bookings, atomically locks slots to prevent double-booking, and vocalizes the result.
>
> **Core Architecture**: **Make.com serves as the primary orchestration and AI agent layer**, using Make AI credits for intent extraction, comparison, multi-turn dialogue, and confirmation logic.

---

## Architecture Flow

```
User Voice
  │
  ▼
React Voice UI (Microphone capture & Web Audio Waveform)
  │
  ▼
Speech-to-Text (Browser Web Speech API / ElevenLabs)
  │
  ▼
Make.com Custom Webhook
  │
  ▼
Make.com AI Agent (Prompt + Tools + ~25,000 Make AI Credits)
  │
  ├─► Tool: search_providers (HTTP POST /api/providers/search)
  ├─► Provider Comparison & Missing Info Detection
  ├─► Explicit Confirmation Enforcement
  ├─► Tool: create_booking (HTTP POST /api/bookings)
  │
  ▼
Make Notification & Return Layer
  │
  ▼
Text-to-Speech (Browser SpeechSynthesis / ElevenLabs)
  │
  ▼
User Audio Playback & Digital Booking Pass
```

---

## Project Structure

```
PS06-Service-Booking-Agent/
├── frontend/                     # React + Vite + TypeScript Voice UI
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceController.tsx   # Big mic button, pulse rings, live waveform
│   │   │   ├── ConversationFeed.tsx  # Messages, state chips, options grid
│   │   │   ├── ProviderCard.tsx      # Provider comparison cards (selection only)
│   │   │   ├── BookingModal.tsx     # Confirmed digital booking pass
│   │   │   ├── SettingsModal.tsx     # Webhook URL & ElevenLabs key config
│   │   │   └── Header.tsx           # Glassmorphic navbar, status, credits pill
│   │   ├── services/
│   │   │   ├── voiceService.ts       # Mic capture, STT/TTS abstractions
│   │   │   ├── makeService.ts        # Make.com webhook & simulator client
│   │   │   └── api.ts                # Direct REST client for health & details
│   │   ├── types/index.ts            # Typed interfaces
│   │   ├── App.tsx                   # Main state machine
│   │   ├── index.css                 # Dark obsidian glassmorphism & gradients
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── mock-api/                     # Express + TypeScript Mock Data & Services
│   ├── src/
│   │   ├── routes/
│   │   │   ├── health.ts             # GET /health
│   │   │   ├── providers.ts          # Provider search, availability, details
│   │   │   ├── bookings.ts           # Create, get, cancel, reschedule
│   │   │   ├── customers.ts          # Customer records
│   │   │   └── simulator.ts          # Local Make AI Agent webhook simulator
│   │   ├── services/
│   │   │   ├── providerService.ts    # Deterministic matching & ranking
│   │   │   ├── availabilityService.ts# Slot locking & double-booking prevention
│   │   │   └── bookingService.ts     # ID generation & lifecycle transitions
│   │   ├── data/
│   │   │   ├── providers.json        # 44 realistic providers across 8 categories
│   │   │   ├── bookings.json         # 22 sample bookings
│   │   │   └── customers.json        # 20 customer profiles
│   │   └── server.ts                 # Express server on port 8000
│   ├── tests/
│   │   ├── provider.test.ts          # Category, pincode, slot search tests
│   │   ├── booking.test.ts           # Booking & double-booking prevention tests
│   │   └── e2e.test.ts               # Multi-turn demo scenario test
│   ├── package.json
│   └── tsconfig.json
│
├── make/                         # Make.com Blueprints & Artifacts
│   ├── README.md                     # Step-by-step scenario connection guide
│   ├── architecture.md               # Make orchestration diagrams & sequence flows
│   ├── ai-agent-prompt.md            # Production Make AI Agent system instructions
│   ├── tool-definitions.md           # OpenAPI / JSON tool schemas
│   └── sample-payloads/              # Payloads for testing Make HTTP modules
│       ├── search-providers.json
│       ├── create-booking.json
│       ├── update-booking.json
│       └── cancel-booking.json
│
├── docs/                         # Comprehensive Documentation
│   ├── architecture.md               # Deep system architecture & locking mechanics
│   ├── api.md                        # Full REST API documentation with examples
│   ├── demo-script.md                # Turn-by-turn hackathon presentation script
│   └── setup.md                      # Detailed deployment guide
│
├── docker-compose.yml            # Containerized full-stack deployment
├── .env.example                  # Environment variable template
└── README.md                     # This file
```

---

## Quick Start (Run Locally)

### 1. Start the Mock REST API
```bash
cd PS06-Service-Booking-Agent/mock-api
npm install
npm run dev
```
- API starts on: **`http://localhost:8000`**
- Health check: **`http://localhost:8000/health`**

### 2. Start the Frontend
In a second terminal:
```bash
cd PS06-Service-Booking-Agent/frontend
npm install
npm run dev
```
- Frontend starts on: **`http://localhost:5173`**

---

## Running Automated Tests

Run the complete test suite (15/15 tests covering providers, bookings, double-booking locks, and E2E demo):
```bash
cd PS06-Service-Booking-Agent/mock-api
npm test
```

---

## Live Demo Walkthrough (Section 32 Demo Scenario)

1. Open **`http://localhost:5173`** in your browser.
2. Click the large glowing **`[ 🎙️ TALK TO SERVICE AGENT ]`** button (or click the quick demo buttons):
   - **Step 1**: Speak: *"My AC isn't cooling properly. I need someone tomorrow evening."*
     - *Agent replies:* *"Sure. What is your PIN code?"*
   - **Step 2**: Speak: *"560064."*
     - *Agent searches and compares:* *"I found three AC technicians available tomorrow evening. Rahul Kumar is ₹399 with a 4.7 rating and is available from 6 to 7 PM. Arun Services is ₹349 with a 4.5 rating and is available from 7 to 8 PM. Would you like Rahul at 6 PM?"*
     - Comparison cards appear on the UI.
   - **Step 3**: Speak: *"Yes."*
     - *Agent enforces explicit confirmation:* *"Rahul Kumar is ₹399 and available tomorrow from 6 to 7 PM. Shall I confirm the booking?"*
   - **Step 4**: Speak: *"Yes, book him."*
     - *Agent books, locks the slot, and returns:* *"Your AC technician is booked. Rahul Kumar will arrive tomorrow between 6 and 7 PM. The estimated cost is ₹399. Your booking ID is AC2841."*
     - Digital booking pass displays on screen.

---

## Double Booking Prevention

When a booking is confirmed, the provider's specific time slot is locked to `available: false`. If a concurrent or subsequent user attempts to book the same slot, the API rejects it with:
```json
{
  "success": false,
  "error": "SLOT_UNAVAILABLE"
}
```
The Make AI Agent handles this error gracefully and proposes alternative slots or providers.
