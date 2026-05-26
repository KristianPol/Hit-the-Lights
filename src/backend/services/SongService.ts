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
  error?: string;
}

export interface DifficultyChartNoteResponse {
  time: number;
  lane: number;
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

export interface UploadedSongCountResult {
  count: number;
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

      const insertStmt = this.unit.prepare<unknown, {
        name: string;
        author: string;
        bpm: number;
        length: string;
        songUrl: string;
        coverUrl: string;
        ownerId: number | null;
        isPublic: number;
      }>(
        `INSERT INTO Song (name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic)
         VALUES ($name, $author, $bpm, $length, $songUrl, $coverUrl, $ownerId, $isPublic)`,
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
      insertStmt.run();

      const songId = this.unit.getLastRowId();
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

  public getAllSongs(viewerId?: number): SongResponse[] {
    const stmt = this.unit.prepare<SongRecord>(
      'SELECT id, name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic FROM Song ORDER BY id'
    );

    return stmt
      .all()
      .filter(song => this.isPublicSong(song.isPublic) || song.ownerId === viewerId)
      .map(song => this.toResponse(song));
  }

  public getSongDifficulties(songId: number, viewerId?: number): SongDifficultyResponse[] | undefined {
    const song = this.getRawSongById(songId);
    if (!song) {
      return undefined;
    }

    if (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId) {
      return undefined;
    }

    return this.getDifficultiesBySongId(songId);
  }

  public addSongDifficulty(
    songId: number,
    ownerId: number,
    difficulty: number,
    notes: ChartNoteInput[]
  ): AddSongDifficultyResponse {
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

      for (const note of notes) {
        if (!Number.isFinite(note.time) || note.time < 0) {
          return { success: false, error: 'Each note must have a non-negative time' };
        }
        if (!Number.isInteger(note.lane) || note.lane < 0 || note.lane > 3) {
          return { success: false, error: 'Each note lane must be between 0 and 3' };
        }
      }

      const song = this.getRawSongById(songId);
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

      if (existingStmt.get()) {
        return { success: false, error: 'This difficulty already exists for the selected song' };
      }

      const insertDifficulty = this.unit.prepare<unknown, { songId: number; difficulty: number; noteCount: number }>(
        `INSERT INTO Difficulty (song_id, difficulty, note_count)
         VALUES ($songId, $difficulty, $noteCount)`,
        { songId, difficulty, noteCount: notes.length }
      );
      insertDifficulty.run();

      const difficultyId = this.unit.getLastRowId();
      if (!difficultyId) {
        return { success: false, error: 'Failed to create difficulty' };
      }

      for (const note of notes) {
        this.unit.prepare(
          `INSERT INTO Note (difficulty_id, time_ms, lane, type, duration_ms)
           VALUES ($difficultyId, $timeMs, $lane, $type, $durationMs)`,
          {
            difficultyId,
            timeMs: Math.round(note.time),
            lane: note.lane,
            type: Number.isInteger(note.type) ? note.type : 1,
            durationMs: note.durationMs ?? null
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

  public deleteSong(
    songId: number,
    requesterId?: number
  ): { success: boolean; error?: string; song?: SongRecord } {
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

      this.unit.prepare<unknown, { songId: number }>(
        'DELETE FROM Note WHERE difficulty_id IN (SELECT id FROM Difficulty WHERE song_id = $songId)',
        { songId }
      ).run();

      this.unit.prepare<unknown, { songId: number }>(
        'DELETE FROM Highscore WHERE difficulty_id IN (SELECT id FROM Difficulty WHERE song_id = $songId)',
        { songId }
      ).run();

      this.unit.prepare<unknown, { songId: number }>(
        'DELETE FROM Difficulty WHERE song_id = $songId',
        { songId }
      ).run();

      const stmt = this.unit.prepare<{ changes: number }, { id: number }>(
        'DELETE FROM Song WHERE id = $id',
        { id: songId }
      );
      const result = stmt.run();

      if (result.changes === 0) {
        return { success: false, error: 'Failed to delete song' };
      }

      return { success: true, song };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to delete song' };
    }
  }

  public getUploadedSongCount(ownerId: number, viewerId?: number): number {
    const stmt = this.unit.prepare<UploadedSongCountResult, { ownerId: number; viewerId: number | null }>(
      `SELECT COUNT(*) as count
       FROM Song
       WHERE ownerId = $ownerId
         AND (isPublic = 1 OR ownerId = $viewerId)`,
      { ownerId, viewerId: viewerId ?? null }
    );

    const result = stmt.get();
    return result?.count ?? 0;
  }

  public getDifficultyLeaderboard(
    songId: number,
    difficultyId: number,
    viewerId?: number
  ): DifficultyLeaderboardResponse | undefined {
    const song = this.getRawSongById(songId);
    if (!song || !this.canViewSong(song, viewerId)) {
      return undefined;
    }

    const difficulty = this.getRawDifficultyById(difficultyId);
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

    const rows = stmt.all();
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

  public getDifficultyChart(
    songId: number,
    difficultyId: number,
    viewerId?: number
  ): DifficultyChartResponse | undefined {
    const song = this.getRawSongById(songId);
    if (!song || !this.canViewSong(song, viewerId)) {
      return undefined;
    }

    const difficulty = this.getRawDifficultyById(difficultyId);
    if (!difficulty || difficulty.song_id !== songId) {
      return undefined;
    }

    const stmt = this.unit.prepare<{ time_ms: number; lane: number }, { difficultyId: number }>(
      'SELECT time_ms, lane FROM Note WHERE difficulty_id = $difficultyId ORDER BY time_ms ASC, lane ASC',
      { difficultyId }
    );

    const notes = stmt.all().map(note => ({
      time: note.time_ms,
      lane: note.lane
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

  public submitDifficultyHighscore(
    songId: number,
    difficultyId: number,
    userId: number,
    request: SubmitHighscoreRequest
  ): SubmitHighscoreResponse {
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

      const song = this.getRawSongById(songId);
      if (!song || !this.canViewSong(song, userId)) {
        return { success: false, improved: false, error: 'Song not found or not accessible' };
      }

      const difficulty = this.getRawDifficultyById(difficultyId);
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
      const existing = existingStmt.get();

      if (!existing) {
        this.unit.prepare(
          `INSERT INTO Highscore (user_id, difficulty_id, score, max_combo, accuracy, date)
           VALUES ($userId, $difficultyId, $score, $maxCombo, $accuracy, $date)`,
          {
            userId: candidate.user_id,
            difficultyId: candidate.difficulty_id,
            score: candidate.score,
            maxCombo: candidate.max_combo,
            accuracy: candidate.accuracy,
            date: candidate.date
          }
        ).run();
      } else if (this.isBetterHighscore(candidate, existing)) {
        this.unit.prepare(
          `UPDATE Highscore
           SET score = $score, max_combo = $maxCombo, accuracy = $accuracy, date = $date
           WHERE user_id = $userId AND difficulty_id = $difficultyId`,
          {
            userId: candidate.user_id,
            difficultyId: candidate.difficulty_id,
            score: candidate.score,
            maxCombo: candidate.max_combo,
            accuracy: candidate.accuracy,
            date: candidate.date
          }
        ).run();
      } else {
        const current = this.getDifficultyLeaderboard(songId, difficultyId, userId);
        const entry = current?.entries.find(row => row.userId === userId);
        return { success: true, improved: false, entry };
      }

      const updatedLeaderboard = this.getDifficultyLeaderboard(songId, difficultyId, userId);
      const entry = updatedLeaderboard?.entries.find(row => row.userId === userId);

      return { success: true, improved: true, entry };
    } catch (error: any) {
      return { success: false, improved: false, error: error.message || 'Failed to submit highscore' };
    }
  }

    private getRawSongById(songId: number): SongRecord | undefined {
     const stmt = this.unit.prepare<SongRecord, { id: number }>(
       'SELECT id, name, author, bpm, length, songUrl, coverUrl, ownerId, isPublic FROM Song WHERE id = $id',
       { id: songId }
     );

     return stmt.get();
   }

  private getRawDifficultyById(difficultyId: number): SongDifficultyRecord | undefined {
    const stmt = this.unit.prepare<SongDifficultyRecord, { id: number }>(
      'SELECT id, song_id, difficulty, note_count FROM Difficulty WHERE id = $id',
      { id: difficultyId }
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
      isPublic: this.isPublicSong(song.isPublic),
      difficulties: this.getDifficultiesBySongId(song.id)
    };
  }

  private getDifficultiesBySongId(songId: number): SongDifficultyResponse[] {
    const stmt = this.unit.prepare<SongDifficultyRecord, { songId: number }>(
      'SELECT id, song_id, difficulty, note_count FROM Difficulty WHERE song_id = $songId ORDER BY difficulty ASC',
      { songId }
    );

    return stmt.all().map(difficulty => ({
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
