import React, { useState, useEffect } from 'react';
import { Activity, Database, Clock, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalOperations: number;
  connectionCount: number;
  latency: number;
  memoryUsage?: number;
}

interface CacheHealthStatus {
  status: 'healthy' | 'unhealthy';
  latency: number;
  memoryUsage?: number;
  connectionStatus: string;
}

interface CachePerformanceData {
  timestamp: string;
  hitRate: number;
  latency: number;
  operations: number;
  memoryUsage?: number;
}

export const CacheMonitoringDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<CacheMetrics | null>(null);
  const [healthStatus, setHealthStatus] = useState<CacheHealthStatus | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<CachePerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCacheMetrics();
    fetchHealthStatus();
    
    // Set up periodic refresh
    const interval = setInterval(() => {
      fetchCacheMetrics();
      fetchHealthStatus();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchCacheMetrics = async () => {
    try {
      const response = await fetch('/api/cache/metrics');
      if (!response.ok) {
        throw new Error('Failed to fetch cache metrics');
      }
      const data = await response.json();
      setMetrics(data);
      
      // Add to performance history
      const newDataPoint: CachePerformanceData = {
        timestamp: new Date().toISOString(),
        hitRate: data.hitRate,
        latency: data.latency,
        operations: data.totalOperations,
        memoryUsage: data.memoryUsage,
      };
      
      setPerformanceHistory(prev => {
        const updated = [...prev, newDataPoint];
        // Keep only last 50 data points
        return updated.slice(-50);
      });
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchHealthStatus = async () => {
    try {
      const response = await fetch('/api/cache/health');
      if (!response.ok) {
        throw new Error('Failed to fetch cache health status');
      }
      const data = await response.json();
      setHealthStatus(data);
    } catch (err) {
      console.error('Failed to fetch cache health status:', err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getHitRateColor = (hitRate: number): string => {
    if (hitRate >= 90) return 'text-green-600';
    if (hitRate >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLatencyColor = (latency: number): string => {
    if (latency <= 5) return 'text-green-600';
    if (latency <= 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="flex items-center text-red-600 mb-4">
          <AlertTriangle className="w-5 h-5 mr-2" />
          <span>Error loading cache metrics: {error}</span>
        </div>
        <button
          onClick={fetchCacheMetrics}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Cache Performance Monitoring
        </h2>
        <div className="flex items-center space-x-2">
          {healthStatus?.status === 'healthy' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600" />
          )}
          <span className={`text-sm font-medium ${
            healthStatus?.status === 'healthy' ? 'text-green-600' : 'text-red-600'
          }`}>
            {healthStatus?.status === 'healthy' ? 'Healthy' : 'Unhealthy'}
          </span>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Hit Rate */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Cache Hit Rate
              </p>
              <p className={`text-2xl font-bold ${getHitRateColor(metrics?.hitRate || 0)}`}>
                {metrics?.hitRate?.toFixed(1) || '0.0'}%
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {metrics?.hits || 0} hits / {metrics?.totalOperations || 0} total ops
          </div>
        </div>

        {/* Average Latency */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Average Latency
              </p>
              <p className={`text-2xl font-bold ${getLatencyColor(metrics?.latency || 0)}`}>
                {metrics?.latency?.toFixed(1) || '0.0'}ms
              </p>
            </div>
            <Clock className="w-8 h-8 text-green-600" />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Connection: {healthStatus?.connectionStatus || 'Unknown'}
          </div>
        </div>

        {/* Total Operations */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Operations
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics?.totalOperations?.toLocaleString() || '0'}
              </p>
            </div>
            <Activity className="w-8 h-8 text-purple-600" />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {metrics?.misses || 0} cache misses
          </div>
        </div>

        {/* Memory Usage */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Memory Usage
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics?.memoryUsage ? formatBytes(metrics.memoryUsage) : 'N/A'}
              </p>
            </div>
            <Database className="w-8 h-8 text-orange-600" />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {metrics?.connectionCount || 0} active connections
          </div>
        </div>
      </div>

      {/* Performance Trends Chart */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Performance Trends (Last 30 minutes)
        </h3>
        
        {performanceHistory.length > 0 ? (
          <div className="space-y-4">
            {/* Hit Rate Trend */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Hit Rate Trend
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Current: {performanceHistory[performanceHistory.length - 1]?.hitRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(100, Math.max(0, performanceHistory[performanceHistory.length - 1]?.hitRate || 0))}%` 
                  }}
                />
              </div>
            </div>

            {/* Latency Trend */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Latency Trend
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Current: {performanceHistory[performanceHistory.length - 1]?.latency.toFixed(1)}ms
                </span>
              </div>
              <div className="h-16 flex items-end space-x-1">
                {performanceHistory.slice(-20).map((point, index) => (
                  <div
                    key={index}
                    className="flex-1 bg-blue-500 rounded-t"
                    style={{
                      height: `${Math.min(100, (point.latency / 50) * 100)}%`,
                      minHeight: '2px'
                    }}
                    title={`${point.latency.toFixed(1)}ms at ${new Date(point.timestamp).toLocaleTimeString()}`}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            No performance data available yet. Data will appear as metrics are collected.
          </div>
        )}
      </div>

      {/* Cache Health Details */}
      {healthStatus && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cache Health Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
              <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                healthStatus.status === 'healthy' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {healthStatus.status}
              </span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Connection:</span>
              <span className="ml-2 text-sm text-gray-900 dark:text-white">
                {healthStatus.connectionStatus}
              </span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Health Check Latency:</span>
              <span className="ml-2 text-sm text-gray-900 dark:text-white">
                {healthStatus.latency.toFixed(1)}ms
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Performance Recommendations */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Performance Recommendations
        </h3>
        <div className="space-y-3">
          {metrics && metrics.hitRate < 70 && (
            <div className="flex items-start space-x-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Low Cache Hit Rate
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Consider reviewing cache TTL settings or cache key strategies to improve hit rate.
                </p>
              </div>
            </div>
          )}
          
          {metrics && metrics.latency > 20 && (
            <div className="flex items-start space-x-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  High Latency Detected
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  Cache operations are taking longer than expected. Check network connectivity and Redis performance.
                </p>
              </div>
            </div>
          )}
          
          {metrics && metrics.hitRate >= 90 && metrics.latency <= 5 && (
            <div className="flex items-start space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Excellent Performance
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Cache is performing optimally with high hit rate and low latency.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CacheMonitoringDashboard;