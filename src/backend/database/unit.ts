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
      connect_timeout: 10,
      ssl: { rejectUnauthorized: false },
    });
  }
  return sqlInstance;
}

export { getSql as sql };

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
        return (rows[0] as unknown as TResult) ?? undefined;
      },
      all: async (): Promise<TResult[]> => {
        const conn = await this.ensureConnection();
        const rows = await conn.unsafe(quotedSql, args as any[]);
        return rows as unknown as TResult[];
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
      args.push(bindings[name]);
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

  private static async migrateColumnNames(): Promise<void> {
    const migrations = [
      // Song table: rename lowercased columns back to quoted camelCase
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'song' AND column_name = 'songurl') THEN ALTER TABLE Song RENAME COLUMN songurl TO "songUrl"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'song' AND column_name = 'coverurl') THEN ALTER TABLE Song RENAME COLUMN coverurl TO "coverUrl"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'song' AND column_name = 'ownerid') THEN ALTER TABLE Song RENAME COLUMN ownerid TO "ownerId"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'song' AND column_name = 'ispublic') THEN ALTER TABLE Song RENAME COLUMN ispublic TO "isPublic"; END IF; END $$;`,
      // User table
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'profilepicture') THEN ALTER TABLE "User" RENAME COLUMN profilepicture TO "profilePicture"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'joindate') THEN ALTER TABLE "User" RENAME COLUMN joindate TO "joinDate"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'perfecttotal') THEN ALTER TABLE "User" RENAME COLUMN perfecttotal TO "perfectTotal"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'goodtotal') THEN ALTER TABLE "User" RENAME COLUMN goodtotal TO "goodTotal"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'glimmertotal') THEN ALTER TABLE "User" RENAME COLUMN glimmertotal TO "glimmerTotal"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'misstotal') THEN ALTER TABLE "User" RENAME COLUMN misstotal TO "missTotal"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'totalscore') THEN ALTER TABLE "User" RENAME COLUMN totalscore TO "totalScore"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'totalaccuracy') THEN ALTER TABLE "User" RENAME COLUMN totalaccuracy TO "totalAccuracy"; END IF; END $$;`,
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'runscount') THEN ALTER TABLE "User" RENAME COLUMN runscount TO "runsCount"; END IF; END $$;`,
    ];
    for (const sql of migrations) {
      try {
        await getSql().unsafe(sql);
      } catch (err: any) {
        console.warn('Migration warning (may be already applied):', err.message);
      }
    }
  }

  public static async ensureTablesCreated(): Promise<void> {
    // Fix existing tables that were created with lowercased column names
    await Unit.migrateColumnNames();

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        "profilePicture" BYTEA,
        "joinDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        playtime_seconds INTEGER NOT NULL DEFAULT 0,
        settings_json TEXT,
        "perfectTotal" INTEGER NOT NULL DEFAULT 0,
        "goodTotal" INTEGER NOT NULL DEFAULT 0,
        "glimmerTotal" INTEGER NOT NULL DEFAULT 0,
        "missTotal" INTEGER NOT NULL DEFAULT 0,
        "totalScore" INTEGER NOT NULL DEFAULT 0,
        "totalAccuracy" REAL NOT NULL DEFAULT 0,
        "runsCount" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT uq_username UNIQUE (username)
      )
    `);

    await getSql().unsafe(`
      CREATE TABLE IF NOT EXISTS Song (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT NOT NULL,
        bpm INTEGER NOT NULL,
        length TEXT NOT NULL,
        "songUrl" TEXT NOT NULL,
        "coverUrl" TEXT NOT NULL,
        "ownerId" INTEGER,
        "isPublic" INTEGER NOT NULL DEFAULT 1,
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
