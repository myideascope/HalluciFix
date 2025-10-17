import { TestDataManager } from './TestDataManager';
import fs from 'fs';
import path from 'path';

/**
 * Test Data Versioning system for managing test data migrations and snapshots
 */

export interface DataVersion {
  version: string;
  description: string;
  timestamp: string;
  checksum: string;
  migrations: string[];
}

export interface MigrationScript {
  version: string;
  up: (manager: TestDataManager) => Promise<void>;
  down: (manager: TestDataManager) => Promise<void>;
  description: string;
}

export class TestDataVersioning {
  private versionsDir: string;
  private migrationsDir: string;
  private snapshotsDir: string;
  private currentVersion: string = '1.0.0';

  constructor(baseDir: string = 'src/test/data') {
    this.versionsDir = path.join(baseDir, 'versions');
    this.migrationsDir = path.join(baseDir, 'migrations');
    this.snapshotsDir = path.join(baseDir, 'snapshots');
    
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    [this.versionsDir, this.migrationsDir, this.snapshotsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Create a new data version
   */
  async createVersion(
    version: string, 
    description: string, 
    manager: TestDataManager
  ): Promise<DataVersion> {
    const timestamp = new Date().toISOString();
    const data = await manager.exportTestData();
    const checksum = this.calculateChecksum(JSON.stringify(data));
    
    const versionInfo: DataVersion = {
      version,
      description,
      timestamp,
      checksum,
      migrations: []
    };

    // Save version info
    const versionFile = path.join(this.versionsDir, `${version}.json`);
    fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2));

    // Save data snapshot
    const snapshotFile = path.join(this.snapshotsDir, `${version}.json`);
    fs.writeFileSync(snapshotFile, JSON.stringify(data, null, 2));

    console.log(`Created test data version: ${version}`);
    return versionInfo;
  }

  /**
   * Load data from a specific version
   */
  async loadVersion(version: string, manager: TestDataManager): Promise<void> {
    const snapshotFile = path.join(this.snapshotsDir, `${version}.json`);
    
    if (!fs.existsSync(snapshotFile)) {
      throw new Error(`Version ${version} not found`);
    }

    const data = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    await manager.importTestData(data);
    
    this.currentVersion = version;
    console.log(`Loaded test data version: ${version}`);
  }

  /**
   * List all available versions
   */
  listVersions(): DataVersion[] {
    const versions: DataVersion[] = [];
    
    if (fs.existsSync(this.versionsDir)) {
      const files = fs.readdirSync(this.versionsDir);
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const versionData = JSON.parse(
              fs.readFileSync(path.join(this.versionsDir, file), 'utf8')
            );
            versions.push(versionData);
          } catch (error) {
            console.warn(`Failed to load version file ${file}:`, error);
          }
        }
      });
    }
    
    return versions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Create a migration script
   */
  createMigration(
    fromVersion: string,
    toVersion: string,
    description: string,
    upScript: string,
    downScript: string
  ): void {
    const migration: any = {
      fromVersion,
      toVersion,
      description,
      timestamp: new Date().toISOString(),
      up: upScript,
      down: downScript
    };

    const migrationFile = path.join(
      this.migrationsDir, 
      `${fromVersion}_to_${toVersion}.json`
    );
    
    fs.writeFileSync(migrationFile, JSON.stringify(migration, null, 2));
    console.log(`Created migration: ${fromVersion} -> ${toVersion}`);
  }

  /**
   * Run migration between versions
   */
  async runMigration(
    fromVersion: string,
    toVersion: string,
    manager: TestDataManager
  ): Promise<void> {
    const migrationFile = path.join(
      this.migrationsDir,
      `${fromVersion}_to_${toVersion}.json`
    );

    if (!fs.existsSync(migrationFile)) {
      throw new Error(`Migration from ${fromVersion} to ${toVersion} not found`);
    }

    const migration = JSON.parse(fs.readFileSync(migrationFile, 'utf8'));
    
    console.log(`Running migration: ${fromVersion} -> ${toVersion}`);
    console.log(`Description: ${migration.description}`);

    try {
      // Execute migration script
      await this.executeMigrationScript(migration.up, manager);
      
      // Update current version
      this.currentVersion = toVersion;
      
      console.log(`Migration completed: ${fromVersion} -> ${toVersion}`);
    } catch (error) {
      console.error(`Migration failed: ${fromVersion} -> ${toVersion}`, error);
      
      // Attempt rollback
      try {
        await this.executeMigrationScript(migration.down, manager);
        console.log('Rollback completed');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      
      throw error;
    }
  }

  /**
   * Execute migration script
   */
  private async executeMigrationScript(
    script: string, 
    manager: TestDataManager
  ): Promise<void> {
    // This is a simplified implementation
    // In a real scenario, you might use a more sophisticated script execution system
    
    try {
      // Parse and execute the migration script
      const scriptFunction = new Function('manager', script);
      await scriptFunction(manager);
    } catch (error) {
      throw new Error(`Migration script execution failed: ${error.message}`);
    }
  }

  /**
   * Compare two versions
   */
  async compareVersions(version1: string, version2: string): Promise<any> {
    const snapshot1File = path.join(this.snapshotsDir, `${version1}.json`);
    const snapshot2File = path.join(this.snapshotsDir, `${version2}.json`);

    if (!fs.existsSync(snapshot1File) || !fs.existsSync(snapshot2File)) {
      throw new Error('One or both versions not found');
    }

    const data1 = JSON.parse(fs.readFileSync(snapshot1File, 'utf8'));
    const data2 = JSON.parse(fs.readFileSync(snapshot2File, 'utf8'));

    return this.calculateDifferences(data1, data2);
  }

  /**
   * Calculate differences between two data sets
   */
  private calculateDifferences(data1: any, data2: any): any {
    const differences: any = {
      added: {},
      removed: {},
      modified: {},
      summary: {
        totalChanges: 0,
        tablesAffected: []
      }
    };

    // Compare tables
    const allTables = new Set([
      ...Object.keys(data1.tables || {}),
      ...Object.keys(data2.tables || {})
    ]);

    allTables.forEach(table => {
      const table1 = data1.tables?.[table] || [];
      const table2 = data2.tables?.[table] || [];

      const tableDiff = this.compareTableData(table1, table2);
      
      if (tableDiff.hasChanges) {
        differences.added[table] = tableDiff.added;
        differences.removed[table] = tableDiff.removed;
        differences.modified[table] = tableDiff.modified;
        differences.summary.tablesAffected.push(table);
        differences.summary.totalChanges += tableDiff.changeCount;
      }
    });

    return differences;
  }

  /**
   * Compare data in two tables
   */
  private compareTableData(table1: any[], table2: any[]): any {
    const result = {
      added: [],
      removed: [],
      modified: [],
      hasChanges: false,
      changeCount: 0
    };

    // Create maps for easier comparison
    const map1 = new Map(table1.map(item => [item.id, item]));
    const map2 = new Map(table2.map(item => [item.id, item]));

    // Find added items
    map2.forEach((item, id) => {
      if (!map1.has(id)) {
        result.added.push(item);
        result.changeCount++;
      }
    });

    // Find removed items
    map1.forEach((item, id) => {
      if (!map2.has(id)) {
        result.removed.push(item);
        result.changeCount++;
      }
    });

    // Find modified items
    map1.forEach((item1, id) => {
      const item2 = map2.get(id);
      if (item2 && JSON.stringify(item1) !== JSON.stringify(item2)) {
        result.modified.push({ before: item1, after: item2 });
        result.changeCount++;
      }
    });

    result.hasChanges = result.changeCount > 0;
    return result;
  }

  /**
   * Calculate checksum for data
   */
  private calculateChecksum(data: string): string {
    // Simple checksum implementation
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Validate data integrity
   */
  async validateVersion(version: string): Promise<boolean> {
    const versionFile = path.join(this.versionsDir, `${version}.json`);
    const snapshotFile = path.join(this.snapshotsDir, `${version}.json`);

    if (!fs.existsSync(versionFile) || !fs.existsSync(snapshotFile)) {
      return false;
    }

    try {
      const versionInfo = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const snapshotData = fs.readFileSync(snapshotFile, 'utf8');
      const calculatedChecksum = this.calculateChecksum(snapshotData);

      return versionInfo.checksum === calculatedChecksum;
    } catch (error) {
      console.error(`Failed to validate version ${version}:`, error);
      return false;
    }
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Clean up old versions (keep only specified number)
   */
  cleanupOldVersions(keepCount: number = 10): void {
    const versions = this.listVersions();
    
    if (versions.length <= keepCount) {
      return;
    }

    const versionsToDelete = versions.slice(0, versions.length - keepCount);
    
    versionsToDelete.forEach(version => {
      try {
        const versionFile = path.join(this.versionsDir, `${version.version}.json`);
        const snapshotFile = path.join(this.snapshotsDir, `${version.version}.json`);
        
        if (fs.existsSync(versionFile)) {
          fs.unlinkSync(versionFile);
        }
        if (fs.existsSync(snapshotFile)) {
          fs.unlinkSync(snapshotFile);
        }
        
        console.log(`Deleted old version: ${version.version}`);
      } catch (error) {
        console.warn(`Failed to delete version ${version.version}:`, error);
      }
    });
  }
}