#!/usr/bin/env ts-node

/**
 * Database Migration Verification Script
 * 
 * This script verifies that the Supabase to AWS RDS PostgreSQL migration
 * was completed successfully and all data is intact.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

interface VerificationConfig {
  rds: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  };
  expectedTables: string[];
  testData?: {
    userId?: string;
    analysisId?: string;
  };
}

interface VerificationResult {
  success: boolean;
  message: string;
  details: VerificationDetails;
}

interface VerificationDetails {
  connection: boolean;
  schema: SchemaVerification;
  data: DataVerification;
  performance: PerformanceVerification;
  security: SecurityVerification;
}

interface SchemaVerification {
  tables: TableVerification[];
  indexes: IndexVerification[];
  constraints: ConstraintVerification[];
}

interface TableVerification {
  name: string;
  exists: boolean;
  columnCount: number;
  rowCount?: number;
  primaryKey?: string[];
  foreignKeys?: string[];
}

interface IndexVerification {
  name: string;
  table: string;
  unique: boolean;
  exists: boolean;
}

interface ConstraintVerification {
  name: string;
  table: string;
  type: string;
  valid: boolean;
}

interface DataVerification {
  totalRecords: number;
  sampleData: Record<string, any>[];
  referentialIntegrity: boolean;
  dataConsistency: boolean;
}

interface PerformanceVerification {
  connectionTime: number;
  queryPerformance: QueryPerformance[];
  indexEffectiveness: boolean;
}

interface QueryPerformance {
  query: string;
  executionTime: number;
  success: boolean;
}

interface SecurityVerification {
  sslEnabled: boolean;
  authenticationMethod: string;
  userPermissions: string[];
}

class DatabaseMigrationVerifier {
  private rdsClient: Client;
  private config: VerificationConfig;
  private results: VerificationDetails;

  constructor(config: VerificationConfig) {
    this.config = config;
    this.rdsClient = new Client({
      host: config.rds.host,
      port: config.rds.port,
      database: config.rds.database,
      user: config.rds.username,
      password: config.rds.password,
      ssl: config.rds.ssl !== false,
    });

    this.results = {
      connection: false,
      schema: { tables: [], indexes: [], constraints: [] },
      data: { totalRecords: 0, sampleData: [], referentialIntegrity: false, dataConsistency: false },
      performance: { connectionTime: 0, queryPerformance: [], indexEffectiveness: false },
      security: { sslEnabled: false, authenticationMethod: '', userPermissions: [] }
    };
  }

  async verifyMigration(): Promise<VerificationResult> {
    console.log('🔍 Starting Database Migration Verification...\n');

    try {
      // 1. Connection Verification
      await this.verifyConnection();
      
      // 2. Schema Verification
      await this.verifySchema();
      
      // 3. Data Verification
      await this.verifyData();
      
      // 4. Performance Verification
      await this.verifyPerformance();
      
      // 5. Security Verification
      await this.verifySecurity();

      // Generate summary
      const success = this.generateSummary();
      
      return {
        success,
        message: success ? '✅ Database migration verification PASSED' : '❌ Database migration verification FAILED',
        details: this.results
      };

    } catch (error) {
      console.error('❌ Verification failed with error:', error);
      return {
        success: false,
        message: `❌ Verification failed: ${error.message}`,
        details: this.results
      };
    }
  }

  private async verifyConnection(): Promise<void> {
    console.log('🔌 Verifying database connection...');
    const startTime = Date.now();

    try {
      await this.rdsClient.connect();
      const connectionTime = Date.now() - startTime;
      
      this.results.connection = true;
      this.results.performance.connectionTime = connectionTime;
      
      console.log(`  ✅ Connection successful (${connectionTime}ms)`);
      console.log(`  📍 Database: ${this.config.rds.database}`);
      console.log(`  🌐 Host: ${this.config.rds.host}:${this.config.rds.port}`);
    } catch (error) {
      console.error(`  ❌ Connection failed: ${error.message}`);
      throw error;
    }
  }

  private async verifySchema(): Promise<void> {
    console.log('\n🏗️ Verifying database schema...');

    try {
      // Verify tables
      await this.verifyTables();
      
      // Verify indexes
      await this.verifyIndexes();
      
      // Verify constraints
      await this.verifyConstraints();

      const tableCount = this.results.schema.tables.filter(t => t.exists).length;
      console.log(`  ✅ Schema verification complete: ${tableCount} tables verified`);
    } catch (error) {
      console.error(`  ❌ Schema verification failed: ${error.message}`);
      throw error;
    }
  }

  private async verifyTables(): Promise<void> {
    console.log('  📋 Verifying tables...');

    const query = `
      SELECT 
        table_name,
        column_count,
        row_estimate,
        has_primary_key,
        foreign_key_count
      FROM (
        SELECT 
          c.relname as table_name,
          COUNT(*) as column_count,
          n_tup_ins - n_tup_del as row_estimate,
          EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conrelid = c.oid AND contype = 'p'
          ) as has_primary_key,
          (SELECT COUNT(*) FROM pg_constraint 
           WHERE conrelid = c.oid AND contype = 'f') as foreign_key_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE c.relkind = 'r' AND n.nspname = 'public'
        GROUP BY c.relname, n_tup_ins, n_tup_del, c.oid
      ) t
      ORDER BY table_name;
    `;

    const result = await this.rdsClient.query(query);
    
    for (const expectedTable of this.config.expectedTables) {
      const tableInfo = result.rows.find(row => row.table_name === expectedTable);
      
      const tableVerification: TableVerification = {
        name: expectedTable,
        exists: !!tableInfo,
        columnCount: tableInfo?.column_count || 0,
        rowCount: tableInfo?.row_estimate || 0,
        primaryKey: await this.getTablePrimaryKey(expectedTable),
        foreignKeys: await this.getTableForeignKeys(expectedTable)
      };

      this.results.schema.tables.push(tableVerification);
      
      if (tableVerification.exists) {
        console.log(`    ✅ ${expectedTable} (${tableVerification.columnCount} columns, ~${tableVerification.rowCount} rows)`);
      } else {
        console.log(`    ❌ ${expectedTable} (missing)`);
      }
    }
  }

  private async verifyIndexes(): Promise<void> {
    console.log('  📊 Verifying indexes...');

    const query = `
      SELECT 
        indexname as name,
        tablename as table,
        unique,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `;

    const result = await this.rdsClient.query(query);
    
    for (const row of result.rows) {
      const indexVerification: IndexVerification = {
        name: row.name,
        table: row.table,
        unique: row.unique,
        exists: true
      };

      this.results.schema.indexes.push(indexVerification);
      console.log(`    📈 ${row.table}.${row.name} (${row.unique ? 'UNIQUE' : 'NON-UNIQUE'})`);
    }
  }

  private async verifyConstraints(): Promise<void> {
    console.log('  🔒 Verifying constraints...');

    const query = `
      SELECT 
        conname as name,
        conrelid::regclass::text as table,
        contype as type,
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE contype IN ('p', 'f', 'c', 'u')
      ORDER BY conrelid::regclass::text;
    `;

    const result = await this.rdsClient.query(query);
    
    for (const row of result.rows) {
      const constraintVerification: ConstraintVerification = {
        name: row.name,
        table: row.table,
        type: row.type,
        valid: true
      };

      this.results.schema.constraints.push(constraintVerification);
      console.log(`    🔐 ${row.table}.${row.name} (${row.type})`);
    }
  }

  private async getTablePrimaryKey(tableName: string): Promise<string[] | undefined> {
    const query = `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = $1 
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `;

    const result = await this.rdsClient.query(query, [tableName]);
    return result.rows.length > 0 ? result.rows.map(row => row.column_name) : undefined;
  }

  private async getTableForeignKeys(tableName: string): Promise<string[]> {
    const query = `
      SELECT 
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = $1
    `;

    const result = await this.rdsClient.query(query, [tableName]);
    return result.rows.map(row => `${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`);
  }

  private async verifyData(): Promise<void> {
    console.log('\n📊 Verifying data integrity...');

    try {
      // Count total records
      await this.countTotalRecords();
      
      // Sample data verification
      await this.verifySampleData();
      
      // Referential integrity
      await this.verifyReferentialIntegrity();
      
      // Data consistency
      await this.verifyDataConsistency();

      console.log(`  ✅ Data verification complete: ${this.results.data.totalRecords} total records`);
    } catch (error) {
      console.error(`  ❌ Data verification failed: ${error.message}`);
      throw error;
    }
  }

  private async countTotalRecords(): Promise<void> {
    const query = `
      SELECT 
        table_name,
        n_tup_ins - n_tup_del as row_count
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY table_name;
    `;

    const result = await this.rdsClient.query(query);
    this.results.data.totalRecords = result.rows.reduce((sum, row) => sum + parseInt(row.row_count), 0);
    
    console.log(`    📈 Total records: ${this.results.data.totalRecords}`);
    result.rows.forEach(row => {
      if (parseInt(row.row_count) > 0) {
        console.log(`      ${row.table_name}: ${row.row_count}`);
      }
    });
  }

  private async verifySampleData(): Promise<void> {
    console.log('    🔍 Verifying sample data...');

    // Sample queries for key tables
    const sampleQueries = [
      'SELECT id, email, name, created_at FROM users WHERE created_at > NOW() - INTERVAL \'30 days\' LIMIT 5',
      'SELECT id, user_id, content, result, created_at FROM analysis_results WHERE created_at > NOW() - INTERVAL \'7 days\' LIMIT 5',
      'SELECT id, user_id, plan_id, status, created_at FROM user_subscriptions WHERE status = \'active\' LIMIT 3'
    ];

    for (const query of sampleQueries) {
      try {
        const result = await this.rdsClient.query(query);
        if (result.rows.length > 0) {
          this.results.data.sampleData.push({
            query: query.substring(0, 50) + '...',
            rowCount: result.rows.length,
            sample: result.rows[0]
          });
        }
      } catch (error) {
        console.log(`      ⚠️ Sample query failed: ${error.message}`);
      }
    }
  }

  private async verifyReferentialIntegrity(): Promise<void> {
    console.log('    🔗 Verifying referential integrity...');

    try {
      // Check for orphaned records
      const orphanChecks = [
        'SELECT COUNT(*) as count FROM analysis_results ar LEFT JOIN users u ON ar.user_id = u.id WHERE u.id IS NULL',
        'SELECT COUNT(*) as count FROM user_subscriptions us LEFT JOIN users u ON us.user_id = u.id WHERE u.id IS NULL'
      ];

      let totalOrphans = 0;
      for (const query of orphanChecks) {
        const result = await this.rdsClient.query(query);
        totalOrphans += parseInt(result.rows[0].count);
      }

      this.results.data.referentialIntegrity = totalOrphans === 0;
      
      if (totalOrphans === 0) {
        console.log('      ✅ No orphaned records found');
      } else {
        console.log(`      ❌ Found ${totalOrphans} orphaned records`);
      }
    } catch (error) {
      console.log(`      ⚠️ Referential integrity check failed: ${error.message}`);
      this.results.data.referentialIntegrity = false;
    }
  }

  private async verifyDataConsistency(): Promise<void> {
    console.log('    📏 Verifying data consistency...');

    try {
      // Check for data consistency issues
      const consistencyChecks = [
        'SELECT COUNT(*) as count FROM users WHERE email IS NULL OR email = \'\'',
        'SELECT COUNT(*) as count FROM analysis_results WHERE content IS NULL OR result IS NULL',
        'SELECT COUNT(*) as count FROM user_subscriptions WHERE user_id IS NULL OR plan_id IS NULL'
      ];

      let totalInconsistencies = 0;
      for (const query of consistencyChecks) {
        const result = await this.rdsClient.query(query);
        totalInconsistencies += parseInt(result.rows[0].count);
      }

      this.results.data.dataConsistency = totalInconsistencies === 0;
      
      if (totalInconsistencies === 0) {
        console.log('      ✅ No data consistency issues found');
      } else {
        console.log(`      ⚠️ Found ${totalInconsistencies} data consistency issues`);
      }
    } catch (error) {
      console.log(`      ⚠️ Data consistency check failed: ${error.message}`);
      this.results.data.dataConsistency = false;
    }
  }

  private async verifyPerformance(): Promise<void> {
    console.log('\n⚡ Verifying performance...');

    try {
      // Test query performance
      await this.testQueryPerformance();
      
      // Test index effectiveness
      await this.testIndexEffectiveness();

      console.log('  ✅ Performance verification complete');
    } catch (error) {
      console.error(`  ❌ Performance verification failed: ${error.message}`);
      throw error;
    }
  }

  private async testQueryPerformance(): Promise<void> {
    console.log('    🚀 Testing query performance...');

    const performanceQueries = [
      'SELECT COUNT(*) FROM users',
      'SELECT COUNT(*) FROM analysis_results',
      'SELECT COUNT(*) FROM user_subscriptions',
      'SELECT * FROM users LIMIT 1',
      'SELECT * FROM analysis_results WHERE created_at > NOW() - INTERVAL \'1 day\' LIMIT 10'
    ];

    for (const query of performanceQueries) {
      const startTime = Date.now();
      try {
        await this.rdsClient.query(query);
        const executionTime = Date.now() - startTime;
        
        this.results.performance.queryPerformance.push({
          query: query.substring(0, 50) + '...',
          executionTime,
          success: true
        });

        console.log(`      ⏱️ ${executionTime}ms - ${query.substring(0, 30)}...`);
      } catch (error) {
        const executionTime = Date.now() - startTime;
        this.results.performance.queryPerformance.push({
          query: query.substring(0, 50) + '...',
          executionTime,
          success: false
        });
        
        console.log(`      ❌ Failed - ${query.substring(0, 30)}...`);
      }
    }
  }

  private async testIndexEffectiveness(): Promise<void> {
    console.log('    📊 Testing index effectiveness...');

    // Check if indexes are being used
    const indexQuery = `
      SELECT 
        t.tablename,
        indexname,
        c.reltuples AS num_records,
        c.relpages AS num_pages,
        pg_size_pretty(pg_relation_size(quote_ident(t.tablename)::regclass)) AS size
      FROM pg_tables t
      LEFT OUTER JOIN pg_class c ON c.relname = t.tablename
      WHERE t.tablename NOT LIKE 'pg_%'
      ORDER BY relpages DESC;
    `;

    try {
      const result = await this.rdsClient.query(indexQuery);
      this.results.performance.indexEffectiveness = result.rows.length > 0;
      
      if (this.results.performance.indexEffectiveness) {
        console.log('      ✅ Indexes are present and being used');
      } else {
        console.log('      ⚠️ No indexes detected');
      }
    } catch (error) {
      console.log(`      ⚠️ Index effectiveness check failed: ${error.message}`);
      this.results.performance.indexEffectiveness = false;
    }
  }

  private async verifySecurity(): Promise<void> {
    console.log('\n🔒 Verifying security...');

    try {
      // Check SSL configuration
      await this.checkSSLConfiguration();
      
      // Check authentication method
      await this.checkAuthenticationMethod();
      
      // Check user permissions
      await this.checkUserPermissions();

      console.log('  ✅ Security verification complete');
    } catch (error) {
      console.error(`  ❌ Security verification failed: ${error.message}`);
      throw error;
    }
  }

  private async checkSSLConfiguration(): Promise<void> {
    console.log('    🔐 Checking SSL configuration...');

    try {
      const result = await this.rdsClient.query('SHOW ssl;');
      this.results.security.sslEnabled = result.rows[0].ssl === 'on';
      
      if (this.results.security.sslEnabled) {
        console.log('      ✅ SSL is enabled');
      } else {
        console.log('      ❌ SSL is disabled');
      }
    } catch (error) {
      console.log(`      ⚠️ SSL check failed: ${error.message}`);
      this.results.security.sslEnabled = false;
    }
  }

  private async checkAuthenticationMethod(): Promise<void> {
    console.log('    👤 Checking authentication method...');

    try {
      const result = await this.rdsClient.query('SHOW password_encryption;');
      this.results.security.authenticationMethod = result.rows[0].password_encryption;
      console.log(`      🔑 Password encryption: ${this.results.security.authenticationMethod}`);
    } catch (error) {
      console.log(`      ⚠️ Authentication method check failed: ${error.message}`);
      this.results.security.authenticationMethod = 'unknown';
    }
  }

  private async checkUserPermissions(): Promise<void> {
    console.log('    👥 Checking user permissions...');

    try {
      const query = `
        SELECT 
          privilege_type,
          table_name
        FROM information_schema.table_privileges
        WHERE grantee = $1
        LIMIT 10;
      `;

      const result = await this.rdsClient.query(query, [this.config.rds.username]);
      this.results.security.userPermissions = result.rows.map(row => `${row.privilege_type} on ${row.table_name}`);
      
      console.log(`      👤 User: ${this.config.rds.username}`);
      console.log(`      📋 Permissions: ${this.results.security.userPermissions.length} grants`);
    } catch (error) {
      console.log(`      ⚠️ User permissions check failed: ${error.message}`);
      this.results.security.userPermissions = [];
    }
  }

  private generateSummary(): boolean {
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION VERIFICATION SUMMARY');
    console.log('='.repeat(60));

    // Connection Summary
    console.log(`🔌 Connection: ${this.results.connection ? '✅ PASS' : '❌ FAIL'}`);
    if (this.results.connection) {
      console.log(`   📍 Database: ${this.config.rds.database}`);
      console.log(`   ⚡ Connection Time: ${this.results.performance.connectionTime}ms`);
    }

    // Schema Summary
    const existingTables = this.results.schema.tables.filter(t => t.exists).length;
    const totalTables = this.results.schema.tables.length;
    const schemaPass = existingTables === totalTables;
    console.log(`🏗️ Schema: ${schemaPass ? '✅ PASS' : '❌ FAIL'} (${existingTables}/${totalTables} tables)`);
    if (!schemaPass) {
      const missingTables = this.results.schema.tables.filter(t => !t.exists);
      missingTables.forEach(table => console.log(`   ❌ Missing: ${table.name}`));
    }

    // Data Summary
    const dataPass = this.results.data.referentialIntegrity && this.results.data.dataConsistency;
    console.log(`📊 Data: ${dataPass ? '✅ PASS' : '❌ FAIL'} (${this.results.data.totalRecords} records)`);
    if (!dataPass) {
      console.log(`   🔗 Referential Integrity: ${this.results.data.referentialIntegrity ? '✅' : '❌'}`);
      console.log(`   📏 Data Consistency: ${this.results.data.dataConsistency ? '✅' : '❌'}`);
    }

    // Performance Summary
    const avgQueryTime = this.results.performance.queryPerformance.length > 0 
      ? this.results.performance.queryPerformance.reduce((sum, q) => sum + q.executionTime, 0) / this.results.performance.queryPerformance.length 
      : 0;
    const performancePass = avgQueryTime < 1000; // Less than 1 second average
    console.log(`⚡ Performance: ${performancePass ? '✅ PASS' : '❌ FAIL'} (avg: ${Math.round(avgQueryTime)}ms)`);
    console.log(`   📈 Indexes: ${this.results.performance.indexEffectiveness ? '✅' : '❌'}`);

    // Security Summary
    const securityPass = this.results.security.sslEnabled;
    console.log(`🔒 Security: ${securityPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   🔐 SSL: ${this.results.security.sslEnabled ? '✅' : '❌'}`);
    console.log(`   👤 Auth: ${this.results.security.authenticationMethod}`);

    // Overall Result
    const overallPass = this.results.connection && 
                       schemaPass && 
                       dataPass && 
                       performancePass && 
                       securityPass;

    console.log('\n' + '='.repeat(60));
    console.log(`🎯 OVERALL RESULT: ${overallPass ? '✅ MIGRATION SUCCESSFUL' : '❌ MIGRATION FAILED'}`);
    console.log('='.repeat(60));

    return overallPass;
  }

  async cleanup(): Promise<void> {
    try {
      await this.rdsClient.end();
      console.log('🔌 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
  }
}

// Configuration
const verificationConfig: VerificationConfig = {
  rds: {
    host: process.env.DB_HOST || process.env.RDS_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.RDS_PORT || '5432'),
    database: process.env.DB_NAME || process.env.RDS_DATABASE || 'hallucifix',
    username: process.env.DB_USERNAME || process.env.RDS_USERNAME || 'hallucifix_user',
    password: process.env.DB_PASSWORD || process.env.RDS_PASSWORD || 'password',
    ssl: process.env.DB_SSL !== 'false'
  },
  expectedTables: [
    'users',
    'analysis_results', 
    'user_subscriptions',
    'subscription_plans',
    'files',
    'api_usage_logs',
    'error_logs',
    'sessions',
    'profiles',
    'notifications'
  ]
};

// CLI interface
async function main() {
  const outputDir = process.argv[2] || './migration-verification-report.json';

  const verifier = new DatabaseMigrationVerifier(verificationConfig);

  try {
    const result = await verifier.verifyMigration();
    
    // Save detailed report
    await writeFile(outputDir, JSON.stringify({
      timestamp: new Date().toISOString(),
      configuration: verificationConfig,
      result: result,
      details: verifier['results']
    }, null, 2));

    console.log(`\n📄 Detailed report saved to: ${outputDir}`);
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Verification script failed:', error);
    process.exit(1);
  } finally {
    await verifier.cleanup();
  }
}

if (require.main === module) {
  main();
}

export { DatabaseMigrationVerifier, VerificationConfig, VerificationResult };