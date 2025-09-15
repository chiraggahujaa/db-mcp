import { z } from 'zod';
import { CONNECTION_DEFAULTS, DEFAULT_PORT } from './constants.js';

export const DatabaseConfigSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535).default(DEFAULT_PORT),
  user: z.string(),
  password: z.string(),
  database: z.string().optional(),
  connectionLimit: z.number().min(1).max(1000).default(CONNECTION_DEFAULTS.connectionLimit),
  idleTimeout: z.number().default(CONNECTION_DEFAULTS.idleTimeout),
  queueLimit: z.number().min(0).default(CONNECTION_DEFAULTS.queueLimit),
  maxIdle: z.number().min(0).optional(),
  enableKeepAlive: z.boolean().default(CONNECTION_DEFAULTS.enableKeepAlive),
  keepAliveInitialDelay: z.number().default(CONNECTION_DEFAULTS.keepAliveInitialDelay),
  ssl: z.boolean().default(CONNECTION_DEFAULTS.ssl),
  charset: z.string().default(CONNECTION_DEFAULTS.charset),
  timezone: z.string().default(CONNECTION_DEFAULTS.timezone),
  debug: z.boolean().default(CONNECTION_DEFAULTS.debug),
  multipleStatements: z.boolean().default(CONNECTION_DEFAULTS.multipleStatements),
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

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private config: Config;
  private aliasToIdMap: Map<string, string> = new Map();
  private idToAliasMap: Map<string, string> = new Map();

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    const databases = this.discoverDatabases();

    if (Object.keys(databases).length === 0) {
      throw new Error('No databases found. Please configure at least one database using DB_HOST_1, DB_PORT_1, etc.');
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

    for (const key in envVars) {
      const match = key.match(/^DB_HOST_(\d+)$/);
      if (match) {
        dbNumbers.add(parseInt(match[1]!));
      }
    }

    for (const dbNum of Array.from(dbNumbers).sort()) {
      const host = envVars[`DB_HOST_${dbNum}`];
      if (!host) continue;

      const dbId = `db_${dbNum}`;
      const port = parseInt(envVars[`DB_PORT_${dbNum}`] || String(DEFAULT_PORT));
      const user = envVars[`DB_USER_${dbNum}`] || 'root';
      const password = envVars[`DB_PASSWORD_${dbNum}`] || '';
      const database = envVars[`DB_NAME_${dbNum}`];

      databases[dbId] = {
        host,
        port,
        user,
        password,
        database,
        // Use constants for all connection and advanced settings
        connectionLimit: CONNECTION_DEFAULTS.connectionLimit,
        idleTimeout: CONNECTION_DEFAULTS.idleTimeout,
        queueLimit: CONNECTION_DEFAULTS.queueLimit,
        maxIdle: CONNECTION_DEFAULTS.maxIdle,
        enableKeepAlive: CONNECTION_DEFAULTS.enableKeepAlive,
        keepAliveInitialDelay: CONNECTION_DEFAULTS.keepAliveInitialDelay,
        ssl: CONNECTION_DEFAULTS.ssl,
        charset: CONNECTION_DEFAULTS.charset,
        timezone: CONNECTION_DEFAULTS.timezone,
        debug: CONNECTION_DEFAULTS.debug,
        multipleStatements: CONNECTION_DEFAULTS.multipleStatements,
      };

      console.log(`✓ Discovered database: ${dbId} (${host}:${port})`);
    }

    return databases;
  }

  getConfig(): Config {
    return this.config;
  }

  getDatabaseConfig(databaseId: string): DatabaseConfig {
    const dbConfig = this.config.databases[databaseId];
    if (!dbConfig) {
      throw new Error(`Database configuration not found for: ${databaseId}`);
    }
    return dbConfig;
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