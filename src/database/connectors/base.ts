import type { DatabaseConnection, DatabaseConfig, ConnectionStatus, DatabaseType } from '../../types/index.js';

export abstract class BaseDatabaseConnection implements DatabaseConnection {
  public readonly id: string;
  public readonly type: DatabaseType;
  public readonly config: DatabaseConfig;

  protected _isConnected: boolean = false;
  protected _lastError?: string;
  protected _lastConnected?: Date;

  constructor(id: string, config: DatabaseConfig) {
    this.id = id;
    this.type = config.type;
    this.config = { ...config };
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get lastError(): string | undefined {
    return this._lastError;
  }

  get lastConnected(): Date | undefined {
    return this._lastConnected;
  }

  getStatus(): ConnectionStatus {
    return {
      id: this.id,
      type: this.type,
      isConnected: this._isConnected,
      lastConnected: this._lastConnected,
      lastError: this._lastError,
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
    };
  }

  protected setConnected(connected: boolean, error?: string): void {
    this._isConnected = connected;
    if (connected) {
      this._lastConnected = new Date();
      this._lastError = undefined;
    } else {
      this._lastError = error;
    }
  }

  protected logError(operation: string, error: any): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${this.id}:${this.type}] ${operation} failed:`, errorMsg);
    this._lastError = errorMsg;
  }

  // Abstract methods that must be implemented by concrete classes
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract testConnection(): Promise<boolean>;
  abstract query(sql: string, params?: any[]): Promise<import('../../types/index.js').QueryResult>;
  abstract listTables(database?: string): Promise<string[]>;
  abstract getTableSchema(table: string, database?: string): Promise<any[]>;

  // Optional methods with default implementations
  async listDatabases?(): Promise<string[]> {
    throw new Error(`listDatabases not implemented for ${this.type}`);
  }

  async ping?(): Promise<boolean> {
    return this.testConnection();
  }

  async getServerInfo?(): Promise<any> {
    return { type: this.type, version: 'unknown' };
  }
}