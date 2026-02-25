import { Router, Request, Response } from 'express';
import { Unit } from '../unit';
import { HTLService } from '../HTLService';
import { RegistrationService, AuthenticationService } from '../services';

export const authRouter = Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
authRouter.post('/register', (req: Request, res: Response) => {
  const unit = new Unit(false);
  
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const registrationService = new RegistrationService(unit);
    const result = registrationService.register({ username, password });

    if (result.success) {
      unit.complete(true); // Commit transaction
      res.status(201).json({
        success: true,
        userId: result.userId,
        message: 'User registered successfully'
      });
    } else {
      unit.complete(false); // Rollback transaction
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    unit.complete(false); // Rollback transaction
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/login
 * Login a user
 */
authRouter.post('/login', (req: Request, res: Response) => {
  const unit = new Unit(true); // Read-only for login
  
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const authService = new AuthenticationService(unit);
    const result = authService.login({ username, password });

    unit.complete(); // Close read-only connection

    if (result.success) {
      // Return user without password
      const htlService = new HTLService(unit);
      const userJson = htlService.userToJSON(result.user!);
      
      res.status(200).json({
        success: true,
        user: userJson,
        message: 'Login successful'
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    unit.complete(); // Close read-only connection
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/auth/health
 * Health check endpoint
 */
authRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    service: 'auth',
    timestamp: new Date().toISOString()
  });
});
