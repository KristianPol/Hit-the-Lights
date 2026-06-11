import { Router, Request, Response } from 'express';
import { HTLService } from '../services/HTLService';
import { RegistrationService } from '../services/RegistrationService';
import { AuthenticationService } from '../services/AuthenticationService';
import { Unit } from '../database/unit';
import { JWTService } from '../utils/JWTService';
import { PasswordValidator } from '../utils/PasswordValidator';
import { PasswordHasher } from '../utils/PasswordHasher';
import { authMiddleware, adminMiddleware } from '../middleware/authMiddleware';

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
      const token = userJson ? JWTService.sign(userJson.id, userJson.username) : undefined;
      res.status(201).json({
        success: true,
        userId: result.userId,
        user: userJson,
        token,
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
      const htlService = new HTLService(null as any);
      const userJson = htlService.userToJSON(result.user!);
      const token = JWTService.sign(userJson.id, userJson.username, (result.user as any)?.role);

      res.status(200).json({
        success: true,
        user: userJson,
        token,
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

authRouter.post('/profile-picture', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = req.authenticatedUserId!;
    const base64 = req.body?.profilePictureBase64;

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

authRouter.patch('/profile', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = req.authenticatedUserId!;
    const userService = new (require('../services/UserService').UserService)(unit);

    const result = await userService.updateProfile({
      userId,
      bio: req.body?.bio,
      location: req.body?.location,
      favoriteGenre: req.body?.favoriteGenre,
      githubUrl: req.body?.githubUrl,
      osuUrl: req.body?.osuUrl,
      robloxUrl: req.body?.robloxUrl,
      discordUrl: req.body?.discordUrl,
      youtubeUrl: req.body?.youtubeUrl,
      twitchUrl: req.body?.twitchUrl
    });
    await unit.complete(true);

    if (!result.success) {
      const status = result.error === 'User not found' ? 404 : 400;
      res.status(status).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (err: any) {
    await unit.complete(false);
    console.error('PATCH profile error', err);
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

    // Check for R2 URL first
    const r2Url = await userService.getProfilePictureUrl(userId);
    if (r2Url) {
      await unit.complete();
      res.redirect(302, r2Url);
      return;
    }

    // Fall back to legacy BYTEA storage
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

authRouter.get('/user/:userId/achievements', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = Number(req.params['userId']);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.getUserAchievements(authUserId);
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

authRouter.post('/user/:userId/achievements', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const requestedUserId = Number(req.params['userId']);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const achievements = Array.isArray(req.body?.achievements) ? req.body.achievements : null;
    if (!achievements) {
      await unit.complete(false);
      res.status(200).json({ success: true, warning: 'No achievements to save' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.saveUserAchievements(authUserId, achievements);

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

authRouter.post('/playtime', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = req.authenticatedUserId!;
    const seconds = Number(req.body?.seconds);

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

authRouter.get('/user/:userId/settings', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = Number(req.params['userId']);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'Forbidden: Cannot access another user\'s settings' });
      return;
    }

    const userService = new (require('../services/UserService').UserService)(unit);
    const settingsJson = await userService.getUserSettings(authUserId);
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

authRouter.post('/user/:userId/settings', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const requestedUserId = Number(req.params['userId']);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'Forbidden: Cannot modify another user\'s settings' });
      return;
    }

    const settings = req.body?.settings ?? null;
    const settingsJson = settings ? JSON.stringify(settings) : null;

    const userService = new (require('../services/UserService').UserService)(unit);
    const result = await userService.updateUserSettings(authUserId, settingsJson ?? '');
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

authRouter.post('/user/:userId/run', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const requestedUserId = Number(req.params['userId']);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const payload = req.body ?? {};
    const perfect = Number(payload.perfect) || 0;
    const good = Number(payload.good) || 0;
    const glimmer = Number(payload.glimmer) || 0;
    const miss = Number(payload.miss) || 0;
    const score = Number(payload.score) || 0;
    const accuracy = Number(payload.accuracy) || 0;

    const check = await unit.prepare<{ id: number }, { userId: number }>('SELECT id FROM "User" WHERE id = $userId', { userId: authUserId }).get();
    if (!check) {
      await unit.complete();
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await unit.prepare(
      `UPDATE "User" SET
         perfect_total = COALESCE(perfect_total, 0) + $perfect,
         good_total = COALESCE(good_total, 0) + $good,
         glimmer_total = COALESCE(glimmer_total, 0) + $glimmer,
         miss_total = COALESCE(miss_total, 0) + $miss,
         total_score = COALESCE(total_score, 0) + $score,
         total_accuracy = COALESCE(total_accuracy, 0) + $accuracy,
         runs_count = COALESCE(runs_count, 0) + 1
       WHERE id = $userId`,
      { perfect, good, glimmer, miss, score, accuracy, userId: authUserId }
    ).run();

    await unit.complete(true);
    res.status(200).json({ success: true });
  } catch (err: any) {
    await unit.complete(false);
    console.error('POST run stats error', err);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.get('/user/:userId/analytics', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const requestedUserId = Number(req.params['userId']);
    const authUserId = req.authenticatedUserId!;
    if (requestedUserId !== authUserId) {
      await unit.complete();
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const stmt = unit.prepare<
      { perfect_total: number; good_total: number; glimmer_total: number; miss_total: number;
        total_score: number; total_accuracy: number; runs_count: number; playtime_seconds?: number },
      { userId: number }
    >(
      `SELECT perfect_total, good_total, glimmer_total, miss_total, total_score, total_accuracy, runs_count, playtime_seconds
       FROM "User" WHERE id = $userId`,
      { userId: authUserId }
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

// ─── Admin Endpoints ─────────────────────────────────────────

authRouter.get('/users', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : '';
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (search) {
      conditions.push('LOWER(username) LIKE $search');
      params.search = `%${search.toLowerCase()}%`;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await unit.prepare<
      { id: number; username: string; joinDate: string; role: string; is_banned: number },
      Record<string, unknown>
    >(
      `SELECT id, username, joinDate, role, is_banned FROM "User" ${whereClause} ORDER BY id ASC`,
      params
    ).all();
    await unit.complete();
    res.status(200).json({
      success: true,
      users: rows.map(r => ({
        id: r.id,
        username: r.username,
        joinDate: r.joinDate,
        role: r.role || 'user',
        isBanned: r.is_banned === 1
      }))
    });
  } catch (err: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/grant-admin', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { userId } = req.body;
    const targetId = Number(userId);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    await unit.prepare<unknown, { userId: number }>(
      'UPDATE "User" SET role = \'admin\' WHERE id = $userId',
      { userId: targetId }
    ).run();
    await unit.complete(true);
    res.status(200).json({ success: true, message: 'Admin rights granted' });
  } catch (err: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/revoke-admin', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { userId } = req.body;
    const targetId = Number(userId);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    // Cannot revoke founder (id 2)
    if (targetId === 2) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'Cannot revoke founder admin rights' });
      return;
    }

    await unit.prepare<unknown, { userId: number }>(
      'UPDATE "User" SET role = \'user\' WHERE id = $userId',
      { userId: targetId }
    ).run();
    await unit.complete(true);
    res.status(200).json({ success: true, message: 'Admin rights revoked' });
  } catch (err: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/ban', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { userId } = req.body;
    const targetId = Number(userId);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    // Cannot ban founder (id 2)
    if (targetId === 2) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'Cannot ban the founder' });
      return;
    }

    await unit.prepare<unknown, { userId: number }>(
      'UPDATE "User" SET is_banned = 1 WHERE id = $userId',
      { userId: targetId }
    ).run();
    await unit.complete(true);
    res.status(200).json({ success: true, message: 'User banned' });
  } catch (err: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/unban', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { userId } = req.body;
    const targetId = Number(userId);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    await unit.prepare<unknown, { userId: number }>(
      'UPDATE "User" SET is_banned = 0 WHERE id = $userId',
      { userId: targetId }
    ).run();
    await unit.complete(true);
    res.status(200).json({ success: true, message: 'User unbanned' });
  } catch (err: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

authRouter.post('/reset-password', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const userId = req.authenticatedUserId!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'Current password and new password are required' });
      return;
    }

    // Validate new password
    const validation = PasswordValidator.validate(newPassword);
    if (!validation.valid) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    // Get current password hash
    const userRow = await unit.prepare<{ password: string }, { userId: number }>(
      'SELECT password FROM "User" WHERE id = $userId',
      { userId }
    ).get();

    if (!userRow) {
      await unit.complete(false);
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Verify current password
    let currentValid = PasswordHasher.compare(currentPassword, userRow.password);
    if (!currentValid && !PasswordHasher.isHashed(userRow.password) && userRow.password === currentPassword) {
      currentValid = true;
    }

    if (!currentValid) {
      await unit.complete(false);
      res.status(403).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    // Hash and update new password
    const hashedNew = PasswordHasher.hash(newPassword);
    await unit.prepare<unknown, { userId: number; password: string }>(
      'UPDATE "User" SET password = $password WHERE id = $userId',
      { userId, password: hashedNew }
    ).run();

    await unit.complete(true);
    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});
