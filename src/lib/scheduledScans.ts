import { supabase } from './supabase';
import { ScheduledScan, DatabaseScheduledScan, convertDatabaseScheduledScan, convertToDatabase } from '../types/scheduledScan';

export class ScheduledScansService {
  
  /**
   * Load all scheduled scans for the current user
   */
  static async loadUserScans(userId: string): Promise<ScheduledScan[]> {
    try {
      const { data, error } = await supabase
        .from('scheduled_scans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading scheduled scans:', error);
        throw new Error(`Failed to load scheduled scans: ${error.message}`);
      }

      return (data as DatabaseScheduledScan[]).map(convertDatabaseScheduledScan);
    } catch (error) {
      console.error('Error in loadUserScans:', error);
      throw error;
    }
  }

  /**
   * Create a new scheduled scan
   */
  static async createScan(scanData: Omit<ScheduledScan, 'id' | 'created_at'>): Promise<ScheduledScan> {
    try {
      const { data, error } = await supabase
        .from('scheduled_scans')
        .insert(convertToDatabase(scanData))
        .select()
        .single();

      if (error) {
        console.error('Error creating scan:', error);
        throw new Error(`Failed to create scan: ${error.message}`);
      }

      return convertDatabaseScheduledScan(data as DatabaseScheduledScan);
    } catch (error) {
      console.error('Error in createScan:', error);
      throw error;
    }
  }

  /**
   * Update an existing scheduled scan
   */
  static async updateScan(scanId: string, updates: Partial<ScheduledScan>): Promise<ScheduledScan> {
    try {
      const { data, error } = await supabase
        .from('scheduled_scans')
        .update(updates)
        .eq('id', scanId)
        .select()
        .single();

      if (error) {
        console.error('Error updating scan:', error);
        throw new Error(`Failed to update scan: ${error.message}`);
      }

      return convertDatabaseScheduledScan(data as DatabaseScheduledScan);
    } catch (error) {
      console.error('Error in updateScan:', error);
      throw error;
    }
  }

  /**
   * Delete a scheduled scan
   */
  static async deleteScan(scanId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('scheduled_scans')
        .delete()
        .eq('id', scanId);

      if (error) {
        console.error('Error deleting scan:', error);
        throw new Error(`Failed to delete scan: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in deleteScan:', error);
      throw error;
    }
  }

  /**
   * Toggle scan enabled status
   */
  static async toggleScan(scanId: string, enabled: boolean): Promise<ScheduledScan> {
    const status = enabled ? 'active' : 'paused';
    return this.updateScan(scanId, { enabled, status });
  }

  /**
   * Calculate next run time based on frequency and time
   */
  static calculateNextRunTime(frequency: string, time: string): string {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= now) {
      switch (frequency) {
        case 'hourly':
          next.setHours(next.getHours() + 1);
          break;
        case 'daily':
          next.setDate(next.getDate() + 1);
          break;
        case 'weekly':
          next.setDate(next.getDate() + 7);
          break;
        case 'monthly':
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }
    
    return next.toISOString();
  }

  /**
   * Manually trigger scan execution (for testing)
   */
  static async triggerScanExecutorNow(): Promise<any> {
    try {
      const { data, error } = await supabase.rpc('trigger_scan_executor_now');
      
      if (error) {
        console.error('Error triggering scan executor:', error);
        throw new Error(`Failed to trigger scan executor: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error in triggerScanExecutorNow:', error);
      throw error;
    }
  }

  /**
   * Get scan execution logs
   */
  static async getScanExecutorLogs(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('scan_executor_logs')
        .select('*')
        .limit(limit);

      if (error) {
        console.error('Error fetching scan logs:', error);
        throw new Error(`Failed to fetch scan logs: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getScanExecutorLogs:', error);
      throw error;
    }
  }
}