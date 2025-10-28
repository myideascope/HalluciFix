#!/usr/bin/env node

/**
 * GitHub Actions Cost Optimization System
 * 
 * Analyzes workflow costs and provides optimization recommendations
 * to reduce CI/CD expenses while maintaining performance.
 */

const fs = require('fs');
const path = require('path');

class CostOptimizer {
  constructor() {
    this.runnerCosts = {
      'ubuntu-latest': { costPerMinute: 0.008, cores: 2, memory: 7 },
      'ubuntu-latest-4-cores': { costPerMinute: 0.016, cores: 4, memory: 16 },
      'ubuntu-latest-8-cores': { costPerMinute: 0.032, cores: 8, memory: 32 },
      'ubuntu-latest-16-cores': { costPerMinute: 0.064, cores: 16, memory: 64 },
      'windows-latest': { costPerMinute: 0.016, cores: 2, memory: 7 },
      'macos-latest': { costPerMinute: 0.08, cores: 3, memory: 14 },
      'self-hosted-small': { costPerMinute: 0.004, cores: 2, memory: 4 },
      'self-hosted-medium': { costPerMinute: 0.008, cores: 4, memory: 8 },
      'self-hosted-large': { costPerMinute: 0.016, cores: 8, memory: 16 }
    };

    this.optimizationStrategies = {
      'runner-rightsizing': {
        name: 'Runner Rightsizing',
        description: 'Optimize runner size based on actual resource usage',
        impact: 'high',
        effort: 'low'
      },
      'workflow-parallelization': {
        name: 'Workflow Parallelization',
        description: 'Parallelize jobs to reduce total execution time',
        impact: 'medium',
        effort: 'medium'
      },
      'caching-optimization': {
        name: 'Caching Optimization',
        description: 'Improve caching to reduce build times',
        impact: 'medium',
        effort: 'low'
      },
      'conditional-execution': {
        name: 'Conditional Execution',
        description: 'Skip unnecessary jobs based on changes',
        impact: 'high',
        effort: 'medium'
      },
      'self-hosted-migration': {
        name: 'Self-hosted Migration',
        description: 'Migrate to self-hosted runners for cost savings',
        impact: 'high',
        effort: 'high'
      },
      'workflow-consolidation': {
        name: 'Workflow Consolidation',
        description: 'Combine related workflows to reduce overhead',
        impact: 'medium',
        effort: 'medium'
      }
    };

    this.costTargets = {
      daily: 50.0,    // $50/day
      weekly: 300.0,  // $300/week
      monthly: 1200.0 // $1200/month
    };
  }

  /**
   * Analyze workflow costs and identify optimization opportunities
   */
  analyzeCosts(workflowData, timeframeDays = 30) {
    console.log(`Analyzing costs for ${timeframeDays} days of workflow data`);
    
    const analysis = {
      summary: this.calculateCostSummary(workflowData, timeframeDays),
      breakdown: this.generateCostBreakdown(workflowData),
      trends: this.analyzeCostTrends(workflowData, timeframeDays),
      inefficiencies: this.identifyInefficiencies(workflowData),
      optimizations: this.generateOptimizations(workflowData),
      projections: this.projectCosts(workflowData, timeframeDays)
    };

    return analysis;
  }

  /**
   * Calculate cost summary statistics
   */
  calculateCostSummary(workflowData, timeframeDays) {
    let totalCost = 0;
    let totalMinutes = 0;
    let totalRuns = 0;

    for (const workflow of workflowData.workflows) {
      for (const run of workflow.runs) {
        const runnerCost = this.runnerCosts[run.runnerType] || this.runnerCosts['ubuntu-latest'];
        const cost = run.durationMinutes * runnerCost.costPerMinute;
        totalCost += cost;
        totalMinutes += run.durationMinutes;
        totalRuns++;
      }
    }

    const dailyAverage = totalCost / timeframeDays;
    const weeklyProjection = dailyAverage * 7;
    const monthlyProjection = dailyAverage * 30;

    return {
      totalCost: parseFloat(totalCost.toFixed(2)),
      totalMinutes: Math.round(totalMinutes),
      totalRuns,
      avgCostPerRun: parseFloat((totalCost / totalRuns).toFixed(3)),
      avgCostPerMinute: parseFloat((totalCost / totalMinutes).toFixed(4)),
      dailyAverage: parseFloat(dailyAverage.toFixed(2)),
      weeklyProjection: parseFloat(weeklyProjection.toFixed(2)),
      monthlyProjection: parseFloat(monthlyProjection.toFixed(2)),
      timeframeDays,
      costTargets: this.costTargets,
      targetStatus: {
        daily: dailyAverage <= this.costTargets.daily ? 'within' : 'over',
        weekly: weeklyProjection <= this.costTargets.weekly ? 'within' : 'over',
        monthly: monthlyProjection <= this.costTargets.monthly ? 'within' : 'over'
      }
    };
  }

  /**
   * Generate detailed cost breakdown
   */
  generateCostBreakdown(workflowData) {
    const breakdown = {
      byWorkflow: {},
      byRunner: {},
      byTimeOfDay: {},
      byDayOfWeek: {}
    };

    // Initialize structures
    for (let hour = 0; hour < 24; hour++) {
      breakdown.byTimeOfDay[hour] = { cost: 0, runs: 0 };
    }

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const day of daysOfWeek) {
      breakdown.byDayOfWeek[day] = { cost: 0, runs: 0 };
    }

    // Process workflow data
    for (const workflow of workflowData.workflows) {
      breakdown.byWorkflow[workflow.name] = {
        cost: 0,
        runs: 0,
        avgDuration: 0,
        totalMinutes: 0
      };

      for (const run of workflow.runs) {
        const runnerCost = this.runnerCosts[run.runnerType] || this.runnerCosts['ubuntu-latest'];
        const cost = run.durationMinutes * runnerCost.costPerMinute;

        // By workflow
        breakdown.byWorkflow[workflow.name].cost += cost;
        breakdown.byWorkflow[workflow.name].runs++;
        breakdown.byWorkflow[workflow.name].totalMinutes += run.durationMinutes;

        // By runner
        if (!breakdown.byRunner[run.runnerType]) {
          breakdown.byRunner[run.runnerType] = { cost: 0, runs: 0, totalMinutes: 0 };
        }
        breakdown.byRunner[run.runnerType].cost += cost;
        breakdown.byRunner[run.runnerType].runs++;
        breakdown.byRunner[run.runnerType].totalMinutes += run.durationMinutes;

        // By time of day (if timestamp available)
        if (run.startTime) {
          const hour = new Date(run.startTime).getHours();
          breakdown.byTimeOfDay[hour].cost += cost;
          breakdown.byTimeOfDay[hour].runs++;
        }

        // By day of week (if timestamp available)
        if (run.startTime) {
          const dayOfWeek = daysOfWeek[new Date(run.startTime).getDay()];
          breakdown.byDayOfWeek[dayOfWeek].cost += cost;
          breakdown.byDayOfWeek[dayOfWeek].runs++;
        }
      }

      // Calculate averages
      if (breakdown.byWorkflow[workflow.name].runs > 0) {
        breakdown.byWorkflow[workflow.name].avgDuration = 
          breakdown.byWorkflow[workflow.name].totalMinutes / breakdown.byWorkflow[workflow.name].runs;
      }
    }

    // Round costs
    for (const workflow of Object.values(breakdown.byWorkflow)) {
      workflow.cost = parseFloat(workflow.cost.toFixed(2));
      workflow.avgDuration = Math.round(workflow.avgDuration);
    }

    for (const runner of Object.values(breakdown.byRunner)) {
      runner.cost = parseFloat(runner.cost.toFixed(2));
    }

    return breakdown;
  }

  /**
   * Analyze cost trends
   */
  analyzeCostTrends(workflowData, timeframeDays) {
    const trends = {
      overall: 'stable',
      byWorkflow: {},
      peakHours: [],
      costSpikes: [],
      seasonality: 'none'
    };

    // Simple trend analysis (in a real implementation, this would be more sophisticated)
    const dailyCosts = this.calculateDailyCosts(workflowData, timeframeDays);
    
    if (dailyCosts.length >= 7) {
      const firstWeekAvg = dailyCosts.slice(0, 7).reduce((sum, cost) => sum + cost, 0) / 7;
      const lastWeekAvg = dailyCosts.slice(-7).reduce((sum, cost) => sum + cost, 0) / 7;
      
      const changePercent = ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100;
      
      if (changePercent > 20) {
        trends.overall = 'increasing';
      } else if (changePercent < -20) {
        trends.overall = 'decreasing';
      }
    }

    // Identify peak hours
    const hourlyTotals = {};
    for (let hour = 0; hour < 24; hour++) {
      hourlyTotals[hour] = 0;
    }

    for (const workflow of workflowData.workflows) {
      for (const run of workflow.runs) {
        if (run.startTime) {
          const hour = new Date(run.startTime).getHours();
          const runnerCost = this.runnerCosts[run.runnerType] || this.runnerCosts['ubuntu-latest'];
          hourlyTotals[hour] += run.durationMinutes * runnerCost.costPerMinute;
        }
      }
    }

    const avgHourlyCost = Object.values(hourlyTotals).reduce((sum, cost) => sum + cost, 0) / 24;
    trends.peakHours = Object.entries(hourlyTotals)
      .filter(([hour, cost]) => cost > avgHourlyCost * 1.5)
      .map(([hour, cost]) => ({ hour: parseInt(hour), cost: parseFloat(cost.toFixed(2)) }))
      .sort((a, b) => b.cost - a.cost);

    return trends;
  }

  /**
   * Calculate daily costs
   */
  calculateDailyCosts(workflowData, timeframeDays) {
    const dailyCosts = new Array(timeframeDays).fill(0);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    for (const workflow of workflowData.workflows) {
      for (const run of workflow.runs) {
        if (run.startTime) {
          const runDate = new Date(run.startTime);
          const dayIndex = Math.floor((runDate - startDate) / (1000 * 60 * 60 * 24));
          
          if (dayIndex >= 0 && dayIndex < timeframeDays) {
            const runnerCost = this.runnerCosts[run.runnerType] || this.runnerCosts['ubuntu-latest'];
            const cost = run.durationMinutes * runnerCost.costPerMinute;
            dailyCosts[dayIndex] += cost;
          }
        }
      }
    }

    return dailyCosts;
  }

  /**
   * Identify cost inefficiencies
   */
  identifyInefficiencies(workflowData) {
    const inefficiencies = [];

    for (const workflow of workflowData.workflows) {
      const workflowAnalysis = this.analyzeWorkflowEfficiency(workflow);
      inefficiencies.push(...workflowAnalysis);
    }

    return inefficiencies.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  /**
   * Analyze individual workflow efficiency
   */
  analyzeWorkflowEfficiency(workflow) {
    const inefficiencies = [];
    const runs = workflow.runs;
    
    if (runs.length === 0) return inefficiencies;

    // Calculate statistics
    const avgDuration = runs.reduce((sum, run) => sum + run.durationMinutes, 0) / runs.length;
    const totalCost = runs.reduce((sum, run) => {
      const runnerCost = this.runnerCosts[run.runnerType] || this.runnerCosts['ubuntu-latest'];
      return sum + (run.durationMinutes * runnerCost.costPerMinute);
    }, 0);

    // Check for oversized runners
    const runnerUsage = {};
    for (const run of runs) {
      if (!runnerUsage[run.runnerType]) {
        runnerUsage[run.runnerType] = { count: 0, totalMinutes: 0 };
      }
      runnerUsage[run.runnerType].count++;
      runnerUsage[run.runnerType].totalMinutes += run.durationMinutes;
    }

    for (const [runnerType, usage] of Object.entries(runnerUsage)) {
      const runnerSpec = this.runnerCosts[runnerType];
      if (!runnerSpec) continue;

      // Check if we could use a smaller runner
      const avgUtilization = this.estimateUtilization(workflow.name, runnerType);
      if (avgUtilization < 0.4 && runnerSpec.cores > 2) {
        const smallerRunner = this.findSmallerRunner(runnerType);
        if (smallerRunner) {
          const currentCost = usage.totalMinutes * runnerSpec.costPerMinute;
          const newCost = usage.totalMinutes * this.runnerCosts[smallerRunner].costPerMinute;
          const savings = currentCost - newCost;

          if (savings > 1.0) { // Only suggest if savings > $1
            inefficiencies.push({
              type: 'oversized-runner',
              workflow: workflow.name,
              description: `${runnerType} appears oversized for ${workflow.name}`,
              currentRunner: runnerType,
              suggestedRunner: smallerRunner,
              potentialSavings: parseFloat(savings.toFixed(2)),
              confidence: avgUtilization < 0.3 ? 'high' : 'medium'
            });
          }
        }
      }
    }

    // Check for long-running workflows
    if (avgDuration > 45) {
      inefficiencies.push({
        type: 'long-duration',
        workflow: workflow.name,
        description: `${workflow.name} has long average duration (${Math.round(avgDuration)} minutes)`,
        avgDuration: Math.round(avgDuration),
        suggestion: 'Consider parallelization or optimization',
        potentialSavings: totalCost * 0.2, // Assume 20% savings from optimization
        confidence: 'medium'
      });
    }

    // Check for frequent failures (waste of resources)
    const failureRate = runs.filter(run => run.status === 'failure').length / runs.length;
    if (failureRate > 0.15) {
      const failedCost = runs
        .filter(run => run.status === 'failure')
        .reduce((sum, run) => {
          const runnerCost = this.runnerCosts[run.runnerType] || this.runnerCosts['ubuntu-latest'];
          return sum + (run.durationMinutes * runnerCost.costPerMinute);
        }, 0);

      inefficiencies.push({
        type: 'high-failure-rate',
        workflow: workflow.name,
        description: `${workflow.name} has high failure rate (${(failureRate * 100).toFixed(1)}%)`,
        failureRate: parseFloat((failureRate * 100).toFixed(1)),
        wastedCost: parseFloat(failedCost.toFixed(2)),
        potentialSavings: failedCost * 0.8, // Assume 80% of failed runs could be prevented
        confidence: 'high'
      });
    }

    return inefficiencies;
  }

  /**
   * Estimate resource utilization for a workflow/runner combination
   */
  estimateUtilization(workflowName, runnerType) {
    // This is a simplified estimation. In a real implementation,
    // this would use actual resource monitoring data
    const utilizationEstimates = {
      'unit-tests': 0.4,
      'integration-tests': 0.7,
      'e2e-tests': 0.6,
      'security-scan': 0.5,
      'build': 0.8,
      'deploy': 0.3,
      'performance': 0.9
    };

    // Try to match workflow name to type
    for (const [type, utilization] of Object.entries(utilizationEstimates)) {
      if (workflowName.toLowerCase().includes(type)) {
        return utilization;
      }
    }

    // Default utilization based on runner size
    const runnerSpec = this.runnerCosts[runnerType];
    if (runnerSpec && runnerSpec.cores >= 8) {
      return 0.5; // Large runners often underutilized
    }

    return 0.6; // Default moderate utilization
  }

  /**
   * Find a smaller runner alternative
   */
  findSmallerRunner(currentRunner) {
    const currentSpec = this.runnerCosts[currentRunner];
    if (!currentSpec) return null;

    const alternatives = Object.entries(this.runnerCosts)
      .filter(([type, spec]) => 
        spec.cores < currentSpec.cores && 
        spec.costPerMinute < currentSpec.costPerMinute &&
        !type.includes('windows') && 
        !type.includes('macos') // Keep same OS family
      )
      .sort((a, b) => b[1].cores - a[1].cores); // Largest smaller runner first

    return alternatives.length > 0 ? alternatives[0][0] : null;
  }

  /**
   * Generate optimization recommendations
   */
  generateOptimizations(workflowData) {
    const optimizations = [];
    const inefficiencies = this.identifyInefficiencies(workflowData);

    // Group inefficiencies by type and generate optimizations
    const inefficiencyGroups = {};
    for (const inefficiency of inefficiencies) {
      if (!inefficiencyGroups[inefficiency.type]) {
        inefficiencyGroups[inefficiency.type] = [];
      }
      inefficiencyGroups[inefficiency.type].push(inefficiency);
    }

    // Generate optimization recommendations
    for (const [type, items] of Object.entries(inefficiencyGroups)) {
      const totalSavings = items.reduce((sum, item) => sum + item.potentialSavings, 0);
      
      if (totalSavings > 5.0) { // Only recommend if savings > $5
        const optimization = this.createOptimizationRecommendation(type, items, totalSavings);
        if (optimization) {
          optimizations.push(optimization);
        }
      }
    }

    // Add general optimization strategies
    optimizations.push(...this.generateGeneralOptimizations(workflowData));

    return optimizations.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  /**
   * Create optimization recommendation for specific inefficiency type
   */
  createOptimizationRecommendation(type, items, totalSavings) {
    const strategy = this.optimizationStrategies[type.replace('-', '_')] || 
                    this.optimizationStrategies['runner-rightsizing'];

    switch (type) {
      case 'oversized-runner':
        return {
          strategy: 'runner-rightsizing',
          title: 'Optimize Runner Sizes',
          description: `${items.length} workflows are using oversized runners`,
          impact: 'high',
          effort: 'low',
          potentialSavings: parseFloat(totalSavings.toFixed(2)),
          affectedWorkflows: items.map(item => item.workflow),
          actions: [
            'Review resource utilization for each workflow',
            'Test workflows with smaller runner types',
            'Update workflow configurations with optimized runners',
            'Monitor performance to ensure no degradation'
          ],
          details: items.slice(0, 5) // Show top 5 examples
        };

      case 'long-duration':
        return {
          strategy: 'workflow-parallelization',
          title: 'Optimize Long-Running Workflows',
          description: `${items.length} workflows have long execution times`,
          impact: 'medium',
          effort: 'medium',
          potentialSavings: parseFloat(totalSavings.toFixed(2)),
          affectedWorkflows: items.map(item => item.workflow),
          actions: [
            'Analyze workflow bottlenecks',
            'Implement job parallelization where possible',
            'Optimize build processes and caching',
            'Consider workflow splitting for independent tasks'
          ],
          details: items.slice(0, 5)
        };

      case 'high-failure-rate':
        return {
          strategy: 'reliability-improvement',
          title: 'Reduce Workflow Failures',
          description: `${items.length} workflows have high failure rates`,
          impact: 'high',
          effort: 'medium',
          potentialSavings: parseFloat(totalSavings.toFixed(2)),
          affectedWorkflows: items.map(item => item.workflow),
          actions: [
            'Investigate common failure causes',
            'Improve error handling and retry logic',
            'Enhance test stability and reliability',
            'Implement better failure notifications'
          ],
          details: items.slice(0, 5)
        };

      default:
        return null;
    }
  }

  /**
   * Generate general optimization recommendations
   */
  generateGeneralOptimizations(workflowData) {
    const optimizations = [];

    // Check if self-hosted runners could be beneficial
    const totalMonthlyCost = this.calculateMonthlyCost(workflowData);
    if (totalMonthlyCost > 500) {
      optimizations.push({
        strategy: 'self-hosted-migration',
        title: 'Consider Self-Hosted Runners',
        description: 'High monthly costs suggest self-hosted runners could provide savings',
        impact: 'high',
        effort: 'high',
        potentialSavings: totalMonthlyCost * 0.4, // Assume 40% savings
        actions: [
          'Evaluate self-hosted runner infrastructure costs',
          'Pilot self-hosted runners for high-volume workflows',
          'Implement proper security and maintenance procedures',
          'Monitor cost savings and performance impact'
        ]
      });
    }

    // Check for caching opportunities
    const buildWorkflows = workflowData.workflows.filter(w => 
      w.name.toLowerCase().includes('build') || 
      w.name.toLowerCase().includes('test')
    );

    if (buildWorkflows.length > 0) {
      const avgBuildTime = buildWorkflows.reduce((sum, w) => {
        const avgDuration = w.runs.reduce((s, r) => s + r.durationMinutes, 0) / w.runs.length;
        return sum + avgDuration;
      }, 0) / buildWorkflows.length;

      if (avgBuildTime > 15) {
        optimizations.push({
          strategy: 'caching-optimization',
          title: 'Improve Build Caching',
          description: 'Build workflows could benefit from better caching strategies',
          impact: 'medium',
          effort: 'low',
          potentialSavings: totalMonthlyCost * 0.15, // Assume 15% savings
          actions: [
            'Implement dependency caching',
            'Cache build artifacts between jobs',
            'Use Docker layer caching where applicable',
            'Optimize cache key strategies'
          ]
        });
      }
    }

    return optimizations;
  }

  /**
   * Calculate monthly cost projection
   */
  calculateMonthlyCost(workflowData) {
    let totalCost = 0;
    let totalDays = 0;

    for (const workflow of workflowData.workflows) {
      for (const run of workflow.runs) {
        const runnerCost = this.runnerCosts[run.runnerType] || this.runnerCosts['ubuntu-latest'];
        totalCost += run.durationMinutes * runnerCost.costPerMinute;
      }
    }

    // Estimate based on data timeframe
    const dataTimeframeDays = workflowData.timeframeDays || 30;
    const dailyAverage = totalCost / dataTimeframeDays;
    
    return dailyAverage * 30; // Monthly projection
  }

  /**
   * Project future costs based on trends
   */
  projectCosts(workflowData, timeframeDays) {
    const currentMonthlyCost = this.calculateMonthlyCost(workflowData);
    const trends = this.analyzeCostTrends(workflowData, timeframeDays);
    
    let growthRate = 0;
    switch (trends.overall) {
      case 'increasing':
        growthRate = 0.1; // 10% monthly growth
        break;
      case 'decreasing':
        growthRate = -0.05; // 5% monthly decrease
        break;
      default:
        growthRate = 0.02; // 2% monthly growth (default)
    }

    const projections = {
      current: parseFloat(currentMonthlyCost.toFixed(2)),
      oneMonth: parseFloat((currentMonthlyCost * (1 + growthRate)).toFixed(2)),
      threeMonths: parseFloat((currentMonthlyCost * Math.pow(1 + growthRate, 3)).toFixed(2)),
      sixMonths: parseFloat((currentMonthlyCost * Math.pow(1 + growthRate, 6)).toFixed(2)),
      oneYear: parseFloat((currentMonthlyCost * Math.pow(1 + growthRate, 12)).toFixed(2)),
      growthRate: parseFloat((growthRate * 100).toFixed(1))
    };

    return projections;
  }

  /**
   * Generate cost optimization report
   */
  generateReport(analysis) {
    const report = {
      title: 'GitHub Actions Cost Optimization Report',
      generatedAt: new Date().toISOString(),
      summary: analysis.summary,
      executiveSummary: this.generateExecutiveSummary(analysis),
      costBreakdown: analysis.breakdown,
      trends: analysis.trends,
      inefficiencies: analysis.inefficiencies.slice(0, 10), // Top 10
      optimizations: analysis.optimizations.slice(0, 5), // Top 5
      projections: analysis.projections,
      actionPlan: this.generateActionPlan(analysis.optimizations),
      roi: this.calculateROI(analysis.optimizations)
    };

    return report;
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary(analysis) {
    const summary = analysis.summary;
    const totalSavings = analysis.optimizations.reduce((sum, opt) => sum + opt.potentialSavings, 0);
    
    return {
      currentMonthlyCost: summary.monthlyProjection,
      potentialMonthlySavings: parseFloat(totalSavings.toFixed(2)),
      savingsPercentage: parseFloat(((totalSavings / summary.monthlyProjection) * 100).toFixed(1)),
      paybackPeriod: totalSavings > 100 ? '< 1 month' : '1-2 months',
      riskLevel: 'low',
      recommendedActions: analysis.optimizations.length,
      keyFindings: [
        `Current monthly spend: $${summary.monthlyProjection}`,
        `Potential savings: $${totalSavings.toFixed(2)} (${((totalSavings / summary.monthlyProjection) * 100).toFixed(1)}%)`,
        `${analysis.inefficiencies.length} optimization opportunities identified`,
        `${analysis.optimizations.filter(opt => opt.effort === 'low').length} quick wins available`
      ]
    };
  }

  /**
   * Generate action plan
   */
  generateActionPlan(optimizations) {
    const plan = {
      immediate: [], // Low effort, high impact
      shortTerm: [], // Medium effort, high impact
      longTerm: []   // High effort, high impact
    };

    for (const optimization of optimizations) {
      const item = {
        title: optimization.title,
        impact: optimization.impact,
        effort: optimization.effort,
        savings: optimization.potentialSavings,
        timeline: this.getTimeline(optimization.effort),
        actions: optimization.actions
      };

      if (optimization.effort === 'low' && optimization.impact === 'high') {
        plan.immediate.push(item);
      } else if (optimization.effort === 'medium') {
        plan.shortTerm.push(item);
      } else {
        plan.longTerm.push(item);
      }
    }

    return plan;
  }

  /**
   * Get timeline based on effort level
   */
  getTimeline(effort) {
    switch (effort) {
      case 'low':
        return '1-2 weeks';
      case 'medium':
        return '1-2 months';
      case 'high':
        return '3-6 months';
      default:
        return '2-4 weeks';
    }
  }

  /**
   * Calculate ROI for optimizations
   */
  calculateROI(optimizations) {
    const totalSavings = optimizations.reduce((sum, opt) => sum + opt.potentialSavings, 0);
    const implementationCost = optimizations.reduce((sum, opt) => {
      // Estimate implementation cost based on effort
      const costs = { low: 500, medium: 2000, high: 5000 };
      return sum + (costs[opt.effort] || 1000);
    }, 0);

    const monthlySavings = totalSavings;
    const paybackMonths = implementationCost / monthlySavings;
    const annualROI = ((monthlySavings * 12 - implementationCost) / implementationCost) * 100;

    return {
      totalPotentialSavings: parseFloat(totalSavings.toFixed(2)),
      estimatedImplementationCost: implementationCost,
      paybackPeriodMonths: parseFloat(paybackMonths.toFixed(1)),
      annualROI: parseFloat(annualROI.toFixed(1)),
      breakEvenPoint: new Date(Date.now() + paybackMonths * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  }

  /**
   * Save optimization report
   */
  saveReport(report, filename) {
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`Cost optimization report saved to ${filepath}`);
  }
}

// CLI Interface
if (require.main === module) {
  const optimizer = new CostOptimizer();
  
  const command = process.argv[2];
  const dataFile = process.argv[3];
  const timeframe = parseInt(process.argv[4]) || 30;

  switch (command) {
    case 'analyze':
      if (!dataFile) {
        console.error('Usage: node cost-optimization.js analyze <workflow-data-file> [timeframe-days]');
        process.exit(1);
      }
      
      try {
        const workflowData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        const analysis = optimizer.analyzeCosts(workflowData, timeframe);
        console.log(JSON.stringify(analysis, null, 2));
      } catch (error) {
        console.error('Error analyzing costs:', error.message);
        process.exit(1);
      }
      break;

    case 'report':
      if (!dataFile) {
        console.error('Usage: node cost-optimization.js report <workflow-data-file> [timeframe-days]');
        process.exit(1);
      }
      
      try {
        const workflowData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        const analysis = optimizer.analyzeCosts(workflowData, timeframe);
        const report = optimizer.generateReport(analysis);
        
        console.log(JSON.stringify(report, null, 2));
        
        // Save report
        const filename = `cost-optimization-report-${new Date().toISOString().split('T')[0]}.json`;
        optimizer.saveReport(report, filename);
      } catch (error) {
        console.error('Error generating report:', error.message);
        process.exit(1);
      }
      break;

    default:
      console.log('GitHub Actions Cost Optimization System');
      console.log('');
      console.log('Commands:');
      console.log('  analyze <data-file> [days]  - Analyze workflow costs and identify optimizations');
      console.log('  report <data-file> [days]   - Generate comprehensive cost optimization report');
      console.log('');
      console.log('Data file should contain workflow execution data in JSON format');
      break;
  }
}

module.exports = CostOptimizer;