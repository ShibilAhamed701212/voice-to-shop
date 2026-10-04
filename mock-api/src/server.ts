import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env from mock-api/.env or the repo root .env, whichever exists.
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import healthRouter from './routes/health.js';
import providersRouter from './routes/providers.js';
import bookingsRouter from './routes/bookings.js';
import customersRouter from './routes/customers.js';
import agentRouter from './routes/agent.js';
import configRouter from './routes/config.js';
import voiceRouter from './routes/voice.js';

const app = express();
// `--port 8000` (used by `npm run dev`) wins over PORT so a parent process's PORT can't hijack the API.
const portFlag = process.argv.indexOf('--port');
const PORT = Number(portFlag > -1 ? process.argv[portFlag + 1] : process.env.PORT) || 8000;

app.disable('x-powered-by');
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: '1mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });
}

app.use('/', healthRouter);
app.use('/api', healthRouter);
app.use('/api', configRouter);
app.use('/api', agentRouter);
app.use('/api/providers', providersRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/voice', voiceRouter);

// Serve the built frontend (production / Render) when it exists.
const frontendDist = [
  path.join(__dirname, '..', '..', 'frontend', 'dist'),
  path.resolve(process.cwd(), 'frontend', 'dist')
].find(dir => fs.existsSync(path.join(dir, 'index.html')));

if (frontendDist) {
  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`
  });
});

// Malformed JSON and unexpected errors return JSON instead of an HTML stack trace.
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    success: false,
    error: err.type === 'entity.parse.failed' ? 'INVALID_JSON' : status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n  VoiceFix API      http://localhost:${PORT}/health`);
    console.log(`  Agent endpoint    POST /api/agent/message`);
    console.log(`  Claude AI agent   ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'off — add ANTHROPIC_API_KEY to .env (offline agent in use)'}`);
    console.log(`  Make.com webhook  ${process.env.MAKE_WEBHOOK_URL ? 'configured' : 'not configured (built-in agent only)'}`);
    console.log(`  ElevenLabs voice  ${process.env.ELEVENLABS_API_KEY ? 'configured' : 'not configured (browser speech)'}`);
    if (frontendDist) console.log(`  Frontend          http://localhost:${PORT}/`);
    console.log('');
  });
}

export default app;
