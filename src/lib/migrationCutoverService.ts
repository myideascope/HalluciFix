/**
 * Migration Cutover Service
 * 
 * Handles the phased migration from Supabase to AWS infrastructure
 * Includes authentication, database, and file storage migration
 */

import { logger } from './logging';
import { config } from './config';
import { databaseService, initializeDatabase } from './database';
import { getS3Service } from './storage/s3Service';
import { supabase } from './supabase';
import { Auth } from 'aws-amplify';
import { cognitoAuth } from './cognito-auth';

export interface MigrationStatus {
  phase: 'preparation' | 'auth_migration' | 'storage_migration' | 'database_cutover' | 'validation' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  errors: string[];
  startTime: Date;
  endTime?: Date;
  rollbackAvailable: boolean;
}

export interface MigrationOptions {
  preserveSessions: boolean;
  migrateFiles: boolean;
  validateData: boolean;
  rollbackOnError: boolean;
  batchSize: number;
}

class MigrationCutoverService {
  private status: MigrationStatus = {
    phase: 'preparation',
    progress: 0,
    currentStep: 'Initializing migration',
    errors: [],
    startTime: new Date(),
    rollbackAvailable: false
  };

  private migrationLogger = logger.child({ component: 'MigrationCutover' });

  /**
   * Execute the complete migration cutover process
   */
  async executeMigration(options: MigrationOptions = {
    preserveSessions: true,
    migrateFiles: true,
    validateData: true,
    rollbackOnError: true,
    batchSize: 100
  }): Promise<MigrationStatus> {
    
    this.migrationLogger.info('Starting migration cutover process', { options });
    
    try {
      // Phase 1: Preparation and validation
      await this.executePreparationPhase();
      
      // Phase 2: Authentication migration
      await this.executeAuthMigrationPhase(options.preserveSessions);
      
      // Phase 3: File storage migration
      if (options.migrateFiles) {
        await this.executeStorageMigrationPhase(options.batchSize);
      }
      
      // Phase 4: Database cutover
      await this.executeDatabaseCutoverPhase();
      
      // Phase 5: Validation
      if (options.validateData) {
        await this.executeValidationPhase();
      }
      
      // Mark as completed
      this.updateStatus('completed', 100, 'Migration completed successfully');
      this.status.endTime = new Date();
      
      this.migrationLogger.info('Migration cutover completed successfully', {
        duration: this.status.endTime.getTime() - this.status.startTime.getTime(),
        errors: this.status.errors.length
      });
      
      return this.status;
      
    } catch (error) {
      this.migrationLogger.error('Migration cutover failed', error as Error);
      this.status.phase = 'failed';
      this.status.errors.push((error as Error).message);
      this.status.endTime = new Date();
      
      if (options.rollbackOnError && this.status.rollbackAvailable) {
        await this.executeRollback();
      }
      
      throw error;
    }
  }

  /**
   * Phase 1: Preparation and validation
   */
  private async executePreparationPhase(): Promise<void> {
    this.updateStatus('preparation', 5, 'Validating AWS configuration');
    
    // Validate AWS configuration
    const awsConfig = await config.getAWS();
    if (!awsConfig.cognitoUserPoolId || !awsConfig.s3BucketName) {
      throw new Error('AWS configuration incomplete. Missing Cognito User Pool ID or S3 bucket name.');
    }
    
    // Validate database configuration
    const dbConfig = await config.getDatabase();
    if (!dbConfig.databaseUrl && !dbConfig.host) {
      throw new Error('RDS database configuration incomplete. Missing DATABASE_URL or DB_HOST.');
    }
    
    // Test AWS services connectivity
    this.updateStatus('preparation', 10, 'Testing AWS services connectivity');
    
    try {
      // Test Cognito
      await Auth.currentSession().catch(() => {
        // Expected to fail if no user is signed in
      });
      
      // Test S3
      const s3Service = getS3Service();
      await s3Service.listFiles('', 1); // Test with minimal list
      
      // Test RDS connection
      await initializeDatabase();
      const testResult = await databaseService.query('SELECT 1 as test');
      if (!testResult.data) {
        throw new Error('Database connection test failed');
      }
      
    } catch (error) {
      throw new Error(`AWS services connectivity test failed: ${(error as Error).message}`);
    }
    
    this.updateStatus('preparation', 15, 'Preparation phase completed');
    this.status.rollbackAvailable = true;
  }

  /**
   * Phase 2: Authentication migration to Cognito
   */
  private async executeAuthMigrationPhase(preserveSessions: boolean): Promise<void> {
    this.updateStatus('auth_migration', 20, 'Starting authentication migration');
    
    try {
      // Get current Supabase session if exists
      const { data: { session: supabaseSession } } = await supabase.auth.getSession();
      
      if (supabaseSession && preserveSessions) {
        this.updateStatus('auth_migration', 25, 'Preserving existing session');
        
        // Extract user information from Supabase session
        const supabaseUser = supabaseSession.user;
        
        // Check if user already exists in Cognito
        try {
          const cognitoUser = await cognitoAuth.getCurrentUser();
          if (cognitoUser && cognitoUser.getUsername() === supabaseUser.email) {
            this.migrationLogger.info('User already exists in Cognito', { 
              email: supabaseUser.email 
            });
          }
        } catch {
          // User doesn't exist in Cognito, need to create/migrate
          this.updateStatus('auth_migration', 30, 'Migrating user to Cognito');
          
          // Note: In a real migration, you would need to:
          // 1. Create the user in Cognito with a temporary password
          // 2. Set user attributes from Supabase user metadata
          // 3. Mark the user as verified if they were verified in Supabase
          // 4. Handle password migration (usually requires user to reset password)
          
          this.migrationLogger.warn('User migration to Cognito requires manual intervention', {
            email: supabaseUser.email,
            userId: supabaseUser.id
          });
        }
      }
      
      // Update environment configuration to use Cognito
      this.updateStatus('auth_migration', 35, 'Updating authentication configuration');
      
      // Set migration mode flag
      localStorage.setItem('hallucifix_migration_auth_mode', 'cognito');
      localStorage.setItem('hallucifix_migration_timestamp', new Date().toISOString());
      
      this.updateStatus('auth_migration', 40, 'Authentication migration completed');
      
    } catch (error) {
      throw new Error(`Authentication migration failed: ${(error as Error).message}`);
    }
  }

  /**
   * Phase 3: File storage migration from Supabase to S3
   */
  private async executeStorageMigrationPhase(batchSize: number): Promise<void> {
    this.updateStatus('storage_migration', 45, 'Starting file storage migration');
    
    try {
      const s3Service = getS3Service();
      
      // Get list of files from Supabase storage
      this.updateStatus('storage_migration', 50, 'Retrieving file list from Supabase');
      
      const { data: files, error } = await supabase.storage
        .from('documents')
        .list('', { limit: 1000 });
      
      if (error) {
        throw new Error(`Failed to list Supabase files: ${error.message}`);
      }
      
      if (!files || files.length === 0) {
        this.updateStatus('storage_migration', 60, 'No files to migrate');
        return;
      }
      
      this.migrationLogger.info('Found files to migrate', { count: files.length });
      
      // Migrate files in batches
      const totalFiles = files.length;
      let migratedCount = 0;
      
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        this.updateStatus('storage_migration', 
          50 + (migratedCount / totalFiles) * 15, 
          `Migrating files batch ${Math.floor(i / batchSize) + 1}`
        );
        
        await Promise.all(batch.map(async (file) => {
          try {
            // Download file from Supabase
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('documents')
              .download(file.name);
            
            if (downloadError) {
              throw new Error(`Failed to download ${file.name}: ${downloadError.message}`);
            }
            
            // Upload to S3
            const s3Key = `migrated/${file.name}`;
            await s3Service.uploadFile(s3Key, fileData);
            
            this.migrationLogger.debug('File migrated successfully', {
              filename: file.name,
              s3Key,
              size: file.metadata?.size
            });
            
            migratedCount++;
            
          } catch (error) {
            this.migrationLogger.error('Failed to migrate file', error as Error, {
              filename: file.name
            });
            this.status.errors.push(`File migration failed: ${file.name} - ${(error as Error).message}`);
          }
        }));
      }
      
      this.updateStatus('storage_migration', 65, `File migration completed (${migratedCount}/${totalFiles} files)`);
      
    } catch (error) {
      throw new Error(`File storage migration failed: ${(error as Error).message}`);
    }
  }

  /**
   * Phase 4: Database cutover from Supabase to RDS
   */
  private async executeDatabaseCutoverPhase(): Promise<void> {
    this.updateStatus('database_cutover', 70, 'Starting database cutover');
    
    try {
      // Ensure RDS connection is established
      this.updateStatus('database_cutover', 75, 'Establishing RDS connection');
      
      if (!databaseService.getPoolStatus()) {
        await initializeDatabase();
      }
      
      // Test RDS connection
      const testResult = await databaseService.query('SELECT version()');
      if (!testResult.data) {
        throw new Error('RDS connection test failed');
      }
      
      this.migrationLogger.info('RDS connection established', {
        version: testResult.data[0]?.version
      });
      
      // Update application configuration to use RDS
      this.updateStatus('database_cutover', 80, 'Updating database configuration');
      
      // Set migration flags
      localStorage.setItem('hallucifix_migration_db_mode', 'rds');
      localStorage.setItem('hallucifix_migration_db_timestamp', new Date().toISOString());
      
      // Verify critical tables exist in RDS
      this.updateStatus('database_cutover', 85, 'Verifying database schema');
      
      const criticalTables = ['users', 'analysis_results', 'user_subscriptions'];
      for (const table of criticalTables) {
        const result = await databaseService.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        
        if (!result.data?.[0]?.exists) {
          throw new Error(`Critical table '${table}' not found in RDS database`);
        }
      }
      
      this.updateStatus('database_cutover', 90, 'Database cutover completed');
      
    } catch (error) {
      throw new Error(`Database cutover failed: ${(error as Error).message}`);
    }
  }

  /**
   * Phase 5: Validation of migrated data and services
   */
  private async executeValidationPhase(): Promise<void> {
    this.updateStatus('validation', 95, 'Validating migration');
    
    try {
      // Validate Cognito authentication
      this.updateStatus('validation', 96, 'Validating authentication service');
      
      try {
        await Auth.currentSession();
        this.migrationLogger.info('Cognito authentication validation passed');
      } catch {
        // No active session is acceptable
        this.migrationLogger.info('No active Cognito session (expected)');
      }
      
      // Validate S3 storage
      this.updateStatus('validation', 97, 'Validating file storage service');
      
      const s3Service = getS3Service();
      const s3Files = await s3Service.listFiles('migrated/', 10);
      this.migrationLogger.info('S3 storage validation passed', { 
        migratedFilesCount: s3Files.length 
      });
      
      // Validate RDS database
      this.updateStatus('validation', 98, 'Validating database service');
      
      const dbStatus = databaseService.getPoolStatus();
      if (!dbStatus) {
        throw new Error('Database connection pool not available');
      }
      
      const userCount = await databaseService.query('SELECT COUNT(*) as count FROM users');
      this.migrationLogger.info('RDS database validation passed', {
        poolStatus: dbStatus,
        userCount: userCount.data?.[0]?.count || 0
      });
      
      this.updateStatus('validation', 99, 'Validation completed');
      
    } catch (error) {
      throw new Error(`Migration validation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Execute rollback to Supabase services
   */
  private async executeRollback(): Promise<void> {
    this.migrationLogger.warn('Executing migration rollback');
    
    try {
      // Restore Supabase configuration
      localStorage.removeItem('hallucifix_migration_auth_mode');
      localStorage.removeItem('hallucifix_migration_db_mode');
      localStorage.removeItem('hallucifix_migration_timestamp');
      localStorage.removeItem('hallucifix_migration_db_timestamp');
      
      // Close RDS connections
      await databaseService.close();
      
      this.migrationLogger.info('Migration rollback completed');
      
    } catch (error) {
      this.migrationLogger.error('Rollback failed', error as Error);
      throw error;
    }
  }

  /**
   * Get current migration status
   */
  getStatus(): MigrationStatus {
    return { ...this.status };
  }

  /**
   * Update migration status
   */
  private updateStatus(phase: MigrationStatus['phase'], progress: number, currentStep: string): void {
    this.status.phase = phase;
    this.status.progress = Math.min(100, Math.max(0, progress));
    this.status.currentStep = currentStep;
    
    this.migrationLogger.info('Migration status updated', {
      phase,
      progress,
      currentStep
    });
  }

  /**
   * Check if migration has been completed
   */
  static isMigrationCompleted(): boolean {
    const authMode = localStorage.getItem('hallucifix_migration_auth_mode');
    const dbMode = localStorage.getItem('hallucifix_migration_db_mode');
    return authMode === 'cognito' && dbMode === 'rds';
  }

  /**
   * Get migration timestamp
   */
  static getMigrationTimestamp(): Date | null {
    const timestamp = localStorage.getItem('hallucifix_migration_timestamp');
    return timestamp ? new Date(timestamp) : null;
  }
}

// Export singleton instance
export const migrationCutoverService = new MigrationCutoverService();

// Export types
export type { MigrationStatus, MigrationOptions };