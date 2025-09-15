import { sql } from 'bun';
import { BaseDatabaseConnection } from './base.js';
import type { DatabaseConfig, QueryResult } from '../../types/index.js';
import { DEFAULT_PORTS } from '../../core/constants/index.js';

export class PostgreSQLConnection extends BaseDatabaseConnection {
  private connection?: any;

  async connect(): Promise<void> {
    try {
      if (this.connection) {
        await this.disconnect();
      }

      // Build connection string or use provided one
      const connectionString = this.config.connectionString || this.buildConnectionString();

      // Use Bun.sql for PostgreSQL connections
      this.connection = sql({
        url: connectionString,
        max: 10, // Max pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test the connection
      await this.connection`SELECT 1 as test`;

      this.setConnected(true);
      console.log(`✓ PostgreSQL connection established: ${this.id}`);
    } catch (error) {
      this.logError('connect', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.end();
        this.connection = undefined;
      }
      this.setConnected(false);
    } catch (error) {
      this.logError('disconnect', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.connection) {
        return false;
      }

      await this.connection`SELECT 1 as test`;
      this.setConnected(true);
      return true;
    } catch (error) {
      this.logError('testConnection', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    if (!this.connection) {
      throw new Error(`PostgreSQL connection ${this.id} is not initialized`);
    }

    try {
      // Convert MySQL-style ? placeholders to PostgreSQL $1, $2, etc.
      const pgSql = this.convertPlaceholders(sql);

      let result;
      if (params.length > 0) {
        result = await this.connection.unsafe(pgSql, params);
      } else {
        result = await this.connection.unsafe(pgSql);
      }

      return {
        results: Array.isArray(result) ? result : [result],
        fields: this.extractFields(result),
        affectedRows: result.count || 0,
      };
    } catch (error) {
      this.logError('query', error);
      throw error;
    }
  }

  override async listDatabases(): Promise<string[]> {
    const result = await this.query(`
      SELECT datname
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY datname
    `);
    return result.results.map((row: any) => row.datname);
  }

  async listTables(database?: string): Promise<string[]> {
    const result = await this.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    return result.results.map((row: any) => row.tablename);
  }

  async getTableSchema(table: string, database?: string): Promise<any[]> {
    const result = await this.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table]);

    return result.results.map(row => ({
      Field: row.column_name,
      Type: this.mapPostgreSQLType(row),
      Null: row.is_nullable === 'YES' ? 'YES' : 'NO',
      Default: row.column_default,
      Key: '', // Would need additional query for constraints
      Extra: '',
    }));
  }

  override async ping(): Promise<boolean> {
    return this.testConnection();
  }

  override async getServerInfo(): Promise<any> {
    try {
      const result = await this.query('SELECT version() as version');
      const versionResult = result.results[0] as any;
      return {
        type: 'postgresql',
        version: versionResult?.version || 'unknown',
        host: this.config.host,
        port: this.config.port,
      };
    } catch (error) {
      return {
        type: 'postgresql',
        version: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildConnectionString(): string {
    const parts = [
      'postgresql://',
      this.config.user || 'postgres',
      ':',
      this.config.password || '',
      '@',
      this.config.host || 'localhost',
      ':',
      this.config.port || DEFAULT_PORTS.postgresql,
      '/',
      this.config.database || 'postgres'
    ];

    const connectionString = parts.join('');

    if (this.config.ssl) {
      return connectionString + '?sslmode=require';
    }

    return connectionString;
  }

  private convertPlaceholders(sql: string): string {
    let paramIndex = 1;
    return sql.replace(/\?/g, () => `$${paramIndex++}`);
  }

  private extractFields(result: any): any[] {
    if (!result || !Array.isArray(result) || result.length === 0) {
      return [];
    }

    const firstRow = result[0];
    if (typeof firstRow !== 'object') {
      return [];
    }

    return Object.keys(firstRow).map(key => ({
      name: key,
      type: typeof firstRow[key],
    }));
  }

  private mapPostgreSQLType(column: any): string {
    const type = column.data_type.toLowerCase();

    if (column.character_maximum_length) {
      return `${type}(${column.character_maximum_length})`;
    }

    if (column.numeric_precision && column.numeric_scale !== null) {
      return `${type}(${column.numeric_precision},${column.numeric_scale})`;
    }

    if (column.numeric_precision) {
      return `${type}(${column.numeric_precision})`;
    }

    return type;
  }
}