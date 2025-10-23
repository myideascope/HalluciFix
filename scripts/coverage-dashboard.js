#!/usr/bin/env node

/**
 * Coverage Dashboard Generator
 * Creates an interactive HTML dashboard for coverage visualization
 */

const fs = require('fs');
const path = require('path');

class CoverageDashboard {
  constructor() {
    this.reportsDir = 'coverage-reports';
    this.outputDir = 'coverage-dashboard';
    this.templateDir = path.join(__dirname, 'templates');
  }

  /**
   * Load the latest coverage report
   */
  loadLatestReport() {
    const reportFile = path.join(this.reportsDir, 'latest-coverage-report.json');
    if (!fs.existsSync(reportFile)) {
      throw new Error('No coverage report found. Run coverage analysis first.');
    }
    
    return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  }

  /**
   * Load trend data
   */
  loadTrendData() {
    const trendFile = path.join(this.reportsDir, 'coverage-trend.json');
    if (!fs.existsSync(trendFile)) {
      return [];
    }
    
    return JSON.parse(fs.readFileSync(trendFile, 'utf8'));
  }

  /**
   * Generate HTML dashboard
   */
  generateDashboard(report, trendData) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Coverage Dashboard - HalluciFix</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #334155;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .header h1 {
            color: #1e293b;
            margin-bottom: 8px;
        }
        
        .header .meta {
            color: #64748b;
            font-size: 14px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            margin-left: 12px;
        }
        
        .status-passed {
            background: #dcfce7;
            color: #166534;
        }
        
        .status-failed {
            background: #fecaca;
            color: #991b1b;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 24px;
            margin-bottom: 24px;
        }
        
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .card h2 {
            color: #1e293b;
            margin-bottom: 16px;
            font-size: 18px;
        }
        
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .metric:last-child {
            border-bottom: none;
        }
        
        .metric-name {
            font-weight: 500;
        }
        
        .metric-value {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .percentage {
            font-weight: 600;
            font-size: 16px;
        }
        
        .threshold {
            font-size: 12px;
            color: #64748b;
        }
        
        .status-icon {
            font-size: 16px;
        }
        
        .progress-bar {
            width: 100px;
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        
        .progress-success {
            background: #10b981;
        }
        
        .progress-warning {
            background: #f59e0b;
        }
        
        .progress-danger {
            background: #ef4444;
        }
        
        .chart-container {
            position: relative;
            height: 300px;
            margin-top: 16px;
        }
        
        .modules-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
        }
        
        .modules-table th,
        .modules-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .modules-table th {
            background: #f8fafc;
            font-weight: 600;
            color: #374151;
        }
        
        .module-name {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            color: #6366f1;
        }
        
        .recommendations {
            margin-top: 24px;
        }
        
        .recommendation {
            background: white;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            border-left: 4px solid;
        }
        
        .rec-critical {
            border-color: #ef4444;
            background: #fef2f2;
        }
        
        .rec-high {
            border-color: #f59e0b;
            background: #fffbeb;
        }
        
        .rec-medium {
            border-color: #3b82f6;
            background: #eff6ff;
        }
        
        .rec-info {
            border-color: #10b981;
            background: #f0fdf4;
        }
        
        .rec-title {
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .rec-action {
            font-size: 14px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                📊 Coverage Dashboard
                <span class="status-badge ${report.summary.passed ? 'status-passed' : 'status-failed'}">
                    ${report.summary.passed ? 'Passed' : 'Failed'}
                </span>
            </h1>
            <div class="meta">
                Generated: ${new Date(report.timestamp).toLocaleString()} | 
                Commit: ${report.commit.substring(0, 8)} | 
                Branch: ${report.branch}
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h2>📈 Overall Coverage</h2>
                ${this.generateMetricsHTML(report.summary.global, report.summary.thresholds.global)}
            </div>

            <div class="card">
                <h2>📊 Coverage Trend</h2>
                <div class="chart-container">
                    <canvas id="trendChart"></canvas>
                </div>
            </div>
        </div>

        ${report.comparison.hasBaseline ? this.generateComparisonHTML(report.comparison) : ''}

        <div class="card">
            <h2>🎯 Critical Modules</h2>
            <table class="modules-table">
                <thead>
                    <tr>
                        <th>Module</th>
                        <th>Lines</th>
                        <th>Functions</th>
                        <th>Branches</th>
                        <th>Statements</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.generateModulesTableHTML(report.criticalModules, report.summary.thresholds.critical)}
                </tbody>
            </table>
        </div>

        ${report.recommendations.length > 0 ? this.generateRecommendationsHTML(report.recommendations) : ''}
    </div>

    <script>
        // Trend chart
        const trendData = ${JSON.stringify(trendData)};
        
        if (trendData.length > 0) {
            const ctx = document.getElementById('trendChart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: trendData.map(d => new Date(d.timestamp).toLocaleDateString()),
                    datasets: [
                        {
                            label: 'Lines',
                            data: trendData.map(d => d.coverage.lines),
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: 'Functions',
                            data: trendData.map(d => d.coverage.functions),
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: 'Branches',
                            data: trendData.map(d => d.coverage.branches),
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: 'Statements',
                            data: trendData.map(d => d.coverage.statements),
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }
    </script>
</body>
</html>`;

    return html;
  }

  /**
   * Generate metrics HTML
   */
  generateMetricsHTML(coverage, thresholds) {
    const metrics = ['lines', 'functions', 'branches', 'statements'];
    
    return metrics.map(metric => {
      const value = coverage[metric].pct;
      const threshold = thresholds[metric];
      const passed = value >= threshold;
      const progressClass = passed ? 'progress-success' : value >= threshold * 0.8 ? 'progress-warning' : 'progress-danger';
      
      return `
        <div class="metric">
            <div class="metric-name">${metric.charAt(0).toUpperCase() + metric.slice(1)}</div>
            <div class="metric-value">
                <div class="percentage">${value.toFixed(1)}%</div>
                <div class="threshold">/ ${threshold}%</div>
                <div class="progress-bar">
                    <div class="progress-fill ${progressClass}" style="width: ${Math.min(value, 100)}%"></div>
                </div>
                <div class="status-icon">${passed ? '✅' : '❌'}</div>
            </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Generate comparison HTML
   */
  generateComparisonHTML(comparison) {
    return `
      <div class="card">
          <h2>📊 Baseline Comparison</h2>
          ${Object.entries(comparison.changes).map(([metric, change]) => {
            const arrow = change.diff > 0 ? '📈' : change.diff < 0 ? '📉' : '➡️';
            const sign = change.diff > 0 ? '+' : '';
            const colorClass = change.improved ? 'progress-success' : change.regressed ? 'progress-danger' : '';
            
            return `
              <div class="metric">
                  <div class="metric-name">${metric.charAt(0).toUpperCase() + metric.slice(1)}</div>
                  <div class="metric-value">
                      <div class="percentage">${change.current.toFixed(1)}%</div>
                      <div class="threshold">was ${change.baseline.toFixed(1)}%</div>
                      <div class="status-icon">${arrow}</div>
                      <div class="percentage ${colorClass}">${sign}${change.diff.toFixed(1)}%</div>
                  </div>
              </div>
            `;
          }).join('')}
      </div>
    `;
  }

  /**
   * Generate modules table HTML
   */
  generateModulesTableHTML(modules, thresholds) {
    return Object.entries(modules).map(([module, coverage]) => {
      if (coverage.missing) {
        return `
          <tr>
              <td class="module-name">${module}</td>
              <td colspan="4" style="color: #ef4444;">Missing from coverage</td>
              <td>❌</td>
          </tr>
        `;
      }

      const allPassed = Object.entries(coverage).every(([metric, value]) => 
        metric !== 'missing' && value >= thresholds[metric]
      );

      return `
        <tr>
            <td class="module-name">${module}</td>
            <td>${coverage.lines.toFixed(1)}%</td>
            <td>${coverage.functions.toFixed(1)}%</td>
            <td>${coverage.branches.toFixed(1)}%</td>
            <td>${coverage.statements.toFixed(1)}%</td>
            <td>${allPassed ? '✅' : '❌'}</td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Generate recommendations HTML
   */
  generateRecommendationsHTML(recommendations) {
    return `
      <div class="recommendations">
          <div class="card">
              <h2>💡 Recommendations</h2>
              ${recommendations.map(rec => `
                <div class="recommendation rec-${rec.priority}">
                    <div class="rec-title">
                        ${this.getPriorityIcon(rec.priority)} ${rec.type.toUpperCase()}: ${rec.message}
                    </div>
                    <div class="rec-action">Action: ${rec.action}</div>
                </div>
              `).join('')}
          </div>
      </div>
    `;
  }

  /**
   * Get priority icon
   */
  getPriorityIcon(priority) {
    const icons = {
      critical: '🚨',
      high: '⚠️',
      medium: '💡',
      info: 'ℹ️'
    };
    return icons[priority] || 'ℹ️';
  }

  /**
   * Generate dashboard
   */
  async generate() {
    try {
      console.log('🎨 Generating coverage dashboard...');

      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      // Load data
      const report = this.loadLatestReport();
      const trendData = this.loadTrendData();

      console.log('📊 Data loaded successfully');

      // Generate HTML
      const html = this.generateDashboard(report, trendData);
      
      // Write dashboard file
      const dashboardFile = path.join(this.outputDir, 'index.html');
      fs.writeFileSync(dashboardFile, html);

      console.log(`✅ Dashboard generated: ${dashboardFile}`);
      console.log(`🌐 Open in browser: file://${path.resolve(dashboardFile)}`);

      return dashboardFile;

    } catch (error) {
      console.error('❌ Dashboard generation failed:', error.message);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const dashboard = new CoverageDashboard();
  dashboard.generate().catch(console.error);
}

module.exports = CoverageDashboard;