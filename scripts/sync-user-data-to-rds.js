#!/usr/bin/env node

/**
 * User Data Synchronization Script: Supabase to AWS RDS
 * 
 * This script synchronizes user-related data from Supabase to AWS RDS PostgreSQL.
 * It handles users table data, analysis results, scheduled scans, and maintains
 * referential integrity during the migration.
 * 
 * Usage:
 *   node scripts/sync-user-data-to-rds.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be synchronized without making changes
 *   --users-only       Sync only user profile data
 *   --data-only        Sync only user-related data (analysis, scans)
 *   --batch-size=N     Process N records at a time (default: 100)
 *   --help             Show this help message
 */

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  rds: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hallucifix',
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
  sync: {
    dryRun: process.argv.includes('--dry-run'),
    usersOnly: process.argv.includes('--users-only'),
    dataOnly: process.argv.includes('--data-only'),
    batchSize: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 100,
  }
};

// Validate configuration
function validateConfig() {
  const missing = [];
  
  if (!config.supabase.url) missing.push('VITE_SUPABASE_URL');
  if (!config.supabase.serviceKey) missing.push('SUPABASE_SERVICE_KEY');
  if (!config.rds.host) missing.push('DB_HOST');
  if (!config.rds.username) missing.push('DB_USERNAME');
  if (!config.rds.password) missing.push('DB_PASSWORD');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(var => console.error(`   - ${var}`));
    console.error('\nPlease set these variables and try again.');
    process.exit(1);
  }
}

// Initialize clients
function initializeClients() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  
  const rds = new Client({
    host: config.rds.host,
    port: config.rds.port,
    database: config.rds.database,
    user: config.rds.username,
    password: config.rds.password,
    ssl: config.rds.ssl ? { rejectUnauthorized: false } : false,
  });
  
  return { supabase, rds };
}

// Create RDS schema if it doesn't exist
async function ensureRDSSchema(rds) {
  console.log('🔧 Ensuring RDS schema exists...');
  
  try {
    // Create users table
    await rds.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        name text NOT NULL,
        avatar_url text,
        role_id text NOT NULL DEFAULT 'viewer',
        department text NOT NULL DEFAULT 'General',
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
        last_active timestamptz DEFAULT now(),
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        -- Migration tracking
        supabase_id uuid,
        cognito_id text,
        migrated_at timestamptz DEFAULT now()
      );
    `);
    
    // Create analysis_results table
    await rds.query(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        content text NOT NULL,
        accuracy real NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
        risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        hallucinations jsonb NOT NULL DEFAULT '[]'::jsonb,
        verification_sources integer NOT NULL DEFAULT 0,
        processing_time integer NOT NULL DEFAULT 0,
        created_at timestamptz DEFAULT now(),
        -- Migration tracking
        supabase_id uuid,
        migrated_at timestamptz DEFAULT now()
      );
    `);
    
    // Create scheduled_scans table
    await rds.query(`
      CREATE TABLE IF NOT EXISTS scheduled_scans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        name text NOT NULL,
        description text,
        frequency text NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
        time text NOT NULL,
        sources jsonb DEFAULT '[]'::jsonb,
        google_drive_files jsonb DEFAULT '[]'::jsonb,
        enabled boolean DEFAULT true,
        last_run timestamp with time zone,
        next_run timestamp with time zone NOT NULL,
        status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'completed')),
        results jsonb,
        created_at timestamp with time zone DEFAULT now(),
        -- Migration tracking
        supabase_id uuid,
        migrated_at timestamptz DEFAULT now()
      );
    `);
    
    // Create indexes
    await rds.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_id);
      CREATE INDEX IF NOT EXISTS idx_users_cognito_id ON users(cognito_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_results_supabase_id ON analysis_results(supabase_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_scans_user_id ON scheduled_scans(user_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_scans_supabase_id ON scheduled_scans(supabase_id);
    `);
    
    console.log('✅ RDS schema ready');
    
  } catch (error) {
    console.error('❌ Failed to create RDS schema:', error.message);
    throw error;
  }
}

// Fetch users from Supabase
async function fetchSupabaseUsers(supabase) {
  console.log('📥 Fetching users from Supabase...');
  
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at');
    
    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
    
    console.log(`✅ Found ${users.length} users in Supabase`);
    return users;
    
  } catch (error) {
    console.error('❌ Failed to fetch Supabase users:', error.message);
    throw error;
  }
}

// Sync users to RDS
async function syncUsers(supabase, rds, users) {
  console.log(`👥 Syncing ${users.length} users to RDS...`);
  
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  for (const user of users) {
    try {
      if (config.sync.dryRun) {
        console.log(`🔍 [DRY RUN] Would sync user: ${user.email}`);
        results.created++;
        continue;
      }
      
      // Check if user already exists
      const existingUser = await rds.query(
        'SELECT id, supabase_id FROM users WHERE email = $1 OR supabase_id = $2',
        [user.email, user.id]
      );
      
      if (existingUser.rows.length > 0) {
        // Update existing user
        await rds.query(`
          UPDATE users SET
            name = $1,
            avatar_url = $2,
            role_id = $3,
            department = $4,
            status = $5,
            last_active = $6,
            updated_at = now(),
            supabase_id = $7
          WHERE email = $8 OR supabase_id = $9
        `, [
          user.name,
          user.avatar_url,
          user.role_id,
          user.department,
          user.status,
          user.last_active,
          user.id,
          user.email,
          user.id
        ]);
        
        console.log(`🔄 Updated user: ${user.email}`);
        results.updated++;
      } else {
        // Create new user
        await rds.query(`
          INSERT INTO users (
            email, name, avatar_url, role_id, department, status,
            last_active, created_at, updated_at, supabase_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)
        `, [
          user.email,
          user.name,
          user.avatar_url,
          user.role_id,
          user.department,
          user.status,
          user.last_active,
          user.created_at,
          user.id
        ]);
        
        console.log(`✅ Created user: ${user.email}`);
        results.created++;
      }
      
    } catch (error) {
      console.error(`❌ Failed to sync user ${user.email}:`, error.message);
      results.failed++;
      results.errors.push({
        email: user.email,
        error: error.message,
      });
    }
  }
  
  return results;
}

// Fetch analysis results from Supabase
async function fetchAnalysisResults(supabase, batchSize = 1000) {
  console.log('📊 Fetching analysis results from Supabase...');
  
  try {
    let allResults = [];
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const { data: results, error } = await supabase
        .from('analysis_results')
        .select('*')
        .order('created_at')
        .range(offset, offset + batchSize - 1);
      
      if (error) {
        throw new Error(`Failed to fetch analysis results: ${error.message}`);
      }
      
      allResults = allResults.concat(results);
      hasMore = results.length === batchSize;
      offset += batchSize;
      
      console.log(`📊 Fetched ${allResults.length} analysis results...`);
    }
    
    console.log(`✅ Found ${allResults.length} analysis results in Supabase`);
    return allResults;
    
  } catch (error) {
    console.error('❌ Failed to fetch analysis results:', error.message);
    throw error;
  }
}

// Sync analysis results to RDS
async function syncAnalysisResults(supabase, rds, analysisResults) {
  console.log(`📊 Syncing ${analysisResults.length} analysis results to RDS...`);
  
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  // Create user ID mapping
  const userMapping = await rds.query('SELECT id, supabase_id FROM users WHERE supabase_id IS NOT NULL');
  const userIdMap = new Map(userMapping.rows.map(row => [row.supabase_id, row.id]));
  
  for (const result of analysisResults) {
    try {
      if (config.sync.dryRun) {
        console.log(`🔍 [DRY RUN] Would sync analysis result: ${result.id}`);
        results.created++;
        continue;
      }
      
      // Map user ID
      const rdsUserId = userIdMap.get(result.user_id);
      if (!rdsUserId) {
        console.warn(`⚠️ Skipping analysis result ${result.id}: user not found`);
        results.skipped++;
        continue;
      }
      
      // Check if analysis result already exists
      const existing = await rds.query(
        'SELECT id FROM analysis_results WHERE supabase_id = $1',
        [result.id]
      );
      
      if (existing.rows.length > 0) {
        results.skipped++;
        continue;
      }
      
      // Create analysis result
      await rds.query(`
        INSERT INTO analysis_results (
          user_id, content, accuracy, risk_level, hallucinations,
          verification_sources, processing_time, created_at, supabase_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        rdsUserId,
        result.content,
        result.accuracy,
        result.risk_level,
        JSON.stringify(result.hallucinations),
        result.verification_sources,
        result.processing_time,
        result.created_at,
        result.id
      ]);
      
      results.created++;
      
      if (results.created % 100 === 0) {
        console.log(`📊 Synced ${results.created} analysis results...`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to sync analysis result ${result.id}:`, error.message);
      results.failed++;
      results.errors.push({
        id: result.id,
        error: error.message,
      });
    }
  }
  
  return results;
}

// Fetch scheduled scans from Supabase
async function fetchScheduledScans(supabase) {
  console.log('⏰ Fetching scheduled scans from Supabase...');
  
  try {
    const { data: scans, error } = await supabase
      .from('scheduled_scans')
      .select('*')
      .order('created_at');
    
    if (error) {
      throw new Error(`Failed to fetch scheduled scans: ${error.message}`);
    }
    
    console.log(`✅ Found ${scans.length} scheduled scans in Supabase`);
    return scans;
    
  } catch (error) {
    console.error('❌ Failed to fetch scheduled scans:', error.message);
    throw error;
  }
}

// Sync scheduled scans to RDS
async function syncScheduledScans(supabase, rds, scans) {
  console.log(`⏰ Syncing ${scans.length} scheduled scans to RDS...`);
  
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  // Create user ID mapping
  const userMapping = await rds.query('SELECT id, supabase_id FROM users WHERE supabase_id IS NOT NULL');
  const userIdMap = new Map(userMapping.rows.map(row => [row.supabase_id, row.id]));
  
  for (const scan of scans) {
    try {
      if (config.sync.dryRun) {
        console.log(`🔍 [DRY RUN] Would sync scheduled scan: ${scan.name}`);
        results.created++;
        continue;
      }
      
      // Map user ID
      const rdsUserId = userIdMap.get(scan.user_id);
      if (!rdsUserId) {
        console.warn(`⚠️ Skipping scheduled scan ${scan.id}: user not found`);
        results.skipped++;
        continue;
      }
      
      // Check if scan already exists
      const existing = await rds.query(
        'SELECT id FROM scheduled_scans WHERE supabase_id = $1',
        [scan.id]
      );
      
      if (existing.rows.length > 0) {
        results.skipped++;
        continue;
      }
      
      // Create scheduled scan
      await rds.query(`
        INSERT INTO scheduled_scans (
          user_id, name, description, frequency, time, sources,
          google_drive_files, enabled, last_run, next_run, status,
          results, created_at, supabase_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        rdsUserId,
        scan.name,
        scan.description,
        scan.frequency,
        scan.time,
        JSON.stringify(scan.sources),
        JSON.stringify(scan.google_drive_files),
        scan.enabled,
        scan.last_run,
        scan.next_run,
        scan.status,
        JSON.stringify(scan.results),
        scan.created_at,
        scan.id
      ]);
      
      console.log(`✅ Created scheduled scan: ${scan.name}`);
      results.created++;
      
    } catch (error) {
      console.error(`❌ Failed to sync scheduled scan ${scan.name}:`, error.message);
      results.failed++;
      results.errors.push({
        name: scan.name,
        error: error.message,
      });
    }
  }
  
  return results;
}

// Generate synchronization report
function generateReport(results, outputPath) {
  const report = {
    timestamp: new Date().toISOString(),
    configuration: {
      dryRun: config.sync.dryRun,
      usersOnly: config.sync.usersOnly,
      dataOnly: config.sync.dataOnly,
      batchSize: config.sync.batchSize,
    },
    results,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📄 Synchronization report saved to: ${outputPath}`);
}

// Main synchronization function
async function syncUserData() {
  console.log('🔄 Starting user data synchronization from Supabase to RDS\n');
  
  if (config.sync.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize clients
    const { supabase, rds } = initializeClients();
    
    // Connect to RDS
    await rds.connect();
    console.log('✅ Connected to RDS');
    
    // Ensure RDS schema exists
    await ensureRDSSchema(rds);
    
    const overallResults = {
      users: null,
      analysisResults: null,
      scheduledScans: null,
    };
    
    // Sync users (unless data-only mode)
    if (!config.sync.dataOnly) {
      const users = await fetchSupabaseUsers(supabase);
      overallResults.users = await syncUsers(supabase, rds, users);
    }
    
    // Sync user data (unless users-only mode)
    if (!config.sync.usersOnly) {
      // Sync analysis results
      const analysisResults = await fetchAnalysisResults(supabase, config.sync.batchSize);
      overallResults.analysisResults = await syncAnalysisResults(supabase, rds, analysisResults);
      
      // Sync scheduled scans
      const scheduledScans = await fetchScheduledScans(supabase);
      overallResults.scheduledScans = await syncScheduledScans(supabase, rds, scheduledScans);
    }
    
    // Generate report
    const reportPath = path.join(__dirname, '..', 'migration-reports', `user-data-sync-${Date.now()}.json`);
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    generateReport(overallResults, reportPath);
    
    // Summary
    console.log('\n🎉 User data synchronization completed!');
    
    if (overallResults.users) {
      console.log(`👥 Users: ${overallResults.users.created} created, ${overallResults.users.updated} updated, ${overallResults.users.failed} failed`);
    }
    
    if (overallResults.analysisResults) {
      console.log(`📊 Analysis Results: ${overallResults.analysisResults.created} created, ${overallResults.analysisResults.failed} failed`);
    }
    
    if (overallResults.scheduledScans) {
      console.log(`⏰ Scheduled Scans: ${overallResults.scheduledScans.created} created, ${overallResults.scheduledScans.failed} failed`);
    }
    
    // Close RDS connection
    await rds.end();
    
  } catch (error) {
    console.error('\n❌ Synchronization failed:', error.message);
    process.exit(1);
  }
}

// Show help
function showHelp() {
  console.log(`
User Data Synchronization Script: Supabase to AWS RDS

Usage:
  node scripts/sync-user-data-to-rds.js [options]

Options:
  --dry-run          Show what would be synchronized without making changes
  --users-only       Sync only user profile data
  --data-only        Sync only user-related data (analysis, scans)
  --batch-size=N     Process N records at a time (default: 100)
  --help             Show this help message

Environment Variables Required:
  VITE_SUPABASE_URL           Supabase project URL
  SUPABASE_SERVICE_KEY        Supabase service role key
  DB_HOST                     RDS database host
  DB_PORT                     RDS database port (default: 5432)
  DB_NAME                     RDS database name (default: hallucifix)
  DB_USERNAME                 RDS database username
  DB_PASSWORD                 RDS database password
  DB_SSL                      Use SSL connection (default: false)

Examples:
  # Dry run to see what would be synchronized
  node scripts/sync-user-data-to-rds.js --dry-run

  # Sync only user profiles
  node scripts/sync-user-data-to-rds.js --users-only

  # Sync only user data (analysis results, scans)
  node scripts/sync-user-data-to-rds.js --data-only

  # Sync with smaller batch size
  node scripts/sync-user-data-to-rds.js --batch-size=50
`);
}

// Main execution
if (process.argv.includes('--help')) {
  showHelp();
} else {
  syncUserData().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}