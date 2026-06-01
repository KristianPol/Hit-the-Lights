import BetterSqlite3, { Database } from "better-sqlite3";

const dbFileName = "htl.db";

export class Unit {
  private readonly db: Database;
  private completed: boolean;

  public constructor(public readonly readOnly: boolean) {
    this.completed = false;
    this.db = DB.createDBConnection();

    // Begin a transaction if this is not a read-only unit
    if (!readOnly) {
      DB.beginTransaction(this.db);
    }
  }

  public prepare<
    TResult,
    TParams extends Record<string, unknown> = Record<string, unknown>
  >(sql: string, bindings?: TParams): ITypedStatement<TResult, TParams> {
    const stmt = this.db.prepare<unknown[], TResult>(sql);

    if (bindings != null) {
      stmt.bind(bindings as unknown);
    }

    return stmt as unknown as ITypedStatement<TResult, TParams>;
  }

  public getLastRowId(): number {
    const stmt = this.prepare<{ id: number }>(
      `SELECT last_insert_rowid() AS "id"`
    );

    const result = stmt.get();

    if (!result) {
      throw new Error("Unable to retrieve last inserted row id");
    }

    return result.id;
  }

  public complete(commit: boolean | null = null): void {
    if (this.completed) {
      return;
    }

    this.completed = true;

    if (commit !== null) {
      commit
        ? DB.commitTransaction(this.db)
        : DB.rollbackTransaction(this.db);
    } else if (!this.readOnly) {
      throw new Error(
        "Transaction has been opened, requires information if commit or rollback is needed"
      );
    }

    this.db.close();
  }
}

class DB {
  public static createDBConnection(): Database {
    const db = new BetterSqlite3(dbFileName, {
      fileMustExist: false,
      verbose: (s: unknown) => DB.logStatement(s),
    });

    db.pragma("foreign_keys = ON");

    DB.ensureTablesCreated(db);

    return db;
  }

  public static beginTransaction(connection: Database): void {
    connection.exec("BEGIN TRANSACTION;");
  }

  public static commitTransaction(connection: Database): void {
    connection.exec("COMMIT;");
  }

  public static rollbackTransaction(connection: Database): void {
    connection.exec("ROLLBACK;");
  }

  private static logStatement(statement: string | unknown): void {
    if (typeof statement !== "string") {
      return;
    }

    const start = statement.slice(0, 6).trim().toLowerCase();

    if (start.startsWith("pragma") || start.startsWith("create")) {
      return;
    }

    console.log(`SQL: ${statement}`);
  }

  private static ensureTablesCreated(connection: Database): void {

    connection.exec(`
           CREATE TABLE IF NOT EXISTS Song (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL,
             author TEXT NOT NULL,
             bpm INTEGER NOT NULL,
             length TEXT NOT NULL,
             songUrl TEXT NOT NULL,
              coverUrl TEXT NOT NULL,
              ownerId INTEGER,
              isPublic INTEGER NOT NULL DEFAULT 1
             ) STRICT
           `);

    const songColumns = connection.prepare("PRAGMA table_info(Song)").all() as Array<{ name: string }>;
    const columnNames = new Set(songColumns.map(column => column.name));

    if (!columnNames.has('ownerId')) {
      connection.exec('ALTER TABLE Song ADD COLUMN ownerId INTEGER');
    }

    if (!columnNames.has('isPublic')) {
      connection.exec('ALTER TABLE Song ADD COLUMN isPublic INTEGER NOT NULL DEFAULT 1');
      connection.exec('UPDATE Song SET isPublic = 1 WHERE isPublic IS NULL');
    }


    connection.exec(`
            CREATE TABLE IF NOT EXISTS User (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                profilePicture BLOB,
                joinDate TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                CONSTRAINT uq_username UNIQUE (username)
            ) STRICT
        `);

    const userColumns = connection.prepare("PRAGMA table_info(User)").all() as Array<{ name: string }>;
    const userColumnNames = new Set(userColumns.map(column => column.name));

    if (!userColumnNames.has('joinDate')) {
      // SQLite only allows constant defaults in ALTER TABLE ADD COLUMN.
      connection.exec('ALTER TABLE User ADD COLUMN joinDate TEXT');
    }

    // Ensure playtime_seconds column exists (constant default allowed)
    if (!userColumnNames.has('playtime_seconds')) {
      connection.exec('ALTER TABLE User ADD COLUMN playtime_seconds INTEGER NOT NULL DEFAULT 0');
    }

    // Add settings_json column to store per-user preferences as JSON text
    if (!userColumnNames.has('settings_json')) {
      connection.exec('ALTER TABLE User ADD COLUMN settings_json TEXT');
    }

    // Add analytics / cumulative counters for gameplay runs
    if (!userColumnNames.has('perfect_total')) {
      connection.exec('ALTER TABLE User ADD COLUMN perfect_total INTEGER NOT NULL DEFAULT 0');
    }
    if (!userColumnNames.has('good_total')) {
      connection.exec('ALTER TABLE User ADD COLUMN good_total INTEGER NOT NULL DEFAULT 0');
    }
    if (!userColumnNames.has('glimmer_total')) {
      connection.exec('ALTER TABLE User ADD COLUMN glimmer_total INTEGER NOT NULL DEFAULT 0');
    }
    if (!userColumnNames.has('miss_total')) {
      connection.exec('ALTER TABLE User ADD COLUMN miss_total INTEGER NOT NULL DEFAULT 0');
    }
    if (!userColumnNames.has('total_score')) {
      connection.exec('ALTER TABLE User ADD COLUMN total_score INTEGER NOT NULL DEFAULT 0');
    }
    if (!userColumnNames.has('total_accuracy')) {
      connection.exec('ALTER TABLE User ADD COLUMN total_accuracy REAL NOT NULL DEFAULT 0');
    }
    if (!userColumnNames.has('runs_count')) {
      connection.exec('ALTER TABLE User ADD COLUMN runs_count INTEGER NOT NULL DEFAULT 0');
    }

    connection.exec("UPDATE User SET joinDate = CURRENT_TIMESTAMP WHERE joinDate IS NULL OR TRIM(joinDate) = ''");

    connection.exec(`
              CREATE TABLE IF NOT EXISTS UserControls (
                user_id INTEGER PRIMARY KEY,
                lane_bindings_json TEXT NOT NULL DEFAULT '["d","f","j","k"]',
                note_speed REAL NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
                ) STRICT
          `);

    DB.migrateLegacyUserControls(connection);

    // Ensure any NULL analytics columns are zeroed for legacy users
    connection.exec('UPDATE User SET perfect_total = 0 WHERE perfect_total IS NULL');
    connection.exec('UPDATE User SET good_total = 0 WHERE good_total IS NULL');
    connection.exec('UPDATE User SET glimmer_total = 0 WHERE glimmer_total IS NULL');
    connection.exec('UPDATE User SET miss_total = 0 WHERE miss_total IS NULL');
    connection.exec('UPDATE User SET total_score = 0 WHERE total_score IS NULL');
    connection.exec('UPDATE User SET total_accuracy = 0 WHERE total_accuracy IS NULL');
    connection.exec('UPDATE User SET runs_count = 0 WHERE runs_count IS NULL');

     connection.exec(`
              CREATE TABLE IF NOT EXISTS Difficulty (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id INTEGER NOT NULL,
                difficulty INTEGER NOT NULL,
                note_count INTEGER NOT NULL,
                CONSTRAINT fk_song FOREIGN KEY (song_id) REFERENCES Song(id)
               ) STRICT
         `);

     connection.exec(`
             CREATE TABLE IF NOT EXISTS Highscore (
               user_id INTEGER NOT NULL,
               difficulty_id INTEGER NOT NULL,
               score INTEGER NOT NULL,
               max_combo INTEGER NOT NULL,
               accuracy INTEGER NOT NULL,
               date TEXT NOT NULL,
               CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES User(id),
               CONSTRAINT fk_difficulty FOREIGN KEY (difficulty_id) REFERENCES Difficulty(id)
               ) STRICT
         `);

     connection.exec(`
       WITH ranked AS (
         SELECT rowid,
                ROW_NUMBER() OVER (
                  PARTITION BY user_id, difficulty_id
                  ORDER BY score DESC, accuracy DESC, max_combo DESC, date ASC, rowid ASC
                ) AS rn
         FROM Highscore
       )
       DELETE FROM Highscore
       WHERE rowid IN (SELECT rowid FROM ranked WHERE rn > 1);
     `);

     connection.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_highscore_user_difficulty ON Highscore(user_id, difficulty_id)');
     connection.exec('CREATE INDEX IF NOT EXISTS idx_highscore_leaderboard ON Highscore(difficulty_id, score DESC, accuracy DESC, max_combo DESC, date ASC)');

     connection.exec(`
             CREATE TABLE IF NOT EXISTS Note (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               difficulty_id INTEGER NOT NULL,
               time_ms INTEGER NOT NULL,
               lane INTEGER NOT NULL,
               type INTEGER NOT NULL,
               duration_ms INTEGER,
               CONSTRAINT fk_difficulty FOREIGN KEY (difficulty_id) REFERENCES Difficulty(id)
               ) STRICT
         `);

     connection.exec(`
             CREATE TABLE IF NOT EXISTS Friendship (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               requester_id INTEGER NOT NULL,
               addressee_id INTEGER NOT NULL,
               status TEXT NOT NULL DEFAULT 'pending',
               created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
               UNIQUE(requester_id, addressee_id),
               CONSTRAINT fk_requester FOREIGN KEY (requester_id) REFERENCES User(id),
               CONSTRAINT fk_addressee FOREIGN KEY (addressee_id) REFERENCES User(id)
               ) STRICT
         `);

     connection.exec(`
             CREATE TABLE IF NOT EXISTS Message (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               sender_id INTEGER NOT NULL,
               receiver_id INTEGER NOT NULL,
               content TEXT NOT NULL,
               created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
               is_read INTEGER NOT NULL DEFAULT 0,
               CONSTRAINT fk_sender FOREIGN KEY (sender_id) REFERENCES User(id),
               CONSTRAINT fk_receiver FOREIGN KEY (receiver_id) REFERENCES User(id)
               ) STRICT
         `);

     connection.exec('CREATE INDEX IF NOT EXISTS idx_message_conversation ON Message(sender_id, receiver_id, created_at)');
     connection.exec('CREATE INDEX IF NOT EXISTS idx_message_receiver ON Message(receiver_id, is_read)');

      connection.exec(`
              CREATE TABLE IF NOT EXISTS UserAchievement (
                user_id INTEGER NOT NULL,
                achievement_id TEXT NOT NULL,
                unlocked INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0,
                progress INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, achievement_id),
                CONSTRAINT fk_user_achievement_user FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
                ) STRICT
          `);

      connection.exec('CREATE INDEX IF NOT EXISTS idx_user_achievement_user ON UserAchievement(user_id)');

      // Comments table: per-song comments with optional parent comment for replies
      connection.exec(`
              CREATE TABLE IF NOT EXISTS Comment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id INTEGER NOT NULL,
                sender_id INTEGER NOT NULL,
                parent_comment_id INTEGER,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_song_comment FOREIGN KEY (song_id) REFERENCES Song(id) ON DELETE CASCADE,
                CONSTRAINT fk_sender_comment FOREIGN KEY (sender_id) REFERENCES User(id),
                CONSTRAINT fk_parent_comment FOREIGN KEY (parent_comment_id) REFERENCES Comment(id)
                ) STRICT
          `);

      connection.exec('CREATE INDEX IF NOT EXISTS idx_comment_song ON Comment(song_id, created_at)');
  }

  private static migrateLegacyUserControls(connection: Database): void {
    const userColumns = connection.prepare("PRAGMA table_info(User)").all() as Array<{ name: string }>;
    const userColumnNames = new Set(userColumns.map(column => column.name));

    const defaultLaneBindings = ['d', 'f', 'j', 'k'];
    const defaultControlsJson = JSON.stringify({ laneBindings: defaultLaneBindings, noteSpeed: 1 });

    const normalizeControls = (value: unknown): { laneBindings: [string, string, string, string]; noteSpeed: number } => {
      const fallback: [string, string, string, string] = ['d', 'f', 'j', 'k'];
      const candidate = value && typeof value === 'object' ? value as { laneBindings?: unknown; noteSpeed?: unknown; lane_bindings?: unknown; note_speed?: unknown } : null;
      const source = Array.isArray(candidate?.laneBindings)
        ? candidate?.laneBindings
        : Array.isArray(candidate?.lane_bindings)
          ? candidate?.lane_bindings
          : fallback;

      const laneBindings = fallback.map((defaultBinding, index) => {
        const raw = source?.[index];
        const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : defaultBinding;
        return normalized || defaultBinding;
      }) as [string, string, string, string];

      const numericSpeed = Number(candidate?.noteSpeed ?? candidate?.note_speed ?? 1);
      const noteSpeed = Number.isFinite(numericSpeed) ? Math.min(2.5, Math.max(0.5, Number(numericSpeed.toFixed(2)))) : 1;

      return { laneBindings, noteSpeed };
    };

    if (userColumnNames.has('settings_json')) {
      const legacyRows = connection.prepare(
        `SELECT id, settings_json FROM User WHERE settings_json IS NOT NULL AND TRIM(settings_json) <> ''`
      ).all() as Array<{ id: number; settings_json: string | null }>;

      const upsertStmt = connection.prepare(
        `INSERT INTO UserControls (user_id, lane_bindings_json, note_speed, created_at, updated_at)
         VALUES ($userId, $laneBindingsJson, $noteSpeed, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           lane_bindings_json = excluded.lane_bindings_json,
           note_speed = excluded.note_speed,
           updated_at = CURRENT_TIMESTAMP`
      ) as any;

      for (const row of legacyRows) {
        let parsed: unknown = null;
        try {
          parsed = row.settings_json ? JSON.parse(row.settings_json) : null;
        } catch {
          parsed = null;
        }

        const normalized = normalizeControls(parsed);
        upsertStmt.run({
          userId: row.id,
          laneBindingsJson: JSON.stringify({ laneBindings: normalized.laneBindings, noteSpeed: normalized.noteSpeed }),
          noteSpeed: normalized.noteSpeed
        });
      }
    }

    const missingUsers = connection.prepare(
      `SELECT id FROM User WHERE id NOT IN (SELECT user_id FROM UserControls)`
    ).all() as Array<{ id: number }>;

    const insertDefaultStmt = connection.prepare(
      `INSERT INTO UserControls (user_id, lane_bindings_json, note_speed, created_at, updated_at)
       VALUES ($userId, $laneBindingsJson, $noteSpeed, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ) as any;

    for (const row of missingUsers) {
      insertDefaultStmt.run({
        userId: row.id,
        laneBindingsJson: defaultControlsJson,
        noteSpeed: 1
      });
    }
  }
}

type RawStatement<TResult> = BetterSqlite3.Statement<unknown[], TResult>;
type RunResult = ReturnType<RawStatement<unknown>["run"]>;

export interface ITypedStatement<TResult = unknown, TParams = unknown> {
  readonly _params?: TParams;

  get(): TResult | undefined;
  all(): TResult[];
  run(): RunResult;
}
