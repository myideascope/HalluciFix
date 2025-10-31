/**
 * Migration Cleanup Service
 * 
 * Handles cleanup of legacy Supabase resources after successful migration to AWS
 */

import { logger } from './logging';
import { supabase } from './supabase';

export interface CleanupTask {
  id: string;
  name: string;
  description: string;
  category: 'database' | 'storage' | 'auth' | 'configuration' | 'monitoring';
  priority: 'high' | 'medium' | 'low';
  requiresManualAction: boolean;
  estimatedDuration: number; // in seconds
}

export interface CleanupProgress {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number; // 0-100
  message: string;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  resourcesProcessed?: number;
  totalResources?: number;
}

export interface CleanupReport {
  overallStatus: 'success' | 'partial' | 'failed';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  totalDuration: number;
  resourcesCleaned: {
    databaseRecords: number;
    storageFiles: number;
    authUsers: number;
    configurationItems: number;
  };
  manualActionsRequired: string[];
  recommendations: string[];
  startTime: Date;
  endTime: Date;
}

class MigrationCleanupService {
  private cleanupLogger = logger.child({ component: 'MigrationCleanup' });
  private cleanupTasks: CleanupTask[] = [
    {
      id: 'backup-critical-data',
      name: 'Backup Critical Data',
      description: 'Create final backup of critical data before cleanup',
      category: 'database',
      priority: 'high',
      requiresManualAction: false,
      estimatedDuration: 300
    },
    {
      id: 'archive-user-data',
      name: 'Archive User Data',
      description: 'Archive user profiles and preferences',
      category: 'database',
      priority: 'high',
      requiresManualAction: false,
      estimatedDuration: 180
    },
    {
      id: 'cleanup-storage-files',
      name: 'Clean Up Storage Files',
      description: 'Remove files from Supabase storage (already migrated to S3)',
      category: 'storage',
      priority: 'medium',
      requiresManualAction: false,
      estimatedDuration: 600
    },
    {
      id: 'cleanup-auth-users',
      name: 'Clean Up Auth Users',
      description: 'Remove user authentication records (migrated to Cognito)',
      category: 'auth',
      priority: 'medium',
      requiresManualAction: true,
      estimatedDuration: 120
    },
    {
      id: 'remove-database-tables',
      name: 'Remove Database Tables',
      description: 'Drop non-critical tables and clean up database',
      category: 'database',
      priority: 'low',
      requiresManualAction: true,
      estimatedDuration: 240
    },
    {
      id: 'update-dns-records',
      name: 'Update DNS Records',
      description: 'Point DNS records to AWS services',
      category: 'configuration',
      priority: 'high',
      requiresManualAction: true,
      estimatedDuration: 60
    },
    {
      id: 'remove-environment-variables',
      name: 'Remove Environment Variables',
      description: 'Clean up Supabase-related environment variables',
      category: 'configuration',
      priority: 'medium',
      requiresManualAction: true,
      estimatedDuration: 30
    },
    {
      id: 'cancel-supabase-subscription',
      name: 'Cancel Supabase Subscription',
      description: 'Cancel Supabase subscription to avoid future charges',
      category: 'configuration',
      priority: 'high',
      requiresManualAction: true,
      estimatedDuration: 60
    },
    {
      id: 'update-monitoring',
      name: 'Update Monitoring',
      description: 'Update monitoring dashboards for AWS services',
      category: 'monitoring',
      priority: 'medium',
      requiresManualAction: true,
      estimatedDuration: 180
    },
    {
      id: 'archive-migration-logs',
      name: 'Archive Migration Logs',
      description: 'Archive migration logs and documentation',
      category: 'configuration',
      priority: 'low',
      requiresManualAction: false,
      estimatedDuration: 60
    }
  ];

  /**
   * Get all cleanup tasks
   */
  getCleanupTasks(): CleanupTask[] {
    return [...this.cleanupTasks];
  }

  /**
   * Execute cleanup process
   */
  async executeCleanup(
    selectedTaskIds?: string[],
    onProgress?: (progress: CleanupProgress) => void
  ): Promise<CleanupReport> {
    const startTime = new Date();
    this.cleanupLogger.info('Starting migration cleanup process');

    const tasksToExecute = selectedTaskIds 
      ? this.cleanupTasks.filter(task => selectedTaskIds.includes(task.id))
      : this.cleanupTasks;

    const progressMap = new Map<string, CleanupProgress>();
    const resourcesCleaned = {
      databaseRecords: 0,
      storageFiles: 0,
      authUsers: 0,
      configurationItems: 0
    };
    const manualActionsRequired: string[] = [];
    const recommendations: string[] = [];

    // Initialize progress for all tasks
    tasksToExecute.forEach(task => {
      progressMap.set(task.id, {
        taskId: task.id,
        status: 'pending',
        progress: 0,
        message: 'Waiting to start...'
      });
    });

    // Execute tasks in priority order
    const sortedTasks = tasksToExecute.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const task of sortedTasks) {
      const progress = progressMap.get(task.id)!;
      
      try {
        progress.status = 'running';
        progress.startTime = new Date();
        progress.message = `Executing ${task.name}...`;
        onProgress?.(progress);

        if (task.requiresManualAction) {
          // Skip manual tasks but record them
          progress.status = 'skipped';
          progress.progress = 100;
          progress.message = 'Manual action required';
          progress.endTime = new Date();
          manualActionsRequired.push(`${task.name}: ${task.description}`);
        } else {
          // Execute automated task
          const result = await this.executeTask(task, (taskProgress) => {
            progress.progress = taskProgress.progress;
            progress.message = taskProgress.message;
            progress.resourcesProcessed = taskProgress.resourcesProcessed;
            progress.totalResources = taskProgress.totalResources;
            onProgress?.(progress);
          });

          progress.status = result.success ? 'completed' : 'failed';
          progress.progress = 100;
          progress.message = result.message;
          progress.endTime = new Date();
          progress.error = result.error;

          // Update resource counts
          if (result.resourcesCleaned) {
            Object.keys(result.resourcesCleaned).forEach(key => {
              if (key in resourcesCleaned) {
                (resourcesCleaned as any)[key] += result.resourcesCleaned![key];
              }
            });
          }

          if (result.recommendations) {
            recommendations.push(...result.recommendations);
          }
        }

        onProgress?.(progress);

      } catch (error) {
        progress.status = 'failed';
        progress.progress = 100;
        progress.message = `Failed: ${(error as Error).message}`;
        progress.endTime = new Date();
        progress.error = (error as Error).message;
        onProgress?.(progress);

        this.cleanupLogger.error(`Task ${task.id} failed`, error as Error);
      }
    }

    const endTime = new Date();
    const totalDuration = endTime.getTime() - startTime.getTime();

    // Calculate overall status
    const completedTasks = Array.from(progressMap.values()).filter(p => p.status === 'completed').length;
    const failedTasks = Array.from(progressMap.values()).filter(p => p.status === 'failed').length;
    const skippedTasks = Array.from(progressMap.values()).filter(p => p.status === 'skipped').length;

    let overallStatus: CleanupReport['overallStatus'] = 'success';
    if (failedTasks > 0) {
      overallStatus = completedTasks > 0 ? 'partial' : 'failed';
    }

    const report: CleanupReport = {
      overallStatus,
      totalTasks: tasksToExecute.length,
      completedTasks,
      failedTasks,
      skippedTasks,
      totalDuration,
      resourcesCleaned,
      manualActionsRequired,
      recommendations,
      startTime,
      endTime
    };

    this.cleanupLogger.info('Migration cleanup completed', {
      overallStatus,
      totalTasks: tasksToExecute.length,
      completedTasks,
      failedTasks,
      skippedTasks,
      totalDuration
    });

    return report;
  }

  /**
   * Execute individual cleanup task
   */
  private async executeTask(
    task: CleanupTask,
    onProgress: (progress: { progress: number; message: string; resourcesProcessed?: number; totalResources?: number }) => void
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
    resourcesCleaned?: Record<string, number>;
    recommendations?: string[];
  }> {
    switch (task.id) {
      case 'backup-critical-data':
        return this.backupCriticalData(onProgress);
      
      case 'archive-user-data':
        return this.archiveUserData(onProgress);
      
      case 'cleanup-storage-files':
        return this.cleanupStorageFiles(onProgress);
      
      case 'archive-migration-logs':
        return this.archiveMigrationLogs(onProgress);
      
      default:
        return {
          success: false,
          message: `Unknown task: ${task.id}`,
          error: 'Task not implemented'
        };
    }
  }

  /**
   * Backup critical data before cleanup
   */
  private async backupCriticalData(
    onProgress: (progress: { progress: number; message: string; resourcesProcessed?: number; totalResources?: number }) => void
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
    resourcesCleaned?: Record<string, number>;
  }> {
    try {
      onProgress({ progress: 10, message: 'Identifying critical data...' });

      // Get critical tables data
      const criticalTables = ['users', 'analysis_results', 'user_subscriptions'];
      let totalRecords = 0;
      const backupData: Record<string, any[]> = {};

      for (let i = 0; i < criticalTables.length; i++) {
        const table = criticalTables[i];
        onProgress({ 
          progress: 20 + (i * 60 / criticalTables.length), 
          message: `Backing up ${table}...`,
          resourcesProcessed: i,
          totalResources: criticalTables.length
        });

        try {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(10000); // Limit for safety

          if (error) {
            this.cleanupLogger.warn(`Failed to backup table ${table}`, error);
            continue;
          }

          if (data) {
            backupData[table] = data;
            totalRecords += data.length;
          }
        } catch (error) {
          this.cleanupLogger.warn(`Error backing up table ${table}`, error as Error);
        }
      }

      onProgress({ progress: 90, message: 'Saving backup data...' });

      // Save backup data to local storage or download
      const backupJson = JSON.stringify(backupData, null, 2);
      const backupBlob = new Blob([backupJson], { type: 'application/json' });
      
      // Create download link
      const url = URL.createObjectURL(backupBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `supabase-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onProgress({ progress: 100, message: 'Backup completed' });

      return {
        success: true,
        message: `Successfully backed up ${totalRecords} records from ${Object.keys(backupData).length} tables`,
        resourcesCleaned: { databaseRecords: totalRecords }
      };

    } catch (error) {
      return {
        success: false,
        message: 'Backup failed',
        error: (error as Error).message
      };
    }
  }

  /**
   * Archive user data
   */
  private async archiveUserData(
    onProgress: (progress: { progress: number; message: string; resourcesProcessed?: number; totalResources?: number }) => void
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
    resourcesCleaned?: Record<string, number>;
  }> {
    try {
      onProgress({ progress: 20, message: 'Fetching user data...' });

      const { data: users, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        throw new Error(error.message);
      }

      onProgress({ progress: 60, message: 'Archiving user data...' });

      // Create user archive
      const userArchive = {
        timestamp: new Date().toISOString(),
        totalUsers: users?.length || 0,
        users: users || []
      };

      const archiveJson = JSON.stringify(userArchive, null, 2);
      const archiveBlob = new Blob([archiveJson], { type: 'application/json' });
      
      // Create download link
      const url = URL.createObjectURL(archiveBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-archive-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onProgress({ progress: 100, message: 'User data archived' });

      return {
        success: true,
        message: `Successfully archived ${users?.length || 0} user records`,
        resourcesCleaned: { databaseRecords: users?.length || 0 }
      };

    } catch (error) {
      return {
        success: false,
        message: 'User data archival failed',
        error: (error as Error).message
      };
    }
  }

  /**
   * Clean up storage files
   */
  private async cleanupStorageFiles(
    onProgress: (progress: { progress: number; message: string; resourcesProcessed?: number; totalResources?: number }) => void
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
    resourcesCleaned?: Record<string, number>;
    recommendations?: string[];
  }> {
    try {
      onProgress({ progress: 10, message: 'Listing storage files...' });

      const { data: files, error } = await supabase.storage
        .from('documents')
        .list('', { limit: 1000 });

      if (error) {
        throw new Error(error.message);
      }

      if (!files || files.length === 0) {
        return {
          success: true,
          message: 'No files found in storage',
          resourcesCleaned: { storageFiles: 0 }
        };
      }

      onProgress({ 
        progress: 30, 
        message: `Found ${files.length} files to clean up...`,
        totalResources: files.length
      });

      // For safety, we'll just report what would be cleaned up
      // Actual deletion should be done manually after verification
      const recommendations = [
        `${files.length} files found in Supabase storage`,
        'Verify all files have been successfully migrated to S3 before deletion',
        'Consider downloading a final backup of all files',
        'Delete files manually from Supabase dashboard after verification'
      ];

      onProgress({ progress: 100, message: 'Storage cleanup analysis completed' });

      return {
        success: true,
        message: `Found ${files.length} files for cleanup (manual action required)`,
        resourcesCleaned: { storageFiles: 0 }, // Not actually cleaned for safety
        recommendations
      };

    } catch (error) {
      return {
        success: false,
        message: 'Storage cleanup failed',
        error: (error as Error).message
      };
    }
  }

  /**
   * Archive migration logs
   */
  private async archiveMigrationLogs(
    onProgress: (progress: { progress: number; message: string }) => void
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
    resourcesCleaned?: Record<string, number>;
  }> {
    try {
      onProgress({ progress: 20, message: 'Collecting migration logs...' });

      const migrationData = {
        timestamp: new Date().toISOString(),
        migrationTimestamp: localStorage.getItem('hallucifix_migration_timestamp'),
        authMode: localStorage.getItem('hallucifix_migration_auth_mode'),
        dbMode: localStorage.getItem('hallucifix_migration_db_mode'),
        environment: process.env.NODE_ENV,
        awsRegion: process.env.AWS_REGION || process.env.VITE_AWS_REGION,
        cognitoUserPoolId: process.env.VITE_COGNITO_USER_POOL_ID,
        s3BucketName: process.env.VITE_S3_BUCKET_NAME,
        apiGatewayUrl: process.env.VITE_API_GATEWAY_URL
      };

      onProgress({ progress: 60, message: 'Creating migration archive...' });

      const archiveJson = JSON.stringify(migrationData, null, 2);
      const archiveBlob = new Blob([archiveJson], { type: 'application/json' });
      
      // Create download link
      const url = URL.createObjectURL(archiveBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migration-archive-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onProgress({ progress: 100, message: 'Migration logs archived' });

      return {
        success: true,
        message: 'Migration logs successfully archived',
        resourcesCleaned: { configurationItems: 1 }
      };

    } catch (error) {
      return {
        success: false,
        message: 'Migration log archival failed',
        error: (error as Error).message
      };
    }
  }
}

// Export singleton instance
export const migrationCleanupService = new MigrationCleanupService();

// Export types
export type { CleanupTask, CleanupProgress, CleanupReport };