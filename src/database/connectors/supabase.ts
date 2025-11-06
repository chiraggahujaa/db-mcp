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
      // Check if this is a complex query (contains JOIN, functions, etc.)
      if (this.isComplexQuery(sql)) {
        const data = await this.executeRawSQLViaRPC(sql, params);
        return {
          results: Array.isArray(data) ? data : [data],
          fields: this.extractFields(data),
        };
      }

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
      // First try to get schema via RPC function for information_schema access
      try {
        const schema = await this.getTableSchemaViaRPC(table);
        if (schema && schema.length > 0) {
          return schema;
        }
      } catch (rpcError) {
        console.warn(`RPC schema query failed for table ${table}, trying OpenAPI approach:`, rpcError);
      }

      // Fallback: Try to get schema via OpenAPI spec
      const response = await this.makeRequest('GET', '/rest/v1/', {
        'Accept': 'application/openapi+json',
      }, {});

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const schema = await response.json() as any;
      const definitions = schema?.definitions || {};

      if (!definitions[table]) {
        throw new Error(`Table '${table}' not found in schema definitions`);
      }

      const tableDefinition = definitions[table];
      const properties = tableDefinition.properties || {};

      // Convert OpenAPI schema to MySQL-like format for consistency
      const columns = Object.entries(properties).map(([columnName, columnDef]: [string, any]) => {
        const type = this.mapOpenAPITypeToSQL(columnDef);
        const isNullable = !tableDefinition.required?.includes(columnName);

        return {
          Field: columnName,
          Type: type,
          Null: isNullable ? 'YES' : 'NO',
          Default: columnDef.default || null,
          Key: columnName === 'id' ? 'PRI' : '', // Simple heuristic for primary key
          Extra: columnName === 'id' && type.includes('integer') ? 'auto_increment' : '',
        };
      });

      if (columns.length === 0) {
        throw new Error(`No columns found for table '${table}'`);
      }

      return columns;
    } catch (error) {
      this.logError('getTableSchema', error);
      throw new Error(`Unable to retrieve table schema -- ${error instanceof Error ? error.message : String(error)}`);
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

    // Handle JOINs by attempting to use SQL via RPC function
    if (joins) {
      return this.executeRawSQLQuery(parsedQuery, params);
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

  private isComplexQuery(sql: string): boolean {
    const normalizedSql = sql.toLowerCase();
    return (
      normalizedSql.includes('join ') ||
      normalizedSql.includes('union ') ||
      normalizedSql.includes('subquery') ||
      normalizedSql.includes('with ') ||
      normalizedSql.match(/\b(acos|cos|sin|radians|sqrt|power|abs|round|floor|ceil)\s*\(/i) !== null ||
      normalizedSql.includes('order by') ||
      normalizedSql.includes('group by') ||
      normalizedSql.includes('having') ||
      normalizedSql.includes('information_schema') ||
      this.isFunctionCall(sql)
    );
  }

  private isFunctionCall(sql: string): boolean {
    const normalizedSql = sql.trim().toLowerCase();
    // Check if SQL starts with SELECT and contains function calls in FROM clause
    // Pattern: SELECT ... FROM function_name(args)
    const functionInFromPattern = /^select\s+.*\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i;
    return functionInFromPattern.test(normalizedSql);
  }

  private async executeRawSQLViaRPC(sql: string, params: any[] = []): Promise<any[]> {
    try {
      // Try to execute via a generic SQL RPC function
      // This assumes you have created an RPC function in Supabase called 'execute_sql'
      const response = await this.makeRequest('POST', '/rest/v1/rpc/execute_sql', {
        'Content-Type': 'application/json',
      }, {
        sql_query: sql,
        query_params: params
      });

      if (!response.ok) {
        // If RPC doesn't exist, try direct SQL execution (for compatible queries)
        // This is a fallback that might work for some complex queries
        throw new Error(`RPC function 'execute_sql' not found. Complex SQL queries require an RPC function in Supabase.`);
      }

      const result = await response.json();
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      this.logError('executeRawSQLViaRPC', error);
      throw error;
    }
  }

  private async executeRawSQLQuery(parsedQuery: any, params: any[] = []): Promise<any[]> {
    // This method is called when JOINs are detected
    // For now, we'll delegate to the RPC method
    return this.executeRawSQLViaRPC(this.reconstructSQL(parsedQuery), params);
  }

  private reconstructSQL(parsedQuery: any): string {
    const { table, columns, where, limit, joins } = parsedQuery;
    let sql = `SELECT ${columns || '*'} FROM ${table}`;

    if (joins) {
      sql += ` ${joins}`;
    }

    if (where) {
      sql += ` WHERE ${where}`;
    }

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    return sql;
  }

  private async getTableSchemaViaRPC(table: string): Promise<any[]> {
    try {
      // Try to call an RPC function that can access information_schema
      const response = await this.makeRequest('POST', '/rest/v1/rpc/get_table_schema', {
        'Content-Type': 'application/json',
      }, { table_name: table });

      if (!response.ok) {
        throw new Error(`RPC function 'get_table_schema' not available`);
      }

      const result = await response.json();
      return Array.isArray(result) ? result : [];
    } catch (error) {
      // RPC function doesn't exist or failed
      throw error;
    }
  }

  private mapOpenAPITypeToSQL(columnDef: any): string {
    const { type, format, maxLength } = columnDef;

    switch (type) {
      case 'integer':
        if (format === 'int64') return 'bigint';
        return 'integer';
      case 'number':
        if (format === 'float') return 'real';
        if (format === 'double') return 'double precision';
        return 'numeric';
      case 'string':
        if (format === 'date-time') return 'timestamp with time zone';
        if (format === 'date') return 'date';
        if (format === 'time') return 'time';
        if (format === 'uuid') return 'uuid';
        if (maxLength) return `varchar(${maxLength})`;
        return 'text';
      case 'boolean':
        return 'boolean';
      case 'array':
        return 'jsonb';
      case 'object':
        return 'jsonb';
      default:
        return 'text';
    }
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