/**
 * Comprehensive Monitoring Dashboard
 * Main dashboard that integrates system health, business metrics, and alerting dashboards
 */

import React, { useState } from 'react';
import { 
  Activity, 
  BarChart3, 
  Bell, 
  TrendingUp, 
  Server, 
  Users, 
  AlertTriangle,
  Settings,
  RefreshCw,
  Database
} from 'lucide-react';
import SystemHealthDashboard from './SystemHealthDashboard';
import BusinessMetricsDashboard from './BusinessMetricsDashboard';
import AlertingIncidentDashboard from './AlertingIncidentDashboard';
import CacheMonitoringDashboard from './CacheMonitoringDashboard';

interface ComprehensiveMonitoringDashboardProps {
  className?: string;
}

type DashboardTab = 'overview' | 'system' | 'business' | 'alerts' | 'cache';

export const ComprehensiveMonitoringDashboard: React.FC<ComprehensiveMonitoringDashboardProps> = ({ 
  className = '' 
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const tabs = [
    {
      id: 'overview' as DashboardTab,
      label: 'Overview',
      icon: BarChart3,
      description: 'High-level system and business metrics'
    },
    {
      id: 'system' as DashboardTab,
      label: 'System Health',
      icon: Server,
      description: 'System performance and health monitoring'
    },
    {
      id: 'business' as DashboardTab,
      label: 'Business Metrics',
      icon: TrendingUp,
      description: 'User engagement and business analytics'
    },
    {
      id: 'alerts' as DashboardTab,
      label: 'Alerts & Incidents',
      icon: Bell,
      description: 'Alert management and incident tracking'
    },
    {
      id: 'cache' as DashboardTab,
      label: 'Cache Performance',
      icon: Database,
      description: 'ElastiCache Redis performance monitoring'
    }
  ];

  const handleRefreshIntervalChange = (interval: number) => {
    setRefreshInterval(interval);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  return (
    <div className={`min-h-screen bg-slate-50 ${className}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Monitoring Dashboard</h1>
              <p className="text-slate-600">Comprehensive system and business monitoring</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Auto Refresh Toggle */}
              <div className="flex items-center space-x-2">
                <label className="text-sm text-slate-600">Auto Refresh:</label>
                <button
                  onClick={toggleAutoRefresh}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoRefresh ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoRefresh ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Refresh Interval */}
              <div className="flex items-center space-x-2">
                <label className="text-sm text-slate-600">Interval:</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => handleRefreshIntervalChange(Number(e.target.value))}
                  className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={10000}>10s</option>
                  <option value={30000}>30s</option>
                  <option value={60000}>1m</option>
                  <option value={300000}>5m</option>
                </select>
              </div>

              {/* Manual Refresh */}
              <button
                onClick={() => window.location.reload()}
                className="flex items-center space-x-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>

              {/* Settings */}
              <button className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Overview Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">System Status</p>
                    <p className="text-2xl font-bold text-green-600">Healthy</p>
                    <p className="text-xs text-slate-500">All services operational</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <Activity className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Active Users</p>
                    <p className="text-2xl font-bold text-blue-600">1,247</p>
                    <p className="text-xs text-slate-500">+12% from yesterday</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Active Alerts</p>
                    <p className="text-2xl font-bold text-orange-600">3</p>
                    <p className="text-xs text-slate-500">2 warnings, 1 info</p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-full">
                    <Bell className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Response Time</p>
                    <p className="text-2xl font-bold text-purple-600">142ms</p>
                    <p className="text-xs text-slate-500">95th percentile</p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Access Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* System Health Preview */}
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">System Health</h3>
                  <button
                    onClick={() => setActiveTab('system')}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View Details →
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">API Gateway</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Healthy</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Database</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Healthy</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Auth Service</span>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Degraded</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Analysis Engine</span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Healthy</span>
                  </div>
                </div>
              </div>

              {/* Business Metrics Preview */}
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Business Metrics</h3>
                  <button
                    onClick={() => setActiveTab('business')}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View Details →
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Conversion Rate</span>
                    <span className="text-sm font-medium text-slate-900">12.4%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Avg Session Duration</span>
                    <span className="text-sm font-medium text-slate-900">4.2 min</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Feature Adoption</span>
                    <span className="text-sm font-medium text-slate-900">8 features</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Analysis Accuracy</span>
                    <span className="text-sm font-medium text-slate-900">94.2%</span>
                  </div>
                </div>
              </div>

              {/* Recent Alerts Preview */}
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Recent Alerts</h3>
                  <button
                    onClick={() => setActiveTab('alerts')}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View All →
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <div className="p-1 bg-yellow-100 rounded-full">
                      <AlertTriangle className="w-3 h-3 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">High Response Time</p>
                      <p className="text-xs text-slate-600">Auth service responding slowly</p>
                      <p className="text-xs text-slate-500">2 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="p-1 bg-blue-100 rounded-full">
                      <AlertTriangle className="w-3 h-3 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">Deployment Complete</p>
                      <p className="text-xs text-slate-600">Version 2.1.4 deployed successfully</p>
                      <p className="text-xs text-slate-500">15 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="p-1 bg-yellow-100 rounded-full">
                      <AlertTriangle className="w-3 h-3 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">Memory Usage High</p>
                      <p className="text-xs text-slate-600">Analysis service using 85% memory</p>
                      <p className="text-xs text-slate-500">1 hour ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => setActiveTab('system')}
                  className="p-4 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Server className="w-6 h-6 text-blue-600 mb-2" />
                  <p className="text-sm font-medium text-slate-900">System Health</p>
                  <p className="text-xs text-slate-600">Monitor system performance</p>
                </button>
                <button
                  onClick={() => setActiveTab('business')}
                  className="p-4 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <BarChart3 className="w-6 h-6 text-green-600 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Business Analytics</p>
                  <p className="text-xs text-slate-600">Track user engagement</p>
                </button>
                <button
                  onClick={() => setActiveTab('alerts')}
                  className="p-4 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Bell className="w-6 h-6 text-orange-600 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Alert Management</p>
                  <p className="text-xs text-slate-600">Manage alerts and incidents</p>
                </button>
                <button className="p-4 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <Settings className="w-6 h-6 text-purple-600 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Configuration</p>
                  <p className="text-xs text-slate-600">Configure monitoring settings</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <SystemHealthDashboard 
            refreshInterval={autoRefresh ? refreshInterval : undefined}
          />
        )}

        {activeTab === 'business' && (
          <BusinessMetricsDashboard 
            refreshInterval={autoRefresh ? refreshInterval : undefined}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertingIncidentDashboard 
            refreshInterval={autoRefresh ? refreshInterval : undefined}
          />
        )}

        {activeTab === 'cache' && (
          <CacheMonitoringDashboard />
        )}
      </div>
    </div>
  );
};

export default ComprehensiveMonitoringDashboard;