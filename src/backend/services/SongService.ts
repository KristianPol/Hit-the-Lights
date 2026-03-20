import { Unit } from '../database/unit';
import { HTLService } from './HTLService';

export interface AddSongRequest {
  name: string;
  author: string;
  bpm: number;
  length: string;
  songUrl: string;
  coverUrl: string;
}

export interface AddSongResponse {
  success: boolean;
  songId?: number;
  songUrl?: string;
  coverUrl?: string;
  error?: string;
}

export class SongService {
  private htlService: HTLService;

  constructor(private unit: Unit) {
    this.htlService = new HTLService(unit);
  }

  public addSong(request: AddSongRequest): AddSongResponse {
    try {
      if (!request.name || request.name.trim().length === 0) {
        return { success: false, error: 'Song name is required' };
      }

      if (!request.author || request.author.trim().length === 0) {
        return { success: false, error: 'Song author is required' };
      }

      if (request.bpm <= 0) {
        return { success: false, error: 'BPM must be a positive number' };
      }

      if (!request.length) {
        return { success: false, error: 'Song length is required' };
      }

      if (!request.songUrl) {
        return { success: false, error: 'Song URL is required' };
      }

      if (!request.coverUrl) {
        return { success: false, error: 'Cover URL is required' };
      }

      const stmt = this.unit.prepare<
        { id: number },
        {
          name: string;
          author: string;
          bpm: number;
          length: string;
          songUrl: string;
          coverUrl: string;
        }
      >(
        `INSERT INTO Song (name, author, bpm, length, songUrl, coverUrl)
         VALUES ($name, $author, $bpm, $length, $songUrl, $coverUrl)
         RETURNING id`,
        {
          name: request.name.trim(),
          author: request.author.trim(),
          bpm: Math.round(request.bpm),
          length: request.length,
          songUrl: request.songUrl,
          coverUrl: request.coverUrl
        }
      );

      const result = stmt.get();

      if (!result) {
        return { success: false, error: 'Failed to insert song' };
      }

      return {
        success: true,
        songId: result.id,
        songUrl: request.songUrl,
        coverUrl: request.coverUrl
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to add song' };
    }
  }

  public getAllSongs(): {
    id: number;
    name: string;
    author: string;
    bpm: number;
    length: string;
    songUrl: string;
    coverUrl: string;
  }[] {
    const stmt = this.unit.prepare<{
      id: number;
      name: string;
      author: string;
      bpm: number;
      length: string;
      songUrl: string;
      coverUrl: string;
    }>(
      'SELECT id, name, author, bpm, length, songUrl, coverUrl FROM Song ORDER BY id'
    );
    return stmt.all();
  }

  public getSongById(
    songId: number
  ): {
    id: number;
    name: string;
    author: string;
    bpm: number;
    length: string;
    songUrl: string;
    coverUrl: string;
  } | undefined {
    const stmt = this.unit.prepare<
      {
        id: number;
        name: string;
        author: string;
        bpm: number;
        length: string;
        songUrl: string;
        coverUrl: string;
      },
      { id: number }
    >(
      'SELECT id, name, author, bpm, length, songUrl, coverUrl FROM Song WHERE id = $id',
      { id: songId }
    );
    return stmt.get();
  }

  public deleteSong(songId: number): { success: boolean; error?: string } {
    try {
      const song = this.getSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      const stmt = this.unit.prepare<{ changes: number }, { id: number }>(
        'DELETE FROM Song WHERE id = $id',
        { id: songId }
      );
      const result = stmt.run();

      if (result.changes === 0) {
        return { success: false, error: 'Failed to delete song' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to delete song' };
    }
  }
}
