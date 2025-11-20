/**
 * Alerting and Incident Management Dashboard
 * Comprehensive view of active alerts, incident tracking, and on-call management
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  BarChart3,
  Bell, 
  Clock, 
  User, 
  Users, 
  MessageSquare, 
  ArrowUp, 
  CheckCircle, 
  AlertCircle,
  Settings,
  Phone,
  Mail,
  Search
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { alertManager, Alert, AlertSeverity } from '../lib/monitoring/alertManager';
import { incidentManager, Incident, IncidentStatus, IncidentSeverity } from '../lib/errors/incidentManager';

interface AlertingIncidentDashboardProps {
  className?: string;
  refreshInterval?: number;
}

interface AlertMetrics {
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  criticalAlerts: number;
  averageResolutionTime: number;
  alertsByHour: Array<{ hour: string; count: number }>;
  alertsBySeverity: Array<{ severity: string; count: number; color: string }>;
}

interface IncidentMetrics {
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  averageResolutionTime: number;
  incidentsByStatus: Array<{ status: string; count: number; color: string }>;
  incidentTrends: Array<{ date: string; incidents: number; resolved: number }>;
}

interface OnCallSchedule {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'backup' | 'off';
  contactMethods: Array<{ type: 'phone' | 'email' | 'slack'; value: string }>;
  escalationLevel: number;
  responseTime: number;
}

export const AlertingIncidentDashboard: React.FC<AlertingIncidentDashboardProps> = ({ 
  className = '',
  refreshInterval = 30000 
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alertMetrics, setAlertMetrics] = useState<AlertMetrics | null>(null);
  const [incidentMetrics, setIncidentMetrics] = useState<IncidentMetrics | null>(null);
  const [onCallSchedule, setOnCallSchedule] = useState<OnCallSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'alerts' | 'incidents' | 'oncall'>('overview');
  const [alertFilter, setAlertFilter] = useState<'all' | 'active' | 'critical'>('all');
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'open' | 'investigating'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        
        // Load alerts
        const allAlerts = alertManager.getAllAlerts();
        setAlerts(allAlerts);

        // Load incidents
        const allIncidents = incidentManager.getIncidents({ limit: 100 });
        setIncidents(allIncidents);

        // Generate alert metrics
        const alertStats = generateAlertMetrics(allAlerts);
        setAlertMetrics(alertStats);

        // Generate incident metrics
        const incidentStats = generateIncidentMetrics(allIncidents);
        setIncidentMetrics(incidentStats);

        // Load on-call schedule
        const schedule = generateOnCallSchedule();
        setOnCallSchedule(schedule);

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
  }, [refreshInterval]);

  const generateAlertMetrics = (alerts: Alert[]): AlertMetrics => {
    const now = new Date();
    
    const activeAlerts = alerts.filter(alert => !alert.resolved);
    const resolvedAlerts = alerts.filter(alert => alert.resolved);
    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');

    // Calculate average resolution time
    const avgResolutionTime = resolvedAlerts.length > 0 
      ? resolvedAlerts.reduce((sum, alert) => {
          if (alert.resolvedAt) {
            return sum + (alert.resolvedAt.getTime() - alert.timestamp.getTime());
          }
          return sum;
        }, 0) / resolvedAlerts.length
      : 0;

    // Generate hourly alert data
    const alertsByHour = Array.from({ length: 24 }, (_, i) => {
      const hour = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      const hourStart = new Date(hour.getFullYear(), hour.getMonth(), hour.getDate(), hour.getHours());
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      
      const count = alerts.filter(alert => 
        alert.timestamp >= hourStart && alert.timestamp < hourEnd
      ).length;

      return {
        hour: hourStart.toLocaleTimeString([], { hour: '2-digit' }),
        count
      };
    });

    // Generate alerts by severity
    const severityCounts = {
      critical: alerts.filter(a => a.severity === 'critical').length,
      error: alerts.filter(a => a.severity === 'error').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length
    };

    const alertsBySeverity = [
      { severity: 'Critical', count: severityCounts.critical, color: '#EF4444' },
      { severity: 'Error', count: severityCounts.error, color: '#F97316' },
      { severity: 'Warning', count: severityCounts.warning, color: '#EAB308' },
      { severity: 'Info', count: severityCounts.info, color: '#3B82F6' }
    ];

    return {
      totalAlerts: alerts.length,
      activeAlerts: activeAlerts.length,
      resolvedAlerts: resolvedAlerts.length,
      criticalAlerts: criticalAlerts.length,
      averageResolutionTime: avgResolutionTime,
      alertsByHour,
      alertsBySeverity
    };
  };

  const generateIncidentMetrics = (incidents: Incident[]): IncidentMetrics => {
    const openIncidents = incidents.filter(i => i.status === IncidentStatus.OPEN || i.status === IncidentStatus.INVESTIGATING);
    const resolvedIncidents = incidents.filter(i => i.status === IncidentStatus.RESOLVED || i.status === IncidentStatus.CLOSED);

    // Calculate average resolution time
    const avgResolutionTime = resolvedIncidents.length > 0 
      ? resolvedIncidents.reduce((sum, incident) => {
          if (incident.resolvedAt) {
            return sum + (new Date(incident.resolvedAt).getTime() - new Date(incident.createdAt).getTime());
          }
          return sum;
        }, 0) / resolvedIncidents.length
      : 0;

    // Generate incidents by status
    const statusCounts = {
      [IncidentStatus.OPEN]: incidents.filter(i => i.status === IncidentStatus.OPEN).length,
      [IncidentStatus.INVESTIGATING]: incidents.filter(i => i.status === IncidentStatus.INVESTIGATING).length,
      [IncidentStatus.IDENTIFIED]: incidents.filter(i => i.status === IncidentStatus.IDENTIFIED).length,
      [IncidentStatus.MONITORING]: incidents.filter(i => i.status === IncidentStatus.MONITORING).length,
      [IncidentStatus.RESOLVED]: incidents.filter(i => i.status === IncidentStatus.RESOLVED).length,
      [IncidentStatus.CLOSED]: incidents.filter(i => i.status === IncidentStatus.CLOSED).length
    };

    const incidentsByStatus = [
      { status: 'Open', count: statusCounts[IncidentStatus.OPEN], color: '#EF4444' },
      { status: 'Investigating', count: statusCounts[IncidentStatus.INVESTIGATING], color: '#F97316' },
      { status: 'Identified', count: statusCounts[IncidentStatus.IDENTIFIED], color: '#EAB308' },
      { status: 'Monitoring', count: statusCounts[IncidentStatus.MONITORING], color: '#3B82F6' },
      { status: 'Resolved', count: statusCounts[IncidentStatus.RESOLVED], color: '#10B981' },
      { status: 'Closed', count: statusCounts[IncidentStatus.CLOSED], color: '#6B7280' }
    ];

    // Generate trend data (last 7 days)
    const incidentTrends = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayIncidents = incidents.filter(incident => {
        const createdAt = new Date(incident.createdAt);
        return createdAt >= dayStart && createdAt < dayEnd;
      });

      const dayResolved = incidents.filter(incident => {
        if (!incident.resolvedAt) return false;
        const resolvedAt = new Date(incident.resolvedAt);
        return resolvedAt >= dayStart && resolvedAt < dayEnd;
      });

      return {
        date: dayStart.toLocaleDateString(),
        incidents: dayIncidents.length,
        resolved: dayResolved.length
      };
    });

    return {
      totalIncidents: incidents.length,
      openIncidents: openIncidents.length,
      resolvedIncidents: resolvedIncidents.length,
      averageResolutionTime: avgResolutionTime,
      incidentsByStatus,
      incidentTrends
    };
  };

  const generateOnCallSchedule = (): OnCallSchedule[] => {
    return [
      {
        id: '1',
        name: 'Alice Johnson',
        role: 'Primary On-Call',
        status: 'active',
        contactMethods: [
          { type: 'phone', value: '+1-555-0123' },
          { type: 'email', value: 'alice@company.com' },
          { type: 'slack', value: '@alice.johnson' }
        ],
        escalationLevel: 1,
        responseTime: 5
      },
      {
        id: '2',
        name: 'Bob Smith',
        role: 'Secondary On-Call',
        status: 'backup',
        contactMethods: [
          { type: 'phone', value: '+1-555-0124' },
          { type: 'email', value: 'bob@company.com' },
          { type: 'slack', value: '@bob.smith' }
        ],
        escalationLevel: 2,
        responseTime: 10
      },
      {
        id: '3',
        name: 'Carol Davis',
        role: 'Engineering Manager',
        status: 'backup',
        contactMethods: [
          { type: 'phone', value: '+1-555-0125' },
          { type: 'email', value: 'carol@company.com' },
          { type: 'slack', value: '@carol.davis' }
        ],
        escalationLevel: 3,
        responseTime: 15
      }
    ];
  };

  const getSeverityColor = (severity: AlertSeverity | IncidentSeverity) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-100';
      case 'error':
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'warning':
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'info':
      case 'low':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-slate-600 bg-slate-100';
    }
  };

  const getContactIcon = (type: 'phone' | 'email' | 'slack') => {
    switch (type) {
      case 'phone':
        return <Phone className="w-4 h-4" />;
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'slack':
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesFilter = alertFilter === 'all' || 
      (alertFilter === 'active' && !alert.resolved) ||
      (alertFilter === 'critical' && alert.severity === 'critical');
    
    const matchesSearch = !searchTerm || 
      alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.message.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const filteredIncidents = incidents.filter(incident => {
    const matchesFilter = incidentFilter === 'all' || 
      (incidentFilter === 'open' && incident.status === IncidentStatus.OPEN) ||
      (incidentFilter === 'investigating' && incident.status === IncidentStatus.INVESTIGATING);
    
    const matchesSearch = !searchTerm || 
      incident.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Bell className="w-6 h-6 animate-pulse text-blue-600" />
        <span className="ml-2 text-slate-600">Loading alerting data...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Alerting & Incident Management</h2>
          <p className="text-slate-600">Monitor active alerts, track incidents, and manage on-call schedules</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            <Settings className="w-4 h-4" />
            <span>Configure</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'alerts', label: 'Alerts', icon: Bell },
            { id: 'incidents', label: 'Incidents', icon: AlertTriangle },
            { id: 'oncall', label: 'On-Call', icon: Users }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSelectedTab(id as any)}
              className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {selectedTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Active Alerts</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {alertMetrics?.activeAlerts || 0}
                  </p>
                </div>
                <Bell className={`w-8 h-8 ${(alertMetrics?.activeAlerts || 0) > 0 ? 'text-red-500' : 'text-green-500'}`} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Critical Alerts</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {alertMetrics?.criticalAlerts || 0}
                  </p>
                </div>
                <AlertTriangle className={`w-8 h-8 ${(alertMetrics?.criticalAlerts || 0) > 0 ? 'text-red-500' : 'text-green-500'}`} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Open Incidents</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {incidentMetrics?.openIncidents || 0}
                  </p>
                </div>
                <AlertCircle className={`w-8 h-8 ${(incidentMetrics?.openIncidents || 0) > 0 ? 'text-orange-500' : 'text-green-500'}`} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Avg Resolution</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {alertMetrics ? Math.round(alertMetrics.averageResolutionTime / 1000 / 60) : 0}m
                  </p>
                </div>
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alert Trends */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Alert Trends (24h)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={alertMetrics?.alertsByHour || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Incident Trends */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Incident Trends (7d)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={incidentMetrics?.incidentTrends || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="incidents" stroke="#EF4444" name="New Incidents" strokeWidth={2} />
                  <Line type="monotone" dataKey="resolved" stroke="#10B981" name="Resolved" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alerts by Severity */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Alerts by Severity</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={alertMetrics?.alertsBySeverity || []}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="count"
                    nameKey="severity"
                  >
                    {(alertMetrics?.alertsBySeverity || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Incidents by Status */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Incidents by Status</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={incidentMetrics?.incidentsByStatus.filter(s => s.count > 0) || []}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="count"
                    nameKey="status"
                  >
                    {(incidentMetrics?.incidentsByStatus.filter(s => s.count > 0) || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {selectedTab === 'alerts' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg border border-slate-200">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search alerts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <select
                value={alertFilter}
                onChange={(e) => setAlertFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Alerts</option>
                <option value="active">Active Only</option>
                <option value="critical">Critical Only</option>
              </select>
            </div>
          </div>

          {/* Alerts List */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="divide-y divide-slate-200">
              {filteredAlerts.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No alerts found</h3>
                  <p className="text-slate-600">All systems are operating normally.</p>
                </div>
              ) : (
                filteredAlerts.map((alert) => (
                  <div key={alert.id} className="p-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className={`p-1 rounded-full ${getSeverityColor(alert.severity).split(' ')[1]}`}>
                          <AlertTriangle className={`w-4 h-4 ${getSeverityColor(alert.severity).split(' ')[0]}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                          <p className="text-sm text-slate-600">{alert.message}</p>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-xs text-slate-500 flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {alert.timestamp.toLocaleString()}
                            </span>
                            {alert.escalationLevel > 0 && (
                              <span className="text-xs text-orange-600 flex items-center">
                                <ArrowUp className="w-3 h-3 mr-1" />
                                Level {alert.escalationLevel}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                          {alert.severity}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          alert.resolved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {alert.resolved ? 'Resolved' : 'Active'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Incidents Tab */}
      {selectedTab === 'incidents' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg border border-slate-200">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search incidents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <select
                value={incidentFilter}
                onChange={(e) => setIncidentFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Incidents</option>
                <option value="open">Open Only</option>
                <option value="investigating">Investigating</option>
              </select>
            </div>
          </div>

          {/* Incidents List */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="divide-y divide-slate-200">
              {filteredIncidents.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No incidents found</h3>
                  <p className="text-slate-600">No incidents match your current filters.</p>
                </div>
              ) : (
                filteredIncidents.map((incident) => (
                  <div key={incident.id} className="p-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle className={`w-5 h-5 mt-0.5 ${getSeverityColor(incident.severity).split(' ')[0]}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{incident.title}</p>
                          <p className="text-sm text-slate-600 line-clamp-2">{incident.description}</p>
                          <div className="flex items-center space-x-4 mt-2">
                            <span className="text-xs text-slate-500 flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {new Date(incident.createdAt).toLocaleString()}
                            </span>
                            {incident.assignedTo && (
                              <span className="text-xs text-slate-500 flex items-center">
                                <User className="w-3 h-3 mr-1" />
                                {incident.assignedTo}
                              </span>
                            )}
                            <span className="text-xs text-slate-500 flex items-center">
                              <MessageSquare className="w-3 h-3 mr-1" />
                              {incident.timeline.length} updates
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(incident.severity)}`}>
                          {incident.severity}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          incident.status === IncidentStatus.RESOLVED || incident.status === IncidentStatus.CLOSED
                            ? 'bg-green-100 text-green-800'
                            : incident.status === IncidentStatus.INVESTIGATING
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {incident.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* On-Call Tab */}
      {selectedTab === 'oncall' && (
        <div className="space-y-6">
          {/* On-Call Schedule */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Current On-Call Schedule</h3>
            </div>
            <div className="divide-y divide-slate-200">
              {onCallSchedule.map((person) => (
                <div key={person.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-3 h-3 rounded-full ${
                        person.status === 'active' ? 'bg-green-500' :
                        person.status === 'backup' ? 'bg-yellow-500' : 'bg-slate-400'
                      }`}></div>
                      <div>
                        <h4 className="text-sm font-medium text-slate-900">{person.name}</h4>
                        <p className="text-sm text-slate-600">{person.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-900">Level {person.escalationLevel}</p>
                        <p className="text-xs text-slate-600">{person.responseTime}min response</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {person.contactMethods.map((contact, index) => (
                          <div key={index} className="p-1 bg-slate-100 rounded">
                            {getContactIcon(contact.type)}
                          </div>
                        ))}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        person.status === 'active' ? 'bg-green-100 text-green-800' :
                        person.status === 'backup' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {person.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Escalation Flow */}
          <div className="bg-white p-6 rounded-lg border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Escalation Flow</h3>
            <div className="flex items-center space-x-4">
              {onCallSchedule.map((person, index) => (
                <React.Fragment key={person.id}>
                  <div className="text-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      person.status === 'active' ? 'bg-green-100 text-green-600' :
                      person.status === 'backup' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      <User className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-medium text-slate-900 mt-2">{person.name}</p>
                    <p className="text-xs text-slate-600">{person.responseTime}min</p>
                  </div>
                  {index < onCallSchedule.length - 1 && (
                    <ArrowUp className="w-4 h-4 text-slate-400 rotate-90" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertingIncidentDashboard;