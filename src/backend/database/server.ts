import path from "path";
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

import express from "express";
import cors from "cors";
import { authRouter, songRouter, friendshipRouter, messageRouter } from "../routers";
import { Unit, sql } from './unit';

const DATABASE_URL = process.env['DATABASE_URL'];
console.log('🔍 DATABASE_URL loaded:', DATABASE_URL ? 'yes' : 'NO — .env file may be missing');
console.log('📋 Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('PORT') || k.includes('URL')));

const app = express();
const PORT = Number(process.env['PORT']) || 3000;
// __dirname is dist/database when compiled, or database/ when run with tsx
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const FRONTEND_DIST = path.resolve(PROJECT_ROOT, 'dist', 'Hit-The-Lights', 'browser');

console.log('🗄️  Database Mode: PostgreSQL');
console.log('📁 PROJECT_ROOT:', PROJECT_ROOT);
console.log('📁 FRONTEND_DIST:', FRONTEND_DIST);

// Ensure tables exist before accepting requests
Unit.initTables().then(() => {
  console.log('✅ Database schema ensured');
}).catch((err) => {
  console.error('❌ Failed to ensure database schema:', err);
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.resolve(PROJECT_ROOT, 'uploads')));
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
  res.status(500).json({
    error: 'Internal Server Error',
    message: err?.message || 'Something went wrong'
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

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
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
