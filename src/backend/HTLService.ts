import {Unit} from './unit';
import {User} from './model';

export interface SongJSON {
  id: number;
  name: string;
  author: string;
  bpm: number;
  difficulties?: DifficultyJSON[];
}

export interface DifficultyJSON {
  id: number;
  song_id: number;
  difficulty: number;
  note_count: number;
  notes?: NoteJSON[];
}

export interface NoteJSON {
  id: number;
  difficulty_id: number;
  time_ms: number;
  lane: number;
  type: number;
  duration_ms: number | null;
}

export interface HighscoreJSON {
  user_id: number;
  difficulty_id: number;
  score: number;
  max_combo: number;
  accuracy: number;
  date: string;
  username?: string;
  song_name?: string;
}

export interface UserJSON {
  id: number;
  username: string;
  highscores?: HighscoreJSON[];
}

export class HTLService {
  constructor(private unit: Unit) {}

  /**
   * Converts a User entity to JSON format
   * @param user The User object to convert
   * @returns UserJSON object
   */
  public userToJSON(user: User): UserJSON {
    return {
      id: user.id,
      username: user.username
    };
  }

  /**
   * Converts a Song entity to JSON format
   * @param song The song data from database
   * @param includeDifficulties Whether to include nested difficulties
   * @returns SongJSON object
   */
  public songToJSON(song: {
    id: number;
    name: string;
    author: string;
    bpm: number;
  }, includeDifficulties: boolean = false): SongJSON {
    const result: SongJSON = {
      id: song.id,
      name: song.name,
      author: song.author,
      bpm: song.bpm
    };

    if (includeDifficulties) {
      const stmt = this.unit.prepare<DifficultyJSON, { songId: number }>(
        'SELECT id, song_id, difficulty, note_count FROM Difficulty WHERE song_id = $songId',
        { songId: song.id }
      );
      result.difficulties = stmt.all();
    }

    return result;
  }

  /**
   * Converts a Difficulty entity to JSON format
   * @param difficulty The difficulty data from database
   * @param includeNotes Whether to include nested notes
   * @returns DifficultyJSON object
   */
  public difficultyToJSON(difficulty: {
    id: number;
    song_id: number;
    difficulty: number;
    note_count: number;
  }, includeNotes: boolean = false): DifficultyJSON {
    const result: DifficultyJSON = {
      id: difficulty.id,
      song_id: difficulty.song_id,
      difficulty: difficulty.difficulty,
      note_count: difficulty.note_count
    };

    if (includeNotes) {
      const stmt = this.unit.prepare<NoteJSON, { diffId: number }>(
        'SELECT id, difficulty_id, time_ms, lane, type, duration_ms FROM Note WHERE difficulty_id = $diffId',
        { diffId: difficulty.id }
      );
      result.notes = stmt.all();
    }

    return result;
  }

  /**
   * Converts a Note entity to JSON format
   * @param note The note data from database
   * @returns NoteJSON object
   */
  public noteToJSON(note: {
    id: number;
    difficulty_id: number;
    time_ms: number;
    lane: number;
    type: number;
    duration_ms: number | null;
  }): NoteJSON {
    return {
      id: note.id,
      difficulty_id: note.difficulty_id,
      time_ms: note.time_ms,
      lane: note.lane,
      type: note.type,
      duration_ms: note.duration_ms
    };
  }

  /**
   * Converts a Highscore entity to JSON format
   * Always includes username and song name
   * @param highscore The highscore data from database
   * @returns HighscoreJSON object with user and song info
   */
  public highscoreToJSON(highscore: {
    user_id: number;
    difficulty_id: number;
    score: number;
    max_combo: number;
    accuracy: number;
    date: string;
  }): HighscoreJSON {
    const userStmt = this.unit.prepare<{ username: string }, { userId: number }>(
      'SELECT username FROM User WHERE id = $userId',
      { userId: highscore.user_id }
    );
    const user = userStmt.get();

    const songStmt = this.unit.prepare<{ name: string }, { diffId: number }>(
      `SELECT s.name FROM Song s
       JOIN Difficulty d ON s.id = d.song_id
       WHERE d.id = $diffId`,
      { diffId: highscore.difficulty_id }
    );
    const song = songStmt.get();

    return {
      user_id: highscore.user_id,
      difficulty_id: highscore.difficulty_id,
      score: highscore.score,
      max_combo: highscore.max_combo,
      accuracy: highscore.accuracy,
      date: highscore.date,
      username: user?.username ?? 'Unknown',
      song_name: song?.name ?? 'Unknown'
    };
  }

  /**
   * Generic toJSON method that handles any entity type
   * @param entity The entity to convert
   * @param entityType The type of entity ('user', 'song', 'difficulty', 'note', 'highscore')
   * @param options Additional options based on entity type
   * @returns The JSON representation
   */
  public toJSON(
    entity: unknown,
    entityType: 'user' | 'song' | 'difficulty' | 'note' | 'highscore',
    options?: {
      includeDifficulties?: boolean;
      includeNotes?: boolean;
      includeUserInfo?: boolean;
    }
  ): UserJSON | SongJSON | DifficultyJSON | NoteJSON | HighscoreJSON {
    switch (entityType) {
      case 'user':
        return this.userToJSON(entity as User);
      case 'song':
        return this.songToJSON(
          entity as SongJSON,
          options?.includeDifficulties ?? false
        );
      case 'difficulty':
        return this.difficultyToJSON(
          entity as DifficultyJSON,
          options?.includeNotes ?? false
        );
      case 'note':
        return this.noteToJSON(entity as NoteJSON);
      case 'highscore':
        return this.highscoreToJSON(entity as HighscoreJSON);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  // ==================== FROM JSON METHODS ====================

  /**
   * Converts JSON to User entity format
   * @param json The UserJSON object
   * @returns User entity ready for database operations
   */
  public userFromJSON(json: Omit<UserJSON, 'id'> & { password: string; id?: number }): User {
    if (!json.username || json.username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    if (!json.password || json.password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    return {
      id: json.id ?? 0,
      username: json.username.trim(),
      password: json.password
    };
  }

  /**
   * Converts JSON to Song entity format
   * @param json The SongJSON object (id optional for creation)
   * @returns Song entity ready for database operations
   */
  public songFromJSON(json: Omit<SongJSON, 'id'> & { id?: number }): {
    id: number;
    name: string;
    author: string;
    bpm: number;
  } {
    if (!json.name || json.name.trim().length === 0) {
      throw new Error('Song name is required');
    }
    if (!json.author || json.author.trim().length === 0) {
      throw new Error('Song author is required');
    }
    if (json.bpm <= 0) {
      throw new Error('BPM must be a positive number');
    }

    return {
      id: json.id ?? 0,
      name: json.name.trim(),
      author: json.author.trim(),
      bpm: Math.round(json.bpm)
    };
  }

  /**
   * Converts JSON to Difficulty entity format
   * @param json The DifficultyJSON object (id optional for creation)
   * @returns Difficulty entity ready for database operations
   */
  public difficultyFromJSON(json: Omit<DifficultyJSON, 'id'> & { id?: number }): {
    id: number;
    song_id: number;
    difficulty: number;
    note_count: number;
  } {
    if (json.song_id <= 0) {
      throw new Error('Valid song_id is required');
    }
    if (json.difficulty < 1 || json.difficulty > 10) {
      throw new Error('Difficulty must be between 1 and 10');
    }
    if (json.note_count < 0) {
      throw new Error('Note count must be a non-negative number');
    }

    return {
      id: json.id ?? 0,
      song_id: json.song_id,
      difficulty: json.difficulty,
      note_count: json.note_count
    };
  }

  /**
   * Converts JSON to Note entity format
   * @param json The NoteJSON object (id optional for creation)
   * @returns Note entity ready for database operations
   */
  public noteFromJSON(json: Omit<NoteJSON, 'id'> & { id?: number }): {
    id: number;
    difficulty_id: number;
    time_ms: number;
    lane: number;
    type: number;
    duration_ms: number | null;
  } {
    if (json.difficulty_id <= 0) {
      throw new Error('Valid difficulty_id is required');
    }
    if (json.time_ms < 0) {
      throw new Error('Time must be a non-negative number');
    }
    if (json.lane < 1 || json.lane > 4) {
      throw new Error('Lane must be between 1 and 4');
    }
    if (json.type < 0) {
      throw new Error('Type must be a non-negative number');
    }

    return {
      id: json.id ?? 0,
      difficulty_id: json.difficulty_id,
      time_ms: Math.round(json.time_ms),
      lane: json.lane,
      type: json.type,
      duration_ms: json.duration_ms !== null && json.duration_ms !== undefined
        ? Math.max(0, Math.round(json.duration_ms))
        : null
    };
  }

  /**
   * Converts JSON to Highscore entity format
   * @param json The HighscoreJSON object
   * @returns Highscore entity ready for database operations
   */
  public highscoreFromJSON(json: Omit<HighscoreJSON, 'username' | 'song_name'>): {
    user_id: number;
    difficulty_id: number;
    score: number;
    max_combo: number;
    accuracy: number;
    date: string;
  } {
    if (json.user_id <= 0) {
      throw new Error('Valid user_id is required');
    }
    if (typeof json.difficulty_id !== 'number' || json.difficulty_id <= 0) {
      throw new Error('Valid difficulty_id is required');
    }
    if (typeof json.score !== 'number' || json.score < 0) {
      throw new Error('Score must be a non-negative number');
    }
    if (json.max_combo < 0) {
      throw new Error('Max combo must be a non-negative number');
    }
    if (json.accuracy < 0 || json.accuracy > 100) {
      throw new Error('Accuracy must be between 0 and 100');
    }

    let dateStr = json.date;
    if (!dateStr) {
      dateStr = new Date().toISOString();
    }

    return {
      user_id: json.user_id,
      difficulty_id: json.difficulty_id,
      score: Math.round(json.score),
      max_combo: Math.round(json.max_combo),
      accuracy: Math.round(json.accuracy),
      date: dateStr
    };
  }

  /**
   * Generic fromJSON method that handles any entity type
   * @param json The JSON object to convert
   * @param entityType The type of entity ('user', 'song', 'difficulty', 'note', 'highscore')
   * @returns The entity in database format
   */
  public fromJSON(
    json: unknown,
    entityType: 'user' | 'song' | 'difficulty' | 'note' | 'highscore'
  ): ReturnType<
    | HTLService['userFromJSON']
    | HTLService['songFromJSON']
    | HTLService['difficultyFromJSON']
    | HTLService['noteFromJSON']
    | HTLService['highscoreFromJSON']
  > {
    switch (entityType) {
      case 'user':
        return this.userFromJSON(json as Parameters<HTLService['userFromJSON']>[0]);
      case 'song':
        return this.songFromJSON(json as Parameters<HTLService['songFromJSON']>[0]);
      case 'difficulty':
        return this.difficultyFromJSON(json as Parameters<HTLService['difficultyFromJSON']>[0]);
      case 'note':
        return this.noteFromJSON(json as Parameters<HTLService['noteFromJSON']>[0]);
      case 'highscore':
        return this.highscoreFromJSON(json as Parameters<HTLService['highscoreFromJSON']>[0]);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }
}
