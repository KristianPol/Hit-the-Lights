import { PostgresDB } from '../database/postgres-db';

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
  isPublic: boolean | number | string;
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

export class SongServiceAsync {
  constructor() {}

  private isPublicSong(value: number | boolean | string): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return String(value).trim().toLowerCase() === 'true' || String(value).trim() === '1' || String(value).trim().toLowerCase() === 'public';
  }

  public async addSong(request: AddSongRequest): Promise<AddSongResponse> {
    try {
      if (!request.name || request.name.trim().length === 0) return { success: false, error: 'Song name is required' };
      if (!request.author || request.author.trim().length === 0) return { success: false, error: 'Song author is required' };
      if (request.bpm <= 0) return { success: false, error: 'BPM must be a positive number' };
      if (!request.length) return { success: false, error: 'Song length is required' };
      if (!request.songUrl) return { success: false, error: 'Song URL is required' };
      if (!request.coverUrl) return { success: false, error: 'Cover URL is required' };

      const isPublic = this.parseVisibilityInput(request.isPublic, true);
      const ownerId = request.ownerId ?? null;
      if (!isPublic && ownerId == null) return { success: false, error: 'Private songs require an owner' };

      const res = await PostgresDB.insertReturning<{ id: number }>(
        'INSERT INTO "Song" (name, author, bpm, length, "songUrl", "coverUrl", "ownerId", "isPublic") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [request.name.trim(), request.author.trim(), Math.round(request.bpm), request.length, request.songUrl, request.coverUrl, ownerId, isPublic]
      );

      if (!res) return { success: false, error: 'Failed to insert song' };

      return { success: true, songId: res.id, songUrl: request.songUrl, coverUrl: request.coverUrl, ownerId, isPublic };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to add song' };
    }
  }

  public async getAllSongs(viewerId?: number): Promise<SongResponse[]> {
    const rows = await PostgresDB.query<SongRecord>('SELECT id, name, author, bpm, length, "songUrl" as "songUrl", "coverUrl" as "coverUrl", "ownerId" as "ownerId", "isPublic" as "isPublic" FROM "Song" ORDER BY id');
    const songs = rows
      .filter(s => this.isPublicSong(s.isPublic) || s.ownerId === viewerId)
      .map(s => this.toResponse(s));
    return songs;
  }

  public async getSongDifficulties(songId: number, viewerId?: number): Promise<SongDifficultyResponse[] | undefined> {
    const song = await PostgresDB.queryOne<SongRecord>('SELECT id, name, author, bpm, length, "songUrl", "coverUrl", "ownerId", "isPublic" FROM "Song" WHERE id = $1', [songId]);
    if (!song) return undefined;
    if (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId) return undefined;
    return await this.getDifficultiesBySongId(songId);
  }

  public async addSongDifficulty(songId: number, ownerId: number, difficulty: number, notes: ChartNoteInput[]): Promise<AddSongDifficultyResponse> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) return { success: false, error: 'Invalid song ID' };
      if (!Number.isInteger(ownerId) || ownerId <= 0) return { success: false, error: 'ownerId is required' };
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) return { success: false, error: 'Difficulty must be between 1 and 10' };
      if (!Array.isArray(notes) || notes.length === 0) return { success: false, error: 'A chart must include at least one note' };

      for (const note of notes) {
        if (!Number.isFinite(note.time) || note.time < 0) return { success: false, error: 'Each note must have a non-negative time' };
        if (!Number.isInteger(note.lane) || note.lane < 0 || note.lane > 3) return { success: false, error: 'Each note lane must be between 0 and 3' };
      }

      const song = await PostgresDB.queryOne<SongRecord>('SELECT id, "ownerId" FROM "Song" WHERE id = $1', [songId]);
      if (!song) return { success: false, error: 'Song not found' };
      if (song.ownerId == null || song.ownerId !== ownerId) return { success: false, error: 'Only the owner can upload difficulties' };

      const existing = await PostgresDB.queryOne<{ id: number }>('SELECT id FROM "Difficulty" WHERE song_id = $1 AND difficulty = $2', [songId, difficulty]);
      if (existing) return { success: false, error: 'This difficulty already exists for the selected song' };

      const inserted = await PostgresDB.insertReturning<{ id: number }>('INSERT INTO "Difficulty" (song_id, difficulty, note_count) VALUES ($1,$2,$3) RETURNING id', [songId, difficulty, notes.length]);
      if (!inserted) return { success: false, error: 'Failed to create difficulty' };

      for (const note of notes) {
        await PostgresDB.execute('INSERT INTO "Note" (difficulty_id, time_ms, lane, type, duration_ms) VALUES ($1,$2,$3,$4,$5)', [inserted.id, Math.round(note.time), note.lane, Number.isInteger(note.type) ? note.type : 1, note.durationMs ?? null]);
      }

      return { success: true, difficulty: { id: inserted.id, difficulty, noteCount: notes.length } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to upload difficulty' };
    }
  }

  public async getSongById(songId: number, viewerId?: number): Promise<SongResponse | undefined> {
    const row = await PostgresDB.queryOne<SongRecord>('SELECT id, name, author, bpm, length, "songUrl", "coverUrl", "ownerId", "isPublic" FROM "Song" WHERE id = $1', [songId]);
    if (!row) return undefined;
    if (!this.isPublicSong(row.isPublic) && row.ownerId !== viewerId) return undefined;
    return this.toResponse(row);
  }

  public async updateSongVisibility(songId: number, ownerId: number, isPublic: boolean): Promise<{ success: boolean; song?: SongResponse; error?: string }> {
    try {
      const song = await PostgresDB.queryOne<SongRecord>('SELECT id, "ownerId" FROM "Song" WHERE id = $1', [songId]);
      if (!song) return { success: false, error: 'Song not found' };
      if (song.ownerId === null || song.ownerId !== ownerId) return { success: false, error: 'Only the owner can change song visibility' };

      const result = await PostgresDB.execute('UPDATE "Song" SET "isPublic" = $1 WHERE id = $2', [isPublic, songId]);
      if (result.rowCount === 0) return { success: false, error: 'Failed to update song visibility' };

      const updated = await this.getSongById(songId, ownerId);
      return { success: true, song: updated };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update song visibility' };
    }
  }

  public async deleteSong(songId: number, requesterId?: number): Promise<{ success: boolean; error?: string; song?: SongRecord }> {
    try {
      const song = await PostgresDB.queryOne<SongRecord>('SELECT id, name, author, bpm, length, "songUrl", "coverUrl", "ownerId", "isPublic" FROM "Song" WHERE id = $1', [songId]);
      if (!song) return { success: false, error: 'Song not found' };
      if (requesterId == null) return { success: false, error: 'Authentication required to delete song' };
      if (song.ownerId == null || song.ownerId !== requesterId) return { success: false, error: 'Only the uploader can delete this song' };

      await PostgresDB.execute('DELETE FROM "Song" WHERE id = $1', [songId]);
      return { success: true, song };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete song' };
    }
  }

  public async getUploadedSongCount(ownerId: number, viewerId?: number): Promise<number> {
    const row = await PostgresDB.queryOne<{ count: number }>('SELECT COUNT(*)::int as count FROM "Song" WHERE "ownerId" = $1 AND ("isPublic" = TRUE OR "ownerId" = $2)', [ownerId, viewerId ?? null]);
    return row?.count ?? 0;
  }

  public async getDifficultyLeaderboard(songId: number, difficultyId: number, viewerId?: number): Promise<DifficultyLeaderboardResponse | undefined> {
    const song = await PostgresDB.queryOne<SongRecord>('SELECT id, "ownerId", "isPublic" FROM "Song" WHERE id = $1', [songId]);
    if (!song || (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId)) return undefined;

    const difficulty = await PostgresDB.queryOne<SongDifficultyRecord>('SELECT id, song_id, difficulty, note_count FROM "Difficulty" WHERE id = $1', [difficultyId]);
    if (!difficulty || difficulty.song_id !== songId) return undefined;

    const rows = await PostgresDB.query<any>(`
      WITH ranked AS (
        SELECT h.user_id, u.username, h.score, h.max_combo, h.accuracy, h.date,
          ROW_NUMBER() OVER (ORDER BY h.score DESC, h.accuracy DESC, h.max_combo DESC, h.date ASC, h.user_id ASC) AS position
        FROM "Highscore" h
        JOIN "User" u ON u.id = h.user_id
        WHERE h.difficulty_id = $1
      )
      SELECT user_id, username, score, max_combo, accuracy, date, position FROM ranked ORDER BY position ASC
    `, [difficultyId]);

    const topRows = rows.slice(0, 10);
    const viewerRow = viewerId == null ? undefined : rows.find((r: any) => r.user_id === viewerId);
    const entries = [...topRows, ...(viewerRow && viewerRow.position > 10 ? [viewerRow] : [])].map((row: any) => ({
      position: row.position,
      userId: row.user_id,
      username: row.username,
      score: row.score,
      maxCombo: row.max_combo,
      accuracy: row.accuracy,
      date: row.date,
      isCurrentUser: viewerId != null && row.user_id === viewerId
    }));

    return { success: true, songId, difficultyId, entries };
  }

  public async getDifficultyChart(songId: number, difficultyId: number, viewerId?: number): Promise<any | undefined> {
    const song = await PostgresDB.queryOne<SongRecord>('SELECT id, "ownerId", "isPublic" FROM "Song" WHERE id = $1', [songId]);
    if (!song || (!this.isPublicSong(song.isPublic) && song.ownerId !== viewerId)) return undefined;

    const difficulty = await PostgresDB.queryOne<SongDifficultyRecord>('SELECT id, song_id, difficulty, note_count FROM "Difficulty" WHERE id = $1', [difficultyId]);
    if (!difficulty || difficulty.song_id !== songId) return undefined;

    const notes = await PostgresDB.query<{ time_ms: number; lane: number }>('SELECT time_ms, lane FROM "Note" WHERE difficulty_id = $1 ORDER BY time_ms ASC, lane ASC', [difficultyId]);
    const mapped = notes.map(n => ({ time: n.time_ms, lane: n.lane }));

    return {
      success: true,
      songId,
      difficultyId,
      chart: {
        metadata: { title: song.name, artist: song.author, bpm: (song as any).bpm },
        notes: mapped
      }
    };
  }

  public async submitDifficultyHighscore(songId: number, difficultyId: number, userId: number, request: SubmitHighscoreRequest): Promise<SubmitHighscoreResponse> {
    try {
      if (!Number.isInteger(songId) || songId <= 0) return { success: false, improved: false, error: 'Invalid song ID' };
      if (!Number.isInteger(difficultyId) || difficultyId <= 0) return { success: false, improved: false, error: 'Invalid difficulty ID' };
      if (!Number.isInteger(userId) || userId <= 0) return { success: false, improved: false, error: 'User ID is required' };
      if (!Number.isFinite(request.score) || request.score < 0) return { success: false, improved: false, error: 'Score must be a non-negative number' };
      if (!Number.isFinite(request.maxCombo) || request.maxCombo < 0) return { success: false, improved: false, error: 'Max combo must be a non-negative number' };
      if (!Number.isFinite(request.accuracy) || request.accuracy < 0 || request.accuracy > 100) return { success: false, improved: false, error: 'Accuracy must be between 0 and 100' };

      const song = await PostgresDB.queryOne<SongRecord>('SELECT id, "ownerId", "isPublic" FROM "Song" WHERE id = $1', [songId]);
      if (!song || (!this.isPublicSong(song.isPublic) && song.ownerId !== userId)) return { success: false, improved: false, error: 'Song not found or not accessible' };

      const difficulty = await PostgresDB.queryOne<SongDifficultyRecord>('SELECT id, song_id, difficulty, note_count FROM "Difficulty" WHERE id = $1', [difficultyId]);
      if (!difficulty || difficulty.song_id !== songId) return { success: false, improved: false, error: 'Difficulty not found' };

      const candidate: HighscoreRecord = {
        user_id: userId,
        difficulty_id: difficultyId,
        score: Math.round(request.score),
        max_combo: Math.round(request.maxCombo),
        accuracy: Math.round(request.accuracy),
        date: request.date ?? new Date().toISOString()
      };

      const existing = await PostgresDB.queryOne<HighscoreRecord>('SELECT user_id, difficulty_id, score, max_combo, accuracy, date FROM "Highscore" WHERE user_id = $1 AND difficulty_id = $2', [userId, difficultyId]);

      const isBetter = (cand: HighscoreRecord, ex: HighscoreRecord) => {
        if (cand.score !== ex.score) return cand.score > ex.score;
        if (cand.accuracy !== ex.accuracy) return cand.accuracy > ex.accuracy;
        if (cand.max_combo !== ex.max_combo) return cand.max_combo > ex.max_combo;
        return false;
      };

      if (!existing) {
        await PostgresDB.execute('INSERT INTO "Highscore" (user_id, difficulty_id, score, max_combo, accuracy, date) VALUES ($1,$2,$3,$4,$5,$6)', [candidate.user_id, candidate.difficulty_id, candidate.score, candidate.max_combo, candidate.accuracy, candidate.date]);
      } else if (isBetter(candidate, existing)) {
        await PostgresDB.execute('UPDATE "Highscore" SET score = $1, max_combo = $2, accuracy = $3, date = $4 WHERE user_id = $5 AND difficulty_id = $6', [candidate.score, candidate.max_combo, candidate.accuracy, candidate.date, candidate.user_id, candidate.difficulty_id]);
      } else {
        const current = await this.getDifficultyLeaderboard(songId, difficultyId, userId);
        const entry = current?.entries.find(e => e.userId === userId);
        return { success: true, improved: false, entry };
      }

      const updatedLeaderboard = await this.getDifficultyLeaderboard(songId, difficultyId, userId);
      const entry = updatedLeaderboard?.entries.find(row => row.userId === userId);
      return { success: true, improved: true, entry };
    } catch (err: any) {
      return { success: false, improved: false, error: err.message || 'Failed to submit highscore' };
    }
  }

  private async getDifficultiesBySongId(songId: number): Promise<SongDifficultyResponse[]> {
    const rows = await PostgresDB.query<SongDifficultyRecord>('SELECT id, song_id, difficulty, note_count FROM "Difficulty" WHERE song_id = $1 ORDER BY difficulty ASC', [songId]);
    return rows.map(r => ({ id: r.id, difficulty: r.difficulty, noteCount: r.note_count }));
  }

  private toResponse(song: SongRecord): SongResponse {
    return {
      id: song.id,
      name: song.name,
      author: song.author,
      bpm: song.bpm,
      length: song.length,
      songUrl: song.songUrl as unknown as string,
      coverUrl: song.coverUrl as unknown as string,
      ownerId: song.ownerId,
      isPublic: this.isPublicSong(song.isPublic),
      difficulties: [] // callers may populate difficulties with separate call
    };
  }

  private parseVisibilityInput(value: boolean | number | string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'public') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'private') return false;
    return fallback;
  }
}

export default SongServiceAsync;

