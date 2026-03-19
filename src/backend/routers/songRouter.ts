import { Router, Request, Response } from 'express';
import { Unit } from '../database/unit';
import { SongService, AddSongRequest } from '../services';

export const songRouter = Router();

songRouter.post('/add', (req: Request, res: Response) => {
  const unit = new Unit(false);

  try {
    const { name, author, bpm, length, songUrl, coverUrl }: AddSongRequest = req.body;

    if (!name || !author || !bpm || !length || !songUrl || !coverUrl) {
      unit.complete(false);
      res.status(400).json({
        success: false,
        error: 'All fields (name, author, bpm, length, songUrl, coverUrl) are required'
      });
      return;
    }

    const songService = new SongService(unit);
    const result = songService.addSong({ name, author, bpm, length, songUrl, coverUrl });

    if (result.success) {
      unit.complete(true);
      res.status(201).json({
        success: true,
        songId: result.songId,
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
    const songService = new SongService(unit);
    const songs = songService.getAllSongs();

    unit.complete();

    res.status(200).json({
      success: true,
      songs
    });
  } catch (error: any) {
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
      res.status(200).json({
        success: true,
        song
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Song not found'
      });
    }
  } catch (error: any) {
    unit.complete();
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

