/**
 * HalluciFix Test Dashboard JavaScript
 * Handles data loading, chart rendering, and real-time updates
 */

class TestDashboard {
    constructor() {
        this.apiBaseUrl = 'https://api.github.com/repos/your-org/hallucifix';
        this.charts = {};
        this.refreshInterval = 5 * 60 * 1000; // 5 minutes
        this.refreshTimer = null;
        
        this.init();
    }

    async init() {
        try {
            await this.loadDashboardData();
            this.setupEventListeners();
            this.startAutoRefresh();
            this.hideLoadingOverlay();
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    async loadDashboardData() {
        try {
            // Load data from multiple sources
            const [workflowRuns, issues, releases] = await Promise.all([
                this.fetchWorkflowRuns(),
                this.fetchIssues(),
                this.fetchReleases()
            ]);

            // Process and display data
            this.updateMetrics(workflowRuns);
            this.updateCharts(workflowRuns);
            this.updateTestSuites(workflowRuns);
            this.updateRecentIssues(issues);
            this.updatePerformanceMetrics(workflowRuns);
            this.updateFlakyTestsTable(issues);
            
            this.updateLastUpdatedTime();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            throw error;
        }
    }

    async fetchWorkflowRuns() {
        try {
            // In a real implementation, this would fetch from GitHub API
            // For demo purposes, we'll use mock data
            return this.getMockWorkflowData();
        } catch (error) {
            console.error('Error fetching workflow runs:', error);
            return [];
        }
    }

    async fetchIssues() {
        try {
            // Mock issues data
            return this.getMockIssuesData();
        } catch (error) {
            console.error('Error fetching issues:', error);
            return [];
        }
    }

    async fetchReleases() {
        try {
            // Mock releases data
            return this.getMockReleasesData();
        } catch (error) {
            console.error('Error fetching releases:', error);
            return [];
        }
    }

    updateMetrics(workflowRuns) {
        const recentRuns = workflowRuns.slice(0, 20);
        const successfulRuns = recentRuns.filter(run => run.conclusion === 'success');
        const successRate = recentRuns.length > 0 ? (successfulRuns.length / recentRuns.length * 100) : 0;

        // Update success rate
        document.getElementById('successRate').textContent = `${successRate.toFixed(1)}%`;
        this.updateTrend('successTrend', successRate, 85);

        // Update coverage (mock data)
        const coverage = 82.5;
        document.getElementById('coverage').textContent = `${coverage}%`;
        this.updateTrend('coverageTrend', coverage, 80);

        // Update flaky tests
        const flakyCount = 3;
        document.getElementById('flakyTests').textContent = flakyCount;
        this.updateTrend('flakyTrend', flakyCount, 5, true);

        // Update execution time
        const avgTime = 12.5;
        document.getElementById('executionTime').textContent = `${avgTime}min`;
        this.updateTrend('executionTrend', avgTime, 15, true);
    }

    updateTrend(elementId, current, baseline, isLowerBetter = false) {
        const element = document.getElementById(elementId);
        const change = ((current - baseline) / baseline * 100);
        const isPositive = isLowerBetter ? change < 0 : change > 0;
        
        element.className = isPositive ? 'trend-up' : (change === 0 ? 'trend-stable' : 'trend-down');
        
        const icon = isPositive ? 'fa-arrow-up' : (change === 0 ? 'fa-minus' : 'fa-arrow-down');
        element.innerHTML = `<i class="fas ${icon}"></i> ${Math.abs(change).toFixed(1)}%`;
    }

    updateCharts(workflowRuns) {
        this.createTestTrendChart(workflowRuns);
        this.createCoverageTrendChart();
        this.createPerformanceCharts();
    }

    createTestTrendChart(workflowRuns) {
        const ctx = document.getElementById('testTrendChart').getContext('2d');
        
        // Generate last 30 days of data
        const dates = [];
        const passData = [];
        const failData = [];
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toLocaleDateString());
            
            // Mock data with some variation
            const passCount = Math.floor(Math.random() * 20) + 80;
            const failCount = Math.floor(Math.random() * 10) + 2;
            
            passData.push(passCount);
            failData.push(failCount);
        }

        if (this.charts.testTrend) {
            this.charts.testTrend.destroy();
        }

        this.charts.testTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Passing Tests',
                    data: passData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Failing Tests',
                    data: failData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    createCoverageTrendChart() {
        const ctx = document.getElementById('coverageTrendChart').getContext('2d');
        
        // Generate coverage trend data
        const dates = [];
        const coverageData = [];
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toLocaleDateString());
            
            // Mock coverage data trending upward
            const coverage = 75 + Math.random() * 10 + (29 - i) * 0.2;
            coverageData.push(Math.min(coverage, 95));
        }

        if (this.charts.coverage) {
            this.charts.coverage.destroy();
        }

        this.charts.coverage = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Code Coverage %',
                    data: coverageData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        min: 70,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    createPerformanceCharts() {
        // Bundle Size Chart
        const bundleCtx = document.getElementById('bundleSizeChart').getContext('2d');
        const bundleSize = 1.8; // MB
        const bundleLimit = 2.0; // MB
        
        if (this.charts.bundleSize) {
            this.charts.bundleSize.destroy();
        }

        this.charts.bundleSize = new Chart(bundleCtx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [bundleSize, bundleLimit - bundleSize],
                    backgroundColor: ['#3b82f6', '#e5e7eb'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
        document.getElementById('bundleSizeValue').textContent = `${bundleSize} MB`;

        // Web Vitals Chart
        const vitalsCtx = document.getElementById('webVitalsChart').getContext('2d');
        const vitalsScore = 85;
        
        if (this.charts.webVitals) {
            this.charts.webVitals.destroy();
        }

        this.charts.webVitals = new Chart(vitalsCtx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [vitalsScore, 100 - vitalsScore],
                    backgroundColor: ['#10b981', '#e5e7eb'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
        document.getElementById('webVitalsValue').textContent = vitalsScore;

        // Test Speed Chart
        const speedCtx = document.getElementById('testSpeedChart').getContext('2d');
        const testSpeed = 12.5; // minutes
        const speedLimit = 15; // minutes
        
        if (this.charts.testSpeed) {
            this.charts.testSpeed.destroy();
        }

        this.charts.testSpeed = new Chart(speedCtx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [testSpeed, speedLimit - testSpeed],
                    backgroundColor: ['#8b5cf6', '#e5e7eb'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
        document.getElementById('testSpeedValue').textContent = `${testSpeed} min`;
    }

    updateTestSuites(workflowRuns) {
        const testSuites = [
            { name: 'Unit Tests', status: 'passing', tests: 245, duration: '2.3min' },
            { name: 'Integration Tests', status: 'passing', tests: 89, duration: '4.7min' },
            { name: 'E2E Tests', status: 'failing', tests: 34, duration: '8.2min' },
            { name: 'Visual Tests', status: 'passing', tests: 67, duration: '3.1min' },
            { name: 'Performance Tests', status: 'flaky', tests: 12, duration: '5.4min' },
            { name: 'Security Tests', status: 'passing', tests: 23, duration: '1.8min' }
        ];

        const container = document.getElementById('testSuites');
        container.innerHTML = testSuites.map(suite => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center">
                    <span class="status-indicator status-${suite.status}"></span>
                    <div>
                        <p class="font-medium text-gray-900">${suite.name}</p>
                        <p class="text-sm text-gray-500">${suite.tests} tests • ${suite.duration}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getStatusBadgeClass(suite.status)}">
                        ${suite.status}
                    </span>
                </div>
            </div>
        `).join('');
    }

    updateRecentIssues(issues) {
        const recentIssues = [
            {
                title: 'E2E test timeout in authentication flow',
                type: 'test-failure',
                created: '2 hours ago',
                severity: 'high'
            },
            {
                title: 'Coverage dropped below 80% threshold',
                type: 'coverage',
                created: '1 day ago',
                severity: 'medium'
            },
            {
                title: 'Flaky test detected in payment processing',
                type: 'flaky-test',
                created: '2 days ago',
                severity: 'medium'
            },
            {
                title: 'Performance regression in bundle size',
                type: 'performance',
                created: '3 days ago',
                severity: 'low'
            }
        ];

        const container = document.getElementById('recentIssues');
        container.innerHTML = recentIssues.map(issue => `
            <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div class="flex-shrink-0">
                    <i class="fas ${this.getIssueIcon(issue.type)} text-${this.getSeverityColor(issue.severity)}-500"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">${issue.title}</p>
                    <p class="text-xs text-gray-500">${issue.created}</p>
                </div>
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${this.getSeverityBadgeClass(issue.severity)}">
                    ${issue.severity}
                </span>
            </div>
        `).join('');
    }

    updatePerformanceMetrics(workflowRuns) {
        // Performance metrics are updated in createPerformanceCharts
        // This method can be used for additional performance data processing
    }

    updateFlakyTestsTable(issues) {
        const flakyTests = [
            {
                name: 'PaymentFlow.test.tsx > should process payment successfully',
                failureRate: 15.2,
                lastFailure: '2 hours ago',
                impact: 'High',
                trend: 'increasing'
            },
            {
                name: 'AuthenticationFlow.test.tsx > should login with Google OAuth',
                failureRate: 8.7,
                lastFailure: '1 day ago',
                impact: 'Medium',
                trend: 'stable'
            },
            {
                name: 'AnalysisEngine.test.tsx > should analyze document content',
                failureRate: 12.1,
                lastFailure: '3 hours ago',
                impact: 'High',
                trend: 'decreasing'
            }
        ];

        const tbody = document.getElementById('flakyTestsTable');
        tbody.innerHTML = flakyTests.map(test => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">${test.name}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${test.failureRate}%</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-500">${test.lastFailure}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getImpactBadgeClass(test.impact)}">
                        ${test.impact}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button class="text-indigo-600 hover:text-indigo-900 mr-3">Investigate</button>
                    <button class="text-red-600 hover:text-red-900">Quarantine</button>
                </td>
            </tr>
        `).join('');
    }

    updateLastUpdatedTime() {
        document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.showLoadingOverlay();
            this.loadDashboardData().finally(() => {
                this.hideLoadingOverlay();
            });
        });
    }

    startAutoRefresh() {
        this.refreshTimer = setInterval(() => {
            this.loadDashboardData();
        }, this.refreshInterval);
    }

    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    showLoadingOverlay() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    hideLoadingOverlay() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    showError(message) {
        // Simple error display - in production, use a proper notification system
        alert(`Error: ${message}`);
        this.hideLoadingOverlay();
    }

    // Utility methods for styling
    getStatusBadgeClass(status) {
        const classes = {
            passing: 'bg-green-100 text-green-800',
            failing: 'bg-red-100 text-red-800',
            flaky: 'bg-yellow-100 text-yellow-800',
            unknown: 'bg-gray-100 text-gray-800'
        };
        return classes[status] || classes.unknown;
    }

    getIssueIcon(type) {
        const icons = {
            'test-failure': 'fa-times-circle',
            'coverage': 'fa-shield-alt',
            'flaky-test': 'fa-exclamation-triangle',
            'performance': 'fa-tachometer-alt'
        };
        return icons[type] || 'fa-question-circle';
    }

    getSeverityColor(severity) {
        const colors = {
            critical: 'red',
            high: 'red',
            medium: 'yellow',
            low: 'blue'
        };
        return colors[severity] || 'gray';
    }

    getSeverityBadgeClass(severity) {
        const classes = {
            critical: 'bg-red-100 text-red-800',
            high: 'bg-red-100 text-red-800',
            medium: 'bg-yellow-100 text-yellow-800',
            low: 'bg-blue-100 text-blue-800'
        };
        return classes[severity] || 'bg-gray-100 text-gray-800';
    }

    getImpactBadgeClass(impact) {
        const classes = {
            High: 'bg-red-100 text-red-800',
            Medium: 'bg-yellow-100 text-yellow-800',
            Low: 'bg-green-100 text-green-800'
        };
        return classes[impact] || 'bg-gray-100 text-gray-800';
    }

    // Mock data methods (replace with real API calls in production)
    getMockWorkflowData() {
        const runs = [];
        for (let i = 0; i < 50; i++) {
            runs.push({
                id: i,
                conclusion: Math.random() > 0.15 ? 'success' : 'failure',
                created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                run_number: 1000 + i
            });
        }
        return runs;
    }

    getMockIssuesData() {
        return [
            { title: 'Test failure in authentication', labels: [{ name: 'test-failure' }] },
            { title: 'Coverage regression detected', labels: [{ name: 'coverage' }] },
            { title: 'Flaky test in payment flow', labels: [{ name: 'flaky-test' }] }
        ];
    }

    getMockReleasesData() {
        return [
            { tag_name: 'v1.2.0', published_at: new Date().toISOString() }
        ];
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TestDashboard();
});