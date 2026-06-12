import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Unit } from '../database/unit';
import { SongService, R2Service } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { Sanitizer } from '../utils/Sanitizer';

export const songRouter = Router();

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const AUDIO_DIR = path.join(UPLOADS_ROOT, 'audio');
const COVER_DIR = path.join(UPLOADS_ROOT, 'covers');
const MAX_COMMENT_LENGTH = 1000;

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

function generateFilename(mimeType: string): string {
  const subType = mimeType.split('/')[1];
  const ext = subType
    ? subType.replace('mpeg', 'mp3').replace('jpeg', 'jpg').replace('x-matroska', 'webm')
    : 'bin';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseVisibility(value: unknown, fallback: boolean = true): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'public') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'private') {
      return false;
    }
  }

  return fallback;
}

const UPLOAD_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes

async function deleteAudioFile(url: string): Promise<void> {
  const key = R2Service.extractKey(url);
  if (key) {
    try { await R2Service.deleteFile(key); } catch { /* ignore cleanup errors */ }
  } else {
    const filename = url.split('/').pop();
    if (filename) {
      const filePath = path.join(AUDIO_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
}

async function deleteCoverFile(url: string): Promise<void> {
  const key = R2Service.extractKey(url);
  if (key) {
    try { await R2Service.deleteFile(key); } catch { /* ignore cleanup errors */ }
  } else {
    const filename = url.split('/').pop();
    if (filename) {
      const filePath = path.join(COVER_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
}

songRouter.post('/add', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const { name, author, bpm, length, audioBase64, audioMimeType, coverBase64, coverMimeType, isPublic, genre } = req.body;
    const ownerId = req.authenticatedUserId!;
    const isAdmin = req.authenticatedUserId === 2 || req.authenticatedRole === 'admin';

    if (!name || !author || !bpm || !length || !audioBase64 || !coverBase64) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'All fields are required' });
      return;
    }

    // Check upload cooldown (admins bypass)
    if (!isAdmin) {
      const cooldownCheck = await unit.prepare<
        { last_song_upload_at: string | null },
        { userId: number }
      >(
        'SELECT last_song_upload_at FROM "User" WHERE id = $userId',
        { userId: ownerId }
      ).get();

      if (cooldownCheck?.last_song_upload_at) {
        const lastUpload = new Date(cooldownCheck.last_song_upload_at).getTime();
        const now = Date.now();
        const remaining = UPLOAD_COOLDOWN_MS - (now - lastUpload);
        if (remaining > 0) {
          const minutes = Math.ceil(remaining / 60000);
          await unit.complete(false);
          res.status(429).json({
            success: false,
            error: `Upload cooldown active. Wait ${minutes} minute${minutes === 1 ? '' : 's'} before uploading again.`
          });
          return;
        }
      }
    }

    const audioFilename = generateFilename(audioMimeType || 'audio/mpeg');
    const coverFilename = generateFilename(coverMimeType || 'image/jpeg');

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const coverBuffer = Buffer.from(coverBase64, 'base64');

    const songUrl = await R2Service.uploadFile(audioBuffer, `songs/${audioFilename}`, audioMimeType || 'audio/mpeg');
    const coverUrl = await R2Service.uploadFile(coverBuffer, `images/covers/${coverFilename}`, coverMimeType || 'image/jpeg');

    const svc = new SongService(unit);
    const result = await svc.addSong({ name, author, bpm: parseInt(bpm, 10), length, songUrl, coverUrl, ownerId, isPublic: parseVisibility(isPublic, true), genre });
    if (result.success) {
      // Update last upload timestamp
      await unit.prepare<unknown, { userId: number }>(
        'UPDATE "User" SET last_song_upload_at = CURRENT_TIMESTAMP WHERE id = $userId',
        { userId: ownerId }
      ).run();
      await unit.complete(true);
      res.status(201).json({ success: true, songId: result.songId, songUrl, coverUrl, ownerId: result.ownerId, isPublic: result.isPublic, message: 'Song added successfully' });
    } else {
      await unit.complete(false);
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/upload-status', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const userId = req.authenticatedUserId!;
    const isAdmin = req.authenticatedUserId === 2 || req.authenticatedRole === 'admin';

    if (isAdmin) {
      await unit.complete();
      res.status(200).json({ success: true, canUpload: true });
      return;
    }

    const row = await unit.prepare<
      { last_song_upload_at: string | null },
      { userId: number }
    >(
      'SELECT last_song_upload_at FROM "User" WHERE id = $userId',
      { userId }
    ).get();

    await unit.complete();

    if (!row?.last_song_upload_at) {
      res.status(200).json({ success: true, canUpload: true });
      return;
    }

    const lastUpload = new Date(row.last_song_upload_at).getTime();
    const remaining = UPLOAD_COOLDOWN_MS - (Date.now() - lastUpload);

    if (remaining > 0) {
      res.status(200).json({ success: true, canUpload: false, remainingSeconds: Math.ceil(remaining / 1000) });
    } else {
      res.status(200).json({ success: true, canUpload: true });
    }
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/all', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    console.log('📥 Backend: GET /api/songs/all - Fetching all songs');
    const viewerId = req.authenticatedUserId ?? parseOptionalNumber(req.query['viewerId']);
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    const genre = typeof req.query['genre'] === 'string' ? req.query['genre'] : undefined;
    const sort = typeof req.query['sort'] === 'string' ? req.query['sort'] : undefined;
    const ownerId = parseOptionalNumber(req.query['ownerId']);
    const visibilityRaw = req.query['visibility'];
    const visibility = typeof visibilityRaw === 'string' && ['all', 'public', 'private'].includes(visibilityRaw)
      ? visibilityRaw as 'all' | 'public' | 'private'
      : 'all';
    const songService = new SongService(unit);
    const songs = await songService.getAllSongs(viewerId, search, genre, sort, ownerId, visibility);
    console.log(`✅ Backend: Found ${songs.length} songs in database`);
    await unit.complete();
    res.status(200).json({ success: true, songs });
  } catch (error: any) {
    console.error('❌ Backend: Error fetching songs', error?.message || error);
    console.error('❌ Backend: Error stack', error?.stack || 'no stack');
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/count/:ownerId', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const ownerId = parseInt(req.params['ownerId'] as string, 10);
    const viewerId = req.authenticatedUserId ?? parseOptionalNumber(req.query['viewerId']);
    if (isNaN(ownerId) || ownerId <= 0) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid owner ID' }); return; }
    const songService = new SongService(unit);
    const count = await songService.getUploadedSongCount(ownerId, viewerId);
    await unit.complete();
    res.status(200).json({ success: true, count });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/:id', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const viewerId = req.authenticatedUserId ?? parseOptionalNumber(req.query['viewerId']);
    if (isNaN(songId)) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const songService = new SongService(unit);
    const song = await songService.getSongById(songId, viewerId);
    await unit.complete();
    if (song) res.status(200).json({ success: true, song }); else res.status(404).json({ success: false, error: 'Song not found' });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.post('/:id/like', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const userId = req.authenticatedUserId!;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const svc = new SongService(unit);
    const result = await svc.likeSong(songId, userId);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, message: 'Song liked' }); } else { await unit.complete(false); res.status(400).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.delete('/:id/like', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const userId = req.authenticatedUserId!;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const svc = new SongService(unit);
    const result = await svc.unlikeSong(songId, userId);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, message: 'Song unliked' }); } else { await unit.complete(false); res.status(400).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.post('/:id/play', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const svc = new SongService(unit);
    const result = await svc.incrementPlayCount(songId);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, message: 'Play count incremented' }); } else { await unit.complete(false); res.status(400).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.patch('/:id/visibility', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const ownerId = req.authenticatedUserId!;
    const { isPublic } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    const parsedVisibility = parseVisibility(isPublic, true);

    const svc = new SongService(unit);
    const result = await svc.updateSongVisibility(songId, ownerId, parsedVisibility);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, song: result.song, message: 'Song visibility updated' }); } else { await unit.complete(false); res.status(result.error === 'Song not found' ? 404 : 403).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const requesterId = req.authenticatedUserId!;
    const { name, author, bpm, length, genre, isPublic, audioBase64, audioMimeType, coverBase64, coverMimeType } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const svc = new SongService(unit);
    const existingSong = await svc.getSongById(songId, requesterId);
    if (!existingSong) { await unit.complete(false); res.status(404).json({ success: false, error: 'Song not found' }); return; }

    let songUrl = existingSong.songUrl;
    let coverUrl = existingSong.coverUrl;
    let oldAudioUrl: string | undefined;
    let oldCoverUrl: string | undefined;

    if (audioBase64 && typeof audioBase64 === 'string') {
      const audioFilename = generateFilename(audioMimeType || 'audio/mpeg');
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      songUrl = await R2Service.uploadFile(audioBuffer, `songs/${audioFilename}`, audioMimeType || 'audio/mpeg');
      oldAudioUrl = existingSong.songUrl;
    }

    if (coverBase64 && typeof coverBase64 === 'string') {
      const coverFilename = generateFilename(coverMimeType || 'image/jpeg');
      const coverBuffer = Buffer.from(coverBase64, 'base64');
      coverUrl = await R2Service.uploadFile(coverBuffer, `images/covers/${coverFilename}`, coverMimeType || 'image/jpeg');
      oldCoverUrl = existingSong.coverUrl;
    }

    const result = await svc.updateSong(songId, requesterId, {
      name: typeof name === 'string' ? name : undefined,
      author: typeof author === 'string' ? author : undefined,
      bpm: parseOptionalNumber(bpm),
      length: typeof length === 'string' ? length : undefined,
      genre: typeof genre === 'string' ? genre : (genre === null ? null : undefined),
      isPublic: isPublic !== undefined ? parseVisibility(isPublic, existingSong.isPublic) : undefined,
      songUrl,
      coverUrl
    });

    if (result.success) {
      await unit.complete(true);
      if (oldAudioUrl) await deleteAudioFile(oldAudioUrl);
      if (oldCoverUrl) await deleteCoverFile(oldCoverUrl);
      res.status(200).json({ success: true, song: result.song, message: 'Song updated successfully' });
    } else {
      await unit.complete(false);
      const status = result.error === 'Song not found' ? 404 : result.error === 'Only the uploader can edit this song' ? 403 : 400;
      res.status(status).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const viewerId = req.authenticatedUserId!;
    const isAdmin = req.authenticatedUserId === 2 || req.authenticatedRole === 'admin';
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const svc = new SongService(unit);
    const result = await svc.deleteSong(songId, viewerId, isAdmin);
    if (result.success) {
      if (result.song?.songUrl) {
        await deleteAudioFile(result.song.songUrl);
      }
      if (result.song?.coverUrl) {
        await deleteCoverFile(result.song.coverUrl);
      }

      await unit.complete(true);
      res.json({ success: true, message: 'Song deleted successfully' });
    } else {
      await unit.complete(false);
      res.status(result.error === 'Only the uploader can delete this song' || result.error === 'Authentication required to delete song' ? 403 : 400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/:songId/difficulties', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const viewerId = req.authenticatedUserId ?? parseOptionalNumber(req.query['viewerId']);
    if (isNaN(songId)) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    const songService = new SongService(unit);
    const difficulties = await songService.getSongDifficulties(songId, viewerId);
    if (difficulties === undefined) { await unit.complete(); res.status(404).json({ success: false, error: 'Song not found or not accessible' }); return; }
    await unit.complete();
    res.status(200).json({ success: true, difficulties });
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.post('/:songId/difficulties', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const ownerId = req.authenticatedUserId!;
    const { difficulty, notes } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    const parsedDifficulty = parseOptionalNumber(difficulty);
    if (parsedDifficulty === undefined) { await unit.complete(false); res.status(400).json({ success: false, error: 'difficulty is required' }); return; }
    if (!Array.isArray(notes)) { await unit.complete(false); res.status(400).json({ success: false, error: 'notes must be an array' }); return; }

    const svc = new SongService(unit);
    const result = await svc.addSongDifficulty(songId, ownerId, parsedDifficulty, notes);
    if (result.success) { await unit.complete(true); res.status(201).json({ success: true, difficulty: result.difficulty, message: 'Difficulty uploaded successfully' }); } else { await unit.complete(false); res.status(result.error === 'Song not found' ? 404 : 400).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.delete('/:songId/difficulties/:difficultyId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const difficultyId = parseInt(req.params['difficultyId'] as string, 10);
    const requesterId = req.authenticatedUserId!;
    if (isNaN(songId) || isNaN(difficultyId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song or difficulty ID' }); return; }

    const svc = new SongService(unit);
    const result = await svc.deleteDifficulty(songId, difficultyId, requesterId);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, message: 'Chart deleted successfully' }); } else { await unit.complete(false); const status = result.error === 'Song not found' || result.error === 'Difficulty not found' ? 404 : result.error === 'Only the uploader can delete difficulties' ? 403 : 400; res.status(status).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.put('/:songId/difficulties/:difficultyId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const difficultyId = parseInt(req.params['difficultyId'] as string, 10);
    const requesterId = req.authenticatedUserId!;
    const { notes } = req.body;
    if (isNaN(songId) || isNaN(difficultyId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song or difficulty ID' }); return; }
    if (!Array.isArray(notes)) { await unit.complete(false); res.status(400).json({ success: false, error: 'notes must be an array' }); return; }

    const svc = new SongService(unit);
    const result = await svc.updateDifficultyChart(songId, difficultyId, requesterId, notes);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, difficulty: result.difficulty, message: 'Chart updated successfully' }); } else { await unit.complete(false); const status = result.error === 'Song not found' || result.error === 'Difficulty not found' ? 404 : result.error === 'Only the uploader can edit charts' ? 403 : 400; res.status(status).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/:songId/difficulties/:difficultyId/leaderboard', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const difficultyId = parseInt(req.params['difficultyId'] as string, 10);
    const viewerId = req.authenticatedUserId ?? parseOptionalNumber(req.query['viewerId']);
    if (isNaN(songId) || isNaN(difficultyId)) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid song or difficulty ID' }); return; }
    const svc = new SongService(unit);
    const result = await svc.getDifficultyLeaderboard(songId, difficultyId, viewerId);
    if (!result) { await unit.complete(); res.status(404).json({ success: false, error: 'Leaderboard not found or inaccessible' }); return; }
    await unit.complete();
    res.status(200).json(result);
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.post('/:songId/difficulties/:difficultyId/leaderboard', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const difficultyId = parseInt(req.params['difficultyId'] as string, 10);
    const userId = req.authenticatedUserId!;
    const { score, maxCombo, accuracy, date } = req.body;
    if (isNaN(songId) || isNaN(difficultyId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song or difficulty ID' }); return; }
    const parsedScore = parseOptionalNumber(score);
    const parsedMaxCombo = parseOptionalNumber(maxCombo);
    const parsedAccuracy = parseOptionalNumber(accuracy);
    if (parsedScore === undefined || parsedMaxCombo === undefined || parsedAccuracy === undefined) { await unit.complete(false); res.status(400).json({ success: false, improved: false, error: 'score, maxCombo, and accuracy are required' }); return; }

    const svc = new SongService(unit);
    const result = await svc.submitDifficultyHighscore(songId, difficultyId, userId, { score: parsedScore, maxCombo: parsedMaxCombo, accuracy: parsedAccuracy, date: typeof date === 'string' && date.trim().length > 0 ? date : undefined });
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, improved: result.improved, entry: result.entry, message: result.improved ? 'Highscore updated' : 'Score did not beat existing highscore' }); } else { await unit.complete(false); const status = result.error === 'Song not found or not accessible' ? 403 : result.error === 'Difficulty not found' ? 404 : 400; res.status(status).json({ success: false, improved: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/:songId/difficulties/:difficultyId/chart', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const difficultyId = parseInt(req.params['difficultyId'] as string, 10);
    const viewerId = req.authenticatedUserId ?? parseOptionalNumber(req.query['viewerId']);
    if (isNaN(songId) || isNaN(difficultyId)) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid song or difficulty ID' }); return; }
    const svc = new SongService(unit);
    const result = await svc.getDifficultyChart(songId, difficultyId, viewerId);
    if (!result) { await unit.complete(); res.status(404).json({ success: false, error: 'Chart not found or inaccessible' }); return; }
    await unit.complete();
    res.status(200).json(result);
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// Comments
songRouter.get('/:songId/comments', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const viewerId = req.authenticatedUserId ?? parseOptionalNumber(req.query['viewerId']);
    if (isNaN(songId)) { await unit.complete(); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const svc = new SongService(unit);
    const comments = await svc.getCommentsForSong(songId, viewerId);
    await unit.complete();
    if (comments === undefined) {
      res.status(404).json({ success: false, error: 'Song not found or comments unavailable' });
    } else {
      res.status(200).json({ success: true, comments });
    }
  } catch (error: any) {
    await unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.post('/:songId/comments', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const senderId = req.authenticatedUserId!;
    const { content, parentCommentId } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    if (!content || typeof content !== 'string' || content.trim().length === 0) { await unit.complete(false); res.status(400).json({ success: false, error: 'content is required' }); return; }

    const sanitizedContent = Sanitizer.sanitizeText(content);
    if (sanitizedContent.length > MAX_COMMENT_LENGTH) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters` });
      return;
    }

    const svc = new SongService(unit);
    const result = await svc.addCommentToSong(songId, { senderId, content: sanitizedContent, parentCommentId: parentCommentId === undefined ? undefined : Number(parentCommentId) });
    if (result.success) { await unit.complete(true); res.status(201).json({ success: true, comment: result.comment }); } else { await unit.complete(false); res.status(result.error === 'Song not found' ? 404 : 400).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.patch('/:songId/comments/:commentId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const commentId = parseInt(req.params['commentId'] as string, 10);
    const requesterId = req.authenticatedUserId!;
    const isAdmin = req.authenticatedRole === 'admin' || requesterId === 2;
    const { content } = req.body;
    if (isNaN(songId) || isNaN(commentId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song or comment ID' }); return; }
    if (!content || typeof content !== 'string' || content.trim().length === 0) { await unit.complete(false); res.status(400).json({ success: false, error: 'content is required' }); return; }

    const sanitizedContent = Sanitizer.sanitizeText(content);
    if (sanitizedContent.length > MAX_COMMENT_LENGTH) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters` });
      return;
    }

    const svc = new SongService(unit);
    const result = await svc.updateComment(songId, commentId, requesterId, isAdmin, { content: sanitizedContent });
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, comment: result.comment }); } else { await unit.complete(false); res.status(result.error === 'Comment not found' ? 404 : (result.error?.includes('authorized') ? 403 : 400)).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.delete('/:songId/comments/:commentId', authMiddleware, async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const commentId = parseInt(req.params['commentId'] as string, 10);
    const requesterId = req.authenticatedUserId!;
    const isAdmin = req.authenticatedRole === 'admin' || requesterId === 2;
    if (isNaN(songId) || isNaN(commentId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song or comment ID' }); return; }

    const svc = new SongService(unit);
    const result = await svc.deleteComment(songId, commentId, requesterId, isAdmin);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, message: result.message }); } else { await unit.complete(false); res.status(result.error === 'Comment not found' ? 404 : (result.error?.includes('authorized') ? 403 : 400)).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/leaderboard/sp', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string, 10) || 50));
    const svc = new SongService(unit);
    const entries = await svc.getSpLeaderboard(limit);
    res.status(200).json({ success: true, entries });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
