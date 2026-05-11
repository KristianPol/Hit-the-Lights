/**
 * Postgres Database Accessor
 * Provides async methods for querying the Postgres database when DATABASE_URL is set.
 * This is used as an alternative to the synchronous SQLite Unit class.
 */

const getSql = require('../../db');

export class PostgresDB {
  /**
   * Execute a SELECT query and return all rows.
   * @param query SQL query with $1, $2, etc. for parameters
   * @param params Array of parameter values
   */
  static async query<T>(query: string, params: any[] = []): Promise<T[]> {
    try {
      const sql = await getSql();
      const result = await sql.unsafe(query, params);
      return result as T[];
    } catch (err) {
      console.error('Postgres query error:', err);
      throw err;
    }
  }

  /**
   * Execute a SELECT query and return a single row or undefined.
   */
  static async queryOne<T>(query: string, params: any[] = []): Promise<T | undefined> {
    try {
      const sql = await getSql();
      const result = await sql.unsafe(query, params);
      return result?.[0] as T | undefined;
    } catch (err) {
      console.error('Postgres queryOne error:', err);
      throw err;
    }
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE query.
   */
  static async execute(query: string, params: any[] = []): Promise<{ rowCount: number }> {
    try {
      const sql = await getSql();
      const result = await sql.unsafe(query, params);
      return { rowCount: result?.length || 0 };
    } catch (err) {
      console.error('Postgres execute error:', err);
      throw err;
    }
  }

  /**
   * Execute an INSERT with RETURNING id.
   */
  static async insertReturning<T extends { id: number }>(query: string, params: any[] = []): Promise<T | undefined> {
    try {
      const sql = await getSql();
      const result = await sql.unsafe(query, params);
      return result?.[0] as T | undefined;
    } catch (err) {
      console.error('Postgres insertReturning error:', err);
      throw err;
    }
  }
}

