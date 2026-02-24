import BetterSqlite3, { Database } from "better-sqlite3";

const dbFileName = "htl.db";

export class Unit {
  private readonly db: Database;
  private completed: boolean;

  public constructor(public readonly readOnly: boolean) {
    this.completed = false;
    this.db = DB.createDBConnection();

    if (!this.readOnly) {
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
            CREATE TABLE IF NOT EXISTS User (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                password TEXT NULL,
                CONSTRAINT uq_username UNIQUE (username)
            ) STRICT
        `);
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
