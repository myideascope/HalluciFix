/**
 * Performance Optimization Dashboard
 * Shows real-time performance metrics and optimization statistics
 */

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Zap, 
  Database, 
  Network, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Cpu,
  HardDrive
} from 'lucide-react';
import analysisService from '../lib/analysisService';

import { logger } from './logging';
interface OptimizationStats {
  cache: {
    totalEntries: number;
    hitRate: number;
    totalSize: number;
    memoryUsage: {
      used: number;
      limit: number;
      percentage: number;
    };
  };
  deduplication: {
    totalRequests: number;
    deduplicatedRequests: number;
    deduplicationRate: number;
    averageResponseTime: number;
  };
  connectionPool: {
    totalConnections: number;
    activeConnections: number;
    connectionReuse: number;
    poolUtilization: number;
  };
  apiUsage: {
    totalRequests: number;
    totalCost: number;
    costSavings: number;
    requestsSaved: number;
    cacheHitRate: number;
    averageResponseTime: number;
  };
}

const PerformanceOptimizationDashboard: React.FC = () => {
  const [stats, setStats] = useState<OptimizationStats | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const optimizationStats = analysisService.getOptimizationStats();
        const optimizationRecommendations = analysisService.getOptimizationRecommendations();
        
        setStats(optimizationStats);
        setRecommendations(optimizationRecommendations);
        setError(null);
      } catch (err) {
        setError('Failed to load optimization statistics');
        logger.error("Error fetching optimization stats:", err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount);
  };

  const getPerformanceColor = (percentage: number): string => {
    if (percentage >= 80) return 'text-green-600 dark:text-green-400';
    if (percentage >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getUtilizationColor = (percentage: number): string => {
    if (percentage <= 70) return 'text-green-600 dark:text-green-400';
    if (percentage <= 85) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
          <span className="ml-3 text-slate-600 dark:text-slate-400">Loading optimization statistics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-center h-64">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 mr-3" />
          <span className="text-red-600 dark:text-red-400">{error}</span>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Performance Optimization Dashboard
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Real-time performance metrics and optimization statistics
            </p>
          </div>
          <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
            <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Cache Performance */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Database className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <span className={`text-2xl font-bold ${getPerformanceColor(stats.cache.hitRate)}`}>
              {stats.cache.hitRate.toFixed(1)}%
            </span>
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Cache Hit Rate</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {stats.cache.totalEntries} entries, {formatBytes(stats.cache.totalSize)}
          </p>
        </div>

        {/* Request Deduplication */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className={`text-2xl font-bold ${getPerformanceColor(stats.deduplication.deduplicationRate)}`}>
              {stats.deduplication.deduplicationRate.toFixed(1)}%
            </span>
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Deduplication Rate</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {stats.deduplication.deduplicatedRequests} of {stats.deduplication.totalRequests} requests
          </p>
        </div>

        {/* Connection Pool */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <Network className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <span className={`text-2xl font-bold ${getUtilizationColor(stats.connectionPool.poolUtilization)}`}>
              {stats.connectionPool.poolUtilization.toFixed(1)}%
            </span>
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Pool Utilization</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {stats.connectionPool.activeConnections} of {stats.connectionPool.totalConnections} active
          </p>
        </div>

        {/* Cost Savings */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.apiUsage.costSavings)}
            </span>
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Cost Savings</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {stats.apiUsage.requestsSaved} requests saved
          </p>
        </div>
      </div>

      {/* Detailed Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cache Details */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center mb-4">
            <HardDrive className="w-5 h-5 text-slate-600 dark:text-slate-400 mr-2" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Cache Statistics</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Total Entries</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {stats.cache.totalEntries.toLocaleString()}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Memory Usage</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {formatBytes(stats.cache.memoryUsage.used)} / {formatBytes(stats.cache.memoryUsage.limit)}
              </span>
            </div>
            
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  stats.cache.memoryUsage.percentage > 80 
                    ? 'bg-red-500' 
                    : stats.cache.memoryUsage.percentage > 60 
                    ? 'bg-yellow-500' 
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(stats.cache.memoryUsage.percentage, 100)}%` }}
              ></div>
            </div>
            
            <div className="text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {stats.cache.memoryUsage.percentage.toFixed(1)}% utilized
              </span>
            </div>
          </div>
        </div>

        {/* API Usage Details */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center mb-4">
            <Cpu className="w-5 h-5 text-slate-600 dark:text-slate-400 mr-2" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">API Usage Statistics</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Total Requests</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {stats.apiUsage.totalRequests.toLocaleString()}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Total Cost</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {formatCurrency(stats.apiUsage.totalCost)}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Average Response Time</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {stats.apiUsage.averageResponseTime.toFixed(0)}ms
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Cache Hit Rate</span>
              <span className={`font-medium ${getPerformanceColor(stats.apiUsage.cacheHitRate)}`}>
                {stats.apiUsage.cacheHitRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center mb-4">
            <TrendingUp className="w-5 h-5 text-slate-600 dark:text-slate-400 mr-2" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Optimization Recommendations</h3>
          </div>
          
          <div className="space-y-3">
            {recommendations.map((recommendation, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">{recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Summary */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center mb-4">
          <BarChart3 className="w-5 h-5 text-slate-600 dark:text-slate-400 mr-2" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Performance Summary</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Optimizations Active</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Caching, deduplication, and connection pooling are working effectively
            </p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Response Time</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Average {stats.deduplication.averageResponseTime.toFixed(0)}ms response time
            </p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <DollarSign className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Cost Efficiency</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {formatCurrency(stats.apiUsage.costSavings)} saved through optimization
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceOptimizationDashboard;