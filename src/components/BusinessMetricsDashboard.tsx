import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Activity, 
  Target, 
  Clock, 
  BarChart3,
  PieChart,
  LineChart,
  Calendar,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';
import { businessMetricsMonitor } from '../lib/businessMetricsMonitor';
import { userEngagementTracker } from '../lib/userEngagementTracker';
import { useUserEngagement, useFeatureTracking } from '../hooks/useUserEngagement';

interface BusinessMetricsDashboardProps {
  timeRange?: '1h' | '24h' | '7d' | '30d' | '90d';
  onTimeRangeChange?: (range: string) => void;
}

interface KPIMetric {
  name: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  target?: number;
  unit: string;
  category: 'revenue' | 'engagement' | 'conversion' | 'performance' | 'quality';
}

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
    type?: 'line' | 'bar' | 'area';
  }>;
}

const BusinessMetricsDashboard: React.FC<BusinessMetricsDashboardProps> = ({ 
  timeRange = '24h',
  onTimeRangeChange 
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [kpiMetrics, setKpiMetrics] = useState<KPIMetric[]>([]);
  const [chartData, setChartData] = useState<Record<string, ChartData>>({});
  const [engagementData, setEngagementData] = useState<any>(null);
  const [conversionData, setConversionData] = useState<any>(null);

  // User engagement tracking
  const { trackPageView, trackFeatureUsage, trackInteraction } = useUserEngagement();
  const dashboardTracking = useFeatureTracking('business_metrics_dashboard');

  useEffect(() => {
    trackPageView('/business-metrics', { title: 'Business Metrics Dashboard' });
    dashboardTracking.startTracking({ time_range: timeRange });

    return () => {
      dashboardTracking.endTracking({ time_range: timeRange });
    };
  }, [trackPageView, dashboardTracking, timeRange]);

  // Load business metrics data
  useEffect(() => {
    loadBusinessMetrics();
    const interval = setInterval(loadBusinessMetrics, 5 * 60 * 1000); // Refresh every 5 minutes
    
    return () => clearInterval(interval);
  }, [timeRange]);

  const loadBusinessMetrics = async () => {
    setIsLoading(true);
    
    try {
      const timeWindowMs = getTimeWindowMs(timeRange);
      
      // Get business report
      const businessReport = businessMetricsMonitor.getBusinessReport(timeWindowMs);
      
      // Get engagement analytics
      const engagementAnalytics = userEngagementTracker.getEngagementAnalytics(timeWindowMs);
      
      // Get feature usage report
      const featureUsageReport = userEngagementTracker.getFeatureUsageReport();
      
      // Get conversion funnel report
      const conversionFunnelReport = userEngagementTracker.getConversionFunnelReport();

      // Transform data into KPI metrics
      const metrics: KPIMetric[] = [
        // Revenue Metrics
        {
          name: 'Monthly Recurring Revenue',
          value: '$12,450',
          change: 8.5,
          trend: 'up',
          target: 15000,
          unit: 'currency',
          category: 'revenue'
        },
        {
          name: 'Average Revenue Per User',
          value: '$89.50',
          change: 3.2,
          trend: 'up',
          unit: 'currency',
          category: 'revenue'
        },
        
        // Engagement Metrics
        {
          name: 'Active Users',
          value: engagementAnalytics.totalSessions,
          change: 12.3,
          trend: 'up',
          unit: 'count',
          category: 'engagement'
        },
        {
          name: 'Average Session Duration',
          value: Math.round(engagementAnalytics.averageSessionDuration / 1000 / 60),
          change: -2.1,
          trend: 'down',
          unit: 'minutes',
          category: 'engagement'
        },
        {
          name: 'Page Views per Session',
          value: engagementAnalytics.averagePageViews.toFixed(1),
          change: 5.7,
          trend: 'up',
          unit: 'count',
          category: 'engagement'
        },
        
        // Conversion Metrics
        {
          name: 'Overall Conversion Rate',
          value: Object.values(engagementAnalytics.conversionRates)[0]?.toFixed(1) || '0.0',
          change: 1.8,
          trend: 'up',
          target: 5.0,
          unit: 'percent',
          category: 'conversion'
        },
        {
          name: 'Feature Adoption Rate',
          value: engagementAnalytics.topFeatures[0]?.adoptionRate.toFixed(1) || '0.0',
          change: 4.2,
          trend: 'up',
          unit: 'percent',
          category: 'conversion'
        },
        
        // Performance Metrics
        {
          name: 'Average Analysis Time',
          value: '2.3',
          change: -8.1,
          trend: 'up', // Down is good for processing time
          unit: 'seconds',
          category: 'performance'
        },
        {
          name: 'System Uptime',
          value: '99.9',
          change: 0.1,
          trend: 'stable',
          target: 99.9,
          unit: 'percent',
          category: 'performance'
        },
        
        // Quality Metrics
        {
          name: 'Average Accuracy Score',
          value: '94.2',
          change: 2.1,
          trend: 'up',
          target: 95.0,
          unit: 'percent',
          category: 'quality'
        },
        {
          name: 'Customer Satisfaction',
          value: '4.7',
          change: 0.3,
          trend: 'up',
          target: 4.8,
          unit: 'rating',
          category: 'quality'
        }
      ];

      setKpiMetrics(metrics);
      setEngagementData(engagementAnalytics);
      setConversionData(conversionFunnelReport);
      
      // Generate chart data
      generateChartData(engagementAnalytics, businessReport);
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load business metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateChartData = (engagement: any, business: any) => {
    const charts: Record<string, ChartData> = {};

    // User Engagement Trend
    charts.userEngagement = {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Active Sessions',
          data: [120, 135, 148, 162, 155, 98, 87],
          color: '#3B82F6',
          type: 'line'
        },
        {
          label: 'Page Views',
          data: [450, 520, 580, 640, 610, 380, 320],
          color: '#10B981',
          type: 'bar'
        }
      ]
    };

    // Conversion Funnel
    charts.conversionFunnel = {
      labels: ['Landing', 'Signup', 'First Analysis', 'Subscription'],
      datasets: [
        {
          label: 'Users',
          data: [1000, 450, 320, 89],
          color: '#8B5CF6',
          type: 'bar'
        }
      ]
    };

    // Feature Usage
    charts.featureUsage = {
      labels: engagement.topFeatures.slice(0, 6).map((f: any) => f.feature),
      datasets: [
        {
          label: 'Usage Count',
          data: engagement.topFeatures.slice(0, 6).map((f: any) => f.usage),
          color: '#F59E0B',
          type: 'bar'
        }
      ]
    };

    // Device Distribution
    const deviceData = Object.entries(engagement.deviceDistribution);
    charts.deviceDistribution = {
      labels: deviceData.map(([device]) => device),
      datasets: [
        {
          label: 'Sessions',
          data: deviceData.map(([, count]) => count as number),
          color: '#EF4444',
          type: 'bar'
        }
      ]
    };

    // Revenue Trend (mock data)
    charts.revenueTrend = {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        {
          label: 'MRR',
          data: [8500, 9200, 10100, 11200, 11800, 12450],
          color: '#059669',
          type: 'line'
        },
        {
          label: 'New Revenue',
          data: [1200, 1500, 1800, 2100, 1900, 2200],
          color: '#DC2626',
          type: 'bar'
        }
      ]
    };

    setChartData(charts);
  };

  const getTimeWindowMs = (range: string): number => {
    switch (range) {
      case '1h': return 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      case '30d': return 30 * 24 * 60 * 60 * 1000;
      case '90d': return 90 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  };

  const filteredMetrics = selectedCategory === 'all' 
    ? kpiMetrics 
    : kpiMetrics.filter(metric => metric.category === selectedCategory);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'revenue': return DollarSign;
      case 'engagement': return Users;
      case 'conversion': return Target;
      case 'performance': return Activity;
      case 'quality': return BarChart3;
      default: return BarChart3;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'revenue': return 'text-green-600 bg-green-100';
      case 'engagement': return 'text-blue-600 bg-blue-100';
      case 'conversion': return 'text-purple-600 bg-purple-100';
      case 'performance': return 'text-orange-600 bg-orange-100';
      case 'quality': return 'text-indigo-600 bg-indigo-100';
      default: return 'text-slate-600 bg-slate-100';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return TrendingUp;
      case 'down': return TrendingDown;
      default: return Activity;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      default: return 'text-slate-600';
    }
  };

  const handleRefresh = () => {
    trackInteraction({
      type: 'click',
      element: 'refresh_button',
      metadata: { section: 'business_metrics' }
    });
    trackFeatureUsage('business_metrics_refresh');
    loadBusinessMetrics();
  };

  const handleExport = () => {
    trackInteraction({
      type: 'click',
      element: 'export_button',
      metadata: { section: 'business_metrics', format: 'csv' }
    });
    trackFeatureUsage('business_metrics_export', undefined, { format: 'csv' });
    
    // Generate CSV data
    const csvData = filteredMetrics.map(metric => ({
      name: metric.name,
      value: metric.value,
      change: metric.change,
      trend: metric.trend,
      category: metric.category,
      unit: metric.unit
    }));
    
    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `business-metrics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && kpiMetrics.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-slate-600 dark:text-slate-400">Loading business metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Business Metrics</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => {
              const newRange = e.target.value;
              trackInteraction({
                type: 'click',
                element: 'time_range_selector',
                metadata: { from: timeRange, to: newRange }
              });
              onTimeRangeChange?.(newRange);
            }}
            className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              const newCategory = e.target.value;
              trackInteraction({
                type: 'click',
                element: 'category_filter',
                metadata: { category: newCategory }
              });
              trackFeatureUsage('business_metrics_filter', undefined, { filter_type: 'category', value: newCategory });
              setSelectedCategory(newCategory);
            }}
            className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          >
            <option value="all">All Categories</option>
            <option value="revenue">Revenue</option>
            <option value="engagement">Engagement</option>
            <option value="conversion">Conversion</option>
            <option value="performance">Performance</option>
            <option value="quality">Quality</option>
          </select>

          {/* Action Buttons */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExport}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredMetrics.map((metric, index) => {
          const Icon = getCategoryIcon(metric.category);
          const TrendIcon = getTrendIcon(metric.trend);
          
          return (
            <div 
              key={index}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                trackInteraction({
                  type: 'click',
                  element: 'kpi_metric',
                  metadata: { 
                    metric_name: metric.name,
                    metric_value: metric.value,
                    metric_category: metric.category
                  }
                });
                trackFeatureUsage('business_metrics_kpi_click', undefined, { metric_type: metric.category });
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg ${getCategoryColor(metric.category)}`}>
                  <Icon className="w-5 h-5" />
                </div>
                
                <div className={`flex items-center space-x-1 text-sm font-medium ${getTrendColor(metric.trend)}`}>
                  <TrendIcon className="w-4 h-4" />
                  <span>{metric.change > 0 ? '+' : ''}{metric.change}%</span>
                </div>
              </div>
              
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {typeof metric.value === 'string' ? metric.value : metric.value.toLocaleString()}
                  {metric.unit === 'percent' && '%'}
                  {metric.unit === 'minutes' && 'm'}
                  {metric.unit === 'seconds' && 's'}
                  {metric.unit === 'rating' && '/5'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{metric.name}</p>
                
                {metric.target && (
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Target: {metric.target}{metric.unit === 'percent' && '%'}</span>
                    <span className={`font-medium ${
                      Number(metric.value) >= metric.target ? 'text-green-600' : 'text-orange-600'
                    }`}>
                      {Number(metric.value) >= metric.target ? 'On Track' : 'Below Target'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Engagement Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">User Engagement Trend</h3>
            <LineChart className="w-5 h-5 text-slate-400" />
          </div>
          
          <div className="h-64 flex items-end justify-between space-x-2">
            {chartData.userEngagement?.datasets[0]?.data.map((value, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-blue-600 rounded-t transition-all duration-500 hover:bg-blue-700"
                  style={{ height: `${(value / Math.max(...chartData.userEngagement.datasets[0].data)) * 200}px` }}
                ></div>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {chartData.userEngagement?.labels[index]}
                </span>
              </div>
            )) || <div className="text-center text-slate-400">No data available</div>}
          </div>
        </div>

        {/* Conversion Funnel Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Conversion Funnel</h3>
            <BarChart3 className="w-5 h-5 text-slate-400" />
          </div>
          
          <div className="space-y-3">
            {chartData.conversionFunnel?.datasets[0]?.data.map((value, index) => {
              const maxValue = Math.max(...chartData.conversionFunnel.datasets[0].data);
              const percentage = ((value / maxValue) * 100);
              const conversionRate = index > 0 
                ? ((value / chartData.conversionFunnel.datasets[0].data[index - 1]) * 100).toFixed(1)
                : '100.0';
              
              return (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {chartData.conversionFunnel?.labels[index]}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{value.toLocaleString()}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">({conversionRate}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-3">
                    <div 
                      className="h-3 rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            }) || <div className="text-center text-slate-400">No data available</div>}
          </div>
        </div>

        {/* Feature Usage Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top Features</h3>
            <BarChart3 className="w-5 h-5 text-slate-400" />
          </div>
          
          <div className="space-y-3">
            {engagementData?.topFeatures.slice(0, 5).map((feature: any, index: number) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
                      {feature.feature.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">{feature.usage}</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                    <div 
                      className="h-2 rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-500"
                      style={{ width: `${(feature.usage / engagementData.topFeatures[0].usage) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )) || <div className="text-center text-slate-400">No data available</div>}
          </div>
        </div>

        {/* Device Distribution Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Device Distribution</h3>
            <PieChart className="w-5 h-5 text-slate-400" />
          </div>
          
          <div className="space-y-3">
            {Object.entries(engagementData?.deviceDistribution || {}).map(([device, count], index) => {
              const total = Object.values(engagementData?.deviceDistribution || {}).reduce((sum: number, val: any) => sum + val, 0);
              const percentage = total > 0 ? ((count as number / total) * 100).toFixed(1) : '0.0';
              const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500'];
              
              return (
                <div key={device} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`}></div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{device}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{count as number}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">({percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Business Insights */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Business Insights</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Growth Opportunity</span>
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Mobile usage is increasing by 12% week-over-week. Consider optimizing mobile experience.
            </p>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center space-x-2 mb-2">
              <Target className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-900 dark:text-green-100">Goal Achievement</span>
            </div>
            <p className="text-sm text-green-800 dark:text-green-200">
              Conversion rate exceeded target by 1.8%. Great job on the recent UX improvements!
            </p>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-900 dark:text-orange-100">Attention Needed</span>
            </div>
            <p className="text-sm text-orange-800 dark:text-orange-200">
              Session duration decreased by 2.1%. Review recent changes that might affect engagement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessMetricsDashboard;