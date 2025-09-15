import { z } from 'zod';
import { databaseManager } from '../database.js';
import { configManager } from '../config.js';

export const explainQuerySchema = z.object({
  sql: z.string().describe('SQL query to explain'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const checkTableStatusSchema = z.object({
  table: z.string().describe('Table name to check status for'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const optimizeTableSchema = z.object({
  table: z.string().describe('Table name to optimize'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
  confirmOptimization: z.boolean().default(false).describe('Confirmation flag for optimization (must be true)'),
});

export const backupTableStructureSchema = z.object({
  table: z.string().describe('Table name to backup structure for'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const testConnectionSchema = z.object({
  connection: z.string().optional().describe('Specific connection to test (optional, tests all if not specified)'),
});

export const showConnectionsSchema = z.object({
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const getDatabaseSizeSchema = z.object({
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

function formatResults(results: any[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  const headers = Object.keys(results[0]);
  const maxLengths = headers.map(header => {
    const values = results.map(row => String(row[header] || ''));
    return Math.max(header.length, ...values.map(v => v.length));
  });

  const headerRow = headers.map((header, i) => header.padEnd(maxLengths[i] || 0)).join(' | ');
  const separator = maxLengths.map(length => '-'.repeat(length || 0)).join(' | ');

  const dataRows = results.map(row =>
    headers.map((header, i) => String(row[header] || '').padEnd(maxLengths[i] || 0)).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

export async function explainQuery(args: z.infer<typeof explainQuerySchema>) {
  try {
    const explainSql = `EXPLAIN ${args.sql}`;
    const result = await databaseManager.query(explainSql, [], args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Query Execution Plan:\n\nOriginal Query: ${args.sql}\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error explaining query: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function checkTableStatus(args: z.infer<typeof checkTableStatusSchema>) {
  try {
    let sql = `SHOW TABLE STATUS LIKE '${args.table}'`;

    const result = await databaseManager.query(sql, [], args.connection);

    if (result.results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Table ${args.table} not found`,
          },
        ],
      };
    }

    const status = result.results[0];
    const info = {
      name: status.Name,
      engine: status.Engine,
      rows: status.Rows,
      avg_row_length: status.Avg_row_length,
      data_length: status.Data_length,
      index_length: status.Index_length,
      data_free: status.Data_free,
      auto_increment: status.Auto_increment,
      create_time: status.Create_time,
      update_time: status.Update_time,
      collation: status.Collation,
    };

    const formattedInfo = Object.entries(info)
      .map(([key, value]) => `${key}: ${value || 'N/A'}`)
      .join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `Table Status for ${args.table}:\n\n${formattedInfo}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error checking table status: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function optimizeTable(args: z.infer<typeof optimizeTableSchema>) {
  try {
    if (configManager.isReadOnlyMode()) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Table optimization is not allowed in read-only mode`,
          },
        ],
      };
    }

    if (!args.confirmOptimization) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Optimization not confirmed. Please set confirmOptimization to true to proceed with optimizing table ${args.table}. Note: This operation may lock the table temporarily.`,
          },
        ],
      };
    }

    let sql = `OPTIMIZE TABLE \`${args.table}\``;
    if (args.database) {
      sql = `OPTIMIZE TABLE \`${args.database}\`.\`${args.table}\``;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Table Optimization Results for ${args.table}:\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error optimizing table: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function backupTableStructure(args: z.infer<typeof backupTableStructureSchema>) {
  try {
    let sql = `SHOW CREATE TABLE \`${args.table}\``;
    if (args.database) {
      sql = `SHOW CREATE TABLE \`${args.database}\`.\`${args.table}\``;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    if (result.results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Table ${args.table} not found`,
          },
        ],
      };
    }

    const createStatement = result.results[0]['Create Table'];

    return {
      content: [
        {
          type: "text" as const,
          text: `Table Structure Backup for ${args.table}:\n\n\`\`\`sql\n${createStatement}\n\`\`\``,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error backing up table structure: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function testConnection(args: z.infer<typeof testConnectionSchema>) {
  try {
    if (args.connection) {
      const isConnected = await databaseManager.testConnection(args.connection);
      return {
        content: [
          {
            type: "text" as const,
            text: `Connection test for ${args.connection}: ${isConnected ? '✅ SUCCESS' : '❌ FAILED'}`,
          },
        ],
      };
    } else {
      const results = await databaseManager.testAllConnections();
      const output = Object.entries(results)
        .map(([dbId, success]) => `${dbId}: ${success ? '✅ SUCCESS' : '❌ FAILED'}`)
        .join('\n');

      return {
        content: [
          {
            type: "text" as const,
            text: `Connection Test Results:\n\n${output}`,
          },
        ],
      };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error testing connection: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function showConnections(args: z.infer<typeof showConnectionsSchema>) {
  try {
    const availableDatabases = configManager.getDatabaseList();
    const currentDatabase = await databaseManager.getCurrentDatabase();

    let output = `Available Database Connections:\n\n`;

    for (const dbId of availableDatabases) {
      const config = configManager.getDatabaseConfig(dbId);
      const isCurrentt = dbId === currentDatabase;

      output += `${isCurrentt ? '➤' : '•'} ${dbId}:\n`;
      output += `  Host: ${config.host}:${config.port}\n`;
      output += `  Database: ${config.database || 'default'}\n`;
      output += `  User: ${config.user}\n`;
      output += `  Connection Limit: ${config.connectionLimit}\n`;

      if (isCurrentt) {
        output += `  [CURRENT]\n`;
      }
      output += '\n';
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
          text: `Error showing connections: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getDatabaseSize(args: z.infer<typeof getDatabaseSizeSchema>) {
  try {
    let sql = `
      SELECT
        table_schema AS 'Database',
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size_MB',
        ROUND(SUM(data_length) / 1024 / 1024, 2) AS 'Data_MB',
        ROUND(SUM(index_length) / 1024 / 1024, 2) AS 'Index_MB',
        COUNT(*) AS 'Tables'
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      GROUP BY table_schema
    `;

    if (args.database) {
      sql = sql.replace(/DATABASE\(\)/g, `'${args.database}'`);
    }

    const result = await databaseManager.query(sql, [], args.connection);

    if (result.results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No size information found for the database`,
          },
        ],
      };
    }

    const sizeInfo = result.results[0];

    return {
      content: [
        {
          type: "text" as const,
          text: `Database Size Information:\n\nDatabase: ${sizeInfo.Database}\nTotal Size: ${sizeInfo.Size_MB} MB\nData Size: ${sizeInfo.Data_MB} MB\nIndex Size: ${sizeInfo.Index_MB} MB\nNumber of Tables: ${sizeInfo.Tables}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting database size: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}