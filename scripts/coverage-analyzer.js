#!/usr/bin/env node

/**
 * Coverage Analyzer
 * Analyzes coverage reports and detects regressions
 */

const fs = require('fs');
const path = require('path');

class CoverageAnalyzer {
  constructor(coveragePath) {
    this.coveragePath = coveragePath;
    this.thresholds = {
      global: { lines: 80, functions: 80, branches: 75, statements: 80 },
      critical: { lines: 90, functions: 90, branches: 85, statements: 90 }
    };
    this.criticalModules = [
      'src/lib/analysisService.ts',
      'src/lib/supabase.ts',
      'src/lib/api.ts',
      'src/hooks/useAuth.ts',
      'src/lib/auth/',
      'src/lib/oauth/',
      'src/lib/security/'
    ];
  }

  async analyze() {
    if (!fs.existsSync(this.coveragePath)) {
      console.error(`Coverage path not found: ${this.coveragePath}`);
      return null;
    }

    const currentCoverage = await this.loadCurrentCoverage();
    const previousCoverage = await this.loadPreviousCoverage();
    
    if (!currentCoverage) {
      console.error('No current coverage data found');
      return null;
    }

    const regression = this.detectRegression(currentCoverage, previousCoverage);
    
    if (regression) {
      return this.generateRegressionData(currentCoverage, previousCoverage, regression);
    }

    return null;
  }

  async loadCurrentCoverage() {
    const summaryPath = path.join(this.coveragePath, 'coverage-summary.json');
    const lcovPath = path.join(this.coveragePath, 'lcov.info');
    
    if (fs.existsSync(summaryPath)) {
      return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    }
    
    if (fs.existsSync(lcovPath)) {
      return this.parseLcovFile(lcovPath);
    }
    
    return null;
  }

  async loadPreviousCoverage() {
    // Try to load from previous run artifact or baseline
    const baselinePath = path.join(this.coveragePath, '..', 'baseline-coverage.json');
    
    if (fs.existsSync(baselinePath)) {
      return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    }
    
    return null;
  }

  detectRegression(current, previous) {
    if (!previous) {
      // Check against absolute thresholds if no previous data
      return this.checkAbsoluteThresholds(current);
    }

    const regression = {
      global: false,
      critical: false,
      modules: []
    };

    // Check global coverage regression
    const currentGlobal = current.total;
    const previousGlobal = previous.total;

    if (this.isRegressionDetected(currentGlobal, previousGlobal, this.thresholds.global)) {
      regression.global = true;
    }

    // Check critical modules
    for (const modulePath of this.criticalModules) {
      const currentModule = this.findModuleCoverage(current, modulePath);
      const previousModule = this.findModuleCoverage(previous, modulePath);
      
      if (currentModule && previousModule) {
        if (this.isRegressionDetected(currentModule, previousModule, this.thresholds.critical)) {
          regression.critical = true;
          regression.modules.push({
            path: modulePath,
            current: currentModule,
            previous: previousModule
          });
        }
      }
    }

    return regression.global || regression.critical ? regression : null;
  }

  checkAbsoluteThresholds(current) {
    const global = current.total;
    
    if (global.lines.pct < this.thresholds.global.lines ||
        global.functions.pct < this.thresholds.global.functions ||
        global.branches.pct < this.thresholds.global.branches ||
        global.statements.pct < this.thresholds.global.statements) {
      
      return {
        global: true,
        critical: false,
        modules: [],
        thresholdViolation: true
      };
    }

    return null;
  }

  isRegressionDetected(current, previous, thresholds) {
    const linesDrop = previous.lines.pct - current.lines.pct;
    const functionsDrop = previous.functions.pct - current.functions.pct;
    const branchesDrop = previous.branches.pct - current.branches.pct;
    const statementsDrop = previous.statements.pct - current.statements.pct;

    // Consider it a regression if coverage drops by more than 2% or below threshold
    return linesDrop > 2 || current.lines.pct < thresholds.lines ||
           functionsDrop > 2 || current.functions.pct < thresholds.functions ||
           branchesDrop > 2 || current.branches.pct < thresholds.branches ||
           statementsDrop > 2 || current.statements.pct < thresholds.statements;
  }

  findModuleCoverage(coverage, modulePath) {
    // Look for module in coverage data
    for (const [filePath, fileCoverage] of Object.entries(coverage)) {
      if (filePath !== 'total' && filePath.includes(modulePath)) {
        return fileCoverage;
      }
    }
    return null;
  }

  generateRegressionData(current, previous, regression) {
    const currentGlobal = current.total;
    const previousGlobal = previous?.total;

    return {
      globalCoverage: currentGlobal.lines.pct,
      previousCoverage: previousGlobal?.lines.pct || 'N/A',
      coverageDrop: previousGlobal ? (previousGlobal.lines.pct - currentGlobal.lines.pct).toFixed(2) : 'N/A',
      threshold: this.thresholds.global.lines,
      status: regression.global ? 'FAILED' : 'WARNING',
      
      lines: {
        current: currentGlobal.lines.pct,
        previous: previousGlobal?.lines.pct || 'N/A',
        change: previousGlobal ? (currentGlobal.lines.pct - previousGlobal.lines.pct).toFixed(2) : 'N/A',
        threshold: this.thresholds.global.lines,
        status: currentGlobal.lines.pct >= this.thresholds.global.lines ? 'PASS' : 'FAIL'
      },
      
      functions: {
        current: currentGlobal.functions.pct,
        previous: previousGlobal?.functions.pct || 'N/A',
        change: previousGlobal ? (currentGlobal.functions.pct - previousGlobal.functions.pct).toFixed(2) : 'N/A',
        threshold: this.thresholds.global.functions,
        status: currentGlobal.functions.pct >= this.thresholds.global.functions ? 'PASS' : 'FAIL'
      },
      
      branches: {
        current: currentGlobal.branches.pct,
        previous: previousGlobal?.branches.pct || 'N/A',
        change: previousGlobal ? (currentGlobal.branches.pct - previousGlobal.branches.pct).toFixed(2) : 'N/A',
        threshold: this.thresholds.global.branches,
        status: currentGlobal.branches.pct >= this.thresholds.global.branches ? 'PASS' : 'FAIL'
      },
      
      statements: {
        current: currentGlobal.statements.pct,
        previous: previousGlobal?.statements.pct || 'N/A',
        change: previousGlobal ? (currentGlobal.statements.pct - previousGlobal.statements.pct).toFixed(2) : 'N/A',
        threshold: this.thresholds.global.statements,
        status: currentGlobal.statements.pct >= this.thresholds.global.statements ? 'PASS' : 'FAIL'
      },

      affectedModules: this.getAffectedModules(current, previous),
      uncoveredSections: this.getUncoveredSections(current),
      missingCoverage: this.getMissingCoverage(current),
      criticalModules: this.getCriticalModulesCoverage(current),
      affectedFiles: this.getAffectedFiles(current, previous),
      trendAnalysis: this.generateTrendAnalysis(current, previous)
    };
  }

  getAffectedModules(current, previous) {
    const modules = [];
    
    for (const [filePath, fileCoverage] of Object.entries(current)) {
      if (filePath === 'total') continue;
      
      const previousFile = previous?.[filePath];
      if (previousFile) {
        const linesDrop = previousFile.lines.pct - fileCoverage.lines.pct;
        if (linesDrop > 1) { // More than 1% drop
          modules.push({
            name: filePath,
            coverage: fileCoverage.lines.pct,
            change: -linesDrop.toFixed(2),
            status: fileCoverage.lines.pct >= this.thresholds.global.lines ? 'WARNING' : 'CRITICAL'
          });
        }
      }
    }
    
    return modules;
  }

  getUncoveredSections(current) {
    const sections = [];
    
    for (const [filePath, fileCoverage] of Object.entries(current)) {
      if (filePath === 'total') continue;
      
      if (fileCoverage.lines.pct < this.thresholds.global.lines) {
        sections.push({
          file: filePath,
          lines: this.getUncoveredLines(fileCoverage),
          functions: this.getUncoveredFunctions(fileCoverage)
        });
      }
    }
    
    return sections;
  }

  getUncoveredLines(fileCoverage) {
    // Extract uncovered line numbers from coverage data
    if (fileCoverage.l) {
      return Object.entries(fileCoverage.l)
        .filter(([line, hits]) => hits === 0)
        .map(([line]) => parseInt(line));
    }
    return [];
  }

  getUncoveredFunctions(fileCoverage) {
    // Extract uncovered function names from coverage data
    if (fileCoverage.f) {
      return Object.entries(fileCoverage.f)
        .filter(([func, hits]) => hits === 0)
        .map(([func]) => func);
    }
    return [];
  }

  getMissingCoverage(current) {
    const missing = [];
    
    for (const [filePath, fileCoverage] of Object.entries(current)) {
      if (filePath === 'total') continue;
      
      if (fileCoverage.functions.pct < fileCoverage.lines.pct) {
        missing.push({
          type: 'Function Coverage',
          description: `${filePath} has lower function coverage (${fileCoverage.functions.pct}%) than line coverage (${fileCoverage.lines.pct}%)`
        });
      }
      
      if (fileCoverage.branches.pct < this.thresholds.global.branches) {
        missing.push({
          type: 'Branch Coverage',
          description: `${filePath} has insufficient branch coverage (${fileCoverage.branches.pct}%)`
        });
      }
    }
    
    return missing;
  }

  getCriticalModulesCoverage(current) {
    const modules = [];
    
    for (const modulePath of this.criticalModules) {
      const moduleCoverage = this.findModuleCoverage(current, modulePath);
      if (moduleCoverage) {
        modules.push({
          name: modulePath,
          coverage: moduleCoverage.lines.pct,
          threshold: this.thresholds.critical.lines,
          status: moduleCoverage.lines.pct >= this.thresholds.critical.lines ? 'PASS' : 'FAIL'
        });
      }
    }
    
    return modules;
  }

  getAffectedFiles(current, previous) {
    const files = [];
    
    for (const [filePath, fileCoverage] of Object.entries(current)) {
      if (filePath === 'total') continue;
      
      const previousFile = previous?.[filePath];
      if (!previousFile || previousFile.lines.pct - fileCoverage.lines.pct > 1) {
        files.push(filePath);
      }
    }
    
    return files;
  }

  generateTrendAnalysis(current, previous) {
    if (!previous) {
      return 'No historical data available for trend analysis';
    }
    
    const currentGlobal = current.total;
    const previousGlobal = previous.total;
    
    const trend = {
      lines: currentGlobal.lines.pct - previousGlobal.lines.pct,
      functions: currentGlobal.functions.pct - previousGlobal.functions.pct,
      branches: currentGlobal.branches.pct - previousGlobal.branches.pct,
      statements: currentGlobal.statements.pct - previousGlobal.statements.pct
    };
    
    const trendDirection = Object.values(trend).reduce((sum, val) => sum + val, 0) > 0 ? 'improving' : 'declining';
    
    return `Coverage trend is ${trendDirection}. Average change: ${(Object.values(trend).reduce((sum, val) => sum + val, 0) / 4).toFixed(2)}%`;
  }

  parseLcovFile(lcovPath) {
    // Basic LCOV parser - would need more sophisticated parsing for production
    const content = fs.readFileSync(lcovPath, 'utf8');
    const files = {};
    let currentFile = null;
    
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('SF:')) {
        currentFile = line.substring(3);
        files[currentFile] = {
          lines: { total: 0, covered: 0, pct: 0 },
          functions: { total: 0, covered: 0, pct: 0 },
          branches: { total: 0, covered: 0, pct: 0 },
          statements: { total: 0, covered: 0, pct: 0 }
        };
      } else if (line.startsWith('LF:') && currentFile) {
        files[currentFile].lines.total = parseInt(line.substring(3));
      } else if (line.startsWith('LH:') && currentFile) {
        files[currentFile].lines.covered = parseInt(line.substring(3));
        files[currentFile].lines.pct = (files[currentFile].lines.covered / files[currentFile].lines.total * 100) || 0;
      }
    }
    
    return files;
  }
}

// CLI interface
if (require.main === module) {
  const coveragePath = process.argv[2] || 'coverage';
  
  (async () => {
    try {
      const analyzer = new CoverageAnalyzer(coveragePath);
      const regression = await analyzer.analyze();
      
      if (regression) {
        console.log(JSON.stringify(regression, null, 2));
      } else {
        console.log('{}'); // Empty object for no regression
      }
    } catch (error) {
      console.error('Coverage analysis failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = CoverageAnalyzer;