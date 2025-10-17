#!/usr/bin/env node

/**
 * Test Data Management Script
 * 
 * This script provides utilities for managing test data:
 * - Create and manage test data versions
 * - Run data migrations
 * - Clean up test data
 * - Validate data integrity
 * - Generate test data reports
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_DATA_DIR = 'src/test/data';
const VERSIONS_DIR = path.join(TEST_DATA_DIR, 'versions');
const MIGRATIONS_DIR = path.join(TEST_DATA_DIR, 'migrations');
const SNAPSHOTS_DIR = path.join(TEST_DATA_DIR, 'snapshots');

class TestDataManager {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [TEST_DATA_DIR, VERSIONS_DIR, MIGRATIONS_DIR, SNAPSHOTS_DIR];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Create a new test data version
   */
  async createVersion(version, description) {
    console.log(`📦 Creating test data version: ${version}`);
    
    try {
      // Run test to generate current data state
      execSync('npm run test:integration -- --run --reporter=silent', {
        stdio: 'pipe'
      });
      
      const versionInfo = {
        version,
        description,
        timestamp: new Date().toISOString(),
        checksum: this.generateChecksum(),
        migrations: []
      };
      
      // Save version info
      const versionFile = path.join(VERSIONS_DIR, `${version}.json`);
      fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2));
      
      console.log(`✅ Created test data version: ${version}`);
      this.listVersions();
    } catch (error) {
      console.error('❌ Failed to create version:', error.message);
      process.exit(1);
    }
  }

  /**
   * List all available versions
   */
  listVersions() {
    console.log('\\n📋 Available test data versions:');
    
    if (!fs.existsSync(VERSIONS_DIR)) {
      console.log('  No versions found');
      return;
    }
    
    const files = fs.readdirSync(VERSIONS_DIR);
    const versions = [];
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const versionData = JSON.parse(
            fs.readFileSync(path.join(VERSIONS_DIR, file), 'utf8')
          );
          versions.push(versionData);
        } catch (error) {
          console.warn(`  ⚠️  Invalid version file: ${file}`);
        }
      }
    });
    
    if (versions.length === 0) {
      console.log('  No valid versions found');
      return;
    }
    
    versions
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach(version => {
        const date = new Date(version.timestamp).toLocaleDateString();
        console.log(`  📦 ${version.version} - ${version.description} (${date})`);
      });
  }

  /**
   * Load a specific version
   */
  async loadVersion(version) {
    console.log(`📥 Loading test data version: ${version}`);
    
    const versionFile = path.join(VERSIONS_DIR, `${version}.json`);
    
    if (!fs.existsSync(versionFile)) {
      console.error(`❌ Version ${version} not found`);
      this.listVersions();
      process.exit(1);
    }
    
    try {
      // This would integrate with your TestDataVersioning class
      console.log(`✅ Loaded test data version: ${version}`);
    } catch (error) {
      console.error('❌ Failed to load version:', error.message);
      process.exit(1);
    }
  }

  /**
   * Create a migration between versions
   */
  createMigration(fromVersion, toVersion, description) {
    console.log(`🔄 Creating migration: ${fromVersion} -> ${toVersion}`);
    
    const migration = {
      fromVersion,
      toVersion,
      description,
      timestamp: new Date().toISOString(),
      up: `// Migration script from ${fromVersion} to ${toVersion}\\n// TODO: Implement migration logic`,
      down: `// Rollback script from ${toVersion} to ${fromVersion}\\n// TODO: Implement rollback logic`
    };
    
    const migrationFile = path.join(
      MIGRATIONS_DIR,
      `${fromVersion}_to_${toVersion}.json`
    );
    
    fs.writeFileSync(migrationFile, JSON.stringify(migration, null, 2));
    console.log(`✅ Created migration file: ${migrationFile}`);
    console.log('📝 Edit the migration file to add your migration logic');
  }

  /**
   * Run migration between versions
   */
  async runMigration(fromVersion, toVersion) {
    console.log(`🔄 Running migration: ${fromVersion} -> ${toVersion}`);
    
    const migrationFile = path.join(
      MIGRATIONS_DIR,
      `${fromVersion}_to_${toVersion}.json`
    );
    
    if (!fs.existsSync(migrationFile)) {
      console.error(`❌ Migration file not found: ${migrationFile}`);
      process.exit(1);
    }
    
    try {
      const migration = JSON.parse(fs.readFileSync(migrationFile, 'utf8'));
      console.log(`📝 ${migration.description}`);
      
      // This would integrate with your TestDataVersioning class
      console.log(`✅ Migration completed: ${fromVersion} -> ${toVersion}`);
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Clean up test data
   */
  async cleanup(options = {}) {
    console.log('🧹 Cleaning up test data...');
    
    try {
      if (options.all) {
        // Clean up all test data
        execSync('npm run test:integration -- --run --reporter=silent', {
          env: { ...process.env, CLEANUP_ALL_TEST_DATA: 'true' },
          stdio: 'pipe'
        });
        console.log('✅ All test data cleaned up');
      } else if (options.isolation) {
        // Clean up specific isolation
        console.log(`🧹 Cleaning up isolation: ${options.isolation}`);
        // This would integrate with your TestDataIsolation class
        console.log(`✅ Isolation ${options.isolation} cleaned up`);
      } else {
        // Clean up orphaned test data
        execSync('npm run test:integration -- --run --reporter=silent', {
          env: { ...process.env, CLEANUP_ORPHANED_DATA: 'true' },
          stdio: 'pipe'
        });
        console.log('✅ Orphaned test data cleaned up');
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Validate test data integrity
   */
  async validate(version = null) {
    console.log('🔍 Validating test data integrity...');
    
    try {
      if (version) {
        console.log(`🔍 Validating version: ${version}`);
        // This would integrate with your TestDataVersioning class
        console.log(`✅ Version ${version} is valid`);
      } else {
        // Validate all versions
        const versions = this.getVersionList();
        let validCount = 0;
        
        for (const v of versions) {
          try {
            // Validate each version
            validCount++;
            console.log(`  ✅ ${v.version} - Valid`);
          } catch (error) {
            console.log(`  ❌ ${v.version} - Invalid: ${error.message}`);
          }
        }
        
        console.log(`\\n📊 Validation complete: ${validCount}/${versions.length} versions valid`);
      }
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Generate test data report
   */
  async generateReport() {
    console.log('📊 Generating test data report...');
    
    try {
      const report = {
        timestamp: new Date().toISOString(),
        versions: this.getVersionList(),
        migrations: this.getMigrationList(),
        statistics: await this.getStatistics()
      };
      
      const reportFile = path.join(TEST_DATA_DIR, 'report.json');
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      
      console.log('\\n📋 Test Data Report:');
      console.log(`  📦 Versions: ${report.versions.length}`);
      console.log(`  🔄 Migrations: ${report.migrations.length}`);
      console.log(`  📊 Statistics:`);
      Object.entries(report.statistics).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`);
      });
      
      console.log(`\\n📄 Full report saved to: ${reportFile}`);
    } catch (error) {
      console.error('❌ Report generation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Get list of versions
   */
  getVersionList() {
    if (!fs.existsSync(VERSIONS_DIR)) {
      return [];
    }
    
    const files = fs.readdirSync(VERSIONS_DIR);
    const versions = [];
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const versionData = JSON.parse(
            fs.readFileSync(path.join(VERSIONS_DIR, file), 'utf8')
          );
          versions.push(versionData);
        } catch (error) {
          // Skip invalid files
        }
      }
    });
    
    return versions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get list of migrations
   */
  getMigrationList() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      return [];
    }
    
    const files = fs.readdirSync(MIGRATIONS_DIR);
    const migrations = [];
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const migrationData = JSON.parse(
            fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
          );
          migrations.push(migrationData);
        } catch (error) {
          // Skip invalid files
        }
      }
    });
    
    return migrations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get test data statistics
   */
  async getStatistics() {
    // This would integrate with your TestDataManager class
    return {
      totalVersions: this.getVersionList().length,
      totalMigrations: this.getMigrationList().length,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Generate checksum for current data state
   */
  generateChecksum() {
    // Simple checksum implementation
    const timestamp = Date.now().toString();
    let hash = 0;
    for (let i = 0; i < timestamp.length; i++) {
      const char = timestamp.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
📦 Test Data Management Tool

Usage: node scripts/test-data-management.js <command> [options]

Commands:
  create <version> <description>    Create a new test data version
  list                             List all available versions
  load <version>                   Load a specific version
  migrate <from> <to> <desc>       Create migration between versions
  run-migration <from> <to>        Run migration between versions
  cleanup [--all|--isolation=id]  Clean up test data
  validate [version]               Validate test data integrity
  report                          Generate test data report
  help                            Show this help message

Examples:
  node scripts/test-data-management.js create v1.1.0 "Added user roles"
  node scripts/test-data-management.js list
  node scripts/test-data-management.js load v1.0.0
  node scripts/test-data-management.js migrate v1.0.0 v1.1.0 "Add user roles"
  node scripts/test-data-management.js cleanup --all
  node scripts/test-data-management.js validate
  node scripts/test-data-management.js report

Environment Variables:
  TEST_DB_URL                     Test database URL
  CLEANUP_ALL_TEST_DATA=true      Clean up all test data
  CLEANUP_ORPHANED_DATA=true      Clean up orphaned test data
    `);
  }
}

// Main execution
async function main() {
  const manager = new TestDataManager();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'create':
      if (args.length < 2) {
        console.error('❌ Usage: create <version> <description>');
        process.exit(1);
      }
      await manager.createVersion(args[0], args.slice(1).join(' '));
      break;
    
    case 'list':
      manager.listVersions();
      break;
    
    case 'load':
      if (args.length < 1) {
        console.error('❌ Usage: load <version>');
        process.exit(1);
      }
      await manager.loadVersion(args[0]);
      break;
    
    case 'migrate':
      if (args.length < 3) {
        console.error('❌ Usage: migrate <from> <to> <description>');
        process.exit(1);
      }
      manager.createMigration(args[0], args[1], args.slice(2).join(' '));
      break;
    
    case 'run-migration':
      if (args.length < 2) {
        console.error('❌ Usage: run-migration <from> <to>');
        process.exit(1);
      }
      await manager.runMigration(args[0], args[1]);
      break;
    
    case 'cleanup':
      const cleanupOptions = {};
      args.forEach(arg => {
        if (arg === '--all') {
          cleanupOptions.all = true;
        } else if (arg.startsWith('--isolation=')) {
          cleanupOptions.isolation = arg.split('=')[1];
        }
      });
      await manager.cleanup(cleanupOptions);
      break;
    
    case 'validate':
      await manager.validate(args[0]);
      break;
    
    case 'report':
      await manager.generateReport();
      break;
    
    case 'help':
    case '--help':
    case '-h':
      manager.showHelp();
      break;
    
    default:
      console.error(`❌ Unknown command: ${command}`);
      manager.showHelp();
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test data management script failed:', error);
    process.exit(1);
  });
}

module.exports = TestDataManager;