import { supabase } from './supabase';
import { logger } from './logging';

export interface ArchivalPolicy {
  tableName: string;
  retentionDays: number;
  archiveTableName: string;
  compressionEnabled: boolean;
  batchSize: number;
  conditions?: Record<string, any>;
}

export interface ArchivalResult {
  tableName: string;
  recordsArchived: number;
  recordsDeleted: number;
  compressionRatio?: number;
  duration: number;
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

export interface CleanupPolicy {
  tableName: string;
  retentionDays: number;
  conditions?: Record<string, any>;
  cascadeDelete: boolean;
}

class DataArchivalService {
  private defaultPolicies: ArchivalPolicy[] = [
    {
      tableName: 'analysis_results',
      retentionDays: 730, // 2 years
      archiveTableName: 'analysis_results_archive',
      compressionEnabled: true,
      batchSize: 1000
    },
    {
      tableName: 'query_performance_log',
      retentionDays: 90, // 3 months
      archiveTableName: 'query_performance_log_archive',
      compressionEnabled: true,
      batchSize: 5000
    },
    {
      tableName: 'maintenance_log',
      retentionDays: 365, // 1 year
      archiveTableName: 'maintenance_log_archive',
      compressionEnabled: false,
      batchSize: 1000
    }
  ];

  private cleanupPolicies: CleanupPolicy[] = [
    {
      tableName: 'connection_pool_stats',
      retentionDays: 30,
      cascadeDelete: false
    },
    {
      tableName: 'temporary_uploads',
      retentionDays: 7,
      cascadeDelete: true
    }
  ];

  async createArchiveTables(): Promise<void> {
    for (const policy of this.defaultPolicies) {
      await this.createArchiveTable(policy);
    }
  }

  private async createArchiveTable(policy: ArchivalPolicy): Promise<void> {
    try {
      // Create archive table with same structure as source table
      const { error } = await supabase.rpc('create_archive_table', {
        source_table: policy.tableName,
        archive_table: policy.archiveTableName,
        enable_compression: policy.compressionEnabled
      });

      if (error) {
        logger.error(`Failed to create archive table ${policy.archiveTableName}`, error instanceof Error ? error : new Error(String(error)));
      } else {
        logger.info(`Archive table ${policy.archiveTableName} created successfully`);
      }
    } catch (error) {
      logger.error(`Error creating archive table ${policy.archiveTableName}`, error instanceof Error ? error : new Error(String(error)));
    }
  }

  async archiveData(policy?: ArchivalPolicy): Promise<ArchivalResult[]> {
    const policies = policy ? [policy] : this.defaultPolicies;
    const results: ArchivalResult[] = [];

    for (const archivalPolicy of policies) {
      const result = await this.archiveTableData(archivalPolicy);
      results.push(result);
    }

    return results;
  }

  private async archiveTableData(policy: ArchivalPolicy): Promise<ArchivalResult> {
    const startTime = Date.now();
    let recordsArchived = 0;
    let recordsDeleted = 0;
    let status: ArchivalResult['status'] = 'success';
    let error: string | undefined;

    try {
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

      // Get count of records to archive
      const { count: totalRecords } = await supabase
        .from(policy.tableName)
        .select('*', { count: 'exact', head: true })
        .lt('created_at', cutoffDate.toISOString());

      if (!totalRecords || totalRecords === 0) {
        return {
          tableName: policy.tableName,
          recordsArchived: 0,
          recordsDeleted: 0,
          duration: Date.now() - startTime,
          status: 'success'
        };
      }

      logger.info(`Archiving ${totalRecords} records from ${policy.tableName}`);

      // Process in batches
      let offset = 0;
      while (offset < totalRecords) {
        try {
          const batchResult = await this.archiveBatch(policy, cutoffDate, offset);
          recordsArchived += batchResult.archived;
          recordsDeleted += batchResult.deleted;
          offset += policy.batchSize;

          // Add small delay between batches to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (batchError) {
          logger.error(`Batch archival failed at offset ${offset}`, batchError instanceof Error ? batchError : new Error(String(batchError)));
          status = 'partial';
          error = batchError instanceof Error ? batchError.message : 'Batch processing failed';
          break;
        }
      }

      // Log archival completion
      await this.logArchivalOperation(policy, recordsArchived, recordsDeleted, status);

    } catch (err) {
      logger.error(`Archival failed for ${policy.tableName}`, err instanceof Error ? err : new Error(String(err)));
      status = 'failed';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    return {
      tableName: policy.tableName,
      recordsArchived,
      recordsDeleted,
      duration: Date.now() - startTime,
      status,
      error
    };
  }

  private async archiveBatch(
    policy: ArchivalPolicy, 
    cutoffDate: Date, 
    offset: number
  ): Promise<{ archived: number; deleted: number }> {
    // Fetch batch of records to archive
    const { data: records, error: fetchError } = await supabase
      .from(policy.tableName)
      .select('*')
      .lt('created_at', cutoffDate.toISOString())
      .range(offset, offset + policy.batchSize - 1);

    if (fetchError || !records || records.length === 0) {
      return { archived: 0, deleted: 0 };
    }

    // Insert into archive table
    const { error: insertError } = await supabase
      .from(policy.archiveTableName)
      .insert(records);

    if (insertError) {
      throw new Error(`Failed to insert into archive: ${insertError.message}`);
    }

    // Delete from source table
    const recordIds = records.map(record => record.id);
    const { error: deleteError } = await supabase
      .from(policy.tableName)
      .delete()
      .in('id', recordIds);

    if (deleteError) {
      throw new Error(`Failed to delete from source: ${deleteError.message}`);
    }

    return { archived: records.length, deleted: records.length };
  }

  async cleanupOldData(): Promise<ArchivalResult[]> {
    const results: ArchivalResult[] = [];

    for (const policy of this.cleanupPolicies) {
      const result = await this.cleanupTableData(policy);
      results.push(result);
    }

    return results;
  }

  private async cleanupTableData(policy: CleanupPolicy): Promise<ArchivalResult> {
    const startTime = Date.now();
    let recordsDeleted = 0;
    let status: ArchivalResult['status'] = 'success';
    let error: string | undefined;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

      // Build query with conditions
      let query = supabase
        .from(policy.tableName)
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      // Add additional conditions if specified
      if (policy.conditions) {
        Object.entries(policy.conditions).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      const { count, error: deleteError } = await query;

      if (deleteError) {
        throw new Error(`Cleanup failed: ${deleteError.message}`);
      }

      recordsDeleted = count || 0;

      // Log cleanup operation
      await this.logCleanupOperation(policy, recordsDeleted, status);

    } catch (err) {
      console.error(`Cleanup failed for ${policy.tableName}:`, err);
      status = 'failed';
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    return {
      tableName: policy.tableName,
      recordsArchived: 0,
      recordsDeleted,
      duration: Date.now() - startTime,
      status,
      error
    };
  }

  async getArchivalStats(): Promise<{
    totalArchived: number;
    totalDeleted: number;
    lastArchival: string | null;
    upcomingArchival: {
      tableName: string;
      recordsToArchive: number;
      estimatedSize: string;
    }[];
  }> {
    try {
      // Get archival statistics from maintenance log
      const { data: archivalLogs } = await supabase
        .from('maintenance_log')
        .select('details, completed_at')
        .eq('operation', 'data_archival')
        .order('completed_at', { ascending: false });

      let totalArchived = 0;
      let totalDeleted = 0;
      let lastArchival: string | null = null;

      if (archivalLogs && archivalLogs.length > 0) {
        lastArchival = archivalLogs[0].completed_at;
        
        archivalLogs.forEach(log => {
          if (log.details?.recordsArchived) {
            totalArchived += log.details.recordsArchived;
          }
          if (log.details?.recordsDeleted) {
            totalDeleted += log.details.recordsDeleted;
          }
        });
      }

      // Calculate upcoming archival candidates
      const upcomingArchival = await this.calculateUpcomingArchival();

      return {
        totalArchived,
        totalDeleted,
        lastArchival,
        upcomingArchival
      };
    } catch (error) {
      console.error('Error getting archival stats:', error);
      return {
        totalArchived: 0,
        totalDeleted: 0,
        lastArchival: null,
        upcomingArchival: []
      };
    }
  }

  private async calculateUpcomingArchival(): Promise<Array<{
    tableName: string;
    recordsToArchive: number;
    estimatedSize: string;
  }>> {
    const upcoming = [];

    for (const policy of this.defaultPolicies) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

        const { count } = await supabase
          .from(policy.tableName)
          .select('*', { count: 'exact', head: true })
          .lt('created_at', cutoffDate.toISOString());

        if (count && count > 0) {
          // Estimate size (rough calculation)
          const estimatedSizeBytes = count * 1024; // Assume 1KB per record average
          const estimatedSize = this.formatBytes(estimatedSizeBytes);

          upcoming.push({
            tableName: policy.tableName,
            recordsToArchive: count,
            estimatedSize
          });
        }
      } catch (error) {
        console.warn(`Failed to calculate upcoming archival for ${policy.tableName}:`, error);
      }
    }

    return upcoming;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async runScheduledArchival(): Promise<{
    success: boolean;
    results: ArchivalResult[];
    summary: string;
  }> {
    console.log('Starting scheduled data archival...');
    
    try {
      // Run archival
      const archivalResults = await this.archiveData();
      
      // Run cleanup
      const cleanupResults = await this.cleanupOldData();
      
      const allResults = [...archivalResults, ...cleanupResults];
      const totalArchived = archivalResults.reduce((sum, r) => sum + r.recordsArchived, 0);
      const totalDeleted = cleanupResults.reduce((sum, r) => sum + r.recordsDeleted, 0);
      
      const summary = `Archived ${totalArchived} records, cleaned up ${totalDeleted} records`;
      
      console.log('Scheduled archival completed:', summary);
      
      return {
        success: true,
        results: allResults,
        summary
      };
    } catch (error) {
      console.error('Scheduled archival failed:', error);
      return {
        success: false,
        results: [],
        summary: `Archival failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async logArchivalOperation(
    policy: ArchivalPolicy,
    recordsArchived: number,
    recordsDeleted: number,
    status: string
  ): Promise<void> {
    try {
      await supabase.from('maintenance_log').insert({
        operation: 'data_archival',
        status,
        details: {
          tableName: policy.tableName,
          recordsArchived,
          recordsDeleted,
          retentionDays: policy.retentionDays,
          compressionEnabled: policy.compressionEnabled
        }
      });
    } catch (error) {
      console.warn('Failed to log archival operation:', error);
    }
  }

  private async logCleanupOperation(
    policy: CleanupPolicy,
    recordsDeleted: number,
    status: string
  ): Promise<void> {
    try {
      await supabase.from('maintenance_log').insert({
        operation: 'data_cleanup',
        status,
        details: {
          tableName: policy.tableName,
          recordsDeleted,
          retentionDays: policy.retentionDays
        }
      });
    } catch (error) {
      console.warn('Failed to log cleanup operation:', error);
    }
  }

  getArchivalPolicies(): ArchivalPolicy[] {
    return [...this.defaultPolicies];
  }

  getCleanupPolicies(): CleanupPolicy[] {
    return [...this.cleanupPolicies];
  }

  updateArchivalPolicy(tableName: string, updates: Partial<ArchivalPolicy>): boolean {
    const index = this.defaultPolicies.findIndex(p => p.tableName === tableName);
    if (index !== -1) {
      this.defaultPolicies[index] = { ...this.defaultPolicies[index], ...updates };
      return true;
    }
    return false;
  }

  addArchivalPolicy(policy: ArchivalPolicy): void {
    this.defaultPolicies.push(policy);
  }

  removeArchivalPolicy(tableName: string): boolean {
    const index = this.defaultPolicies.findIndex(p => p.tableName === tableName);
    if (index !== -1) {
      this.defaultPolicies.splice(index, 1);
      return true;
    }
    return false;
  }
}

export const dataArchivalService = new DataArchivalService();