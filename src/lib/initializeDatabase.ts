/**
 * Database Initialization
 * Handles database connection setup and schema migrations
 */

import { databaseService, initializeDatabase } from './database';
import { migrationService } from './migrationService';
import { config } from './config';
import { logger } from './logging';

const initLogger = logger.child({ component: 'DatabaseInitialization' });

export interface DatabaseInitializationResult {
  success: boolean;
  usingRDS: boolean;
  migrationsRun: number;
  error?: Error;
}

/**
 * Initialize database connection and run migrations
 */
export async function initializeDatabaseConnection(): Promise<DatabaseInitializationResult> {
  try {
    initLogger.info('Starting database initialization...');

    // Check if we should use RDS
    const shouldUseRDS = await config.shouldUseRDS();
    
    if (!shouldUseRDS) {
      initLogger.info('Using Supabase database (legacy mode)');
      return {
        success: true,
        usingRDS: false,
        migrationsRun: 0,
      };
    }

    initLogger.info('Initializing RDS PostgreSQL connection...');

    // Initialize database connection
    await initializeDatabase();

    initLogger.info('Database connection established successfully');

    // Run schema migrations
    initLogger.info('Running database migrations...');
    const migrations = migrationService.getCoreSchemamigrations();
    await migrationService.runMigrations(migrations);

    initLogger.info('Database initialization completed successfully', {
      usingRDS: true,
      migrationsRun: migrations.length,
    });

    return {
      success: true,
      usingRDS: true,
      migrationsRun: migrations.length,
    };

  } catch (error) {
    initLogger.error('Database initialization failed', error as Error);
    
    return {
      success: false,
      usingRDS: false,
      migrationsRun: 0,
      error: error as Error,
    };
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  usingRDS: boolean;
  connectionPool?: any;
  error?: Error;
}> {
  try {
    const shouldUseRDS = await config.shouldUseRDS();
    
    if (!shouldUseRDS) {
      return {
        healthy: true,
        usingRDS: false,
      };
    }

    // Test database connection
    const result = await databaseService.query('SELECT NOW() as current_time');
    
    if (result.error) {
      throw result.error;
    }

    return {
      healthy: true,
      usingRDS: true,
      connectionPool: databaseService.getPoolStatus(),
    };

  } catch (error) {
    return {
      healthy: false,
      usingRDS: false,
      error: error as Error,
    };
  }
}

/**
 * Gracefully close database connections
 */
export async function closeDatabaseConnections(): Promise<void> {
  try {
    await databaseService.close();
    initLogger.info('Database connections closed successfully');
  } catch (error) {
    initLogger.error('Error closing database connections', error as Error);
  }
}

/**
 * Validate database configuration
 */
export async function validateDatabaseConfiguration(): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const dbConfig = await config.getDatabase();
    const shouldUseRDS = await config.shouldUseRDS();

    if (shouldUseRDS) {
      // Validate RDS configuration
      if (!dbConfig.databaseUrl && !dbConfig.host) {
        errors.push('DATABASE_URL or DB_HOST must be configured for RDS');
      }

      if (!dbConfig.databaseUrl) {
        if (!dbConfig.username) {
          errors.push('DB_USER must be configured when not using DATABASE_URL');
        }
        if (!dbConfig.password) {
          errors.push('DB_PASSWORD must be configured when not using DATABASE_URL');
        }
        if (!dbConfig.database) {
          errors.push('DB_NAME must be configured when not using DATABASE_URL');
        }
      }

      // Check for legacy Supabase configuration
      if (dbConfig.supabaseUrl) {
        warnings.push('Supabase configuration detected alongside RDS - migration mode active');
      }

    } else {
      // Validate Supabase configuration
      if (!dbConfig.supabaseUrl) {
        errors.push('VITE_SUPABASE_URL must be configured for Supabase mode');
      }
      if (!dbConfig.supabaseAnonKey) {
        errors.push('VITE_SUPABASE_ANON_KEY must be configured for Supabase mode');
      }

      warnings.push('Using legacy Supabase database - consider migrating to RDS');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };

  } catch (error) {
    errors.push(`Configuration validation failed: ${(error as Error).message}`);
    return {
      valid: false,
      errors,
      warnings,
    };
  }
}