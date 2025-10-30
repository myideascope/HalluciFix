/**
 * Database Migration Service
 * Handles schema migrations from Supabase to RDS PostgreSQL
 */

import { databaseService } from './database';
import { logger } from './logging';

const migrationLogger = logger.child({ component: 'MigrationService' });

export interface MigrationScript {
  version: string;
  name: string;
  sql: string;
  rollback?: string;
}

class MigrationService {
  /**
   * Create migrations table if it doesn't exist
   */
  private async ensureMigrationsTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        checksum VARCHAR(64)
      );
    `;

    const result = await databaseService.query(createTableSQL);
    if (result.error) {
      throw new Error(`Failed to create migrations table: ${result.error.message}`);
    }

    migrationLogger.info('Migrations table ensured');
  }

  /**
   * Get applied migrations
   */
  private async getAppliedMigrations(): Promise<string[]> {
    const result = await databaseService.select('schema_migrations', 'version');
    if (result.error) {
      throw new Error(`Failed to get applied migrations: ${result.error.message}`);
    }

    return result.data?.map(row => row.version) || [];
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: MigrationScript): Promise<void> {
    const startTime = Date.now();

    try {
      // Execute migration in transaction
      const transactionResult = await databaseService.transaction(async (client) => {
        // Execute migration SQL
        await client.query(migration.sql);

        // Record migration as applied
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name]
        );

        return true;
      });

      if (transactionResult.error) {
        throw transactionResult.error;
      }

      const duration = Date.now() - startTime;
      migrationLogger.info('Migration applied successfully', {
        version: migration.version,
        name: migration.name,
        duration,
      });

    } catch (error) {
      migrationLogger.error('Migration failed', error as Error, {
        version: migration.version,
        name: migration.name,
      });
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(migrations: MigrationScript[]): Promise<void> {
    await this.ensureMigrationsTable();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const pendingMigrations = migrations.filter(
      migration => !appliedMigrations.includes(migration.version)
    );

    if (pendingMigrations.length === 0) {
      migrationLogger.info('No pending migrations');
      return;
    }

    migrationLogger.info(`Running ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    migrationLogger.info('All migrations completed successfully');
  }

  /**
   * Get core schema migrations for HalluciFix
   */
  getCoreSchemamigrations(): MigrationScript[] {
    return [
      {
        version: '001_initial_schema',
        name: 'Create initial schema',
        sql: `
          -- Create users table (replacing auth.users reference)
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            encrypted_password VARCHAR(255),
            email_confirmed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            role VARCHAR(50) DEFAULT 'user',
            subscription_tier VARCHAR(50) DEFAULT 'free',
            subscription_status VARCHAR(50) DEFAULT 'active'
          );

          -- Create analysis_results table
          CREATE TABLE IF NOT EXISTS analysis_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            content TEXT NOT NULL,
            accuracy REAL NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
            risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
            hallucinations JSONB NOT NULL DEFAULT '[]'::jsonb,
            verification_sources INTEGER NOT NULL DEFAULT 0,
            processing_time INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create scheduled_scans table
          CREATE TABLE IF NOT EXISTS scheduled_scans (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
            time VARCHAR(5) NOT NULL, -- HH:MM format
            sources TEXT[],
            google_drive_files JSONB,
            enabled BOOLEAN DEFAULT true,
            last_run TIMESTAMPTZ,
            next_run TIMESTAMPTZ,
            status VARCHAR(20) DEFAULT 'pending',
            results JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create scan_executor_logs table
          CREATE TABLE IF NOT EXISTS scan_executor_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            execution_id VARCHAR(255) NOT NULL,
            status VARCHAR(20) NOT NULL,
            scans_processed INTEGER DEFAULT 0,
            scans_successful INTEGER DEFAULT 0,
            scans_failed INTEGER DEFAULT 0,
            execution_time_ms INTEGER DEFAULT 0,
            error_message TEXT,
            details JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create indexes for performance
          CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id_created_at 
            ON analysis_results(user_id, created_at DESC);
          
          CREATE INDEX IF NOT EXISTS idx_scheduled_scans_user_id 
            ON scheduled_scans(user_id);
          
          CREATE INDEX IF NOT EXISTS idx_scheduled_scans_next_run 
            ON scheduled_scans(next_run) WHERE enabled = true;
          
          CREATE INDEX IF NOT EXISTS idx_scan_executor_logs_execution_id 
            ON scan_executor_logs(execution_id);
        `,
      },
      {
        version: '002_billing_tables',
        name: 'Create billing and subscription tables',
        sql: `
          -- Create subscriptions table
          CREATE TABLE IF NOT EXISTS subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            stripe_subscription_id VARCHAR(255) UNIQUE,
            stripe_customer_id VARCHAR(255),
            plan_id VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL,
            current_period_start TIMESTAMPTZ,
            current_period_end TIMESTAMPTZ,
            cancel_at_period_end BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create usage_tracking table
          CREATE TABLE IF NOT EXISTS usage_tracking (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
            usage_type VARCHAR(50) NOT NULL,
            usage_count INTEGER NOT NULL DEFAULT 0,
            period_start TIMESTAMPTZ NOT NULL,
            period_end TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create billing_events table
          CREATE TABLE IF NOT EXISTS billing_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
            event_type VARCHAR(100) NOT NULL,
            stripe_event_id VARCHAR(255) UNIQUE,
            event_data JSONB,
            processed_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create indexes
          CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id 
            ON subscriptions(user_id);
          
          CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id 
            ON subscriptions(stripe_customer_id);
          
          CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id_period 
            ON usage_tracking(user_id, period_start, period_end);
          
          CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event_id 
            ON billing_events(stripe_event_id);
        `,
      },
      {
        version: '003_oauth_tables',
        name: 'Create OAuth and session tables',
        sql: `
          -- Create oauth_tokens table
          CREATE TABLE IF NOT EXISTS oauth_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            provider VARCHAR(50) NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_type VARCHAR(50) DEFAULT 'Bearer',
            expires_at TIMESTAMPTZ,
            scope TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create user_sessions table
          CREATE TABLE IF NOT EXISTS user_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            session_token VARCHAR(255) UNIQUE NOT NULL,
            refresh_token VARCHAR(255) UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
            ip_address INET,
            user_agent TEXT
          );

          -- Create oauth_states table for CSRF protection
          CREATE TABLE IF NOT EXISTS oauth_states (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            state_token VARCHAR(255) UNIQUE NOT NULL,
            provider VARCHAR(50) NOT NULL,
            redirect_uri TEXT,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create indexes
          CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id_provider 
            ON oauth_tokens(user_id, provider);
          
          CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id 
            ON user_sessions(user_id);
          
          CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token 
            ON user_sessions(session_token);
          
          CREATE INDEX IF NOT EXISTS idx_oauth_states_state_token 
            ON oauth_states(state_token);
          
          -- Clean up expired sessions and states
          CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at 
            ON user_sessions(expires_at);
          
          CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at 
            ON oauth_states(expires_at);
        `,
      },
      {
        version: '004_monitoring_tables',
        name: 'Create monitoring and logging tables',
        sql: `
          -- Create query_performance_log table
          CREATE TABLE IF NOT EXISTS query_performance_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            query_name VARCHAR(255),
            execution_time INTEGER NOT NULL,
            table_name VARCHAR(255),
            operation VARCHAR(50),
            row_count INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create security_audit_log table
          CREATE TABLE IF NOT EXISTS security_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            operation VARCHAR(100) NOT NULL,
            table_name VARCHAR(255),
            record_id UUID,
            old_values JSONB,
            new_values JSONB,
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create security_events table
          CREATE TABLE IF NOT EXISTS security_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_type VARCHAR(100) NOT NULL,
            severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            ip_address INET,
            user_agent TEXT,
            event_data JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create capacity_metrics_log table
          CREATE TABLE IF NOT EXISTS capacity_metrics_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            timestamp TIMESTAMPTZ NOT NULL,
            total_users INTEGER,
            active_users INTEGER,
            total_analyses INTEGER,
            avg_processing_time REAL,
            peak_concurrent_users INTEGER,
            storage_usage_gb REAL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create maintenance_log table
          CREATE TABLE IF NOT EXISTS maintenance_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            operation VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            details JSONB,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          -- Create indexes
          CREATE INDEX IF NOT EXISTS idx_query_performance_log_created_at 
            ON query_performance_log(created_at DESC);
          
          CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id_created_at 
            ON security_audit_log(user_id, created_at DESC);
          
          CREATE INDEX IF NOT EXISTS idx_security_events_severity_created_at 
            ON security_events(severity, created_at DESC);
          
          CREATE INDEX IF NOT EXISTS idx_capacity_metrics_log_timestamp 
            ON capacity_metrics_log(timestamp DESC);
        `,
      },
    ];
  }
}

export const migrationService = new MigrationService();