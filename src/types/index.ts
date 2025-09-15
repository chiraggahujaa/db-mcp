// Re-export all types for easy importing
export type {
  DatabaseConfig,
  QueryResult,
  DatabaseConnection,
  ConnectionStatus,
  DatabaseManagerOptions
} from './database.js';

export type {
  DatabaseType,
  SecurityConfig,
  SecurityEvent,
  ValidationResult,
  Config
} from './common.js';

export { DATABASE_TYPES } from './common.js';