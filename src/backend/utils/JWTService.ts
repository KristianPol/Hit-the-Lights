import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] || 'fallback-secret-change-me';

export interface JWTPayload {
  userId: number;
  username: string;
}

export class JWTService {
  static sign(userId: number, username: string): string {
    return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
  }

  static verify(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch {
      return null;
    }
  }
}
