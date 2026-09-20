import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import healthRouter from './routes/health.js';
import providersRouter from './routes/providers.js';
import bookingsRouter from './routes/bookings.js';
import customersRouter from './routes/customers.js';
import simulatorRouter from './routes/simulator.js';
import voiceRouter from './routes/voice.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/', healthRouter);
app.use('/api', healthRouter);
app.use('/api/providers', providersRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/customers', customersRouter);
app.use('/api', simulatorRouter);
app.use('/api/voice', voiceRouter);

// Static frontend serving if dist exists
const frontendCandidates = [
  path.join(__dirname, '..', '..', 'frontend', 'dist'),
  path.join(__dirname, '..', 'frontend', 'dist'),
  path.resolve(process.cwd(), 'frontend', 'dist'),
  path.resolve(process.cwd(), 'dist')
];
const frontendDist = frontendCandidates.find(dir => fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html')));

if (frontendDist) {
  console.log(`Serving frontend static files from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // SPA fallback for GET requests that are not API requests
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`
  });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  🚀 PS-06 Service Booking Mock API is running!`);
    console.log(`  📡 Health Check:  http://localhost:${PORT}/health`);
    console.log(`  🔧 Providers API: http://localhost:${PORT}/api/providers`);
    console.log(`  📅 Bookings API:  http://localhost:${PORT}/api/bookings`);
    console.log(`  🤖 Make Sim:      http://localhost:${PORT}/api/make-simulator`);
    console.log(`======================================================\n`);
  });
}

export default app;
