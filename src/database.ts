import { configManager } from './core/config/config-manager.js';
import { DatabaseManager } from './database/managers/database-manager.js';

// Create and initialize the database manager with configurations
const createDatabaseManager = async (): Promise<DatabaseManager> => {
  const manager = new DatabaseManager({
    retryAttempts: 3,
    retryDelay: 1000,
    healthCheckInterval: 300000, // 5 minutes
  });

  const config = configManager.getConfig();
  const dbConfigs: Record<string, any> = {};

  // Convert config format to the new DatabaseConfig format
  for (const [id, dbConfig] of Object.entries(config.databases)) {
    dbConfigs[id] = dbConfig;
  }

  await manager.initialize(dbConfigs);
  return manager;
};

// Export the database manager instance (initialized lazily)
let _databaseManager: DatabaseManager | null = null;

export const getDatabaseManager = async (): Promise<DatabaseManager> => {
  if (!_databaseManager) {
    _databaseManager = await createDatabaseManager();
  }
  return _databaseManager;
};

// For backward compatibility, export a synchronous version that throws if not initialized
export const databaseManager = {
  get instance(): DatabaseManager {
    if (!_databaseManager) {
      throw new Error('Database manager not initialized. Call getDatabaseManager() first.');
    }
    return _databaseManager;
  },

  // Legacy methods for backward compatibility
  async query(sql: string, params?: any[], databaseId?: string) {
    const manager = await getDatabaseManager();
    return manager.query(sql, params, databaseId);
  },

  async getCurrentDatabase() {
    const manager = await getDatabaseManager();
    return manager.getCurrentDatabase();
  },

  async switchDatabase(databaseId: string) {
    const manager = await getDatabaseManager();
    return manager.switchDatabase(databaseId);
  },

  async testConnection(databaseId: string) {
    const manager = await getDatabaseManager();
    return manager.testConnection(databaseId);
  },

  async testAllConnections() {
    const manager = await getDatabaseManager();
    return manager.testAllConnections();
  },

  async getDatabases(databaseId?: string) {
    const manager = await getDatabaseManager();
    return manager.listDatabases(databaseId);
  },

  async getTables(database?: string, databaseId?: string) {
    const manager = await getDatabaseManager();
    return manager.listTables(database, databaseId);
  },

  async getTableSchema(table: string, database?: string, databaseId?: string) {
    const manager = await getDatabaseManager();
    return manager.getTableSchema(table, database, databaseId);
  },

  async close() {
    if (_databaseManager) {
      await _databaseManager.close();
      _databaseManager = null;
    }
  },
};

// Export types for backward compatibility
export type { QueryResult } from './types/index.js';