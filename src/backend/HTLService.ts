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

  // TODO: implement fromJSON functions
}
