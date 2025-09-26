
import admin from 'firebase-admin';
import { BaseDatabaseConnection } from './base.js';
import type { DatabaseConfig, QueryResult } from '../../types/index.js';

const appInstances = new Map<string, { app: admin.app.App; connectionCount: number }>();

export class FirestoreConnection extends BaseDatabaseConnection {
  private db?: admin.firestore.Firestore;
  private appName?: string;

  async connect(): Promise<void> {
    try {
      if (this.db) {
        await this.disconnect();
      }

      const serviceAccount = JSON.parse(this.config.serviceAccountKey as string);
      this.appName = `app-${serviceAccount.project_id}`;

      let appInstance = appInstances.get(this.appName);
      if (!appInstance) {
        const app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: this.config.databaseURL,
        }, this.appName);
        appInstance = { app, connectionCount: 0 };
        appInstances.set(this.appName, appInstance);
      }

      this.db = appInstance.app.firestore();
      appInstance.connectionCount++;
      
      await this.testConnection();
      this.setConnected(true);
      console.log(`✓ Firestore connection established: ${this.id}`);
    } catch (error) {
      this.logError('connect', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.appName) {
        const appInstance = appInstances.get(this.appName);
        if (appInstance) {
          appInstance.connectionCount--;
          if (appInstance.connectionCount === 0) {
            await appInstance.app.delete();
            appInstances.delete(this.appName);
          }
        }
      }
      this.db = undefined;
      this.setConnected(false);
    } catch (error) {
      this.logError('disconnect', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.db) {
        return false;
      }
      await this.db.listCollections();
      this.setConnected(true);
      return true;
    } catch (error) {
      this.logError('testConnection', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.db) {
      throw new Error(`Firestore connection ${this.id} is not initialized`);
    }

    try {
      // For Firestore, the 'sql' parameter is the collection name.
      // The 'params' parameter is an array of query constraints.
      let query: admin.firestore.Query = this.db.collection(sql);
      if (params) {
        for (const constraint of params) {
          if (constraint.field && constraint.operator && constraint.value) {
            query = query.where(constraint.field, constraint.operator, constraint.value);
          }
        }
      }
      const snapshot = await query.get();
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return {
        results,
        fields: [],
      };
    } catch (error) {
      this.logError('query', error);
      throw error;
    }
  }

  override async listDatabases(): Promise<string[]> {
    // Firestore doesn't have a concept of databases in the same way as SQL.
    // Returning the project ID.
    if (!this.db) {
        return [];
    }
    return [this.db.app.options.projectId || 'default'];
  }

  async listTables(database?: string): Promise<string[]> {
    if (!this.db) {
        return [];
    }
    const collections = await this.db.listCollections();
    return collections.map(c => c.id);
  }

  async getTableSchema(table: string, database?: string): Promise<any[]> {
    // Firestore documents are schema-less.
    // We can return a sample document.
    if (!this.db) {
        return [];
    }
    const snapshot = await this.db.collection(table).limit(1).get();
    if (snapshot.empty) {
        return [];
    }
    const doc = snapshot.docs[0];
    const data = doc.data();
    return Object.keys(data).map(key => ({
        Field: key,
        Type: typeof data[key],
        Null: 'YES', // Assuming fields can be null
        Key: '',
        Default: null,
        Extra: ''
    }));
  }

  override async ping(): Promise<boolean> {
    return this.testConnection();
  }

  override async getServerInfo(): Promise<any> {
    try {
        if (!this.db) {
            throw new Error('Not connected');
        }
      return {
        type: 'firestore',
        version: 'unknown',
        projectId: this.db.app.options.projectId,
      };
    } catch (error) {
      return {
        type: 'firestore',
        version: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
