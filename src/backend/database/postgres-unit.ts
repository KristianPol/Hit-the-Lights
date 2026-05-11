/**
 * Postgres-based Unit class for async database operations.
 * Mimics the SQLite Unit interface but uses async/await with the postgres client.
 */
import sql from '../db';

export class PostgresUnit {
  private completed: boolean = false;

  constructor(public readonly readOnly: boolean) {
    // Postgres client is shared globally; no need to open/close per request.
    // Transactions can be managed per-request if needed.
  }

  /**
   * Execute a raw query. For Postgres, we return a helper to execute the query.
   * Usage: await this.query<ResultType>(sql`SELECT * FROM table WHERE id = ${id}`);
   */
  public async query<TResult>(
    sqlQuery: ReturnType<typeof sql>
  ): Promise<TResult[]> {
    try {
      const result = await sqlQuery;
      return result as TResult[];
    } catch (err) {
      console.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Execute a query and return a single row or undefined.
   */
  public async queryOne<TResult>(
    sqlQuery: ReturnType<typeof sql>
  ): Promise<TResult | undefined> {
    try {
      const results = await sqlQuery;
      return results?.[0] as TResult | undefined;
    } catch (err) {
      console.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Execute an insert/update/delete and return the result info.
   */
  public async execute(
    sqlQuery: ReturnType<typeof sql>
  ): Promise<{ rowCount?: number }> {
    try {
      const result = await sqlQuery;
      return { rowCount: result?.length || 0 };
    } catch (err) {
      console.error('Database execute error:', err);
      throw err;
    }
  }

  /**
   * Get last inserted ID. For Postgres with SERIAL, use RETURNING id or lastval().
   * This is typically handled per-insert; not a generic method.
   */
  public async getLastRowId(): Promise<number> {
    // Note: this is a fallback; prefer using RETURNING clause in INSERT statements.
    throw new Error('Use RETURNING clause in INSERT for Postgres');
  }

  /**
   * Commit or rollback (placeholder for transaction handling).
   * Postgres unit is stateless; transactions should be managed at the query level if needed.
   */
  public complete(commit?: boolean | null): void {
    if (this.completed) {
      return;
    }
    this.completed = true;
    // No-op for shared Postgres connection.
  }
}

