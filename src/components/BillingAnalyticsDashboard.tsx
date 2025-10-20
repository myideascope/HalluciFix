import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Activity,
  RefreshCw,
  Bell,
  Shield,
  CreditCard
} from 'lucide-react';
import { billingMonitor, BillingMetrics, BillingHealthStatus, BillingAlert } from '../lib/billingMonitor';
import { formatCurrency } from '../lib/stripe';

interface BillingAnalyticsDashboardProps {
  className?: string;
}

export const BillingAnalyticsDashboard: React.FC<BillingAnalyticsDashboardProps> = ({ className = '' }) => {
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [healthStatus, setHealthStatus] = useState<BillingHealthStatus | null>(null);
  const [alerts, setAlerts] = useState<BillingAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'health' | 'alerts'>('overview');

  useEffect(() => {
    loadBillingData();
    
    // Set up periodic refresh
    const interval = setInterval(loadBillingData, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const loadBillingData = async () => {
    try {
      setError(null);
      const [metricsData, healthData, alertsData] = await Promise.all([
        billingMonitor.getMetrics(),
        billingMonitor.getSystemStatus(),
        billingMonitor.getBillingAlerts({ limit: 20, resolved: false })
      ]);

      setMetrics(metricsData);
      setHealthStatus(healthData);
      setAlerts(alertsData);
    } catch (err) {
      console.error('Failed to load billing data:', err);
      setError('Failed to load billing analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBillingData();
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await billingMonitor.resolveAlert(alertId, 'admin'); // In real app, use actual user ID
      await loadBillingData(); // Refresh data
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'critical':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      default:
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
    }
  };

  const getAlertSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      case 'high':
        return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/20';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'low':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20';
      default:
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'payment_failure':
        return <CreditCard className="w-4 h-4" />;
      case 'subscription_expiry':
        return <Clock className="w-4 h-4" />;
      case 'usage_overage':
        return <BarChart3 className="w-4 h-4" />;
      case 'billing_error':
        return <XCircle className="w-4 h-4" />;
      case 'fraud_detection':
        return <Shield className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className={`max-w-7xl mx-auto p-6 ${className}`}>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="grid md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            ))}
          </div>
          <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-7xl mx-auto p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Billing Analytics
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Monitor billing system health, metrics, and alerts
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-800 dark:text-red-200">
            <XCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'health', label: 'System Health', icon: Activity },
            { id: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.length }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && metrics && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex items-center space-x-1 text-sm font-medium text-green-600">
                  <TrendingUp className="w-4 h-4" />
                  <span>+12%</span>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {formatCurrency(metrics.totalRevenue * 100, 'usd')}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Revenue (30d)</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex items-center space-x-1 text-sm font-medium text-blue-600">
                  <TrendingUp className="w-4 h-4" />
                  <span>+8%</span>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {formatCurrency(metrics.monthlyRecurringRevenue * 100, 'usd')}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Monthly Recurring Revenue</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                  <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex items-center space-x-1 text-sm font-medium text-purple-600">
                  <TrendingUp className="w-4 h-4" />
                  <span>+5%</span>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {metrics.activeSubscriptions.toLocaleString()}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Active Subscriptions</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex items-center space-x-1 text-sm font-medium text-orange-600">
                  <TrendingUp className="w-4 h-4" />
                  <span>+15%</span>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {formatCurrency(metrics.averageRevenuePerUser * 100, 'usd')}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Average Revenue Per User</p>
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded">
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {(metrics.churnRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Churn Rate</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded">
                  <XCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {(metrics.paymentFailureRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Payment Failure Rate</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {(metrics.trialConversionRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Trial Conversion</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded">
                  <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {(metrics.usageOverageRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Usage Overage Rate</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'health' && healthStatus && (
        <div className="space-y-6">
          {/* Overall Health Status */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                System Health Status
              </h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getHealthStatusColor(healthStatus.overall)}`}>
                {healthStatus.overall}
              </span>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${getHealthStatusColor(healthStatus.stripeConnectivity)}`}>
                  <CreditCard className="w-6 h-6" />
                </div>
                <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">
                  Stripe Connectivity
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                  {healthStatus.stripeConnectivity}
                </div>
              </div>

              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${getHealthStatusColor(healthStatus.webhookProcessing)}`}>
                  <Activity className="w-6 h-6" />
                </div>
                <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">
                  Webhook Processing
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                  {healthStatus.webhookProcessing}
                </div>
              </div>

              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${getHealthStatusColor(healthStatus.paymentProcessing)}`}>
                  <DollarSign className="w-6 h-6" />
                </div>
                <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">
                  Payment Processing
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                  {healthStatus.paymentProcessing}
                </div>
              </div>

              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${getHealthStatusColor(healthStatus.subscriptionSync)}`}>
                  <Users className="w-6 h-6" />
                </div>
                <div className="font-medium text-slate-900 dark:text-slate-100 mb-1">
                  Subscription Sync
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                  {healthStatus.subscriptionSync}
                </div>
              </div>
            </div>

            {healthStatus.issues.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Current Issues</h4>
                <div className="space-y-2">
                  {healthStatus.issues.map((issue, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 text-xs text-slate-500 dark:text-slate-400">
              Last health check: {healthStatus.lastHealthCheck.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Active Alerts ({alerts.length})
              </h3>
            </div>

            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                  No Active Alerts
                </h4>
                <p className="text-slate-600 dark:text-slate-400">
                  All billing systems are operating normally
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {alerts.map((alert) => (
                  <div key={alert.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-lg ${getAlertSeverityColor(alert.severity)}`}>
                          {getAlertIcon(alert.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium text-slate-900 dark:text-slate-100">
                              {alert.message}
                            </h4>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAlertSeverityColor(alert.severity)}`}>
                              {alert.severity}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            Type: {alert.type.replace('_', ' ')} • {alert.timestamp.toLocaleString()}
                          </p>
                          {alert.userId && (
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                              User ID: {alert.userId}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleResolveAlert(alert.id)}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingAnalyticsDashboard;