import React, { useState, useEffect, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { aiPerformanceMonitoringService } from '../lib/aiPerformanceMonitoringService';

import { logger } from './logging';
interface AIPerformanceMonitoringProps {
  refreshInterval?: number;
}

const AIPerformanceMonitoring: React.FC<AIPerformanceMonitoringProps> = ({ 
  refreshInterval = 30000 // 30 seconds
}) => {
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [providerTrends, setProviderTrends] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealthStatus = useCallback(async () => {
    try {
      const status = await aiPerformanceMonitoringService.getServiceHealthStatus();
      setHealthStatus(status);
      
      if (!selectedProvider && status.providerPerformance.length > 0) {
        setSelectedProvider(`${status.providerPerformance[0].provider}:${status.providerPerformance[0].model}`);
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to load AI service health status');
      logger.error("Error loading health status:", err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [selectedProvider]);

  const loadAlerts = useCallback(async () => {
    try {
      const currentAlerts = aiPerformanceMonitoringService.getPerformanceAlerts(false);
      setAlerts(currentAlerts);
    } catch (err) {
      logger.error("Error loading alerts:", err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const loadProviderTrends = useCallback(async (providerKey: string) => {
    try {
      const [provider, model] = providerKey.split(':');
      const trends = await aiPerformanceMonitoringService.getProviderTrends(provider, model);
      setProviderTrends(trends);
    } catch (err) {
      logger.error("Error loading provider trends:", err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    loadHealthStatus();
    loadAlerts();

    const interval = setInterval(() => {
      loadHealthStatus();
      loadAlerts();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]); // Removed loadHealthStatus and loadAlerts since they're now stable

  useEffect(() => {
    if (selectedProvider) {
      loadProviderTrends(selectedProvider);
    }
  }, [selectedProvider]); // Removed loadProviderTrends since it's now stable

  const getHealthStatusColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getAlertSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'degrading': return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Minus className="w-4 h-4 text-slate-600" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
        <span className="ml-2 text-slate-600 dark:text-slate-400">Loading AI performance data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
          <span className="text-red-800 dark:text-red-200">{error}</span>
        </div>
      </div>
    );
  }

  if (!healthStatus) {
    return (
      <div className="text-center p-8 text-slate-600 dark:text-slate-400">
        No AI performance data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Health Status */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">AI Service Health</h2>
          <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getHealthStatusColor(healthStatus.overallHealth)}`}>
            {healthStatus.overallHealth.charAt(0).toUpperCase() + healthStatus.overallHealth.slice(1)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Requests</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {healthStatus.systemMetrics.totalRequests.toLocaleString()}
                </p>
              </div>
              <Activity className="w-8 h-8 text-slate-400" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Avg Response Time</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {Math.round(healthStatus.systemMetrics.averageResponseTime)}ms
                </p>
              </div>
              <Clock className="w-8 h-8 text-slate-400" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Overall Accuracy</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {healthStatus.systemMetrics.overallAccuracy.toFixed(1)}%
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-slate-400" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Cost</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {formatCurrency(healthStatus.systemMetrics.totalCost)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">Healthy Providers</p>
            <p className="text-lg font-semibold text-green-600">{healthStatus.healthyProviders}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">Degraded Providers</p>
            <p className="text-lg font-semibold text-amber-600">{healthStatus.degradedProviders}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">Failed Providers</p>
            <p className="text-lg font-semibold text-red-600">{healthStatus.failedProviders}</p>
          </div>
        </div>
      </div>

      {/* Provider Performance */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Provider Performance</h3>
        
        <div className="space-y-4">
          {healthStatus.providerPerformance.map((provider: any) => (
            <div 
              key={`${provider.provider}:${provider.model}`}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedProvider === `${provider.provider}:${provider.model}`
                  ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
              onClick={() => setSelectedProvider(`${provider.provider}:${provider.model}`)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                    {provider.provider} - {provider.model}
                  </h4>
                  {getTrendIcon(provider.performanceTrend)}
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    provider.availability > 0.95 ? 'bg-green-100 text-green-800' :
                    provider.availability > 0.9 ? 'bg-amber-100 text-amber-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {formatPercentage(provider.availability)} uptime
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <p className="text-slate-600 dark:text-slate-400">Requests</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{provider.totalRequests}</p>
                </div>
                <div>
                  <p className="text-slate-600 dark:text-slate-400">Avg Response</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{Math.round(provider.averageResponseTime)}ms</p>
                </div>
                <div>
                  <p className="text-slate-600 dark:text-slate-400">Accuracy</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{provider.averageAccuracy.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-slate-600 dark:text-slate-400">Error Rate</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{formatPercentage(provider.errorRate)}</p>
                </div>
                <div>
                  <p className="text-slate-600 dark:text-slate-400">Total Cost</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(provider.totalCost)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 text-amber-600 mr-2" />
            Active Alerts ({alerts.length})
          </h3>
          
          <div className="space-y-3">
            {alerts.slice(0, 10).map((alert) => (
              <div 
                key={alert.id}
                className={`border rounded-lg p-3 ${getAlertSeverityColor(alert.severity)}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm opacity-75">
                      {alert.provider} - {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-white bg-opacity-50">
                    {alert.severity.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Trends */}
      {providerTrends && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
            Performance Trends - {selectedProvider}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Response Time Trend</h4>
              <div className="h-32 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <p className="text-slate-600 dark:text-slate-400">Chart visualization would go here</p>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Accuracy Trend</h4>
              <div className="h-32 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <p className="text-slate-600 dark:text-slate-400">Chart visualization would go here</p>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Cost Trend</h4>
              <div className="h-32 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <p className="text-slate-600 dark:text-slate-400">Chart visualization would go here</p>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Request Volume</h4>
              <div className="h-32 bg-slate-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <p className="text-slate-600 dark:text-slate-400">Chart visualization would go here</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIPerformanceMonitoring;