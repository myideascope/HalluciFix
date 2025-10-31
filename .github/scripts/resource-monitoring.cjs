#!/usr/bin/env node

/**
 * GitHub Actions Resource Monitoring System
 * 
 * Monitors workflow execution, resource usage, and costs to provide
 * insights and optimization recommendations.
 */

const fs = require('fs');
const path = require('path');

class ResourceMonitor {
  constructor(githubToken) {
    this.githubToken = githubToken;
    this.metricsHistory = [];
    this.alertThresholds = {
      costPerHour: 10.0,
      utilizationLow: 0.3,
      utilizationHigh: 0.9,
      queueTimeMinutes: 10,
      failureRate: 0.15
    };
  }

  /**
   * Collect resource usage metrics from GitHub Actions API
   */
  async collectMetrics(owner, repo, timeframeHours = 24) {
    console.log(`Collecting metrics for ${owner}/${repo} over the last ${timeframeHours} hours`);
    
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - timeframeHours * 60 * 60 * 1000);
    
    try {
      // In a real implementation, this would use the GitHub API
      // For now, we'll simulate the data collection
      const metrics = await this.simulateMetricsCollection(owner, repo, startTime, endTime);
      
      // Store metrics
      this.metricsHistory.push({
        timestamp: endTime.toISOString(),
        timeframe: timeframeHours,
        metrics
      });
      
      return metrics;
    } catch (error) {
      console.error('Error collecting metrics:', error.message);
      throw error;
    }
  }

  /**
   * Simulate metrics collection (replace with actual GitHub API calls)
   */
  async simulateMetricsCollection(owner, repo, startTime, endTime) {
    // Simulate workflow run data
    const workflows = [
      'Comprehensive Test Suite',
      'Deploy to Environments',
      'Security Scanning',
      'Performance Monitoring',
      'Smart PR Testing'
    ];

    const runnerTypes = [
      'ubuntu-latest',
      'ubuntu-latest-4-cores',
      'ubuntu-latest-8-cores',
      'self-hosted-medium'
    ];

    const metrics = {
      totalRuns: 0,
      totalCost: 0,
      totalDuration: 0,
      runnerUsage: {},
      workflowMetrics: {},
      resourceUtilization: {},
      queueTimes: [],
      failureRates: {}
    };

    // Generate simulated data
    for (const workflow of workflows) {
      const runCount = Math.floor(Math.random() * 20) + 5; // 5-25 runs
      metrics.totalRuns += runCount;
      
      const workflowData = {
        runs: runCount,
        successfulRuns: Math.floor(runCount * (0.85 + Math.random() * 0.1)), // 85-95% success rate
        avgDuration: Math.floor(Math.random() * 30) + 10, // 10-40 minutes
        totalCost: 0,
        runnerDistribution: {}
      };

      workflowData.failedRuns = runCount - workflowData.successfulRuns;
      workflowData.failureRate = workflowData.failedRuns / runCount;
      
      // Simulate runner usage for this workflow
      for (let i = 0; i < runCount; i++) {
        const runnerType = runnerTypes[Math.floor(Math.random() * runnerTypes.length)];
        const duration = Math.floor(Math.random() * 40) + 5; // 5-45 minutes
        const queueTime = Math.floor(Math.random() * 15); // 0-15 minutes queue time
        
        // Initialize runner data if not exists
        if (!metrics.runnerUsage[runnerType]) {
          metrics.runnerUsage[runnerType] = {
            totalRuns: 0,
            totalDuration: 0,
            totalCost: 0,
            avgCpuUtilization: 0,
            avgMemoryUtilization: 0,
            queueTimes: []
          };
        }

        if (!workflowData.runnerDistribution[runnerType]) {
          workflowData.runnerDistribution[runnerType] = 0;
        }

        // Update metrics
        metrics.runnerUsage[runnerType].totalRuns++;
        metrics.runnerUsage[runnerType].totalDuration += duration;
        metrics.runnerUsage[runnerType].queueTimes.push(queueTime);
        workflowData.runnerDistribution[runnerType]++;
        
        // Simulate resource utilization
        const cpuUtil = 0.3 + Math.random() * 0.6; // 30-90% CPU
        const memUtil = 0.2 + Math.random() * 0.7; // 20-90% Memory
        
        metrics.runnerUsage[runnerType].avgCpuUtilization += cpuUtil;
        metrics.runnerUsage[runnerType].avgMemoryUtilization += memUtil;
        
        // Calculate cost (simplified)
        const costPerMinute = this.getRunnerCostPerMinute(runnerType);
        const runCost = duration * costPerMinute;
        metrics.runnerUsage[runnerType].totalCost += runCost;
        workflowData.totalCost += runCost;
        
        metrics.totalDuration += duration;
        metrics.totalCost += runCost;
        metrics.queueTimes.push(queueTime);
      }

      metrics.workflowMetrics[workflow] = workflowData;
      metrics.failureRates[workflow] = workflowData.failureRate;
    }

    // Calculate averages
    for (const [runnerType, data] of Object.entries(metrics.runnerUsage)) {
      if (data.totalRuns > 0) {
        data.avgCpuUtilization /= data.totalRuns;
        data.avgMemoryUtilization /= data.totalRuns;
        data.avgDuration = data.totalDuration / data.totalRuns;
        data.avgQueueTime = data.queueTimes.reduce((sum, time) => sum + time, 0) / data.queueTimes.length;
      }
    }

    metrics.avgQueueTime = metrics.queueTimes.reduce((sum, time) => sum + time, 0) / metrics.queueTimes.length;
    metrics.overallFailureRate = Object.values(metrics.failureRates).reduce((sum, rate) => sum + rate, 0) / workflows.length;

    return metrics;
  }

  /**
   * Get cost per minute for runner type
   */
  getRunnerCostPerMinute(runnerType) {
    const costs = {
      'ubuntu-latest': 0.008,
      'ubuntu-latest-4-cores': 0.016,
      'ubuntu-latest-8-cores': 0.032,
      'ubuntu-latest-16-cores': 0.064,
      'windows-latest': 0.016,
      'macos-latest': 0.08,
      'self-hosted-small': 0.004,
      'self-hosted-medium': 0.008,
      'self-hosted-large': 0.016
    };
    
    return costs[runnerType] || 0.008;
  }

  /**
   * Analyze metrics and generate insights
   */
  analyzeMetrics(metrics) {
    const analysis = {
      summary: this.generateSummary(metrics),
      alerts: this.generateAlerts(metrics),
      recommendations: this.generateRecommendations(metrics),
      trends: this.analyzeTrends(metrics),
      costBreakdown: this.analyzeCosts(metrics)
    };

    return analysis;
  }

  /**
   * Generate summary statistics
   */
  generateSummary(metrics) {
    return {
      totalRuns: metrics.totalRuns,
      totalCost: parseFloat(metrics.totalCost.toFixed(2)),
      avgCostPerRun: parseFloat((metrics.totalCost / metrics.totalRuns).toFixed(3)),
      totalDuration: Math.round(metrics.totalDuration),
      avgDuration: Math.round(metrics.totalDuration / metrics.totalRuns),
      avgQueueTime: Math.round(metrics.avgQueueTime),
      overallFailureRate: parseFloat((metrics.overallFailureRate * 100).toFixed(1)),
      runnerTypesUsed: Object.keys(metrics.runnerUsage).length,
      workflowsActive: Object.keys(metrics.workflowMetrics).length
    };
  }

  /**
   * Generate alerts based on thresholds
   */
  generateAlerts(metrics) {
    const alerts = [];

    // Cost alerts
    const costPerHour = metrics.totalCost; // Assuming metrics are for 1 hour
    if (costPerHour > this.alertThresholds.costPerHour) {
      alerts.push({
        type: 'cost',
        severity: 'high',
        message: `High cost detected: $${costPerHour.toFixed(2)}/hour (threshold: $${this.alertThresholds.costPerHour}/hour)`,
        value: costPerHour,
        threshold: this.alertThresholds.costPerHour
      });
    }

    // Utilization alerts
    for (const [runnerType, data] of Object.entries(metrics.runnerUsage)) {
      const avgUtilization = (data.avgCpuUtilization + data.avgMemoryUtilization) / 2;
      
      if (avgUtilization < this.alertThresholds.utilizationLow) {
        alerts.push({
          type: 'underutilization',
          severity: 'medium',
          message: `${runnerType} is underutilized: ${(avgUtilization * 100).toFixed(1)}% average utilization`,
          runnerType,
          value: avgUtilization,
          threshold: this.alertThresholds.utilizationLow
        });
      }
      
      if (avgUtilization > this.alertThresholds.utilizationHigh) {
        alerts.push({
          type: 'overutilization',
          severity: 'medium',
          message: `${runnerType} is highly utilized: ${(avgUtilization * 100).toFixed(1)}% average utilization`,
          runnerType,
          value: avgUtilization,
          threshold: this.alertThresholds.utilizationHigh
        });
      }

      // Queue time alerts
      if (data.avgQueueTime > this.alertThresholds.queueTimeMinutes) {
        alerts.push({
          type: 'queue-time',
          severity: 'medium',
          message: `High queue times for ${runnerType}: ${data.avgQueueTime.toFixed(1)} minutes average`,
          runnerType,
          value: data.avgQueueTime,
          threshold: this.alertThresholds.queueTimeMinutes
        });
      }
    }

    // Failure rate alerts
    for (const [workflow, rate] of Object.entries(metrics.failureRates)) {
      if (rate > this.alertThresholds.failureRate) {
        alerts.push({
          type: 'failure-rate',
          severity: 'high',
          message: `High failure rate for ${workflow}: ${(rate * 100).toFixed(1)}%`,
          workflow,
          value: rate,
          threshold: this.alertThresholds.failureRate
        });
      }
    }

    return alerts.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    // Cost optimization recommendations
    let totalPotentialSavings = 0;

    for (const [runnerType, data] of Object.entries(metrics.runnerUsage)) {
      const avgUtilization = (data.avgCpuUtilization + data.avgMemoryUtilization) / 2;
      
      // Recommend downsizing underutilized runners
      if (avgUtilization < 0.4 && data.totalCost > 1.0) {
        const potentialSavings = data.totalCost * 0.3; // Assume 30% savings
        totalPotentialSavings += potentialSavings;
        
        recommendations.push({
          type: 'cost-optimization',
          priority: 'medium',
          title: `Downsize ${runnerType} runners`,
          description: `${runnerType} is only ${(avgUtilization * 100).toFixed(1)}% utilized on average`,
          action: 'Consider using smaller runner types for these workloads',
          potentialSavings: parseFloat(potentialSavings.toFixed(2)),
          impact: 'cost-reduction'
        });
      }

      // Recommend upsizing overutilized runners
      if (avgUtilization > 0.85) {
        recommendations.push({
          type: 'performance-optimization',
          priority: 'medium',
          title: `Upsize ${runnerType} runners`,
          description: `${runnerType} is ${(avgUtilization * 100).toFixed(1)}% utilized on average`,
          action: 'Consider using larger runner types to improve performance',
          expectedImprovement: '20-30% faster execution',
          impact: 'performance-improvement'
        });
      }

      // Recommend addressing queue times
      if (data.avgQueueTime > 5) {
        recommendations.push({
          type: 'capacity-optimization',
          priority: 'high',
          title: `Reduce queue times for ${runnerType}`,
          description: `Average queue time is ${data.avgQueueTime.toFixed(1)} minutes`,
          action: 'Increase runner capacity or optimize workflow scheduling',
          impact: 'time-to-feedback'
        });
      }
    }

    // Workflow-specific recommendations
    for (const [workflow, data] of Object.entries(metrics.workflowMetrics)) {
      if (data.failureRate > 0.1) {
        recommendations.push({
          type: 'reliability-improvement',
          priority: 'high',
          title: `Improve reliability of ${workflow}`,
          description: `Failure rate is ${(data.failureRate * 100).toFixed(1)}%`,
          action: 'Investigate and fix common failure causes',
          impact: 'reliability'
        });
      }

      if (data.avgDuration > 30) {
        recommendations.push({
          type: 'performance-optimization',
          priority: 'medium',
          title: `Optimize ${workflow} performance`,
          description: `Average duration is ${data.avgDuration} minutes`,
          action: 'Consider parallelization or caching improvements',
          impact: 'execution-time'
        });
      }
    }

    // Add summary recommendation if significant savings available
    if (totalPotentialSavings > 5.0) {
      recommendations.unshift({
        type: 'cost-optimization',
        priority: 'high',
        title: 'Significant cost optimization opportunity',
        description: `Potential savings of $${totalPotentialSavings.toFixed(2)} identified`,
        action: 'Review and implement runner rightsizing recommendations',
        potentialSavings: totalPotentialSavings,
        impact: 'cost-reduction'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Analyze trends from historical data
   */
  analyzeTrends(metrics) {
    const trends = {
      costTrend: 'stable',
      utilizationTrend: 'stable',
      performanceTrend: 'stable',
      reliabilityTrend: 'stable'
    };

    // In a real implementation, this would compare with historical data
    // For now, we'll provide basic trend analysis based on current metrics

    if (metrics.totalCost > 50) {
      trends.costTrend = 'increasing';
    } else if (metrics.totalCost < 10) {
      trends.costTrend = 'decreasing';
    }

    const avgUtilization = Object.values(metrics.runnerUsage)
      .reduce((sum, data) => sum + (data.avgCpuUtilization + data.avgMemoryUtilization) / 2, 0) / 
      Object.keys(metrics.runnerUsage).length;

    if (avgUtilization > 0.8) {
      trends.utilizationTrend = 'increasing';
    } else if (avgUtilization < 0.4) {
      trends.utilizationTrend = 'decreasing';
    }

    if (metrics.avgQueueTime > 10) {
      trends.performanceTrend = 'degrading';
    } else if (metrics.avgQueueTime < 2) {
      trends.performanceTrend = 'improving';
    }

    if (metrics.overallFailureRate > 0.15) {
      trends.reliabilityTrend = 'degrading';
    } else if (metrics.overallFailureRate < 0.05) {
      trends.reliabilityTrend = 'improving';
    }

    return trends;
  }

  /**
   * Analyze cost breakdown
   */
  analyzeCosts(metrics) {
    const breakdown = {
      byRunner: {},
      byWorkflow: {},
      topCostDrivers: []
    };

    // Cost by runner type
    for (const [runnerType, data] of Object.entries(metrics.runnerUsage)) {
      breakdown.byRunner[runnerType] = {
        totalCost: parseFloat(data.totalCost.toFixed(2)),
        percentage: parseFloat(((data.totalCost / metrics.totalCost) * 100).toFixed(1)),
        avgCostPerRun: parseFloat((data.totalCost / data.totalRuns).toFixed(3))
      };
    }

    // Cost by workflow
    for (const [workflow, data] of Object.entries(metrics.workflowMetrics)) {
      breakdown.byWorkflow[workflow] = {
        totalCost: parseFloat(data.totalCost.toFixed(2)),
        percentage: parseFloat(((data.totalCost / metrics.totalCost) * 100).toFixed(1)),
        avgCostPerRun: parseFloat((data.totalCost / data.runs).toFixed(3))
      };
    }

    // Identify top cost drivers
    const runnerCosts = Object.entries(breakdown.byRunner)
      .map(([type, data]) => ({ type: 'runner', name: type, cost: data.totalCost }));
    
    const workflowCosts = Object.entries(breakdown.byWorkflow)
      .map(([name, data]) => ({ type: 'workflow', name, cost: data.totalCost }));

    breakdown.topCostDrivers = [...runnerCosts, ...workflowCosts]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    return breakdown;
  }

  /**
   * Generate comprehensive monitoring report
   */
  generateReport(analysis, timeframe = '24h') {
    const report = {
      title: 'GitHub Actions Resource Monitoring Report',
      generatedAt: new Date().toISOString(),
      timeframe,
      summary: analysis.summary,
      healthScore: this.calculateHealthScore(analysis),
      alerts: analysis.alerts,
      recommendations: analysis.recommendations,
      trends: analysis.trends,
      costBreakdown: analysis.costBreakdown,
      actionItems: this.generateActionItems(analysis)
    };

    return report;
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(analysis) {
    let score = 100;

    // Deduct points for alerts
    for (const alert of analysis.alerts) {
      switch (alert.severity) {
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 8;
          break;
        case 'low':
          score -= 3;
          break;
      }
    }

    // Deduct points for high failure rate
    if (analysis.summary.overallFailureRate > 15) {
      score -= 20;
    } else if (analysis.summary.overallFailureRate > 10) {
      score -= 10;
    }

    // Deduct points for high costs
    if (analysis.summary.avgCostPerRun > 1.0) {
      score -= 10;
    }

    // Deduct points for long queue times
    if (analysis.summary.avgQueueTime > 10) {
      score -= 15;
    } else if (analysis.summary.avgQueueTime > 5) {
      score -= 8;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate prioritized action items
   */
  generateActionItems(analysis) {
    const actionItems = [];

    // High priority alerts become action items
    const highPriorityAlerts = analysis.alerts.filter(alert => alert.severity === 'high');
    for (const alert of highPriorityAlerts) {
      actionItems.push({
        priority: 'urgent',
        category: 'alert',
        title: `Address ${alert.type}`,
        description: alert.message,
        estimatedEffort: 'medium'
      });
    }

    // High priority recommendations become action items
    const highPriorityRecs = analysis.recommendations.filter(rec => rec.priority === 'high');
    for (const rec of highPriorityRecs.slice(0, 3)) { // Limit to top 3
      actionItems.push({
        priority: 'high',
        category: 'optimization',
        title: rec.title,
        description: rec.description,
        action: rec.action,
        impact: rec.impact,
        estimatedEffort: rec.potentialSavings > 10 ? 'high' : 'medium'
      });
    }

    return actionItems.slice(0, 10); // Limit to top 10 action items
  }

  /**
   * Save monitoring data to file
   */
  saveMonitoringData(data, filename) {
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`Monitoring data saved to ${filepath}`);
  }

  /**
   * Load historical monitoring data
   */
  loadMonitoringData(filename) {
    const filepath = path.join(process.cwd(), filename);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
    return null;
  }
}

// CLI Interface
if (require.main === module) {
  const monitor = new ResourceMonitor(process.env.GITHUB_TOKEN);
  
  const command = process.argv[2];
  const owner = process.argv[3];
  const repo = process.argv[4];
  const timeframe = parseInt(process.argv[5]) || 24;

  async function main() {
    switch (command) {
      case 'collect':
        if (!owner || !repo) {
          console.error('Usage: node resource-monitoring.js collect <owner> <repo> [timeframe-hours]');
          process.exit(1);
        }
        
        try {
          const metrics = await monitor.collectMetrics(owner, repo, timeframe);
          console.log(JSON.stringify(metrics, null, 2));
        } catch (error) {
          console.error('Error collecting metrics:', error.message);
          process.exit(1);
        }
        break;

      case 'analyze':
        const metricsFile = process.argv[3];
        if (!metricsFile) {
          console.error('Usage: node resource-monitoring.js analyze <metrics-file>');
          process.exit(1);
        }
        
        try {
          const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
          const analysis = monitor.analyzeMetrics(metrics);
          console.log(JSON.stringify(analysis, null, 2));
        } catch (error) {
          console.error('Error analyzing metrics:', error.message);
          process.exit(1);
        }
        break;

      case 'report':
        if (!owner || !repo) {
          console.error('Usage: node resource-monitoring.js report <owner> <repo> [timeframe-hours]');
          process.exit(1);
        }
        
        try {
          const metrics = await monitor.collectMetrics(owner, repo, timeframe);
          const analysis = monitor.analyzeMetrics(metrics);
          const report = monitor.generateReport(analysis, `${timeframe}h`);
          
          console.log(JSON.stringify(report, null, 2));
          
          // Save report to file
          const filename = `resource-monitoring-report-${new Date().toISOString().split('T')[0]}.json`;
          monitor.saveMonitoringData(report, filename);
        } catch (error) {
          console.error('Error generating report:', error.message);
          process.exit(1);
        }
        break;

      default:
        console.log('GitHub Actions Resource Monitoring System');
        console.log('');
        console.log('Commands:');
        console.log('  collect <owner> <repo> [hours]  - Collect resource usage metrics');
        console.log('  analyze <metrics-file>          - Analyze metrics and generate insights');
        console.log('  report <owner> <repo> [hours]   - Generate comprehensive monitoring report');
        console.log('');
        console.log('Environment Variables:');
        console.log('  GITHUB_TOKEN - GitHub personal access token for API access');
        break;
    }
  }

  main().catch(console.error);
}

module.exports = ResourceMonitor;