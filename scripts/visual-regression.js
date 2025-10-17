#!/usr/bin/env node

/**
 * Visual Regression Testing Management Script
 * 
 * This script provides utilities for managing visual regression tests:
 * - Generate baseline screenshots
 * - Run visual regression tests
 * - Approve visual changes
 * - Generate reports
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VISUAL_CONFIG = 'playwright.visual.config.ts';
const BASELINE_DIR = 'test-results/visual-baseline';
const DIFF_DIR = 'test-results/visual-diff';
const REPORT_DIR = 'visual-regression-report';

class VisualRegressionManager {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [BASELINE_DIR, DIFF_DIR, REPORT_DIR];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Generate baseline screenshots for all critical pages
   */
  async generateBaselines() {
    console.log('🎯 Generating baseline screenshots...');
    
    try {
      // Run visual tests to generate baselines
      execSync(`npx playwright test --config=${VISUAL_CONFIG} --update-snapshots`, {
        stdio: 'inherit'
      });
      
      console.log('✅ Baseline screenshots generated successfully');
      this.logBaselines();
    } catch (error) {
      console.error('❌ Failed to generate baselines:', error.message);
      process.exit(1);
    }
  }

  /**
   * Run visual regression tests
   */
  async runVisualTests() {
    console.log('🔍 Running visual regression tests...');
    
    try {
      execSync(`npx playwright test --config=${VISUAL_CONFIG}`, {
        stdio: 'inherit'
      });
      
      console.log('✅ Visual regression tests completed successfully');
    } catch (error) {
      console.error('❌ Visual regression tests failed');
      this.handleTestFailures();
      process.exit(1);
    }
  }

  /**
   * Handle test failures by generating diff report
   */
  handleTestFailures() {
    console.log('📊 Generating visual diff report...');
    
    try {
      // Generate HTML report
      execSync(`npx playwright show-report ${REPORT_DIR}`, {
        stdio: 'inherit'
      });
      
      console.log(`📋 Visual diff report available at: ${REPORT_DIR}/index.html`);
      this.listFailedTests();
    } catch (error) {
      console.error('Failed to generate diff report:', error.message);
    }
  }

  /**
   * Approve visual changes by updating baselines
   */
  async approveChanges(testPattern = null) {
    console.log('✅ Approving visual changes...');
    
    try {
      const command = testPattern 
        ? `npx playwright test --config=${VISUAL_CONFIG} --update-snapshots -g "${testPattern}"`
        : `npx playwright test --config=${VISUAL_CONFIG} --update-snapshots`;
        
      execSync(command, { stdio: 'inherit' });
      
      console.log('✅ Visual changes approved and baselines updated');
      this.logApprovedChanges();
    } catch (error) {
      console.error('❌ Failed to approve changes:', error.message);
      process.exit(1);
    }
  }

  /**
   * List all baseline screenshots
   */
  logBaselines() {
    console.log('\\n📸 Generated baseline screenshots:');
    
    const findScreenshots = (dir) => {
      if (!fs.existsSync(dir)) return [];
      
      const files = [];
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...findScreenshots(fullPath));
        } else if (item.endsWith('.png')) {
          files.push(fullPath);
        }
      });
      
      return files;
    };
    
    const screenshots = findScreenshots('test-results');
    screenshots.forEach(screenshot => {
      console.log(`  📷 ${screenshot}`);
    });
    
    console.log(`\\n📊 Total: ${screenshots.length} baseline screenshots`);
  }

  /**
   * List failed visual tests
   */
  listFailedTests() {
    console.log('\\n❌ Failed visual tests:');
    
    try {
      const reportPath = path.join(REPORT_DIR, 'results.json');
      if (fs.existsSync(reportPath)) {
        const results = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const failedTests = results.suites
          ?.flatMap(suite => suite.specs || [])
          ?.filter(spec => spec.tests?.some(test => test.results?.some(result => result.status === 'failed')));
        
        if (failedTests?.length > 0) {
          failedTests.forEach(test => {
            console.log(`  🔴 ${test.title}`);
          });
        } else {
          console.log('  No failed tests found in report');
        }
      } else {
        console.log('  No test report found');
      }
    } catch (error) {
      console.log('  Could not parse test results');
    }
  }

  /**
   * Log approved changes
   */
  logApprovedChanges() {
    console.log('\\n✅ Approved visual changes:');
    console.log('  - Baseline screenshots have been updated');
    console.log('  - Commit these changes to version control');
    console.log('  - Notify team of approved visual changes');
  }

  /**
   * Clean up old test artifacts
   */
  cleanup() {
    console.log('🧹 Cleaning up old test artifacts...');
    
    const cleanupDirs = [DIFF_DIR, REPORT_DIR, 'test-results/visual'];
    
    cleanupDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`  🗑️  Cleaned ${dir}`);
      }
    });
    
    console.log('✅ Cleanup completed');
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
🎨 Visual Regression Testing Manager

Usage: node scripts/visual-regression.js <command> [options]

Commands:
  baseline              Generate baseline screenshots
  test                  Run visual regression tests
  approve [pattern]     Approve visual changes (optionally for specific test pattern)
  cleanup               Clean up old test artifacts
  help                  Show this help message

Examples:
  node scripts/visual-regression.js baseline
  node scripts/visual-regression.js test
  node scripts/visual-regression.js approve
  node scripts/visual-regression.js approve "landing page"
  node scripts/visual-regression.js cleanup

Environment Variables:
  CI=true               Run in CI mode (affects retry behavior)
  UPDATE_SNAPSHOTS=true Automatically update snapshots
    `);
  }
}

// Main execution
async function main() {
  const manager = new VisualRegressionManager();
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'baseline':
      await manager.generateBaselines();
      break;
    
    case 'test':
      await manager.runVisualTests();
      break;
    
    case 'approve':
      await manager.approveChanges(arg);
      break;
    
    case 'cleanup':
      manager.cleanup();
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
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = VisualRegressionManager;