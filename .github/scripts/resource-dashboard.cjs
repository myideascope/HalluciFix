#!/usr/bin/env node

/**
 * Resource Allocation Dashboard
 * 
 * Provides real-time monitoring and visualization of GitHub Actions
 * resource usage, costs, and optimization opportunities.
 */

const fs = require('fs');
const path = require('path');

class ResourceDashboard {
  constructor() {
    this.dataDir = '.github/monitoring-data';
    this.configFile = '.github/runner-allocation-config.json';
    this.dashboardFile = 'resource-dashboard.html';
  }

  /**
   * Generate comprehensive resource dashboard
   */
  async generateDashboard() {
    console.log('Generating resource allocation dashboard...');
    
    // Ensure data directory exists
    this.ensureDataDirectory();
    
    // Collect current data
    const dashboardData = await this.collectDashboardData();
    
    // Generate HTML dashboard
    const html = this.generateDashboardHTML(dashboardData);
    
    // Write dashboard file
    fs.writeFileSync(this.dashboardFile, html);
    
    console.log(`Dashboard generated: ${this.dashboardFile}`);
    return dashboardData;
  }

  /**
   * Ensure monitoring data directory exists
   */
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Collect all dashboard data
   */
  async collectDashboardData() {
    const data = {
      timestamp: new Date().toISOString(),
      summary: await this.getSummaryMetrics(),
      runnerMetrics: await this.getRunnerMetrics(),
      costAnalysis: await this.getCostAnalysis(),
      utilizationTrends: await this.getUtilizationTrends(),
      alerts: await this.getActiveAlerts(),
      recommendations: await this.getRecommendations(),
      policies: this.getPolicyStatus(),
      healthScore: 0
    };

    // Calculate health score
    data.healthScore = this.calculateHealthScore(data);
    
    return data;
  }

  /**
   * Get summary metrics
   */
  async getSummaryMetrics() {
    // In a real implementation, this would query GitHub API or stored metrics
    // For now, we'll simulate the data
    return {
      totalWorkflows: 15,
      activeRunners: 8,
      dailyCost: 45.67,
      monthlyCostProjection: 1370.10,
      avgUtilization: 67,
      queueTime: 3.2,
      successRate: 94.5,
      optimizationOpportunities: 6
    };
  }

  /**
   * Get runner-specific metrics
   */
  async getRunnerMetrics() {
    return {
      'ubuntu-latest': {
        usage: 45,
        cost: 12.34,
        utilization: 58,
        queueTime: 2.1,
        reliability: 96.2
      },
      'ubuntu-latest-4-cores': {
        usage: 28,
        cost: 18.76,
        utilization: 72,
        queueTime: 4.3,
        reliability: 94.8
      },
      'ubuntu-latest-8-cores': {
        usage: 15,
        cost: 14.57,
        utilization: 89,
        queueTime: 6.7,
        reliability: 92.1
      },
      'self-hosted-medium': {
        usage: 12,
        cost: 3.45,
        utilization: 34,
        queueTime: 1.2,
        reliability: 98.5
      }
    };
  }

  /**
   * Get cost analysis data
   */
  async getCostAnalysis() {
    return {
      breakdown: {
        'unit-tests': 15.23,
        'integration-tests': 12.45,
        'e2e-tests': 8.67,
        'security-scans': 4.32,
        'builds': 3.21,
        'deployments': 1.79
      },
      trends: {
        daily: [42.1, 38.9, 45.2, 41.8, 47.3, 43.6, 45.7],
        weekly: [285.4, 298.7, 312.1, 289.3],
        monthly: [1245.6, 1298.4, 1356.2]
      },
      projections: {
        nextMonth: 1420.50,
        nextQuarter: 4261.50,
        yearEnd: 17046.00
      },
      savings: {
        potential: 284.50,
        percentage: 20.8,
        topOpportunities: [
          { type: 'Runner rightsizing', savings: 156.30 },
          { type: 'Workflow optimization', savings: 89.20 },
          { type: 'Self-hosted migration', savings: 39.00 }
        ]
      }
    };
  }

  /**
   * Get utilization trends
   */
  async getUtilizationTrends() {
    return {
      hourly: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        utilization: 30 + Math.sin(i / 24 * Math.PI * 2) * 40 + Math.random() * 10,
        cost: 1.5 + Math.sin(i / 24 * Math.PI * 2) * 1.2 + Math.random() * 0.3
      })),
      daily: Array.from({ length: 7 }, (_, i) => ({
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
        utilization: 40 + (i < 5 ? 30 : -10) + Math.random() * 15,
        workflows: 8 + (i < 5 ? 12 : -3) + Math.floor(Math.random() * 5)
      })),
      weekly: Array.from({ length: 4 }, (_, i) => ({
        week: `Week ${i + 1}`,
        avgUtilization: 55 + Math.random() * 20,
        totalCost: 280 + Math.random() * 60,
        efficiency: 0.7 + Math.random() * 0.2
      }))
    };
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    return [
      {
        id: 'alert-001',
        type: 'cost',
        severity: 'medium',
        title: 'Daily cost threshold exceeded',
        message: 'Daily cost of $45.67 exceeds threshold of $40.00',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        recommendation: 'Review runner allocation for cost optimization'
      },
      {
        id: 'alert-002',
        type: 'utilization',
        severity: 'low',
        title: 'Low utilization detected',
        message: 'self-hosted-medium runner utilization at 34%',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        recommendation: 'Consider downsizing or consolidating workloads'
      },
      {
        id: 'alert-003',
        type: 'queue-time',
        severity: 'high',
        title: 'High queue times',
        message: 'ubuntu-latest-8-cores queue time at 6.7 minutes',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        recommendation: 'Increase capacity or optimize workflow scheduling'
      }
    ];
  }

  /**
   * Get optimization recommendations
   */
  async getRecommendations() {
    return [
      {
        id: 'rec-001',
        type: 'cost-optimization',
        priority: 'high',
        title: 'Migrate unit tests to smaller runners',
        description: 'Unit tests are using ubuntu-latest-4-cores but could run on ubuntu-latest',
        impact: 'Save $156.30/month (11.4%)',
        effort: 'Low',
        implementation: [
          'Update test workflows to use ubuntu-latest',
          'Monitor performance impact',
          'Adjust if test times increase significantly'
        ]
      },
      {
        id: 'rec-002',
        type: 'performance-optimization',
        priority: 'medium',
        title: 'Parallelize integration tests',
        description: 'Integration tests could be split into parallel jobs',
        impact: 'Reduce execution time by 40%',
        effort: 'Medium',
        implementation: [
          'Split integration tests into logical groups',
          'Update workflow to run tests in parallel',
          'Ensure proper test isolation'
        ]
      },
      {
        id: 'rec-003',
        type: 'infrastructure',
        priority: 'medium',
        title: 'Consider self-hosted runners',
        description: 'High usage patterns suggest self-hosted runners could be cost-effective',
        impact: 'Save $39.00/month (2.8%)',
        effort: 'High',
        implementation: [
          'Set up self-hosted runner infrastructure',
          'Migrate non-sensitive workloads',
          'Implement proper security measures'
        ]
      }
    ];
  }

  /**
   * Get policy status
   */
  getPolicyStatus() {
    const config = this.loadConfig();
    
    return {
      activePolicy: config.defaultPolicy,
      policies: Object.keys(config.policies),
      workloadMappings: config.workloadPolicies,
      lastUpdated: config.lastUpdated,
      compliance: {
        costThresholds: 85,
        utilizationTargets: 72,
        performanceGoals: 91
      }
    };
  }

  /**
   * Load configuration
   */
  loadConfig() {
    if (fs.existsSync(this.configFile)) {
      return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    }
    
    // Return default config if file doesn't exist
    return {
      defaultPolicy: 'balanced',
      policies: { balanced: {}, 'cost-optimization': {}, 'performance-optimization': {} },
      workloadPolicies: {},
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(data) {
    let score = 100;
    
    // Deduct for high costs
    if (data.summary.dailyCost > 50) score -= 15;
    else if (data.summary.dailyCost > 40) score -= 8;
    
    // Deduct for low utilization
    if (data.summary.avgUtilization < 40) score -= 20;
    else if (data.summary.avgUtilization < 60) score -= 10;
    
    // Deduct for high queue times
    if (data.summary.queueTime > 8) score -= 15;
    else if (data.summary.queueTime > 5) score -= 8;
    
    // Deduct for low success rate
    if (data.summary.successRate < 90) score -= 20;
    else if (data.summary.successRate < 95) score -= 10;
    
    // Deduct for active alerts
    const highSeverityAlerts = data.alerts.filter(alert => alert.severity === 'high').length;
    const mediumSeverityAlerts = data.alerts.filter(alert => alert.severity === 'medium').length;
    
    score -= highSeverityAlerts * 10;
    score -= mediumSeverityAlerts * 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate HTML dashboard
   */
  generateDashboardHTML(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Actions Resource Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f6f8fa;
            color: #24292f;
            line-height: 1.5;
        }
        
        .header {
            background: #24292f;
            color: white;
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .header h1 {
            font-size: 1.5rem;
            font-weight: 600;
        }
        
        .health-score {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .health-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-weight: 600;
            font-size: 0.875rem;
        }
        
        .health-excellent { background: #28a745; }
        .health-good { background: #ffc107; color: #212529; }
        .health-poor { background: #dc3545; }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid #d1d9e0;
        }
        
        .card h2 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #24292f;
        }
        
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid #f6f8fa;
        }
        
        .metric:last-child {
            border-bottom: none;
        }
        
        .metric-label {
            color: #656d76;
            font-size: 0.875rem;
        }
        
        .metric-value {
            font-weight: 600;
            font-size: 1rem;
        }
        
        .metric-value.cost {
            color: #0969da;
        }
        
        .metric-value.utilization {
            color: #8250df;
        }
        
        .metric-value.success {
            color: #1a7f37;
        }
        
        .alert {
            padding: 0.75rem;
            border-radius: 6px;
            margin-bottom: 0.5rem;
            border-left: 4px solid;
        }
        
        .alert-high {
            background: #ffeef0;
            border-color: #dc3545;
        }
        
        .alert-medium {
            background: #fff3cd;
            border-color: #ffc107;
        }
        
        .alert-low {
            background: #d1ecf1;
            border-color: #17a2b8;
        }
        
        .alert-title {
            font-weight: 600;
            margin-bottom: 0.25rem;
        }
        
        .alert-message {
            font-size: 0.875rem;
            color: #656d76;
        }
        
        .recommendation {
            padding: 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            border: 1px solid #d1d9e0;
            background: #f6f8fa;
        }
        
        .rec-title {
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .rec-impact {
            color: #1a7f37;
            font-weight: 600;
            font-size: 0.875rem;
        }
        
        .chart-container {
            position: relative;
            height: 300px;
            margin-top: 1rem;
        }
        
        .runner-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }
        
        .runner-card {
            padding: 1rem;
            border-radius: 6px;
            border: 1px solid #d1d9e0;
            background: white;
        }
        
        .runner-name {
            font-weight: 600;
            margin-bottom: 0.5rem;
            font-size: 0.875rem;
        }
        
        .runner-metrics {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }
        
        .runner-metric {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
        }
        
        .timestamp {
            color: #656d76;
            font-size: 0.875rem;
            text-align: center;
            margin-top: 2rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 GitHub Actions Resource Dashboard</h1>
        <div class="health-score">
            <span>Health Score:</span>
            <span class="health-badge ${this.getHealthClass(data.healthScore)}">${data.healthScore}/100</span>
        </div>
    </div>
    
    <div class="container">
        <!-- Summary Metrics -->
        <div class="grid">
            <div class="card">
                <h2>📊 Summary Metrics</h2>
                <div class="metric">
                    <span class="metric-label">Total Workflows</span>
                    <span class="metric-value">${data.summary.totalWorkflows}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Active Runners</span>
                    <span class="metric-value">${data.summary.activeRunners}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Daily Cost</span>
                    <span class="metric-value cost">$${data.summary.dailyCost}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Monthly Projection</span>
                    <span class="metric-value cost">$${data.summary.monthlyCostProjection}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Avg Utilization</span>
                    <span class="metric-value utilization">${data.summary.avgUtilization}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Success Rate</span>
                    <span class="metric-value success">${data.summary.successRate}%</span>
                </div>
            </div>
            
            <div class="card">
                <h2>💰 Cost Analysis</h2>
                <div class="chart-container">
                    <canvas id="costChart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h2>📈 Utilization Trends</h2>
                <div class="chart-container">
                    <canvas id="utilizationChart"></canvas>
                </div>
            </div>
        </div>
        
        <!-- Runner Metrics -->
        <div class="card">
            <h2>🖥️ Runner Performance</h2>
            <div class="runner-grid">
                ${Object.entries(data.runnerMetrics).map(([runner, metrics]) => `
                    <div class="runner-card">
                        <div class="runner-name">${runner}</div>
                        <div class="runner-metrics">
                            <div class="runner-metric">
                                <span>Usage:</span>
                                <span>${metrics.usage}%</span>
                            </div>
                            <div class="runner-metric">
                                <span>Cost:</span>
                                <span>$${metrics.cost}</span>
                            </div>
                            <div class="runner-metric">
                                <span>Utilization:</span>
                                <span>${metrics.utilization}%</span>
                            </div>
                            <div class="runner-metric">
                                <span>Queue Time:</span>
                                <span>${metrics.queueTime}min</span>
                            </div>
                            <div class="runner-metric">
                                <span>Reliability:</span>
                                <span>${metrics.reliability}%</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <!-- Alerts and Recommendations -->
        <div class="grid">
            <div class="card">
                <h2>🚨 Active Alerts</h2>
                ${data.alerts.map(alert => `
                    <div class="alert alert-${alert.severity}">
                        <div class="alert-title">${alert.title}</div>
                        <div class="alert-message">${alert.message}</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="card">
                <h2>💡 Recommendations</h2>
                ${data.recommendations.slice(0, 3).map(rec => `
                    <div class="recommendation">
                        <div class="rec-title">${rec.title}</div>
                        <div class="rec-impact">${rec.impact}</div>
                        <div style="font-size: 0.875rem; color: #656d76; margin-top: 0.5rem;">
                            ${rec.description}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="timestamp">
            Last updated: ${new Date(data.timestamp).toLocaleString()}
        </div>
    </div>
    
    <script>
        // Cost breakdown chart
        const costCtx = document.getElementById('costChart').getContext('2d');
        new Chart(costCtx, {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(Object.keys(data.costAnalysis.breakdown))},
                datasets: [{
                    data: ${JSON.stringify(Object.values(data.costAnalysis.breakdown))},
                    backgroundColor: [
                        '#0969da', '#8250df', '#1a7f37', '#d1242f', '#fb8500', '#6f42c1'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
        
        // Utilization trends chart
        const utilizationCtx = document.getElementById('utilizationChart').getContext('2d');
        new Chart(utilizationCtx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(data.utilizationTrends.hourly.map(h => h.hour + ':00'))},
                datasets: [{
                    label: 'Utilization %',
                    data: ${JSON.stringify(data.utilizationTrends.hourly.map(h => h.utilization))},
                    borderColor: '#8250df',
                    backgroundColor: 'rgba(130, 80, 223, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }

  /**
   * Get health score CSS class
   */
  getHealthClass(score) {
    if (score >= 80) return 'health-excellent';
    if (score >= 60) return 'health-good';
    return 'health-poor';
  }

  /**
   * Save dashboard data for historical tracking
   */
  saveDashboardData(data) {
    const filename = `dashboard-data-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`Dashboard data saved: ${filepath}`);
  }

  /**
   * Generate dashboard summary for CLI
   */
  generateSummary(data) {
    console.log('\n📊 Resource Dashboard Summary');
    console.log('================================');
    console.log(`Health Score: ${data.healthScore}/100`);
    console.log(`Daily Cost: $${data.summary.dailyCost}`);
    console.log(`Avg Utilization: ${data.summary.avgUtilization}%`);
    console.log(`Active Alerts: ${data.alerts.length}`);
    console.log(`Recommendations: ${data.recommendations.length}`);
    console.log(`Success Rate: ${data.summary.successRate}%`);
    console.log('================================\n');
  }
}

// CLI Interface
if (require.main === module) {
  const dashboard = new ResourceDashboard();
  
  const command = process.argv[2];

  async function main() {
    try {
      switch (command) {
        case 'generate':
          const data = await dashboard.generateDashboard();
          dashboard.generateSummary(data);
          dashboard.saveDashboardData(data);
          break;

        case 'summary':
          const summaryData = await dashboard.collectDashboardData();
          dashboard.generateSummary(summaryData);
          break;

        default:
          console.log('Resource Allocation Dashboard');
          console.log('');
          console.log('Commands:');
          console.log('  generate  - Generate complete HTML dashboard');
          console.log('  summary   - Display dashboard summary in CLI');
          console.log('');
          console.log('The dashboard provides real-time monitoring of:');
          console.log('  - Resource utilization and costs');
          console.log('  - Runner performance metrics');
          console.log('  - Active alerts and recommendations');
          console.log('  - Optimization opportunities');
          break;
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  main();
}

module.exports = ResourceDashboard;