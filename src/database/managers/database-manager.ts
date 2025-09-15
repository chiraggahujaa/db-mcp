import type { DatabaseConnection, DatabaseConfig, ConnectionStatus, QueryResult, DatabaseManagerOptions } from '../../types/index.js';
import { DatabaseFactory } from '../factories/database-factory.js';
import { securityManager } from '../../core/security/security-manager.js';

export class DatabaseManager {
  private connections: Map<string, DatabaseConnection> = new Map();
  private currentDatabase: string;
  private options: Required<DatabaseManagerOptions>;

  constructor(options: DatabaseManagerOptions = {}) {
    this.options = {
      retryAttempts: options.retryAttempts ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      healthCheckInterval: options.healthCheckInterval ?? 300000, // 5 minutes
    };
    this.currentDatabase = '';
  }

  async initialize(configs: Record<string, DatabaseConfig>): Promise<void> {
    if (Object.keys(configs).length === 0) {
      throw new Error('No database configurations provided');
    }

    // Initialize all connections (with fault tolerance)
    const initPromises = Object.entries(configs).map(([id, config]) =>
      this.initializeConnection(id, config)
    );

    await Promise.allSettled(initPromises);

    // Set default database to first successfully connected one
    const connectedIds = Array.from(this.connections.entries())
      .filter(([, conn]) => conn.isConnected)
      .map(([id]) => id);

    if (connectedIds.length === 0) {
      console.error('⚠️ No database connections were successfully established');
      this.currentDatabase = ''; // Set to empty string when no connections
    } else {
      this.currentDatabase = connectedIds[0]!; // Use non-null assertion since we know array has items
      console.log(`✓ Database manager initialized with ${connectedIds.length} active connections`);
      console.log(`✓ Default database set to: ${this.currentDatabase}`);
    }

    // Start health check interval
    this.startHealthChecks();
  }

  private async initializeConnection(id: string, config: DatabaseConfig): Promise<void> {
    try {
      const connection = DatabaseFactory.createConnection(id, config);
      this.connections.set(id, connection);

      // Attempt to connect with retries
      await this.connectWithRetry(connection);

      securityManager.logEvent({
        event: 'connection_initialized',
        databaseId: id,
        severity: 'info',
        details: { type: config.type, host: config.host },
      });
    } catch (error) {
      console.error(`✗ Failed to initialize connection ${id}:`, error);
      securityManager.logEvent({
        event: 'connection_initialization_failed',
        databaseId: id,
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private async connectWithRetry(connection: DatabaseConnection): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        await connection.connect();
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Connection attempt ${attempt}/${this.options.retryAttempts} failed for ${connection.id}:`, lastError.message);

        if (attempt < this.options.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay * attempt));
        }
      }
    }

    throw lastError || new Error('Connection failed after all retry attempts');
  }

  private startHealthChecks(): void {
    if (this.options.healthCheckInterval > 0) {
      setInterval(() => {
        this.performHealthChecks().catch(error => {
          console.error('Health check error:', error);
        });
      }, this.options.healthCheckInterval);
    }
  }

  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.connections.values()).map(async connection => {
      try {
        const isHealthy = await connection.testConnection();
        if (!isHealthy && connection.isConnected) {
          console.warn(`⚠️ Health check failed for ${connection.id}, attempting reconnection...`);
          await this.reconnectDatabase(connection.id);
        }
      } catch (error) {
        console.error(`Health check error for ${connection.id}:`, error);
      }
    });

    await Promise.allSettled(healthPromises);
  }

  async reconnectDatabase(databaseId: string): Promise<boolean> {
    const connection = this.connections.get(databaseId);
    if (!connection) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

    try {
      await connection.disconnect();
      await this.connectWithRetry(connection);

      securityManager.logEvent({
        event: 'connection_reconnected',
        databaseId,
        severity: 'info',
      });

      return true;
    } catch (error) {
      console.error(`Failed to reconnect database ${databaseId}:`, error);

      securityManager.logEvent({
        event: 'connection_reconnect_failed',
        databaseId,
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) },
      });

      return false;
    }
  }

  getConnection(databaseId?: string): DatabaseConnection {
    const targetId = databaseId || this.currentDatabase;

    if (!targetId) {
      throw new Error('No database ID specified and no current database set');
    }

    const connection = this.connections.get(targetId);
    if (!connection) {
      throw new Error(`Database connection not found: ${targetId}`);
    }

    if (!connection.isConnected) {
      throw new Error(`Database connection is not active: ${targetId}`);
    }

    return connection;
  }

  getCurrentDatabase(): string {
    return this.currentDatabase;
  }

  switchDatabase(databaseId: string): void {
    const connection = this.connections.get(databaseId);
    if (!connection) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

    if (!connection.isConnected) {
      throw new Error(`Cannot switch to inactive database: ${databaseId}`);
    }

    this.currentDatabase = databaseId;

    securityManager.logEvent({
      event: 'database_switched',
      databaseId,
      severity: 'info',
    });
  }

  getDatabaseList(): string[] {
    return Array.from(this.connections.keys());
  }

  getConnectionStatus(databaseId?: string): ConnectionStatus[] {
    if (databaseId) {
      const connection = this.connections.get(databaseId);
      return connection ? [connection.getStatus()] : [];
    }

    return Array.from(this.connections.values()).map(conn => conn.getStatus());
  }

  async testConnection(databaseId: string): Promise<boolean> {
    const connection = this.connections.get(databaseId);
    if (!connection) {
      throw new Error(`Database connection not found: ${databaseId}`);
    }

    try {
      const result = await connection.testConnection();

      securityManager.logEvent({
        event: 'connection_test',
        databaseId,
        severity: 'info',
        details: { result: result ? 'success' : 'failed' },
      });

      return result;
    } catch (error) {
      securityManager.logEvent({
        event: 'connection_test_failed',
        databaseId,
        severity: 'warning',
        details: { error: error instanceof Error ? error.message : String(error) },
      });

      return false;
    }
  }

  async testAllConnections(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const testPromises = Array.from(this.connections.entries()).map(async ([id, connection]) => {
      try {
        results[id] = await connection.testConnection();
      } catch (error) {
        results[id] = false;
      }
    });

    await Promise.allSettled(testPromises);
    return results;
  }

  async query(sql: string, params?: any[], databaseId?: string): Promise<QueryResult> {
    const connection = this.getConnection(databaseId);
    const targetId = databaseId || this.currentDatabase;

    // Apply security checks (reusing existing security manager)
    const securityConfig = { // This would come from config manager
      maxQueryResults: 1000,
      allowDataModification: true,
      allowDrop: false,
      allowTruncate: false,
      readOnlyMode: false,
    };

    // Security validation
    const queryValidation = securityManager.validateQuery(sql, targetId);
    if (!queryValidation.isValid) {
      securityManager.logEvent({
        event: 'query_blocked',
        databaseId: targetId,
        query: sql.substring(0, 200),
        severity: 'warning',
        details: { reason: queryValidation.reason },
      });
      throw new Error(`Query blocked: ${queryValidation.reason}`);
    }

    // Rate limiting check
    if (!securityManager.checkRateLimit(targetId)) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.');
    }

    try {
      const startTime = Date.now();
      const result = await connection.query(sql, params);
      const duration = Date.now() - startTime;

      // Apply result limits
      if (result.results.length > securityConfig.maxQueryResults) {
        console.warn(`Results truncated from ${result.results.length} to ${securityConfig.maxQueryResults} rows`);
        result.results = result.results.slice(0, securityConfig.maxQueryResults);
      }

      securityManager.logEvent({
        event: 'query_executed',
        databaseId: targetId,
        query: sql.substring(0, 200),
        severity: 'info',
        details: { duration, rowCount: result.results.length, type: connection.type },
      });

      return result;
    } catch (error) {
      securityManager.logEvent({
        event: 'query_failed',
        databaseId: targetId,
        query: sql.substring(0, 200),
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error), type: connection.type },
      });

      throw error;
    }
  }

  async listDatabases(databaseId?: string): Promise<string[]> {
    const connection = this.getConnection(databaseId);

    if (!connection.listDatabases) {
      throw new Error(`listDatabases not supported for database type: ${connection.type}`);
    }

    return await connection.listDatabases();
  }

  async listTables(database?: string, databaseId?: string): Promise<string[]> {
    const connection = this.getConnection(databaseId);
    return await connection.listTables(database);
  }

  async getTableSchema(table: string, database?: string, databaseId?: string): Promise<any[]> {
    const connection = this.getConnection(databaseId);
    return await connection.getTableSchema(table, database);
  }

  async close(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(async connection => {
      try {
        await connection.disconnect();
      } catch (error) {
        console.error(`Error closing connection ${connection.id}:`, error);
      }
    });

    await Promise.allSettled(closePromises);
    this.connections.clear();
    this.currentDatabase = '';
  }
}