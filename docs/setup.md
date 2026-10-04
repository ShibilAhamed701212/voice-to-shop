# Setup & Deployment

## Prerequisites
- Node.js 20+ and npm 9+
- Optional: Docker, a Make.com account, an ElevenLabs API key

## Local development

```bash
npm run setup   # root + mock-api + frontend installs, copies .env.example → .env
npm run dev     # API http://localhost:8000, app http://localhost:5173
```

Vite proxies `/api` and `/health` to the API, so the browser only ever talks to one origin. To run the two halves separately, use `npm run dev:api` and `npm run dev:web`.

Health check:

```bash
curl http://localhost:8000/health
```

## Voice

| Capability | Without keys | With `ELEVENLABS_API_KEY` |
| --- | --- | --- |
| Speech → text | Browser SpeechRecognition (Chrome, Edge, Safari) with live captions | Also works in browsers without it (e.g. Firefox), via MediaRecorder → `/api/voice/stt` |
| Text → speech | Browser speechSynthesis | Pick "ElevenLabs" under Settings → Voice output |

The microphone needs a secure context: `localhost` or HTTPS.

## Make.com mode

1. Build the scenario from [make/README.md](../make/README.md). End it with a **Webhook response** module that returns JSON containing `text`, plus optionally `state`, `options` and `booking`.
2. Put the webhook URL in `.env` as `MAKE_WEBHOOK_URL`, or paste it into Settings → Agent brain → Custom webhook URL. The pasted URL is called straight from the browser.
3. Choose **Make.com AI Agent** in Settings.

If the webhook errors, times out (30s) or returns no `text`, the built-in agent answers instead and the chat shows a notice.

## Tests

```bash
npm test
```

The tests need Node 22.12 or newer (Vitest 5); the app itself runs on Node 20. They freeze the clock with `APP_FIXED_NOW`. They cover provider search and ranking, the rolling availability window, booking, double-booking (including concurrent requests), reschedule and cancel, PATCH and input validation, the full demo conversation, and NLU parsing (dates, times, PIN codes, Hinglish).

## Production

### Render
`render.yaml` builds both packages (`npm run build`) and starts Express (`npm start`), which serves the app and the API on one port. Set `ANTHROPIC_API_KEY`, `MAKE_WEBHOOK_URL` and `ELEVENLABS_API_KEY` in the Render dashboard as needed. The blueprint also sets `ALLOW_RESET=true`, so anyone can restore the demo data on the deployed site; remove it if that's not wanted. On the free tier the disk is ephemeral, so bookings reset on each deploy.

### Docker

```bash
docker compose up --build    # http://localhost:8000
```

Bookings persist in the `voicefix-state` volume.
