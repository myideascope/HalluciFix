#!/usr/bin/env node

/**
 * GitHub Actions Runner Allocation Optimizer
 * 
 * This script analyzes workflow requirements and optimizes runner allocation
 * based on workload characteristics, resource requirements, and cost considerations.
 */

const fs = require('fs');
const path = require('path');

class RunnerAllocationOptimizer {
  constructor() {
    this.runnerTypes = {
      'ubuntu-latest': {
        cores: 2,
        memory: 7, // GB
        storage: 14, // GB
        costPerMinute: 0.008,
        maxConcurrency: 20,
        bestFor: ['unit-tests', 'linting', 'security-scans']
      },
      'ubuntu-latest-4-cores': {
        cores: 4,
        memory: 16,
        storage: 14,
        costPerMinute: 0.016,
        maxConcurrency: 10,
        bestFor: ['integration-tests', 'build', 'medium-workloads']
      },
      'ubuntu-latest-8-cores': {
        cores: 8,
        memory: 32,
        storage: 14,
        costPerMinute: 0.032,
        maxConcurrency: 5,
        bestFor: ['e2e-tests', 'performance-tests', 'heavy-workloads']
      },
      'ubuntu-latest-16-cores': {
        cores: 16,
        memory: 64,
        storage: 14,
        costPerMinute: 0.064,
        maxConcurrency: 2,
        bestFor: ['load-testing', 'compilation', 'data-processing']
      },
      'windows-latest': {
        cores: 2,
        memory: 7,
        storage: 14,
        costPerMinute: 0.016,
        maxConcurrency: 10,
        bestFor: ['windows-specific', 'cross-platform-testing']
      },
      'macos-latest': {
        cores: 3,
        memory: 14,
        storage: 14,
        costPerMinute: 0.08,
        maxConcurrency: 5,
        bestFor: ['ios-builds', 'macos-testing', 'cross-platform']
      },
      'self-hosted-small': {
        cores: 2,
        memory: 4,
        storage: 20,
        costPerMinute: 0.004,
        maxConcurrency: 50,
        bestFor: ['lightweight-tasks', 'cost-optimization']
      },
      'self-hosted-medium': {
        cores: 4,
        memory: 8,
        storage: 40,
        costPerMinute: 0.008,
        maxConcurrency: 25,
        bestFor: ['standard-workloads', 'balanced-performance']
      },
      'self-hosted-large': {
        cores: 8,
        memory: 16,
        storage: 80,
        costPerMinute: 0.016,
        maxConcurrency: 10,
        bestFor: ['heavy-workloads', 'parallel-processing']
      }
    };

    this.workloadProfiles = {
      'unit-tests': {
        cpuIntensive: false,
        memoryIntensive: false,
        ioIntensive: false,
        networkIntensive: false,
        parallelizable: true,
        avgDurationMinutes: 5,
        resourceRequirements: { cores: 2, memory: 4 }
      },
      'integration-tests': {
        cpuIntensive: true,
        memoryIntensive: true,
        ioIntensive: true,
        networkIntensive: true,
        parallelizable: true,
        avgDurationMinutes: 15,
        resourceRequirements: { cores: 4, memory: 8 }
      },
      'e2e-tests': {
        cpuIntensive: true,
        memoryIntensive: true,
        ioIntensive: false,
        networkIntensive: true,
        parallelizable: true,
        avgDurationMinutes: 25,
        resourceRequirements: { cores: 4, memory: 8 }
      },
      'security-scans': {
        cpuIntensive: true,
        memoryIntensive: false,
        ioIntensive: true,
        networkIntensive: false,
        parallelizable: false,
        avgDurationMinutes: 10,
        resourceRequirements: { cores: 2, memory: 4 }
      },
      'performance-tests': {
        cpuIntensive: true,
        memoryIntensive: true,
        ioIntensive: false,
        networkIntensive: true,
        parallelizable: false,
        avgDurationMinutes: 20,
        resourceRequirements: { cores: 8, memory: 16 }
      },
      'build': {
        cpuIntensive: true,
        memoryIntensive: true,
        ioIntensive: true,
        networkIntensive: false,
        parallelizable: false,
        avgDurationMinutes: 8,
        resourceRequirements: { cores: 4, memory: 8 }
      },
      'deploy': {
        cpuIntensive: false,
        memoryIntensive: false,
        ioIntensive: false,
        networkIntensive: true,
        parallelizable: false,
        avgDurationMinutes: 12,
        resourceRequirements: { cores: 2, memory: 4 }
      },
      'load-testing': {
        cpuIntensive: true,
        memoryIntensive: true,
        ioIntensive: false,
        networkIntensive: true,
        parallelizable: false,
        avgDurationMinutes: 30,
        resourceRequirements: { cores: 16, memory: 32 }
      }
    };

    this.costOptimizationRules = {
      preferSelfHosted: process.env.PREFER_SELF_HOSTED === 'true',
      maxCostPerWorkflow: parseFloat(process.env.MAX_COST_PER_WORKFLOW) || 5.0,
      costThresholdForUpgrade: 0.5, // Upgrade runner if cost savings > $0.50
      utilizationThreshold: 0.7, // Upgrade if utilization > 70%
      queueTimeThreshold: 300 // Upgrade if queue time > 5 minutes
    };
  }

  /**
   * Analyze workflow requirements and recommend optimal runner allocation
   */
  analyzeWorkflow(workflowConfig) {
    const {
      workloadType,
      estimatedDuration,
      parallelism = 1,
      resourceHints = {},
      priority = 'normal',
      costConstraints = {}
    } = workflowConfig;

    console.log(`Analyzing workflow: ${workloadType}`);
    console.log(`Estimated duration: ${estimatedDuration} minutes`);
    console.log(`Parallelism: ${parallelism}`);
    console.log(`Priority: ${priority}`);

    // Get workload profile
    const profile = this.workloadProfiles[workloadType] || this.workloadProfiles['build'];
    
    // Calculate resource requirements
    const resourceReqs = {
      cores: Math.max(profile.resourceRequirements.cores, resourceHints.cores || 0),
      memory: Math.max(profile.resourceRequirements.memory, resourceHints.memory || 0),
      duration: estimatedDuration || profile.avgDurationMinutes,
      parallelism: parallelism
    };

    // Find suitable runners
    const suitableRunners = this.findSuitableRunners(resourceReqs, workloadType);
    
    // Apply cost optimization
    const optimizedAllocation = this.optimizeForCost(suitableRunners, resourceReqs, costConstraints);
    
    // Apply performance optimization
    const performanceOptimized = this.optimizeForPerformance(optimizedAllocation, resourceReqs, priority);

    return {
      recommendedRunner: performanceOptimized.runner,
      alternativeRunners: performanceOptimized.alternatives,
      resourceUtilization: performanceOptimized.utilization,
      estimatedCost: performanceOptimized.cost,
      reasoning: performanceOptimized.reasoning,
      optimizations: performanceOptimized.optimizations
    };
  }

  /**
   * Find runners that meet the resource requirements
   */
  findSuitableRunners(resourceReqs, workloadType) {
    const suitable = [];

    for (const [runnerType, specs] of Object.entries(this.runnerTypes)) {
      // Check if runner meets minimum requirements
      if (specs.cores >= resourceReqs.cores && specs.memory >= resourceReqs.memory) {
        // Check if runner is optimized for this workload type
        const isOptimized = specs.bestFor.includes(workloadType);
        
        // Calculate efficiency score
        const cpuEfficiency = resourceReqs.cores / specs.cores;
        const memoryEfficiency = resourceReqs.memory / specs.memory;
        const overallEfficiency = (cpuEfficiency + memoryEfficiency) / 2;
        
        // Calculate cost for this workload
        const estimatedCost = specs.costPerMinute * resourceReqs.duration * resourceReqs.parallelism;
        
        suitable.push({
          runnerType,
          specs,
          isOptimized,
          efficiency: overallEfficiency,
          estimatedCost,
          score: this.calculateRunnerScore(specs, resourceReqs, isOptimized, overallEfficiency)
        });
      }
    }

    // Sort by score (higher is better)
    return suitable.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate a score for runner suitability
   */
  calculateRunnerScore(specs, resourceReqs, isOptimized, efficiency) {
    let score = 0;

    // Efficiency score (0-40 points)
    score += efficiency * 40;

    // Cost efficiency (0-30 points)
    const costEfficiency = 1 / (specs.costPerMinute + 0.001); // Avoid division by zero
    score += Math.min(costEfficiency * 10, 30);

    // Workload optimization bonus (0-20 points)
    if (isOptimized) {
      score += 20;
    }

    // Availability score (0-10 points)
    const availabilityScore = Math.min(specs.maxConcurrency / 10, 1) * 10;
    score += availabilityScore;

    return score;
  }

  /**
   * Optimize runner selection for cost
   */
  optimizeForCost(suitableRunners, resourceReqs, costConstraints) {
    if (suitableRunners.length === 0) {
      throw new Error('No suitable runners found for the given requirements');
    }

    const maxCost = costConstraints.maxCost || this.costOptimizationRules.maxCostPerWorkflow;
    
    // Filter runners within cost constraints
    const affordableRunners = suitableRunners.filter(runner => 
      runner.estimatedCost <= maxCost
    );

    if (affordableRunners.length === 0) {
      console.warn(`No runners within cost constraint of $${maxCost}. Using cheapest available.`);
      return suitableRunners[suitableRunners.length - 1]; // Cheapest (lowest score due to cost)
    }

    // Prefer self-hosted if configured and available
    if (this.costOptimizationRules.preferSelfHosted) {
      const selfHostedRunners = affordableRunners.filter(runner => 
        runner.runnerType.startsWith('self-hosted')
      );
      
      if (selfHostedRunners.length > 0) {
        return selfHostedRunners[0]; // Best self-hosted option
      }
    }

    return affordableRunners[0]; // Best affordable option
  }

  /**
   * Optimize runner selection for performance
   */
  optimizeForPerformance(selectedRunner, resourceReqs, priority) {
    const runner = selectedRunner.runnerType;
    const specs = selectedRunner.specs;
    
    // Calculate resource utilization
    const cpuUtilization = resourceReqs.cores / specs.cores;
    const memoryUtilization = resourceReqs.memory / specs.memory;
    const overallUtilization = Math.max(cpuUtilization, memoryUtilization);

    // Generate optimization recommendations
    const optimizations = [];
    
    if (overallUtilization < 0.3) {
      optimizations.push({
        type: 'downgrade',
        message: 'Consider using a smaller runner to reduce costs',
        potentialSavings: (specs.costPerMinute * 0.5 * resourceReqs.duration).toFixed(2)
      });
    }
    
    if (overallUtilization > 0.9) {
      optimizations.push({
        type: 'upgrade',
        message: 'Consider using a larger runner to improve performance',
        performanceGain: '20-30% faster execution expected'
      });
    }

    if (resourceReqs.parallelism > 1 && specs.cores >= resourceReqs.parallelism * 2) {
      optimizations.push({
        type: 'parallelization',
        message: 'Runner has sufficient cores for parallel execution',
        recommendation: `Use ${Math.min(specs.cores, resourceReqs.parallelism * 2)} parallel jobs`
      });
    }

    // Generate reasoning
    const reasoning = [
      `Selected ${runner} based on resource requirements (${resourceReqs.cores} cores, ${resourceReqs.memory}GB memory)`,
      `Estimated cost: $${selectedRunner.estimatedCost.toFixed(3)} for ${resourceReqs.duration} minutes`,
      `Resource utilization: CPU ${(cpuUtilization * 100).toFixed(1)}%, Memory ${(memoryUtilization * 100).toFixed(1)}%`
    ];

    if (selectedRunner.isOptimized) {
      reasoning.push('Runner is optimized for this workload type');
    }

    return {
      runner,
      alternatives: this.getAlternativeRunners(selectedRunner, resourceReqs),
      utilization: {
        cpu: cpuUtilization,
        memory: memoryUtilization,
        overall: overallUtilization
      },
      cost: selectedRunner.estimatedCost,
      reasoning,
      optimizations
    };
  }

  /**
   * Get alternative runner recommendations
   */
  getAlternativeRunners(selectedRunner, resourceReqs) {
    const alternatives = [];
    
    // Find cheaper alternative
    const cheaperRunners = Object.entries(this.runnerTypes)
      .filter(([type, specs]) => 
        specs.costPerMinute < selectedRunner.specs.costPerMinute &&
        specs.cores >= resourceReqs.cores &&
        specs.memory >= resourceReqs.memory
      )
      .sort((a, b) => a[1].costPerMinute - b[1].costPerMinute);

    if (cheaperRunners.length > 0) {
      const [type, specs] = cheaperRunners[0];
      alternatives.push({
        type,
        reason: 'cost-optimization',
        savings: ((selectedRunner.specs.costPerMinute - specs.costPerMinute) * resourceReqs.duration).toFixed(3),
        tradeoff: 'May have lower performance'
      });
    }

    // Find performance alternative
    const fasterRunners = Object.entries(this.runnerTypes)
      .filter(([type, specs]) => 
        specs.cores > selectedRunner.specs.cores &&
        specs.memory >= resourceReqs.memory
      )
      .sort((a, b) => b[1].cores - a[1].cores);

    if (fasterRunners.length > 0) {
      const [type, specs] = fasterRunners[0];
      alternatives.push({
        type,
        reason: 'performance-optimization',
        additionalCost: ((specs.costPerMinute - selectedRunner.specs.costPerMinute) * resourceReqs.duration).toFixed(3),
        benefit: 'Faster execution, better for time-critical workflows'
      });
    }

    return alternatives;
  }

  /**
   * Generate runner allocation configuration for GitHub Actions
   */
  generateRunnerConfig(workflowConfigs) {
    const allocations = {};
    const summary = {
      totalEstimatedCost: 0,
      runnerDistribution: {},
      optimizationOpportunities: []
    };

    for (const [jobName, config] of Object.entries(workflowConfigs)) {
      const allocation = this.analyzeWorkflow(config);
      allocations[jobName] = allocation;
      
      summary.totalEstimatedCost += allocation.estimatedCost;
      
      const runnerType = allocation.recommendedRunner;
      summary.runnerDistribution[runnerType] = (summary.runnerDistribution[runnerType] || 0) + 1;
      
      if (allocation.optimizations.length > 0) {
        summary.optimizationOpportunities.push({
          job: jobName,
          optimizations: allocation.optimizations
        });
      }
    }

    return {
      allocations,
      summary,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Dynamic runner selection based on real-time conditions
   */
  selectOptimalRunner(workflowConfig, currentConditions = {}) {
    const {
      workloadType,
      estimatedDuration,
      parallelism = 1,
      resourceHints = {},
      priority = 'normal'
    } = workflowConfig;

    const {
      queueTimes = {},
      runnerAvailability = {},
      currentCosts = {},
      timeOfDay = new Date().getHours()
    } = currentConditions;

    console.log(`Selecting optimal runner for ${workloadType} at ${timeOfDay}:00`);

    // Get base recommendation
    const baseRecommendation = this.analyzeWorkflow(workflowConfig);
    
    // Apply dynamic adjustments
    const dynamicAdjustments = this.applyDynamicAdjustments(
      baseRecommendation,
      currentConditions,
      priority
    );

    return {
      ...baseRecommendation,
      dynamicAdjustments,
      selectedAt: new Date().toISOString(),
      conditions: currentConditions
    };
  }

  /**
   * Apply dynamic adjustments based on current conditions
   */
  applyDynamicAdjustments(baseRecommendation, conditions, priority) {
    const adjustments = {
      runnerChanged: false,
      reasonForChange: null,
      originalRunner: baseRecommendation.recommendedRunner,
      adjustedRunner: baseRecommendation.recommendedRunner,
      costImpact: 0,
      performanceImpact: 'none'
    };

    const { queueTimes = {}, runnerAvailability = {}, timeOfDay = 12 } = conditions;
    const currentRunner = baseRecommendation.recommendedRunner;

    // Check queue times for current runner
    const currentQueueTime = queueTimes[currentRunner] || 0;
    if (currentQueueTime > 10 && priority === 'critical') {
      // Find alternative with lower queue time
      const alternatives = baseRecommendation.alternativeRunners
        .filter(alt => (queueTimes[alt.type] || 0) < currentQueueTime / 2)
        .sort((a, b) => (queueTimes[a.type] || 0) - (queueTimes[b.type] || 0));

      if (alternatives.length > 0) {
        adjustments.runnerChanged = true;
        adjustments.adjustedRunner = alternatives[0].type;
        adjustments.reasonForChange = `High queue time (${currentQueueTime}min) for critical workflow`;
        adjustments.performanceImpact = 'improved';
      }
    }

    // Check availability constraints
    const availability = runnerAvailability[currentRunner] || 1.0;
    if (availability < 0.3) {
      // Find alternative with better availability
      const alternatives = baseRecommendation.alternativeRunners
        .filter(alt => (runnerAvailability[alt.type] || 1.0) > 0.7)
        .sort((a, b) => (runnerAvailability[b.type] || 1.0) - (runnerAvailability[a.type] || 1.0));

      if (alternatives.length > 0) {
        adjustments.runnerChanged = true;
        adjustments.adjustedRunner = alternatives[0].type;
        adjustments.reasonForChange = `Low availability (${(availability * 100).toFixed(1)}%) for ${currentRunner}`;
      }
    }

    // Peak hours optimization (reduce costs during high-usage periods)
    if (timeOfDay >= 9 && timeOfDay <= 17 && priority !== 'critical') {
      // During business hours, prefer cost-effective runners
      const costEffectiveAlternatives = baseRecommendation.alternativeRunners
        .filter(alt => alt.reason === 'cost-optimization')
        .sort((a, b) => parseFloat(b.savings) - parseFloat(a.savings));

      if (costEffectiveAlternatives.length > 0 && !adjustments.runnerChanged) {
        const alternative = costEffectiveAlternatives[0];
        adjustments.runnerChanged = true;
        adjustments.adjustedRunner = alternative.type;
        adjustments.reasonForChange = `Peak hours cost optimization (save $${alternative.savings})`;
        adjustments.costImpact = -parseFloat(alternative.savings);
        adjustments.performanceImpact = 'minimal';
      }
    }

    return adjustments;
  }

  /**
   * Generate runner allocation policies
   */
  generateAllocationPolicies() {
    return {
      policies: {
        'cost-optimization': {
          name: 'Cost Optimization Policy',
          description: 'Minimize costs while maintaining acceptable performance',
          rules: [
            'Prefer smaller runners during off-peak hours (18:00-08:00 UTC)',
            'Use self-hosted runners for workloads > 30 minutes when available',
            'Downgrade runners when utilization < 40% for 3+ consecutive runs',
            'Batch similar workloads to maximize runner utilization'
          ],
          triggers: ['low-utilization', 'high-cost-period', 'batch-opportunity'],
          maxCostIncrease: 0.05 // 5% max cost increase for performance
        },
        'performance-optimization': {
          name: 'Performance Optimization Policy',
          description: 'Maximize performance for time-critical workflows',
          rules: [
            'Use largest available runners for critical workflows',
            'Upgrade runners when queue time > 5 minutes',
            'Parallelize workloads across multiple runners when beneficial',
            'Reserve high-performance runners for production deployments'
          ],
          triggers: ['high-queue-time', 'critical-priority', 'production-deployment'],
          maxCostIncrease: 0.25 // 25% max cost increase acceptable
        },
        'balanced': {
          name: 'Balanced Policy',
          description: 'Balance cost and performance based on workload characteristics',
          rules: [
            'Right-size runners based on actual resource usage',
            'Upgrade runners when utilization > 80%',
            'Downgrade runners when utilization < 30%',
            'Consider queue times and availability in selection'
          ],
          triggers: ['utilization-threshold', 'queue-time-threshold'],
          maxCostIncrease: 0.15 // 15% max cost increase
        }
      },
      defaultPolicy: 'balanced',
      policySelection: {
        'unit-tests': 'cost-optimization',
        'integration-tests': 'balanced',
        'e2e-tests': 'balanced',
        'security-scans': 'balanced',
        'performance-tests': 'performance-optimization',
        'build': 'balanced',
        'deploy': 'performance-optimization',
        'load-testing': 'performance-optimization'
      }
    };
  }

  /**
   * Track resource allocation decisions and outcomes
   */
  trackAllocationDecision(decision, outcome = null) {
    const tracking = {
      timestamp: new Date().toISOString(),
      workloadType: decision.workloadType,
      selectedRunner: decision.recommendedRunner,
      dynamicAdjustments: decision.dynamicAdjustments,
      estimatedCost: decision.estimatedCost,
      actualOutcome: outcome
    };

    // In a real implementation, this would store to a database or file
    console.log('Tracking allocation decision:', JSON.stringify(tracking, null, 2));
    
    return tracking;
  }

  /**
   * Monitor resource usage and generate recommendations
   */
  async monitorResourceUsage(workflowRunData) {
    const usage = {
      runnerUtilization: {},
      costAnalysis: {},
      performanceMetrics: {},
      recommendations: []
    };

    // Analyze runner utilization
    for (const [runnerType, runs] of Object.entries(workflowRunData)) {
      const specs = this.runnerTypes[runnerType];
      if (!specs) continue;

      const totalRuns = runs.length;
      const avgDuration = runs.reduce((sum, run) => sum + run.duration, 0) / totalRuns;
      const totalCost = runs.reduce((sum, run) => sum + (run.duration * specs.costPerMinute), 0);
      
      // Calculate utilization metrics
      const avgCpuUtilization = runs.reduce((sum, run) => sum + (run.cpuUsage || 0.5), 0) / totalRuns;
      const avgMemoryUtilization = runs.reduce((sum, run) => sum + (run.memoryUsage || 0.5), 0) / totalRuns;
      
      usage.runnerUtilization[runnerType] = {
        totalRuns,
        avgDuration,
        avgCpuUtilization,
        avgMemoryUtilization,
        utilizationScore: (avgCpuUtilization + avgMemoryUtilization) / 2
      };

      usage.costAnalysis[runnerType] = {
        totalCost,
        avgCostPerRun: totalCost / totalRuns,
        costPerMinute: specs.costPerMinute
      };

      // Generate recommendations based on utilization
      if (avgCpuUtilization < 0.3 && avgMemoryUtilization < 0.3) {
        usage.recommendations.push({
          type: 'cost-optimization',
          runnerType,
          message: `${runnerType} is underutilized (CPU: ${(avgCpuUtilization * 100).toFixed(1)}%, Memory: ${(avgMemoryUtilization * 100).toFixed(1)}%)`,
          suggestion: 'Consider using a smaller runner type',
          potentialSavings: (totalCost * 0.3).toFixed(2)
        });
      }

      if (avgCpuUtilization > 0.9 || avgMemoryUtilization > 0.9) {
        usage.recommendations.push({
          type: 'performance-optimization',
          runnerType,
          message: `${runnerType} is highly utilized (CPU: ${(avgCpuUtilization * 100).toFixed(1)}%, Memory: ${(avgMemoryUtilization * 100).toFixed(1)}%)`,
          suggestion: 'Consider using a larger runner type',
          expectedImprovement: '20-30% faster execution'
        });
      }
    }

    return usage;
  }

  /**
   * Generate resource monitoring report
   */
  generateMonitoringReport(usageData, timeframe = '24h') {
    const report = {
      timeframe,
      generatedAt: new Date().toISOString(),
      summary: {
        totalCost: 0,
        totalRuns: 0,
        avgUtilization: 0,
        recommendationCount: usageData.recommendations.length
      },
      details: usageData,
      actionItems: []
    };

    // Calculate summary metrics
    for (const [runnerType, cost] of Object.entries(usageData.costAnalysis)) {
      report.summary.totalCost += cost.totalCost;
    }

    for (const [runnerType, util] of Object.entries(usageData.runnerUtilization)) {
      report.summary.totalRuns += util.totalRuns;
      report.summary.avgUtilization += util.utilizationScore;
    }

    const runnerCount = Object.keys(usageData.runnerUtilization).length;
    if (runnerCount > 0) {
      report.summary.avgUtilization /= runnerCount;
    }

    // Generate action items
    const highImpactRecommendations = usageData.recommendations
      .filter(rec => rec.potentialSavings > 1.0 || rec.type === 'performance-optimization')
      .sort((a, b) => (parseFloat(b.potentialSavings) || 0) - (parseFloat(a.potentialSavings) || 0));

    report.actionItems = highImpactRecommendations.slice(0, 5).map(rec => ({
      priority: rec.potentialSavings > 5.0 ? 'high' : 'medium',
      action: rec.suggestion,
      impact: rec.potentialSavings ? `$${rec.potentialSavings} savings` : rec.expectedImprovement,
      runnerType: rec.runnerType
    }));

    return report;
  }
}

// CLI Interface
if (require.main === module) {
  const optimizer = new RunnerAllocationOptimizer();
  
  const command = process.argv[2];
  const configFile = process.argv[3];

  switch (command) {
    case 'analyze':
      if (!configFile) {
        console.error('Usage: node runner-allocation-optimizer.js analyze <config-file>');
        process.exit(1);
      }
      
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const result = optimizer.generateRunnerConfig(config);
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Error analyzing configuration:', error.message);
        process.exit(1);
      }
      break;

    case 'monitor':
      if (!configFile) {
        console.error('Usage: node runner-allocation-optimizer.js monitor <usage-data-file>');
        process.exit(1);
      }
      
      try {
        const usageData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const report = optimizer.generateMonitoringReport(usageData);
        console.log(JSON.stringify(report, null, 2));
      } catch (error) {
        console.error('Error generating monitoring report:', error.message);
        process.exit(1);
      }
      break;

    case 'recommend':
      const workloadType = process.argv[3];
      const duration = parseInt(process.argv[4]) || 10;
      const parallelism = parseInt(process.argv[5]) || 1;
      
      if (!workloadType) {
        console.error('Usage: node runner-allocation-optimizer.js recommend <workload-type> [duration] [parallelism]');
        console.error('Available workload types:', Object.keys(optimizer.workloadProfiles).join(', '));
        process.exit(1);
      }
      
      const recommendation = optimizer.analyzeWorkflow({
        workloadType,
        estimatedDuration: duration,
        parallelism
      });
      
      console.log(JSON.stringify(recommendation, null, 2));
      break;

    case 'select':
      const selectWorkloadType = process.argv[3];
      const selectDuration = parseInt(process.argv[4]) || 10;
      const conditionsFile = process.argv[5];
      
      if (!selectWorkloadType) {
        console.error('Usage: node runner-allocation-optimizer.js select <workload-type> [duration] [conditions-file]');
        console.error('Available workload types:', Object.keys(optimizer.workloadProfiles).join(', '));
        process.exit(1);
      }
      
      let conditions = {};
      if (conditionsFile && fs.existsSync(conditionsFile)) {
        conditions = JSON.parse(fs.readFileSync(conditionsFile, 'utf8'));
      }
      
      const selection = optimizer.selectOptimalRunner({
        workloadType: selectWorkloadType,
        estimatedDuration: selectDuration,
        parallelism: 1
      }, conditions);
      
      console.log(JSON.stringify(selection, null, 2));
      break;

    case 'policies':
      const policies = optimizer.generateAllocationPolicies();
      console.log(JSON.stringify(policies, null, 2));
      break;

    default:
      console.log('GitHub Actions Runner Allocation Optimizer');
      console.log('');
      console.log('Commands:');
      console.log('  analyze <config-file>     - Analyze workflow configuration and recommend runners');
      console.log('  monitor <usage-data>      - Monitor resource usage and generate recommendations');
      console.log('  recommend <workload> [duration] [parallelism] - Get runner recommendation for specific workload');
      console.log('  select <workload> [duration] [conditions-file] - Dynamic runner selection with current conditions');
      console.log('  policies                  - Generate runner allocation policies');
      console.log('');
      console.log('Available workload types:');
      Object.keys(optimizer.workloadProfiles).forEach(type => {
        console.log(`  - ${type}`);
      });
      console.log('');
      console.log('Environment Variables:');
      console.log('  PREFER_SELF_HOSTED       - Prefer self-hosted runners (true/false)');
      console.log('  MAX_COST_PER_WORKFLOW     - Maximum cost per workflow ($)');
      break;
  }
}

module.exports = RunnerAllocationOptimizer;