#!/usr/bin/env node

/**
 * Smart Test Selection Engine
 * 
 * Analyzes code changes and determines optimal test execution strategy
 * based on risk assessment, historical data, and impact analysis.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SmartTestSelector {
  constructor(options = {}) {
    this.baseBranch = options.baseBranch || 'main';
    this.currentSha = options.currentSha || 'HEAD';
    this.historyFile = options.historyFile || '.github/test-history.json';
    this.configFile = options.configFile || '.github/test-selection-config.json';
    
    this.loadConfiguration();
    this.loadTestHistory();
  }

  /**
   * Load test selection configuration
   */
  loadConfiguration() {
    const defaultConfig = {
      riskMapping: {
        critical: {
          patterns: [
            'supabase/migrations/**',
            'src/lib/supabase.ts',
            'src/lib/api.ts',
            'src/lib/analysisService.ts',
            'src/lib/auth/**',
            'src/lib/stripe.ts',
            'package.json',
            'package-lock.json'
          ],
          testSuites: ['unit', 'integration', 'e2e', 'security'],
          coverage: 95,
          parallelism: 4
        },
        high: {
          patterns: [
            'src/lib/**',
            'src/hooks/**',
            'src/contexts/**',
            '.env*',
            'vite.config.ts',
            'tsconfig.json'
          ],
          testSuites: ['unit', 'integration', 'e2e'],
          coverage: 90,
          parallelism: 3
        },
        medium: {
          patterns: [
            'src/components/**',
            'src/pages/**',
            'src/types/**',
            'tailwind.config.js',
            'postcss.config.js'
          ],
          testSuites: ['unit', 'integration'],
          coverage: 85,
          parallelism: 2
        },
        low: {
          patterns: [
            'src/assets/**',
            'public/**',
            '*.md',
            'docs/**',
            '.github/ISSUE_TEMPLATE/**'
          ],
          testSuites: ['unit'],
          coverage: 80,
          parallelism: 1
        }
      },
      testMapping: {
        'src/components/**': {
          unit: 'src/components/**/*.test.{ts,tsx}',
          e2e: 'e2e/tests/**/*.spec.ts',
          visual: 'e2e/tests/visual/**/*.spec.ts'
        },
        'src/lib/**': {
          unit: 'src/lib/**/*.test.ts',
          integration: 'src/test/integration/**/*.test.ts'
        },
        'src/hooks/**': {
          unit: 'src/hooks/**/*.test.ts',
          integration: 'src/test/integration/hooks/**/*.test.ts'
        },
        'supabase/migrations/**': {
          integration: 'src/test/integration/database/**/*.test.ts',
          e2e: 'e2e/tests/**/*.spec.ts'
        },
        'e2e/**': {
          e2e: 'e2e/tests/**/*.spec.ts'
        }
      },
      performanceTriggers: [
        'package.json',
        'vite.config.ts',
        'src/lib/optimization/**',
        'src/lib/cache/**',
        'src/lib/performance/**'
      ],
      securityTriggers: [
        'package.json',
        'src/lib/auth/**',
        'src/lib/api.ts',
        'src/lib/supabase.ts',
        '.env*',
        '.github/workflows/**'
      ],
      visualTriggers: [
        'src/components/**',
        'src/pages/**',
        'src/index.css',
        'tailwind.config.js',
        'postcss.config.js'
      ]
    };

    try {
      if (fs.existsSync(this.configFile)) {
        const userConfig = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        this.config = { ...defaultConfig, ...userConfig };
      } else {
        this.config = defaultConfig;
      }
    } catch (error) {
      console.warn(`Warning: Could not load config file ${this.configFile}, using defaults`);
      this.config = defaultConfig;
    }
  }

  /**
   * Load test execution history for flaky test detection
   */
  loadTestHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        this.testHistory = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      } else {
        this.testHistory = {
          executions: [],
          flakyTests: {},
          performanceBaselines: {}
        };
      }
    } catch (error) {
      console.warn(`Warning: Could not load test history ${this.historyFile}`);
      this.testHistory = {
        executions: [],
        flakyTests: {},
        performanceBaselines: {}
      };
    }
  }

  /**
   * Get list of changed files between base branch and current commit
   */
  getChangedFiles() {
    try {
      const output = execSync(
        `git diff --name-only origin/${this.baseBranch}...${this.currentSha}`,
        { encoding: 'utf8' }
      );
      return output.trim().split('\n').filter(file => file.length > 0);
    } catch (error) {
      console.error('Error getting changed files:', error.message);
      return [];
    }
  }

  /**
   * Assess risk level based on changed files
   */
  assessRiskLevel(changedFiles) {
    const riskLevels = ['critical', 'high', 'medium', 'low'];
    
    for (const level of riskLevels) {
      const patterns = this.config.riskMapping[level].patterns;
      
      for (const pattern of patterns) {
        const regex = this.globToRegex(pattern);
        if (changedFiles.some(file => regex.test(file))) {
          return level;
        }
      }
    }
    
    return 'low';
  }

  /**
   * Convert glob pattern to regex
   */
  globToRegex(pattern) {
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\./g, '\\.');
    
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Determine which test suites to run based on risk and file changes
   */
  determineTestSuites(riskLevel, changedFiles) {
    const riskConfig = this.config.riskMapping[riskLevel];
    const testSuites = new Set(riskConfig.testSuites);
    
    // Add specific test suites based on file patterns
    if (this.shouldRunPerformanceTests(changedFiles)) {
      testSuites.add('performance');
    }
    
    if (this.shouldRunSecurityTests(changedFiles)) {
      testSuites.add('security');
    }
    
    if (this.shouldRunVisualTests(changedFiles)) {
      testSuites.add('visual');
    }
    
    // Skip all tests for documentation-only changes
    if (this.isDocumentationOnlyChange(changedFiles)) {
      return [];
    }
    
    return Array.from(testSuites);
  }

  /**
   * Check if performance tests should be run
   */
  shouldRunPerformanceTests(changedFiles) {
    return this.config.performanceTriggers.some(pattern => {
      const regex = this.globToRegex(pattern);
      return changedFiles.some(file => regex.test(file));
    });
  }

  /**
   * Check if security tests should be run
   */
  shouldRunSecurityTests(changedFiles) {
    return this.config.securityTriggers.some(pattern => {
      const regex = this.globToRegex(pattern);
      return changedFiles.some(file => regex.test(file));
    });
  }

  /**
   * Check if visual tests should be run
   */
  shouldRunVisualTests(changedFiles) {
    return this.config.visualTriggers.some(pattern => {
      const regex = this.globToRegex(pattern);
      return changedFiles.some(file => regex.test(file));
    });
  }

  /**
   * Check if this is a documentation-only change
   */
  isDocumentationOnlyChange(changedFiles) {
    const docPatterns = [
      /^docs\//,
      /^README/,
      /\.md$/,
      /^\.github\/ISSUE_TEMPLATE\//
    ];
    
    return changedFiles.length > 0 && 
           changedFiles.every(file => 
             docPatterns.some(pattern => pattern.test(file))
           );
  }

  /**
   * Get targeted test files based on changed files
   */
  getTargetedTests(changedFiles, testSuite) {
    const targetedTests = new Set();
    
    for (const file of changedFiles) {
      for (const [pattern, mapping] of Object.entries(this.config.testMapping)) {
        const regex = this.globToRegex(pattern);
        if (regex.test(file) && mapping[testSuite]) {
          targetedTests.add(mapping[testSuite]);
        }
      }
    }
    
    return Array.from(targetedTests);
  }

  /**
   * Calculate optimal parallelism based on risk level and available resources
   */
  calculateParallelism(riskLevel, testSuites) {
    const baseParallelism = this.config.riskMapping[riskLevel].parallelism;
    
    // Adjust based on test suite complexity
    let multiplier = 1;
    if (testSuites.includes('e2e')) multiplier += 0.5;
    if (testSuites.includes('visual')) multiplier += 0.3;
    if (testSuites.includes('performance')) multiplier += 0.2;
    
    return Math.min(Math.ceil(baseParallelism * multiplier), 8); // Cap at 8 for cost control
  }

  /**
   * Identify flaky tests that should be retried
   */
  identifyFlakyTests() {
    const flakyTests = [];
    const flakyThreshold = 0.1; // 10% failure rate
    const minExecutions = 5;
    
    for (const [testName, stats] of Object.entries(this.testHistory.flakyTests)) {
      if (stats.executions >= minExecutions) {
        const failureRate = stats.failures / stats.executions;
        if (failureRate >= flakyThreshold && failureRate < 0.9) {
          flakyTests.push({
            name: testName,
            failureRate,
            executions: stats.executions,
            lastFailure: stats.lastFailure
          });
        }
      }
    }
    
    return flakyTests;
  }

  /**
   * Generate test execution plan
   */
  generateExecutionPlan() {
    const changedFiles = this.getChangedFiles();
    const riskLevel = this.assessRiskLevel(changedFiles);
    const testSuites = this.determineTestSuites(riskLevel, changedFiles);
    const parallelism = this.calculateParallelism(riskLevel, testSuites);
    const flakyTests = this.identifyFlakyTests();
    
    const plan = {
      metadata: {
        timestamp: new Date().toISOString(),
        baseBranch: this.baseBranch,
        currentSha: this.currentSha,
        changedFiles: changedFiles.length,
        riskLevel
      },
      execution: {
        testSuites,
        parallelism,
        estimatedDuration: this.estimateExecutionTime(testSuites, parallelism),
        coverage: {
          threshold: this.config.riskMapping[riskLevel].coverage,
          enforce: riskLevel === 'critical' || riskLevel === 'high'
        }
      },
      targeting: {
        changedFiles,
        targetedTests: {}
      },
      optimization: {
        flakyTests,
        retryStrategy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelay: 1000
        },
        caching: {
          dependencies: true,
          buildArtifacts: true,
          testResults: testSuites.length < 3
        }
      },
      quality: {
        gates: {
          coverage: this.config.riskMapping[riskLevel].coverage,
          security: testSuites.includes('security'),
          performance: testSuites.includes('performance'),
          accessibility: testSuites.includes('visual')
        }
      }
    };
    
    // Add targeted tests for each suite
    for (const suite of testSuites) {
      plan.targeting.targetedTests[suite] = this.getTargetedTests(changedFiles, suite);
    }
    
    return plan;
  }

  /**
   * Estimate execution time based on test suites and parallelism
   */
  estimateExecutionTime(testSuites, parallelism) {
    const baseTimes = {
      unit: 2, // minutes
      integration: 5,
      e2e: 10,
      visual: 8,
      performance: 6,
      security: 4
    };
    
    const totalTime = testSuites.reduce((sum, suite) => sum + (baseTimes[suite] || 2), 0);
    return Math.ceil(totalTime / parallelism);
  }

  /**
   * Update test history with execution results
   */
  updateTestHistory(executionResult) {
    const execution = {
      timestamp: new Date().toISOString(),
      sha: this.currentSha,
      riskLevel: executionResult.riskLevel,
      testSuites: executionResult.testSuites,
      duration: executionResult.duration,
      success: executionResult.success,
      coverage: executionResult.coverage
    };
    
    this.testHistory.executions.push(execution);
    
    // Update flaky test tracking
    if (executionResult.testResults) {
      for (const result of executionResult.testResults) {
        const testName = result.name;
        if (!this.testHistory.flakyTests[testName]) {
          this.testHistory.flakyTests[testName] = {
            executions: 0,
            failures: 0,
            lastFailure: null
          };
        }
        
        this.testHistory.flakyTests[testName].executions++;
        if (!result.success) {
          this.testHistory.flakyTests[testName].failures++;
          this.testHistory.flakyTests[testName].lastFailure = execution.timestamp;
        }
      }
    }
    
    // Keep only last 100 executions
    if (this.testHistory.executions.length > 100) {
      this.testHistory.executions = this.testHistory.executions.slice(-100);
    }
    
    // Save updated history
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.testHistory, null, 2));
    } catch (error) {
      console.warn('Warning: Could not save test history:', error.message);
    }
  }

  /**
   * Generate GitHub Actions outputs
   */
  generateGitHubOutputs(plan) {
    const outputs = {
      'risk-level': plan.metadata.riskLevel,
      'test-suites': plan.execution.testSuites.join(','),
      'parallelism': plan.execution.parallelism.toString(),
      'estimated-duration': plan.execution.estimatedDuration.toString(),
      'coverage-threshold': plan.execution.coverage.threshold.toString(),
      'enforce-coverage': plan.execution.coverage.enforce.toString(),
      'flaky-tests': plan.optimization.flakyTests.length.toString(),
      'changed-files': plan.targeting.changedFiles.join(',')
    };
    
    // Individual test suite flags
    const allSuites = ['unit', 'integration', 'e2e', 'visual', 'performance', 'security'];
    for (const suite of allSuites) {
      outputs[`run-${suite}`] = plan.execution.testSuites.includes(suite).toString();
    }
    
    return outputs;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    options[key] = value;
  }
  
  const selector = new SmartTestSelector(options);
  
  try {
    const plan = selector.generateExecutionPlan();
    
    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      const outputs = selector.generateGitHubOutputs(plan);
      const outputFile = process.env.GITHUB_OUTPUT;
      
      for (const [key, value] of Object.entries(outputs)) {
        fs.appendFileSync(outputFile, `${key}=${value}\n`);
      }
    }
    
    // Output plan as JSON for debugging
    if (options.output === 'json' || process.env.NODE_ENV === 'development') {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(`Risk Level: ${plan.metadata.riskLevel}`);
      console.log(`Test Suites: ${plan.execution.testSuites.join(', ')}`);
      console.log(`Parallelism: ${plan.execution.parallelism}`);
      console.log(`Estimated Duration: ${plan.execution.estimatedDuration} minutes`);
      console.log(`Changed Files: ${plan.targeting.changedFiles.length}`);
      console.log(`Flaky Tests: ${plan.optimization.flakyTests.length}`);
    }
    
  } catch (error) {
    console.error('Error generating test plan:', error.message);
    process.exit(1);
  }
}

module.exports = SmartTestSelector;