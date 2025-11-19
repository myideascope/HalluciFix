/**
 * Database Migration Script: AWS RDS PostgreSQL Management
 * 
 * This script handles AWS RDS PostgreSQL operations including
 * schema management, data validation, and migration utilities.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

interface RDSConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

interface DatabaseSchema {
  tables: TableDefinition[];
  indexes: IndexDefinition[];
  constraints: ConstraintDefinition[];
}

interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKey?: string[];
  foreignKeys?: ForeignKeyDefinition[];
}

interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  unique?: boolean;
}

interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

interface ConstraintDefinition {
  name: string;
  table: string;
  type: 'check' | 'unique' | 'foreign_key';
  definition: string;
}

interface ForeignKeyDefinition {
  name: string;
  columns: string[];
  references: {
    table: string;
    columns: string[];
  };
}

class RDSMigrationManager {
  private client: Client;
  private config: RDSConfig;

  constructor(config: RDSConfig) {
    this.config = config;
    this.client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl !== false,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      console.log('✅ Connected to RDS PostgreSQL');
    } catch (error) {
      console.error('❌ Failed to connect to RDS:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.end();
      console.log('✅ Disconnected from RDS PostgreSQL');
    } catch (error) {
      console.error('❌ Failed to disconnect from RDS:', error);
      throw error;
    }
  }

  async createSchema(schema: DatabaseSchema): Promise<void> {
    console.log('🏗️ Creating database schema...');

    try {
      // Create tables
      for (const table of schema.tables) {
        await this.createTable(table);
      }

      // Create indexes
      for (const index of schema.indexes) {
        await this.createIndex(index);
      }

      // Create constraints
      for (const constraint of schema.constraints) {
        await this.createConstraint(constraint);
      }

      console.log('✅ Database schema created successfully');
    } catch (error) {
      console.error('❌ Schema creation failed:', error);
      throw error;
    }
  }

  private async createTable(table: TableDefinition): Promise<void> {
    const columns = table.columns.map(col => {
      let columnDef = `"${col.name}" ${col.type}`;
      if (!col.nullable) {
        columnDef += ' NOT NULL';
      }
      if (col.default) {
        columnDef += ` DEFAULT ${col.default}`;
      }
      return columnDef;
    }).join(', ');

    const primaryKey = table.primaryKey ? 
      `, CONSTRAINT "${table.name}_pkey" PRIMARY KEY (${table.primaryKey.map(col => `"${col}"`).join(', ')})` : '';

    const foreignKeys = table.foreignKeys ? table.foreignKeys.map(fk => {
      return `, CONSTRAINT "${fk.name}" FOREIGN KEY (${fk.columns.map(col => `"${col}"`).join(', ')}) 
              REFERENCES "${fk.references.table}" (${fk.references.columns.map(col => `"${col}"`).join(', ')})`;
    }).join(' ') : '';

    const query = `CREATE TABLE IF NOT EXISTS "${table.name}" (${columns}${primaryKey}${foreignKeys})`;

    await this.client.query(query);
    console.log(`  ✓ Created table "${table.name}"`);
  }

  private async createIndex(index: IndexDefinition): Promise<void> {
    const unique = index.unique ? 'UNIQUE' : '';
    const columns = index.columns.map(col => `"${col}"`).join(', ');
    const query = `CREATE ${unique} INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" (${columns})`;

    await this.client.query(query);
    console.log(`  ✓ Created index "${index.name}" on "${index.table}"`);
  }

  private async createConstraint(constraint: ConstraintDefinition): Promise<void> {
    const query = `ALTER TABLE "${constraint.table}" ADD CONSTRAINT "${constraint.name}" ${constraint.definition}`;

    await this.client.query(query);
    console.log(`  ✓ Created constraint "${constraint.name}" on "${constraint.table}"`);
  }

  async validateDataIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    console.log('🔍 Validating data integrity...');

    const issues: string[] = [];

    try {
      // Check for orphaned records in tables with foreign keys
      const orphanedChecks = await this.checkOrphanedRecords();
      issues.push(...orphanedChecks);

      // Check for constraint violations
      const constraintIssues = await this.checkConstraints();
      issues.push(...constraintIssues);

      // Check data consistency
      const consistencyIssues = await this.checkDataConsistency();
      issues.push(...consistencyIssues);

      const valid = issues.length === 0;

      if (valid) {
        console.log('✅ Data integrity validation passed');
      } else {
        console.log('⚠️ Data integrity issues found:', issues.length);
        issues.forEach(issue => console.log(`  - ${issue}`));
      }

      return { valid, issues };
    } catch (error) {
      console.error('❌ Data integrity validation failed:', error);
      throw error;
    }
  }

  private async checkOrphanedRecords(): Promise<string[]> {
    const issues: string[] = [];

    // Check for users without profiles
    const userCheck = await this.client.query(`
      SELECT COUNT(*) as orphaned_count
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE p.user_id IS NULL
    `);

    if (parseInt(userCheck.rows[0].orphaned_count) > 0) {
      issues.push(`Found ${userCheck.rows[0].orphaned_count} users without profiles`);
    }

    // Add more orphaned record checks as needed
    return issues;
  }

  private async checkConstraints(): Promise<string[]> {
    const issues: string[] = [];

    try {
      // Check for constraint violations
      const violations = await this.client.query(`
        SELECT conname as constraint_name, nspname as schema_name, relname as table_name
        FROM pg_constraint 
        JOIN pg_class ON conrelid = pg_class.oid 
        JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
        WHERE NOT pg_constraint.contype = 'f'
      `);

      // Test each constraint
      for (const violation of violations.rows) {
        try {
          await this.client.query(`SELECT 1 FROM ${violation.schema_name}.${violation.table_name} LIMIT 1`);
        } catch (error) {
          issues.push(`Constraint violation in ${violation.table_name}: ${error.message}`);
        }
      }
    } catch (error) {
      issues.push(`Constraint check failed: ${error.message}`);
    }

    return issues;
  }

  private async checkDataConsistency(): Promise<string[]> {
    const issues: string[] = [];

    // Check for analysis results without users
    const analysisCheck = await this.client.query(`
      SELECT COUNT(*) as orphaned_count
      FROM analysis_results ar
      LEFT JOIN users u ON ar.user_id = u.id
      WHERE u.id IS NULL
    `);

    if (parseInt(analysisCheck.rows[0].orphaned_count) > 0) {
      issues.push(`Found ${analysisCheck.rows[0].orphaned_count} analysis results without valid users`);
    }

    return issues;
  }

  async backupDatabase(backupPath: string): Promise<void> {
    console.log(`💾 Creating database backup at ${backupPath}...`);

    try {
      // Get all tables
      const tablesResult = await this.client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      const tables = tablesResult.rows.map(row => row.table_name);

      const backup: DatabaseSchema = {
        tables: [],
        indexes: [],
        constraints: []
      };

      // Export table structures
      for (const tableName of tables) {
        const tableDef = await this.getTableDefinition(tableName);
        if (tableDef) {
          backup.tables.push(tableDef);
        }
      }

      // Export data for each table
      const dataExports: Record<string, any[]> = {};
      for (const tableName of tables) {
        const dataResult = await this.client.query(`SELECT * FROM "${tableName}"`);
        dataExports[tableName] = dataResult.rows;
      }

      // Save backup
      const backupData = {
        schema: backup,
        data: dataExports,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      await writeFile(backupPath, JSON.stringify(backupData, null, 2));
      console.log('✅ Database backup completed');
    } catch (error) {
      console.error('❌ Database backup failed:', error);
      throw error;
    }
  }

  private async getTableDefinition(tableName: string): Promise<TableDefinition | null> {
    try {
      // Get column information
      const columnsResult = await this.client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);

      const columns: ColumnDefinition[] = columnsResult.rows.map(row => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default
      }));

      // Get primary key
      const pkResult = await this.client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = $1 
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
      `, [tableName]);

      const primaryKey = pkResult.rows.length > 0 ? 
        pkResult.rows.map(row => row.column_name) : undefined;

      return {
        name: tableName,
        columns,
        primaryKey
      };
    } catch (error) {
      console.error(`Failed to get definition for table ${tableName}:`, error);
      return null;
    }
  }

  async generateSchemaReport(outputPath: string): Promise<void> {
    console.log('📊 Generating schema report...');

    try {
      const report = {
        tables: await this.getTableReport(),
        indexes: await this.getIndexReport(),
        constraints: await this.getConstraintReport(),
        relationships: await this.getRelationshipReport(),
        generatedAt: new Date().toISOString()
      };

      await writeFile(outputPath, JSON.stringify(report, null, 2));
      console.log(`✅ Schema report generated: ${outputPath}`);
    } catch (error) {
      console.error('❌ Schema report generation failed:', error);
      throw error;
    }
  }

  private async getTableReport(): Promise<any[]> {
    const result = await this.client.query(`
      SELECT 
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name, c.ordinal_position
    `);

    // Group by table
    const tables: Record<string, any[]> = {};
    result.rows.forEach(row => {
      if (!tables[row.table_name]) {
        tables[row.table_name] = [];
      }
      tables[row.table_name].push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default,
        maxLength: row.character_maximum_length
      });
    });

    return Object.entries(tables).map(([tableName, columns]) => ({
      name: tableName,
      columns,
      columnCount: columns.length
    }));
  }

  private async getIndexReport(): Promise<any[]> {
    const result = await this.client.query(`
      SELECT 
        t.relname as table_name,
        i.relname as index_name,
        a.attname as column_name,
        ix.indisunique as is_unique
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[0]
      WHERE t.relkind = 'r' AND t.relname NOT LIKE 'pg_%'
      ORDER BY t.relname, i.relname
    `);

    return result.rows;
  }

  private async getConstraintReport(): Promise<any[]> {
    const result = await this.client.query(`
      SELECT 
        conname as constraint_name,
        conrelid::regclass::text as table_name,
        contype as constraint_type,
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE contype IN ('p', 'f', 'c', 'u')
      ORDER BY conrelid::regclass::text
    `);

    return result.rows.map(row => ({
      name: row.constraint_name,
      table: row.table_name,
      type: row.constraint_type,
      definition: row.definition
    }));
  }

  private async getRelationshipReport(): Promise<any[]> {
    const result = await this.client.query(`
      SELECT
        tc.table_name as source_table,
        kcu.column_name as source_column,
        ccu.table_name as target_table,
        ccu.column_name as target_column,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name
    `);

    return result.rows;
  }
}

// Configuration
const rdsConfig: RDSConfig = {
  host: process.env.DB_HOST || process.env.RDS_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.RDS_PORT || '5432'),
  database: process.env.DB_NAME || process.env.RDS_DATABASE || 'hallucifix',
  username: process.env.DB_USERNAME || process.env.RDS_USERNAME || 'hallucifix_user',
  password: process.env.DB_PASSWORD || process.env.RDS_PASSWORD || 'password',
  ssl: process.env.DB_SSL !== 'false'
};

// CLI interface
async function main() {
  const command = process.argv[2];
  const outputPath = process.argv[3] || './database-backup.json';

  const manager = new RDSMigrationManager(rdsConfig);

  try {
    await manager.connect();

    switch (command) {
      case 'backup':
        await manager.backupDatabase(outputPath);
        break;
      case 'schema-report':
        await manager.generateSchemaReport(outputPath);
        break;
      case 'validate':
        const validation = await manager.validateDataIntegrity();
        if (!validation.valid) {
          process.exit(1);
        }
        break;
      default:
        console.log('Available commands:');
        console.log('  backup <output-path>     - Create database backup');
        console.log('  schema-report <output-path> - Generate schema report');
        console.log('  validate               - Validate data integrity');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await manager.disconnect();
  }
}

if (require.main === module) {
  main();
}

export { RDSMigrationManager, RDSConfig, DatabaseSchema };