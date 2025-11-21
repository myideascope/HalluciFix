import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, DollarSign, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { getAPIMonitor, ProviderMetrics, Alert } from '../lib/monitoring/apiMonitor';
import { getCostTracker, CostSummary, CostAlert } from '../lib/monitoring/costTracker';

import { logger } from './logging';
interface MonitoringDashboardProps {
  providers: string[];
  refreshInterval?: number;
}

export function MonitoringDashboard({ providers, refreshInterval = 30000 }: MonitoringDashboardProps) {
  const [metrics, setMetrics] = useState<Record<string, ProviderMetrics>>({});
  const [costSummaries, setCostSummaries] = useState<Record<string, CostSummary>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [costAlerts, setCostAlerts] = useState<CostAlert[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'hour' | 'day' | 'month'>('hour');

  useEffect(() => {
    const loadData = () => {
      try {
        const monitor = getAPIMonitor();
        const costTracker = getCostTracker();

        // Load metrics for each provider
        const newMetrics: Record<string, ProviderMetrics> = {};
        const newCostSummaries: Record<string, CostSummary> = {};

        providers.forEach(provider => {
          newMetrics[provider] = monitor.getProviderMetrics(provider);
          newCostSummaries[provider] = costTracker.getCostSummary(provider, selectedPeriod);
        });

        setMetrics(newMetrics);
        setCostSummaries(newCostSummaries);
      } catch (error) {
        logger.error("Error loading monitoring data:", error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Initial load
    loadData();

    // Set up refresh interval
    const interval = setInterval(loadData, refreshInterval);

    return () => clearInterval(interval);
  }, [providers, selectedPeriod, refreshInterval]);

  useEffect(() => {
    // Set up alert listeners
    try {
      const monitor = getAPIMonitor();
      const costTracker = getCostTracker();

      const handleAlert = (alert: Alert) => {
        setAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts
      };

      const handleCostAlert = (alert: CostAlert) => {
        setCostAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts
      };

      monitor.onAlert(handleAlert);
      costTracker.onCostAlert(handleCostAlert);
    } catch (error) {
      logger.error("Error setting up alert listeners:", error instanceof Error ? error : new Error(String(error)));
    }
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">API Monitoring Dashboard</h2>
        <div className="flex items-center space-x-4">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as 'hour' | 'day' | 'month')}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="hour">Last Hour</option>
            <option value="day">Last Day</option>
            <option value="month">Last Month</option>
          </select>
        </div>
      </div>

      {/* Alerts Section */}
      {(alerts.length > 0 || costAlerts.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
            Recent Alerts
          </h3>
          <div className="space-y-2">
            {[...alerts, ...costAlerts].slice(0, 5).map((alert, index) => (
              <div
                key={index}
                className={`p-3 rounded-md border ${getSeverityColor('severity' in alert ? alert.severity : 'warning')}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{alert.provider}</p>
                    <p className="text-sm">{alert.message}</p>
                  </div>
                  <span className="text-xs">
                    {alert.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {providers.map(provider => {
          const metric = metrics[provider];
          const costSummary = costSummaries[provider];

          if (!metric || !costSummary) {
            return (
              <div key={provider} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                  {provider}
                </h3>
                <p className="text-gray-500">Loading...</p>
              </div>
            );
          }

          return (
            <div key={provider} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize mb-4">
                {provider}
              </h3>

              {/* Performance Metrics */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Requests</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {metric.totalRequests}
                      </p>
                    </div>
                    <Activity className="w-8 h-8 text-blue-500" />
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Avg Response</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatDuration(metric.avgResponseTime)}
                      </p>
                    </div>
                    <Clock className="w-8 h-8 text-green-500" />
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Error Rate</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {metric.errorRate.toFixed(1)}%
                      </p>
                    </div>
                    <AlertTriangle className={`w-8 h-8 ${metric.errorRate > 5 ? 'text-red-500' : 'text-gray-400'}`} />
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Cost</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(costSummary.totalCost)}
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-yellow-500" />
                  </div>
                </div>
              </div>

              {/* Cost Trend */}
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Cost Trend</span>
                  <div className="flex items-center">
                    {costSummary.costTrend > 0 ? (
                      <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                    )}
                    <span className={`text-sm font-medium ${costSummary.costTrend > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {Math.abs(costSummary.costTrend).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Budget Usage */}
              {costSummary.budgetRemaining !== null && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <span>Budget Usage</span>
                    <span>{costSummary.budgetUsage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        costSummary.budgetUsage >= 90 ? 'bg-red-500' :
                        costSummary.budgetUsage >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(costSummary.budgetUsage, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Remaining: {formatCurrency(costSummary.budgetRemaining)}
                  </p>
                </div>
              )}

              {/* Quota Status */}
              {metric.quotaStatus.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Quota Status</h4>
                  <div className="space-y-2">
                    {metric.quotaStatus.map((quota, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {quota.type}
                        </span>
                        <div className="flex items-center">
                          <span className={`text-sm font-medium ${getStatusColor(quota.status)}`}>
                            {quota.usagePercentage.toFixed(1)}%
                          </span>
                          <span className="text-xs text-gray-500 ml-2">
                            ({quota.used.toLocaleString()} / {quota.limit.toLocaleString()})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MonitoringDashboard;