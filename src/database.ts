import mysql from 'mysql2/promise';
import { configManager, type DatabaseConfig } from './config.js';

export interface QueryResult {
  results: any[];
  fields?: mysql.FieldPacket[];
  affectedRows?: number;
  insertId?: number;
}

export class DatabaseManager {
  private pools: Map<string, mysql.Pool> = new Map();
  private currentDatabase: string;

  constructor() {
    this.currentDatabase = configManager.getDefaultDatabase();
    this.initializePools();
  }

  private initializePools(): void {
    const config = configManager.getConfig();

    for (const [databaseId, dbConfig] of Object.entries(config.databases)) {
      try {
        const pool = mysql.createPool({
          host: dbConfig.host,
          port: dbConfig.port,
          user: dbConfig.user,
          password: dbConfig.password,
          database: dbConfig.database,
          connectionLimit: dbConfig.connectionLimit,
          ssl: dbConfig.ssl ? {} : undefined,
          multipleStatements: false,
        });

        this.pools.set(databaseId, pool);
        console.error(`✓ Database pool initialized for: ${databaseId}`);
      } catch (error) {
        console.error(`✗ Failed to initialize pool for ${databaseId}:`, error);
      }
    }
  }

  async testConnection(databaseId: string): Promise<boolean> {
    try {
      const pool = this.getPool(databaseId);
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      return true;
    } catch (error) {
      console.error(`Connection test failed for ${databaseId}:`, error);
      return false;
    }
  }

  async testAllConnections(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const databaseId of configManager.getDatabaseList()) {
      results[databaseId] = await this.testConnection(databaseId);
    }

    return results;
  }

  private getPool(databaseId?: string): mysql.Pool {
    const dbId = databaseId || this.currentDatabase;
    configManager.validateDatabaseExists(dbId);

    const pool = this.pools.get(dbId);
    if (!pool) {
      throw new Error(`Database pool not initialized for: ${dbId}`);
    }

    return pool;
  }

  getCurrentDatabase(): string {
    return this.currentDatabase;
  }

  switchDatabase(databaseId: string): void {
    configManager.validateDatabaseExists(databaseId);
    this.currentDatabase = databaseId;
  }

  async query(sql: string, params?: any[], databaseId?: string): Promise<QueryResult> {
    const pool = this.getPool(databaseId);
    const securityConfig = configManager.getSecurityConfig();

    if (securityConfig.readOnlyMode && this.isModifyingQuery(sql)) {
      throw new Error('Data modification queries are not allowed in read-only mode');
    }

    if (!securityConfig.allowDataModification && this.isModifyingQuery(sql)) {
      throw new Error('Data modification queries are disabled');
    }

    if (!securityConfig.allowDrop && this.isDropQuery(sql)) {
      throw new Error('DROP statements are not allowed');
    }

    if (!securityConfig.allowTruncate && this.isTruncateQuery(sql)) {
      throw new Error('TRUNCATE statements are not allowed');
    }

    try {
      const startTime = Date.now();
      const [results, fields] = await pool.execute(sql, params || []);
      const duration = Date.now() - startTime;

      console.error(`Query executed in ${duration}ms on ${databaseId || this.currentDatabase}`);

      if (Array.isArray(results)) {
        const limitedResults = this.limitResults(results, securityConfig.maxQueryResults);
        return { results: limitedResults, fields };
      } else {
        return {
          results: [],
          fields,
          affectedRows: (results as any).affectedRows,
          insertId: (results as any).insertId,
        };
      }
    } catch (error) {
      console.error(`Query failed on ${databaseId || this.currentDatabase}:`, error);
      throw error;
    }
  }

  private limitResults(results: any[], maxResults: number): any[] {
    if (results.length > maxResults) {
      console.error(`Results truncated from ${results.length} to ${maxResults} rows`);
      return results.slice(0, maxResults);
    }
    return results;
  }

  private isModifyingQuery(sql: string): boolean {
    const upperSql = sql.trim().toUpperCase();
    return /^(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\s/i.test(upperSql);
  }

  private isDropQuery(sql: string): boolean {
    return /^DROP\s/i.test(sql.trim());
  }

  private isTruncateQuery(sql: string): boolean {
    return /^TRUNCATE\s/i.test(sql.trim());
  }

  async getDatabases(databaseId?: string): Promise<string[]> {
    const result = await this.query('SHOW DATABASES', [], databaseId);
    return result.results.map((row: any) => Object.values(row)[0] as string);
  }

  async getTables(database?: string, databaseId?: string): Promise<string[]> {
    let sql = 'SHOW TABLES';
    if (database) {
      sql += ` FROM \`${database}\``;
    }

    const result = await this.query(sql, [], databaseId);
    return result.results.map((row: any) => Object.values(row)[0] as string);
  }

  async getTableSchema(table: string, database?: string, databaseId?: string): Promise<any[]> {
    let sql = `DESCRIBE \`${table}\``;
    if (database) {
      sql = `DESCRIBE \`${database}\`.\`${table}\``;
    }

    const result = await this.query(sql, [], databaseId);
    return result.results;
  }

  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.pools.values()).map(pool => pool.end())
    );
    this.pools.clear();
  }
}

export const databaseManager = new DatabaseManager();