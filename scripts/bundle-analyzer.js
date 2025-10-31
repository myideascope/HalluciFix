#!/usr/bin/env node

/**
 * Bundle Size Analysis Script
 * Analyzes build output and tracks bundle size changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BundleAnalyzer {
  constructor() {
    this.distPath = path.join(__dirname, '..', 'dist');
    this.reportPath = path.join(__dirname, '..', 'test-results', 'bundle-analysis.json');
    this.baselinePath = path.join(__dirname, '..', 'test-results', 'bundle-baseline.json');
    
    // Bundle size limits (bytes)
    this.limits = {
      js: 1024 * 1024,      // 1MB for JS
      css: 200 * 1024,      // 200KB for CSS
      total: 2 * 1024 * 1024, // 2MB total
      assets: 5 * 1024 * 1024, // 5MB for all assets
    };
  }

  /**
   * Analyze bundle files in dist directory
   */
  analyzeBundles() {
    if (!fs.existsSync(this.distPath)) {
      throw new Error('Build output not found. Run "npm run build" first.');
    }

    const analysis = {
      timestamp: new Date().toISOString(),
      files: [],
      summary: {
        totalSize: 0,
        jsSize: 0,
        cssSize: 0,
        assetSize: 0,
        fileCount: 0
      },
      violations: [],
      recommendations: []
    };

    this.analyzeDirectory(this.distPath, analysis, '');
    this.calculateSummary(analysis);
    this.checkLimits(analysis);
    this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * Recursively analyze directory
   */
  analyzeDirectory(dirPath, analysis, relativePath) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const itemRelativePath = path.join(relativePath, item);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        this.analyzeDirectory(fullPath, analysis, itemRelativePath);
      } else {
        const fileInfo = this.analyzeFile(fullPath, itemRelativePath, stats);
        analysis.files.push(fileInfo);
      }
    }
  }

  /**
   * Analyze individual file
   */
  analyzeFile(filePath, relativePath, stats) {
    const ext = path.extname(filePath).toLowerCase();
    const size = stats.size;
    
    let type = 'other';
    if (['.js', '.mjs', '.ts'].includes(ext)) type = 'js';
    else if (['.css', '.scss', '.sass'].includes(ext)) type = 'css';
    else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) type = 'image';
    else if (['.woff', '.woff2', '.ttf', '.eot'].includes(ext)) type = 'font';
    else if (['.html'].includes(ext)) type = 'html';

    // Analyze content for additional insights
    let gzipSize = null;
    let isMinified = false;
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      isMinified = this.isMinified(content, type);
      
      // Estimate gzip size (simplified)
      if (type === 'js' || type === 'css' || type === 'html') {
        gzipSize = Math.floor(size * 0.3); // Rough gzip estimation
      }
    } catch (error) {
      // Binary file or read error
    }

    return {
      path: relativePath,
      size,
      gzipSize,
      type,
      isMinified,
      sizeFormatted: this.formatSize(size),
      gzipSizeFormatted: gzipSize ? this.formatSize(gzipSize) : null
    };
  }

  /**
   * Check if file appears to be minified
   */
  isMinified(content, type) {
    if (type === 'js') {
      // Check for typical minification patterns
      const lines = content.split('\n');
      const avgLineLength = content.length / lines.length;
      return avgLineLength > 100 && lines.length < 50;
    } else if (type === 'css') {
      // CSS minification check
      return !content.includes('\n  ') && content.length > 1000;
    }
    return false;
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(analysis) {
    analysis.summary.fileCount = analysis.files.length;
    
    for (const file of analysis.files) {
      analysis.summary.totalSize += file.size;
      
      switch (file.type) {
        case 'js':
          analysis.summary.jsSize += file.size;
          break;
        case 'css':
          analysis.summary.cssSize += file.size;
          break;
        default:
          analysis.summary.assetSize += file.size;
      }
    }
  }

  /**
   * Check against size limits
   */
  checkLimits(analysis) {
    const { summary, limits } = analysis;
    
    if (summary.jsSize > limits.js) {
      analysis.violations.push({
        type: 'js_size',
        limit: limits.js,
        actual: summary.jsSize,
        severity: summary.jsSize > limits.js * 1.5 ? 'error' : 'warning',
        message: `JavaScript bundle size (${this.formatSize(summary.jsSize)}) exceeds limit (${this.formatSize(limits.js)})`
      });
    }
    
    if (summary.cssSize > limits.css) {
      analysis.violations.push({
        type: 'css_size',
        limit: limits.css,
        actual: summary.cssSize,
        severity: summary.cssSize > limits.css * 1.5 ? 'error' : 'warning',
        message: `CSS bundle size (${this.formatSize(summary.cssSize)}) exceeds limit (${this.formatSize(limits.css)})`
      });
    }
    
    if (summary.totalSize > limits.total) {
      analysis.violations.push({
        type: 'total_size',
        limit: limits.total,
        actual: summary.totalSize,
        severity: summary.totalSize > limits.total * 1.5 ? 'error' : 'warning',
        message: `Total bundle size (${this.formatSize(summary.totalSize)}) exceeds limit (${this.formatSize(limits.total)})`
      });
    }
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(analysis) {
    const { files, summary } = analysis;
    
    // Find large files
    const largeFiles = files
      .filter(f => f.size > 100 * 1024) // Files larger than 100KB
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);
    
    if (largeFiles.length > 0) {
      analysis.recommendations.push({
        type: 'large_files',
        message: 'Consider optimizing large files',
        files: largeFiles.map(f => ({ path: f.path, size: f.sizeFormatted }))
      });
    }
    
    // Check for unminified files
    const unminifiedFiles = files.filter(f => 
      (f.type === 'js' || f.type === 'css') && 
      !f.isMinified && 
      f.size > 10 * 1024
    );
    
    if (unminifiedFiles.length > 0) {
      analysis.recommendations.push({
        type: 'minification',
        message: 'Enable minification for production builds',
        files: unminifiedFiles.map(f => f.path)
      });
    }
    
    // Check JS/CSS ratio
    const jsRatio = summary.jsSize / summary.totalSize;
    if (jsRatio > 0.7) {
      analysis.recommendations.push({
        type: 'js_optimization',
        message: 'JavaScript takes up a large portion of the bundle. Consider code splitting or tree shaking.',
        ratio: `${(jsRatio * 100).toFixed(1)}%`
      });
    }
    
    // Check for duplicate dependencies (simplified)
    const jsFiles = files.filter(f => f.type === 'js');
    if (jsFiles.length > 5) {
      analysis.recommendations.push({
        type: 'code_splitting',
        message: 'Multiple JavaScript files detected. Consider implementing code splitting.',
        fileCount: jsFiles.length
      });
    }
  }

  /**
   * Compare with baseline
   */
  compareWithBaseline(analysis) {
    if (!fs.existsSync(this.baselinePath)) {
      console.log('No baseline found. Current analysis will be used as baseline.');
      this.saveBaseline(analysis);
      return null;
    }

    const baseline = JSON.parse(fs.readFileSync(this.baselinePath, 'utf8'));
    
    const comparison = {
      timestamp: analysis.timestamp,
      baseline: {
        timestamp: baseline.timestamp,
        totalSize: baseline.summary.totalSize,
        jsSize: baseline.summary.jsSize,
        cssSize: baseline.summary.cssSize
      },
      current: {
        totalSize: analysis.summary.totalSize,
        jsSize: analysis.summary.jsSize,
        cssSize: analysis.summary.cssSize
      },
      changes: {
        totalSize: analysis.summary.totalSize - baseline.summary.totalSize,
        jsSize: analysis.summary.jsSize - baseline.summary.jsSize,
        cssSize: analysis.summary.cssSize - baseline.summary.cssSize
      },
      regressions: []
    };

    // Check for regressions
    const sizeIncrease = comparison.changes.totalSize / baseline.summary.totalSize;
    if (sizeIncrease > 0.1) { // 10% increase
      comparison.regressions.push({
        type: 'size_regression',
        severity: sizeIncrease > 0.25 ? 'error' : 'warning',
        message: `Bundle size increased by ${(sizeIncrease * 100).toFixed(1)}%`,
        change: this.formatSize(comparison.changes.totalSize)
      });
    }

    return comparison;
  }

  /**
   * Save current analysis as baseline
   */
  saveBaseline(analysis) {
    const baselineDir = path.dirname(this.baselinePath);
    if (!fs.existsSync(baselineDir)) {
      fs.mkdirSync(baselineDir, { recursive: true });
    }
    
    fs.writeFileSync(this.baselinePath, JSON.stringify(analysis, null, 2));
  }

  /**
   * Save analysis report
   */
  saveReport(analysis, comparison = null) {
    const reportDir = path.dirname(this.reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const report = {
      analysis,
      comparison,
      metadata: {
        generatedAt: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2));
  }

  /**
   * Format file size for display
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate console report
   */
  printReport(analysis, comparison = null) {
    console.log('\n📊 Bundle Analysis Report');
    console.log('========================\n');
    
    console.log('📦 Bundle Summary:');
    console.log(`  Total Size: ${this.formatSize(analysis.summary.totalSize)}`);
    console.log(`  JavaScript: ${this.formatSize(analysis.summary.jsSize)}`);
    console.log(`  CSS: ${this.formatSize(analysis.summary.cssSize)}`);
    console.log(`  Assets: ${this.formatSize(analysis.summary.assetSize)}`);
    console.log(`  Files: ${analysis.summary.fileCount}`);
    
    if (comparison) {
      console.log('\n📈 Changes from Baseline:');
      const totalChange = comparison.changes.totalSize;
      const changeSymbol = totalChange > 0 ? '📈' : totalChange < 0 ? '📉' : '➡️';
      console.log(`  ${changeSymbol} Total: ${totalChange > 0 ? '+' : ''}${this.formatSize(totalChange)}`);
      console.log(`  JavaScript: ${comparison.changes.jsSize > 0 ? '+' : ''}${this.formatSize(comparison.changes.jsSize)}`);
      console.log(`  CSS: ${comparison.changes.cssSize > 0 ? '+' : ''}${this.formatSize(comparison.changes.cssSize)}`);
    }
    
    if (analysis.violations.length > 0) {
      console.log('\n⚠️  Size Limit Violations:');
      analysis.violations.forEach(violation => {
        const icon = violation.severity === 'error' ? '❌' : '⚠️';
        console.log(`  ${icon} ${violation.message}`);
      });
    }
    
    if (analysis.recommendations.length > 0) {
      console.log('\n💡 Optimization Recommendations:');
      analysis.recommendations.forEach(rec => {
        console.log(`  • ${rec.message}`);
      });
    }
    
    if (comparison?.regressions.length > 0) {
      console.log('\n🚨 Performance Regressions:');
      comparison.regressions.forEach(regression => {
        const icon = regression.severity === 'error' ? '🚨' : '⚠️';
        console.log(`  ${icon} ${regression.message}`);
      });
    }
    
    console.log(`\n📄 Full report saved to: ${this.reportPath}`);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';
  
  const analyzer = new BundleAnalyzer();
  
  try {
    switch (command) {
      case 'analyze':
        console.log('🔍 Analyzing bundle...');
        const analysis = analyzer.analyzeBundles();
        const comparison = analyzer.compareWithBaseline(analysis);
        analyzer.saveReport(analysis, comparison);
        analyzer.printReport(analysis, comparison);
        
        // Exit with error code if there are critical violations
        const criticalViolations = analysis.violations.filter(v => v.severity === 'error');
        const criticalRegressions = comparison?.regressions.filter(r => r.severity === 'error') || [];
        
        if (criticalViolations.length > 0 || criticalRegressions.length > 0) {
          console.log('\n❌ Bundle analysis failed due to critical issues.');
          process.exit(1);
        }
        break;
        
      case 'baseline':
        console.log('📊 Setting new baseline...');
        const baselineAnalysis = analyzer.analyzeBundles();
        analyzer.saveBaseline(baselineAnalysis);
        console.log('✅ Baseline updated successfully.');
        break;
        
      case 'limits':
        console.log('📏 Current size limits:');
        console.log(`  JavaScript: ${analyzer.formatSize(analyzer.limits.js)}`);
        console.log(`  CSS: ${analyzer.formatSize(analyzer.limits.css)}`);
        console.log(`  Total: ${analyzer.formatSize(analyzer.limits.total)}`);
        console.log(`  Assets: ${analyzer.formatSize(analyzer.limits.assets)}`);
        break;
        
      default:
        console.log('Usage: node bundle-analyzer.js [analyze|baseline|limits]');
        console.log('  analyze  - Analyze current bundle (default)');
        console.log('  baseline - Set current bundle as baseline');
        console.log('  limits   - Show current size limits');
    }
  } catch (error) {
    console.error('❌ Bundle analysis failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { BundleAnalyzer };