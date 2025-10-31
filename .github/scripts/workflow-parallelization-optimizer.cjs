#!/usr/bin/env node

/**
 * Workflow Parallelization and Optimization System
 * 
 * Implements intelligent job parallelization, smart test selection,
 * and workflow cancellation policies to optimize CI/CD performance.
 */

const fs = require('fs');
const path = require('path');

class WorkflowParallelizationOptimizer {
  constructor() {
    this.configFile = '.github/parallelization-config.json';
    this.changeDetectionCache = '.github/change-detection-cache.json';
    this.testSelectionRules = this.loadTestSelectionRules();
    this.parallelizationStrategies = this.loadParallelizationStrategies();
  }

  /**
   * Analyze changes and determine optimal parallelization strategy
   */
  analyzeChangesForParallelization(changedFiles, baseRef = 'main') {
    console.log(`Analyzing ${changedFiles.length} changed files for parallelization optimization...`);
    
    const analysis = {
      changeScope: this.categorizeChanges(changedFiles),
      testStrategy: this.determineTestStrategy(changedFiles),
      parallelizationPlan: null,
      optimizations: [],
      estimatedSavings: 0
    };

    // Generate parallelization plan based on changes
    analysis.parallelizationPlan = this.generateParallelizationPlan(analysis.changeScope, analysis.testStrategy);
    
    // Calculate optimizations and savings
    analysis.optimizations = this.identifyOptimizations(analysis);
    analysis.estimatedSavings = this.calculateTimeSavings(analysis);

    return analysis;
  }

  /**
   * Categorize changes by impact area
   */
  categorizeChanges(changedFiles) {
    const categories = {
      frontend: { files: [], impact: 'medium' },
      backend: { files: [], impact: 'high' },
      database: { files: [], impact: 'high' },
      config: { files: [], impact: 'low' },
      tests: { files: [], impact: 'low' },
      docs: { files: [], impact: 'minimal' },
      workflows: { files: [], impact: 'medium' },
      dependencies: { files: [], impact: 'high' }
    };

    const patterns = {
      frontend: [/^src\/components/, /^src\/pages/, /^src\/styles/, /\.tsx?$/, /\.css$/, /\.scss$/],
      backend: [/^src\/lib/, /^src\/api/, /^src\/services/, /^supabase\/functions/],
      database: [/^supabase\/migrations/, /\.sql$/, /^src\/lib\/supabase/],
      config: [/^\.github\/(?!workflows)/, /\.config\.(js|ts|json)$/, /^\.env/, /^vite\.config/],
      tests: [/\.test\.(js|ts|tsx)$/, /\.spec\.(js|ts|tsx)$/, /^tests?\//, /^e2e\//],
      docs: [/\.md$/, /^docs\//, /README/],
      workflows: [/^\.github\/workflows/, /^\.github\/actions/],
      dependencies: [/^package\.json$/, /^package-lock\.json$/, /^yarn\.lock$/]
    };

    for (const file of changedFiles) {
      let categorized = false;
      
      for (const [category, categoryPatterns] of Object.entries(patterns)) {
        if (categoryPatterns.some(pattern => pattern.test(file))) {
          categories[category].files.push(file);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categories.config.files.push(file); // Default to config
      }
    }

    // Calculate overall impact
    const impactScores = { minimal: 1, low: 2, medium: 3, high: 4 };
    let totalImpact = 0;
    let fileCount = 0;

    for (const category of Object.values(categories)) {
      if (category.files.length > 0) {
        totalImpact += impactScores[category.impact] * category.files.length;
        fileCount += category.files.length;
      }
    }

    const overallImpact = fileCount > 0 ? totalImpact / fileCount : 1;
    
    return {
      categories,
      overallImpact: overallImpact > 3.5 ? 'high' : overallImpact > 2.5 ? 'medium' : 'low',
      affectedAreas: Object.keys(categories).filter(cat => categories[cat].files.length > 0),
      totalFiles: changedFiles.length
    };
  }

  /**
   * Determine optimal test strategy based on changes
   */
  determineTestStrategy(changedFiles) {
    const strategy = {
      runAll: false,
      selectedTests: [],
      parallelGroups: [],
      skipTests: [],
      reasoning: []
    };

    // Analyze change patterns
    const hasBackendChanges = changedFiles.some(f => /^src\/lib|^supabase/.test(f));
    const hasFrontendChanges = changedFiles.some(f => /^src\/components|^src\/pages/.test(f));
    const hasTestChanges = changedFiles.some(f => /\.test\.|\.spec\./.test(f));
    const hasDependencyChanges = changedFiles.some(f => /package\.json|package-lock\.json/.test(f));
    const hasWorkflowChanges = changedFiles.some(f => /^\.github\/workflows/.test(f));

    // Determine test selection strategy
    if (hasDependencyChanges || hasWorkflowChanges || changedFiles.length > 20) {
      strategy.runAll = true;
      strategy.reasoning.push('Running full test suite due to dependency or workflow changes');
    } else {
      // Smart test selection
      if (hasBackendChanges) {
        strategy.selectedTests.push('unit-tests', 'integration-tests', 'api-tests');
        strategy.reasoning.push('Backend changes detected - running API and integration tests');
      }
      
      if (hasFrontendChanges) {
        strategy.selectedTests.push('unit-tests', 'component-tests', 'e2e-tests');
        strategy.reasoning.push('Frontend changes detected - running component and E2E tests');
      }
      
      if (hasTestChanges) {
        strategy.selectedTests.push('unit-tests');
        strategy.reasoning.push('Test file changes detected - running unit tests');
      }

      // Remove duplicates
      strategy.selectedTests = [...new Set(strategy.selectedTests)];
    }

    // Define parallel groups based on selected tests
    strategy.parallelGroups = this.createParallelTestGroups(strategy.selectedTests, strategy.runAll);

    return strategy;
  }

  /**
   * Create parallel test groups for optimal execution
   */
  createParallelTestGroups(selectedTests, runAll) {
    const testGroups = {
      fast: {
        name: 'Fast Tests',
        tests: ['unit-tests', 'lint', 'type-check'],
        estimatedTime: 5,
        parallelism: 4
      },
      medium: {
        name: 'Integration Tests',
        tests: ['integration-tests', 'api-tests', 'component-tests'],
        estimatedTime: 15,
        parallelism: 2
      },
      slow: {
        name: 'E2E and Performance Tests',
        tests: ['e2e-tests', 'performance-tests', 'visual-tests'],
        estimatedTime: 25,
        parallelism: 3
      },
      security: {
        name: 'Security Tests',
        tests: ['security-scans', 'dependency-audit'],
        estimatedTime: 10,
        parallelism: 1
      }
    };

    if (runAll) {
      return Object.values(testGroups);
    }

    // Filter groups based on selected tests
    const activeGroups = [];
    for (const group of Object.values(testGroups)) {
      const hasSelectedTests = group.tests.some(test => selectedTests.includes(test));
      if (hasSelectedTests) {
        // Filter to only include selected tests
        const filteredGroup = {
          ...group,
          tests: group.tests.filter(test => selectedTests.includes(test))
        };
        activeGroups.push(filteredGroup);
      }
    }

    return activeGroups;
  }

  /**
   * Generate comprehensive parallelization plan
   */
  generateParallelizationPlan(changeScope, testStrategy) {
    const plan = {
      strategy: testStrategy.runAll ? 'full-suite' : 'selective',
      totalJobs: 0,
      parallelGroups: testStrategy.parallelGroups,
      dependencies: this.analyzeDependencies(testStrategy.parallelGroups),
      resourceAllocation: this.calculateResourceAllocation(testStrategy.parallelGroups),
      estimatedDuration: 0,
      optimizations: []
    };

    // Calculate total jobs and duration
    plan.totalJobs = testStrategy.parallelGroups.reduce((sum, group) => sum + group.parallelism, 0);
    plan.estimatedDuration = Math.max(...testStrategy.parallelGroups.map(group => 
      Math.ceil(group.estimatedTime / group.parallelism)
    ));

    // Add optimizations based on change scope
    if (changeScope.overallImpact === 'low') {
      plan.optimizations.push({
        type: 'skip-heavy-tests',
        description: 'Skip performance and visual tests for low-impact changes',
        timeSaving: 15
      });
    }

    if (changeScope.affectedAreas.length === 1) {
      plan.optimizations.push({
        type: 'focused-testing',
        description: 'Focus on tests related to changed area only',
        timeSaving: 10
      });
    }

    return plan;
  }

  /**
   * Analyze job dependencies for optimal scheduling
   */
  analyzeDependencies(parallelGroups) {
    const dependencies = {
      sequential: [],
      parallel: [],
      conditional: []
    };

    // Define dependency rules
    const dependencyRules = {
      'unit-tests': { dependsOn: [], canRunInParallel: true },
      'lint': { dependsOn: [], canRunInParallel: true },
      'type-check': { dependsOn: [], canRunInParallel: true },
      'integration-tests': { dependsOn: ['unit-tests'], canRunInParallel: true },
      'api-tests': { dependsOn: ['unit-tests'], canRunInParallel: true },
      'component-tests': { dependsOn: ['unit-tests'], canRunInParallel: true },
      'e2e-tests': { dependsOn: ['integration-tests'], canRunInParallel: true },
      'performance-tests': { dependsOn: ['integration-tests'], canRunInParallel: false },
      'visual-tests': { dependsOn: ['component-tests'], canRunInParallel: true },
      'security-scans': { dependsOn: [], canRunInParallel: false },
      'dependency-audit': { dependsOn: [], canRunInParallel: true }
    };

    // Categorize based on dependencies
    for (const group of parallelGroups) {
      for (const test of group.tests) {
        const rule = dependencyRules[test];
        if (!rule) continue;

        if (rule.dependsOn.length === 0) {
          dependencies.parallel.push(test);
        } else if (rule.canRunInParallel) {
          dependencies.conditional.push({
            test,
            dependsOn: rule.dependsOn,
            canParallelize: true
          });
        } else {
          dependencies.sequential.push({
            test,
            dependsOn: rule.dependsOn
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Calculate optimal resource allocation
   */
  calculateResourceAllocation(parallelGroups) {
    const allocation = {
      totalRunners: 0,
      runnerTypes: {},
      costEstimate: 0,
      recommendations: []
    };

    const runnerCosts = {
      'ubuntu-latest': 0.008,
      'ubuntu-latest-4-cores': 0.016,
      'ubuntu-latest-8-cores': 0.032
    };

    for (const group of parallelGroups) {
      let recommendedRunner = 'ubuntu-latest';
      
      // Determine optimal runner based on test type
      if (group.tests.includes('e2e-tests') || group.tests.includes('performance-tests')) {
        recommendedRunner = 'ubuntu-latest-8-cores';
      } else if (group.tests.includes('integration-tests') || group.parallelism > 2) {
        recommendedRunner = 'ubuntu-latest-4-cores';
      }

      allocation.runnerTypes[group.name] = {
        runner: recommendedRunner,
        count: group.parallelism,
        estimatedTime: group.estimatedTime,
        cost: runnerCosts[recommendedRunner] * group.estimatedTime * group.parallelism
      };

      allocation.totalRunners += group.parallelism;
      allocation.costEstimate += allocation.runnerTypes[group.name].cost;
    }

    // Generate recommendations
    if (allocation.totalRunners > 10) {
      allocation.recommendations.push({
        type: 'reduce-parallelism',
        message: 'Consider reducing parallelism to stay within runner limits',
        impact: 'May increase execution time but reduce costs'
      });
    }

    if (allocation.costEstimate > 5.0) {
      allocation.recommendations.push({
        type: 'cost-optimization',
        message: 'High cost detected - consider optimizing test selection',
        impact: `Estimated cost: $${allocation.costEstimate.toFixed(2)}`
      });
    }

    return allocation;
  }

  /**
   * Identify optimization opportunities
   */
  identifyOptimizations(analysis) {
    const optimizations = [];

    // Cache optimization
    if (analysis.changeScope.categories.dependencies.files.length === 0) {
      optimizations.push({
        type: 'cache-optimization',
        title: 'Leverage dependency cache',
        description: 'No dependency changes detected - can use cached node_modules',
        timeSaving: 3,
        implementation: 'Use cache-hit condition to skip npm install'
      });
    }

    // Test parallelization
    if (analysis.parallelizationPlan.parallelGroups.length > 1) {
      const sequentialTime = analysis.parallelizationPlan.parallelGroups.reduce(
        (sum, group) => sum + group.estimatedTime, 0
      );
      const parallelTime = analysis.parallelizationPlan.estimatedDuration;
      
      optimizations.push({
        type: 'parallelization',
        title: 'Parallel test execution',
        description: `Run ${analysis.parallelizationPlan.totalJobs} jobs in parallel`,
        timeSaving: sequentialTime - parallelTime,
        implementation: 'Use matrix strategy and job dependencies'
      });
    }

    // Smart test selection
    if (!analysis.testStrategy.runAll) {
      optimizations.push({
        type: 'test-selection',
        title: 'Smart test selection',
        description: `Running only ${analysis.testStrategy.selectedTests.length} test types instead of full suite`,
        timeSaving: 20,
        implementation: 'Skip unnecessary test categories based on change analysis'
      });
    }

    // Workflow cancellation
    optimizations.push({
      type: 'workflow-cancellation',
      title: 'Cancel outdated runs',
      description: 'Automatically cancel previous runs when new commits are pushed',
      timeSaving: 10,
      implementation: 'Use concurrency groups with cancel-in-progress'
    });

    return optimizations;
  }

  /**
   * Calculate estimated time savings
   */
  calculateTimeSavings(analysis) {
    return analysis.optimizations.reduce((total, opt) => total + (opt.timeSaving || 0), 0);
  }

  /**
   * Generate workflow cancellation policies
   */
  generateCancellationPolicies() {
    return {
      policies: {
        'pr-updates': {
          name: 'PR Update Cancellation',
          description: 'Cancel previous runs when new commits are pushed to PR',
          concurrency: 'pr-${{ github.event.pull_request.number }}',
          cancelInProgress: true,
          applicableWorkflows: ['test', 'security', 'quality-gates']
        },
        'branch-updates': {
          name: 'Branch Update Cancellation',
          description: 'Cancel previous runs on branch updates',
          concurrency: 'branch-${{ github.ref }}',
          cancelInProgress: true,
          applicableWorkflows: ['test', 'build']
        },
        'deployment-protection': {
          name: 'Deployment Protection',
          description: 'Prevent concurrent deployments to same environment',
          concurrency: 'deploy-${{ inputs.environment }}',
          cancelInProgress: false,
          applicableWorkflows: ['deploy']
        },
        'resource-conservation': {
          name: 'Resource Conservation',
          description: 'Limit concurrent resource-intensive workflows',
          concurrency: 'resource-intensive',
          cancelInProgress: true,
          maxConcurrent: 2,
          applicableWorkflows: ['performance', 'load-testing', 'security-scans']
        }
      },
      implementation: {
        prWorkflows: {
          concurrency: {
            group: 'pr-${{ github.event.pull_request.number }}',
            'cancel-in-progress': true
          }
        },
        branchWorkflows: {
          concurrency: {
            group: 'branch-${{ github.ref }}',
            'cancel-in-progress': true
          }
        },
        deploymentWorkflows: {
          concurrency: {
            group: 'deploy-${{ inputs.environment }}',
            'cancel-in-progress': false
          }
        }
      }
    };
  }

  /**
   * Generate optimized workflow configuration
   */
  generateOptimizedWorkflow(analysis, workflowName) {
    const workflow = {
      name: `Optimized ${workflowName}`,
      on: {
        pull_request: {
          branches: ['main', 'develop']
        },
        push: {
          branches: ['main', 'develop']
        }
      },
      concurrency: {
        group: '${{ github.workflow }}-${{ github.ref }}',
        'cancel-in-progress': true
      },
      jobs: {}
    };

    // Add change detection job
    workflow.jobs['detect-changes'] = {
      name: 'Detect Changes',
      'runs-on': 'ubuntu-latest',
      outputs: this.generateChangeDetectionOutputs(analysis),
      steps: [
        {
          name: 'Checkout code',
          uses: 'actions/checkout@v4',
          with: {
            'fetch-depth': 0
          }
        },
        {
          name: 'Detect changes',
          id: 'changes',
          run: this.generateChangeDetectionScript()
        }
      ]
    };

    // Add parallel test jobs based on analysis
    for (const group of analysis.parallelizationPlan.parallelGroups) {
      const jobName = group.name.toLowerCase().replace(/\s+/g, '-');
      
      workflow.jobs[jobName] = {
        name: group.name,
        'runs-on': analysis.parallelizationPlan.resourceAllocation.runnerTypes[group.name]?.runner || 'ubuntu-latest',
        needs: ['detect-changes'],
        if: this.generateJobCondition(group, analysis),
        strategy: group.parallelism > 1 ? {
          matrix: {
            shard: Array.from({ length: group.parallelism }, (_, i) => i + 1)
          }
        } : undefined,
        steps: this.generateJobSteps(group)
      };
    }

    return workflow;
  }

  /**
   * Generate change detection outputs
   */
  generateChangeDetectionOutputs(analysis) {
    const outputs = {};
    
    for (const [category, data] of Object.entries(analysis.changeScope.categories)) {
      if (data.files.length > 0) {
        outputs[`has-${category}-changes`] = '${{ steps.changes.outputs.has-' + category + '-changes }}';
      }
    }
    
    outputs['test-strategy'] = '${{ steps.changes.outputs.test-strategy }}';
    outputs['parallelization-plan'] = '${{ steps.changes.outputs.parallelization-plan }}';
    
    return outputs;
  }

  /**
   * Generate change detection script template
   */
  generateChangeDetectionScript() {
    return [
      '# Get changed files based on event type',
      'if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then',
      '  changed_files=$(git diff --name-only $PR_BASE_SHA..$PR_HEAD_SHA)',
      'else',
      '  changed_files=$(git diff --name-only $BEFORE_SHA..$AFTER_SHA)',
      'fi',
      '',
      'echo "Changed files:"',
      'echo "$changed_files"',
      '',
      '# Analyze changes using the parallelization optimizer',
      'echo "$changed_files" > changed-files.txt',
      'node .github/scripts/workflow-parallelization-optimizer.cjs analyze changed-files.txt > analysis.json',
      '',
      '# Extract analysis results',
      'cat analysis.json | jq -r \'.changeScope.categories | to_entries[] | select(.value.files | length > 0) | "has-" + .key + "-changes=true"\' | while read output; do',
      '  echo "$output" >> $GITHUB_OUTPUT',
      'done'
    ].join('\n');
  }

  /**
   * Generate job condition based on changes
   */
  generateJobCondition(group, analysis) {
    const conditions = [];
    
    // Map test types to change categories
    const testToChangeMapping = {
      'unit-tests': ['frontend', 'backend', 'tests'],
      'integration-tests': ['backend', 'database'],
      'e2e-tests': ['frontend', 'backend'],
      'security-scans': ['backend', 'dependencies', 'workflows'],
      'performance-tests': ['backend', 'frontend'],
      'visual-tests': ['frontend']
    };
    
    for (const test of group.tests) {
      const relevantChanges = testToChangeMapping[test] || [];
      for (const change of relevantChanges) {
        conditions.push(`needs.detect-changes.outputs.has-${change}-changes == 'true'`);
      }
    }
    
    return conditions.length > 0 ? conditions.join(' || ') : 'true';
  }

  /**
   * Generate job steps for a test group
   */
  generateJobSteps(group) {
    const steps = [
      {
        name: 'Checkout code',
        uses: 'actions/checkout@v4'
      },
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v4',
        with: {
          'node-version': '20',
          cache: 'npm'
        }
      },
      {
        name: 'Install dependencies',
        run: 'npm ci'
      }
    ];

    // Add test-specific steps
    for (const test of group.tests) {
      steps.push(this.generateTestStep(test, group.parallelism > 1));
    }

    return steps;
  }

  /**
   * Generate test step configuration
   */
  generateTestStep(testType, isParallel) {
    const testConfigs = {
      'unit-tests': {
        name: 'Run unit tests',
        run: isParallel ? 'npm run test -- --shard=${{ matrix.shard }}/${{ strategy.job-total }}' : 'npm run test'
      },
      'integration-tests': {
        name: 'Run integration tests',
        run: isParallel ? 'npm run test:integration -- --shard=${{ matrix.shard }}/${{ strategy.job-total }}' : 'npm run test:integration'
      },
      'e2e-tests': {
        name: 'Run E2E tests',
        run: isParallel ? 'npx playwright test --shard=${{ matrix.shard }}/${{ strategy.job-total }}' : 'npx playwright test'
      },
      'security-scans': {
        name: 'Run security scans',
        run: 'npm audit && npm run security:scan'
      },
      'performance-tests': {
        name: 'Run performance tests',
        run: 'npm run test:performance'
      },
      'visual-tests': {
        name: 'Run visual tests',
        run: 'npm run test:visual'
      },
      'lint': {
        name: 'Run linting',
        run: 'npm run lint'
      },
      'type-check': {
        name: 'Run type checking',
        run: 'npm run type-check'
      }
    };

    return testConfigs[testType] || {
      name: `Run ${testType}`,
      run: `npm run ${testType}`
    };
  }

  /**
   * Load test selection rules
   */
  loadTestSelectionRules() {
    return {
      filePatterns: {
        'src/components/**': ['unit-tests', 'component-tests', 'visual-tests'],
        'src/lib/**': ['unit-tests', 'integration-tests'],
        'src/pages/**': ['unit-tests', 'e2e-tests'],
        'supabase/**': ['integration-tests', 'security-scans'],
        'package.json': ['unit-tests', 'integration-tests', 'security-scans'],
        '.github/workflows/**': ['all']
      },
      impactLevels: {
        high: ['unit-tests', 'integration-tests', 'e2e-tests', 'security-scans'],
        medium: ['unit-tests', 'integration-tests'],
        low: ['unit-tests']
      }
    };
  }

  /**
   * Load parallelization strategies
   */
  loadParallelizationStrategies() {
    return {
      conservative: {
        maxParallelJobs: 5,
        preferSequential: true,
        resourceLimit: 'low'
      },
      balanced: {
        maxParallelJobs: 10,
        preferSequential: false,
        resourceLimit: 'medium'
      },
      aggressive: {
        maxParallelJobs: 20,
        preferSequential: false,
        resourceLimit: 'high'
      }
    };
  }

  /**
   * Save analysis results
   */
  saveAnalysis(analysis, filename) {
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(analysis, null, 2));
    console.log(`Analysis saved to ${filepath}`);
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(analysis) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalOptimizations: analysis.optimizations.length,
        estimatedTimeSavings: analysis.estimatedSavings,
        parallelizationStrategy: analysis.parallelizationPlan.strategy,
        resourceEfficiency: this.calculateResourceEfficiency(analysis)
      },
      details: {
        changeAnalysis: analysis.changeScope,
        testStrategy: analysis.testStrategy,
        parallelizationPlan: analysis.parallelizationPlan,
        optimizations: analysis.optimizations
      },
      recommendations: this.generateRecommendations(analysis)
    };

    return report;
  }

  /**
   * Calculate resource efficiency score
   */
  calculateResourceEfficiency(analysis) {
    const baseScore = 100;
    let efficiency = baseScore;

    // Deduct for excessive parallelization
    if (analysis.parallelizationPlan.totalJobs > 15) {
      efficiency -= 20;
    }

    // Deduct for high cost
    if (analysis.parallelizationPlan.resourceAllocation.costEstimate > 3.0) {
      efficiency -= 15;
    }

    // Add for optimizations
    efficiency += analysis.optimizations.length * 5;

    return Math.max(0, Math.min(100, efficiency));
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.parallelizationPlan.totalJobs > 10) {
      recommendations.push({
        type: 'resource-optimization',
        priority: 'medium',
        title: 'Consider reducing parallelism',
        description: 'High number of parallel jobs may hit runner limits',
        action: 'Reduce matrix size or combine related test groups'
      });
    }

    if (analysis.estimatedSavings > 15) {
      recommendations.push({
        type: 'performance-optimization',
        priority: 'high',
        title: 'Implement identified optimizations',
        description: `Potential time savings of ${analysis.estimatedSavings} minutes`,
        action: 'Apply parallelization and smart test selection'
      });
    }

    if (!analysis.testStrategy.runAll && analysis.changeScope.overallImpact === 'low') {
      recommendations.push({
        type: 'efficiency-optimization',
        priority: 'low',
        title: 'Consider even more aggressive test selection',
        description: 'Low-impact changes could skip additional test categories',
        action: 'Implement more granular test selection rules'
      });
    }

    return recommendations;
  }
}

// CLI Interface
if (require.main === module) {
  const optimizer = new WorkflowParallelizationOptimizer();
  
  const command = process.argv[2];
  const inputFile = process.argv[3];

  async function main() {
    try {
      switch (command) {
        case 'analyze':
          if (!inputFile) {
            console.error('Usage: node workflow-parallelization-optimizer.cjs analyze <changed-files.txt>');
            process.exit(1);
          }
          
          const changedFiles = fs.readFileSync(inputFile, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.trim());
          
          const analysis = optimizer.analyzeChangesForParallelization(changedFiles);
          console.log(JSON.stringify(analysis, null, 2));
          break;

        case 'generate-workflow':
          const workflowName = process.argv[3] || 'Optimized CI';
          const analysisFile = process.argv[4];
          
          if (!analysisFile) {
            console.error('Usage: node workflow-parallelization-optimizer.cjs generate-workflow <name> <analysis.json>');
            process.exit(1);
          }
          
          const analysisData = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
          const workflow = optimizer.generateOptimizedWorkflow(analysisData, workflowName);
          console.log(JSON.stringify(workflow, null, 2));
          break;

        case 'cancellation-policies':
          const policies = optimizer.generateCancellationPolicies();
          console.log(JSON.stringify(policies, null, 2));
          break;

        case 'report':
          if (!inputFile) {
            console.error('Usage: node workflow-parallelization-optimizer.cjs report <analysis.json>');
            process.exit(1);
          }
          
          const reportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
          const report = optimizer.generatePerformanceReport(reportData);
          console.log(JSON.stringify(report, null, 2));
          break;

        default:
          console.log('Workflow Parallelization and Optimization System');
          console.log('');
          console.log('Commands:');
          console.log('  analyze <changed-files.txt>           - Analyze changes for parallelization');
          console.log('  generate-workflow <name> <analysis>   - Generate optimized workflow');
          console.log('  cancellation-policies                 - Generate workflow cancellation policies');
          console.log('  report <analysis.json>                - Generate performance report');
          console.log('');
          console.log('Features:');
          console.log('  - Intelligent job parallelization based on change detection');
          console.log('  - Smart test selection to reduce execution time');
          console.log('  - Workflow cancellation policies for resource conservation');
          console.log('  - Resource allocation optimization');
          break;
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  main();
}

module.exports = WorkflowParallelizationOptimizer;