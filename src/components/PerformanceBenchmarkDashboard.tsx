import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { Activity, TrendingUp, TrendingDown, Clock, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { PerformanceBenchmarking, BenchmarkResult, BenchmarkComparison } from '../lib/performanceBenchmarking';

import { logger } from './logging';
interface BenchmarkDashboardProps {
  className?: string;
}

interface BenchmarkTrend {
  timestamp: string;
  averageTime: number;
  p95Time: number;
  throughput: number;
  successRate: number;
}

interface QueryPerformanceData {
  queryName: string;
  averageTime: number;
  p95Time: number;
  throughput: number;
  successRate: number;
  trend: 'improved' | 'degraded' | 'stable';
}

const PerformanceBenchmarkDashboard: React.FC<BenchmarkDashboardProps> = ({ className = '' }) => {
  const [benchmarking] = useState(() => new PerformanceBenchmarking());
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState<string>('');
  const [comparison, setComparison] = useState<BenchmarkComparison | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [trendData, setTrendData] = useState<BenchmarkTrend[]>([]);
  const [queryPerformanceData, setQueryPerformanceData] = useState<QueryPerformanceData[]>([]);

  useEffect(() => {
    loadBenchmarkHistory();
  }, []);

  useEffect(() => {
    if (selectedBenchmark && benchmarkResults.length > 0) {
      updateTrendData();
      updateQueryPerformanceData();
      updateComparison();
    }
  }, [selectedBenchmark, benchmarkResults, updateTrendData, updateQueryPerformanceData, updateComparison]);

  const loadBenchmarkHistory = async () => {
    try {
      const standardBenchmarks = benchmarking.getStandardBenchmarks();
      const allResults: BenchmarkResult[] = [];
      
      for (const benchmark of standardBenchmarks) {
        const results = await benchmarking.getHistoricalBenchmarks(benchmark.name, 20);
        allResults.push(...results);
      }
      
      setBenchmarkResults(allResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      
      if (allResults.length > 0 && !selectedBenchmark) {
        setSelectedBenchmark(allResults[0].configName);
      }
    } catch (error) {
      logger.error("Failed to load benchmark history:", error instanceof Error ? error : new Error(String(error)));
    }
  };

  const updateTrendData = useCallback(() => {
    const filteredResults = benchmarkResults
      .filter(result => result.configName === selectedBenchmark)
      .slice(0, 10)
      .reverse();
    
    const trends: BenchmarkTrend[] = filteredResults.map(result => ({
      timestamp: new Date(result.timestamp).toLocaleDateString(),
      averageTime: result.overallMetrics.averageExecutionTime,
      p95Time: result.overallMetrics.p95ExecutionTime,
      throughput: result.overallMetrics.totalQueries / (result.overallMetrics.totalExecutionTime / 1000),
      successRate: result.overallMetrics.successRate
    }));
    
    setTrendData(trends);
  };

  const updateQueryPerformanceData = useCallback(() => {
    const latestResult = benchmarkResults.find(result => result.configName === selectedBenchmark);
    if (!latestResult) return;
    
    const queryData: QueryPerformanceData[] = Array.from(latestResult.queryResults.entries()).map(([queryName, result]) => ({
      queryName,
      averageTime: result.averageTime,
      p95Time: result.p95Time,
      throughput: result.throughput,
      successRate: (result.successCount / result.iterations) * 100,
      trend: 'stable' // Would be calculated from comparison
    }));
    
    setQueryPerformanceData(queryData);
  };

  const updateComparison = useCallback(async () => {
    const results = benchmarkResults.filter(result => result.configName === selectedBenchmark);
    if (results.length >= 2) {
      const current = results[0];
      const baseline = results[1];
      
      try {
        const comp = await benchmarking.compareBenchmarks(baseline, current);
        setComparison(comp);
        
        // Update query trends based on comparison
        const updatedQueryData = queryPerformanceData.map(query => {
          const queryComparison = comp.comparison.queryComparisons.get(query.queryName);
          return {
            ...query,
            trend: queryComparison?.trend || 'stable'
          };
        });
        setQueryPerformanceData(updatedQueryData);
      } catch (error) {
        logger.error("Failed to create comparison:", error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  const runBenchmark = async () => {
    setIsRunning(true);
    try {
      const results = await benchmarking.runStandardBenchmarks();
      setBenchmarkResults(prev => [...results, ...prev]);
      
      if (results.length > 0) {
        setSelectedBenchmark(results[0].configName);
      }
    } catch (error) {
      logger.error("Failed to run benchmark:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsRunning(false);
    }
  };

  const getPerformanceStatus = (value: number, threshold: number, inverse: boolean = false): 'good' | 'warning' | 'critical' => {
    if (inverse) {
      if (value >= threshold * 1.2) return 'good';
      if (value >= threshold * 0.8) return 'warning';
      return 'critical';
    } else {
      if (value <= threshold * 0.8) return 'good';
      if (value <= threshold * 1.2) return 'warning';
      return 'critical';
    }
  };

  const getStatusIcon = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
    }
  };

  const getTrendIcon = (trend: 'improved' | 'degraded' | 'stable') => {
    switch (trend) {
      case 'improved':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'degraded':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'stable':
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const latestResult = benchmarkResults.find(result => result.configName === selectedBenchmark);
  const uniqueBenchmarkNames = [...new Set(benchmarkResults.map(result => result.configName))];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Performance Benchmarks</h2>
          <p className="text-gray-600 dark:text-gray-400">Database performance benchmarking and trend analysis</p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedBenchmark}
            onChange={(e) => setSelectedBenchmark(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">Select Benchmark</option>
            {uniqueBenchmarkNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button
            onClick={runBenchmark}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Zap className="w-4 h-4" />
            <span>{isRunning ? 'Running...' : 'Run Benchmark'}</span>
          </button>
        </div>
      </div>

      {/* Overall Metrics */}
      {latestResult && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Response Time</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {latestResult.overallMetrics.averageExecutionTime.toFixed(1)}ms
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(getPerformanceStatus(latestResult.overallMetrics.averageExecutionTime, 500))}
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">95th Percentile</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {latestResult.overallMetrics.p95ExecutionTime.toFixed(1)}ms
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(getPerformanceStatus(latestResult.overallMetrics.p95ExecutionTime, 1000))}
                <TrendingUp className="w-8 h-8 text-orange-500" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {latestResult.overallMetrics.successRate.toFixed(1)}%
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(getPerformanceStatus(latestResult.overallMetrics.successRate, 95, true))}
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Queries</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {latestResult.overallMetrics.totalQueries}
                </p>
              </div>
              <Activity className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Performance Trends */}
      {trendData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Performance Trends</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Response Time Trends</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="averageTime" stroke="#3B82F6" name="Average" />
                  <Line type="monotone" dataKey="p95Time" stroke="#F59E0B" name="95th Percentile" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Throughput & Success Rate</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="throughput" stroke="#10B981" name="Throughput (ops/sec)" />
                  <Line type="monotone" dataKey="successRate" stroke="#8B5CF6" name="Success Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Query Performance Breakdown */}
      {queryPerformanceData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Query Performance Breakdown</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Average Response Time by Query</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={queryPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="queryName" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="averageTime" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Throughput vs Response Time</h4>
              <ResponsiveContainer width="100%" height={250}>
                <ScatterChart data={queryPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="averageTime" name="Response Time (ms)" />
                  <YAxis dataKey="throughput" name="Throughput (ops/sec)" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter fill="#8B5CF6" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Query Performance Table */}
      {queryPerformanceData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Detailed Query Metrics</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Query
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Avg Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    P95 Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Throughput
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {queryPerformanceData.map((query) => (
                  <tr key={query.queryName}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {query.queryName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {query.averageTime.toFixed(2)}ms
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {query.p95Time.toFixed(2)}ms
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {query.throughput.toFixed(2)} ops/sec
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      <div className="flex items-center space-x-2">
                        <span>{query.successRate.toFixed(1)}%</span>
                        {getStatusIcon(getPerformanceStatus(query.successRate, 95, true))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      <div className="flex items-center space-x-2">
                        {getTrendIcon(query.trend)}
                        <span className="capitalize">{query.trend}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comparison Results */}
      {comparison && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Performance Comparison</h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {comparison.comparison.overallPerformanceChange < 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-500" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-500" />
                )}
                <span className="text-sm font-medium">
                  Overall Performance: {comparison.comparison.overallPerformanceChange > 0 ? '+' : ''}
                  {comparison.comparison.overallPerformanceChange.toFixed(2)}%
                </span>
              </div>
            </div>

            {comparison.comparison.significantChanges.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Significant Changes</h4>
                <ul className="space-y-1">
                  {comparison.comparison.significantChanges.map((change, index) => (
                    <li key={index} className="text-sm text-gray-700 dark:text-gray-300">
                      • {change}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {comparison.comparison.recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Recommendations</h4>
                <ul className="space-y-1">
                  {comparison.comparison.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-gray-700 dark:text-gray-300">
                      • {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceBenchmarkDashboard;