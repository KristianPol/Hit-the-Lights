import path from "path";
import fs from "fs";
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

function findProjectRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    // angular.json is the definitive project-root marker (skip backend/package.json)
    if (fs.existsSync(path.join(dir, 'angular.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from 'express-rate-limit';
import { authRouter, songRouter, friendshipRouter, messageRouter } from "../routers";
import { authMiddleware } from "../middleware/authMiddleware";
import { Unit, sql } from './unit';

const DATABASE_URL = process.env['DATABASE_URL'];
console.log('🔍 DATABASE_URL loaded:', DATABASE_URL ? 'yes' : 'NO — .env file may be missing');
console.log('📋 Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('PORT') || k.includes('URL')));

const app = express();
const PORT = Number(process.env['PORT']) || 3000;
const PROJECT_ROOT = findProjectRoot();
const FRONTEND_DIST = path.resolve(PROJECT_ROOT, 'dist', 'Hit-The-Lights', 'browser');
const isDev = process.env['NODE_ENV'] !== 'production';

console.log('🗄️  Database Mode: PostgreSQL');
console.log('📁 PROJECT_ROOT:', PROJECT_ROOT);
console.log('📁 FRONTEND_DIST:', FRONTEND_DIST);

// Ensure tables exist before accepting requests
Unit.initTables().then(() => {
  console.log('✅ Database schema ensured');
}).catch((err) => {
  console.error('❌ Failed to ensure database schema:', err);
});

const ALLOWED_ORIGINS = isDev
  ? ['http://localhost:4200']
  : [
      'https://hitthelights.xyz',
      'https://hit-the-lights-j6bl.onrender.com'
    ];

app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts, please try again later.' }
});

app.use(globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', authMiddleware, express.static(path.resolve(process.cwd(), 'uploads')));
app.use(express.static(FRONTEND_DIST));

app.use('/api/auth', authRouter);
app.use('/api/songs', songRouter);
app.use('/api/friends', friendshipRouter);
app.use('/api/messages', messageRouter);

app.get('/api/health', (_req: any, res: any) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'PostgreSQL'
  });
});

app.use((req: any, res: any) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found'
    });
    return;
  }

  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Server error:', err);
  // Do not leak internal error messages to the client
  const statusCode = typeof err?.status === 'number' ? err.status : 500;
  res.status(statusCode).json({
    error: 'Internal Server Error',
    message: 'Something went wrong. Please try again later.'
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  POST http://localhost:${PORT}/api/auth/register`);
  console.log(`  POST http://localhost:${PORT}/api/auth/login`);
  console.log(`  GET  http://localhost:${PORT}/api/auth/health`);
  console.log(`  POST http://localhost:${PORT}/api/songs/add`);
  console.log(`  GET  http://localhost:${PORT}/api/songs/all`);
  console.log(`  GET  http://localhost:${PORT}/api/songs/:id`);
  console.log(`  GET  http://localhost:${PORT}/api/friends/search`);
  console.log(`  GET  http://localhost:${PORT}/api/friends/friends/:userId`);
  console.log(`  GET  http://localhost:${PORT}/api/friends/pending/:userId`);
  console.log(`  POST http://localhost:${PORT}/api/friends/request`);
  console.log(`  POST http://localhost:${PORT}/api/friends/accept`);
  console.log(`  POST http://localhost:${PORT}/api/messages/send`);
  console.log(`  GET  http://localhost:${PORT}/api/messages/conversation/:userId/:otherUserId`);
  console.log(`  GET  http://localhost:${PORT}/api/messages/conversations/:userId`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
});

// Handle uncaught exceptions — log but do not crash the server
process.on('uncaughtException', (err: Error) => {
  console.error('❌ Uncaught Exception:', err);
});

// Handle unhandled promise rejections — log but do not crash the server
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    await sql().end();
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(async () => {
    await sql().end();
    console.log('Server closed');
    process.exit(0);
  });
});
