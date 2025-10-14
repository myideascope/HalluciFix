#!/usr/bin/env node

/**
 * Coverage Check Script
 * 
 * This script validates coverage thresholds and generates reports
 * for local development and CI/CD pipelines.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const COVERAGE_THRESHOLDS = {
  global: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80
  },
  critical: {
    lines: 90,
    functions: 90,
    branches: 90,
    statements: 90
  }
};

const CRITICAL_MODULES = [
  'src/lib/analysisService.ts',
  'src/lib/supabase.ts',
  'src/lib/api.ts',
  'src/hooks/useAuth.ts',
  'src/lib/googleDrive.ts',
  'src/lib/ragService.ts',
  'src/lib/scheduledScans.ts'
];

class CoverageChecker {
  constructor() {
    this.coveragePath = path.join(process.cwd(), 'coverage');
    this.summaryPath = path.join(this.coveragePath, 'coverage-summary.json');
    this.errors = [];
    this.warnings = [];
  }

  async run() {
    console.log('🔍 Starting coverage analysis...\n');

    try {
      // Check if coverage data exists
      if (!this.checkCoverageExists()) {
        console.error('❌ No coverage data found. Run tests with coverage first.');
        process.exit(1);
      }

      // Load coverage data
      const coverageData = this.loadCoverageData();
      
      // Perform checks
      this.checkGlobalThresholds(coverageData);
      this.checkCriticalModules(coverageData);
      this.generateReport(coverageData);
      
      // Output results
      this.outputResults();
      
      // Exit with appropriate code
      if (this.errors.length > 0) {
        process.exit(1);
      }
      
      console.log('✅ Coverage analysis completed successfully!');
      
    } catch (error) {
      console.error('❌ Coverage analysis failed:', error.message);
      process.exit(1);
    }
  }

  checkCoverageExists() {
    return fs.existsSync(this.summaryPath);
  }

  loadCoverageData() {
    try {
      const data = fs.readFileSync(this.summaryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load coverage data: ${error.message}`);
    }
  }

  checkGlobalThresholds(coverageData) {
    const total = coverageData.total;
    
    console.log('📊 Global Coverage Analysis:');
    console.log('┌─────────────┬──────────┬───────────┬────────┐');
    console.log('│ Metric      │ Coverage │ Threshold │ Status │');
    console.log('├─────────────┼──────────┼───────────┼────────┤');
    
    const metrics = ['lines', 'functions', 'branches', 'statements'];
    
    metrics.forEach(metric => {
      const coverage = total[metric].pct;
      const threshold = COVERAGE_THRESHOLDS.global[metric];
      const status = coverage >= threshold ? '✅' : '❌';
      
      console.log(`│ ${metric.padEnd(11)} │ ${coverage.toFixed(1).padStart(6)}% │ ${threshold.toString().padStart(7)}% │ ${status.padEnd(6)} │`);
      
      if (coverage < threshold) {
        this.errors.push(`Global ${metric} coverage (${coverage.toFixed(1)}%) below threshold (${threshold}%)`);
      }
    });
    
    console.log('└─────────────┴──────────┴───────────┴────────┘\n');
  }

  checkCriticalModules(coverageData) {
    console.log('🔍 Critical Module Coverage Analysis:');
    console.log('┌─────────────────────────────────────┬──────────┬───────────┬────────┐');
    console.log('│ Module                              │ Coverage │ Threshold │ Status │');
    console.log('├─────────────────────────────────────┼──────────┼───────────┼────────┤');
    
    CRITICAL_MODULES.forEach(module => {
      const moduleData = coverageData[module];
      
      if (moduleData) {
        const coverage = moduleData.lines.pct;
        const threshold = COVERAGE_THRESHOLDS.critical.lines;
        const status = coverage >= threshold ? '✅' : '❌';
        
        const truncatedModule = module.length > 35 ? 
          module.substring(0, 32) + '...' : 
          module;
        
        console.log(`│ ${truncatedModule.padEnd(35)} │ ${coverage.toFixed(1).padStart(6)}% │ ${threshold.toString().padStart(7)}% │ ${status.padEnd(6)} │`);
        
        if (coverage < threshold) {
          this.errors.push(`Critical module ${module} coverage (${coverage.toFixed(1)}%) below threshold (${threshold}%)`);
        }
      } else {
        console.log(`│ ${module.padEnd(35)} │ ${'N/A'.padStart(6)}  │ ${COVERAGE_THRESHOLDS.critical.lines.toString().padStart(7)}% │ ${'⚠️'.padEnd(6)} │`);
        this.warnings.push(`Critical module ${module} not found in coverage report`);
      }
    });
    
    console.log('└─────────────────────────────────────┴──────────┴───────────┴────────┘\n');
  }

  generateReport(coverageData) {
    const reportPath = path.join(this.coveragePath, 'coverage-report.md');
    const total = coverageData.total;
    
    const report = `# Coverage Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Coverage | Threshold | Status |
|--------|----------|-----------|--------|
| Lines | ${total.lines.pct.toFixed(1)}% | ${COVERAGE_THRESHOLDS.global.lines}% | ${total.lines.pct >= COVERAGE_THRESHOLDS.global.lines ? '✅' : '❌'} |
| Functions | ${total.functions.pct.toFixed(1)}% | ${COVERAGE_THRESHOLDS.global.functions}% | ${total.functions.pct >= COVERAGE_THRESHOLDS.global.functions ? '✅' : '❌'} |
| Branches | ${total.branches.pct.toFixed(1)}% | ${COVERAGE_THRESHOLDS.global.branches}% | ${total.branches.pct >= COVERAGE_THRESHOLDS.global.branches ? '✅' : '❌'} |
| Statements | ${total.statements.pct.toFixed(1)}% | ${COVERAGE_THRESHOLDS.global.statements}% | ${total.statements.pct >= COVERAGE_THRESHOLDS.global.statements ? '✅' : '❌'} |

## Critical Modules

${CRITICAL_MODULES.map(module => {
  const moduleData = coverageData[module];
  if (moduleData) {
    const coverage = moduleData.lines.pct;
    const threshold = COVERAGE_THRESHOLDS.critical.lines;
    return `- **${module}**: ${coverage.toFixed(1)}% ${coverage >= threshold ? '✅' : '❌'}`;
  } else {
    return `- **${module}**: Not found ⚠️`;
  }
}).join('\n')}

## Detailed Coverage

For detailed coverage information, see:
- [HTML Report](./index.html)
- [LCOV Report](./lcov.info)
- [JSON Summary](./coverage-summary.json)

## Recommendations

${this.generateRecommendations(coverageData)}
`;

    fs.writeFileSync(reportPath, report);
    console.log(`📄 Coverage report generated: ${reportPath}\n`);
  }

  generateRecommendations(coverageData) {
    const recommendations = [];
    const total = coverageData.total;
    
    if (total.lines.pct < COVERAGE_THRESHOLDS.global.lines) {
      recommendations.push('- Add more unit tests to improve line coverage');
    }
    
    if (total.functions.pct < COVERAGE_THRESHOLDS.global.functions) {
      recommendations.push('- Ensure all functions have test coverage');
    }
    
    if (total.branches.pct < COVERAGE_THRESHOLDS.global.branches) {
      recommendations.push('- Add tests for conditional logic and edge cases');
    }
    
    if (total.statements.pct < COVERAGE_THRESHOLDS.global.statements) {
      recommendations.push('- Review and test all code statements');
    }
    
    // Check for files with low coverage
    Object.keys(coverageData).forEach(file => {
      if (file !== 'total' && file.startsWith('src/')) {
        const fileData = coverageData[file];
        if (fileData.lines.pct < 70) {
          recommendations.push(`- Improve coverage for ${file} (${fileData.lines.pct.toFixed(1)}%)`);
        }
      }
    });
    
    if (recommendations.length === 0) {
      recommendations.push('- Coverage looks good! Consider adding more edge case tests.');
    }
    
    return recommendations.join('\n');
  }

  outputResults() {
    if (this.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      this.warnings.forEach(warning => console.log(`   ${warning}`));
      console.log();
    }
    
    if (this.errors.length > 0) {
      console.log('❌ Errors:');
      this.errors.forEach(error => console.log(`   ${error}`));
      console.log();
    }
  }
}

// Run the coverage checker
if (require.main === module) {
  const checker = new CoverageChecker();
  checker.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = CoverageChecker;