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

songRouter.post('/add', (req: Request, res: Response) => {
  const unit = new Unit(false);

  try {
    const { name, author, bpm, length, audioBase64, audioMimeType, coverBase64, coverMimeType } = req.body;

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
      coverUrl
    });

    if (result.success) {
      unit.complete(true);
      res.status(201).json({
        success: true,
        songId: result.songId,
        songUrl,
        coverUrl,
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
    const songs = songService.getAllSongs();

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

songRouter.get('/:id', (req: Request, res: Response) => {
  const unit = new Unit(true);

  try {
    const songId = parseInt(req.params['id'] as string, 10);

    if (isNaN(songId)) {
      unit.complete();
      res.status(400).json({
        success: false,
        error: 'Invalid song ID'
      });
      return;
    }

    const songService = new SongService(unit);
    const song = songService.getSongById(songId);

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
