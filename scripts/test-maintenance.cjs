#!/usr/bin/env node

/**
 * Test Maintenance Script
 * 
 * Automates test maintenance tasks including cleanup, optimization,
 * and test suite organization.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestMaintenance {
  constructor() {
    this.projectRoot = process.cwd();
    this.testDirs = [
      'src/test',
      'src/components/__tests__',
      'src/lib/__tests__',
      'src/hooks/__tests__',
      'e2e'
    ];
    this.cleanupLog = [];
  }

  async runMaintenance(options = {}) {
    console.log('🧹 Starting test maintenance...\n');

    try {
      if (options.cleanup !== false) {
        await this.cleanupTestArtifacts();
      }
      
      if (options.organize !== false) {
        await this.organizeTestFiles();
      }
      
      if (options.optimize !== false) {
        await this.optimizeTestSuite();
      }
      
      if (options.validate !== false) {
        await this.validateTestStructure();
      }
      
      await this.generateMaintenanceReport();
      
      console.log('✅ Test maintenance completed successfully!');
      
      if (this.cleanupLog.length > 0) {
        console.log(`📋 ${this.cleanupLog.length} maintenance actions performed`);
      }

    } catch (error) {
      console.error('❌ Test maintenance failed:', error.message);
      process.exit(1);
    }
  }

  async cleanupTestArtifacts() {
    console.log('🗑️  Cleaning up test artifacts...');
    
    const artifactDirs = [
      'coverage',
      'test-results',
      '.nyc_output',
      'playwright-report',
      '.test-health'
    ];
    
    const artifactFiles = [
      'junit.xml',
      'test-report.xml',
      'coverage.xml'
    ];

    // Clean up old artifact directories
    artifactDirs.forEach(dir => {
      const fullPath = path.join(this.projectRoot, dir);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const daysSinceModified = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceModified > 7) { // Older than 7 days
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            this.cleanupLog.push(`Removed old artifact directory: ${dir}`);
            console.log(`  ✅ Removed old ${dir} directory`);
          } catch (error) {
            console.log(`  ⚠️  Could not remove ${dir}: ${error.message}`);
          }
        }
      }
    });

    // Clean up old artifact files
    artifactFiles.forEach(file => {
      const fullPath = path.join(this.projectRoot, file);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          this.cleanupLog.push(`Removed old artifact file: ${file}`);
          console.log(`  ✅ Removed old ${file} file`);
        } catch (error) {
          console.log(`  ⚠️  Could not remove ${file}: ${error.message}`);
        }
      }
    });

    // Clean up temporary test files
    this.cleanupTempTestFiles();
  }

  cleanupTempTestFiles() {
    const tempPatterns = [
      /\.tmp$/,
      /\.temp$/,
      /~$/,
      /\.bak$/,
      /\.orig$/
    ];

    this.testDirs.forEach(testDir => {
      const fullPath = path.join(this.projectRoot, testDir);
      if (fs.existsSync(fullPath)) {
        this.walkDirectory(fullPath, (filePath) => {
          const fileName = path.basename(filePath);
          if (tempPatterns.some(pattern => pattern.test(fileName))) {
            try {
              fs.unlinkSync(filePath);
              this.cleanupLog.push(`Removed temp file: ${path.relative(this.projectRoot, filePath)}`);
              console.log(`  ✅ Removed temp file: ${fileName}`);
            } catch (error) {
              console.log(`  ⚠️  Could not remove ${fileName}: ${error.message}`);
            }
          }
        });
      }
    });
  }

  async organizeTestFiles() {
    console.log('📁 Organizing test files...');
    
    // Find misplaced test files
    const misplacedTests = this.findMisplacedTests();
    
    misplacedTests.forEach(({ currentPath, suggestedPath, reason }) => {
      console.log(`  📋 Suggestion: Move ${currentPath} to ${suggestedPath} (${reason})`);
      this.cleanupLog.push(`Suggested move: ${currentPath} → ${suggestedPath} (${reason})`);
    });

    // Check for naming consistency
    this.checkTestNamingConsistency();
    
    // Organize test utilities
    this.organizeTestUtilities();
  }

  findMisplacedTests() {
    const misplaced = [];
    const testFiles = this.findAllTestFiles();
    
    testFiles.forEach(testFile => {
      const relativePath = path.relative(this.projectRoot, testFile);
      
      // Check if test is in the right location
      if (relativePath.startsWith('src/') && !relativePath.includes('__tests__') && !relativePath.includes('/test/')) {
        const dir = path.dirname(testFile);
        const fileName = path.basename(testFile);
        const suggestedPath = path.join(dir, '__tests__', fileName);
        
        misplaced.push({
          currentPath: relativePath,
          suggestedPath: path.relative(this.projectRoot, suggestedPath),
          reason: 'Should be in __tests__ directory'
        });
      }
      
      // Check for component tests not near components
      if (relativePath.includes('component') || relativePath.includes('Component')) {
        const componentName = this.extractComponentName(fileName);
        if (componentName) {
          const expectedComponentPath = `src/components/${componentName}.tsx`;
          if (!fs.existsSync(path.join(this.projectRoot, expectedComponentPath))) {
            misplaced.push({
              currentPath: relativePath,
              suggestedPath: `src/components/__tests__/${fileName}`,
              reason: 'Component test should be near component file'
            });
          }
        }
      }
    });
    
    return misplaced;
  }

  checkTestNamingConsistency() {
    const testFiles = this.findAllTestFiles();
    const namingIssues = [];
    
    testFiles.forEach(testFile => {
      const fileName = path.basename(testFile);
      const relativePath = path.relative(this.projectRoot, testFile);
      
      // Check for consistent naming patterns
      if (!fileName.includes('.test.') && !fileName.includes('.spec.') && !relativePath.includes('__tests__')) {
        namingIssues.push({
          file: relativePath,
          issue: 'Test file should include .test. or .spec. in filename'
        });
      }
      
      // Check for mixed naming conventions
      if (fileName.includes('.test.') && fileName.includes('.spec.')) {
        namingIssues.push({
          file: relativePath,
          issue: 'File uses both .test. and .spec. naming'
        });
      }
      
      // Check for proper extensions
      if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx') && !fileName.endsWith('.js') && !fileName.endsWith('.jsx')) {
        namingIssues.push({
          file: relativePath,
          issue: 'Test file should have proper extension (.ts, .tsx, .js, .jsx)'
        });
      }
    });
    
    namingIssues.forEach(issue => {
      console.log(`  📋 Naming issue: ${issue.file} - ${issue.issue}`);
      this.cleanupLog.push(`Naming issue: ${issue.file} - ${issue.issue}`);
    });
  }

  organizeTestUtilities() {
    const utilityFiles = this.findTestUtilities();
    const suggestions = [];
    
    utilityFiles.forEach(file => {
      const relativePath = path.relative(this.projectRoot, file);
      
      // Check if utilities are properly organized
      if (!relativePath.includes('src/test/') && !relativePath.includes('e2e/utils/')) {
        suggestions.push({
          file: relativePath,
          suggestion: 'Move to src/test/utils/ or e2e/utils/ for better organization'
        });
      }
    });
    
    suggestions.forEach(({ file, suggestion }) => {
      console.log(`  📋 Utility organization: ${file} - ${suggestion}`);
      this.cleanupLog.push(`Utility suggestion: ${file} - ${suggestion}`);
    });
  }

  async optimizeTestSuite() {
    console.log('⚡ Optimizing test suite...');
    
    // Analyze test performance
    const performanceIssues = await this.analyzeTestPerformance();
    
    // Check for duplicate tests
    const duplicates = this.findDuplicateTests();
    
    // Identify unused test utilities
    const unusedUtils = this.findUnusedTestUtilities();
    
    // Report optimization opportunities
    performanceIssues.forEach(issue => {
      console.log(`  ⚡ Performance: ${issue.file} - ${issue.issue}`);
      this.cleanupLog.push(`Performance issue: ${issue.file} - ${issue.issue}`);
    });
    
    duplicates.forEach(duplicate => {
      console.log(`  🔄 Duplicate: ${duplicate.description}`);
      this.cleanupLog.push(`Duplicate test: ${duplicate.description}`);
    });
    
    unusedUtils.forEach(util => {
      console.log(`  🗑️  Unused utility: ${util}`);
      this.cleanupLog.push(`Unused utility: ${util}`);
    });
  }

  async analyzeTestPerformance() {
    const issues = [];
    const testFiles = this.findAllTestFiles();
    
    testFiles.forEach(testFile => {
      try {
        const content = fs.readFileSync(testFile, 'utf8');
        const relativePath = path.relative(this.projectRoot, testFile);
        
        // Check for performance anti-patterns
        if (content.includes('setTimeout') && !content.includes('vi.useFakeTimers')) {
          issues.push({
            file: relativePath,
            issue: 'Uses setTimeout without fake timers - may cause slow tests'
          });
        }
        
        if (content.match(/for\s*\([^)]*;\s*[^;]*<\s*\d{3,}/)) {
          issues.push({
            file: relativePath,
            issue: 'Contains large loops that may slow down tests'
          });
        }
        
        if (content.includes('beforeEach') && content.includes('fs.writeFileSync')) {
          issues.push({
            file: relativePath,
            issue: 'File I/O in beforeEach may slow down test suite'
          });
        }
        
        // Check for excessive test setup
        const beforeEachMatches = content.match(/beforeEach/g);
        if (beforeEachMatches && beforeEachMatches.length > 3) {
          issues.push({
            file: relativePath,
            issue: 'Multiple beforeEach blocks may indicate complex setup'
          });
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    });
    
    return issues;
  }

  findDuplicateTests() {
    const duplicates = [];
    const testFiles = this.findAllTestFiles();
    const testDescriptions = new Map();
    
    testFiles.forEach(testFile => {
      try {
        const content = fs.readFileSync(testFile, 'utf8');
        const relativePath = path.relative(this.projectRoot, testFile);
        
        // Extract test descriptions
        const testMatches = content.match(/(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g);
        if (testMatches) {
          testMatches.forEach(match => {
            const description = match.match(/['"`]([^'"`]+)['"`]/)[1];
            
            if (testDescriptions.has(description)) {
              duplicates.push({
                description: `"${description}" appears in both ${testDescriptions.get(description)} and ${relativePath}`
              });
            } else {
              testDescriptions.set(description, relativePath);
            }
          });
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    });
    
    return duplicates;
  }

  findUnusedTestUtilities() {
    const unused = [];
    const utilityFiles = this.findTestUtilities();
    const testFiles = this.findAllTestFiles();
    
    utilityFiles.forEach(utilFile => {
      const utilName = path.basename(utilFile, path.extname(utilFile));
      let isUsed = false;
      
      testFiles.forEach(testFile => {
        if (testFile === utilFile) return; // Skip self
        
        try {
          const content = fs.readFileSync(testFile, 'utf8');
          if (content.includes(utilName) || content.includes(path.basename(utilFile))) {
            isUsed = true;
          }
        } catch (error) {
          // Skip files that can't be read
        }
      });
      
      if (!isUsed) {
        unused.push(path.relative(this.projectRoot, utilFile));
      }
    });
    
    return unused;
  }

  async validateTestStructure() {
    console.log('✅ Validating test structure...');
    
    const validationIssues = [];
    
    // Check for required test directories
    const requiredDirs = ['src/test', 'src/test/utils'];
    requiredDirs.forEach(dir => {
      const fullPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        validationIssues.push(`Missing required directory: ${dir}`);
      }
    });
    
    // Check for required test files
    const requiredFiles = [
      'src/test/setup.ts',
      'vitest.config.ts'
    ];
    requiredFiles.forEach(file => {
      const fullPath = path.join(this.projectRoot, file);
      if (!fs.existsSync(fullPath)) {
        validationIssues.push(`Missing required file: ${file}`);
      }
    });
    
    // Check test file structure
    const structureIssues = this.validateTestFileStructure();
    validationIssues.push(...structureIssues);
    
    validationIssues.forEach(issue => {
      console.log(`  ❌ Validation: ${issue}`);
      this.cleanupLog.push(`Validation issue: ${issue}`);
    });
    
    if (validationIssues.length === 0) {
      console.log('  ✅ Test structure validation passed');
    }
  }

  validateTestFileStructure() {
    const issues = [];
    const testFiles = this.findAllTestFiles();
    
    testFiles.forEach(testFile => {
      try {
        const content = fs.readFileSync(testFile, 'utf8');
        const relativePath = path.relative(this.projectRoot, testFile);
        
        // Check for basic test structure
        if (!content.includes('describe') && !content.includes('test') && !content.includes('it')) {
          issues.push(`${relativePath}: No test cases found`);
        }
        
        // Check for proper imports
        if (content.includes('expect(') && !content.includes('import') && !content.includes('require')) {
          issues.push(`${relativePath}: Uses expect() without proper imports`);
        }
        
        // Check for async test handling
        if (content.includes('async') && !content.includes('await')) {
          issues.push(`${relativePath}: Async function without await - potential timing issues`);
        }
        
      } catch (error) {
        issues.push(`${path.relative(this.projectRoot, testFile)}: Could not read file`);
      }
    });
    
    return issues;
  }

  // Helper methods
  findAllTestFiles() {
    const testFiles = [];
    
    this.testDirs.forEach(testDir => {
      const fullPath = path.join(this.projectRoot, testDir);
      if (fs.existsSync(fullPath)) {
        this.walkDirectory(fullPath, (filePath) => {
          if (this.isTestFile(filePath)) {
            testFiles.push(filePath);
          }
        });
      }
    });
    
    return testFiles;
  }

  findTestUtilities() {
    const utilityFiles = [];
    const utilityDirs = ['src/test/utils', 'e2e/utils'];
    
    utilityDirs.forEach(utilDir => {
      const fullPath = path.join(this.projectRoot, utilDir);
      if (fs.existsSync(fullPath)) {
        this.walkDirectory(fullPath, (filePath) => {
          if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
            utilityFiles.push(filePath);
          }
        });
      }
    });
    
    return utilityFiles;
  }

  isTestFile(filePath) {
    const fileName = path.basename(filePath);
    return (
      fileName.includes('.test.') ||
      fileName.includes('.spec.') ||
      filePath.includes('__tests__') ||
      filePath.includes('/test/') ||
      filePath.includes('/tests/')
    );
  }

  extractComponentName(fileName) {
    const match = fileName.match(/([A-Z][a-zA-Z0-9]*)/);
    return match ? match[1] : null;
  }

  walkDirectory(dir, callback) {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        this.walkDirectory(fullPath, callback);
      } else {
        callback(fullPath);
      }
    });
  }

  async generateMaintenanceReport() {
    const reportPath = path.join(this.projectRoot, 'test-maintenance-report.md');
    
    const report = `# Test Maintenance Report

**Generated:** ${new Date().toLocaleString()}

## Maintenance Actions Performed

${this.cleanupLog.length === 0 ? 
  '✅ No maintenance actions required' : 
  this.cleanupLog.map(action => `- ${action}`).join('\n')
}

## Test Suite Statistics

- **Total Test Files:** ${this.findAllTestFiles().length}
- **Test Utility Files:** ${this.findTestUtilities().length}
- **Maintenance Actions:** ${this.cleanupLog.length}

## Recommendations

1. Run test maintenance regularly (weekly or bi-weekly)
2. Address any validation issues found
3. Consider organizing misplaced test files
4. Optimize slow-running tests
5. Remove unused test utilities

## Next Steps

1. Review and address any issues mentioned above
2. Update test documentation if structure changes
3. Run the test suite to ensure everything still works
4. Consider automating maintenance tasks in CI/CD

---
*Generated by HalluciFix Test Maintenance*`;

    fs.writeFileSync(reportPath, report);
    console.log(`📄 Maintenance report generated: ${reportPath}`);
  }
}

// CLI interface
if (require.main === module) {
  const maintenance = new TestMaintenance();
  
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg === '--no-cleanup') options.cleanup = false;
    if (arg === '--no-organize') options.organize = false;
    if (arg === '--no-optimize') options.optimize = false;
    if (arg === '--no-validate') options.validate = false;
    if (arg === '--cleanup-only') {
      options.organize = false;
      options.optimize = false;
      options.validate = false;
    }
  });

  maintenance.runMaintenance(options).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TestMaintenance;