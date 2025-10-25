#!/usr/bin/env node

/**
 * Coverage Analysis System
 * Provides comprehensive coverage reporting, trend analysis, and quality gates
 */

const fs = require('fs');
const path = require('path');

class CoverageAnalyzer {
  constructor() {
    this.coverageDir = 'coverage';
    this.reportsDir = 'coverage-reports';
    this.baselineFile = 'coverage-baseline.json';
    this.criticalModules = [
      'src/lib/analysisService.ts',
      'src/lib/supabase.ts',
      'src/lib/api.ts',
      'src/hooks/useAuth.ts',
      'src/lib/googleDrive.ts',
      'src/lib/ragService.ts'
    ];
    this.thresholds = {
      global: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      },
      critical: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    };
  }

  /**
   * Load coverage data from coverage-final.json
   */
  loadCoverageData() {
    const coverageFile = path.join(this.coverageDir, 'coverage-final.json');
    if (!fs.existsSync(coverageFile)) {
      throw new Error(`Coverage file not found: ${coverageFile}`);
    }
    
    return JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
  }

  /**
   * Load coverage summary from coverage-summary.json
   */
  loadCoverageSummary() {
    const summaryFile = path.join(this.coverageDir, 'coverage-summary.json');
    if (!fs.existsSync(summaryFile)) {
      throw new Error(`Coverage summary not found: ${summaryFile}`);
    }
    
    return JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  }

  /**
   * Calculate coverage metrics for specific files
   */
  calculateModuleCoverage(coverageData, modules) {
    const moduleCoverage = {};
    
    for (const module of modules) {
      const normalizedPath = path.resolve(module);
      const coverageEntry = Object.keys(coverageData).find(key => 
        path.resolve(key) === normalizedPath || key.includes(module)
      );
      
      if (coverageEntry && coverageData[coverageEntry]) {
        const data = coverageData[coverageEntry];
        moduleCoverage[module] = {
          lines: this.calculatePercentage(data.l),
          functions: this.calculatePercentage(data.f),
          branches: this.calculatePercentage(data.b),
          statements: this.calculatePercentage(data.s)
        };
      } else {
        moduleCoverage[module] = {
          lines: 0,
          functions: 0,
          branches: 0,
          statements: 0,
          missing: true
        };
      }
    }
    
    return moduleCoverage;
  }

  /**
   * Calculate percentage from coverage data
   */
  calculatePercentage(coverageMap) {
    if (!coverageMap) return 0;
    
    const values = Object.values(coverageMap);
    const covered = values.filter(v => v > 0).length;
    const total = values.length;
    
    return total > 0 ? (covered / total) * 100 : 0;
  }

  /**
   * Load baseline coverage for comparison
   */
  loadBaseline() {
    if (!fs.existsSync(this.baselineFile)) {
      return null;
    }
    
    try {
      return JSON.parse(fs.readFileSync(this.baselineFile, 'utf8'));
    } catch (error) {
      console.warn('Failed to load baseline coverage:', error.message);
      return null;
    }
  }

  /**
   * Save current coverage as baseline
   */
  saveBaseline(coverageData) {
    fs.writeFileSync(this.baselineFile, JSON.stringify(coverageData, null, 2));
    console.log(`✅ Baseline coverage saved to ${this.baselineFile}`);
  }

  /**
   * Compare current coverage with baseline
   */
  compareWithBaseline(current, baseline) {
    if (!baseline) {
      return {
        hasBaseline: false,
        message: 'No baseline found for comparison'
      };
    }

    const comparison = {
      hasBaseline: true,
      changes: {},
      regression: false,
      improvement: false
    };

    const metrics = ['lines', 'functions', 'branches', 'statements'];
    
    for (const metric of metrics) {
      const currentPct = current.total[metric].pct;
      const baselinePct = baseline.total[metric].pct;
      const diff = currentPct - baselinePct;
      
      comparison.changes[metric] = {
        current: currentPct,
        baseline: baselinePct,
        diff: diff,
        improved: diff > 0,
        regressed: diff < -1 // Consider 1% drop as regression
      };
      
      if (diff < -1) comparison.regression = true;
      if (diff > 1) comparison.improvement = true;
    }

    return comparison;
  }

  /**
   * Check if coverage meets thresholds
   */
  checkThresholds(summary, moduleCoverage) {
    const results = {
      global: { passed: true, failures: [] },
      critical: { passed: true, failures: [] }
    };

    // Check global thresholds
    const global = summary.total;
    for (const [metric, threshold] of Object.entries(this.thresholds.global)) {
      if (global[metric].pct < threshold) {
        results.global.passed = false;
        results.global.failures.push({
          metric,
          actual: global[metric].pct,
          threshold,
          diff: global[metric].pct - threshold
        });
      }
    }

    // Check critical module thresholds
    for (const [module, coverage] of Object.entries(moduleCoverage)) {
      if (coverage.missing) {
        results.critical.passed = false;
        results.critical.failures.push({
          module,
          issue: 'Module not found in coverage data'
        });
        continue;
      }

      for (const [metric, threshold] of Object.entries(this.thresholds.critical)) {
        if (coverage[metric] < threshold) {
          results.critical.passed = false;
          results.critical.failures.push({
            module,
            metric,
            actual: coverage[metric],
            threshold,
            diff: coverage[metric] - threshold
          });
        }
      }
    }

    return results;
  }

  /**
   * Generate coverage trend data
   */
  generateTrendData(current, baseline) {
    const timestamp = new Date().toISOString();
    const trendFile = path.join(this.reportsDir, 'coverage-trend.json');
    
    let trendData = [];
    if (fs.existsSync(trendFile)) {
      try {
        trendData = JSON.parse(fs.readFileSync(trendFile, 'utf8'));
      } catch (error) {
        console.warn('Failed to load trend data:', error.message);
      }
    }

    // Add current data point
    trendData.push({
      timestamp,
      commit: process.env.GITHUB_SHA || 'unknown',
      branch: process.env.GITHUB_REF_NAME || 'unknown',
      coverage: {
        lines: current.total.lines.pct,
        functions: current.total.functions.pct,
        branches: current.total.branches.pct,
        statements: current.total.statements.pct
      }
    });

    // Keep only last 100 data points
    if (trendData.length > 100) {
      trendData = trendData.slice(-100);
    }

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    fs.writeFileSync(trendFile, JSON.stringify(trendData, null, 2));
    return trendData;
  }

  /**
   * Generate comprehensive coverage report
   */
  generateReport(summary, coverageData, moduleCoverage, baseline, trendData) {
    const timestamp = new Date().toISOString();
    const comparison = this.compareWithBaseline(summary, baseline);
    const thresholdResults = this.checkThresholds(summary, moduleCoverage);

    const report = {
      timestamp,
      commit: process.env.GITHUB_SHA || 'unknown',
      branch: process.env.GITHUB_REF_NAME || 'unknown',
      summary: {
        global: summary.total,
        thresholds: this.thresholds,
        passed: thresholdResults.global.passed && thresholdResults.critical.passed
      },
      criticalModules: moduleCoverage,
      comparison,
      thresholdResults,
      trendData: trendData.slice(-10), // Last 10 data points
      recommendations: this.generateRecommendations(thresholdResults, comparison)
    };

    // Save detailed report
    const reportFile = path.join(this.reportsDir, `coverage-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Save latest report
    const latestReportFile = path.join(this.reportsDir, 'latest-coverage-report.json');
    fs.writeFileSync(latestReportFile, JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Generate recommendations based on coverage analysis
   */
  generateRecommendations(thresholdResults, comparison) {
    const recommendations = [];

    // Global threshold failures
    if (!thresholdResults.global.passed) {
      for (const failure of thresholdResults.global.failures) {
        recommendations.push({
          type: 'threshold',
          priority: 'high',
          message: `Global ${failure.metric} coverage (${failure.actual.toFixed(1)}%) is below threshold (${failure.threshold}%)`,
          action: `Add tests to improve ${failure.metric} coverage by ${Math.abs(failure.diff).toFixed(1)}%`
        });
      }
    }

    // Critical module failures
    if (!thresholdResults.critical.passed) {
      for (const failure of thresholdResults.critical.failures) {
        if (failure.issue) {
          recommendations.push({
            type: 'missing-module',
            priority: 'critical',
            message: `Critical module ${failure.module} not found in coverage`,
            action: 'Ensure this module is included in test runs'
          });
        } else {
          recommendations.push({
            type: 'critical-threshold',
            priority: 'critical',
            message: `Critical module ${failure.module} ${failure.metric} coverage (${failure.actual.toFixed(1)}%) below threshold (${failure.threshold}%)`,
            action: `Add comprehensive tests for ${failure.module}`
          });
        }
      }
    }

    // Regression warnings
    if (comparison.regression) {
      for (const [metric, change] of Object.entries(comparison.changes)) {
        if (change.regressed) {
          recommendations.push({
            type: 'regression',
            priority: 'medium',
            message: `${metric} coverage decreased by ${Math.abs(change.diff).toFixed(1)}%`,
            action: 'Review recent changes and add missing tests'
          });
        }
      }
    }

    // Improvement recognition
    if (comparison.improvement) {
      recommendations.push({
        type: 'improvement',
        priority: 'info',
        message: 'Coverage has improved compared to baseline',
        action: 'Great work! Consider updating baseline if this represents stable improvement'
      });
    }

    return recommendations;
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report) {
    const { summary, criticalModules, comparison, thresholdResults, recommendations } = report;

    let markdown = `# 📊 Coverage Analysis Report

**Generated:** ${new Date(report.timestamp).toLocaleString()}
**Commit:** ${report.commit}
**Branch:** ${report.branch}

## Overall Coverage

| Metric | Coverage | Threshold | Status |
|--------|----------|-----------|--------|
| Lines | ${summary.global.lines.pct.toFixed(1)}% | ${this.thresholds.global.lines}% | ${summary.global.lines.pct >= this.thresholds.global.lines ? '✅' : '❌'} |
| Functions | ${summary.global.functions.pct.toFixed(1)}% | ${this.thresholds.global.functions}% | ${summary.global.functions.pct >= this.thresholds.global.functions ? '✅' : '❌'} |
| Branches | ${summary.global.branches.pct.toFixed(1)}% | ${this.thresholds.global.branches}% | ${summary.global.branches.pct >= this.thresholds.global.branches ? '✅' : '❌'} |
| Statements | ${summary.global.statements.pct.toFixed(1)}% | ${this.thresholds.global.statements}% | ${summary.global.statements.pct >= this.thresholds.global.statements ? '✅' : '❌'} |

**Overall Status:** ${summary.passed ? '✅ PASSED' : '❌ FAILED'}

`;

    // Baseline comparison
    if (comparison.hasBaseline) {
      markdown += `## Baseline Comparison

| Metric | Current | Baseline | Change |
|--------|---------|----------|--------|
`;
      for (const [metric, change] of Object.entries(comparison.changes)) {
        const arrow = change.diff > 0 ? '📈' : change.diff < 0 ? '📉' : '➡️';
        const sign = change.diff > 0 ? '+' : '';
        markdown += `| ${metric} | ${change.current.toFixed(1)}% | ${change.baseline.toFixed(1)}% | ${arrow} ${sign}${change.diff.toFixed(1)}% |\n`;
      }
      markdown += '\n';
    }

    // Critical modules
    markdown += `## Critical Modules Coverage

| Module | Lines | Functions | Branches | Statements | Status |
|--------|-------|-----------|----------|------------|--------|
`;

    for (const [module, coverage] of Object.entries(criticalModules)) {
      if (coverage.missing) {
        markdown += `| ${module} | - | - | - | - | ❌ Missing |\n`;
      } else {
        const status = Object.values(coverage).every(v => v >= this.thresholds.critical.lines) ? '✅' : '❌';
        markdown += `| ${module} | ${coverage.lines.toFixed(1)}% | ${coverage.functions.toFixed(1)}% | ${coverage.branches.toFixed(1)}% | ${coverage.statements.toFixed(1)}% | ${status} |\n`;
      }
    }

    // Recommendations
    if (recommendations.length > 0) {
      markdown += `\n## Recommendations

`;
      for (const rec of recommendations) {
        const icon = rec.priority === 'critical' ? '🚨' : rec.priority === 'high' ? '⚠️' : rec.priority === 'medium' ? '💡' : 'ℹ️';
        markdown += `${icon} **${rec.type.toUpperCase()}**: ${rec.message}
   - *Action:* ${rec.action}

`;
      }
    }

    return markdown;
  }

  /**
   * Main analysis function
   */
  async analyze(options = {}) {
    try {
      console.log('🔍 Starting coverage analysis...');

      // Load coverage data
      const coverageData = this.loadCoverageData();
      const summary = this.loadCoverageSummary();
      
      console.log('📊 Coverage data loaded successfully');

      // Analyze critical modules
      const moduleCoverage = this.calculateModuleCoverage(coverageData, this.criticalModules);
      console.log(`🎯 Analyzed ${this.criticalModules.length} critical modules`);

      // Load baseline for comparison
      const baseline = this.loadBaseline();
      
      // Generate trend data
      const trendData = this.generateTrendData(summary, baseline);
      console.log(`📈 Updated trend data (${trendData.length} data points)`);

      // Generate comprehensive report
      const report = this.generateReport(summary, coverageData, moduleCoverage, baseline, trendData);
      
      // Generate markdown report
      const markdownReport = this.generateMarkdownReport(report);
      const markdownFile = path.join(this.reportsDir, 'coverage-report.md');
      fs.writeFileSync(markdownFile, markdownReport);

      console.log('📝 Reports generated:');
      console.log(`   - JSON: ${path.join(this.reportsDir, 'latest-coverage-report.json')}`);
      console.log(`   - Markdown: ${markdownFile}`);

      // Update baseline if requested
      if (options.updateBaseline) {
        this.saveBaseline(summary);
      }

      // Output results
      console.log('\n📊 Coverage Summary:');
      console.log(`   Lines: ${summary.total.lines.pct.toFixed(1)}%`);
      console.log(`   Functions: ${summary.total.functions.pct.toFixed(1)}%`);
      console.log(`   Branches: ${summary.total.branches.pct.toFixed(1)}%`);
      console.log(`   Statements: ${summary.total.statements.pct.toFixed(1)}%`);

      if (!report.summary.passed) {
        console.log('\n❌ Coverage thresholds not met');
        if (options.failOnThreshold) {
          process.exit(1);
        }
      } else {
        console.log('\n✅ All coverage thresholds met');
      }

      return report;

    } catch (error) {
      console.error('❌ Coverage analysis failed:', error.message);
      if (options.failOnError) {
        process.exit(1);
      }
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    updateBaseline: args.includes('--update-baseline'),
    failOnThreshold: args.includes('--fail-on-threshold'),
    failOnError: args.includes('--fail-on-error')
  };

  const analyzer = new CoverageAnalyzer();
  analyzer.analyze(options).catch(console.error);
}

module.exports = CoverageAnalyzer;