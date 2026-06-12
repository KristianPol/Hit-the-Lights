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
  genre?: string | null;
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
  ownerUsername?: string | null;
  isPublic: number | boolean | string;
  genre?: string | null;
  play_count?: number;
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
  ownerUsername?: string | null;
  isPublic: boolean;
  genre?: string | null;
  playCount: number;
  likeCount: number;
  isLikedByUser: boolean;
  difficulties: SongDifficultyResponse[];
}

export interface SongDifficultyRecord {
  id: number;
  song_id: number;
  difficulty: number;
  note_count: number;
}

export interface SongDifficultyResponse {
  id: number;
  difficulty: number;
  noteCount: number;
}

export interface CommentRecord {
  id: number;
  song_id: number;
  sender_id: number;
  parent_comment_id?: number | null;
  content: string;
  created_at: string;
  username?: string;
}

export interface CommentResponse {
  id: number;
  songId: number;
  senderId: number;
  senderUsername?: string;
  parentCommentId?: number | null;
  content: string;
  createdAt: string;
}

export interface GetCommentsResponse {
  success: boolean;
  comments?: CommentResponse[];
  error?: string;
}

export interface AddCommentRequest {
  senderId: number;
  content: string;
  parentCommentId?: number | null;
}

export interface AddCommentResponse {
  success: boolean;
  comment?: CommentResponse;
  error?: string;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface UpdateCommentResponse {
  success: boolean;
  comment?: CommentResponse;
  error?: string;
}

export interface DeleteCommentResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export enum NoteType {
  Normal = 1,
  Bomb = 2,
  Hold = 3
}

// SP difficulty weights chosen so D1=10, D5=100, D10=1000 with smooth exponential growth.
export const SP_DIFFICULTY_WEIGHTS: Record<number, number> = {
  1: 10,
  2: 19,
  3: 33,
  4: 58,
  5: 100,
  6: 167,
  7: 271,
  8: 430,
  9: 664,
  10: 1000
};

export interface ChartNoteInput {
  time: number;
  lane: number;
  type?: number;
  durationMs?: number | null;
}

export interface AddSongDifficultyResponse {
  success: boolean;
  difficulty?: SongDifficultyResponse;
  error?: string;
}

export interface HighscoreRecord {
  user_id: number;
  difficulty_id: number;
  score: number;
  max_combo: number;
  accuracy: number;
  date: string;
}

export interface RankedLeaderboardRow extends HighscoreRecord {
  position: number;
  username: string;
}

export interface LeaderboardEntryResponse {
  position: number;
  userId: number;
  username: string;
  score: number;
  maxCombo: number;
  accuracy: number;
  date: string;
  isCurrentUser: boolean;
}

export interface DifficultyLeaderboardResponse {
  success: boolean;
  songId: number;
  difficultyId: number;
  entries: LeaderboardEntryResponse[];
  error?: string;
}

export interface SubmitHighscoreRequest {
  score: number;
  maxCombo: number;
  accuracy: number;
  date?: string;
}

export interface SubmitHighscoreResponse {
  success: boolean;
  improved: boolean;
  entry?: LeaderboardEntryResponse;
  sp?: number;
  totalSp?: number;
  error?: string;
}

export interface DifficultyChartNoteResponse {
  time: number;
  lane: number;
  type: number;
  durationMs: number | null;
}

export interface DifficultyChartResponse {
  success: boolean;
  songId: number;
  difficultyId: number;
  chart: {
    metadata: {
      title: string;
      artist: string;
      bpm: number;
    };
    notes: DifficultyChartNoteResponse[];
  };
  error?: string;
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

export interface UpdateSongRequest {
  name?: string;
  author?: string;
  bpm?: number;
  length?: string;
  genre?: string | null;
  isPublic?: boolean;
  songUrl?: string;
  coverUrl?: string;
}

export interface UpdateSongResponse {
  success: boolean;
  song?: SongResponse;
  error?: string;
}

export interface DeleteDifficultyResponse {
  success: boolean;
  error?: string;
}

export interface UpdateDifficultyChartResponse {
  success: boolean;
  difficulty?: SongDifficultyResponse;
  error?: string;
}

export interface UploadedSongCountResult {
  count: number;
}

export class SongService {
  private htlService: HTLService;

  constructor(private unit: Unit) {
    this.htlService = new HTLService(unit);
  }

  public async addSong(request: AddSongRequest): Promise<AddSongResponse> {
    try {
      if (!request.name || request.name.trim().length === 0) {
        return { success: false, error: 'Song name is required' };
      }
      if (request.name.trim().length > 100) {
        return { success: false, error: 'Song name must be at most 100 characters' };
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

      const genre = request.genre?.trim() || null;

      const insertStmt = this.unit.prepare<unknown, {
        name: string;
        author: string;
        bpm: number;
        length: string;
        songUrl: string;
        coverUrl: string;
        ownerId: number | null;
        isPublic: number;
        genre: string | null;
      }>(
        `INSERT INTO Song (name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic, genre)
         VALUES ($name, $author, $bpm, $length, $songUrl, $coverUrl, $ownerId, $isPublic, $genre)`,
        {
          name: request.name.trim(),
          author: request.author.trim(),
          bpm: Math.round(request.bpm),
          length: request.length,
          songUrl: request.songUrl,
          coverUrl: request.coverUrl,
          ownerId,
          isPublic: isPublic ? 1 : 0,
          genre
        }
      );
      await insertStmt.run();

      const songId = await this.unit.getLastRowId();
      if (!songId) {
        return { success: false, error: 'Failed to insert song' };
      }

      return {
        success: true,
        songId,
        songUrl: request.songUrl,
        coverUrl: request.coverUrl,
        ownerId,
        isPublic
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to add song' };
    }
  }

  public async getAllSongs(
    viewerId?: number,
    searchQuery?: string,
    genreFilter?: string,
    sortBy?: string,
    ownerId?: number,
    visibilityFilter?: 'all' | 'public' | 'private'
  ): Promise<SongResponse[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Visibility filter
    const visibility = visibilityFilter ?? 'all';
    if (visibility === 'private') {
      conditions.push('s.isPublic = 0 AND s.ownerId = $viewerId');
    } else if (visibility === 'public') {
      conditions.push('s.isPublic = 1');
    } else if (viewerId != null) {
      conditions.push('(s.isPublic = 1 OR s.ownerId = $viewerId)');
    } else {
      conditions.push('s.isPublic = 1');
    }
    params.viewerId = viewerId ?? null;

    // Owner filter
    if (ownerId != null) {
      conditions.push('s.ownerId = $ownerId');
      params.ownerId = ownerId;
    }

    // Search filter (name or author)
    if (searchQuery && searchQuery.trim().length > 0) {
      conditions.push("(LOWER(s.name) LIKE $search OR LOWER(s.author) LIKE $search)");
      params.search = `%${searchQuery.trim().toLowerCase()}%`;
    }

    // Genre filter
    if (genreFilter && genreFilter.trim().length > 0) {
      conditions.push('s.genre = $genre');
      params.genre = genreFilter.trim();
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort mapping
    let orderBy = 's.id DESC'; // default newest
    switch (sortBy) {
      case 'most_liked':
        orderBy = 'likeCount DESC, s.id DESC';
        break;
      case 'least_liked':
        orderBy = 'likeCount ASC, s.id DESC';
        break;
      case 'most_played':
        orderBy = 's.play_count DESC, s.id DESC';
        break;
      case 'bpm_asc':
        orderBy = 's.bpm ASC, s.id DESC';
        break;
      case 'bpm_desc':
        orderBy = 's.bpm DESC, s.id DESC';
        break;
      case 'newest':
      default:
        orderBy = 's.id DESC';
        break;
    }

    const sql = `
      SELECT
        s.id, s.name, s.author, s.bpm, s.length, s.songUrl, s.coverUrl, s.ownerId, s.isPublic, s.genre, s.play_count,
        u.username AS ownerusername,
        (SELECT COUNT(*) FROM SongLike WHERE song_id = s.id) as likeCount,
        EXISTS(SELECT 1 FROM SongLike WHERE song_id = s.id AND user_id = $viewerId) as isLikedByUser
      FROM Song s
      LEFT JOIN User u ON u.id = s.ownerId
      ${whereClause}
      ORDER BY ${orderBy}
    `;

    interface EnrichedSongRecord extends SongRecord {
      likeCount: number;
      isLikedByUser: number;
    }

    const stmt = this.unit.prepare<EnrichedSongRecord>(sql, params);

    const rows = await stmt.all();
    return await Promise.all(rows.map(song => this.toResponse(song, song.likeCount, !!song.isLikedByUser)));
  }

  public async getSongDifficulties(songId: number, viewerId?: number): Promise<SongDifficultyResponse[] | undefined> {
    const song = await this.getRawSongById(songId);
    if (!song) {
      return undefined;
    }

    if (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId) {
      return undefined;
    }

    return this.getDifficultiesBySongId(songId);
  }

  public async addSongDifficulty(
    songId: number,
    ownerId: number,
    difficulty: number,
    notes: ChartNoteInput[]
  ): Promise<AddSongDifficultyResponse> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, error: 'Invalid song ID' };
      }

      if (!Number.isInteger(ownerId) || ownerId <= 0) {
        return { success: false, error: 'ownerId is required' };
      }

      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
        return { success: false, error: 'Difficulty must be between 1 and 10' };
      }

      if (!Array.isArray(notes) || notes.length === 0) {
        return { success: false, error: 'A chart must include at least one note' };
      }

      let bombCount = 0;
      for (const note of notes) {
        if (!Number.isFinite(note.time) || note.time < 0) {
          return { success: false, error: 'Each note must have a non-negative time' };
        }
        if (!Number.isInteger(note.lane) || note.lane < 0 || note.lane > 3) {
          return { success: false, error: 'Each note lane must be between 0 and 3' };
        }
        const type = Number.isInteger(note.type) ? Number(note.type) : NoteType.Normal;
        if (!Object.values(NoteType).includes(type)) {
          return { success: false, error: `Invalid note type: ${note.type}` };
        }
        if (type === NoteType.Bomb) {
          bombCount++;
        }
      }

      if (bombCount > notes.length * 0.1) {
        return { success: false, error: 'Bomb notes cannot exceed 10% of the chart' };
      }

      const song = await this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      if (song.ownerId == null || song.ownerId !== ownerId) {
        return { success: false, error: 'Only the owner can upload difficulties' };
      }

      const existingStmt = this.unit.prepare<{ id: number }, { songId: number; difficulty: number }>(
        'SELECT id FROM Difficulty WHERE song_id = $songId AND difficulty = $difficulty',
        { songId, difficulty }
      );

      if (await existingStmt.get()) {
        return { success: false, error: 'This difficulty already exists for the selected song' };
      }

      const insertDifficulty = this.unit.prepare<unknown, { songId: number; difficulty: number; noteCount: number }>(
        `INSERT INTO Difficulty (song_id, difficulty, note_count)
         VALUES ($songId, $difficulty, $noteCount)`,
        { songId, difficulty, noteCount: notes.length }
      );
      await insertDifficulty.run();

      const difficultyId = await this.unit.getLastRowId();
      if (!difficultyId) {
        return { success: false, error: 'Failed to create difficulty' };
      }

      for (const note of notes) {
        const type = Number.isInteger(note.type) ? Number(note.type) : NoteType.Normal;
        await this.unit.prepare(
          `INSERT INTO Note (difficulty_id, time_ms, lane, type, duration_ms)
           VALUES ($difficultyId, $timeMs, $lane, $type, $durationMs)`,
          {
            difficultyId,
            timeMs: Math.round(note.time),
            lane: note.lane,
            type,
            durationMs: type === NoteType.Bomb ? null : (note.durationMs ?? null)
          }
        ).run();
      }

      return {
        success: true,
        difficulty: {
          id: difficultyId,
          difficulty,
          noteCount: notes.length
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to upload difficulty' };
    }
  }

  public async getSongById(
    songId: number
  , viewerId?: number): Promise<SongResponse | undefined> {
    interface EnrichedSongRecord extends SongRecord {
      likeCount: number;
      isLikedByUser: number;
    }

    const stmt = this.unit.prepare<EnrichedSongRecord, { id: number; viewerId: number | null }>(
      `SELECT
        s.id, s.name, s.author, s.bpm, s.length, s.songUrl, s.coverUrl, s.ownerId, s.isPublic, s.genre, s.play_count,
        u.username AS ownerusername,
        (SELECT COUNT(*) FROM SongLike WHERE song_id = s.id) as likeCount,
        EXISTS(SELECT 1 FROM SongLike WHERE song_id = s.id AND user_id = $viewerId) as isLikedByUser
      FROM Song s
      LEFT JOIN User u ON u.id = s.ownerId
      WHERE s.id = $id`,
      { id: songId, viewerId: viewerId ?? null }
    );

    const song = await stmt.get();
    if (!song) {
      return undefined;
    }

    if (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId) {
      return undefined;
    }

    return await this.toResponse(song, song.likeCount, !!song.isLikedByUser);
  }

  public async updateSongVisibility(
    songId: number,
    ownerId: number,
    isPublic: boolean
  ): Promise<UpdateSongVisibilityResponse> {
    try {
      const song = await this.getRawSongById(songId);
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
      const result = await stmt.run();

      if (result.changes === 0) {
        return { success: false, error: 'Failed to update song visibility' };
      }

      const updatedSong = await this.getRawSongById(songId);
      return {
        success: true,
        song: updatedSong ? await this.toResponse(updatedSong) : undefined
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update song visibility' };
    }
  }

  public async deleteSong(
    songId: number,
    requesterId?: number,
    isAdmin?: boolean
  ): Promise<{ success: boolean; error?: string; song?: SongRecord }> {
    try {
      const song = await this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      if (requesterId == null) {
        return { success: false, error: 'Authentication required to delete song' };
      }

      if (!isAdmin && (song.ownerId == null || song.ownerId !== requesterId)) {
        return { success: false, error: 'Only the uploader can delete this song' };
      }

      await this.unit.prepare<unknown, { songId: number }>(
        'DELETE FROM Note WHERE difficulty_id IN (SELECT id FROM Difficulty WHERE song_id = $songId)',
        { songId }
      ).run();

      await this.unit.prepare<unknown, { songId: number }>(
        'DELETE FROM Highscore WHERE difficulty_id IN (SELECT id FROM Difficulty WHERE song_id = $songId)',
        { songId }
      ).run();

      await this.unit.prepare<unknown, { songId: number }>(
        'DELETE FROM Difficulty WHERE song_id = $songId',
        { songId }
      ).run();

      const stmt = this.unit.prepare<{ changes: number }, { id: number }>(
        'DELETE FROM Song WHERE id = $id',
        { id: songId }
      );
      const result = await stmt.run();

      if (result.changes === 0) {
        return { success: false, error: 'Failed to delete song' };
      }

      return { success: true, song };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to delete song' };
    }
  }

  public async updateSong(
    songId: number,
    requesterId: number,
    request: UpdateSongRequest
  ): Promise<UpdateSongResponse> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, error: 'Invalid song ID' };
      }

      if (!Number.isInteger(requesterId) || requesterId <= 0) {
        return { success: false, error: 'Authentication required to update song' };
      }

      const song = await this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      if (song.ownerId !== requesterId) {
        return { success: false, error: 'Only the uploader can edit this song' };
      }

      const updates: string[] = [];
      const params: Record<string, unknown> = { id: songId };

      if (request.name !== undefined) {
        const trimmed = request.name.trim();
        if (trimmed.length === 0) {
          return { success: false, error: 'Song name is required' };
        }
        if (trimmed.length > 100) {
          return { success: false, error: 'Song name must be at most 100 characters' };
        }
        updates.push('name = $name');
        params.name = trimmed;
      }

      if (request.author !== undefined) {
        const trimmed = request.author.trim();
        if (trimmed.length === 0) {
          return { success: false, error: 'Song author is required' };
        }
        updates.push('author = $author');
        params.author = trimmed;
      }

      if (request.bpm !== undefined) {
        if (!Number.isFinite(request.bpm) || request.bpm <= 0) {
          return { success: false, error: 'BPM must be a positive number' };
        }
        updates.push('bpm = $bpm');
        params.bpm = Math.round(request.bpm);
      }

      if (request.length !== undefined) {
        if (!request.length || request.length.trim().length === 0) {
          return { success: false, error: 'Song length is required' };
        }
        updates.push('length = $length');
        params.length = request.length.trim();
      }

      if (request.genre !== undefined) {
        params.genre = request.genre?.trim() || null;
        updates.push('genre = $genre');
      }

      if (request.isPublic !== undefined) {
        updates.push('isPublic = $isPublic');
        params.isPublic = request.isPublic ? 1 : 0;
      }

      if (request.songUrl !== undefined) {
        if (!request.songUrl) {
          return { success: false, error: 'Song URL is required' };
        }
        updates.push('songUrl = $songUrl');
        params.songUrl = request.songUrl;
      }

      if (request.coverUrl !== undefined) {
        if (!request.coverUrl) {
          return { success: false, error: 'Cover URL is required' };
        }
        updates.push('coverUrl = $coverUrl');
        params.coverUrl = request.coverUrl;
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields provided to update' };
      }

      const stmt = this.unit.prepare<{ changes: number }, Record<string, unknown>>(
        `UPDATE Song SET ${updates.join(', ')} WHERE id = $id`,
        params
      );
      const result = await stmt.run();

      if (result.changes === 0) {
        return { success: false, error: 'Failed to update song' };
      }

      const updatedSong = await this.getRawSongById(songId);
      return {
        success: true,
        song: updatedSong ? await this.toResponse(updatedSong) : undefined
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update song' };
    }
  }

  public async deleteDifficulty(
    songId: number,
    difficultyId: number,
    requesterId: number
  ): Promise<DeleteDifficultyResponse> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, error: 'Invalid song ID' };
      }

      if (!Number.isInteger(difficultyId) || difficultyId <= 0) {
        return { success: false, error: 'Invalid difficulty ID' };
      }

      if (!Number.isInteger(requesterId) || requesterId <= 0) {
        return { success: false, error: 'Authentication required to delete difficulty' };
      }

      const song = await this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      if (song.ownerId !== requesterId) {
        return { success: false, error: 'Only the uploader can delete difficulties' };
      }

      const difficulty = await this.getRawDifficultyById(difficultyId);
      if (!difficulty || difficulty.song_id !== songId) {
        return { success: false, error: 'Difficulty not found' };
      }

      await this.unit.prepare<unknown, { difficultyId: number }>(
        'DELETE FROM Note WHERE difficulty_id = $difficultyId',
        { difficultyId }
      ).run();

      await this.unit.prepare<unknown, { difficultyId: number }>(
        'DELETE FROM Highscore WHERE difficulty_id = $difficultyId',
        { difficultyId }
      ).run();

      const stmt = this.unit.prepare<{ changes: number }, { difficultyId: number }>(
        'DELETE FROM Difficulty WHERE id = $difficultyId',
        { difficultyId }
      );
      const result = await stmt.run();

      if (result.changes === 0) {
        return { success: false, error: 'Failed to delete difficulty' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to delete difficulty' };
    }
  }

  public async updateDifficultyChart(
    songId: number,
    difficultyId: number,
    requesterId: number,
    notes: ChartNoteInput[]
  ): Promise<UpdateDifficultyChartResponse> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, error: 'Invalid song ID' };
      }

      if (!Number.isInteger(difficultyId) || difficultyId <= 0) {
        return { success: false, error: 'Invalid difficulty ID' };
      }

      if (!Number.isInteger(requesterId) || requesterId <= 0) {
        return { success: false, error: 'Authentication required to update chart' };
      }

      if (!Array.isArray(notes) || notes.length === 0) {
        return { success: false, error: 'A chart must include at least one note' };
      }

      let bombCount = 0;
      for (const note of notes) {
        if (!Number.isFinite(note.time) || note.time < 0) {
          return { success: false, error: 'Each note must have a non-negative time' };
        }
        if (!Number.isInteger(note.lane) || note.lane < 0 || note.lane > 3) {
          return { success: false, error: 'Each note lane must be between 0 and 3' };
        }
        const type = Number.isInteger(note.type) ? Number(note.type) : NoteType.Normal;
        if (!Object.values(NoteType).includes(type)) {
          return { success: false, error: `Invalid note type: ${note.type}` };
        }
        if (type === NoteType.Bomb) {
          bombCount++;
        }
      }

      if (bombCount > notes.length * 0.1) {
        return { success: false, error: 'Bomb notes cannot exceed 10% of the chart' };
      }

      const song = await this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }

      if (song.ownerId !== requesterId) {
        return { success: false, error: 'Only the uploader can edit charts' };
      }

      const difficulty = await this.getRawDifficultyById(difficultyId);
      if (!difficulty || difficulty.song_id !== songId) {
        return { success: false, error: 'Difficulty not found' };
      }

      await this.unit.prepare<unknown, { difficultyId: number }>(
        'DELETE FROM Highscore WHERE difficulty_id = $difficultyId',
        { difficultyId }
      ).run();

      await this.unit.prepare<unknown, { difficultyId: number }>(
        'DELETE FROM Note WHERE difficulty_id = $difficultyId',
        { difficultyId }
      ).run();

      for (const note of notes) {
        const type = Number.isInteger(note.type) ? Number(note.type) : NoteType.Normal;
        await this.unit.prepare(
          `INSERT INTO Note (difficulty_id, time_ms, lane, type, duration_ms)
           VALUES ($difficultyId, $timeMs, $lane, $type, $durationMs)`,
          {
            difficultyId,
            timeMs: Math.round(note.time),
            lane: note.lane,
            type,
            durationMs: type === NoteType.Bomb ? null : (note.durationMs ?? null)
          }
        ).run();
      }

      await this.unit.prepare<unknown, { difficultyId: number; noteCount: number }>(
        'UPDATE Difficulty SET note_count = $noteCount WHERE id = $difficultyId',
        { difficultyId, noteCount: notes.length }
      ).run();

      return {
        success: true,
        difficulty: {
          id: difficultyId,
          difficulty: difficulty.difficulty,
          noteCount: notes.length
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update chart' };
    }
  }

  public async getUploadedSongCount(ownerId: number, viewerId?: number): Promise<number> {
    const stmt = this.unit.prepare<UploadedSongCountResult, { ownerId: number; viewerId: number | null }>(
      `SELECT COUNT(*) as count
       FROM Song
       WHERE ownerId = $ownerId
         AND (isPublic = 1 OR ownerId = $viewerId)`,
      { ownerId, viewerId: viewerId ?? null }
    );

    const result = await stmt.get();
    return result?.count ?? 0;
  }

  public async getDifficultyLeaderboard(
    songId: number,
    difficultyId: number,
    viewerId?: number
  ): Promise<DifficultyLeaderboardResponse | undefined> {
    const song = await this.getRawSongById(songId);
    if (!song || !this.canViewSong(song, viewerId)) {
      return undefined;
    }

    const difficulty = await this.getRawDifficultyById(difficultyId);
    if (!difficulty || difficulty.song_id !== songId) {
      return undefined;
    }

    const stmt = this.unit.prepare<RankedLeaderboardRow, { difficultyId: number }>(
      `WITH ranked AS (
         SELECT
           h.user_id,
           u.username,
           h.score,
           h.max_combo,
           h.accuracy,
           h.date,
           ROW_NUMBER() OVER (
             ORDER BY h.score DESC, h.accuracy DESC, h.max_combo DESC, h.date ASC, h.user_id ASC
           ) AS position
         FROM Highscore h
         JOIN User u ON u.id = h.user_id
         WHERE h.difficulty_id = $difficultyId
       )
       SELECT user_id, username, score, max_combo, accuracy, date, position
       FROM ranked
       ORDER BY position ASC`,
      { difficultyId }
    );

    const rows = await stmt.all();
    const topRows = rows.slice(0, 10);
    const viewerRow = viewerId == null ? undefined : rows.find(row => row.user_id === viewerId);
    const entries = [...topRows, ...(viewerRow && viewerRow.position > 10 ? [viewerRow] : [])]
      .map(row => this.toLeaderboardEntry(row, viewerId));

    return {
      success: true,
      songId,
      difficultyId,
      entries
    };
  }

  public async getDifficultyChart(
    songId: number,
    difficultyId: number,
    viewerId?: number
  ): Promise<DifficultyChartResponse | undefined> {
    const song = await this.getRawSongById(songId);
    if (!song || !this.canViewSong(song, viewerId)) {
      return undefined;
    }

    const difficulty = await this.getRawDifficultyById(difficultyId);
    if (!difficulty || difficulty.song_id !== songId) {
      return undefined;
    }

    const stmt = this.unit.prepare<{ time_ms: number; lane: number; type: number; duration_ms: number | null }, { difficultyId: number }>(
      'SELECT time_ms, lane, type, duration_ms FROM Note WHERE difficulty_id = $difficultyId ORDER BY time_ms ASC, lane ASC',
      { difficultyId }
    );

    const notes = (await stmt.all()).map(note => ({
      time: note.time_ms,
      lane: note.lane,
      type: note.type,
      durationMs: note.duration_ms ?? null
    }));

    return {
      success: true,
      songId,
      difficultyId,
      chart: {
        metadata: {
          title: song.name,
          artist: song.author,
          bpm: song.bpm
        },
        notes
      }
    };
  }

  /**
   * Retrieve comments for a song (only if song is public or viewer is owner)
   */
  public async getCommentsForSong(songId: number, viewerId?: number): Promise<CommentResponse[] | undefined> {
    const song = await this.getRawSongById(songId);
    if (!song || !this.canViewSong(song, viewerId)) {
      return undefined;
    }

    if (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId) {
      // private song: comments are not available
      return undefined;
    }

    const stmt = this.unit.prepare<CommentRecord, { songId: number }>(
      `SELECT c.id, c.song_id, c.sender_id, c.parent_comment_id, c.content, c.created_at, u.username
       FROM Comment c
       LEFT JOIN User u ON u.id = c.sender_id
       WHERE c.song_id = $songId
       ORDER BY c.created_at ASC`,
      { songId }
    );

    const rows = await stmt.all();
    return rows.map(r => ({
      id: r.id,
      songId: r.song_id,
      senderId: r.sender_id,
      senderUsername: r.username,
      parentCommentId: r.parent_comment_id ?? null,
      content: r.content,
      createdAt: r.created_at
    }));
  }

  /**
   * Add a comment to a song. Comments are only allowed on public songs.
   */
  public async addCommentToSong(songId: number, request: AddCommentRequest): Promise<AddCommentResponse> {
    try {
      const song = await this.getRawSongById(songId);
      if (!song) return { success: false, error: 'Song not found' };

      if (!this.isPublicSong(song.isPublic)) {
        return { success: false, error: 'Comments are disabled for private songs' };
      }

      if (!Number.isInteger(request.senderId) || request.senderId <= 0) {
        return { success: false, error: 'Valid senderId is required' };
      }

      if (!request.content || typeof request.content !== 'string' || request.content.trim().length === 0) {
        return { success: false, error: 'Comment content is required' };
      }

      const parentId = request.parentCommentId ?? null;
      if (parentId != null) {
        // ensure parent exists and belongs to the same song
        const parentStmt = this.unit.prepare<{ id: number; song_id: number }, { id: number }>(
          'SELECT id, song_id FROM Comment WHERE id = $id',
          { id: parentId }
        );
        const parent = await parentStmt.get();
        if (!parent) return { success: false, error: 'Parent comment not found' };
        if (parent.song_id !== songId) return { success: false, error: 'Parent comment does not belong to this song' };
      }

      await this.unit.prepare<unknown, { songId: number; senderId: number; parentId: number | null; content: string }>(
        `INSERT INTO Comment (song_id, sender_id, parent_comment_id, content)
         VALUES ($songId, $senderId, $parentId, $content)`,
        { songId, senderId: request.senderId, parentId, content: request.content.trim() }
      ).run();

      const commentId = await this.unit.getLastRowId();
      if (!commentId) return { success: false, error: 'Failed to insert comment' };

      const fetchStmt = this.unit.prepare<CommentRecord, { id: number }>(
        `SELECT c.id, c.song_id, c.sender_id, c.parent_comment_id, c.content, c.created_at, u.username
         FROM Comment c
         LEFT JOIN User u ON u.id = c.sender_id
         WHERE c.id = $id`,
        { id: commentId }
      );

      const row = await fetchStmt.get();
      if (!row) return { success: false, error: 'Failed to fetch created comment' };

      return {
        success: true,
        comment: {
          id: row.id,
          songId: row.song_id,
          senderId: row.sender_id,
          senderUsername: row.username,
          parentCommentId: row.parent_comment_id ?? null,
          content: row.content,
          createdAt: row.created_at
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to add comment' };
    }
  }

  /**
   * Update a comment. Only the original sender or an admin can edit.
   */
  public async updateComment(
    songId: number,
    commentId: number,
    requesterId: number,
    isAdmin: boolean,
    request: UpdateCommentRequest
  ): Promise<UpdateCommentResponse> {
    try {
      if (!Number.isInteger(commentId) || commentId <= 0) {
        return { success: false, error: 'Invalid comment ID' };
      }
      if (!request.content || typeof request.content !== 'string' || request.content.trim().length === 0) {
        return { success: false, error: 'Comment content is required' };
      }

      const existingStmt = this.unit.prepare<{ id: number; sender_id: number; song_id: number }, { id: number }>(
        'SELECT id, sender_id, song_id FROM Comment WHERE id = $id',
        { id: commentId }
      );
      const existing = await existingStmt.get();
      if (!existing) return { success: false, error: 'Comment not found' };
      if (existing.song_id !== songId) return { success: false, error: 'Comment does not belong to this song' };
      if (!isAdmin && existing.sender_id !== requesterId) {
        return { success: false, error: 'Not authorized to edit this comment' };
      }

      const sanitizedContent = request.content.trim();
      await this.unit.prepare<unknown, { id: number; content: string }>(
        'UPDATE Comment SET content = $content WHERE id = $id',
        { id: commentId, content: sanitizedContent }
      ).run();

      const fetchStmt = this.unit.prepare<CommentRecord, { id: number }>(
        `SELECT c.id, c.song_id, c.sender_id, c.parent_comment_id, c.content, c.created_at, u.username
         FROM Comment c
         LEFT JOIN User u ON u.id = c.sender_id
         WHERE c.id = $id`,
        { id: commentId }
      );

      const row = await fetchStmt.get();
      if (!row) return { success: false, error: 'Failed to fetch updated comment' };

      return {
        success: true,
        comment: {
          id: row.id,
          songId: row.song_id,
          senderId: row.sender_id,
          senderUsername: row.username,
          parentCommentId: row.parent_comment_id ?? null,
          content: row.content,
          createdAt: row.created_at
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update comment' };
    }
  }

  /**
   * Delete a comment. Only the original sender or an admin can delete.
   * Replies are removed along with the parent comment.
   */
  public async deleteComment(
    songId: number,
    commentId: number,
    requesterId: number,
    isAdmin: boolean
  ): Promise<DeleteCommentResponse> {
    try {
      if (!Number.isInteger(commentId) || commentId <= 0) {
        return { success: false, error: 'Invalid comment ID' };
      }

      const existingStmt = this.unit.prepare<{ id: number; sender_id: number; song_id: number }, { id: number }>(
        'SELECT id, sender_id, song_id FROM Comment WHERE id = $id',
        { id: commentId }
      );
      const existing = await existingStmt.get();
      if (!existing) return { success: false, error: 'Comment not found' };
      if (existing.song_id !== songId) return { success: false, error: 'Comment does not belong to this song' };
      if (!isAdmin && existing.sender_id !== requesterId) {
        return { success: false, error: 'Not authorized to delete this comment' };
      }

      // Remove replies first to avoid FK constraint violations.
      await this.unit.prepare<unknown, { parentId: number }>(
        'DELETE FROM Comment WHERE parent_comment_id = $parentId',
        { parentId: commentId }
      ).run();

      await this.unit.prepare<unknown, { id: number }>(
        'DELETE FROM Comment WHERE id = $id',
        { id: commentId }
      ).run();

      return { success: true, message: 'Comment deleted' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to delete comment' };
    }
  }

  public async submitDifficultyHighscore(
    songId: number,
    difficultyId: number,
    userId: number,
    request: SubmitHighscoreRequest
  ): Promise<SubmitHighscoreResponse> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, improved: false, error: 'Invalid song ID' };
      }

      if (!Number.isInteger(difficultyId) || difficultyId <= 0) {
        return { success: false, improved: false, error: 'Invalid difficulty ID' };
      }

      if (!Number.isInteger(userId) || userId <= 0) {
        return { success: false, improved: false, error: 'User ID is required' };
      }

      if (!Number.isFinite(request.score) || request.score < 0) {
        return { success: false, improved: false, error: 'Score must be a non-negative number' };
      }

      if (!Number.isFinite(request.maxCombo) || request.maxCombo < 0) {
        return { success: false, improved: false, error: 'Max combo must be a non-negative number' };
      }

      if (!Number.isFinite(request.accuracy) || request.accuracy < 0 || request.accuracy > 100) {
        return { success: false, improved: false, error: 'Accuracy must be between 0 and 100' };
      }

      const song = await this.getRawSongById(songId);
      if (!song || !this.canViewSong(song, userId)) {
        return { success: false, improved: false, error: 'Song not found or not accessible' };
      }

      const difficulty = await this.getRawDifficultyById(difficultyId);
      if (!difficulty || difficulty.song_id !== songId) {
        return { success: false, improved: false, error: 'Difficulty not found' };
      }

      const candidate: HighscoreRecord = {
        user_id: userId,
        difficulty_id: difficultyId,
        score: Math.round(request.score),
        max_combo: Math.round(request.maxCombo),
        accuracy: Math.round(request.accuracy),
        date: request.date ?? new Date().toISOString()
      };

      const existingStmt = this.unit.prepare<HighscoreRecord, { userId: number; difficultyId: number }>(
        'SELECT user_id, difficulty_id, score, max_combo, accuracy, date FROM Highscore WHERE user_id = $userId AND difficulty_id = $difficultyId',
        { userId, difficultyId }
      );
      const existing = await existingStmt.get();

      let spEarned = 0;
      let totalSp = 0;

      if (!existing) {
        spEarned = this.computeSp(difficulty.difficulty, candidate.score);
        await this.unit.prepare(
          `INSERT INTO Highscore (user_id, difficulty_id, score, max_combo, accuracy, sp, date)
           VALUES ($userId, $difficultyId, $score, $maxCombo, $accuracy, $sp, $date)`,
          {
            userId: candidate.user_id,
            difficultyId: candidate.difficulty_id,
            score: candidate.score,
            maxCombo: candidate.max_combo,
            accuracy: candidate.accuracy,
            sp: spEarned,
            date: candidate.date
          }
        ).run();
        totalSp = await this.recalculateUserTotalSp(userId);
      } else if (this.isBetterHighscore(candidate, existing)) {
        spEarned = this.computeSp(difficulty.difficulty, candidate.score);
        await this.unit.prepare(
          `UPDATE Highscore
           SET score = $score, max_combo = $maxCombo, accuracy = $accuracy, sp = $sp, date = $date
           WHERE user_id = $userId AND difficulty_id = $difficultyId`,
          {
            userId: candidate.user_id,
            difficultyId: candidate.difficulty_id,
            score: candidate.score,
            maxCombo: candidate.max_combo,
            accuracy: candidate.accuracy,
            sp: spEarned,
            date: candidate.date
          }
        ).run();
        totalSp = await this.recalculateUserTotalSp(userId);
      } else {
        const totalRow = await this.unit.prepare<{ total_sp: number }, { userId: number }>(
          'SELECT total_sp FROM "User" WHERE id = $userId',
          { userId }
        ).get();
        const current = await this.getDifficultyLeaderboard(songId, difficultyId, userId);
        const entry = current?.entries.find(row => row.userId === userId);
        return { success: true, improved: false, sp: 0, totalSp: totalRow?.total_sp ?? 0, entry };
      }

      const updatedLeaderboard = await this.getDifficultyLeaderboard(songId, difficultyId, userId);
      const entry = updatedLeaderboard?.entries.find(row => row.userId === userId);

      return { success: true, improved: true, sp: spEarned, totalSp, entry };
    } catch (error: any) {
      return { success: false, improved: false, error: error.message || 'Failed to submit highscore' };
    }
  }

  public computeSp(difficulty: number, score: number): number {
    const weight = SP_DIFFICULTY_WEIGHTS[difficulty] ?? SP_DIFFICULTY_WEIGHTS[1];
    const ratio = score / 1_000_000;
    return Math.round(weight * Math.pow(ratio, 4) * 10) / 10;
  }

  private async recalculateUserTotalSp(userId: number): Promise<number> {
    const rowsStmt = this.unit.prepare<{ sp: number }, { userId: number }>(
      'SELECT h.sp FROM Highscore h WHERE h.user_id = $userId',
      { userId }
    );
    const rows = await rowsStmt.all();
    const total = Math.round(rows.reduce((sum, row) => sum + row.sp, 0) * 10) / 10;
    await this.unit.prepare<unknown, { totalSp: number; userId: number }>(
      `UPDATE "User" SET total_sp = $totalSp WHERE id = $userId`,
      { totalSp: total, userId }
    ).run();
    return total;
  }

  public async getSpLeaderboard(limit = 50): Promise<{ position: number; userId: number; username: string; totalSp: number }[]> {
    const stmt = this.unit.prepare<{ id: number; username: string; total_sp: number }, { limit: number }>(
      `SELECT id, username, total_sp FROM "User" WHERE is_banned = 0 OR is_banned IS NULL ORDER BY total_sp DESC LIMIT $limit`,
      { limit }
    );
    const rows = await stmt.all();
    return rows.map((row, index) => ({
      position: index + 1,
      userId: row.id,
      username: row.username,
      totalSp: row.total_sp
    }));
  }

  private async getRawSongById(songId: number): Promise<SongRecord | undefined> {
    const stmt = this.unit.prepare<SongRecord, { id: number }>(
      `SELECT s.id, s.name, s.author, s.bpm, s.length, s.songUrl, s.coverUrl, s.ownerId, s.isPublic, s.genre, s.play_count, u.username AS ownerusername
       FROM Song s
       LEFT JOIN User u ON u.id = s.ownerId
       WHERE s.id = $id`,
      { id: songId }
    );

    return await stmt.get();
  }

  private async getRawDifficultyById(difficultyId: number): Promise<SongDifficultyRecord | undefined> {
    const stmt = this.unit.prepare<SongDifficultyRecord, { id: number }>(
      'SELECT id, song_id, difficulty, note_count FROM Difficulty WHERE id = $id',
      { id: difficultyId }
    );

    return await stmt.get();
  }

  public async likeSong(songId: number, userId: number): Promise<{ success: boolean; error?: string }> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, error: 'Invalid song ID' };
      }
      if (!Number.isInteger(userId) || userId <= 0) {
        return { success: false, error: 'Invalid user ID' };
      }

      const song = await this.getRawSongById(songId);
      if (!song) {
        return { success: false, error: 'Song not found' };
      }
      if (!this.isPublicSong(song.isPublic)) {
        return { success: false, error: 'Cannot like private songs' };
      }

      await this.unit.prepare<unknown, { songId: number; userId: number }>(
        `INSERT INTO SongLike (song_id, user_id) VALUES ($songId, $userId)
         ON CONFLICT(song_id, user_id) DO NOTHING`,
        { songId, userId }
      ).run();

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to like song' };
    }
  }

  public async unlikeSong(songId: number, userId: number): Promise<{ success: boolean; error?: string }> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, error: 'Invalid song ID' };
      }
      if (!Number.isInteger(userId) || userId <= 0) {
        return { success: false, error: 'Invalid user ID' };
      }

      await this.unit.prepare<unknown, { songId: number; userId: number }>(
        'DELETE FROM SongLike WHERE song_id = $songId AND user_id = $userId',
        { songId, userId }
      ).run();

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to unlike song' };
    }
  }

  public async incrementPlayCount(songId: number): Promise<{ success: boolean; error?: string }> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) {
        return { success: false, error: 'Invalid song ID' };
      }

      await this.unit.prepare<unknown, { songId: number }>(
        'UPDATE Song SET play_count = COALESCE(play_count, 0) + 1 WHERE id = $songId',
        { songId }
      ).run();

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to increment play count' };
    }
  }

  private async toResponse(song: SongRecord, likeCount: number = 0, isLikedByUser: boolean = false): Promise<SongResponse> {
    return {
      id: song.id,
      name: song.name,
      author: song.author,
      bpm: song.bpm,
      length: song.length,
      songUrl: song.songUrl,
      coverUrl: song.coverUrl,
      ownerId: song.ownerId,
      ownerUsername: song.ownerUsername ?? null,
      isPublic: this.isPublicSong(song.isPublic),
      genre: song.genre ?? null,
      playCount: song.play_count ?? 0,
      likeCount,
      isLikedByUser,
      difficulties: await this.getDifficultiesBySongId(song.id)
    };
  }

  private async getDifficultiesBySongId(songId: number): Promise<SongDifficultyResponse[]> {
    const stmt = this.unit.prepare<SongDifficultyRecord, { songId: number }>(
      'SELECT id, song_id, difficulty, note_count FROM Difficulty WHERE song_id = $songId ORDER BY difficulty ASC',
      { songId }
    );

    return (await stmt.all()).map(difficulty => ({
      id: difficulty.id,
      difficulty: difficulty.difficulty,
      noteCount: difficulty.note_count
    }));
  }

  private toLeaderboardEntry(row: RankedLeaderboardRow, viewerId?: number): LeaderboardEntryResponse {
    return {
      position: row.position,
      userId: row.user_id,
      username: row.username,
      score: row.score,
      maxCombo: row.max_combo,
      accuracy: row.accuracy,
      date: row.date,
      isCurrentUser: viewerId != null && row.user_id === viewerId
    };
  }

  private canViewSong(song: SongRecord, viewerId?: number): boolean {
    return this.isPublicSong(song.isPublic) || song.ownerId === viewerId;
  }

  private isBetterHighscore(candidate: HighscoreRecord, existing: HighscoreRecord): boolean {
    if (candidate.score !== existing.score) {
      return candidate.score > existing.score;
    }

    if (candidate.accuracy !== existing.accuracy) {
      return candidate.accuracy > existing.accuracy;
    }

    if (candidate.max_combo !== existing.max_combo) {
      return candidate.max_combo > existing.max_combo;
    }

    return false;
  }

  private isPublicSong(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true';
    }

    return true;
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
