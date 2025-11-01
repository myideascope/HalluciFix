#!/usr/bin/env ts-node

/**
 * Database Migration Script: Supabase to AWS RDS PostgreSQL
 * 
 * This script handles the complete migration of data from Supabase to AWS RDS PostgreSQL.
 * It includes schema migration, data export/import, and validation steps.
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

interface MigrationConfig {
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  rds: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  outputDir: string;
  batchSize: number;
}

interface TableMigrationResult {
  tableName: string;
  recordCount: number;
  success: boolean;
  error?: string;
}

class DatabaseMigrator {
  private supabaseClient: ReturnType<typeof createClient>;
  private rdsClient: Client;
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.supabaseClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
    
    this.rdsClient = new Client({
      host: config.rds.host,
      port: config.rds.port,
      database: config.rds.database,
      user: config.rds.username,
      password: config.rds.password,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Export schema from Supabase and create RDS-compatible SQL
   */
  async exportSchema(): Promise<void> {
    console.log('🔄 Exporting schema from Supabase...');
    
    try {
      // Get all tables from public schema
      const { data: tables, error } = await this.supabaseClient
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .neq('table_name', 'schema_migrations');

      if (error) throw error;

      let schemaSQL = `-- AWS RDS PostgreSQL Schema Migration
-- Generated from Supabase on ${new Date().toISOString()}

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;

      // Export each table structure
      for (const table of tables || []) {
        const tableName = (table as any).table_name;
        console.log(`  📋 Exporting table: ${tableName}`);
        
        // Get table columns
        const { data: columns } = await this.supabaseClient
          .from('information_schema.columns')
          .select('*')
          .eq('table_schema', 'public')
          .eq('table_name', tableName)
          .order('ordinal_position');

        if (columns && columns.length > 0) {
          schemaSQL += this.generateCreateTableSQL(tableName, columns);
        }
      }

      // Add indexes and constraints
      schemaSQL += await this.exportIndexesAndConstraints();

      // Write schema to file
      const schemaPath = path.join(this.config.outputDir, 'rds-schema.sql');
      await writeFile(schemaPath, schemaSQL);
      console.log(`✅ Schema exported to: ${schemaPath}`);

    } catch (error) {
      console.error('❌ Schema export failed:', error);
      throw error;
    }
  }

  /**
   * Generate CREATE TABLE SQL for RDS PostgreSQL
   */
  private generateCreateTableSQL(tableName: string, columns: any[]): string {
    let sql = `-- Table: ${tableName}\n`;
    sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    
    const columnDefs = columns.map(col => {
      let colDef = `  ${col.column_name} ${this.mapDataType(col.data_type, col.character_maximum_length)}`;
      
      if (col.is_nullable === 'NO') {
        colDef += ' NOT NULL';
      }
      
      if (col.column_default) {
        // Convert Supabase defaults to RDS-compatible defaults
        let defaultValue = col.column_default;
        if (defaultValue.includes('gen_random_uuid()')) {
          defaultValue = 'gen_random_uuid()';
        } else if (defaultValue.includes('now()')) {
          defaultValue = 'CURRENT_TIMESTAMP';
        }
        colDef += ` DEFAULT ${defaultValue}`;
      }
      
      return colDef;
    });
    
    sql += columnDefs.join(',\n');
    sql += '\n);\n\n';
    
    return sql;
  }

  /**
   * Map Supabase data types to RDS PostgreSQL data types
   */
  private mapDataType(dataType: string, maxLength?: number): string {
    switch (dataType.toLowerCase()) {
      case 'character varying':
        return maxLength ? `VARCHAR(${maxLength})` : 'TEXT';
      case 'text':
        return 'TEXT';
      case 'uuid':
        return 'UUID';
      case 'timestamp with time zone':
        return 'TIMESTAMPTZ';
      case 'timestamp without time zone':
        return 'TIMESTAMP';
      case 'boolean':
        return 'BOOLEAN';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'BIGINT';
      case 'real':
        return 'REAL';
      case 'double precision':
        return 'DOUBLE PRECISION';
      case 'jsonb':
        return 'JSONB';
      case 'json':
        return 'JSON';
      default:
        return dataType.toUpperCase();
    }
  }

  /**
   * Export indexes and constraints
   */
  private async exportIndexesAndConstraints(): Promise<string> {
    let sql = '-- Indexes and Constraints\n\n';
    
    // Add primary keys and indexes for main tables
    sql += `-- Primary keys and indexes for analysis_results
ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id_created_at ON analysis_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_results_analysis_type ON analysis_results(analysis_type);
CREATE INDEX IF NOT EXISTS idx_analysis_results_batch_id ON analysis_results(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_results_scan_id ON analysis_results(scan_id) WHERE scan_id IS NOT NULL;

-- Primary keys and indexes for scheduled_scans
ALTER TABLE scheduled_scans ADD CONSTRAINT scheduled_scans_pkey PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_user_id_next_run ON scheduled_scans(user_id, next_run);
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_enabled_next_run ON scheduled_scans(enabled, next_run) WHERE enabled = true;

-- Check constraints
ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_accuracy_check CHECK (accuracy >= 0 AND accuracy <= 100);
ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_analysis_type_check CHECK (analysis_type IN ('single', 'batch', 'scheduled'));

ALTER TABLE scheduled_scans ADD CONSTRAINT scheduled_scans_frequency_check CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly'));
ALTER TABLE scheduled_scans ADD CONSTRAINT scheduled_scans_status_check CHECK (status IN ('active', 'paused', 'error', 'completed'));

`;

    return sql;
  }

  /**
   * Export data from Supabase tables
   */
  async exportData(): Promise<void> {
    console.log('🔄 Exporting data from Supabase...');
    
    const tables = ['analysis_results', 'scheduled_scans'];
    const results: TableMigrationResult[] = [];

    for (const tableName of tables) {
      try {
        console.log(`  📊 Exporting table: ${tableName}`);
        
        // Get total count
        const { count } = await this.supabaseClient
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        console.log(`    Total records: ${count}`);

        if (count === 0) {
          results.push({ tableName, recordCount: 0, success: true });
          continue;
        }

        // Export data in batches
        let exportedCount = 0;
        let offset = 0;
        const allData: any[] = [];

        while (offset < (count || 0)) {
          const { data, error } = await this.supabaseClient
            .from(tableName)
            .select('*')
            .range(offset, offset + this.config.batchSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData.push(...data);
            exportedCount += data.length;
            console.log(`    Exported: ${exportedCount}/${count} records`);
          }

          offset += this.config.batchSize;
        }

        // Write data to JSON file
        const dataPath = path.join(this.config.outputDir, `${tableName}.json`);
        await writeFile(dataPath, JSON.stringify(allData, null, 2));

        results.push({ tableName, recordCount: exportedCount, success: true });
        console.log(`  ✅ Exported ${exportedCount} records to: ${dataPath}`);

      } catch (error) {
        console.error(`  ❌ Failed to export ${tableName}:`, error);
        results.push({ 
          tableName, 
          recordCount: 0, 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Write migration summary
    const summaryPath = path.join(this.config.outputDir, 'export-summary.json');
    await writeFile(summaryPath, JSON.stringify(results, null, 2));
    console.log(`📋 Export summary written to: ${summaryPath}`);
  }

  /**
   * Import schema to RDS PostgreSQL
   */
  async importSchema(): Promise<void> {
    console.log('🔄 Importing schema to RDS PostgreSQL...');
    
    try {
      await this.rdsClient.connect();
      console.log('✅ Connected to RDS PostgreSQL');

      const schemaPath = path.join(this.config.outputDir, 'rds-schema.sql');
      const schemaSQL = await readFile(schemaPath, 'utf8');

      // Execute schema creation
      await this.rdsClient.query(schemaSQL);
      console.log('✅ Schema imported successfully');

    } catch (error) {
      console.error('❌ Schema import failed:', error);
      throw error;
    }
  }

  /**
   * Import data to RDS PostgreSQL
   */
  async importData(): Promise<void> {
    console.log('🔄 Importing data to RDS PostgreSQL...');
    
    const tables = ['analysis_results', 'scheduled_scans'];
    const results: TableMigrationResult[] = [];

    for (const tableName of tables) {
      try {
        console.log(`  📊 Importing table: ${tableName}`);
        
        const dataPath = path.join(this.config.outputDir, `${tableName}.json`);
        
        if (!fs.existsSync(dataPath)) {
          console.log(`    No data file found for ${tableName}, skipping...`);
          continue;
        }

        const data = JSON.parse(await readFile(dataPath, 'utf8'));
        
        if (data.length === 0) {
          console.log(`    No data to import for ${tableName}`);
          results.push({ tableName, recordCount: 0, success: true });
          continue;
        }

        // Import data in batches
        let importedCount = 0;
        
        for (let i = 0; i < data.length; i += this.config.batchSize) {
          const batch = data.slice(i, i + this.config.batchSize);
          
          // Generate INSERT statement
          const columns = Object.keys(batch[0]);
          const placeholders = batch.map((_: any, idx: number) => 
            `(${columns.map((_: string, colIdx: number) => `$${idx * columns.length + colIdx + 1}`).join(', ')})`
          ).join(', ');
          
          const values = batch.flatMap((row: any) => columns.map(col => row[col]));
          
          const insertSQL = `
            INSERT INTO ${tableName} (${columns.join(', ')})
            VALUES ${placeholders}
            ON CONFLICT (id) DO NOTHING
          `;

          await this.rdsClient.query(insertSQL, values);
          importedCount += batch.length;
          console.log(`    Imported: ${importedCount}/${data.length} records`);
        }

        results.push({ tableName, recordCount: importedCount, success: true });
        console.log(`  ✅ Imported ${importedCount} records to ${tableName}`);

      } catch (error) {
        console.error(`  ❌ Failed to import ${tableName}:`, error);
        results.push({ 
          tableName, 
          recordCount: 0, 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Write import summary
    const summaryPath = path.join(this.config.outputDir, 'import-summary.json');
    await writeFile(summaryPath, JSON.stringify(results, null, 2));
    console.log(`📋 Import summary written to: ${summaryPath}`);
  }

  /**
   * Validate migration by comparing record counts
   */
  async validateMigration(): Promise<boolean> {
    console.log('🔄 Validating migration...');
    
    const tables = ['analysis_results', 'scheduled_scans'];
    let allValid = true;

    for (const tableName of tables) {
      try {
        // Get Supabase count
        const { count: supabaseCount } = await this.supabaseClient
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        // Get RDS count
        const rdsResult = await this.rdsClient.query(`SELECT COUNT(*) FROM ${tableName}`);
        const rdsCount = parseInt(rdsResult.rows[0].count);

        console.log(`  📊 ${tableName}: Supabase=${supabaseCount}, RDS=${rdsCount}`);

        if (supabaseCount !== rdsCount) {
          console.error(`  ❌ Count mismatch for ${tableName}`);
          allValid = false;
        } else {
          console.log(`  ✅ ${tableName} validated successfully`);
        }

      } catch (error) {
        console.error(`  ❌ Validation failed for ${tableName}:`, error);
        allValid = false;
      }
    }

    return allValid;
  }

  /**
   * Clean up connections
   */
  async cleanup(): Promise<void> {
    try {
      await this.rdsClient.end();
      console.log('✅ Database connections closed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  const config: MigrationConfig = {
    supabase: {
      url: process.env.SUPABASE_URL || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    rds: {
      host: process.env.RDS_HOST || '',
      port: parseInt(process.env.RDS_PORT || '5432'),
      database: process.env.RDS_DATABASE || 'hallucifix',
      username: process.env.RDS_USERNAME || '',
      password: process.env.RDS_PASSWORD || '',
    },
    outputDir: path.join(__dirname, '../migration-data'),
    batchSize: 1000,
  };

  // Validate configuration
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error('Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!config.rds.host || !config.rds.username || !config.rds.password) {
    throw new Error('RDS configuration missing. Set RDS_HOST, RDS_USERNAME, and RDS_PASSWORD');
  }

  // Create output directory
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const migrator = new DatabaseMigrator(config);

  try {
    console.log('🚀 Starting database migration...');
    
    // Step 1: Export schema and data from Supabase
    await migrator.exportSchema();
    await migrator.exportData();
    
    // Step 2: Import schema and data to RDS
    await migrator.importSchema();
    await migrator.importData();
    
    // Step 3: Validate migration
    const isValid = await migrator.validateMigration();
    
    if (isValid) {
      console.log('🎉 Migration completed successfully!');
    } else {
      console.error('❌ Migration validation failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await migrator.cleanup();
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration().catch(console.error);
}

export { DatabaseMigrator, runMigration };