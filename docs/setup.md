# PS-06 Service Booking Voice Agent: Setup & Deployment Guide

## Prerequisites
- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm**: v9.0.0 or later
- **Docker & Docker Compose** (Optional, for containerized run)

---

## Quick Start (Local Development)

### Step 1: Start the Mock REST API
```bash
cd PS06-Service-Booking-Agent/mock-api
npm install
npm run dev
```
The API server starts on **http://localhost:8000**.
Verify with:
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"PS06 Mock Service API","version":"1.0.0"}
```

### Step 2: Start the Frontend
In a new terminal window:
```bash
cd PS06-Service-Booking-Agent/frontend
npm install
npm run dev
```
The Vite development server will start on **http://localhost:5173**.

---

## Environment Configuration

Copy `.env.example` to `frontend/.env`:
```env
# URL of your Make.com scenario custom webhook
VITE_MAKE_WEBHOOK_URL=https://hook.eu1.make.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# URL of local/cloud mock REST API
VITE_MOCK_API_URL=http://localhost:8000

# Optional ElevenLabs integration for ultra-realistic voice
VITE_ELEVENLABS_API_KEY=
VITE_ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

---

## Running Automated Tests

Run the full Vitest suite in `mock-api/`:
```bash
cd PS06-Service-Booking-Agent/mock-api
npm test
```
This tests:
- Provider category and pincode searches
- Slot availability updates
- Dynamic booking ID generation
- Double-booking prevention (`SLOT_UNAVAILABLE`)
- Rescheduling & cancellation lifecycles
- Full end-to-end conversation simulation matching the demo criteria

---

## Running with Docker Compose

To start both services in isolated Docker containers:
```bash
cd PS06-Service-Booking-Agent
docker compose up -d
```
- Mock API: `http://localhost:8000`
- Frontend: `http://localhost:5173`
