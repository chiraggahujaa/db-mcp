import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535).default(3306),
  user: z.string(),
  password: z.string(),
  database: z.string().optional(),
  connectionLimit: z.number().min(1).max(100).default(10),
  acquireTimeout: z.number().default(60000),
  timeout: z.number().default(60000),
  ssl: z.boolean().default(false),
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

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    const configData = {
      databases: {
        'local': {
          host: process.env.LOCAL_DB_HOST || 'localhost',
          port: parseInt(process.env.LOCAL_DB_PORT || '3306'),
          user: process.env.LOCAL_DB_USER || 'root',
          password: process.env.LOCAL_DB_PASSWORD || '',
          database: process.env.LOCAL_DB_NAME,
        },
        'hm-staging-write': {
          host: process.env.HM_STAGING_WRITE_HOST || '',
          port: parseInt(process.env.HM_STAGING_WRITE_PORT || '3306'),
          user: process.env.HM_STAGING_WRITE_USER || '',
          password: process.env.HM_STAGING_WRITE_PASSWORD || '',
          database: process.env.HM_STAGING_WRITE_DB,
        },
        'hm-staging-read': {
          host: process.env.HM_STAGING_READ_HOST || '',
          port: parseInt(process.env.HM_STAGING_READ_PORT || '3306'),
          user: process.env.HM_STAGING_READ_USER || '',
          password: process.env.HM_STAGING_READ_PASSWORD || '',
          database: process.env.HM_STAGING_READ_DB,
        },
        'hm-prod-write': {
          host: process.env.HM_PROD_WRITE_HOST || '',
          port: parseInt(process.env.HM_PROD_WRITE_PORT || '3306'),
          user: process.env.HM_PROD_WRITE_USER || '',
          password: process.env.HM_PROD_WRITE_PASSWORD || '',
          database: process.env.HM_PROD_WRITE_DB,
        },
        'hm-critical-write': {
          host: process.env.HM_CRITICAL_WRITE_HOST || '',
          port: parseInt(process.env.HM_CRITICAL_WRITE_PORT || '3306'),
          user: process.env.HM_CRITICAL_WRITE_USER || '',
          password: process.env.HM_CRITICAL_WRITE_PASSWORD || '',
          database: process.env.HM_CRITICAL_WRITE_DB,
        },
      },
      defaultDatabase: process.env.DEFAULT_DATABASE || 'local',
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
    return this.config.defaultDatabase || this.getDatabaseList()[0] || 'local';
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