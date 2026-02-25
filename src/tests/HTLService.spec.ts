import { Unit } from '../backend/unit';
import { HTLService } from '../backend/HTLService';
import { User } from '../backend/model';

describe('HTLService', () => {
  let unit: Unit;
  let service: HTLService;

  beforeEach(() => {
    unit = new Unit(false);
    service = new HTLService(unit);
  });

  afterEach(() => {
    unit.complete(false);
  });

  describe('userToJSON', () => {
    it('should convert user to JSON without password', () => {
      const user: User = { id: 1, username: 'testuser', password: 'secret' };
      const result = service.userToJSON(user);
      expect(result).toEqual({ id: 1, username: 'testuser' });
    });
  });

  describe('songToJSON', () => {
    it('should convert song to JSON without difficulties', () => {
      const song = { id: 1, name: 'Test Song', author: 'Test Artist', bpm: 120 };
      const result = service.songToJSON(song);
      expect(result).toEqual({
        id: 1,
        name: 'Test Song',
        author: 'Test Artist',
        bpm: 120
      });
    });

    it('should include difficulties when requested', () => {
      unit.prepare('INSERT INTO Song (id, name, author, bpm) VALUES ($id, $name, $author, $bpm)', {
        id: 1, name: 'Test Song', author: 'Artist', bpm: 120
      }).run();

      unit.prepare('INSERT INTO Difficulty (song_id, difficulty, note_count) VALUES ($songId, $diff, $count)', {
        songId: 1, diff: 3, count: 100
      }).run();

      const song = { id: 1, name: 'Test Song', author: 'Artist', bpm: 120 };
      const result = service.songToJSON(song, true);

      expect(result.difficulties).toBeDefined();
      expect(result.difficulties!.length).toBe(1);
      expect(result.difficulties![0].difficulty).toBe(3);
    });
  });

  describe('difficultyToJSON', () => {
    it('should convert difficulty to JSON without notes', () => {
      const difficulty = { id: 1, song_id: 1, difficulty: 3, note_count: 100 };
      const result = service.difficultyToJSON(difficulty);
      expect(result).toEqual({
        id: 1,
        song_id: 1,
        difficulty: 3,
        note_count: 100
      });
    });

    it('should include notes when requested', () => {
      unit.prepare("INSERT INTO Song (id, name, author, bpm) VALUES ($id, $name, $author, $bpm)", { id: 1, name: 'Song', author: 'Artist', bpm: 120 }).run();
      unit.prepare("INSERT INTO Difficulty (id, song_id, difficulty, note_count) VALUES ($id, $songId, $diff, $count)", { id: 1, songId: 1, diff: 3, count: 2 }).run();
      unit.prepare("INSERT INTO Note (difficulty_id, time_ms, lane, type, duration_ms) VALUES ($diffId, $time, $lane, $type, $duration)", { diffId: 1, time: 1000, lane: 1, type: 1, duration: null }).run();
      unit.prepare("INSERT INTO Note (difficulty_id, time_ms, lane, type, duration_ms) VALUES ($diffId, $time, $lane, $type, $duration)", { diffId: 1, time: 2000, lane: 2, type: 1, duration: null }).run();

      const difficulty = { id: 1, song_id: 1, difficulty: 3, note_count: 2 };
      const result = service.difficultyToJSON(difficulty, true);

      expect(result.notes).toBeDefined();
      expect(result.notes!.length).toBe(2);
    });
  });

  describe('noteToJSON', () => {
    it('should convert note to JSON', () => {
      const note = {
        id: 1,
        difficulty_id: 1,
        time_ms: 1500,
        lane: 2,
        type: 1,
        duration_ms: null
      };
      const result = service.noteToJSON(note);
      expect(result).toEqual(note);
    });
  });

  describe('highscoreToJSON', () => {
    it('should convert highscore to JSON with user and song info', () => {
      unit.prepare("INSERT INTO User (id, username, password) VALUES ($id, $username, $password)", { id: 1, username: 'player1', password: 'pass' }).run();
      unit.prepare("INSERT INTO Song (id, name, author, bpm) VALUES ($id, $name, $author, $bpm)", { id: 1, name: 'My Song', author: 'Artist', bpm: 128 }).run();
      unit.prepare("INSERT INTO Difficulty (id, song_id, difficulty, note_count) VALUES ($id, $songId, $diff, $count)", { id: 1, songId: 1, diff: 3, count: 100 }).run();

      const highscore = {
        user_id: 1,
        difficulty_id: 1,
        score: 95000,
        max_combo: 150,
        accuracy: 98,
        date: '2024-01-15T10:30:00Z'
      };
      const result = service.highscoreToJSON(highscore);

      expect(result.username).toBe('player1');
      expect(result.song_name).toBe('My Song');
    });

    it('should show Unknown for missing user/song', () => {
      const highscore = {
        user_id: 999,
        difficulty_id: 999,
        score: 50000,
        max_combo: 50,
        accuracy: 85,
        date: '2024-01-15T10:30:00Z'
      };
      const result = service.highscoreToJSON(highscore);

      expect(result.username).toBe('Unknown');
      expect(result.song_name).toBe('Unknown');
    });
  });

  describe('userFromJSON', () => {
    it('should convert JSON to user entity', () => {
      const json = { username: 'newuser', password: 'password123' };
      const result = service.userFromJSON(json);
      expect(result).toEqual({
        id: 0,
        username: 'newuser',
        password: 'password123'
      });
    });

    it('should trim username whitespace', () => {
      const json = { username: '  user  ', password: 'password123' };
      const result = service.userFromJSON(json);
      expect(result.username).toBe('user');
    });

    it('should reject short username', () => {
      expect(() => service.userFromJSON({ username: 'ab', password: 'password123' }))
        .toThrow('Username must be at least 3 characters');
    });

    it('should reject short password', () => {
      expect(() => service.userFromJSON({ username: 'validuser', password: 'short' }))
        .toThrow('Password must be at least 6 characters');
    });
  });

  describe('songFromJSON', () => {
    it('should convert JSON to song entity', () => {
      const json = { name: 'New Song', author: 'New Artist', bpm: 140 };
      const result = service.songFromJSON(json);
      expect(result).toEqual({
        id: 0,
        name: 'New Song',
        author: 'New Artist',
        bpm: 140
      });
    });

    it('should round BPM to integer', () => {
      const json = { name: 'Song', author: 'Artist', bpm: 128.7 };
      const result = service.songFromJSON(json);
      expect(result.bpm).toBe(129);
    });

    it('should reject empty name', () => {
      expect(() => service.songFromJSON({ name: '', author: 'Artist', bpm: 120 }))
        .toThrow('Song name is required');
    });
  });

  describe('difficultyFromJSON', () => {
    it('should convert JSON to difficulty entity', () => {
      const json = { song_id: 1, difficulty: 5, note_count: 200 };
      const result = service.difficultyFromJSON(json);
      expect(result).toEqual({
        id: 0,
        song_id: 1,
        difficulty: 5,
        note_count: 200
      });
    });

    it('should reject invalid difficulty range', () => {
      expect(() => service.difficultyFromJSON({ song_id: 1, difficulty: 15, note_count: 100 }))
        .toThrow('Difficulty must be between 1 and 10');
    });
  });

  describe('noteFromJSON', () => {
    it('should convert JSON to note entity', () => {
      const json = { difficulty_id: 1, time_ms: 1000, lane: 2, type: 1, duration_ms: null };
      const result = service.noteFromJSON(json);
      expect(result).toEqual({
        id: 0,
        difficulty_id: 1,
        time_ms: 1000,
        lane: 2,
        type: 1,
        duration_ms: null
      });
    });

    it('should reject invalid lane', () => {
      expect(() => service.noteFromJSON({
        difficulty_id: 1, time_ms: 1000, lane: 5, type: 1, duration_ms: null
      })).toThrow('Lane must be between 1 and 4');
    });
  });

  describe('highscoreFromJSON', () => {
    it('should convert JSON to highscore entity', () => {
      const json = {
        user_id: 1,
        difficulty_id: 2,
        score: 88000,
        max_combo: 120,
        accuracy: 95,
        date: '2024-06-01T12:00:00Z'
      };
      const result = service.highscoreFromJSON(json);
      expect(result.score).toBe(88000);
      expect(result.accuracy).toBe(95);
    });

    it('should auto-generate date if missing', () => {
      const json = {
        user_id: 1,
        difficulty_id: 2,
        score: 50000,
        max_combo: 80,
        accuracy: 90
      };
      const result = service.highscoreFromJSON(json as any);
      expect(result.date).toBeDefined();
    });

    it('should reject accuracy > 100', () => {
      expect(() => service.highscoreFromJSON({
        user_id: 1, difficulty_id: 2, score: 1000, max_combo: 10, accuracy: 150, date: '2024-01-01'
      })).toThrow('Accuracy must be between 0 and 100');
    });
  });

  describe('toJSON', () => {
    it('should route to correct method', () => {
      const user: User = { id: 1, username: 'test', password: 'pass' };
      const result = service.toJSON(user, 'user');
      expect(result).toEqual({ id: 1, username: 'test' });
    });
  });

  describe('fromJSON', () => {
    it('should route to correct method', () => {
      const json = { username: 'test', password: 'password123' };
      const result = service.fromJSON(json, 'user');
      expect((result as User).username).toBe('test');
    });
  });
});
