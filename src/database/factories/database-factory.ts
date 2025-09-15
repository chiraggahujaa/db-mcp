import type { DatabaseConnection, DatabaseConfig, DatabaseType } from '../../types/index.js';
import { DATABASE_TYPES, DEFAULT_PORTS } from '../../core/constants/index.js';
import { MySQLConnection } from '../connectors/mysql.js';
import { PostgreSQLConnection } from '../connectors/postgresql.js';
import { SQLiteConnection } from '../connectors/sqlite.js';
import { SupabaseConnection } from '../connectors/supabase.js';

export class DatabaseFactory {
  static createConnection(id: string, config: DatabaseConfig): DatabaseConnection {
    if (!config.type) {
      throw new Error(`Database type is required for ${id}`);
    }

    if (!DATABASE_TYPES.includes(config.type)) {
      throw new Error(`Unsupported database type: ${config.type}. Supported types: ${DATABASE_TYPES.join(', ')}`);
    }

    // Validate required configuration for each database type
    this.validateConfig(config);

    switch (config.type) {
      case 'mysql':
        return new MySQLConnection(id, config);

      case 'postgresql':
        return new PostgreSQLConnection(id, config);

      case 'sqlite':
        return new SQLiteConnection(id, config);

      case 'supabase':
        return new SupabaseConnection(id, config);

      case 'planetscale':
        return new MySQLConnection(id, { ...config, ssl: true }); // PlanetScale is MySQL-compatible with SSL

      case 'mongodb':
        throw new Error('MongoDB connector not yet implemented in new structure');

      default:
        throw new Error(`Database type ${config.type} is not implemented yet`);
    }
  }

  private static validateConfig(config: DatabaseConfig): void {
    const { type } = config;

    switch (type) {
      case 'mysql':
      case 'postgresql':
      case 'planetscale':
        if (!config.host) {
          throw new Error(`Host is required for ${type} database`);
        }
        if (!config.user) {
          throw new Error(`User is required for ${type} database`);
        }
        // Set default port if not provided
        if (!config.port) {
          config.port = DEFAULT_PORTS[type];
        }
        break;

      case 'sqlite':
        if (!config.file && !config.database) {
          throw new Error('File path or database name is required for SQLite database');
        }
        break;

      case 'supabase':
        if (!config.projectUrl) {
          throw new Error('Project URL is required for Supabase database');
        }
        if (!config.anonKey && !config.serviceKey) {
          throw new Error('Either anon key or service key is required for Supabase database');
        }
        break;

      case 'mongodb':
        if (!config.connectionString && !config.host) {
          throw new Error('Either connection string or host is required for MongoDB database');
        }
        // Set default port if not provided and not using connection string
        if (!config.connectionString && !config.port) {
          config.port = DEFAULT_PORTS[type];
        }
        break;

      default:
        throw new Error(`Unknown database type: ${type}`);
    }
  }

  static getSupportedTypes(): DatabaseType[] {
    return [...DATABASE_TYPES];
  }

  static getDefaultPort(type: DatabaseType): number {
    return DEFAULT_PORTS[type];
  }

  static isTypeSupported(type: string): type is DatabaseType {
    return DATABASE_TYPES.includes(type as DatabaseType);
  }
}