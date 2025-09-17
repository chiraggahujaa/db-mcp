import { z } from 'zod';
import { databaseManager } from '../database.js';
import { configManager } from '../config.js';

export const selectDataSchema = z.object({
  table: z.string().describe('Table name to select from'),
  columns: z.array(z.string()).optional().describe('Columns to select (optional, selects all if not specified)'),
  where: z.string().optional().describe('WHERE clause (without WHERE keyword)'),
  orderBy: z.string().optional().describe('ORDER BY clause (without ORDER BY keyword)'),
  limit: z.number().optional().describe('LIMIT clause'),
  offset: z.number().optional().describe('OFFSET clause'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const countRecordsSchema = z.object({
  table: z.string().describe('Table name to count records from'),
  where: z.string().optional().describe('WHERE clause for conditional counting (without WHERE keyword)'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const findByIdSchema = z.object({
  table: z.string().describe('Table name to search in'),
  id: z.union([z.string(), z.number()]).describe('ID value to search for'),
  idColumn: z.string().default('id').describe('ID column name (defaults to "id")'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const searchRecordsSchema = z.object({
  table: z.string().describe('Table name to search in'),
  searchTerm: z.string().describe('Term to search for'),
  columns: z.array(z.string()).optional().describe('Columns to search in (optional, searches all text columns if not specified)'),
  limit: z.number().default(100).describe('Maximum number of results to return'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const getRecentRecordsSchema = z.object({
  table: z.string().describe('Table name to get recent records from'),
  dateColumn: z.string().default('created_at').describe('Date column to sort by (defaults to "created_at")'),
  limit: z.number().default(50).describe('Number of recent records to retrieve'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const executeCustomQuerySchema = z.object({
  sql: z.string().describe('SQL query to execute (SELECT, UPDATE, INSERT, DELETE statements)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

function formatResults(results: any[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  if (results.length === 1 && typeof results[0] === 'object') {
    const obj = results[0];
    return Object.entries(obj)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
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

export async function selectData(args: z.infer<typeof selectDataSchema>) {
  try {
    const columns = args.columns?.join(', ') || '*';
    let sql = `SELECT ${columns} FROM \`${args.table}\``;

    if (args.database) {
      sql = `SELECT ${columns} FROM \`${args.database}\`.\`${args.table}\``;
    }

    if (args.where) {
      sql += ` WHERE ${args.where}`;
    }

    if (args.orderBy) {
      sql += ` ORDER BY ${args.orderBy}`;
    }

    if (args.limit) {
      sql += ` LIMIT ${args.limit}`;
    }

    if (args.offset) {
      sql += ` OFFSET ${args.offset}`;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Query: ${sql}\n\nResults (${result.results.length} rows):\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error executing select query: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function countRecords(args: z.infer<typeof countRecordsSchema>) {
  try {
    let sql = `SELECT COUNT(*) as count FROM \`${args.table}\``;

    if (args.database) {
      sql = `SELECT COUNT(*) as count FROM \`${args.database}\`.\`${args.table}\``;
    }

    if (args.where) {
      sql += ` WHERE ${args.where}`;
    }

    const result = await databaseManager.query(sql, [], args.connection);
    const count = result.results[0]?.count || 0;

    return {
      content: [
        {
          type: "text" as const,
          text: `Record count for ${args.table}: ${count}${args.where ? ` (with condition: ${args.where})` : ''}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error counting records: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function findById(args: z.infer<typeof findByIdSchema>) {
  try {
    let sql = `SELECT * FROM \`${args.table}\` WHERE \`${args.idColumn}\` = ?`;

    if (args.database) {
      sql = `SELECT * FROM \`${args.database}\`.\`${args.table}\` WHERE \`${args.idColumn}\` = ?`;
    }

    const result = await databaseManager.query(sql, [args.id], args.connection);

    if (result.results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No record found with ${args.idColumn} = ${args.id} in table ${args.table}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Record found in ${args.table}:\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error finding record by ID: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function searchRecords(args: z.infer<typeof searchRecordsSchema>) {
  try {
    let searchColumns: string[];

    if (args.columns && args.columns.length > 0) {
      searchColumns = args.columns;
    } else {
      const schema = await databaseManager.getTableSchema(args.table, args.database, args.connection);
      searchColumns = schema
        .filter(col => col.Type.includes('varchar') || col.Type.includes('text'))
        .map(col => col.Field);
    }

    if (searchColumns.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No searchable text columns found in table ${args.table}`,
          },
        ],
      };
    }

    const whereConditions = searchColumns.map(col => `\`${col}\` LIKE ?`).join(' OR ');
    const searchPattern = `%${args.searchTerm}%`;
    const params = new Array(searchColumns.length).fill(searchPattern);

    let sql = `SELECT * FROM \`${args.table}\` WHERE ${whereConditions} LIMIT ${args.limit}`;

    if (args.database) {
      sql = `SELECT * FROM \`${args.database}\`.\`${args.table}\` WHERE ${whereConditions} LIMIT ${args.limit}`;
    }

    const result = await databaseManager.query(sql, params, args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Search results for "${args.searchTerm}" in ${args.table} (${result.results.length} found):\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error searching records: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getRecentRecords(args: z.infer<typeof getRecentRecordsSchema>) {
  try {
    let sql = `SELECT * FROM \`${args.table}\` ORDER BY \`${args.dateColumn}\` DESC LIMIT ${args.limit}`;

    if (args.database) {
      sql = `SELECT * FROM \`${args.database}\`.\`${args.table}\` ORDER BY \`${args.dateColumn}\` DESC LIMIT ${args.limit}`;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Recent records from ${args.table} (${result.results.length} found):\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting recent records: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function executeCustomQuery(args: z.infer<typeof executeCustomQuerySchema>) {
  try {
    const upperSql = args.sql.trim().toUpperCase();
    const allowedStatements = ['SELECT', 'UPDATE', 'INSERT', 'DELETE'];
    const isAllowed = allowedStatements.some(stmt => upperSql.startsWith(stmt));

    if (!isAllowed) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Only SELECT, UPDATE, INSERT, and DELETE statements are allowed in custom queries.`,
          },
        ],
      };
    }

    // Check for read-only mode for modification statements
    if (['UPDATE', 'INSERT', 'DELETE'].some(stmt => upperSql.startsWith(stmt))) {
      if (configManager.isReadOnlyMode()) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Data modification is not allowed in read-only mode`,
            },
          ],
        };
      }

      if (!configManager.getSecurityConfig().allowDataModification) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Data modification is disabled in security configuration`,
            },
          ],
        };
      }
    }

    const result = await databaseManager.query(args.sql, [], args.connection);

    // Handle different types of results
    if (upperSql.startsWith('SELECT')) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Custom Query Results (${result.results.length} rows):\n\nSQL: ${args.sql}\n\n${formatResults(result.results)}`,
          },
        ],
      };
    } else {
      // For UPDATE, INSERT, DELETE queries
      return {
        content: [
          {
            type: "text" as const,
            text: `Query executed successfully:\n\nSQL: ${args.sql}\n\nAffected rows: ${result.affectedRows || 0}${result.insertId ? `\nInsert ID: ${result.insertId}` : ''}`,
          },
        ],
      };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error executing custom query: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}