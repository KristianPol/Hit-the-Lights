import { Router, Request, Response } from 'express';
import { HTLService } from '../services/HTLService';
import { RegistrationService } from '../services/RegistrationService';
import { AuthenticationService } from '../services/AuthenticationService';
import { Unit } from '../database/unit';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      await unit.complete(false);
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const registrationService = new RegistrationService(unit);
    const result = await registrationService.register({ username, password });
    await unit.complete(true);

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
    await unit.complete(false);
    console.error('Register endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});


authRouter.post('/login', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const { username, password } = req.body;
    console.log('📥 Login request body:', req.body);

    if (!username || !password) {
      await unit.complete();
      res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
      return;
    }

    const authService = new AuthenticationService(unit);
    const result = await authService.login({ username, password });
    await unit.complete();

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
    await unit.complete();
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

// Profile picture upload: accepts { userId, profilePictureBase64 }
authRouter.post('/profile-picture', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = Number(req.body?.userId);
    const base64 = req.body?.profilePictureBase64;
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    if (!base64 || typeof base64 !== 'string') {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'profilePictureBase64 is required' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.updateProfilePicture({ userId, profilePictureBase64: base64 });
    await unit.complete(true);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err: any) {
    await unit.complete(false);
    console.error('POST profile-picture error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// Serve stored profile picture binary for a user
authRouter.get('/profile-picture/:userId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const buffer = await userService.getProfilePicture(userId);
    await unit.complete();

    if (!buffer) {
      res.status(404).json({ success: false, error: 'Profile picture not found' });
      return;
    }

    // Try to detect image MIME type from header bytes
    let contentType = 'application/octet-stream';
    try {
      if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        contentType = 'image/png';
      } else if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
        contentType = 'image/jpeg';
      } else if (buffer.length >= 3 && buffer.slice(0,3).toString('ascii') === 'GIF') {
        contentType = 'image/gif';
      } else if (buffer.length >= 12 && buffer.slice(0,4).toString('ascii') === 'RIFF' && buffer.slice(8,12).toString('ascii') === 'WEBP') {
        contentType = 'image/webp';
      }
    } catch (e) {
      // ignore detection errors
    }

    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  } catch (err: any) {
    await unit.complete();
    console.error('GET profile-picture error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// Get basic user info (without password)
authRouter.get('/user/:userId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const user = await userService.getUserById(userId);
    await unit.complete();

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.status(200).json({ success: true, user });
  } catch (err: any) {
    await unit.complete();
    console.error('GET user error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.get('/user/:userId/achievements', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.getUserAchievements(userId);
    await unit.complete();

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(200).json({ success: true, achievements: result.achievements ?? [] });
  } catch (err: any) {
    await unit.complete();
    console.error('GET user achievements error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/user/:userId/achievements', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    console.log('📥 POST achievements body:', JSON.stringify(req.body));
    const achievements = Array.isArray(req.body?.achievements) ? req.body.achievements : null;
    if (!achievements) {
      console.log('📥 POST achievements invalid payload. body type:', typeof req.body, 'keys:', Object.keys(req.body || {}));
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid achievements payload' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.saveUserAchievements(userId, achievements);

    if (!result.success) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    await unit.complete(true);
    res.status(200).json({ success: true });
  } catch (err: any) {
    await unit.complete(false);
    console.error('POST user achievements error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// Add playtime seconds to user's total and return new total
authRouter.post('/playtime', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = Number(req.body?.userId);
    const seconds = Number(req.body?.seconds);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid seconds value' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.addPlaytime(userId, Math.round(seconds));
    await unit.complete(true);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json({ success: true, playtimeSeconds: result.playtimeSeconds });
  } catch (err: any) {
    await unit.complete(false);
    console.error('POST playtime error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// Per-user settings endpoints
authRouter.get('/user/:userId/settings', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const settingsJson = await userService.getUserSettings(userId);
    await unit.complete();

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
    await unit.complete();
    console.error('GET settings error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/user/:userId/settings', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const settings = req.body?.settings ?? null;
    const settingsJson = settings ? JSON.stringify(settings) : null;

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.updateUserSettings(userId, settingsJson ?? '');
    await unit.complete(true);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err: any) {
    await unit.complete(false);
    console.error('POST settings error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// Submit per-run gameplay stats to be accumulated on the user's record
authRouter.post('/user/:userId/run', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const payload = req.body ?? {};
    const perfect = Number(payload.perfect) || 0;
    const good = Number(payload.good) || 0;
    const glimmer = Number(payload.glimmer) || 0;
    const miss = Number(payload.miss) || 0;
    const score = Number(payload.score) || 0;
    const accuracy = Number(payload.accuracy) || 0;

    const userService = new (require('../services/UserService').UserService)(unit);

    // Verify user exists
    const check = await unit.prepare<{ id: number }, { userId: number }>('SELECT id FROM User WHERE id = $userId', { userId }).get();
    if (!check) {
      await unit.complete();
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await unit.prepare(
      `UPDATE User SET
         perfect_total = COALESCE(perfect_total, 0) + $perfect,
         good_total = COALESCE(good_total, 0) + $good,
         glimmer_total = COALESCE(glimmer_total, 0) + $glimmer,
         miss_total = COALESCE(miss_total, 0) + $miss,
         total_score = COALESCE(total_score, 0) + $score,
         total_accuracy = COALESCE(total_accuracy, 0) + $accuracy,
         runs_count = COALESCE(runs_count, 0) + 1
       WHERE id = $userId`,
      { perfect, good, glimmer, miss, score, accuracy, userId }
    ).run();

    await unit.complete(true);
    res.status(200).json({ success: true });
  } catch (err: any) {
    await unit.complete(false);
    console.error('POST run stats error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

// Retrieve aggregated analytics for a user
authRouter.get('/user/:userId/analytics', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = Number(req.params['userId']);
    if (!Number.isFinite(userId) || userId <= 0) {
      await unit.complete();
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const stmt = unit.prepare<{
      perfect_total: number; good_total: number; glimmer_total: number; miss_total: number;
      total_score: number; total_accuracy: number; runs_count: number; playtime_seconds?: number
    }, { userId: number }>(
      `SELECT perfect_total, good_total, glimmer_total, miss_total, total_score, total_accuracy, runs_count, playtime_seconds
       FROM User WHERE id = $userId`,
      { userId }
    );

    const row = await stmt.get();
    await unit.complete();

    if (!row) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const runs = row.runs_count || 0;
    const avgScore = runs > 0 ? (row.total_score / runs) : 0;
    const avgAccuracy = runs > 0 ? (row.total_accuracy / runs) : 0;

    res.status(200).json({
      success: true,
      analytics: {
        runs: runs,
        averageScore: Number(avgScore.toFixed(2)),
        averageAccuracy: Number(avgAccuracy.toFixed(2)),
        perfectTotal: row.perfect_total || 0,
        goodTotal: row.good_total || 0,
        okayTotal: row.glimmer_total || 0,
        missTotal: row.miss_total || 0,
        playtimeSeconds: row.playtime_seconds || 0
      }
    });
  } catch (err: any) {
    await unit.complete();
    console.error('GET analytics error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});
