import { z } from 'zod';
import { CONNECTION_DEFAULTS, DEFAULT_PORTS } from '../constants/index.js';
import { DATABASE_TYPES, type DatabaseType, type DatabaseConfig, type Config } from '../../types/index.js';

export const DatabaseConfigSchema = z.object({
  type: z.enum(DATABASE_TYPES).default('mysql'),
  host: z.string().optional(),
  port: z.number().min(1).max(65535).optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),

  // SQLite specific
  file: z.string().optional(),

  // Supabase specific
  projectUrl: z.string().optional(),
  anonKey: z.string().optional(),
  serviceKey: z.string().optional(),

  // MongoDB specific
  authSource: z.string().optional(),

  // Connection string (for databases that support it)
  connectionString: z.string().optional(),

  // Common connection options
  ssl: z.boolean().default(CONNECTION_DEFAULTS.ssl),
  connectionLimit: z.number().min(1).max(1000).default(CONNECTION_DEFAULTS.connectionLimit),
  idleTimeout: z.number().default(CONNECTION_DEFAULTS.idleTimeout),
  queueLimit: z.number().min(0).default(CONNECTION_DEFAULTS.queueLimit),
  maxIdle: z.number().min(0).optional(),
  enableKeepAlive: z.boolean().default(CONNECTION_DEFAULTS.enableKeepAlive),
  keepAliveInitialDelay: z.number().default(CONNECTION_DEFAULTS.keepAliveInitialDelay),
  charset: z.string().default(CONNECTION_DEFAULTS.charset),
  timezone: z.string().default(CONNECTION_DEFAULTS.timezone),
  debug: z.boolean().default(CONNECTION_DEFAULTS.debug),
  multipleStatements: z.boolean().default(CONNECTION_DEFAULTS.multipleStatements),
}).refine((data) => {
  // Validation logic for different database types
  switch (data.type) {
    case 'mysql':
    case 'postgresql':
    case 'planetscale':
      return data.host && data.user;
    case 'sqlite':
      return data.file || data.database;
    case 'supabase':
      return data.projectUrl && (data.anonKey || data.serviceKey);
    case 'mongodb':
      return data.connectionString || data.host;
    default:
      return false;
  }
}, {
  message: 'Invalid configuration for the specified database type',
});

export const ConfigSchema = z.object({
  databases: z.record(z.string(), DatabaseConfigSchema),
  defaultDatabase: z.string().optional(),
  security: z.object({
    maxQueryResults: z.number().default(1000),
    allowDataModification: z.boolean().default(true),
    allowDrop: z.boolean().default(false),
    allowTruncate: z.boolean().default(false),
    readOnlyMode: z.boolean().default(false),
  }).default({
    maxQueryResults: 1000,
    allowDataModification: true,
    allowDrop: false,
    allowTruncate: false,
    readOnlyMode: false,
  }),
});

export type ZodDatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export class ConfigManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    const databases = this.discoverDatabases();

    if (Object.keys(databases).length === 0) {
      throw new Error('No databases found. Please configure at least one database using DB_TYPE_1, DB_HOST_1, etc.');
    }

    const configData = {
      databases,
      defaultDatabase: process.env.DEFAULT_DATABASE || Object.keys(databases)[0],
      security: {
        maxQueryResults: parseInt(process.env.MAX_QUERY_RESULTS || '1000'),
        allowDataModification: process.env.ALLOW_DATA_MODIFICATION !== 'false',
        allowDrop: process.env.ALLOW_DROP === 'true',
        allowTruncate: process.env.ALLOW_TRUNCATE === 'true',
        readOnlyMode: process.env.READ_ONLY_MODE === 'true',
      },
    };

    try {
      return ConfigSchema.parse(configData);
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw new Error('Invalid configuration. Please check your environment variables.');
    }
  }

  private discoverDatabases(): Record<string, any> {
    const databases: Record<string, any> = {};
    const envVars = process.env;
    const dbNumbers = new Set<number>();

    // Find all database numbers by looking for any DB_*_N pattern
    for (const key in envVars) {
      const match = key.match(/^DB_(?:HOST|TYPE|FILE|PROJECT_URL|CONNECTION_STRING)_(\d+)$/);
      if (match) {
        dbNumbers.add(parseInt(match[1]!));
      }
    }

    for (const dbNum of Array.from(dbNumbers).sort()) {
      const dbId = `db_${dbNum}`;
      const type = (envVars[`DB_TYPE_${dbNum}`] as DatabaseType) || 'mysql';

      // Skip if no required config is found for the database type
      const hasRequiredConfig = this.hasRequiredConfig(dbNum, type, envVars);
      if (!hasRequiredConfig) {
        console.warn(`⚠️ Skipping ${dbId}: missing required configuration for type ${type}`);
        continue;
      }

      const dbConfig: any = {
        type,
        // Common connection options
        connectionLimit: CONNECTION_DEFAULTS.connectionLimit,
        idleTimeout: CONNECTION_DEFAULTS.idleTimeout,
        queueLimit: CONNECTION_DEFAULTS.queueLimit,
        maxIdle: CONNECTION_DEFAULTS.maxIdle,
        enableKeepAlive: CONNECTION_DEFAULTS.enableKeepAlive,
        keepAliveInitialDelay: CONNECTION_DEFAULTS.keepAliveInitialDelay,
        ssl: envVars[`DB_SSL_${dbNum}`] === 'true' || CONNECTION_DEFAULTS.ssl,
        charset: CONNECTION_DEFAULTS.charset,
        timezone: CONNECTION_DEFAULTS.timezone,
        debug: CONNECTION_DEFAULTS.debug,
        multipleStatements: CONNECTION_DEFAULTS.multipleStatements,
      };

      // Add type-specific configuration
      this.addTypeSpecificConfig(dbConfig, dbNum, type, envVars);

      databases[dbId] = dbConfig;
      console.log(`✓ Discovered database: ${dbId} (${type})`);
    }

    return databases;
  }

  private hasRequiredConfig(dbNum: number, type: DatabaseType, envVars: Record<string, string | undefined>): boolean {
    switch (type) {
      case 'mysql':
      case 'postgresql':
      case 'planetscale':
        return !!(envVars[`DB_HOST_${dbNum}`] && envVars[`DB_USER_${dbNum}`]);

      case 'sqlite':
        return !!(envVars[`DB_FILE_${dbNum}`] || envVars[`DB_NAME_${dbNum}`]);

      case 'supabase':
        return !!(envVars[`DB_PROJECT_URL_${dbNum}`] &&
                 (envVars[`DB_ANON_KEY_${dbNum}`] || envVars[`DB_SERVICE_KEY_${dbNum}`]));

      case 'mongodb':
        return !!(envVars[`DB_CONNECTION_STRING_${dbNum}`] || envVars[`DB_HOST_${dbNum}`]);

      default:
        return false;
    }
  }

  private addTypeSpecificConfig(dbConfig: any, dbNum: number, type: DatabaseType, envVars: Record<string, string | undefined>): void {
    const getPort = (defaultPort: number) => {
      const envPort = envVars[`DB_PORT_${dbNum}`];
      return envPort ? parseInt(envPort) : defaultPort;
    };

    switch (type) {
      case 'mysql':
      case 'postgresql':
      case 'planetscale':
        dbConfig.host = envVars[`DB_HOST_${dbNum}`];
        dbConfig.port = getPort(DEFAULT_PORTS[type]);
        dbConfig.user = envVars[`DB_USER_${dbNum}`];
        dbConfig.password = envVars[`DB_PASSWORD_${dbNum}`] || '';
        dbConfig.database = envVars[`DB_NAME_${dbNum}`];
        dbConfig.connectionString = envVars[`DB_CONNECTION_STRING_${dbNum}`];
        break;

      case 'sqlite':
        dbConfig.file = envVars[`DB_FILE_${dbNum}`];
        dbConfig.database = envVars[`DB_NAME_${dbNum}`];
        break;

      case 'supabase':
        dbConfig.projectUrl = envVars[`DB_PROJECT_URL_${dbNum}`];
        dbConfig.anonKey = envVars[`DB_ANON_KEY_${dbNum}`];
        dbConfig.serviceKey = envVars[`DB_SERVICE_KEY_${dbNum}`];
        break;

      case 'mongodb':
        dbConfig.connectionString = envVars[`DB_CONNECTION_STRING_${dbNum}`];
        dbConfig.host = envVars[`DB_HOST_${dbNum}`];
        dbConfig.port = getPort(DEFAULT_PORTS[type]);
        dbConfig.user = envVars[`DB_USER_${dbNum}`];
        dbConfig.password = envVars[`DB_PASSWORD_${dbNum}`];
        dbConfig.database = envVars[`DB_NAME_${dbNum}`];
        dbConfig.authSource = envVars[`DB_AUTH_SOURCE_${dbNum}`];
        break;
    }
  }

  getConfig(): Config {
    return this.config;
  }

  getDatabaseConfig(databaseId: string): DatabaseConfig {
    const dbConfig = this.config.databases[databaseId];
    if (!dbConfig) {
      throw new Error(`Database configuration not found for: ${databaseId}`);
    }
    return dbConfig as DatabaseConfig;
  }

  getDatabaseList(): string[] {
    return Object.keys(this.config.databases);
  }

  getDefaultDatabase(): string {
    return this.config.defaultDatabase || this.getDatabaseList()[0] || 'db_1';
  }

  isReadOnlyMode(): boolean {
    return this.config.security.readOnlyMode;
  }

  getSecurityConfig() {
    return this.config.security;
  }

  validateDatabaseExists(databaseId: string): void {
    if (!this.config.databases[databaseId]) {
      throw new Error(`Unknown database: ${databaseId}. Available databases: ${this.getDatabaseList().join(', ')}`);
    }
  }
}

export const configManager = new ConfigManager();