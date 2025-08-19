export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  parents?: string[];
}

export interface ScheduledScan {
  id: string;
  user_id: string;
  name: string;
  description: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time: string;
  sources: string[];
  google_drive_files: GoogleDriveFile[];
  enabled: boolean;
  last_run?: string;
  next_run: string;
  status: 'active' | 'paused' | 'error' | 'completed';
  results?: {
    totalAnalyzed: number;
    averageAccuracy: number;
    issuesFound: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  created_at: string;
}

export interface DatabaseScheduledScan {
  id: string;
  user_id: string;
  name: string;
  description: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time: string;
  sources: string[];
  google_drive_files: GoogleDriveFile[];
  enabled: boolean;
  last_run?: string;
  next_run: string;
  status: 'active' | 'paused' | 'error' | 'completed';
  results?: {
    totalAnalyzed: number;
    averageAccuracy: number;
    issuesFound: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  created_at: string;
}

// Helper function to convert database result to app format
export const convertDatabaseScheduledScan = (dbScan: DatabaseScheduledScan): ScheduledScan => ({
  id: dbScan.id,
  user_id: dbScan.user_id,
  name: dbScan.name,
  description: dbScan.description,
  frequency: dbScan.frequency,
  time: dbScan.time,
  sources: dbScan.sources,
  google_drive_files: dbScan.google_drive_files,
  enabled: dbScan.enabled,
  last_run: dbScan.last_run,
  next_run: dbScan.next_run,
  status: dbScan.status,
  results: dbScan.results,
  created_at: dbScan.created_at,
});

// Helper function to convert app format to database format
export const convertToDatabase = (scan: Omit<ScheduledScan, 'id' | 'created_at'>): Omit<DatabaseScheduledScan, 'id' | 'created_at'> => ({
  user_id: scan.user_id,
  name: scan.name,
  description: scan.description,
  frequency: scan.frequency,
  time: scan.time,
  sources: scan.sources,
  google_drive_files: scan.google_drive_files,
  enabled: scan.enabled,
  last_run: scan.last_run,
  next_run: scan.next_run,
  status: scan.status,
  results: scan.results,
});