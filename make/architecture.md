# Make.com Primary Orchestration Architecture

This document describes the architectural flow where **Make.com serves as the central orchestration and AI agent layer** for the PS-06 Voice Service Booking Agent.

---

## 1. High-Level Architecture Flow

```
+-------------------------------------------------------------------------+
|                              USER CLIENT                                |
|  - Voice Input (Microphone via MediaRecorder / Web Audio)               |
|  - Local Speech-To-Text (Browser SpeechRecognition or ElevenLabs STT)    |
|  - Modern Visual UI (Transcripts, Option Cards, Booking Badge)          |
|  - Local Audio Playback (SpeechSynthesis / ElevenLabs TTS)              |
+-------------------------------------------------------------------------+
                                    │
                                    │ HTTP POST (JSON)
                                    ▼
+-------------------------------------------------------------------------+
|                        MAKE.COM SCENARIO WEBHOOK                        |
|  - Endpoint: https://hook.eu1.make.com/...                              |
|  - Ingestion: { session_id, customer_id, message, language }           |
+-------------------------------------------------------------------------+
                                    │
                                    │ Routes conversation turn
                                    ▼
+-------------------------------------------------------------------------+
|                       MAKE.COM AI AGENT MODULE                          |
|  - Model Context & Prompts: ai-agent-prompt.md                          |
|  - Intent Extraction: Problem Category, Date, Time, PIN Code            |
|  - Deduplication: Never re-asks known information                       |
|  - Missing Data Detection: Identifies absent PIN code or date           |
|  - Comparison Logic: Ranks providers by Rating, Price, ETA, Slots       |
|  - Confirmation Enforcement: Rejects automatic bookings                 |
+-------------------------------------------------------------------------+
                                    │
            Tool Invocations via HTTP Make Modules (REST)
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
+───────────────────────────────+     +──────────────────────────────────+
|  PROVIDER API (/api/providers)|     |   BOOKING API (/api/bookings)    |
|  - Deterministic filtering    |     |  - Atomic slot locking           |
|  - Real-time availability     |     |  - Dynamic Booking ID generation |
|  - Exact & nearest matches    |     |  - Double-booking prevention     |
+───────────────────────────────+     +──────────────────────────────────+
         │                                                     │
         └──────────────────────────┬──────────────────────────┘
                                    ▼
+-------------------------------------------------------------------------+
|                    MAKE NOTIFICATION & RETURN LAYER                     |
|  - Make Data Store: Updates session history and context                 |
|  - Notification Module: SMS/Email trigger for confirmed bookings        |
|  - Webhook Response: Returns formatted voice text & metadata            |
+-------------------------------------------------------------------------+
                                    │
                                    ▼
                               USER VOICE
```

---

## 2. Conversational Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Voice UI
    participant Webhook as Make.com Webhook
    participant Agent as Make AI Agent
    participant MockAPI as Mock REST API

    User->>Frontend: Speaks: "My AC is not cooling. Need someone tomorrow evening."
    Frontend->>Webhook: POST { message: "...", session_id: "S1001" }
    Webhook->>Agent: Prompt execution with context
    Agent-->>Webhook: Missing PIN code detected
    Webhook-->>Frontend: { text: "Sure. What is your PIN code?" }
    Frontend->>User: Audio & text response

    User->>Frontend: Speaks: "560064"
    Frontend->>Webhook: POST { message: "560064", session_id: "S1001" }
    Webhook->>Agent: Route turn
    Agent->>MockAPI: Tool Call: POST /api/providers/search
    MockAPI-->>Agent: Returns [Rahul Kumar, Arun Services, ...]
    Agent->>Agent: Compare ratings, prices, and available slots
    Agent-->>Webhook: "Found 3 technicians. Rahul Kumar is ₹399 (6-7 PM), Arun is ₹349..."
    Webhook-->>Frontend: Options payload + comparison speech
    Frontend->>User: Audio playback & visual provider cards

    User->>Frontend: Speaks: "Yes" (prefers Rahul Kumar)
    Frontend->>Webhook: POST { message: "Yes", session_id: "S1001" }
    Webhook->>Agent: Pre-booking intent
    Agent-->>Webhook: "Rahul Kumar is ₹399 tomorrow 6-7 PM. Shall I confirm the booking?"
    Webhook-->>Frontend: Explicit confirmation prompt
    Frontend->>User: Prompts for final confirmation

    User->>Frontend: Speaks: "Yes, book him."
    Frontend->>Webhook: POST { message: "Yes, book him.", session_id: "S1001" }
    Webhook->>Agent: Explicit confirmation verified
    Agent->>MockAPI: Tool Call: POST /api/bookings
    MockAPI-->>Agent: { success: true, booking_id: "AC2841", status: "confirmed" }
    Agent-->>Webhook: "Your AC technician is booked. Booking ID is AC2841."
    Webhook-->>Frontend: Booking confirmed + vocalization
    Frontend->>User: Speaks confirmation & displays booking pass
```
