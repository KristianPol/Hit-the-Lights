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

songRouter.post('/add', (req: Request, res: Response) => {
  const unit = new Unit(false);

  try {
    const { name, author, bpm, length, audioBase64, audioMimeType, coverBase64, coverMimeType, ownerId, isPublic } = req.body;

    if (!name || !author || !bpm || !length || !audioBase64 || !coverBase64) {
      unit.complete(false);
      res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
      return;
    }

    const audioFilename = saveBase64File(audioBase64, audioMimeType || 'audio/mpeg', AUDIO_DIR);
    const coverFilename = saveBase64File(coverBase64, coverMimeType || 'image/jpeg', COVER_DIR);

    const songUrl = `http://localhost:3000/uploads/audio/${audioFilename}`;
    const coverUrl = `http://localhost:3000/uploads/covers/${coverFilename}`;

    const songService = new SongService(unit);
    const result = songService.addSong({
      name,
      author,
      bpm: parseInt(bpm, 10),
      length,
      songUrl,
      coverUrl,
      ownerId: parseOptionalNumber(ownerId) ?? null,
      isPublic: parseVisibility(isPublic, true)
    });

    if (result.success) {
      unit.complete(true);
      res.status(201).json({
        success: true,
        songId: result.songId,
        songUrl,
        coverUrl,
        ownerId: result.ownerId,
        isPublic: result.isPublic,
        message: 'Song added successfully'
      });
    } else {
      unit.complete(false);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

songRouter.get('/all', (req: Request, res: Response) => {
  const unit = new Unit(true);

  try {
    console.log('📥 Backend: GET /api/songs/all - Fetching all songs');
    const songService = new SongService(unit);
    const viewerId = parseOptionalNumber(req.query['viewerId']);
    const songs = songService.getAllSongs(viewerId);

    console.log(`✅ Backend: Found ${songs.length} songs in database`);
    unit.complete();

    res.status(200).json({
      success: true,
      songs
    });
  } catch (error: any) {
    console.error('❌ Backend: Error fetching songs', error);
    unit.complete();
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

songRouter.get('/count/:ownerId', (req: Request, res: Response) => {
  const unit = new Unit(true);

  try {
    const ownerId = parseInt(req.params['ownerId'] as string, 10);
    const viewerId = parseOptionalNumber(req.query['viewerId']);

    if (isNaN(ownerId) || ownerId <= 0) {
      unit.complete();
      res.status(400).json({ success: false, error: 'Invalid owner ID' });
      return;
    }

    const songService = new SongService(unit);
    const count = songService.getUploadedSongCount(ownerId, viewerId);
    unit.complete();

    res.status(200).json({ success: true, count });
  } catch (error: any) {
    unit.complete();
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.get('/:id', (req: Request, res: Response) => {
  const unit = new Unit(true);

  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const viewerId = parseOptionalNumber(req.query['viewerId']);

    if (isNaN(songId)) {
      unit.complete();
      res.status(400).json({
        success: false,
        error: 'Invalid song ID'
      });
      return;
    }

    const songService = new SongService(unit);
    const song = songService.getSongById(songId, viewerId);

    unit.complete();

    if (song) {
      res.status(200).json({ success: true, song });
    } else {
      res.status(404).json({ success: false, error: 'Song not found' });
    }
  } catch (error: any) {
    unit.complete();
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

songRouter.patch('/:id/visibility', (req: Request, res: Response) => {
  const unit = new Unit(false);

  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const { ownerId, isPublic } = req.body;

    if (isNaN(songId)) {
      unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid song ID' });
      return;
    }

    const parsedOwnerId = parseOptionalNumber(ownerId);
    if (parsedOwnerId === undefined) {
      unit.complete(false);
      res.status(400).json({ success: false, error: 'ownerId is required' });
      return;
    }

    const parsedVisibility = parseVisibility(isPublic, true);

    const songService = new SongService(unit);
    const result = songService.updateSongVisibility(songId, parsedOwnerId, parsedVisibility);

    if (result.success) {
      unit.complete(true);
      res.status(200).json({ success: true, song: result.song, message: 'Song visibility updated' });
    } else {
      unit.complete(false);
      res.status(result.error === 'Song not found' ? 404 : 403).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

songRouter.delete('/:id', (req: Request, res: Response) => {
  const unit = new Unit(false);

  try {
    const songId = parseInt(req.params['id'] as string, 10);
    const viewerId = parseOptionalNumber(req.query['viewerId']);

    if (isNaN(songId)) {
      unit.complete(false);
      res.status(400).json({ success: false, error: 'Invalid song ID' });
      return;
    }

    const songService = new SongService(unit);
    const song = songService.getSongById(songId, viewerId);

    if (!song) {
      unit.complete(false);
      res.status(404).json({ success: false, error: 'Song not found' });
      return;
    }

    const result = songService.deleteSong(songId, viewerId);

    if (result.success) {
      // Delete uploaded files only after authorized DB deletion.
      const audioFilename = song.songUrl.split('/').pop();
      const coverFilename = song.coverUrl.split('/').pop();
      const audioPath = path.join(AUDIO_DIR, audioFilename!);
      const coverPath = path.join(COVER_DIR, coverFilename!);

      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);

      unit.complete(true);
      res.json({ success: true, message: 'Song deleted successfully' });
    } else {
      unit.complete(false);
      res.status(result.error === 'Only the uploader can delete this song' || result.error === 'Authentication required to delete song' ? 403 : 400)
        .json({ success: false, error: result.error });
    }
  } catch (error: any) {
    unit.complete(false);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
