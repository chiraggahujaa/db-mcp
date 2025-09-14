import { z } from 'zod';
import { databaseManager } from '../database.js';

export const joinTablesSchema = z.object({
  leftTable: z.string().describe('Left table name'),
  rightTable: z.string().describe('Right table name'),
  joinType: z.enum(['INNER', 'LEFT', 'RIGHT', 'FULL']).default('INNER').describe('Type of join'),
  joinCondition: z.string().describe('Join condition (e.g., "users.id = orders.user_id")'),
  columns: z.array(z.string()).optional().describe('Specific columns to select (optional)'),
  where: z.string().optional().describe('WHERE clause (without WHERE keyword)'),
  limit: z.number().optional().describe('LIMIT clause'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const findOrphanedRecordsSchema = z.object({
  table: z.string().describe('Table to check for orphaned records'),
  foreignKeyColumn: z.string().describe('Foreign key column name'),
  referencedTable: z.string().describe('Referenced table name'),
  referencedColumn: z.string().describe('Referenced column name'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const validateReferentialIntegritySchema = z.object({
  table: z.string().optional().describe('Specific table to validate (optional, validates all if not specified)'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const analyzeTableRelationshipsSchema = z.object({
  table: z.string().optional().describe('Specific table to analyze (optional, analyzes all if not specified)'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const getColumnStatisticsSchema = z.object({
  table: z.string().describe('Table name to analyze'),
  column: z.string().describe('Column name to get statistics for'),
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

export async function joinTables(args: z.infer<typeof joinTablesSchema>) {
  try {
    const columns = args.columns?.join(', ') || '*';

    let leftTable = `\`${args.leftTable}\``;
    let rightTable = `\`${args.rightTable}\``;

    if (args.database) {
      leftTable = `\`${args.database}\`.\`${args.leftTable}\``;
      rightTable = `\`${args.database}\`.\`${args.rightTable}\``;
    }

    let sql = `SELECT ${columns} FROM ${leftTable} ${args.joinType} JOIN ${rightTable} ON ${args.joinCondition}`;

    if (args.where) {
      sql += ` WHERE ${args.where}`;
    }

    if (args.limit) {
      sql += ` LIMIT ${args.limit}`;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Join Query Results (${result.results.length} rows):\n\nSQL: ${sql}\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error executing join query: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function findOrphanedRecords(args: z.infer<typeof findOrphanedRecordsSchema>) {
  try {
    let sql = `
      SELECT t1.*
      FROM \`${args.table}\` t1
      LEFT JOIN \`${args.referencedTable}\` t2 ON t1.\`${args.foreignKeyColumn}\` = t2.\`${args.referencedColumn}\`
      WHERE t2.\`${args.referencedColumn}\` IS NULL
        AND t1.\`${args.foreignKeyColumn}\` IS NOT NULL
    `;

    if (args.database) {
      sql = `
        SELECT t1.*
        FROM \`${args.database}\`.\`${args.table}\` t1
        LEFT JOIN \`${args.database}\`.\`${args.referencedTable}\` t2 ON t1.\`${args.foreignKeyColumn}\` = t2.\`${args.referencedColumn}\`
        WHERE t2.\`${args.referencedColumn}\` IS NULL
          AND t1.\`${args.foreignKeyColumn}\` IS NOT NULL
      `;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Orphaned Records in ${args.table} (${result.results.length} found):\nForeign key column: ${args.foreignKeyColumn} -> ${args.referencedTable}.${args.referencedColumn}\n\n${formatResults(result.results)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error finding orphaned records: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function validateReferentialIntegrity(args: z.infer<typeof validateReferentialIntegritySchema>) {
  try {
    let sql = `
      SELECT
        kcu.TABLE_NAME,
        kcu.COLUMN_NAME,
        kcu.CONSTRAINT_NAME,
        kcu.REFERENCED_TABLE_NAME,
        kcu.REFERENCED_COLUMN_NAME,
        COUNT(orphans.orphan_count) as violation_count
      FROM information_schema.KEY_COLUMN_USAGE kcu
      LEFT JOIN (
        SELECT
          kcu2.TABLE_NAME,
          kcu2.COLUMN_NAME,
          COUNT(*) as orphan_count
        FROM information_schema.KEY_COLUMN_USAGE kcu2
        WHERE kcu2.REFERENCED_TABLE_SCHEMA = DATABASE()
          AND kcu2.REFERENCED_TABLE_NAME IS NOT NULL
        GROUP BY kcu2.TABLE_NAME, kcu2.COLUMN_NAME
      ) orphans ON kcu.TABLE_NAME = orphans.TABLE_NAME AND kcu.COLUMN_NAME = orphans.COLUMN_NAME
      WHERE kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    `;

    if (args.table) {
      sql += ` AND kcu.TABLE_NAME = '${args.table}'`;
    }

    if (args.database) {
      sql = sql.replace(/DATABASE\(\)/g, `'${args.database}'`);
    }

    sql += ' GROUP BY kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.CONSTRAINT_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME';

    const result = await databaseManager.query(sql, [], args.connection);

    const violations = [];
    for (const row of result.results) {
      let checkSql = `
        SELECT COUNT(*) as violation_count
        FROM \`${row.TABLE_NAME}\` t1
        LEFT JOIN \`${row.REFERENCED_TABLE_NAME}\` t2 ON t1.\`${row.COLUMN_NAME}\` = t2.\`${row.REFERENCED_COLUMN_NAME}\`
        WHERE t2.\`${row.REFERENCED_COLUMN_NAME}\` IS NULL
          AND t1.\`${row.COLUMN_NAME}\` IS NOT NULL
      `;

      if (args.database) {
        checkSql = `
          SELECT COUNT(*) as violation_count
          FROM \`${args.database}\`.\`${row.TABLE_NAME}\` t1
          LEFT JOIN \`${args.database}\`.\`${row.REFERENCED_TABLE_NAME}\` t2 ON t1.\`${row.COLUMN_NAME}\` = t2.\`${row.REFERENCED_COLUMN_NAME}\`
          WHERE t2.\`${row.REFERENCED_COLUMN_NAME}\` IS NULL
            AND t1.\`${row.COLUMN_NAME}\` IS NOT NULL
        `;
      }

      const checkResult = await databaseManager.query(checkSql, [], args.connection);
      const violationCount = checkResult.results[0]?.violation_count || 0;

      if (violationCount > 0) {
        violations.push({
          ...row,
          violation_count: violationCount,
        });
      }
    }

    if (violations.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Referential integrity check passed. No violations found.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `❌ Referential Integrity Violations Found (${violations.length}):\n\n${formatResults(violations)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error validating referential integrity: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function analyzeTableRelationships(args: z.infer<typeof analyzeTableRelationshipsSchema>) {
  try {
    let sql = `
      SELECT
        kcu.TABLE_NAME,
        kcu.COLUMN_NAME,
        kcu.CONSTRAINT_NAME,
        kcu.REFERENCED_TABLE_NAME,
        kcu.REFERENCED_COLUMN_NAME,
        rc.UPDATE_RULE,
        rc.DELETE_RULE
      FROM information_schema.KEY_COLUMN_USAGE kcu
      LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
      WHERE kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    `;

    if (args.table) {
      sql += ` AND (kcu.TABLE_NAME = '${args.table}' OR kcu.REFERENCED_TABLE_NAME = '${args.table}')`;
    }

    if (args.database) {
      sql = sql.replace(/DATABASE\(\)/g, `'${args.database}'`);
    }

    sql += ' ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME';

    const result = await databaseManager.query(sql, [], args.connection);

    if (result.results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: args.table
              ? `No foreign key relationships found for table ${args.table}`
              : `No foreign key relationships found in the database`,
          },
        ],
      };
    }

    const relationships = result.results.map(row => ({
      from: `${row.TABLE_NAME}.${row.COLUMN_NAME}`,
      to: `${row.REFERENCED_TABLE_NAME}.${row.REFERENCED_COLUMN_NAME}`,
      constraint: row.CONSTRAINT_NAME,
      on_update: row.UPDATE_RULE || 'RESTRICT',
      on_delete: row.DELETE_RULE || 'RESTRICT',
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: `Table Relationships Analysis:\n\n${formatResults(relationships)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error analyzing table relationships: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getColumnStatistics(args: z.infer<typeof getColumnStatisticsSchema>) {
  try {
    let baseTable = `\`${args.table}\``;
    if (args.database) {
      baseTable = `\`${args.database}\`.\`${args.table}\``;
    }

    const queries = [
      `SELECT COUNT(*) as total_rows FROM ${baseTable}`,
      `SELECT COUNT(\`${args.column}\`) as non_null_count FROM ${baseTable}`,
      `SELECT COUNT(DISTINCT \`${args.column}\`) as distinct_count FROM ${baseTable}`,
      `SELECT MIN(\`${args.column}\`) as min_value, MAX(\`${args.column}\`) as max_value FROM ${baseTable}`,
    ];

    const results = await Promise.all(
      queries.map(query => databaseManager.query(query, [], args.connection))
    );

    const totalRows = results[0]?.results[0]?.total_rows || 0;
    const nonNullCount = results[1]?.results[0]?.non_null_count || 0;
    const distinctCount = results[2]?.results[0]?.distinct_count || 0;
    const minValue = results[3]?.results[0]?.min_value;
    const maxValue = results[3]?.results[0]?.max_value;

    const nullCount = totalRows - nonNullCount;
    const nullPercentage = totalRows > 0 ? ((nullCount / totalRows) * 100).toFixed(2) : '0';
    const uniquenessPercentage = nonNullCount > 0 ? ((distinctCount / nonNullCount) * 100).toFixed(2) : '0';

    const statistics = {
      column: args.column,
      table: args.table,
      total_rows: totalRows,
      non_null_count: nonNullCount,
      null_count: nullCount,
      null_percentage: `${nullPercentage}%`,
      distinct_count: distinctCount,
      uniqueness_percentage: `${uniquenessPercentage}%`,
      min_value: minValue,
      max_value: maxValue,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: `Column Statistics for ${args.table}.${args.column}:\n\n${Object.entries(statistics).map(([key, value]) => `${key}: ${value}`).join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error getting column statistics: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}