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
- **Data**: Read-only seed catalog (`providers.json` with daily schedules, `customers.json`) plus runtime booking state in `data/runtime/state.json` (atomic tmp+rename writes).
- **Availability**: Generated for a rolling 14-day window from each provider's schedule. A slot is free unless an active booking (pending/confirmed/rescheduled) or a manual block holds it.
- **Concurrency & Locking**: `BookingService.create` checks and inserts synchronously on Node's single thread, so of N concurrent requests for a slot exactly one succeeds; the rest get `409 SLOT_UNAVAILABLE` with alternatives.
- **Built-in agent** (`src/agent/`): rule-based NLU (services, PIN codes incl. spoken digits, areas, relative dates, times, Hinglish) feeding a dialogue state machine that mirrors the Make.com prompt rules.

### 2. Frontend Application (`frontend/`)
- **Technology**: React 18, Vite, TypeScript, CSS design tokens (light/dark).
- **Port**: `5173` in dev (proxies `/api` to `8000`); served by Express in production.
- **Voice Engine** (`src/lib/speech.ts`): SpeechRecognition with live captions and a mic-level orb; MediaRecorder → `/api/voice/stt` (ElevenLabs) fallback with silence detection; speechSynthesis or ElevenLabs TTS. No API keys ever reach the browser.
- **Conversation** (`src/hooks/useAssistant.ts`): one turn = `POST /api/agent/message`; supports hands-free mode (mic re-opens after each reply) and barge-in.
- **Agent switch**: Settings → Built-in agent or Make.com AI Agent (server `MAKE_WEBHOOK_URL` or a custom URL), with automatic fallback.

### 3. Make.com AI Agent Layer (`make/`)
- Configured with custom system prompt ([make/ai-agent-prompt.md](../make/ai-agent-prompt.md)).
- Tool integrations defined via standard OpenAPI/JSON specifications ([make/tool-definitions.md](../make/tool-definitions.md)).
- Integrates Make Data Store for multi-turn conversational session context.
