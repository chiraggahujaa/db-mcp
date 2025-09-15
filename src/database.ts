import mysql from 'mysql2/promise';
import { configManager, type DatabaseConfig } from './config.js';
import { securityManager } from './security.js';

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
          // acquireTimeout and timeout are not valid for mysql2 pools
          idleTimeout: dbConfig.idleTimeout,
          queueLimit: dbConfig.queueLimit,
          maxIdle: dbConfig.maxIdle,
          enableKeepAlive: dbConfig.enableKeepAlive,
          keepAliveInitialDelay: dbConfig.keepAliveInitialDelay,
          ssl: dbConfig.ssl ? {} : undefined,
          charset: dbConfig.charset,
          timezone: dbConfig.timezone,
          debug: dbConfig.debug,
          multipleStatements: dbConfig.multipleStatements,
        });

        this.pools.set(databaseId, pool);
        console.error(`✓ Database pool initialized for: ${databaseId}`);
        securityManager.logEvent({
          event: 'pool_initialized',
          databaseId,
          severity: 'info',
          details: { host: dbConfig.host, port: dbConfig.port },
        });
      } catch (error) {
        console.error(`✗ Failed to initialize pool for ${databaseId}:`, error);
        securityManager.logEvent({
          event: 'pool_initialization_failed',
          databaseId,
          severity: 'error',
          details: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
  }

  async testConnection(databaseId: string): Promise<boolean> {
    try {
      const pool = this.getPool(databaseId);
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();

      securityManager.logEvent({
        event: 'connection_success',
        databaseId,
        severity: 'info',
      });

      return true;
    } catch (error) {
      console.error(`Connection test failed for ${databaseId}:`, error);

      securityManager.logEvent({
        event: 'connection_failed',
        databaseId,
        severity: 'warning',
        details: { error: error instanceof Error ? error.message : String(error) },
      });

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
    const targetDb = databaseId || this.currentDatabase;
    const pool = this.getPool(targetDb);
    const securityConfig = configManager.getSecurityConfig();

    // Security validation
    const queryValidation = securityManager.validateQuery(sql, targetDb);
    if (!queryValidation.isValid) {
      securityManager.logEvent({
        event: 'query_blocked',
        databaseId: targetDb,
        query: sql.substring(0, 200),
        severity: 'warning',
        details: { reason: queryValidation.reason },
      });
      throw new Error(`Query blocked: ${queryValidation.reason}`);
    }

    // Rate limiting check
    if (!securityManager.checkRateLimit(targetDb)) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.');
    }

    if (securityConfig.readOnlyMode && this.isModifyingQuery(sql)) {
      securityManager.logEvent({
        event: 'readonly_violation_attempt',
        databaseId: targetDb,
        query: sql.substring(0, 200),
        severity: 'warning',
      });
      throw new Error('Data modification queries are not allowed in read-only mode');
    }

    if (!securityConfig.allowDataModification && this.isModifyingQuery(sql)) {
      securityManager.logEvent({
        event: 'modification_blocked',
        databaseId: targetDb,
        query: sql.substring(0, 200),
        severity: 'info',
      });
      throw new Error('Data modification queries are disabled');
    }

    if (!securityConfig.allowDrop && this.isDropQuery(sql)) {
      securityManager.logEvent({
        event: 'drop_blocked',
        databaseId: targetDb,
        query: sql.substring(0, 200),
        severity: 'warning',
      });
      throw new Error('DROP statements are not allowed');
    }

    if (!securityConfig.allowTruncate && this.isTruncateQuery(sql)) {
      securityManager.logEvent({
        event: 'truncate_blocked',
        databaseId: targetDb,
        query: sql.substring(0, 200),
        severity: 'warning',
      });
      throw new Error('TRUNCATE statements are not allowed');
    }

    try {
      const startTime = Date.now();
      const [results, fields] = await pool.execute(sql, params || []);
      const duration = Date.now() - startTime;

      console.error(`Query executed in ${duration}ms on ${targetDb}`);

      securityManager.logEvent({
        event: 'query_executed',
        databaseId: targetDb,
        query: sql.substring(0, 200),
        severity: 'info',
        details: { duration, rowCount: Array.isArray(results) ? results.length : 0 },
      });

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
      console.error(`Query failed on ${targetDb}:`, error);

      securityManager.logEvent({
        event: 'query_failed',
        databaseId: targetDb,
        query: sql.substring(0, 200),
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) },
      });

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