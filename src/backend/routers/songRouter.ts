import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Unit } from '../database/unit';
import { SongService } from '../services';

export const songRouter = Router();

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const AUDIO_DIR = path.join(UPLOADS_ROOT, 'audio');
const COVER_DIR = path.join(UPLOADS_ROOT, 'covers');

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

function saveBase64File(base64: string, mimeType: string, dir: string): string {
  const ext = mimeType.split('/')[1].replace('mpeg', 'mp3').replace('jpeg', 'jpg');
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
  return filename;
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

songRouter.post('/add', async (req: Request, res: Response) => {
  const unit = new Unit(false);

  try {
    const { name, author, bpm, length, audioBase64, audioMimeType, coverBase64, coverMimeType, ownerId, isPublic, genre } = req.body;

    if (!name || !author || !bpm || !length || !audioBase64 || !coverBase64) {
      await unit.complete(false);
      res.status(400).json({ success: false, error: 'All fields are required' });
      return;
    }

    const audioFilename = saveBase64File(audioBase64, audioMimeType || 'audio/mpeg', AUDIO_DIR);
    const coverFilename = saveBase64File(coverBase64, coverMimeType || 'image/jpeg', COVER_DIR);
    const songUrl = `/uploads/audio/${audioFilename}`;
    const coverUrl = `/uploads/covers/${coverFilename}`;

    const svc = new SongService(unit);
    const result = await svc.addSong({ name, author, bpm: parseInt(bpm, 10), length, songUrl, coverUrl, ownerId: parseOptionalNumber(ownerId) ?? null, isPublic: parseVisibility(isPublic, true), genre });
    if (result.success) {
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

songRouter.get('/all', async (req: Request, res: Response) => {
  const unit = new Unit(true);
  try {
    console.log('📥 Backend: GET /api/songs/all - Fetching all songs');
    const viewerId = parseOptionalNumber(req.query['viewerId']);
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    const genre = typeof req.query['genre'] === 'string' ? req.query['genre'] : undefined;
    const sort = typeof req.query['sort'] === 'string' ? req.query['sort'] : undefined;
    const ownerId = parseOptionalNumber(req.query['ownerId']);
    const songService = new SongService(unit);
    const songs = await songService.getAllSongs(viewerId, search, genre, sort, ownerId);
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
    const viewerId = parseOptionalNumber(req.query['viewerId']);
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
    const viewerId = parseOptionalNumber(req.query['viewerId']);
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

songRouter.post('/:id/like', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const { userId } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    const parsedUserId = parseOptionalNumber(userId);
    if (parsedUserId === undefined) { await unit.complete(false); res.status(400).json({ success: false, error: 'userId is required' }); return; }

    const svc = new SongService(unit);
    const result = await svc.likeSong(songId, parsedUserId);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, message: 'Song liked' }); } else { await unit.complete(false); res.status(400).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.delete('/:id/like', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const userId = parseOptionalNumber(req.query['userId']);
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    if (userId === undefined) { await unit.complete(false); res.status(400).json({ success: false, error: 'userId is required' }); return; }

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

songRouter.patch('/:id/visibility', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const { ownerId, isPublic } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    const parsedOwnerId = parseOptionalNumber(ownerId);
    if (parsedOwnerId === undefined) { await unit.complete(false); res.status(400).json({ success: false, error: 'ownerId is required' }); return; }
    const parsedVisibility = parseVisibility(isPublic, true);

    const svc = new SongService(unit);
    const result = await svc.updateSongVisibility(songId, parsedOwnerId, parsedVisibility);
    if (result.success) { await unit.complete(true); res.status(200).json({ success: true, song: result.song, message: 'Song visibility updated' }); } else { await unit.complete(false); res.status(result.error === 'Song not found' ? 404 : 403).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.delete('/:id', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const viewerId = parseOptionalNumber(req.query['viewerId']);
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }

    const svc = new SongService(unit);
    const result = await svc.deleteSong(songId, viewerId);
    if (result.success) {
      const audioFilename = result.song?.songUrl.split('/').pop();
      const coverFilename = result.song?.coverUrl.split('/').pop();
      const audioPath = path.join(AUDIO_DIR, audioFilename!);
      const coverPath = path.join(COVER_DIR, coverFilename!);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
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
    const viewerId = parseOptionalNumber(req.query['viewerId']);
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

songRouter.post('/:songId/difficulties', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const { ownerId, difficulty, notes } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    const parsedOwnerId = parseOptionalNumber(ownerId);
    if (parsedOwnerId === undefined) { await unit.complete(false); res.status(400).json({ success: false, error: 'ownerId is required' }); return; }
    const parsedDifficulty = parseOptionalNumber(difficulty);
    if (parsedDifficulty === undefined) { await unit.complete(false); res.status(400).json({ success: false, error: 'difficulty is required' }); return; }
    if (!Array.isArray(notes)) { await unit.complete(false); res.status(400).json({ success: false, error: 'notes must be an array' }); return; }

    const svc = new SongService(unit);
    const result = await svc.addSongDifficulty(songId, parsedOwnerId, parsedDifficulty, notes);
    if (result.success) { await unit.complete(true); res.status(201).json({ success: true, difficulty: result.difficulty, message: 'Difficulty uploaded successfully' }); } else { await unit.complete(false); res.status(result.error === 'Song not found' ? 404 : 400).json({ success: false, error: result.error }); }
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
    const viewerId = parseOptionalNumber(req.query['viewerId']);
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

songRouter.post('/:songId/difficulties/:difficultyId/leaderboard', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const difficultyId = parseInt(req.params['difficultyId'] as string, 10);
    const { userId, score, maxCombo, accuracy, date } = req.body;
    if (isNaN(songId) || isNaN(difficultyId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song or difficulty ID' }); return; }
    const parsedUserId = parseOptionalNumber(userId);
    if (parsedUserId === undefined) { await unit.complete(false); res.status(400).json({ success: false, error: 'userId is required' }); return; }
    const parsedScore = parseOptionalNumber(score);
    const parsedMaxCombo = parseOptionalNumber(maxCombo);
    const parsedAccuracy = parseOptionalNumber(accuracy);
    if (parsedScore === undefined || parsedMaxCombo === undefined || parsedAccuracy === undefined) { await unit.complete(false); res.status(400).json({ success: false, improved: false, error: 'score, maxCombo, and accuracy are required' }); return; }

    const svc = new SongService(unit);
    const result = await svc.submitDifficultyHighscore(songId, difficultyId, parsedUserId, { score: parsedScore, maxCombo: parsedMaxCombo, accuracy: parsedAccuracy, date: typeof date === 'string' && date.trim().length > 0 ? date : undefined });
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
    const viewerId = parseOptionalNumber(req.query['viewerId']);
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
    const viewerId = parseOptionalNumber(req.query['viewerId']);
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

songRouter.post('/:songId/comments', async (req: Request, res: Response) => {
  const unit = new Unit(false);
  try {
    const songId = parseInt(req.params['songId'] as string, 10);
    const { senderId, content, parentCommentId } = req.body;
    if (isNaN(songId)) { await unit.complete(false); res.status(400).json({ success: false, error: 'Invalid song ID' }); return; }
    if (!senderId || !content || typeof content !== 'string' || content.trim().length === 0) { await unit.complete(false); res.status(400).json({ success: false, error: 'senderId and content are required' }); return; }

    const svc = new SongService(unit);
    const result = await svc.addCommentToSong(songId, { senderId: Number(senderId), content: String(content), parentCommentId: parentCommentId === undefined ? undefined : Number(parentCommentId) });
    if (result.success) { await unit.complete(true); res.status(201).json({ success: true, comment: result.comment }); } else { await unit.complete(false); res.status(result.error === 'Song not found' ? 404 : 400).json({ success: false, error: result.error }); }
  } catch (error: any) {
    await unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
