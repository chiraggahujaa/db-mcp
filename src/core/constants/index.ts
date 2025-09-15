// Database connection constants
// These settings are applied to all databases

export const CONNECTION_DEFAULTS = {
  // Connection Pool Settings
  connectionLimit: 10,
  // Note: acquireTimeout and timeout are not valid mysql2 pool options
  idleTimeout: 600000,      // 10 minutes
  queueLimit: 0,            // unlimited queue
  maxIdle: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  // SSL Settings
  ssl: false,

  // Advanced Settings
  charset: 'UTF8_GENERAL_CI',
  timezone: 'local',
  debug: false,
  multipleStatements: false,
} as const;

// Default database ports by type
export const DEFAULT_PORTS = {
  mysql: 3306,
  postgresql: 5432,
  sqlite: 0, // Not applicable for file-based databases
  supabase: 443, // HTTPS port
  planetscale: 3306,
  mongodb: 27017,
} as const;

// Database types
export const DATABASE_TYPES = ['mysql', 'postgresql', 'sqlite', 'supabase', 'planetscale', 'mongodb'] as const;

// MongoDB specific defaults
export const MONGODB_DEFAULTS = {
  authSource: 'admin',
  ssl: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 1,
} as const;

// SQLite specific defaults
export const SQLITE_DEFAULTS = {
  timeout: 5000,
  verbose: false,
  create: true,
  readwrite: true,
} as const;

// Supabase specific defaults
export const SUPABASE_DEFAULTS = {
  timeout: 30000,
  retries: 3,
  apiVersion: 'v1',
} as const;