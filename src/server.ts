import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { configManager } from './config.js';
import { databaseManager, getDatabaseManager } from './database.js';

// Schema tools
import {
  listDatabasesSchema, listTablesSchema, describeTableSchema, showIndexesSchema,
  analyzeForeignKeysSchema, getTableDependenciesSchema,
  listDatabases, listTables, describeTable, showIndexes,
  analyzeForeignKeys, getTableDependencies
} from './tools/schema.js';

// Query tools
import {
  selectDataSchema, countRecordsSchema, findByIdSchema, searchRecordsSchema,
  getRecentRecordsSchema, executeCustomQuerySchema,
  selectData, countRecords, findById, searchRecords,
  getRecentRecords, executeCustomQuery
} from './tools/query.js';

// Modification tools
import {
  insertRecordSchema, updateRecordSchema, deleteRecordSchema, bulkInsertSchema,
  insertRecord, updateRecord, deleteRecord, bulkInsert
} from './tools/modify.js';

// Analysis tools
import {
  joinTablesSchema, findOrphanedRecordsSchema, validateReferentialIntegritySchema,
  analyzeTableRelationshipsSchema, getColumnStatisticsSchema,
  joinTables, findOrphanedRecords, validateReferentialIntegrity,
  analyzeTableRelationships, getColumnStatistics
} from './tools/analysis.js';

// Tenant tools
import {
  listTenantsSchema, switchTenantContextSchema, getTenantSchemaSchema,
  compareTenantDataSchema, getTenantTablesSchema,
  listTenants, switchTenantContext, getTenantSchema,
  compareTenantData, getTenantTables
} from './tools/tenant.js';

// Utility tools
import {
  explainQuerySchema, checkTableStatusSchema, optimizeTableSchema,
  backupTableStructureSchema, testConnectionSchema, showConnectionsSchema,
  getDatabaseSizeSchema,
  explainQuery, checkTableStatus, optimizeTable,
  backupTableStructure, testConnection, showConnections,
  getDatabaseSize
} from './tools/utility.js';

// Environment tools
import {
  switchEnvironmentSchema, listEnvironmentsSchema, getCurrentEnvironmentSchema,
  testEnvironmentSchema,
  switchEnvironment, listEnvironments, getCurrentEnvironment,
  testEnvironment
} from './tools/environment.js';

// Security tools
import {
  getSecurityReportSchema, getSecurityMetricsSchema, getSecurityEventsSchema,
  getSecurityReport, getSecurityMetrics, getSecurityEvents
} from './tools/security.js';

class MySQLMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'multi-database-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Schema & Structure Tools
          {
            name: 'list_databases',
            description: 'List all available databases',
            inputSchema: listDatabasesSchema,
          },
          {
            name: 'list_tables',
            description: 'List tables in a database',
            inputSchema: listTablesSchema,
          },
          {
            name: 'describe_table',
            description: 'Get detailed table schema information',
            inputSchema: describeTableSchema,
          },
          {
            name: 'show_indexes',
            description: 'Show indexes for a table',
            inputSchema: showIndexesSchema,
          },
          {
            name: 'analyze_foreign_keys',
            description: 'Analyze foreign key relationships',
            inputSchema: analyzeForeignKeysSchema,
          },
          {
            name: 'get_table_dependencies',
            description: 'Get table dependency information',
            inputSchema: getTableDependenciesSchema,
          },

          // Data Query Tools
          {
            name: 'select_data',
            description: 'Execute SELECT queries with advanced filtering',
            inputSchema: selectDataSchema,
          },
          {
            name: 'count_records',
            description: 'Count records in a table with optional conditions',
            inputSchema: countRecordsSchema,
          },
          {
            name: 'find_by_id',
            description: 'Find records by ID or primary key',
            inputSchema: findByIdSchema,
          },
          {
            name: 'search_records',
            description: 'Full-text search across table columns',
            inputSchema: searchRecordsSchema,
          },
          {
            name: 'get_recent_records',
            description: 'Get recently created or modified records',
            inputSchema: getRecentRecordsSchema,
          },
          {
            name: 'execute_custom_query',
            description: 'Execute custom SQL queries (SELECT, UPDATE, INSERT, DELETE) safely',
            inputSchema: executeCustomQuerySchema,
          },

          // Data Modification Tools
          {
            name: 'insert_record',
            description: 'Insert a single record into a table',
            inputSchema: insertRecordSchema,
          },
          {
            name: 'update_record',
            description: 'Update records in a table with WHERE conditions',
            inputSchema: updateRecordSchema,
          },
          {
            name: 'delete_record',
            description: 'Delete records from a table with safety checks',
            inputSchema: deleteRecordSchema,
          },
          {
            name: 'bulk_insert',
            description: 'Insert multiple records efficiently',
            inputSchema: bulkInsertSchema,
          },

          // Analysis & Relationship Tools
          {
            name: 'join_tables',
            description: 'Execute JOIN queries across related tables',
            inputSchema: joinTablesSchema,
          },
          {
            name: 'find_orphaned_records',
            description: 'Find records without valid foreign key references',
            inputSchema: findOrphanedRecordsSchema,
          },
          {
            name: 'validate_referential_integrity',
            description: 'Check for foreign key constraint violations',
            inputSchema: validateReferentialIntegritySchema,
          },
          {
            name: 'analyze_table_relationships',
            description: 'Analyze and map table relationships',
            inputSchema: analyzeTableRelationshipsSchema,
          },
          {
            name: 'get_column_statistics',
            description: 'Get statistical information about table columns',
            inputSchema: getColumnStatisticsSchema,
          },

          // Tenant Management Tools
          {
            name: 'list_tenants',
            description: 'List all tenant databases available on the connection',
            inputSchema: listTenantsSchema,
          },
          {
            name: 'switch_tenant_context',
            description: 'Switch active tenant database context for operations',
            inputSchema: switchTenantContextSchema,
          },
          {
            name: 'get_tenant_schema',
            description: 'Get complete schema information for a specific tenant database',
            inputSchema: getTenantSchemaSchema,
          },
          {
            name: 'compare_tenant_data',
            description: 'Compare table data/schema across different tenant databases',
            inputSchema: compareTenantDataSchema,
          },
          {
            name: 'get_tenant_tables',
            description: 'Get all tables and record counts for a specific tenant database',
            inputSchema: getTenantTablesSchema,
          },

          // Utility & Maintenance Tools
          {
            name: 'explain_query',
            description: 'Get query execution plan and optimization info',
            inputSchema: explainQuerySchema,
          },
          {
            name: 'check_table_status',
            description: 'Get table status information (size, rows, engine, etc.)',
            inputSchema: checkTableStatusSchema,
          },
          {
            name: 'optimize_table',
            description: 'Optimize table for better performance',
            inputSchema: optimizeTableSchema,
          },
          {
            name: 'backup_table_structure',
            description: 'Export table DDL/CREATE statement',
            inputSchema: backupTableStructureSchema,
          },
          {
            name: 'test_connection',
            description: 'Test database connection health',
            inputSchema: testConnectionSchema,
          },
          {
            name: 'show_connections',
            description: 'Show available database connections and their status',
            inputSchema: showConnectionsSchema,
          },
          {
            name: 'get_database_size',
            description: 'Get database size and storage information',
            inputSchema: getDatabaseSizeSchema,
          },
          {
            name: 'switch_environment',
            description: 'Switch active database environment (local, staging, prod, etc.)',
            inputSchema: switchEnvironmentSchema,
          },
          {
            name: 'list_environments',
            description: 'List all available database environments with connection status',
            inputSchema: listEnvironmentsSchema,
          },
          {
            name: 'get_current_environment',
            description: 'Get details about the currently active environment',
            inputSchema: getCurrentEnvironmentSchema,
          },
          {
            name: 'test_environment',
            description: 'Test connection to a specific environment',
            inputSchema: testEnvironmentSchema,
          },

          // Security Tools
          {
            name: 'get_security_report',
            description: 'Get comprehensive security report with metrics and recent events',
            inputSchema: getSecurityReportSchema,
          },
          {
            name: 'get_security_metrics',
            description: 'Get security metrics for a specific database or global metrics',
            inputSchema: getSecurityMetricsSchema,
          },
          {
            name: 'get_security_events',
            description: 'Get recent security events with filtering options',
            inputSchema: getSecurityEventsSchema,
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Schema & Structure Tools
          case 'list_databases':
            return await listDatabases(args as any);
          case 'list_tables':
            return await listTables(args as any);
          case 'describe_table':
            return await describeTable(args as any);
          case 'show_indexes':
            return await showIndexes(args as any);
          case 'analyze_foreign_keys':
            return await analyzeForeignKeys(args as any);
          case 'get_table_dependencies':
            return await getTableDependencies(args as any);

          // Data Query Tools
          case 'select_data':
            return await selectData(args as any);
          case 'count_records':
            return await countRecords(args as any);
          case 'find_by_id':
            return await findById(args as any);
          case 'search_records':
            return await searchRecords(args as any);
          case 'get_recent_records':
            return await getRecentRecords(args as any);
          case 'execute_custom_query':
            return await executeCustomQuery(args as any);

          // Data Modification Tools
          case 'insert_record':
            return await insertRecord(args as any);
          case 'update_record':
            return await updateRecord(args as any);
          case 'delete_record':
            return await deleteRecord(args as any);
          case 'bulk_insert':
            return await bulkInsert(args as any);

          // Analysis & Relationship Tools
          case 'join_tables':
            return await joinTables(args as any);
          case 'find_orphaned_records':
            return await findOrphanedRecords(args as any);
          case 'validate_referential_integrity':
            return await validateReferentialIntegrity(args as any);
          case 'analyze_table_relationships':
            return await analyzeTableRelationships(args as any);
          case 'get_column_statistics':
            return await getColumnStatistics(args as any);

          // Tenant Management Tools
          case 'list_tenants':
            return await listTenants(args as any);
          case 'switch_tenant_context':
            return await switchTenantContext(args as any);
          case 'get_tenant_schema':
            return await getTenantSchema(args as any);
          case 'compare_tenant_data':
            return await compareTenantData(args as any);
          case 'get_tenant_tables':
            return await getTenantTables(args as any);

          // Utility & Maintenance Tools
          case 'explain_query':
            return await explainQuery(args as any);
          case 'check_table_status':
            return await checkTableStatus(args as any);
          case 'optimize_table':
            return await optimizeTable(args as any);
          case 'backup_table_structure':
            return await backupTableStructure(args as any);
          case 'test_connection':
            return await testConnection(args as any);
          case 'show_connections':
            return await showConnections(args as any);
          case 'get_database_size':
            return await getDatabaseSize(args as any);

          // Environment Management Tools
          case 'switch_environment':
            return await switchEnvironment(args as any);
          case 'list_environments':
            return await listEnvironments(args as any);
          case 'get_current_environment':
            return await getCurrentEnvironment(args as any);
          case 'test_environment':
            return await testEnvironment(args as any);

          // Security Tools
          case 'get_security_report':
            return await getSecurityReport(args as any);
          case 'get_security_metrics':
            return await getSecurityMetrics(args as any);
          case 'get_security_events':
            return await getSecurityEvents(args as any);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const databases = configManager.getDatabaseList();
        const manager = await getDatabaseManager();
        const connectionStatuses = manager.getConnectionStatus();

        return {
          resources: [
            {
              uri: 'database://connections',
              mimeType: 'application/json',
              name: 'Database Connections',
              description: 'List of all configured database connections with status',
            },
            {
              uri: 'database://configuration',
              mimeType: 'application/json',
              name: 'Database Configuration',
              description: 'Current database configuration and security settings',
            },
            {
              uri: 'database://foreign-keys',
              mimeType: 'application/json',
              name: 'Foreign Key Map',
              description: 'Complete foreign key relationship mapping (SQL databases)',
            },
            ...databases.map(db => {
              const status = connectionStatuses.find(s => s.id === db);
              return {
                uri: `database://schema/${db}`,
                mimeType: 'application/json',
                name: `${db} Schema (${status?.type || 'unknown'})`,
                description: `Complete schema information for ${db} database`,
              };
            }),
          ],
        };
      } catch (error) {
        return {
          resources: [],
        };
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        if (uri === 'database://connections') {
          const manager = await getDatabaseManager();
          const connectionStatuses = manager.getConnectionStatus();
          const currentDb = manager.getCurrentDatabase();

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  connections: connectionStatuses,
                  currentDatabase: currentDb,
                  totalConnections: connectionStatuses.length,
                  connectedCount: connectionStatuses.filter(c => c.isConnected).length,
                }, null, 2),
              },
            ],
          };
        }

        if (uri === 'database://configuration') {
          const config = configManager.getConfig();
          const securityConfig = configManager.getSecurityConfig();

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  defaultDatabase: config.defaultDatabase,
                  security: securityConfig,
                  databaseCount: Object.keys(config.databases).length,
                  supportedTypes: ['mysql', 'postgresql', 'sqlite', 'supabase', 'planetscale', 'mongodb'],
                }, null, 2),
              },
            ],
          };
        }

        if (uri === 'database://foreign-keys') {
          const manager = await getDatabaseManager();
          const currentDb = manager.getCurrentDatabase();
          const connection = manager.getConnection(currentDb);

          // Only attempt foreign key query for SQL databases
          if (['mysql', 'postgresql', 'planetscale'].includes(connection.type)) {
            const fkQuery = `
              SELECT
                TABLE_NAME,
                COLUMN_NAME,
                CONSTRAINT_NAME,
                REFERENCED_TABLE_NAME,
                REFERENCED_COLUMN_NAME
              FROM information_schema.KEY_COLUMN_USAGE
              WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
                AND REFERENCED_TABLE_NAME IS NOT NULL
              ORDER BY TABLE_NAME, COLUMN_NAME
            `;

            const result = await manager.query(fkQuery);

            return {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify({
                    database: currentDb,
                    type: connection.type,
                    foreignKeys: result.results,
                    totalRelationships: result.results.length,
                  }, null, 2),
                },
              ],
            };
          } else {
            return {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify({
                    database: currentDb,
                    type: connection.type,
                    message: 'Foreign key relationships are not supported for this database type',
                  }, null, 2),
                },
              ],
            };
          }
        }

        if (uri.startsWith('database://schema/')) {
          const dbName = uri.replace('database://schema/', '');
          configManager.validateDatabaseExists(dbName);

          const manager = await getDatabaseManager();
          const connection = manager.getConnection(dbName);
          const tables = await manager.listTables(undefined, dbName);
          const schema: Record<string, any> = {};

          for (const table of tables) {
            try {
              const tableSchema = await manager.getTableSchema(table, undefined, dbName);
              schema[table] = tableSchema;
            } catch (error) {
              console.error(`Error getting schema for ${table}:`, error);
            }
          }

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  database: dbName,
                  type: connection.type,
                  isConnected: connection.isConnected,
                  tables: Object.keys(schema),
                  schema,
                  tableCount: tables.length,
                }, null, 2),
              },
            ],
          };
        }

        throw new Error(`Unknown resource: ${uri}`);
      } catch (error) {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  async run() {
    // Initialize database manager before starting server
    try {
      await getDatabaseManager();
      console.error('✅ Database manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize database manager:', error);
      throw error;
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('✅ Multi-Database MCP Server running on stdio');
  }
}

if (import.meta.main) {
  const server = new MySQLMCPServer();
  server.run().catch(console.error);
}

export { MySQLMCPServer };