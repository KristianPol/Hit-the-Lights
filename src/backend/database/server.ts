import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { authRouter, songRouter } from "../routers";
import { Unit } from './unit';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.use('/api/auth', authRouter);
app.use('/api/songs', songRouter);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  POST http://localhost:${PORT}/api/auth/register`);
  console.log(`  POST http://localhost:${PORT}/api/auth/login`);
  console.log(`  GET  http://localhost:${PORT}/api/auth/health`);
  console.log(`  POST http://localhost:${PORT}/api/songs/add`);
  console.log(`  GET  http://localhost:${PORT}/api/songs/all`);
  console.log(`  GET  http://localhost:${PORT}/api/songs/:id`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
});
