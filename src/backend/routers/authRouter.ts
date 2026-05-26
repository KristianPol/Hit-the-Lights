import { Router, Request, Response } from 'express';
import { HTLService } from '../services/HTLService';
import { RegistrationService } from '../services/RegistrationService';
import { AuthenticationService } from '../services/AuthenticationService';
import { Unit } from '../database/unit';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const unit = new Unit(false);
    const registrationService = new RegistrationService(unit);
    const result = registrationService.register({ username, password });
    unit.complete(true);

    if (result.success) {
      const htlService = new HTLService(null as any);
      const userJson = result.user ? htlService.userToJSON(result.user) : undefined;
      res.status(201).json({
        success: true,
        userId: result.userId,
        user: userJson,
        message: 'User registered successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('Register endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});


authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const unit = new Unit(true);
    const authService = new AuthenticationService(unit);
    const result = authService.login({ username, password });
    unit.complete();

    if (result.success) {
      // Return user without password
      const htlService = new HTLService(null as any);
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
    console.error('Login endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

authRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    service: 'auth',
    timestamp: new Date().toISOString()
  });
});

// Profile picture and user endpoints disabled - to be refactored
// TODO: Create UserServiceAsync and update these endpoints

authRouter.post('/profile-picture', (_req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'Profile picture endpoint temporarily disabled during Postgres migration'
  });
});

authRouter.get('/profile-picture/:userId', (_req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'Profile picture endpoint temporarily disabled during Postgres migration'
  });
});

authRouter.get('/user/:userId', (_req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'User endpoint temporarily disabled during Postgres migration'
  });
});

authRouter.post('/playtime', (_req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'Playtime endpoint temporarily disabled during Postgres migration'
  });
});

// Per-user settings endpoints
authRouter.get('/user/:userId/settings', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const unit = new Unit(true);
    const userService = new (require('../services/UserService').UserService)(unit);
    const settingsJson = userService.getUserSettings(userId);
    unit.complete();

    if (settingsJson === undefined) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    let settings = null;
    try {
      settings = settingsJson ? JSON.parse(settingsJson) : null;
    } catch {
      settings = null;
    }

    res.status(200).json({ success: true, settings });
  } catch (err: any) {
    console.error('GET settings error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/user/:userId/settings', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const settings = req.body?.settings ?? null;
    const settingsJson = settings ? JSON.stringify(settings) : null;

    const unit = new Unit(false);
    const userService = new (require('../services/UserService').UserService)(unit);
    const result = userService.updateUserSettings(userId, settingsJson ?? '');
    unit.complete(true);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('POST settings error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

