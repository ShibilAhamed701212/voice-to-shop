# PS-06 Service Booking Agent: System Architecture

## Architecture Philosophy
The PS-06 Service Booking Voice Agent is built around a clear separation of concerns:
1. **Frontend / Edge**: Voice capture, live audio visualizer, STT/TTS abstractions, and reactive modern UI.
2. **Orchestration Layer (Make.com)**: Make AI Agent serves as the primary intelligence, extracting intents, detecting missing parameters, ranking and comparing providers, enforcing confirmation, and orchestrating downstream tools.
3. **Data & Execution Services (Local/Cloud REST)**: Deterministic, ACID-safe provider search, atomic slot locking, and booking lifecycle management.

```
       [ User Voice Input ]
                 │
                 ▼
      [ React + Vite Voice UI ]
                 │ (Speech-to-Text)
                 ▼
     [ Make.com Scenario Webhook ]
                 │
                 ▼
      [ Make.com AI Agent ] ◄── Uses Make AI Credits (25,000 available)
                 │
   ┌─────────────┴─────────────┐
   ▼                           ▼
[ Provider API ]       [ Booking API ]
(Search & Filter)     (Lock Slot & Book)
   │                           │
   └─────────────┬─────────────┘
                 │
                 ▼
    [ Make Notification Engine ]
                 │ (Text-to-Speech)
                 ▼
       [ User Audio Output ]
```

---

## Technical Components

### 1. Mock API (`mock-api/`)
- **Technology**: Express, TypeScript, Vitest.
- **Port**: `8000`.
- **Database**: In-memory cache backed by JSON persistence files (`providers.json`, `bookings.json`, `customers.json`).
- **Concurrency & Locking**: When a slot is booked, `AvailabilityService.reserveSlot` atomically marks the slot `available: false`. Subsequent requests for the same slot return `409 Conflict (SLOT_UNAVAILABLE)`.

### 2. Frontend Application (`frontend/`)
- **Technology**: React 18, Vite, TypeScript, Vanilla CSS (Design Tokens, Glassmorphism).
- **Port**: `5173`.
- **Voice Engine**:
  - `voiceService.ts`: Native `MediaRecorder` + Web Speech API with fallback/hooks for ElevenLabs API (`VITE_ELEVENLABS_API_KEY`).
  - Audio waveform and pulse ring animations during active recording.
- **Webhook Switcher**:
  - Seamlessly toggle between Live Make.com Webhook (`VITE_MAKE_WEBHOOK_URL`) and Local Simulator mode for offline demonstrations.

### 3. Make.com AI Agent Layer (`make/`)
- Configured with custom system prompt ([make/ai-agent-prompt.md](file:///d:/var-codes/voice-to-shop/PS06-Service-Booking-Agent/make/ai-agent-prompt.md)).
- Tool integrations defined via standard OpenAPI/JSON specifications ([make/tool-definitions.md](file:///d:/var-codes/voice-to-shop/PS06-Service-Booking-Agent/make/tool-definitions.md)).
- Integrates Make Data Store for multi-turn conversational session context.
