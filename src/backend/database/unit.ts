import path from "path";
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

import postgres from "postgres";

let sqlInstance: postgres.Sql | null = null;

function getSql(): postgres.Sql {
  const DATABASE_URL = process.env["DATABASE_URL"];
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  if (!sqlInstance) {
    sqlInstance = postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
      ssl: { rejectUnauthorized: false },
    });
  }
  return sqlInstance;
}

export { getSql as sql };

// PostgreSQL lowercases unquoted camelCase column names. This maps them back.
const COLUMN_MAP: Record<string, string> = {
  songurl: 'songUrl',
  coverurl: 'coverUrl',
  ownerid: 'ownerId',
  ispublic: 'isPublic',
  songid: 'songId',
  userid: 'userId',
  difficultyid: 'difficultyId',
  noteid: 'noteId',
  achievementid: 'achievementId',
  parentcommentid: 'parentCommentId',
  senderid: 'senderId',
  receiverid: 'receiverId',
  profilepicture: 'profilePicture',
  profilepictureurl: 'profilePictureUrl',
  joindate: 'joinDate',
  playtimeseconds: 'playtimeSeconds',
  settingsjson: 'settingsJson',
  perfecttotal: 'perfectTotal',
  goodtotal: 'goodTotal',
  glimmertotal: 'glimmerTotal',
  misstotal: 'missTotal',
  totalscore: 'totalScore',
  totalaccuracy: 'totalAccuracy',
  runscount: 'runsCount',
  isread: 'isRead',
  lanebindingsjson: 'laneBindingsJson',
  notespeed: 'noteSpeed',
  updatedat: 'updatedAt',
  maxcombo: 'maxCombo',
  timems: 'timeMs',
  durationms: 'durationMs',
  playcount: 'playCount',
  notecount: 'noteCount',
  likecount: 'likeCount',
  islikedbyuser: 'isLikedByUser',
};

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[COLUMN_MAP[key] ?? key] = value;
  }
  return result;
}

export class Unit {
  private completed: boolean;
  private reservedConn: postgres.ReservedSql | null = null;
  private connectionPromise: Promise<void> | null = null;
  private transactionStarted: boolean = false;
  private static tablesEnsured: boolean = false;
  private static tablesEnsurePromise: Promise<void> | null = null;

  public static initTables(): Promise<void> {
    if (Unit.tablesEnsured) {
      return Promise.resolve();
    }
    if (!Unit.tablesEnsurePromise) {
      Unit.tablesEnsurePromise = Unit.ensureTablesCreated().then(() => {
        Unit.tablesEnsured = true;
      }).catch((err) => {
        console.error('❌ ensureTablesCreated failed, will retry on next request:', err.message || err);
        Unit.tablesEnsurePromise = null;
        throw err;
      });
    }
    return Unit.tablesEnsurePromise;
  }

  public constructor(public readonly readOnly: boolean) {
    this.completed = false;
    if (!Unit.tablesEnsured && !Unit.tablesEnsurePromise) {
      Unit.tablesEnsurePromise = Unit.ensureTablesCreated().then(() => {
        Unit.tablesEnsured = true;
      }).catch((err) => {
        console.error('❌ ensureTablesCreated failed, will retry on next request:', err.message || err);
        Unit.tablesEnsurePromise = null;
        throw err;
      });
    }
  }

  private async ensureConnection(): Promise<postgres.Sql | postgres.ReservedSql> {
    if (Unit.tablesEnsurePromise) {
      try {
        await Unit.tablesEnsurePromise;
      } catch {
        // If the promise rejected, clear it so the next Unit constructor retries
        Unit.tablesEnsurePromise = null;
        throw new Error('Database schema initialization failed');
      }
    }
    if (this.readOnly) {
      return getSql();
    }
    if (!this.reservedConn && !this.connectionPromise) {
      this.connectionPromise = getSql().reserve().then((conn) => {
        this.reservedConn = conn;
        return conn.unsafe("BEGIN");
      }).then(() => {
        this.transactionStarted = true;
      });
    }
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
    return this.reservedConn!;
  }

  public prepare<
    TResult,
    TParams extends Record<string, unknown> = Record<string, unknown>
  >(sqlStr: string, bindings?: TParams): ITypedStatement<TResult, TParams> {
    const { sql: transformedSql, args } = this.transformParams(sqlStr, bindings);
    const quotedSql = this.quoteReservedWords(transformedSql);

    return {
      get: async (): Promise<TResult | undefined> => {
        const conn = await this.ensureConnection();
        const rows = await conn.unsafe(quotedSql, args as any[]);
        const normalized = rows[0] ? normalizeRow(rows[0]) : undefined;
        return normalized as unknown as TResult ?? undefined;
      },
      all: async (): Promise<TResult[]> => {
        const conn = await this.ensureConnection();
        const rows = await conn.unsafe(quotedSql, args as any[]);
        return rows.map(normalizeRow) as unknown as TResult[];
      },
      run: async (): Promise<RunResult> => {
        const conn = await this.ensureConnection();
        const rows = await conn.unsafe(quotedSql, args as any[]);
        const count = (rows as any).count ?? 0;
        return { changes: count };
      },
    };
  }

  public async getLastRowId(): Promise<number> {
    const conn = await this.ensureConnection();
    try {
      const rows = await conn.unsafe('SELECT lastval() AS "id"');
      const result = rows[0] as unknown as { id: number } | undefined;
      return result?.id ?? 0;
    } catch {
      return 0;
    }
  }

  public async complete(commit: boolean | null = null): Promise<void> {
    if (this.completed) {
      return;
    }

    this.completed = true;

    if (this.reservedConn) {
      if (commit === true) {
        await this.reservedConn.unsafe("COMMIT");
      } else if (commit === false) {
        await this.reservedConn.unsafe("ROLLBACK");
      } else if (!this.readOnly) {
        await this.reservedConn.unsafe("ROLLBACK");
      }
      await this.reservedConn.release();
      this.reservedConn = null;
      this.connectionPromise = null;
    }
  }

  private transformParams(
    sqlStr: string,
    bindings?: Record<string, unknown>
  ): { sql: string; args: unknown[] } {
    if (!bindings) {
      return { sql: sqlStr, args: [] };
    }

    const args: unknown[] = [];
    const paramNames: string[] = [];
    const regex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sqlStr)) !== null) {
      const name = match[1];
      if (!paramNames.includes(name)) {
        paramNames.push(name);
      }
    }

    const transformedSql = sqlStr.replace(regex, (_full, name: string) => {
      const index = paramNames.indexOf(name);
      return `$${index + 1}`;
    });

    for (const name of paramNames) {
      const value = bindings[name];
      args.push(value === undefined ? null : value);
    }

    return { sql: transformedSql, args };
  }

  private quoteReservedWords(sqlStr: string): string {
    return sqlStr
      .replace(/\bFROM\s+User\b/g, 'FROM "User"')
      .replace(/\bINTO\s+User\b/g, 'INTO "User"')
      .replace(/\bJOIN\s+User\b/g, 'JOIN "User"')
      .replace(/\bUPDATE\s+User\b/g, 'UPDATE "User"')
      .replace(/\bTABLE\s+User\b/g, 'TABLE "User"')
      .replace(/\bREFERENCES\s+User\b/g, 'REFERENCES "User"')
      .replace(/\bDELETE\s+FROM\s+User\b/g, 'DELETE FROM "User"');
  }

  private static async reverseMigrateColumnNames(): Promise<void> {
    // Previous deploy renamed columns to quoted camelCase. Rename them back to lowercase
    // so unquoted SQL references work correctly with normalizeRow().
    const migrations = [
      // Song table
      `ALTER TABLE Song RENAME COLUMN "songUrl" TO songurl;`,
      `ALTER TABLE Song RENAME COLUMN "coverUrl" TO coverurl;`,
      `ALTER TABLE Song RENAME COLUMN "ownerId" TO ownerid;`,
      `ALTER TABLE Song RENAME COLUMN "isPublic" TO ispublic;`,
      // User table
      `ALTER TABLE "User" RENAME COLUMN "profilePicture" TO profilepicture;`,
      `ALTER TABLE "User" RENAME COLUMN "joinDate" TO joindate;`,
      `ALTER TABLE "User" RENAME COLUMN "perfectTotal" TO perfecttotal;`,
      `ALTER TABLE "User" RENAME COLUMN "goodTotal" TO goodtotal;`,
      `ALTER TABLE "User" RENAME COLUMN "glimmerTotal" TO glimmertotal;`,
      `ALTER TABLE "User" RENAME COLUMN "missTotal" TO misstotal;`,
      `ALTER TABLE "User" RENAME COLUMN "totalScore" TO totalscore;`,
      `ALTER TABLE "User" RENAME COLUMN "totalAccuracy" TO totalaccuracy;`,
      `ALTER TABLE "User" RENAME COLUMN "runsCount" TO runscount;`,
    ];
    for (const sql of migrations) {
      try {
        await getSql().unsafe(sql);
        console.log('✅ Migration applied:', sql.split('RENAME COLUMN')[1]?.split('TO')[0]?.trim(), '-> lowercase');
      } catch (err: any) {
        if (err.message?.includes('does not exist')) {
          // Already renamed or was never quoted — expected on subsequent runs
        } else {
          console.warn('Migration warning:', err.message);
        }
      }
    }

    // Diagnostic: log current column names
    try {
      const songCols = await getSql().unsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'song' ORDER BY ordinal_position`);
      console.log('📊 Song columns:', songCols.map((r: any) => r.column_name));
      const userCols = await getSql().unsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'User' ORDER BY ordinal_position`);
      console.log('📊 User columns:', userCols.map((r: any) => r.column_name));
    } catch (e: any) {
      console.warn('Could not read column diagnostics:', e.message);
    }
  }

  public static async ensureTablesCreated(): Promise<void> {
    await Unit.reverseMigrateColumnNames();

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        profilePicture BYTEA,
        profilePictureUrl TEXT,
        joinDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        playtime_seconds INTEGER NOT NULL DEFAULT 0,
        settings_json TEXT,
        perfectTotal INTEGER NOT NULL DEFAULT 0,
        goodTotal INTEGER NOT NULL DEFAULT 0,
        glimmerTotal INTEGER NOT NULL DEFAULT 0,
        missTotal INTEGER NOT NULL DEFAULT 0,
        totalScore INTEGER NOT NULL DEFAULT 0,
        totalAccuracy REAL NOT NULL DEFAULT 0,
        runsCount INTEGER NOT NULL DEFAULT 0,
        role TEXT DEFAULT 'user',
        is_banned INTEGER DEFAULT 0,
        last_song_upload_at TIMESTAMP,
        CONSTRAINT uq_username UNIQUE (username)
      )
    `);

    // Ensure profilePictureUrl exists on older User tables
    try {
      await getSql().unsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS profilePictureUrl TEXT`);
    } catch (e: any) {
      // ignore
    }

    // Ensure role exists on older User tables
    try {
      await getSql().unsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'`);
    } catch (e: any) {
      // ignore
    }

    // Ensure is_banned exists on older User tables
    try {
      await getSql().unsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_banned INTEGER DEFAULT 0`);
    } catch (e: any) {
      // ignore
    }

    // Ensure last_song_upload_at exists on older User tables
    try {
      await getSql().unsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS last_song_upload_at TIMESTAMP`);
    } catch (e: any) {
      // ignore
    }

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Song (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT NOT NULL,
        bpm INTEGER NOT NULL,
        length TEXT NOT NULL,
        songUrl TEXT NOT NULL,
        coverUrl TEXT NOT NULL,
        ownerId INTEGER,
        isPublic INTEGER NOT NULL DEFAULT 1,
        genre TEXT,
        play_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS UserControls (
        user_id INTEGER PRIMARY KEY,
        lane_bindings_json TEXT NOT NULL DEFAULT '["d","f","j","k"]',
        note_speed REAL NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES "User"(id) ON DELETE CASCADE
      )
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Difficulty (
        id SERIAL PRIMARY KEY,
        song_id INTEGER NOT NULL,
        difficulty INTEGER NOT NULL,
        note_count INTEGER NOT NULL,
        CONSTRAINT fk_song FOREIGN KEY (song_id) REFERENCES Song(id)
      )
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Highscore (
        user_id INTEGER NOT NULL,
        difficulty_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        max_combo INTEGER NOT NULL,
        accuracy INTEGER NOT NULL,
        date TEXT NOT NULL,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES "User"(id),
        CONSTRAINT fk_difficulty FOREIGN KEY (difficulty_id) REFERENCES Difficulty(id)
      )
    `);

    await getSql().unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_highscore_user_difficulty ON Highscore(user_id, difficulty_id)
    `);

    await getSql().unsafe(`
      CREATE INDEX IF NOT EXISTS idx_highscore_leaderboard ON Highscore(difficulty_id, score DESC, accuracy DESC, max_combo DESC, date ASC)
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Note (
        id SERIAL PRIMARY KEY,
        difficulty_id INTEGER NOT NULL,
        time_ms INTEGER NOT NULL,
        lane INTEGER NOT NULL,
        type INTEGER NOT NULL,
        duration_ms INTEGER,
        CONSTRAINT fk_difficulty FOREIGN KEY (difficulty_id) REFERENCES Difficulty(id)
      )
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Friendship (
        id SERIAL PRIMARY KEY,
        requester_id INTEGER NOT NULL,
        addressee_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(requester_id, addressee_id),
        CONSTRAINT fk_requester FOREIGN KEY (requester_id) REFERENCES "User"(id),
        CONSTRAINT fk_addressee FOREIGN KEY (addressee_id) REFERENCES "User"(id)
      )
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Message (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_read INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT fk_sender FOREIGN KEY (sender_id) REFERENCES "User"(id),
        CONSTRAINT fk_receiver FOREIGN KEY (receiver_id) REFERENCES "User"(id)
      )
    `);

    await getSql().unsafe(`
      CREATE INDEX IF NOT EXISTS idx_message_conversation ON Message(sender_id, receiver_id, created_at)
    `);

    await getSql().unsafe(`
      CREATE INDEX IF NOT EXISTS idx_message_receiver ON Message(receiver_id, is_read)
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS UserAchievement (
        user_id INTEGER NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        progress INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, achievement_id),
        CONSTRAINT fk_user_achievement_user FOREIGN KEY (user_id) REFERENCES "User"(id) ON DELETE CASCADE
      )
    `);

    await getSql().unsafe(`
      CREATE INDEX IF NOT EXISTS idx_user_achievement_user ON UserAchievement(user_id)
    `);

    // Ensure updated_at exists on older UserAchievement tables
    try {
      await getSql().unsafe(`ALTER TABLE UserAchievement ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    } catch (e: any) {
      // ignore
    }

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Comment (
        id SERIAL PRIMARY KEY,
        song_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        parent_comment_id INTEGER,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_song_comment FOREIGN KEY (song_id) REFERENCES Song(id) ON DELETE CASCADE,
        CONSTRAINT fk_sender_comment FOREIGN KEY (sender_id) REFERENCES "User"(id),
        CONSTRAINT fk_parent_comment FOREIGN KEY (parent_comment_id) REFERENCES Comment(id)
      )
    `);

    await getSql().unsafe(`
      CREATE INDEX IF NOT EXISTS idx_comment_song ON Comment(song_id, created_at)
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS SongLike (
        id SERIAL PRIMARY KEY,
        song_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        UNIQUE(song_id, user_id),
        CONSTRAINT fk_song_like_song FOREIGN KEY (song_id) REFERENCES Song(id) ON DELETE CASCADE,
        CONSTRAINT fk_song_like_user FOREIGN KEY (user_id) REFERENCES "User"(id) ON DELETE CASCADE
      )
    `);

    await getSql().unsafe(`
      CREATE INDEX IF NOT EXISTS idx_song_like_song ON SongLike(song_id)
    `);

    await getSql().unsafe(`
      CREATE INDEX IF NOT EXISTS idx_song_like_user ON SongLike(user_id)
    `);

    // Remove duplicate highscores (keep best per user+difficulty)
    await getSql().unsafe(`
      DELETE FROM Highscore
      WHERE ctid NOT IN (
        SELECT MIN(ctid)
        FROM Highscore
        GROUP BY user_id, difficulty_id
      )
    `);
  }
}

export interface RunResult {
  changes: number;
}

export interface ITypedStatement<TResult = unknown, TParams = unknown> {
  readonly _params?: TParams;

  get(): Promise<TResult | undefined>;
  all(): Promise<TResult[]>;
  run(): Promise<RunResult>;
}
