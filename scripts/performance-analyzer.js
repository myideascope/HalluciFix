#!/usr/bin/env node

/**
 * Performance Analyzer
 * Analyzes performance reports and detects regressions
 */

const fs = require('fs');
const path = require('path');

class PerformanceAnalyzer {
  constructor(performancePath) {
    this.performancePath = performancePath;
    this.baselines = {
      bundleSize: 2 * 1024 * 1024, // 2MB
      testExecutionTime: 15 * 60 * 1000, // 15 minutes
      firstContentfulPaint: 1500, // 1.5s
      largestContentfulPaint: 2500, // 2.5s
      cumulativeLayoutShift: 0.1,
      firstInputDelay: 100 // 100ms
    };
    this.regressionThresholds = {
      bundleSize: 10, // 10% increase
      testExecutionTime: 20, // 20% increase
      webVitals: 15 // 15% degradation
    };
  }

  async analyze() {
    if (!fs.existsSync(this.performancePath)) {
      console.error(`Performance path not found: ${this.performancePath}`);
      return null;
    }

    const currentMetrics = await this.loadCurrentMetrics();
    const previousMetrics = await this.loadPreviousMetrics();
    
    if (!currentMetrics) {
      console.error('No current performance data found');
      return null;
    }

    const regression = this.detectRegression(currentMetrics, previousMetrics);
    
    if (regression) {
      return this.generateRegressionData(currentMetrics, previousMetrics, regression);
    }

    return null;
  }

  async loadCurrentMetrics() {
    const metrics = {};
    
    // Load bundle analysis
    const bundlePath = path.join(this.performancePath, 'bundle-analysis.json');
    if (fs.existsSync(bundlePath)) {
      metrics.bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    }
    
    // Load test execution metrics
    const testMetricsPath = path.join(this.performancePath, 'test-metrics.json');
    if (fs.existsSync(testMetricsPath)) {
      metrics.testExecution = JSON.parse(fs.readFileSync(testMetricsPath, 'utf8'));
    }
    
    // Load web vitals
    const webVitalsPath = path.join(this.performancePath, 'web-vitals.json');
    if (fs.existsSync(webVitalsPath)) {
      metrics.webVitals = JSON.parse(fs.readFileSync(webVitalsPath, 'utf8'));
    }
    
    // Load Lighthouse results
    const lighthousePath = path.join(this.performancePath, 'lighthouse-results.json');
    if (fs.existsSync(lighthousePath)) {
      metrics.lighthouse = JSON.parse(fs.readFileSync(lighthousePath, 'utf8'));
    }

    return Object.keys(metrics).length > 0 ? metrics : null;
  }

  async loadPreviousMetrics() {
    const baselinePath = path.join(this.performancePath, '..', 'baseline-performance.json');
    
    if (fs.existsSync(baselinePath)) {
      return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    }
    
    return null;
  }

  detectRegression(current, previous) {
    const regressions = [];
    
    // Check bundle size regression
    if (current.bundle && previous?.bundle) {
      const bundleRegression = this.checkBundleRegression(current.bundle, previous.bundle);
      if (bundleRegression) regressions.push(bundleRegression);
    }
    
    // Check test execution time regression
    if (current.testExecution && previous?.testExecution) {
      const testRegression = this.checkTestExecutionRegression(current.testExecution, previous.testExecution);
      if (testRegression) regressions.push(testRegression);
    }
    
    // Check web vitals regression
    if (current.webVitals && previous?.webVitals) {
      const webVitalsRegression = this.checkWebVitalsRegression(current.webVitals, previous.webVitals);
      if (webVitalsRegression) regressions.push(webVitalsRegression);
    }
    
    // Check against absolute baselines if no previous data
    if (!previous) {
      const baselineRegressions = this.checkBaselineViolations(current);
      regressions.push(...baselineRegressions);
    }
    
    return regressions.length > 0 ? regressions : null;
  }

  checkBundleRegression(current, previous) {
    const currentSize = current.totalSize || current.size;
    const previousSize = previous.totalSize || previous.size;
    
    if (!currentSize || !previousSize) return null;
    
    const increase = ((currentSize - previousSize) / previousSize) * 100;
    
    if (increase > this.regressionThresholds.bundleSize || currentSize > this.baselines.bundleSize) {
      return {
        type: 'bundle-size',
        metricName: 'Bundle Size',
        currentValue: this.formatBytes(currentSize),
        baselineValue: this.formatBytes(previousSize || this.baselines.bundleSize),
        regressionPercentage: increase.toFixed(2),
        thresholdValue: this.formatBytes(this.baselines.bundleSize),
        severity: increase > 25 ? 'critical' : increase > 15 ? 'high' : 'medium'
      };
    }
    
    return null;
  }

  checkTestExecutionRegression(current, previous) {
    const currentTime = current.totalTime || current.duration;
    const previousTime = previous.totalTime || previous.duration;
    
    if (!currentTime || !previousTime) return null;
    
    const increase = ((currentTime - previousTime) / previousTime) * 100;
    
    if (increase > this.regressionThresholds.testExecutionTime || currentTime > this.baselines.testExecutionTime) {
      return {
        type: 'test-execution',
        metricName: 'Test Execution Time',
        currentValue: this.formatDuration(currentTime),
        baselineValue: this.formatDuration(previousTime || this.baselines.testExecutionTime),
        regressionPercentage: increase.toFixed(2),
        thresholdValue: this.formatDuration(this.baselines.testExecutionTime),
        severity: increase > 50 ? 'critical' : increase > 30 ? 'high' : 'medium'
      };
    }
    
    return null;
  }

  checkWebVitalsRegression(current, previous) {
    const regressions = [];
    
    const vitals = ['fcp', 'lcp', 'cls', 'fid'];
    const vitalNames = {
      fcp: 'First Contentful Paint',
      lcp: 'Largest Contentful Paint',
      cls: 'Cumulative Layout Shift',
      fid: 'First Input Delay'
    };
    
    for (const vital of vitals) {
      const currentValue = current[vital];
      const previousValue = previous[vital];
      
      if (currentValue && previousValue) {
        const increase = ((currentValue - previousValue) / previousValue) * 100;
        
        if (increase > this.regressionThresholds.webVitals) {
          regressions.push({
            type: 'web-vitals',
            metricName: vitalNames[vital],
            currentValue: this.formatWebVital(vital, currentValue),
            baselineValue: this.formatWebVital(vital, previousValue),
            regressionPercentage: increase.toFixed(2),
            thresholdValue: this.formatWebVital(vital, this.baselines[this.getBaselineKey(vital)]),
            severity: increase > 30 ? 'critical' : increase > 20 ? 'high' : 'medium'
          });
        }
      }
    }
    
    return regressions.length > 0 ? regressions[0] : null; // Return first regression for simplicity
  }

  checkBaselineViolations(current) {
    const violations = [];
    
    if (current.bundle?.totalSize > this.baselines.bundleSize) {
      violations.push({
        type: 'baseline-violation',
        metricName: 'Bundle Size',
        currentValue: this.formatBytes(current.bundle.totalSize),
        baselineValue: this.formatBytes(this.baselines.bundleSize),
        regressionPercentage: (((current.bundle.totalSize - this.baselines.bundleSize) / this.baselines.bundleSize) * 100).toFixed(2),
        thresholdValue: this.formatBytes(this.baselines.bundleSize),
        severity: 'high'
      });
    }
    
    if (current.testExecution?.totalTime > this.baselines.testExecutionTime) {
      violations.push({
        type: 'baseline-violation',
        metricName: 'Test Execution Time',
        currentValue: this.formatDuration(current.testExecution.totalTime),
        baselineValue: this.formatDuration(this.baselines.testExecutionTime),
        regressionPercentage: (((current.testExecution.totalTime - this.baselines.testExecutionTime) / this.baselines.testExecutionTime) * 100).toFixed(2),
        thresholdValue: this.formatDuration(this.baselines.testExecutionTime),
        severity: 'medium'
      });
    }
    
    return violations;
  }

  generateRegressionData(current, previous, regressions) {
    const primaryRegression = regressions[0];
    
    return {
      metricName: primaryRegression.metricName,
      currentValue: primaryRegression.currentValue,
      baselineValue: primaryRegression.baselineValue,
      regressionPercentage: primaryRegression.regressionPercentage,
      thresholdValue: primaryRegression.thresholdValue,
      
      metrics: this.formatMetricsTable(current, previous),
      affectedComponents: this.identifyAffectedComponents(primaryRegression.type),
      bundleSizeChange: this.getBundleSizeChange(current, previous),
      testExecutionChange: this.getTestExecutionChange(current, previous),
      memoryUsageChange: this.getMemoryUsageChange(current, previous),
      cpuUsageChange: this.getCpuUsageChange(current, previous),
      
      fcpChange: this.getWebVitalChange(current, previous, 'fcp'),
      lcpChange: this.getWebVitalChange(current, previous, 'lcp'),
      clsChange: this.getWebVitalChange(current, previous, 'cls'),
      fidChange: this.getWebVitalChange(current, previous, 'fid'),
      
      trendChart: this.generateTrendChart(current, previous),
      affectedFiles: this.getAffectedFiles(primaryRegression.type),
      
      severity: primaryRegression.severity
    };
  }

  formatMetricsTable(current, previous) {
    const metrics = [];
    
    if (current.bundle) {
      metrics.push({
        metric: 'Bundle Size',
        baseline: previous?.bundle ? this.formatBytes(previous.bundle.totalSize) : 'N/A',
        current: this.formatBytes(current.bundle.totalSize),
        change: previous?.bundle ? this.calculateChange(current.bundle.totalSize, previous.bundle.totalSize) : 'N/A',
        status: current.bundle.totalSize > this.baselines.bundleSize ? '❌' : '✅'
      });
    }
    
    if (current.testExecution) {
      metrics.push({
        metric: 'Test Execution',
        baseline: previous?.testExecution ? this.formatDuration(previous.testExecution.totalTime) : 'N/A',
        current: this.formatDuration(current.testExecution.totalTime),
        change: previous?.testExecution ? this.calculateChange(current.testExecution.totalTime, previous.testExecution.totalTime) : 'N/A',
        status: current.testExecution.totalTime > this.baselines.testExecutionTime ? '❌' : '✅'
      });
    }
    
    return metrics;
  }

  identifyAffectedComponents(regressionType) {
    const componentMap = {
      'bundle-size': ['Frontend Components', 'Asset Loading', 'Dependencies'],
      'test-execution': ['Test Infrastructure', 'CI/CD Pipeline', 'Test Suites'],
      'web-vitals': ['Frontend Performance', 'User Experience', 'Core Web Vitals'],
      'baseline-violation': ['Overall Performance', 'System Resources']
    };
    
    return componentMap[regressionType] || ['Unknown Components'];
  }

  getBundleSizeChange(current, previous) {
    if (current.bundle && previous?.bundle) {
      return this.calculateChange(current.bundle.totalSize, previous.bundle.totalSize);
    }
    return 'N/A';
  }

  getTestExecutionChange(current, previous) {
    if (current.testExecution && previous?.testExecution) {
      return this.calculateChange(current.testExecution.totalTime, previous.testExecution.totalTime);
    }
    return 'N/A';
  }

  getMemoryUsageChange(current, previous) {
    if (current.memory && previous?.memory) {
      return this.calculateChange(current.memory.peak, previous.memory.peak);
    }
    return 'N/A';
  }

  getCpuUsageChange(current, previous) {
    if (current.cpu && previous?.cpu) {
      return this.calculateChange(current.cpu.average, previous.cpu.average);
    }
    return 'N/A';
  }

  getWebVitalChange(current, previous, vital) {
    if (current.webVitals?.[vital] && previous?.webVitals?.[vital]) {
      return this.calculateChange(current.webVitals[vital], previous.webVitals[vital]);
    }
    return 'N/A';
  }

  generateTrendChart(current, previous) {
    if (!previous) {
      return 'No historical data available for trend analysis';
    }
    
    // Simple trend description - in production, this would generate actual chart data
    const trends = [];
    
    if (current.bundle && previous.bundle) {
      const change = this.calculateChangeValue(current.bundle.totalSize, previous.bundle.totalSize);
      trends.push(`Bundle Size: ${change > 0 ? '↗️' : '↘️'} ${Math.abs(change).toFixed(1)}%`);
    }
    
    if (current.testExecution && previous.testExecution) {
      const change = this.calculateChangeValue(current.testExecution.totalTime, previous.testExecution.totalTime);
      trends.push(`Test Time: ${change > 0 ? '↗️' : '↘️'} ${Math.abs(change).toFixed(1)}%`);
    }
    
    return trends.join(', ') || 'No trend data available';
  }

  getAffectedFiles(regressionType) {
    const fileMap = {
      'bundle-size': ['package.json', 'vite.config.ts', 'src/main.tsx'],
      'test-execution': ['vitest.config.ts', 'playwright.config.ts', 'src/test/'],
      'web-vitals': ['src/components/', 'src/styles/', 'public/'],
      'baseline-violation': ['package.json', 'src/']
    };
    
    return fileMap[regressionType] || [];
  }

  // Utility methods
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  formatWebVital(vital, value) {
    if (vital === 'cls') {
      return value.toFixed(3);
    }
    return `${value}ms`;
  }

  getBaselineKey(vital) {
    const keyMap = {
      fcp: 'firstContentfulPaint',
      lcp: 'largestContentfulPaint',
      cls: 'cumulativeLayoutShift',
      fid: 'firstInputDelay'
    };
    return keyMap[vital];
  }

  calculateChange(current, previous) {
    const change = ((current - previous) / previous) * 100;
    return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  }

  calculateChangeValue(current, previous) {
    return ((current - previous) / previous) * 100;
  }
}

// CLI interface
if (require.main === module) {
  const performancePath = process.argv[2] || 'performance-report';
  
  (async () => {
    try {
      const analyzer = new PerformanceAnalyzer(performancePath);
      const regression = await analyzer.analyze();
      
      if (regression) {
        console.log(JSON.stringify(regression, null, 2));
      } else {
        console.log('{}'); // Empty object for no regression
      }
    } catch (error) {
      console.error('Performance analysis failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = PerformanceAnalyzer;