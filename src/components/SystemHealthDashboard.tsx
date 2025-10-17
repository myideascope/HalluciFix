/**
 * System Health and Performance Dashboard
 * Real-time system health monitoring with key metrics, performance tracking, and error monitoring
 */

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Cpu, 
  HardDrive, 
  Wifi, 
  Memory,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Server,
  Database,
  Globe,
  Zap
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { performanceMonitor, PerformanceMetric } from '../lib/performanceMonitor';
import { healthCheckService, HealthCheckResult, HealthStatus } from '../lib/errors/healthCheck';
import { errorMonitor, MonitoringMetrics } from '../lib/errors/errorMonitor';

interface SystemHealthDashboardProps {
  className?: string;
  refreshInterval?: number;
}

interface MetricTrend {
  timestamp: string;
  responseTime: number;
  errorRate: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
}

interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTime: number;
  uptime: number;
  lastCheck: Date;
}

export const SystemHealthDashboard: React.FC<SystemHealthDashboardProps> = ({ 
  className = '',
  refreshInterval = 30000 
}) => {
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [errorMetrics, setErrorMetrics] = useState<MonitoringMetrics | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([]);
  const [trendData, setTrendData] = useState<MetricTrend[]>([]);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h'>('1h');

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        
        // Load health check results
        const health = await healthCheckService.performHealthCheck();
        setHealthResult(health);

        // Load error metrics
        const errors = errorMonitor.getMetrics();
        setErrorMetrics(errors);

        // Load performance metrics
        const perfMetrics = performanceMonitor.getCurrentMetrics();
        setPerformanceMetrics(perfMetrics);

        // Generate trend data (in real implementation, this would come from time-series data)
        const trends = generateTrendData(selectedTimeRange);
        setTrendData(trends);

        // Load service health data
        const services = await loadServiceHealth();
        setServiceHealth(services);

      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
    
    // Set up refresh interval
    const interval = setInterval(loadDashboardData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedTimeRange, refreshInterval]);

  const generateTrendData = (timeRange: '1h' | '6h' | '24h'): MetricTrend[] => {
    const points = timeRange === '1h' ? 12 : timeRange === '6h' ? 24 : 48;
    const intervalMs = timeRange === '1h' ? 5 * 60 * 1000 : timeRange === '6h' ? 15 * 60 * 1000 : 30 * 60 * 1000;
    
    const now = Date.now();
    const trends: MetricTrend[] = [];
    
    for (let i = points - 1; i >= 0; i--) {
      const timestamp = new Date(now - (i * intervalMs));
      trends.push({
        timestamp: timestamp.toLocaleTimeString(),
        responseTime: Math.random() * 200 + 100 + (Math.sin(i / 5) * 50),
        errorRate: Math.max(0, Math.random() * 5 + (Math.sin(i / 3) * 2)),
        throughput: Math.random() * 100 + 200 + (Math.cos(i / 4) * 30),
        cpuUsage: Math.random() * 30 + 40 + (Math.sin(i / 6) * 15),
        memoryUsage: Math.random() * 20 + 60 + (Math.cos(i / 7) * 10)
      });
    }
    
    return trends;
  };

  const loadServiceHealth = async (): Promise<ServiceHealth[]> => {
    // In real implementation, this would query actual services
    return [
      {
        name: 'API Gateway',
        status: HealthStatus.HEALTHY,
        responseTime: 45,
        uptime: 99.9,
        lastCheck: new Date()
      },
      {
        name: 'Database',
        status: HealthStatus.HEALTHY,
        responseTime: 12,
        uptime: 99.95,
        lastCheck: new Date()
      },
      {
        name: 'Authentication Service',
        status: HealthStatus.DEGRADED,
        responseTime: 180,
        uptime: 98.5,
        lastCheck: new Date()
      },
      {
        name: 'Analysis Engine',
        status: HealthStatus.HEALTHY,
        responseTime: 320,
        uptime: 99.8,
        lastCheck: new Date()
      },
      {
        name: 'File Processing',
        status: HealthStatus.HEALTHY,
        responseTime: 95,
        uptime: 99.7,
        lastCheck: new Date()
      }
    ];
  };

  const getStatusColor = (status: HealthStatus) => {
    switch (status) {
      case HealthStatus.HEALTHY:
        return 'text-green-600 bg-green-100';
      case HealthStatus.DEGRADED:
        return 'text-yellow-600 bg-yellow-100';
      case HealthStatus.UNHEALTHY:
        return 'text-orange-600 bg-orange-100';
      case HealthStatus.CRITICAL:
        return 'text-red-600 bg-red-100';
      default:
        return 'text-slate-600 bg-slate-100';
    }
  };

  const getStatusIcon = (status: HealthStatus) => {
    switch (status) {
      case HealthStatus.HEALTHY:
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case HealthStatus.DEGRADED:
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case HealthStatus.UNHEALTHY:
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case HealthStatus.CRITICAL:
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default:
        return <Activity className="w-5 h-5 text-slate-600" />;
    }
  };

  const calculateOverallHealth = (): { status: HealthStatus; score: number } => {
    if (!healthResult || serviceHealth.length === 0) {
      return { status: HealthStatus.UNHEALTHY, score: 0 };
    }

    const healthyServices = serviceHealth.filter(s => s.status === HealthStatus.HEALTHY).length;
    const totalServices = serviceHealth.length;
    const score = (healthyServices / totalServices) * 100;

    if (score >= 95) return { status: HealthStatus.HEALTHY, score };
    if (score >= 80) return { status: HealthStatus.DEGRADED, score };
    if (score >= 60) return { status: HealthStatus.UNHEALTHY, score };
    return { status: HealthStatus.CRITICAL, score };
  };

  const overallHealth = calculateOverallHealth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-600">Loading system health data...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Health & Performance</h2>
          <p className="text-slate-600">Real-time monitoring of system health, performance metrics, and error rates</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as '1h' | '6h' | '24h')}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
          </select>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center space-x-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Overall System Status */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            {getStatusIcon(overallHealth.status)}
            <div>
              <h3 className="text-xl font-semibold text-slate-900">System Status</h3>
              <p className={`text-sm font-medium ${getStatusColor(overallHealth.status).split(' ')[0]}`}>
                {overallHealth.status.toUpperCase()} - {overallHealth.score.toFixed(1)}% Healthy
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-600">Last Updated</p>
            <p className="text-sm font-medium text-slate-900">
              {new Date().toLocaleString()}
            </p>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Server className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {serviceHealth.filter(s => s.status === HealthStatus.HEALTHY).length}
            </p>
            <p className="text-sm text-slate-600">Healthy Services</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {trendData.length > 0 ? Math.round(trendData[trendData.length - 1].responseTime) : 0}ms
            </p>
            <p className="text-sm text-slate-600">Avg Response Time</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <AlertTriangle className={`w-6 h-6 ${errorMetrics && errorMetrics.errorRate > 5 ? 'text-red-600' : 'text-green-600'}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {errorMetrics ? errorMetrics.errorRate.toFixed(1) : '0.0'}%
            </p>
            <p className="text-sm text-slate-600">Error Rate</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {trendData.length > 0 ? Math.round(trendData[trendData.length - 1].throughput) : 0}
            </p>
            <p className="text-sm text-slate-600">Requests/min</p>
          </div>
        </div>
      </div>

      {/* Performance Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Response Time & Throughput */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Response Time & Throughput</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="responseTime" 
                stroke="#3B82F6" 
                name="Response Time (ms)" 
                strokeWidth={2}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="throughput" 
                stroke="#10B981" 
                name="Throughput (req/min)" 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Error Rate */}
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Error Rate Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="errorRate" 
                stroke="#EF4444" 
                fill="#FEE2E2" 
                name="Error Rate (%)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* System Resources */}
      <div className="bg-white p-6 rounded-lg border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">System Resources</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="cpuUsage" 
              stroke="#F59E0B" 
              name="CPU Usage (%)" 
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="memoryUsage" 
              stroke="#8B5CF6" 
              name="Memory Usage (%)" 
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Service Health Status */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Service Health Status</h3>
        </div>
        <div className="divide-y divide-slate-200">
          {serviceHealth.map((service) => (
            <div key={service.name} className="p-4 hover:bg-slate-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {getStatusIcon(service.status)}
                  <div>
                    <h4 className="text-sm font-medium text-slate-900">{service.name}</h4>
                    <p className="text-xs text-slate-600">
                      Last checked: {service.lastCheck.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-6 text-sm">
                  <div className="text-center">
                    <p className="font-medium text-slate-900">{service.responseTime}ms</p>
                    <p className="text-xs text-slate-600">Response Time</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-slate-900">{service.uptime}%</p>
                    <p className="text-xs text-slate-600">Uptime</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(service.status)}`}>
                    {service.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error Summary */}
      {errorMetrics && (
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Error Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{errorMetrics.criticalErrors}</p>
              <p className="text-sm text-red-700">Critical Errors</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">{errorMetrics.highSeverityErrors}</p>
              <p className="text-sm text-orange-700">High Severity</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{errorMetrics.totalErrors}</p>
              <p className="text-sm text-blue-700">Total Errors</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-600">{errorMetrics.errorRate.toFixed(1)}%</p>
              <p className="text-sm text-slate-700">Error Rate</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealthDashboard;