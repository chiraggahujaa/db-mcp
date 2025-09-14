import { z } from 'zod';
import { databaseManager } from '../database.js';
import { configManager } from '../config.js';

export const listDatabasesSchema = z.object({
  connection: z.string().optional().describe('Database connection to use (optional, uses current if not specified)'),
});

export const listTablesSchema = z.object({
  database: z.string().optional().describe('Database name to list tables from (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const describeTableSchema = z.object({
  table: z.string().describe('Table name to describe'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const showIndexesSchema = z.object({
  table: z.string().describe('Table name to show indexes for'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const analyzeForeignKeysSchema = z.object({
  table: z.string().optional().describe('Specific table to analyze (optional, analyzes all if not specified)'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const getTableDependenciesSchema = z.object({
  table: z.string().describe('Table name to get dependencies for'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export async function listDatabases(args: z.infer<typeof listDatabasesSchema>) {
  try {
    const databases = await databaseManager.getDatabases(args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Available databases:\n${databases.map(db => `• ${db}`).join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error listing databases: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function listTables(args: z.infer<typeof listTablesSchema>) {
  try {
    const tables = await databaseManager.getTables(args.database, args.connection);
    const currentDb = args.database || 'current database';

    return {
      content: [
        {
          type: "text" as const,
          text: `Tables in ${currentDb}:\n${tables.map(table => `• ${table}`).join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error listing tables: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function describeTable(args: z.infer<typeof describeTableSchema>) {
  try {
    const schema = await databaseManager.getTableSchema(args.table, args.database, args.connection);

    const tableInfo = schema.map(col => {
      return `${col.Field} | ${col.Type} | ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} | ${col.Key} | ${col.Default || ''} | ${col.Extra || ''}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Table structure for ${args.table}:\n\nField | Type | Null | Key | Default | Extra\n${'-'.repeat(60)}\n${tableInfo.join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error describing table: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function showIndexes(args: z.infer<typeof showIndexesSchema>) {
  try {
    let sql = `SHOW INDEX FROM \`${args.table}\``;
    if (args.database) {
      sql = `SHOW INDEX FROM \`${args.database}\`.\`${args.table}\``;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    if (result.results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No indexes found for table ${args.table}`,
          },
        ],
      };
    }

    const indexInfo = result.results.map(idx => {
      return `${idx.Key_name} | ${idx.Column_name} | ${idx.Index_type} | ${idx.Non_unique === 0 ? 'UNIQUE' : 'NON-UNIQUE'}`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Indexes for table ${args.table}:\n\nIndex Name | Column | Type | Uniqueness\n${'-'.repeat(50)}\n${indexInfo.join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error showing indexes: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function analyzeForeignKeys(args: z.infer<typeof analyzeForeignKeysSchema>) {
  try {
    let sql = `
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `;

    if (args.table) {
      sql += ` AND TABLE_NAME = '${args.table}'`;
    }

    if (args.database) {
      sql = sql.replace('DATABASE()', `'${args.database}'`);
    }

    const result = await databaseManager.query(sql, [], args.connection);

    if (result.results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: args.table
              ? `No foreign keys found for table ${args.table}`
              : `No foreign keys found in the database`,
          },
        ],
      };
    }

    const fkInfo = result.results.map(fk => {
      return `${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME} (${fk.CONSTRAINT_NAME})`;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Foreign Key Relationships:\n\n${fkInfo.join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error analyzing foreign keys: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function getTableDependencies(args: z.infer<typeof getTableDependenciesSchema>) {
  try {
    const referencedByQuery = `
      SELECT
        TABLE_NAME as dependent_table,
        COLUMN_NAME as dependent_column,
        CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = '${args.table}'
    `;

    const referencesQuery = `
      SELECT
        REFERENCED_TABLE_NAME as referenced_table,
        REFERENCED_COLUMN_NAME as referenced_column,
        COLUMN_NAME as local_column,
        CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${args.table}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `;

    const [referencedByResult, referencesResult] = await Promise.all([
      databaseManager.query(referencedByQuery, [], args.connection),
      databaseManager.query(referencesQuery, [], args.connection)
    ]);

    let output = `Table Dependencies for ${args.table}:\n\n`;

    if (referencesResult.results.length > 0) {
      output += `Tables that ${args.table} REFERENCES:\n`;
      referencesResult.results.forEach(ref => {
        output += `• ${ref.referenced_table}.${ref.referenced_column} (via ${args.table}.${ref.local_column})\n`;
      });
      output += '\n';
    }

    if (referencedByResult.results.length > 0) {
      output += `Tables that REFERENCE ${args.table}:\n`;
      referencedByResult.results.forEach(ref => {
        output += `• ${ref.dependent_table}.${ref.dependent_column}\n`;
      });
    }

    if (referencesResult.results.length === 0 && referencedByResult.results.length === 0) {
      output += `No foreign key dependencies found for table ${args.table}`;
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
          text: `Error getting table dependencies: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}