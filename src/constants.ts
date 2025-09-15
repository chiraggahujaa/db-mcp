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

// Default database port
export const DEFAULT_PORT = 3306;