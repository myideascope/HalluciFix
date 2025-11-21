import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, DollarSign, Clock } from 'lucide-react';

import { logger } from './logging';
interface BedrockMetrics {
  overallHealth: 'healthy' | 'warning' | 'critical';
  models: Array<{
    modelId: string;
    health: 'healthy' | 'warning' | 'critical';
    metrics: {
      requestsPerHour: number;
      averageLatency: number;
      errorRate: number;
      throttleRate: number;
      costPerHour: number;
      quotaUtilization: number;
    };
    alerts: Array<{
      id: string;
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
    }>;
  }>;
  systemMetrics: {
    totalRequests: number;
    totalCost: number;
    averageLatency: number;
    overallErrorRate: number;
    overallThrottleRate: number;
  };
  recentAlerts: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: string;
  }>;
}

interface CostAnalysis {
  totalCost: number;
  costByModel: Array<{ modelId: string; cost: number; percentage: number }>;
  projectedMonthlyCost: number;
  tokenUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    costPerInputToken: number;
    costPerOutputToken: number;
  };
}

export const BedrockMonitoringDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<BedrockMetrics | null>(null);
  const [costAnalysis, setCostAnalysis] = useState<CostAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [selectedTimeRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // In a real implementation, these would be API calls
      const mockMetrics: BedrockMetrics = {
        overallHealth: 'healthy',
        models: [
          {
            modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
            health: 'healthy',
            metrics: {
              requestsPerHour: 45,
              averageLatency: 2340,
              errorRate: 0.02,
              throttleRate: 0.001,
              costPerHour: 2.45,
              quotaUtilization: 23.5,
            },
            alerts: [],
          },
          {
            modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
            health: 'warning',
            metrics: {
              requestsPerHour: 120,
              averageLatency: 890,
              errorRate: 0.08,
              throttleRate: 0.02,
              costPerHour: 0.85,
              quotaUtilization: 67.2,
            },
            alerts: [
              {
                id: 'alert-1',
                type: 'error_spike',
                severity: 'medium',
                message: 'Error rate above warning threshold',
              },
            ],
          },
        ],
        systemMetrics: {
          totalRequests: 165,
          totalCost: 3.30,
          averageLatency: 1615,
          overallErrorRate: 0.05,
          overallThrottleRate: 0.01,
        },
        recentAlerts: [
          {
            id: 'alert-1',
            type: 'error_spike',
            severity: 'medium',
            message: 'Claude 3 Haiku error rate above warning threshold',
            timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          },
        ],
      };

      const mockCostAnalysis: CostAnalysis = {
        totalCost: 78.45,
        costByModel: [
          { modelId: 'anthropic.claude-3-sonnet-20240229-v1:0', cost: 58.90, percentage: 75.1 },
          { modelId: 'anthropic.claude-3-haiku-20240307-v1:0', cost: 19.55, percentage: 24.9 },
        ],
        projectedMonthlyCost: 2353.50,
        tokenUsage: {
          totalInputTokens: 1250000,
          totalOutputTokens: 890000,
          costPerInputToken: 0.000003,
          costPerOutputToken: 0.000015,
        },
      };

      setMetrics(mockMetrics);
      setCostAnalysis(mockCostAnalysis);
      setError(null);
    } catch (err) {
      setError('Failed to load monitoring data');
      logger.error("Error loading dashboard data:", err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'text-blue-600 bg-blue-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics || !costAnalysis) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Bedrock Monitoring Dashboard</h1>
        <div className="flex items-center space-x-4">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getHealthColor(metrics.overallHealth)}`}>
            {metrics.overallHealth.charAt(0).toUpperCase() + metrics.overallHealth.slice(1)}
          </div>
        </div>
      </div>

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(metrics.systemMetrics.totalRequests)}</p>
            </div>
            <Activity className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(costAnalysis.totalCost)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Latency</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.systemMetrics.averageLatency.toFixed(0)}ms</p>
            </div>
            <Clock className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Error Rate</p>
              <p className="text-2xl font-bold text-gray-900">{(metrics.systemMetrics.overallErrorRate * 100).toFixed(2)}%</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Model Performance */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Model Performance</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {metrics.models.map((model) => (
              <div key={model.modelId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-medium text-gray-900">{model.modelId}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getHealthColor(model.health)}`}>
                      {model.health}
                    </span>
                  </div>
                  {model.alerts.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm text-yellow-600">{model.alerts.length} alert(s)</span>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Requests/Hour</p>
                    <p className="font-semibold">{model.metrics.requestsPerHour.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Latency</p>
                    <p className="font-semibold">{model.metrics.averageLatency.toFixed(0)}ms</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Error Rate</p>
                    <p className="font-semibold">{(model.metrics.errorRate * 100).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Throttle Rate</p>
                    <p className="font-semibold">{(model.metrics.throttleRate * 100).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Cost/Hour</p>
                    <p className="font-semibold">{formatCurrency(model.metrics.costPerHour)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Quota Usage</p>
                    <p className="font-semibold">{model.metrics.quotaUtilization.toFixed(1)}%</p>
                  </div>
                </div>

                {model.alerts.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="space-y-2">
                      {model.alerts.map((alert) => (
                        <div key={alert.id} className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                            {alert.severity}
                          </span>
                          <span className="text-sm text-gray-700">{alert.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cost Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Cost Breakdown</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {costAnalysis.costByModel.map((model) => (
                <div key={model.modelId} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{model.modelId}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${model.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(model.cost)}</p>
                    <p className="text-xs text-gray-600">{model.percentage.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Projected Monthly Cost</span>
                <span className="text-lg font-bold text-gray-900">{formatCurrency(costAnalysis.projectedMonthlyCost)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Token Usage</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Input Tokens</span>
                <span className="font-semibold">{formatNumber(costAnalysis.tokenUsage.totalInputTokens)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Output Tokens</span>
                <span className="font-semibold">{formatNumber(costAnalysis.tokenUsage.totalOutputTokens)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Cost per Input Token</span>
                <span className="font-semibold">{formatCurrency(costAnalysis.tokenUsage.costPerInputToken)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Cost per Output Token</span>
                <span className="font-semibold">{formatCurrency(costAnalysis.tokenUsage.costPerOutputToken)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      {metrics.recentAlerts.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Alerts</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {metrics.recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                    {alert.severity}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                    <p className="text-xs text-gray-600">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BedrockMonitoringDashboard;