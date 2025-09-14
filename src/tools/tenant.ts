import { z } from 'zod';
import { databaseManager } from '../database.js';

export const listTenantsSchema = z.object({
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const switchTenantContextSchema = z.object({
  tenantId: z.string().describe('Tenant database name to switch to'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const getTenantSchemaSchema = z.object({
  tenantId: z.string().describe('Tenant database name to get schema for'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const compareTenantDataSchema = z.object({
  table: z.string().describe('Table name to compare across tenants'),
  tenantIds: z.array(z.string()).describe('Array of tenant database names to compare'),
  comparison: z.enum(['count', 'schema', 'sample']).default('count').describe('Type of comparison to perform'),
  sampleSize: z.number().default(5).describe('Number of sample records to show (for sample comparison)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const getTenantTablesSchema = z.object({
  tenantId: z.string().describe('Tenant database name to get tables for'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

let currentTenant: string | null = null;

export async function listTenants(args: z.infer<typeof listTenantsSchema>) {
  try {
    // List all databases which represent tenants
    const databases = await databaseManager.getDatabases(args.connection);

    // Filter out system databases
    const tenants = databases.filter(db =>
      !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(db.toLowerCase())
    ).sort();

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${tenants.length} tenants (databases):\n${tenants.map(tenant => `• ${tenant}`).join('\n')}\n\nCurrent tenant context: ${currentTenant || 'none'}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error listing tenants: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function switchTenantContext(args: z.infer<typeof switchTenantContextSchema>) {
  try {
    // Verify the tenant database exists
    const databases = await databaseManager.getDatabases(args.connection);
    if (!databases.includes(args.tenantId)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Tenant database '${args.tenantId}' not found. Available tenants: ${databases.join(', ')}`,
          },
        ],
      };
    }

    currentTenant = args.tenantId;

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Switched tenant context to database: ${args.tenantId}\n\nSubsequent tenant-aware operations will use this database.`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error switching tenant context: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getTenantSchema(args: z.infer<typeof getTenantSchemaSchema>) {
  try {
    // Get tables from the tenant database
    const tables = await databaseManager.getTables(args.tenantId, args.connection);
    const tenantTables = [];

    for (const table of tables) {
      try {
        const schema = await databaseManager.getTableSchema(table, args.tenantId, args.connection);

        // Count records in this table
        let sql = `SELECT COUNT(*) as count FROM \`${args.tenantId}\`.\`${table}\``;
        const result = await databaseManager.query(sql, [], args.connection);
        const count = result.results[0]?.count || 0;

        tenantTables.push({
          table,
          columns: schema.length,
          records: count,
          columnDetails: schema.map(col => `${col.Field} (${col.Type})`),
        });
      } catch (error) {
        console.error(`Error checking table ${table}:`, error);
      }
    }

    const summary = tenantTables.map(t =>
      `${t.table}: ${t.columns} columns, ${t.records} records`
    ).join('\n');

    const detailedSummary = tenantTables.map(t =>
      `\n=== ${t.table} ===\n${t.columnDetails.join('\n')}\nRecords: ${t.records}`
    ).join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `Schema summary for tenant database '${args.tenantId}':\n\n${summary}\n\nDetailed Schema:${detailedSummary}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting tenant schema: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function compareTenantData(args: z.infer<typeof compareTenantDataSchema>) {
  try {
    const comparisons = [];

    for (const tenantId of args.tenantIds) {
      let result;

      if (args.comparison === 'count') {
        let sql = `SELECT COUNT(*) as count FROM \`${tenantId}\`.\`${args.table}\``;

        result = await databaseManager.query(sql, [], args.connection);
        comparisons.push({
          tenant: tenantId,
          count: result.results[0]?.count || 0,
        });

      } else if (args.comparison === 'schema') {
        try {
          const schema = await databaseManager.getTableSchema(args.table, tenantId, args.connection);
          comparisons.push({
            tenant: tenantId,
            schema: schema.map(col => `${col.Field}: ${col.Type}`),
            columnCount: schema.length,
          });
        } catch (error) {
          comparisons.push({
            tenant: tenantId,
            error: `Table '${args.table}' not found in tenant '${tenantId}'`,
          });
        }

      } else if (args.comparison === 'sample') {
        let sql = `SELECT * FROM \`${tenantId}\`.\`${args.table}\` LIMIT ?`;

        result = await databaseManager.query(sql, [args.sampleSize], args.connection);
        comparisons.push({
          tenant: tenantId,
          sampleRecords: result.results.length,
          data: result.results,
        });
      }
    }

    let output = `Tenant Data Comparison for table '${args.table}' across tenants:\n\n`;

    if (args.comparison === 'count') {
      comparisons.forEach(comp => {
        output += `Tenant '${comp.tenant}': ${comp.count} records\n`;
      });
    } else if (args.comparison === 'schema') {
      comparisons.forEach(comp => {
        if (comp.error) {
          output += `\n--- Tenant '${comp.tenant}' ---\n❌ ${comp.error}\n`;
        } else {
          output += `\n--- Tenant '${comp.tenant}' (${comp.columnCount} columns) ---\n`;
          output += (comp.schema || []).join('\n') + '\n';
        }
      });
    } else if (args.comparison === 'sample') {
      comparisons.forEach(comp => {
        output += `\n--- Tenant '${comp.tenant}' (${comp.sampleRecords} sample records) ---\n`;
        if (comp.data && comp.data.length > 0) {
          const headers = Object.keys(comp.data[0]);
          output += `${headers.join(' | ')}\n`;
          output += `${headers.map(() => '---').join(' | ')}\n`;
          comp.data.forEach(row => {
            output += `${headers.map(h => row[h] || '').join(' | ')}\n`;
          });
        } else {
          output += 'No data found\n';
        }
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: output,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error comparing tenant data: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getTenantTables(args: z.infer<typeof getTenantTablesSchema>) {
  try {
    // Get all tables from the tenant database
    const allTables = await databaseManager.getTables(args.tenantId, args.connection);
    const tenantTables = [];

    for (const table of allTables) {
      try {
        let sql = `SELECT COUNT(*) as count FROM \`${args.tenantId}\`.\`${table}\``;
        const result = await databaseManager.query(sql, [], args.connection);
        const count = result.results[0]?.count || 0;

        tenantTables.push({
          table,
          recordCount: count,
        });
      } catch (error) {
        console.error(`Error getting count for table ${table}:`, error);
        tenantTables.push({
          table,
          recordCount: 'Error',
        });
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Tables in tenant database '${args.tenantId}':\n\n${tenantTables.map(t => `• ${t.table}: ${t.recordCount} records`).join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting tenant tables: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export function getCurrentTenant(): string | null {
  return currentTenant;
}