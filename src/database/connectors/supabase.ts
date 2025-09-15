import { BaseDatabaseConnection } from './base.js';
import type { QueryResult } from '../../types/index.js';

export class SupabaseConnection extends BaseDatabaseConnection {
  private baseUrl?: string;
  private apiKey?: string;
  private serviceKey?: string;

  async connect(): Promise<void> {
    try {
      this.baseUrl = this.config.projectUrl?.replace(/\/+$/, '');
      this.apiKey = this.config.anonKey;
      this.serviceKey = this.config.serviceKey;

      if (!this.baseUrl) {
        throw new Error('Supabase project URL is required');
      }

      if (!this.apiKey && !this.serviceKey) {
        throw new Error('Supabase API key (anon or service) is required');
      }

      // Test the connection
      await this.testConnection();

      this.setConnected(true);
      console.log(`✓ Supabase connection established: ${this.id}`);
    } catch (error) {
      this.logError('connect', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.baseUrl = undefined;
      this.apiKey = undefined;
      this.serviceKey = undefined;
      this.setConnected(false);
    } catch (error) {
      this.logError('disconnect', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.baseUrl) {
        return false;
      }

      // Test with a simple health check
      const response = await this.makeRequest('GET', '/rest/v1/', {}, {});

      if (response.ok) {
        this.setConnected(true);
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logError('testConnection', error);
      this.setConnected(false, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    if (!this.baseUrl) {
      throw new Error(`Supabase connection ${this.id} is not initialized`);
    }

    try {
      // Supabase PostgREST doesn't support arbitrary SQL queries directly
      // We need to parse the SQL and convert it to PostgREST operations
      const parsedQuery = this.parseSimpleQuery(sql);

      if (parsedQuery.type === 'SELECT') {
        const data = await this.executeSelectQuery(parsedQuery, params);
        return {
          results: Array.isArray(data) ? data : [data],
          fields: this.extractFields(data),
        };
      } else {
        throw new Error(`Supabase connector only supports SELECT queries. Use specific methods for INSERT/UPDATE/DELETE operations.`);
      }
    } catch (error) {
      this.logError('query', error);
      throw error;
    }
  }

  async listTables(_database?: string): Promise<string[]> {
    try {
      // Use PostgREST metadata endpoint
      const response = await this.makeRequest('GET', '/rest/v1/', {
        'Accept': 'application/openapi+json',
      }, {});

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const schema = await response.json() as any;
      const definitions = schema?.definitions || {};
      const tables = Object.keys(definitions);
      return tables.filter(table => !table.startsWith('rpc_'));
    } catch (error) {
      this.logError('listTables', error);
      // Fallback: try to get tables via information_schema
      return this.listTablesViaRPC();
    }
  }

  async getTableSchema(table: string, _database?: string): Promise<any[]> {
    try {
      // Get table schema via PostgREST options
      const response = await this.makeRequest('OPTIONS', `/rest/v1/${table}`, {}, {});

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      // Parse the response headers for schema info
      const acceptPost = response.headers.get('Accept-Post');
      if (!acceptPost) {
        throw new Error('Unable to retrieve table schema');
      }

      // This is a simplified schema extraction - in practice you'd want to parse the OpenAPI spec
      return [{
        Field: 'id',
        Type: 'integer',
        Null: 'NO',
        Default: null,
        Key: 'PRI',
        Extra: 'auto_increment',
      }];
    } catch (error) {
      this.logError('getTableSchema', error);
      throw error;
    }
  }

  override async ping(): Promise<boolean> {
    return this.testConnection();
  }

  override async listDatabases(): Promise<string[]> {
    try {
      // For Supabase, we'll return the common schemas since we can't query information_schema directly
      // In a real implementation, you might want to use Supabase's management API
      return ['public'];
    } catch (error) {
      this.logError('listDatabases', error);
      // Fallback to common schemas if the query fails
      return ['public'];
    }
  }

  override async getServerInfo(): Promise<any> {
    try {
      const response = await this.makeRequest('GET', '/rest/v1/', {}, {});

      return {
        type: 'supabase',
        version: response.headers.get('X-PostgREST-Version') || 'unknown',
        projectUrl: this.baseUrl,
        status: response.ok ? 'connected' : 'error',
      };
    } catch (error) {
      return {
        type: 'supabase',
        version: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Supabase-specific methods
  async select(table: string, columns = '*', filters: Record<string, any> = {}): Promise<any[]> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('select', columns);

      for (const [key, value] of Object.entries(filters)) {
        queryParams.append(key, `eq.${value}`);
      }

      const response = await this.makeRequest('GET', `/rest/v1/${table}?${queryParams}`, {}, {});

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      this.logError('select', error);
      throw error;
    }
  }

  async insert(table: string, data: any): Promise<any> {
    try {
      const response = await this.makeRequest('POST', `/rest/v1/${table}`, {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }, data);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (error) {
      this.logError('insert', error);
      throw error;
    }
  }

  async update(table: string, data: any, filters: Record<string, any>): Promise<any> {
    try {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        queryParams.append(key, `eq.${value}`);
      }

      const response = await this.makeRequest('PATCH', `/rest/v1/${table}?${queryParams}`, {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }, data);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (error) {
      this.logError('update', error);
      throw error;
    }
  }

  async delete(table: string, filters: Record<string, any>): Promise<void> {
    try {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        queryParams.append(key, `eq.${value}`);
      }

      const response = await this.makeRequest('DELETE', `/rest/v1/${table}?${queryParams}`, {}, {});

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      this.logError('delete', error);
      throw error;
    }
  }

  private async makeRequest(method: string, path: string, headers: Record<string, string>, body?: any): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const authKey = this.serviceKey || this.apiKey;

    const requestHeaders = {
      'Authorization': `Bearer ${authKey}`,
      'apikey': authKey!,
      ...headers,
    };

    const requestInit: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      requestInit.body = JSON.stringify(body);
    }

    return fetch(url, requestInit);
  }

  private async listTablesViaRPC(): Promise<string[]> {
    try {
      // This would require a custom RPC function in Supabase
      const result = await this.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      return result.results.map((row: any) => row.table_name);
    } catch (error) {
      this.logError('listTablesViaRPC', error);
      return [];
    }
  }

  private parseSimpleQuery(sql: string): { type: string; table?: string; columns?: string; where?: string; limit?: number; joins?: string } {
    const normalizedSql = sql.trim().replace(/\s+/g, ' ');

    // Basic SELECT query parsing
    const selectMatch = normalizedSql.match(/^SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+(.*))?$/i);
    if (selectMatch) {
      const [, columns = '', table = '', rest = ''] = selectMatch;
      let where = '';
      let limit: number | undefined;
      let joins = '';

      if (rest) {
        const whereMatch = rest.match(/WHERE\s+(.*?)(?:\s+LIMIT\s+(\d+))?$/i);
        if (whereMatch) {
          where = whereMatch[1] || '';
          if (whereMatch[2]) limit = parseInt(whereMatch[2]);
        }

        const limitMatch = rest.match(/LIMIT\s+(\d+)$/i);
        if (limitMatch) {
          limit = parseInt(limitMatch[1] || "");
        }

        const joinMatch = rest.match(/((?:LEFT\s+|RIGHT\s+|INNER\s+)?JOIN\s+.*?)(?:\s+WHERE|\s+LIMIT|$)/i);
        if (joinMatch) {
          joins = joinMatch[1] || '';
        }
      }

      return { type: 'SELECT', table, columns, where, limit, joins };
    }

    return { type: 'UNKNOWN' };
  }

  private async executeSelectQuery(parsedQuery: any, params: any[] = []): Promise<any[]> {
    const { table, columns, where, limit, joins } = parsedQuery;

    if (!table) {
      throw new Error('No table specified in query');
    }

    // Handle JOINs by using embedded resources or separate queries
    if (joins) {
      throw new Error('JOIN queries are not yet supported in Supabase connector. Use separate queries or embedded resources.');
    }

    let url = `/rest/v1/${table}`;
    const queryParams = new URLSearchParams();

    // Handle column selection
    if (columns && columns !== '*') {
      queryParams.append('select', columns);
    }

    // Handle WHERE conditions (basic support)
    if (where) {
      const conditions = this.parseWhereClause(where, params);
      for (const [key, value] of Object.entries(conditions)) {
        queryParams.append(key, value as string);
      }
    }

    // Handle LIMIT
    if (limit) {
      queryParams.append('limit', limit.toString());
    }

    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`;
    }

    const response = await this.makeRequest('GET', url, {}, {});

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    return Array.isArray(result) ? result : [result];
  }

  private parseWhereClause(where: string, params: any[] = []): Record<string, string> {
    const conditions: Record<string, string> = {};

    // Very basic WHERE clause parsing - this could be expanded
    // Handle simple equality conditions
    const equalityMatches = where.match(/(\w+)\s*=\s*'([^']+)'/g);
    if (equalityMatches) {
      for (const match of equalityMatches) {
        const singleMatch = match.match(/(\w+)\s*=\s*'([^']+)'/);
        if (singleMatch) {
          const [, column, value] = singleMatch;
          if (column && value !== undefined) {
            conditions[column] = `eq.${value}`;
          }
        }
      }
    }

    // Handle parameter placeholders
    let paramIndex = 0;
    const paramMatches = where.match(/(\w+)\s*=\s*\?/g);
    if (paramMatches && params.length > 0) {
      for (const match of paramMatches) {
        const singleMatch = match.match(/(\w+)\s*=\s*\?/);
        if (singleMatch) {
          const [, column] = singleMatch;
          if (column && paramIndex < params.length) {
            conditions[column] = `eq.${params[paramIndex]}`;
            paramIndex++;
          }
        }
      }
    }

    return conditions;
  }

  private extractFields(data: any): any[] {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return [];
    }

    const firstRow = data[0];
    if (typeof firstRow !== 'object' || firstRow === null) {
      return [];
    }

    return Object.keys(firstRow).map(key => ({
      name: key,
      type: typeof firstRow[key],
    }));
  }
}