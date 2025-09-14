import { z } from 'zod';
import { databaseManager } from '../database.js';
import { configManager } from '../config.js';

export const insertRecordSchema = z.object({
  table: z.string().describe('Table name to insert into'),
  data: z.record(z.string(), z.any()).describe('Data to insert as key-value pairs'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const updateRecordSchema = z.object({
  table: z.string().describe('Table name to update'),
  data: z.record(z.string(), z.any()).describe('Data to update as key-value pairs'),
  where: z.string().describe('WHERE clause to identify records to update (without WHERE keyword)'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const deleteRecordSchema = z.object({
  table: z.string().describe('Table name to delete from'),
  where: z.string().describe('WHERE clause to identify records to delete (without WHERE keyword)'),
  confirmDeletion: z.boolean().default(false).describe('Confirmation flag for deletion (must be true)'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

export const bulkInsertSchema = z.object({
  table: z.string().describe('Table name to insert into'),
  data: z.array(z.record(z.string(), z.any())).describe('Array of data objects to insert'),
  database: z.string().optional().describe('Database name (optional)'),
  connection: z.string().optional().describe('Database connection to use (optional)'),
});

function validateNotReadOnly(): void {
  if (configManager.isReadOnlyMode()) {
    throw new Error('Data modification is not allowed in read-only mode');
  }

  if (!configManager.getSecurityConfig().allowDataModification) {
    throw new Error('Data modification is disabled in security configuration');
  }
}

export async function insertRecord(args: z.infer<typeof insertRecordSchema>) {
  try {
    validateNotReadOnly();

    const columns = Object.keys(args.data);
    const values = Object.values(args.data);
    const placeholders = columns.map(() => '?').join(', ');

    let sql = `INSERT INTO \`${args.table}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;

    if (args.database) {
      sql = `INSERT INTO \`${args.database}\`.\`${args.table}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;
    }

    const result = await databaseManager.query(sql, values, args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully inserted record into ${args.table}.\nInsert ID: ${result.insertId}\nAffected rows: ${result.affectedRows}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error inserting record: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function updateRecord(args: z.infer<typeof updateRecordSchema>) {
  try {
    validateNotReadOnly();

    const setClause = Object.keys(args.data)
      .map(key => `\`${key}\` = ?`)
      .join(', ');

    const values = Object.values(args.data);

    let sql = `UPDATE \`${args.table}\` SET ${setClause} WHERE ${args.where}`;

    if (args.database) {
      sql = `UPDATE \`${args.database}\`.\`${args.table}\` SET ${setClause} WHERE ${args.where}`;
    }

    const result = await databaseManager.query(sql, values, args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully updated ${result.affectedRows} record(s) in ${args.table}.\nWHERE condition: ${args.where}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error updating record: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function deleteRecord(args: z.infer<typeof deleteRecordSchema>) {
  try {
    validateNotReadOnly();

    if (!args.confirmDeletion) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Deletion not confirmed. Please set confirmDeletion to true to proceed with deleting records from ${args.table} WHERE ${args.where}`,
          },
        ],
      };
    }

    let countSql = `SELECT COUNT(*) as count FROM \`${args.table}\` WHERE ${args.where}`;
    if (args.database) {
      countSql = `SELECT COUNT(*) as count FROM \`${args.database}\`.\`${args.table}\` WHERE ${args.where}`;
    }

    const countResult = await databaseManager.query(countSql, [], args.connection);
    const recordCount = countResult.results[0]?.count || 0;

    if (recordCount === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No records found matching the WHERE condition: ${args.where}`,
          },
        ],
      };
    }

    let sql = `DELETE FROM \`${args.table}\` WHERE ${args.where}`;
    if (args.database) {
      sql = `DELETE FROM \`${args.database}\`.\`${args.table}\` WHERE ${args.where}`;
    }

    const result = await databaseManager.query(sql, [], args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully deleted ${result.affectedRows} record(s) from ${args.table}.\nWHERE condition: ${args.where}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error deleting record: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

export async function bulkInsert(args: z.infer<typeof bulkInsertSchema>) {
  try {
    validateNotReadOnly();

    if (args.data.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No data provided for bulk insert`,
          },
        ],
      };
    }

    const firstRecord = args.data[0];
    if (!firstRecord) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: No data provided for bulk insert`,
          },
        ],
      };
    }
    const columns = Object.keys(firstRecord);

    for (const record of args.data) {
      const recordColumns = Object.keys(record);
      if (recordColumns.length !== columns.length || !recordColumns.every(col => columns.includes(col))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: All records must have the same columns. Expected: ${columns.join(', ')}`,
            },
          ],
        };
      }
    }

    const placeholders = args.data.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const allValues = args.data.flatMap(record => columns.map(col => record[col]));

    let sql = `INSERT INTO \`${args.table}\` (\`${columns.join('`, `')}\`) VALUES ${placeholders}`;

    if (args.database) {
      sql = `INSERT INTO \`${args.database}\`.\`${args.table}\` (\`${columns.join('`, `')}\`) VALUES ${placeholders}`;
    }

    const result = await databaseManager.query(sql, allValues, args.connection);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully bulk inserted ${args.data.length} records into ${args.table}.\nFirst insert ID: ${result.insertId}\nAffected rows: ${result.affectedRows}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error in bulk insert: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}