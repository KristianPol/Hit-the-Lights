import { PostgresDB } from '../database/postgres-db';

export interface SongJSON { id: number; name: string; author: string; bpm: number; difficulties?: DifficultyJSON[] }
export interface DifficultyJSON { id: number; song_id: number; difficulty: number; note_count: number; notes?: NoteJSON[] }
export interface NoteJSON { id: number; difficulty_id: number; time_ms: number; lane: number; type: number; duration_ms: number | null }
export interface HighscoreJSON { user_id: number; difficulty_id: number; score: number; max_combo: number; accuracy: number; date: string; username?: string; song_name?: string }
export interface UserJSON { id: number; username: string; joinDate: string; profilePictureUrl?: string; playtimeSeconds?: number; highscores?: HighscoreJSON[] }

export class HTLServiceAsync {
  constructor() {}

  public userToJSON(user: { id: number; username: string; joinDate: string; profilePicture?: Buffer | null; playtimeSeconds?: number }): UserJSON {
    return {
      id: user.id,
      username: user.username,
      joinDate: user.joinDate,
      profilePictureUrl: user.profilePicture ? `/api/auth/profile-picture/${user.id}?t=${Date.now()}` : undefined,
      playtimeSeconds: typeof user.playtimeSeconds === 'number' ? user.playtimeSeconds : 0
    };
  }

  public async songToJSON(song: { id: number; name: string; author: string; bpm: number }, includeDifficulties: boolean = false): Promise<SongJSON> {
    const result: SongJSON = { id: song.id, name: song.name, author: song.author, bpm: song.bpm };
    if (includeDifficulties) {
      const rows = await PostgresDB.query<{ id: number; song_id: number; difficulty: number; note_count: number }>('SELECT id, song_id, difficulty, note_count FROM "Difficulty" WHERE song_id = $1', [song.id]);
      result.difficulties = rows.map(r => ({ id: r.id, song_id: r.song_id, difficulty: r.difficulty, note_count: r.note_count }));
    }
    return result;
  }

  public async difficultyToJSON(difficulty: { id: number; song_id: number; difficulty: number; note_count: number }, includeNotes: boolean = false): Promise<DifficultyJSON> {
    const result: DifficultyJSON = { id: difficulty.id, song_id: difficulty.song_id, difficulty: difficulty.difficulty, note_count: difficulty.note_count };
    if (includeNotes) {
      const rows = await PostgresDB.query<NoteJSON>('SELECT id, difficulty_id, time_ms, lane, type, duration_ms FROM "Note" WHERE difficulty_id = $1', [difficulty.id]);
      result.notes = rows as NoteJSON[];
    }
    return result;
  }

  public noteToJSON(note: { id: number; difficulty_id: number; time_ms: number; lane: number; type: number; duration_ms: number | null }): NoteJSON {
    return { id: note.id, difficulty_id: note.difficulty_id, time_ms: note.time_ms, lane: note.lane, type: note.type, duration_ms: note.duration_ms };
  }

  public async highscoreToJSON(highscore: { user_id: number; difficulty_id: number; score: number; max_combo: number; accuracy: number; date: string }): Promise<HighscoreJSON> {
    const user = await PostgresDB.queryOne<{ username: string }>('SELECT username FROM "User" WHERE id = $1', [highscore.user_id]);
    const song = await PostgresDB.queryOne<{ name: string }>('SELECT s.name FROM "Song" s JOIN "Difficulty" d ON s.id = d.song_id WHERE d.id = $1', [highscore.difficulty_id]);
    return { user_id: highscore.user_id, difficulty_id: highscore.difficulty_id, score: highscore.score, max_combo: highscore.max_combo, accuracy: highscore.accuracy, date: highscore.date, username: user?.username ?? 'Unknown', song_name: song?.name ?? 'Unknown' };
  }

  // Validation helpers used by registration/login
  public userFromJSON(json: { username: string; password: string; id?: number; joinDate?: string }) {
    if (!json.username || json.username.length < 3) throw new Error('Username must be at least 3 characters');
    if (!json.password || json.password.length < 6) throw new Error('Password must be at least 6 characters');
    return { id: json.id ?? 0, username: json.username.trim(), password: json.password, joinDate: json.joinDate ?? new Date().toISOString() };
  }

  public songFromJSON(json: { name: string; author: string; bpm: number; id?: number }) {
    if (!json.name || json.name.trim().length === 0) throw new Error('Song name is required');
    if (!json.author || json.author.trim().length === 0) throw new Error('Song author is required');
    if (json.bpm <= 0) throw new Error('BPM must be a positive number');
    return { id: json.id ?? 0, name: json.name.trim(), author: json.author.trim(), bpm: Math.round(json.bpm) };
  }

  public difficultyFromJSON(json: { song_id: number; difficulty: number; note_count: number; id?: number }) {
    if (json.song_id <= 0) throw new Error('Valid song_id is required');
    if (json.difficulty < 1 || json.difficulty > 10) throw new Error('Difficulty must be between 1 and 10');
    if (json.note_count < 0) throw new Error('Note count must be a non-negative number');
    return { id: json.id ?? 0, song_id: json.song_id, difficulty: json.difficulty, note_count: json.note_count };
  }

  public noteFromJSON(json: { difficulty_id: number; time_ms: number; lane: number; type: number; duration_ms?: number | null; id?: number }) {
    if (json.difficulty_id <= 0) throw new Error('Valid difficulty_id is required');
    if (json.time_ms < 0) throw new Error('Time must be a non-negative number');
    if (json.lane < 1 || json.lane > 4) throw new Error('Lane must be between 1 and 4');
    if (json.type < 0) throw new Error('Type must be a non-negative number');
    return { id: json.id ?? 0, difficulty_id: json.difficulty_id, time_ms: Math.round(json.time_ms), lane: json.lane, type: json.type, duration_ms: json.duration_ms ?? null };
  }
}

export default HTLServiceAsync;

