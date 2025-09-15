import type { DatabaseType } from './common.js';

export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  file?: string; // For SQLite
  projectUrl?: string; // For Supabase
  anonKey?: string; // For Supabase
  serviceKey?: string; // For Supabase
  authSource?: string; // For MongoDB
  ssl?: boolean;
  connectionString?: string; // For full connection strings
  [key: string]: any; // Allow additional database-specific options
}

export interface QueryResult {
  results: any[];
  fields?: any[];
  affectedRows?: number;
  insertId?: number;
  metadata?: any;
}

export interface DatabaseConnection {
  readonly id: string;
  readonly type: DatabaseType;
  readonly config: DatabaseConfig;
  readonly isConnected: boolean;
  readonly lastError?: string;

  // Core operations
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  query(sql: string, params?: any[]): Promise<QueryResult>;

  // Schema operations
  listDatabases?(): Promise<string[]>;
  listTables(database?: string): Promise<string[]>;
  getTableSchema(table: string, database?: string): Promise<any[]>;

  // Utility operations
  ping?(): Promise<boolean>;
  getServerInfo?(): Promise<any>;
  getStatus(): ConnectionStatus;
}

export interface ConnectionStatus {
  id: string;
  type: DatabaseType;
  isConnected: boolean;
  lastConnected?: Date;
  lastError?: string;
  host?: string;
  port?: number;
  database?: string;
}

export interface DatabaseManagerOptions {
  retryAttempts?: number;
  retryDelay?: number;
  healthCheckInterval?: number;
}