import { Request, Response, NextFunction } from 'express';
import { JWTService } from '../utils/JWTService';

declare global {
  namespace Express {
    interface Request {
      authenticatedUserId?: number;
      authenticatedUsername?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = JWTService.verify(token);
  if (!payload) {
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
    return;
  }

  req.authenticatedUserId = payload.userId;
  req.authenticatedUsername = payload.username;
  next();
}
