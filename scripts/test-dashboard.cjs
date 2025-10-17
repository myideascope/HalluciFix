#!/usr/bin/env node

/**
 * Test Dashboard
 * 
 * Provides a comprehensive dashboard for test monitoring,
 * combining health, performance, and maintenance insights.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestDashboard {
  constructor() {
    this.projectRoot = process.cwd();
    this.dashboardDir = path.join(this.projectRoot, '.test-dashboard');
    
    // Ensure dashboard directory exists
    if (!fs.existsSync(this.dashboardDir)) {
      fs.mkdirSync(this.dashboardDir, { recursive: true });
    }
  }

  async generateDashboard(options = {}) {
    console.log('📊 Generating comprehensive test dashboard...\n');

    try {
      const dashboardData = {
        timestamp: new Date().toISOString(),
        overview: await this.generateOverview(),
        health: await this.getHealthData(),
        performance: await this.getPerformanceData(),
        coverage: await this.getCoverageData(),
        maintenance: await this.getMaintenanceData(),
        trends: await this.getTrendData(),
        recommendations: []
      };

      dashboardData.recommendations = this.generateDashboardRecommendations(dashboardData);

      await this.generateHTMLDashboard(dashboardData);
      await this.generateMarkdownSummary(dashboardData);
      await this.saveDashboardData(dashboardData);

      console.log('✅ Test dashboard generated successfully!');
      console.log(`📊 Dashboard available at: ${path.join(this.dashboardDir, 'dashboard.html')}`);

      // Show critical alerts
      this.showCriticalAlerts(dashboardData);

    } catch (error) {
      console.error('❌ Dashboard generation failed:', error.message);
      process.exit(1);
    }
  }

  async generateOverview() {
    console.log('📋 Generating test overview...');
    
    const overview = {
      testFiles: this.countTestFiles(),
      testSuites: this.identifyTestSuites(),
      configuration: this.checkConfiguration(),
      lastRun: this.getLastTestRun()
    };

    return overview;
  }

  countTestFiles() {
    const testDirs = [
      'src/components/__tests__',
      'src/lib/__tests__',
      'src/hooks/__tests__',
      'src/test',
      'e2e'
    ];

    let totalFiles = 0;
    const breakdown = {};

    testDirs.forEach(dir => {
      const fullPath = path.join(this.projectRoot, dir);
      if (fs.existsSync(fullPath)) {
        const files = this.countFilesInDirectory(fullPath, /\.(test|spec)\.(ts|tsx|js|jsx)$/);
        breakdown[dir] = files;
        totalFiles += files;
      } else {
        breakdown[dir] = 0;
      }
    });

    return {
      total: totalFiles,
      breakdown: breakdown
    };
  }

  countFilesInDirectory(dir, pattern) {
    let count = 0;
    
    const walk = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (pattern.test(item)) {
          count++;
        }
      });
    };
    
    walk(dir);
    return count;
  }

  identifyTestSuites() {
    const suites = [];
    
    // Check for different test configurations
    const configs = [
      { name: 'Unit Tests', config: 'vitest.config.ts', script: 'test:run' },
      { name: 'Integration Tests', config: 'vitest.integration.config.ts', script: 'test:integration' },
      { name: 'E2E Tests', config: 'playwright.config.ts', script: 'test:e2e' },
      { name: 'Performance Tests', config: 'playwright.performance.config.ts', script: 'test:performance' },
      { name: 'Visual Tests', config: 'playwright.visual.config.ts', script: 'test:visual' },
      { name: 'Security Tests', config: 'playwright.security.config.ts', script: 'test:security' }
    ];

    configs.forEach(suite => {
      const configExists = fs.existsSync(path.join(this.projectRoot, suite.config));
      const scriptExists = this.hasScript(suite.script);
      
      suites.push({
        name: suite.name,
        configured: configExists,
        scriptAvailable: scriptExists,
        status: configExists && scriptExists ? 'ready' : 'incomplete'
      });
    });

    return suites;
  }

  hasScript(scriptName) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));
      return packageJson.scripts && packageJson.scripts[scriptName];
    } catch (error) {
      return false;
    }
  }

  checkConfiguration() {
    const configs = {
      vitest: fs.existsSync(path.join(this.projectRoot, 'vitest.config.ts')),
      playwright: fs.existsSync(path.join(this.projectRoot, 'playwright.config.ts')),
      testSetup: fs.existsSync(path.join(this.projectRoot, 'src/test/setup.ts')),
      coverage: this.hasCoverageConfig(),
      ci: fs.existsSync(path.join(this.projectRoot, '.github/workflows'))
    };

    return configs;
  }

  hasCoverageConfig() {
    try {
      const vitestConfig = path.join(this.projectRoot, 'vitest.config.ts');
      if (fs.existsSync(vitestConfig)) {
        const content = fs.readFileSync(vitestConfig, 'utf8');
        return content.includes('coverage');
      }
    } catch (error) {
      // Ignore errors
    }
    return false;
  }

  getLastTestRun() {
    const coveragePath = path.join(this.projectRoot, 'coverage');
    const testResultsPath = path.join(this.projectRoot, 'test-results');
    
    let lastRun = null;
    
    [coveragePath, testResultsPath].forEach(dir => {
      if (fs.existsSync(dir)) {
        const stat = fs.statSync(dir);
        if (!lastRun || stat.mtime > lastRun) {
          lastRun = stat.mtime;
        }
      }
    });

    return lastRun ? {
      timestamp: lastRun.toISOString(),
      timeAgo: this.getTimeAgo(lastRun)
    } : null;
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  async getHealthData() {
    const healthDataPath = path.join(this.projectRoot, '.test-health');
    
    if (!fs.existsSync(healthDataPath)) {
      return { status: 'no_data', message: 'No health monitoring data available' };
    }

    try {
      const flakyTestsFile = path.join(healthDataPath, 'flaky-tests.json');
      const healthReportFile = path.join(healthDataPath, 'health-report.md');
      
      const data = {
        status: 'available',
        flakyTests: fs.existsSync(flakyTestsFile) ? 
          JSON.parse(fs.readFileSync(flakyTestsFile, 'utf8')) : [],
        lastHealthCheck: fs.existsSync(healthReportFile) ? 
          fs.statSync(healthReportFile).mtime.toISOString() : null
      };

      return data;
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getPerformanceData() {
    const performanceDataPath = path.join(this.projectRoot, '.test-performance');
    
    if (!fs.existsSync(performanceDataPath)) {
      return { status: 'no_data', message: 'No performance monitoring data available' };
    }

    try {
      const benchmarksFile = path.join(performanceDataPath, 'benchmarks.json');
      const trendsFile = path.join(performanceDataPath, 'trends.json');
      
      const data = {
        status: 'available',
        benchmarks: fs.existsSync(benchmarksFile) ? 
          JSON.parse(fs.readFileSync(benchmarksFile, 'utf8')) : null,
        trends: fs.existsSync(trendsFile) ? 
          JSON.parse(fs.readFileSync(trendsFile, 'utf8')) : [],
        lastPerformanceCheck: fs.existsSync(benchmarksFile) ? 
          fs.statSync(benchmarksFile).mtime.toISOString() : null
      };

      return data;
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getCoverageData() {
    const coveragePath = path.join(this.projectRoot, 'coverage/coverage-summary.json');
    
    if (!fs.existsSync(coveragePath)) {
      return { status: 'no_data', message: 'No coverage data available' };
    }

    try {
      const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      
      return {
        status: 'available',
        summary: coverageData.total,
        lastUpdate: fs.statSync(coveragePath).mtime.toISOString(),
        fileCount: Object.keys(coverageData).filter(key => key !== 'total').length
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getMaintenanceData() {
    const maintenanceReportPath = path.join(this.projectRoot, 'test-maintenance-report.md');
    
    if (!fs.existsSync(maintenanceReportPath)) {
      return { status: 'no_data', message: 'No maintenance data available' };
    }

    try {
      return {
        status: 'available',
        lastMaintenance: fs.statSync(maintenanceReportPath).mtime.toISOString(),
        reportAvailable: true
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getTrendData() {
    const trends = {
      coverage: this.getCoverageTrends(),
      performance: this.getPerformanceTrends(),
      health: this.getHealthTrends()
    };

    return trends;
  }

  getCoverageTrends() {
    const trendsFile = path.join(this.projectRoot, '.test-health/coverage-trends.json');
    
    if (fs.existsSync(trendsFile)) {
      try {
        const trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'));
        return {
          status: 'available',
          dataPoints: trends.length,
          latest: trends[trends.length - 1],
          trend: this.calculateTrend(trends, 'lines')
        };
      } catch (error) {
        return { status: 'error', message: error.message };
      }
    }
    
    return { status: 'no_data' };
  }

  getPerformanceTrends() {
    const trendsFile = path.join(this.projectRoot, '.test-performance/trends.json');
    
    if (fs.existsSync(trendsFile)) {
      try {
        const trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'));
        return {
          status: 'available',
          dataPoints: trends.length,
          latest: trends[trends.length - 1],
          trend: this.calculatePerformanceTrend(trends)
        };
      } catch (error) {
        return { status: 'error', message: error.message };
      }
    }
    
    return { status: 'no_data' };
  }

  getHealthTrends() {
    const historyFile = path.join(this.projectRoot, '.test-health/test-history.json');
    
    if (fs.existsSync(historyFile)) {
      try {
        const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        return {
          status: 'available',
          dataPoints: history.length,
          latest: history[history.length - 1],
          trend: this.calculateHealthTrend(history)
        };
      } catch (error) {
        return { status: 'error', message: error.message };
      }
    }
    
    return { status: 'no_data' };
  }

  calculateTrend(data, metric) {
    if (data.length < 2) return 'insufficient_data';
    
    const recent = data.slice(-3);
    const older = data.slice(-6, -3);
    
    if (older.length === 0) return 'insufficient_data';
    
    const recentAvg = recent.reduce((sum, point) => sum + point[metric], 0) / recent.length;
    const olderAvg = older.reduce((sum, point) => sum + point[metric], 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    const threshold = 1; // 1% threshold
    
    if (Math.abs(diff) < threshold) return 'stable';
    return diff > 0 ? 'improving' : 'declining';
  }

  calculatePerformanceTrend(data) {
    if (data.length < 2) return 'insufficient_data';
    
    const recent = data.slice(-3);
    const older = data.slice(-6, -3);
    
    if (older.length === 0) return 'insufficient_data';
    
    const recentAvg = recent.reduce((sum, point) => 
      sum + (point.measurements?.unit?.totalDuration || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, point) => 
      sum + (point.measurements?.unit?.totalDuration || 0), 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    const threshold = 1000; // 1 second threshold
    
    if (Math.abs(diff) < threshold) return 'stable';
    return diff > 0 ? 'degrading' : 'improving';
  }

  calculateHealthTrend(data) {
    if (data.length < 2) return 'insufficient_data';
    
    const recent = data.slice(-3);
    const older = data.slice(-6, -3);
    
    if (older.length === 0) return 'insufficient_data';
    
    const recentSuccessRate = recent.reduce((sum, point) => 
      sum + (point.testRuns?.unit?.successRate || 0), 0) / recent.length;
    const olderSuccessRate = older.reduce((sum, point) => 
      sum + (point.testRuns?.unit?.successRate || 0), 0) / older.length;
    
    const diff = recentSuccessRate - olderSuccessRate;
    const threshold = 5; // 5% threshold
    
    if (Math.abs(diff) < threshold) return 'stable';
    return diff > 0 ? 'improving' : 'declining';
  }

  generateDashboardRecommendations(data) {
    const recommendations = [];
    
    // Health recommendations
    if (data.health.status === 'available' && data.health.flakyTests.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'health',
        title: `${data.health.flakyTests.length} flaky tests detected`,
        action: 'Run test health monitoring and fix flaky tests'
      });
    }
    
    // Performance recommendations
    if (data.performance.status === 'available' && data.performance.benchmarks) {
      const efficiency = data.performance.benchmarks.analysis?.overall?.efficiency || 0;
      if (efficiency < 50) {
        recommendations.push({
          priority: 'high',
          category: 'performance',
          title: `Low test efficiency (${efficiency.toFixed(1)}%)`,
          action: 'Run performance monitoring and optimize slow tests'
        });
      }
    }
    
    // Coverage recommendations
    if (data.coverage.status === 'available') {
      if (data.coverage.summary.lines.pct < 80) {
        recommendations.push({
          priority: 'medium',
          category: 'coverage',
          title: `Low line coverage (${data.coverage.summary.lines.pct.toFixed(1)}%)`,
          action: 'Add more unit tests to improve coverage'
        });
      }
    } else {
      recommendations.push({
        priority: 'medium',
        category: 'coverage',
        title: 'No coverage data available',
        action: 'Run tests with coverage to get metrics'
      });
    }
    
    // Configuration recommendations
    const incompleteConfigs = data.overview.testSuites.filter(suite => suite.status === 'incomplete');
    if (incompleteConfigs.length > 0) {
      recommendations.push({
        priority: 'low',
        category: 'configuration',
        title: `${incompleteConfigs.length} test suites not fully configured`,
        action: 'Complete test suite configuration'
      });
    }
    
    // Maintenance recommendations
    if (data.maintenance.status === 'no_data') {
      recommendations.push({
        priority: 'low',
        category: 'maintenance',
        title: 'No maintenance data available',
        action: 'Run test maintenance to check for issues'
      });
    }
    
    return recommendations;
  }

  showCriticalAlerts(data) {
    const criticalRecs = data.recommendations.filter(r => r.priority === 'high');
    
    if (criticalRecs.length > 0) {
      console.log('\n🚨 Critical Issues Detected:');
      criticalRecs.forEach(rec => {
        console.log(`   ${rec.title} - ${rec.action}`);
      });
    }
  }

  async generateHTMLDashboard(data) {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Dashboard - HalluciFix</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1rem; }
        .grid { display: grid; gap: 20px; margin-bottom: 30px; }
        .grid-2 { grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); }
        .grid-3 { grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); }
        .grid-4 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
        .card { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .card h3 { color: #2d3748; margin-bottom: 15px; font-size: 1.3rem; }
        .metric { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
        .metric:last-child { border-bottom: none; }
        .metric-label { font-weight: 500; color: #4a5568; }
        .metric-value { font-weight: 600; }
        .status-good { color: #38a169; }
        .status-warning { color: #d69e2e; }
        .status-error { color: #e53e3e; }
        .status-info { color: #3182ce; }
        .progress-bar { width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin: 8px 0; }
        .progress-fill { height: 100%; transition: width 0.3s ease; }
        .progress-good { background: linear-gradient(90deg, #38a169, #48bb78); }
        .progress-warning { background: linear-gradient(90deg, #d69e2e, #ecc94b); }
        .progress-error { background: linear-gradient(90deg, #e53e3e, #fc8181); }
        .recommendations { background: #fff5f5; border-left: 4px solid #e53e3e; }
        .recommendations.warning { background: #fffbeb; border-left-color: #d69e2e; }
        .recommendations.info { background: #ebf8ff; border-left-color: #3182ce; }
        .recommendation-item { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.1); }
        .recommendation-item:last-child { border-bottom: none; }
        .trend-up { color: #38a169; }
        .trend-down { color: #e53e3e; }
        .trend-stable { color: #718096; }
        .suite-status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
        .suite-ready { background: #c6f6d5; color: #22543d; }
        .suite-incomplete { background: #fed7d7; color: #742a2a; }
        .footer { text-align: center; color: #718096; margin-top: 40px; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Test Dashboard</h1>
            <p>Comprehensive testing insights for HalluciFix • Generated ${new Date(data.timestamp).toLocaleString()}</p>
        </div>

        <!-- Overview Section -->
        <div class="grid grid-4">
            <div class="card">
                <h3>📊 Test Files</h3>
                <div class="metric">
                    <span class="metric-label">Total Files</span>
                    <span class="metric-value status-info">${data.overview.testFiles.total}</span>
                </div>
                ${Object.entries(data.overview.testFiles.breakdown).map(([dir, count]) => `
                <div class="metric">
                    <span class="metric-label">${dir}</span>
                    <span class="metric-value">${count}</span>
                </div>
                `).join('')}
            </div>

            <div class="card">
                <h3>⚙️ Configuration</h3>
                <div class="metric">
                    <span class="metric-label">Vitest</span>
                    <span class="metric-value ${data.overview.configuration.vitest ? 'status-good' : 'status-error'}">${data.overview.configuration.vitest ? '✅' : '❌'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Playwright</span>
                    <span class="metric-value ${data.overview.configuration.playwright ? 'status-good' : 'status-error'}">${data.overview.configuration.playwright ? '✅' : '❌'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Coverage</span>
                    <span class="metric-value ${data.overview.configuration.coverage ? 'status-good' : 'status-warning'}">${data.overview.configuration.coverage ? '✅' : '⚠️'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">CI/CD</span>
                    <span class="metric-value ${data.overview.configuration.ci ? 'status-good' : 'status-warning'}">${data.overview.configuration.ci ? '✅' : '⚠️'}</span>
                </div>
            </div>

            <div class="card">
                <h3>🏥 Health Status</h3>
                <div class="metric">
                    <span class="metric-label">Status</span>
                    <span class="metric-value ${data.health.status === 'available' ? 'status-good' : 'status-warning'}">${data.health.status === 'available' ? 'Monitored' : 'No Data'}</span>
                </div>
                ${data.health.status === 'available' ? `
                <div class="metric">
                    <span class="metric-label">Flaky Tests</span>
                    <span class="metric-value ${data.health.flakyTests.length === 0 ? 'status-good' : 'status-error'}">${data.health.flakyTests.length}</span>
                </div>
                ` : ''}
            </div>

            <div class="card">
                <h3>⚡ Performance</h3>
                <div class="metric">
                    <span class="metric-label">Status</span>
                    <span class="metric-value ${data.performance.status === 'available' ? 'status-good' : 'status-warning'}">${data.performance.status === 'available' ? 'Monitored' : 'No Data'}</span>
                </div>
                ${data.performance.status === 'available' && data.performance.benchmarks ? `
                <div class="metric">
                    <span class="metric-label">Efficiency</span>
                    <span class="metric-value ${data.performance.benchmarks.analysis?.overall?.efficiency > 70 ? 'status-good' : data.performance.benchmarks.analysis?.overall?.efficiency > 40 ? 'status-warning' : 'status-error'}">${data.performance.benchmarks.analysis?.overall?.efficiency?.toFixed(1) || 0}%</span>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- Coverage Section -->
        ${data.coverage.status === 'available' ? `
        <div class="grid grid-2">
            <div class="card">
                <h3>📊 Code Coverage</h3>
                <div class="metric">
                    <span class="metric-label">Lines</span>
                    <div>
                        <span class="metric-value ${data.coverage.summary.lines.pct >= 80 ? 'status-good' : data.coverage.summary.lines.pct >= 60 ? 'status-warning' : 'status-error'}">${data.coverage.summary.lines.pct.toFixed(1)}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill ${data.coverage.summary.lines.pct >= 80 ? 'progress-good' : data.coverage.summary.lines.pct >= 60 ? 'progress-warning' : 'progress-error'}" style="width: ${data.coverage.summary.lines.pct}%"></div>
                        </div>
                    </div>
                </div>
                <div class="metric">
                    <span class="metric-label">Functions</span>
                    <div>
                        <span class="metric-value ${data.coverage.summary.functions.pct >= 80 ? 'status-good' : data.coverage.summary.functions.pct >= 60 ? 'status-warning' : 'status-error'}">${data.coverage.summary.functions.pct.toFixed(1)}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill ${data.coverage.summary.functions.pct >= 80 ? 'progress-good' : data.coverage.summary.functions.pct >= 60 ? 'progress-warning' : 'progress-error'}" style="width: ${data.coverage.summary.functions.pct}%"></div>
                        </div>
                    </div>
                </div>
                <div class="metric">
                    <span class="metric-label">Branches</span>
                    <div>
                        <span class="metric-value ${data.coverage.summary.branches.pct >= 80 ? 'status-good' : data.coverage.summary.branches.pct >= 60 ? 'status-warning' : 'status-error'}">${data.coverage.summary.branches.pct.toFixed(1)}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill ${data.coverage.summary.branches.pct >= 80 ? 'progress-good' : data.coverage.summary.branches.pct >= 60 ? 'progress-warning' : 'progress-error'}" style="width: ${data.coverage.summary.branches.pct}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <h3>📈 Trends</h3>
                <div class="metric">
                    <span class="metric-label">Coverage Trend</span>
                    <span class="metric-value trend-${data.trends.coverage.trend || 'stable'}">${data.trends.coverage.trend || 'No data'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Performance Trend</span>
                    <span class="metric-value trend-${data.trends.performance.trend === 'improving' ? 'up' : data.trends.performance.trend === 'degrading' ? 'down' : 'stable'}">${data.trends.performance.trend || 'No data'}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Health Trend</span>
                    <span class="metric-value trend-${data.trends.health.trend === 'improving' ? 'up' : data.trends.health.trend === 'declining' ? 'down' : 'stable'}">${data.trends.health.trend || 'No data'}</span>
                </div>
            </div>
        </div>
        ` : ''}

        <!-- Test Suites Section -->
        <div class="card">
            <h3>🧪 Test Suites</h3>
            <div class="grid grid-3">
                ${data.overview.testSuites.map(suite => `
                <div class="metric">
                    <span class="metric-label">${suite.name}</span>
                    <span class="suite-status suite-${suite.status}">${suite.status}</span>
                </div>
                `).join('')}
            </div>
        </div>

        <!-- Recommendations Section -->
        ${data.recommendations.length > 0 ? `
        <div class="card recommendations ${data.recommendations.some(r => r.priority === 'high') ? '' : data.recommendations.some(r => r.priority === 'medium') ? 'warning' : 'info'}">
            <h3>💡 Recommendations</h3>
            ${data.recommendations.map(rec => `
            <div class="recommendation-item">
                <strong>${rec.priority.toUpperCase()}:</strong> ${rec.title}<br>
                <small>${rec.action}</small>
            </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="footer">
            <p>Generated by HalluciFix Test Dashboard • ${new Date().toISOString()}</p>
            <p>Last test run: ${data.overview.lastRun ? data.overview.lastRun.timeAgo : 'Unknown'}</p>
        </div>
    </div>
</body>
</html>`;

    const dashboardPath = path.join(this.dashboardDir, 'dashboard.html');
    fs.writeFileSync(dashboardPath, htmlContent);
  }

  async generateMarkdownSummary(data) {
    const summary = `# Test Dashboard Summary

**Generated:** ${new Date(data.timestamp).toLocaleString()}

## Overview

- **Total Test Files:** ${data.overview.testFiles.total}
- **Test Suites Configured:** ${data.overview.testSuites.filter(s => s.status === 'ready').length}/${data.overview.testSuites.length}
- **Last Test Run:** ${data.overview.lastRun ? data.overview.lastRun.timeAgo : 'Unknown'}

## Health Status

${data.health.status === 'available' ? `
- **Flaky Tests:** ${data.health.flakyTests.length}
- **Last Health Check:** ${data.health.lastHealthCheck ? new Date(data.health.lastHealthCheck).toLocaleString() : 'Never'}
` : '⚠️ No health monitoring data available'}

## Performance Status

${data.performance.status === 'available' && data.performance.benchmarks ? `
- **Test Efficiency:** ${data.performance.benchmarks.analysis?.overall?.efficiency?.toFixed(1) || 0}%
- **Last Performance Check:** ${data.performance.lastPerformanceCheck ? new Date(data.performance.lastPerformanceCheck).toLocaleString() : 'Never'}
` : '⚠️ No performance monitoring data available'}

## Coverage Status

${data.coverage.status === 'available' ? `
- **Line Coverage:** ${data.coverage.summary.lines.pct.toFixed(1)}%
- **Function Coverage:** ${data.coverage.summary.functions.pct.toFixed(1)}%
- **Branch Coverage:** ${data.coverage.summary.branches.pct.toFixed(1)}%
- **Files Covered:** ${data.coverage.fileCount}
` : '⚠️ No coverage data available'}

## Recommendations

${data.recommendations.length === 0 ? 
  '✅ No immediate actions required' : 
  data.recommendations.map(rec => `- **${rec.priority.toUpperCase()}:** ${rec.title} - ${rec.action}`).join('\n')
}

## Quick Actions

\`\`\`bash
# Run comprehensive test suite
npm run test:all

# Generate test reports
npm run test:report

# Monitor test health
npm run test:health

# Check performance
npm run test:performance:monitor

# Run maintenance
npm run test:maintenance
\`\`\`

---
*For detailed information, open the HTML dashboard*`;

    const summaryPath = path.join(this.dashboardDir, 'summary.md');
    fs.writeFileSync(summaryPath, summary);
  }

  async saveDashboardData(data) {
    const dataPath = path.join(this.dashboardDir, 'dashboard-data.json');
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  }
}

// CLI interface
if (require.main === module) {
  const dashboard = new TestDashboard();
  
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg === '--quick') options.quick = true;
  });

  dashboard.generateDashboard(options).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TestDashboard;