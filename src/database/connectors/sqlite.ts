import { Database } from 'bun:sqlite';
import { BaseDatabaseConnection } from './base.js';
import type { DatabaseConfig, QueryResult } from '../../types/index.js';
import { SQLITE_DEFAULTS } from '../../core/constants/index.js';

export class SQLiteConnection extends BaseDatabaseConnection {
  private db?: Database;

  async connect(): Promise<void> {
    try {
      if (this.db) {
        await this.disconnect();
      }

      const filename = this.config.file || this.config.database || ':memory:';

      this.db = new Database(filename, {
        create: SQLITE_DEFAULTS.create,
        readwrite: SQLITE_DEFAULTS.readwrite,
      });

      // Test the connection
      this.db.query('SELECT 1').get();

      this.setConnected(true);
      console.log(`✓ SQLite connection established: ${this.id} (${filename})`);
    } catch (error) {
      this.logError('connect', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.db) {
        this.db.close();
        this.db = undefined;
      }
      this.setConnected(false);
    } catch (error) {
      this.logError('disconnect', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.db) {
        return false;
      }

      this.db.query('SELECT 1').get();
      this.setConnected(true);
      return true;
    } catch (error) {
      this.logError('testConnection', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    if (!this.db) {
      throw new Error(`SQLite connection ${this.id} is not initialized`);
    }

    try {
      const stmt = this.db.query(sql);

      if (sql.trim().toLowerCase().startsWith('select') || sql.trim().toLowerCase().startsWith('pragma')) {
        const results = stmt.all(...params);
        return {
          results: Array.isArray(results) ? results : [results],
          fields: this.extractFields(results),
        };
      } else {
        const result = stmt.run(...params);
        return {
          results: [],
          affectedRows: result.changes,
          insertId: Number(result.lastInsertRowid), // Convert bigint to number
        };
      }
    } catch (error) {
      this.logError('query', error);
      throw error;
    }
  }

  async listTables(database?: string): Promise<string[]> {
    const result = await this.query(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    return result.results.map((row: any) => row.name);
  }

  async getTableSchema(table: string, database?: string): Promise<any[]> {
    const result = await this.query(`PRAGMA table_info(${table})`);

    return result.results.map((row: any) => ({
      Field: row.name,
      Type: row.type,
      Null: row.notnull ? 'NO' : 'YES',
      Default: row.dflt_value,
      Key: row.pk ? 'PRI' : '',
      Extra: row.pk ? 'PRIMARY KEY' : '',
    }));
  }

  override async ping(): Promise<boolean> {
    return this.testConnection();
  }

  override async getServerInfo(): Promise<any> {
    try {
      const result = await this.query('SELECT sqlite_version() as version');
      const versionResult = result.results[0] as any;
      return {
        type: 'sqlite',
        version: versionResult?.version || 'unknown',
        filename: this.config.file || this.config.database || ':memory:',
      };
    } catch (error) {
      return {
        type: 'sqlite',
        version: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // SQLite-specific methods
  async vacuum(): Promise<void> {
    await this.query('VACUUM');
  }

  async analyze(): Promise<void> {
    await this.query('ANALYZE');
  }

  async getTableInfo(table: string): Promise<any[]> {
    const result = await this.query(`PRAGMA table_info(${table})`);
    return result.results;
  }

  async getForeignKeys(table: string): Promise<any[]> {
    const result = await this.query(`PRAGMA foreign_key_list(${table})`);
    return result.results;
  }

  async getIndexes(table: string): Promise<any[]> {
    const result = await this.query(`PRAGMA index_list(${table})`);
    return result.results;
  }

  private extractFields(results: any): any[] {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return [];
    }

    const firstRow = results[0];
    if (typeof firstRow !== 'object') {
      return [];
    }

    return Object.keys(firstRow).map(key => ({
      name: key,
      type: typeof firstRow[key],
    }));
  }
}