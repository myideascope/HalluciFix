/**
 * Error Monitoring Dashboard
 * Real-time error metrics, trends, and alert management
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Shield, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings,
  RefreshCw,
  Bell,
  BellOff
} from 'lucide-react';
import { errorMonitor, MonitoringMetrics, AlertEvent, MonitoringThreshold } from '../lib/errors/errorMonitor';
import { ErrorSeverity, ErrorType } from '../lib/errors/types';

interface ErrorMonitoringDashboardProps {
  className?: string;
}

export const ErrorMonitoringDashboard: React.FC<ErrorMonitoringDashboardProps> = ({ 
  className = '' 
}) => {
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [thresholds, setThresholds] = useState<MonitoringThreshold[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);

  // Load initial data and setup listeners
  useEffect(() => {
    const loadData = () => {
      setMetrics(errorMonitor.getMetrics());
      setAlerts(errorMonitor.getAlertHistory(20));
      setThresholds(errorMonitor.getThresholds());
      setIsLoading(false);
    };

    loadData();

    // Setup listeners for real-time updates
    const metricsListener = (newMetrics: MonitoringMetrics) => {
      setMetrics(newMetrics);
    };

    const alertListener = (alert: AlertEvent) => {
      setAlerts(prev => [alert, ...prev.slice(0, 19)]);
    };

    errorMonitor.addMetricsListener(metricsListener);
    errorMonitor.addAlertListener(alertListener);

    // Cleanup listeners on unmount
    return () => {
      errorMonitor.removeMetricsListener(metricsListener);
      errorMonitor.removeAlertListener(alertListener);
    };
  }, []);

  // Calculate trend indicators
  const trendData = useMemo(() => {
    if (!metrics) return null;

    const now = new Date();
    const previousPeriod = new Date(now.getTime() - 300000); // 5 minutes ago
    
    // This would typically compare with historical data
    // For now, we'll use current metrics as baseline
    return {
      errorRateTrend: metrics.errorRate > 5 ? 'up' : metrics.errorRate > 0 ? 'stable' : 'down',
      criticalErrorsTrend: metrics.criticalErrors > 0 ? 'up' : 'down',
      totalErrorsTrend: metrics.totalErrors > 10 ? 'up' : 'stable'
    };
  }, [metrics]);

  const handleRefreshMetrics = () => {
    errorMonitor.updateMetrics();
  };

  const handleResolveAlert = (alertId: string) => {
    errorMonitor.resolveAlert(alertId);
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, resolved: true, resolvedAt: new Date().toISOString() } : alert
    ));
  };

  const handleToggleThreshold = (thresholdId: string) => {
    const threshold = thresholds.find(t => t.id === thresholdId);
    if (threshold) {
      const updated = { ...threshold, enabled: !threshold.enabled };
      errorMonitor.updateThreshold(updated);
      setThresholds(prev => prev.map(t => t.id === thresholdId ? updated : t));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-600">Loading monitoring data...</span>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center p-8 text-slate-500">
        No monitoring data available
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Error Monitoring</h2>
          <p className="text-slate-600">Real-time error tracking and alerting</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefreshMetrics}
            className="flex items-center space-x-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowThresholdConfig(!showThresholdConfig)}
            className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Configure</span>
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Error Rate */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Error Rate</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.errorRate}</p>
              <p className="text-xs text-slate-500">errors/minute</p>
            </div>
            <div className={`p-3 rounded-full ${
              metrics.errorRate > 10 ? 'bg-red-100' : 
              metrics.errorRate > 5 ? 'bg-orange-100' : 'bg-green-100'
            }`}>
              <Activity className={`w-6 h-6 ${
                metrics.errorRate > 10 ? 'text-red-600' : 
                metrics.errorRate > 5 ? 'text-orange-600' : 'text-green-600'
              }`} />
            </div>
          </div>
          {trendData && (
            <div className="mt-4 flex items-center">
              {trendData.errorRateTrend === 'up' ? (
                <TrendingUp className="w-4 h-4 text-red-500" />
              ) : trendData.errorRateTrend === 'down' ? (
                <TrendingDown className="w-4 h-4 text-green-500" />
              ) : (
                <div className="w-4 h-4 bg-slate-400 rounded-full" />
              )}
              <span className={`ml-1 text-xs ${
                trendData.errorRateTrend === 'up' ? 'text-red-600' : 
                trendData.errorRateTrend === 'down' ? 'text-green-600' : 'text-slate-600'
              }`}>
                {trendData.errorRateTrend === 'up' ? 'Increasing' : 
                 trendData.errorRateTrend === 'down' ? 'Decreasing' : 'Stable'}
              </span>
            </div>
          )}
        </div>

        {/* Critical Errors */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Critical Errors</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.criticalErrors}</p>
              <p className="text-xs text-slate-500">last 5 minutes</p>
            </div>
            <div className={`p-3 rounded-full ${
              metrics.criticalErrors > 0 ? 'bg-red-100' : 'bg-green-100'
            }`}>
              <AlertTriangle className={`w-6 h-6 ${
                metrics.criticalErrors > 0 ? 'text-red-600' : 'text-green-600'
              }`} />
            </div>
          </div>
        </div>

        {/* High Severity Errors */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">High Severity</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.highSeverityErrors}</p>
              <p className="text-xs text-slate-500">last 5 minutes</p>
            </div>
            <div className={`p-3 rounded-full ${
              metrics.highSeverityErrors > 0 ? 'bg-orange-100' : 'bg-green-100'
            }`}>
              <AlertCircle className={`w-6 h-6 ${
                metrics.highSeverityErrors > 0 ? 'text-orange-600' : 'text-green-600'
              }`} />
            </div>
          </div>
        </div>

        {/* Total Errors */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Total Errors</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.totalErrors}</p>
              <p className="text-xs text-slate-500">all time</p>
            </div>
            <div className="p-3 rounded-full bg-blue-100">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Error Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Errors by Type */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Errors by Type</h3>
          <div className="space-y-3">
            {Object.entries(metrics.errorsByType).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{type.replace('_', ' ')}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ 
                        width: `${Math.min((count / Math.max(...Object.values(metrics.errorsByType))) * 100, 100)}%` 
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-900 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Errors by Severity */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Errors by Severity</h3>
          <div className="space-y-3">
            {Object.entries(metrics.errorsBySeverity).map(([severity, count]) => {
              const severityColors = {
                [ErrorSeverity.CRITICAL]: 'bg-red-600',
                [ErrorSeverity.HIGH]: 'bg-orange-600',
                [ErrorSeverity.MEDIUM]: 'bg-yellow-600',
                [ErrorSeverity.LOW]: 'bg-blue-600'
              };
              
              return (
                <div key={severity} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 capitalize">{severity}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-slate-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${severityColors[severity as ErrorSeverity]}`}
                        style={{ 
                          width: `${Math.min((count / Math.max(...Object.values(metrics.errorsBySeverity))) * 100, 100)}%` 
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-900 w-8 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Recent Alerts</h3>
        </div>
        <div className="divide-y divide-slate-200">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p>No recent alerts</p>
            </div>
          ) : (
            alerts.slice(0, 10).map((alert) => (
              <div key={alert.id} className="p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`p-1 rounded-full ${
                      alert.severity === 'critical' ? 'bg-red-100' :
                      alert.severity === 'high' ? 'bg-orange-100' :
                      alert.severity === 'medium' ? 'bg-yellow-100' : 'bg-blue-100'
                    }`}>
                      <AlertTriangle className={`w-4 h-4 ${
                        alert.severity === 'critical' ? 'text-red-600' :
                        alert.severity === 'high' ? 'text-orange-600' :
                        alert.severity === 'medium' ? 'text-yellow-600' : 'text-blue-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{alert.thresholdName}</p>
                      <p className="text-sm text-slate-600">{alert.message}</p>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="text-xs text-slate-500 flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          alert.resolved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {alert.resolved ? 'Resolved' : 'Active'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!alert.resolved && (
                    <button
                      onClick={() => handleResolveAlert(alert.id)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Threshold Configuration */}
      {showThresholdConfig && (
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Alert Thresholds</h3>
          </div>
          <div className="divide-y divide-slate-200">
            {thresholds.map((threshold) => (
              <div key={threshold.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleToggleThreshold(threshold.id)}
                        className={`p-1 rounded-full ${
                          threshold.enabled ? 'bg-green-100' : 'bg-slate-100'
                        }`}
                      >
                        {threshold.enabled ? (
                          <Bell className="w-4 h-4 text-green-600" />
                        ) : (
                          <BellOff className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{threshold.name}</p>
                        <p className="text-sm text-slate-600">{threshold.description}</p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Threshold: {threshold.condition.threshold} | 
                      Window: {threshold.condition.timeWindow / 1000}s | 
                      Cooldown: {threshold.cooldownPeriod / 1000}s
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs ${
                    threshold.enabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {threshold.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};