import { Unit } from '../database/unit';
import { HTLService } from './HTLService';

export interface AddSongRequest {
  name: string;
  author: string;
  bpm: number;
  length: string;
  songUrl: string;
  coverUrl: string;
  ownerId?: number | null;
  isPublic?: boolean | number | string;
}

export interface AddSongResponse {
  success: boolean;
  songId?: number;
  songUrl?: string;
  coverUrl?: string;
  ownerId?: number | null;
  isPublic?: boolean;
  error?: string;
}

export interface SongRecord {
  id: number;
  name: string;
  author: string;
  bpm: number;
  length: string;
  songUrl: string;
  coverUrl: string;
  ownerId: number | null;
  isPublic: number | boolean | string;
}

export interface SongResponse {
  id: number;
  name: string;
  author: string;
  bpm: number;
  length: string;
  songUrl: string;
  coverUrl: string;
  ownerId: number | null;
  isPublic: boolean;
}

export interface UpdateSongVisibilityRequest {
  ownerId: number;
  isPublic: boolean;
}

export interface UpdateSongVisibilityResponse {
  success: boolean;
  song?: SongResponse;
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

      const isPublic = this.parseVisibilityInput(request.isPublic, true);
      const ownerId = request.ownerId ?? null;

      if (!isPublic && ownerId == null) {
        return { success: false, error: 'Private songs require an owner' };
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
          ownerId: number | null;
          isPublic: number;
        }
      >(
        `INSERT INTO Song (name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic)
         VALUES ($name, $author, $bpm, $length, $songUrl, $coverUrl, $ownerId, $isPublic)
         RETURNING id`,
        {
          name: request.name.trim(),
          author: request.author.trim(),
          bpm: Math.round(request.bpm),
          length: request.length,
          songUrl: request.songUrl,
          coverUrl: request.coverUrl,
          ownerId,
          isPublic: isPublic ? 1 : 0
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
        coverUrl: request.coverUrl,
        ownerId,
        isPublic
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to add song' };
    }
  }

  public getAllSongs(viewerId?: number): SongResponse[] {
    const stmt = this.unit.prepare<SongRecord>(
      'SELECT id, name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic FROM Song ORDER BY id'
    );

    return stmt
      .all()
      .filter(song => this.isPublicSong(song.isPublic) || song.ownerId === viewerId)
      .map(song => this.toResponse(song));
  }

  public getSongById(
    songId: number
  , viewerId?: number): SongResponse | undefined {
    const stmt = this.unit.prepare<SongRecord, { id: number }>(
      'SELECT id, name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic FROM Song WHERE id = $id',
      { id: songId }
    );

    const song = stmt.get();
    if (!song) {
      return undefined;
    }

    if (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId) {
      return undefined;
    }

    return this.toResponse(song);
  }

  public updateSongVisibility(
    songId: number,
    ownerId: number,
    isPublic: boolean
  ): UpdateSongVisibilityResponse {
    try {
      const song = this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      if (song.ownerId === null || song.ownerId !== ownerId) {
        return { success: false, error: 'Only the owner can change song visibility' };
      }

      const stmt = this.unit.prepare<{ changes: number }, { id: number; isPublic: number }>(
        'UPDATE Song SET isPublic = $isPublic WHERE id = $id',
        { id: songId, isPublic: isPublic ? 1 : 0 }
      );
      const result = stmt.run();

      if (result.changes === 0) {
        return { success: false, error: 'Failed to update song visibility' };
      }

      const updatedSong = this.getRawSongById(songId);
      return {
        success: true,
        song: updatedSong ? this.toResponse(updatedSong) : undefined
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update song visibility' };
    }
  }

  public deleteSong(songId: number, requesterId?: number): { success: boolean; error?: string } {
    try {
      const song = this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      if (requesterId == null) {
        return { success: false, error: 'Authentication required to delete song' };
      }

      if (song.ownerId == null || song.ownerId !== requesterId) {
        return { success: false, error: 'Only the uploader can delete this song' };
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

  private getRawSongById(songId: number): SongRecord | undefined {
    const stmt = this.unit.prepare<SongRecord, { id: number }>(
      'SELECT id, name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic FROM Song WHERE id = $id',
      { id: songId }
    );

    return stmt.get();
  }

  private toResponse(song: SongRecord): SongResponse {
    return {
      id: song.id,
      name: song.name,
      author: song.author,
      bpm: song.bpm,
      length: song.length,
      songUrl: song.songUrl,
      coverUrl: song.coverUrl,
      ownerId: song.ownerId,
      isPublic: this.isPublicSong(song.isPublic)
    };
  }

  private isPublicSong(value: number | boolean | string): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }

  private parseVisibilityInput(value: boolean | number | string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'public') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'private') {
      return false;
    }

    return fallback;
  }
}
