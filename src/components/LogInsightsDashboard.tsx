/**
 * Log Insights Dashboard Component
 * Displays automated log analysis insights and patterns
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingUp, 
  Activity, 
  Shield, 
  Clock,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { AutomatedInsight, AlertRule } from '../lib/logging/automatedAnalysis';

interface LogInsightsDashboardProps {
  className?: string;
}

interface InsightCardProps {
  insight: AutomatedInsight;
  onExpand: (insight: AutomatedInsight) => void;
}

const LogInsightsDashboard: React.FC<LogInsightsDashboardProps> = ({ className = '' }) => {
  const [insights, setInsights] = useState<AutomatedInsight[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

  useEffect(() => {
    loadInsights();
    loadAlertRules();
  }, []);

  const loadInsights = async () => {
    try {
      setLoading(true);
      // In a real implementation, this would call the automated analysis service
      // For now, we'll use mock data
      const mockInsights: AutomatedInsight[] = [
        {
          id: '1',
          type: 'anomaly',
          severity: 'high',
          title: 'Error Burst Detected',
          description: 'Unusual spike in error logs detected in the last 15 minutes',
          detectedAt: new Date(Date.now() - 15 * 60 * 1000),
          affectedPeriod: {
            start: new Date(Date.now() - 30 * 60 * 1000),
            end: new Date(),
          },
          metrics: {
            errorCount: 45,
            normalErrorCount: 5,
            increasePercentage: 800,
          },
          recommendations: [
            'Check recent deployments for introduced bugs',
            'Review system resources and capacity',
            'Investigate error patterns for root cause',
          ],
          relatedLogs: [],
          confidence: 92,
        },
        {
          id: '2',
          type: 'performance',
          severity: 'medium',
          title: 'Slow Response Times',
          description: '25% of API requests taking longer than 5 seconds',
          detectedAt: new Date(Date.now() - 45 * 60 * 1000),
          affectedPeriod: {
            start: new Date(Date.now() - 60 * 60 * 1000),
            end: new Date(),
          },
          metrics: {
            slowRequests: 127,
            totalRequests: 508,
            averageResponseTime: 6200,
          },
          recommendations: [
            'Investigate database query performance',
            'Check external API response times',
            'Consider implementing caching',
          ],
          relatedLogs: [],
          confidence: 78,
        },
      ];
      
      setInsights(mockInsights);
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAlertRules = async () => {
    try {
      // Mock alert rules
      const mockRules: AlertRule[] = [
        {
          id: '1',
          name: 'High Error Rate',
          description: 'Alert when error rate exceeds 5%',
          enabled: true,
          conditions: [],
          actions: [],
          cooldownMinutes: 30,
          severity: 'high',
        },
        {
          id: '2',
          name: 'Log Volume Spike',
          description: 'Alert on 300% volume increase',
          enabled: true,
          conditions: [],
          actions: [],
          cooldownMinutes: 15,
          severity: 'medium',
        },
      ];
      
      setAlertRules(mockRules);
    } catch (error) {
      console.error('Failed to load alert rules:', error);
    }
  };

  const filteredInsights = insights.filter(insight => {
    const matchesType = selectedType === 'all' || insight.type === selectedType;
    const matchesSeverity = selectedSeverity === 'all' || insight.severity === selectedSeverity;
    const matchesSearch = searchTerm === '' || 
      insight.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insight.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesType && matchesSeverity && matchesSearch;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'anomaly': return <AlertTriangle className="w-5 h-5" />;
      case 'performance': return <TrendingUp className="w-5 h-5" />;
      case 'pattern': return <Activity className="w-5 h-5" />;
      case 'security': return <Shield className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading insights...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Log Insights</h2>
        <p className="text-gray-600">Automated analysis and pattern detection from your logs</p>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-64">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search insights..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Types</option>
          <option value="anomaly">Anomalies</option>
          <option value="performance">Performance</option>
          <option value="pattern">Patterns</option>
          <option value="security">Security</option>
        </select>
        
        <select
          value={selectedSeverity}
          onChange={(e) => setSelectedSeverity(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        
        <button
          onClick={loadInsights}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Insights</p>
              <p className="text-2xl font-bold text-gray-900">{insights.length}</p>
            </div>
            <Activity className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Critical</p>
              <p className="text-2xl font-bold text-red-600">
                {insights.filter(i => i.severity === 'critical').length}
              </p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Rules</p>
              <p className="text-2xl font-bold text-green-600">
                {alertRules.filter(r => r.enabled).length}
              </p>
            </div>
            <Shield className="w-8 h-8 text-green-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Confidence</p>
              <p className="text-2xl font-bold text-blue-600">
                {insights.length > 0 
                  ? Math.round(insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length)
                  : 0}%
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Insights List */}
      <div className="space-y-4">
        {filteredInsights.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No insights found</h3>
            <p className="text-gray-600">
              {searchTerm || selectedType !== 'all' || selectedSeverity !== 'all'
                ? 'Try adjusting your filters or search terms'
                : 'No automated insights have been generated yet'}
            </p>
          </div>
        ) : (
          filteredInsights.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onExpand={(insight) => 
                setExpandedInsight(expandedInsight === insight.id ? null : insight.id)
              }
            />
          ))
        )}
      </div>
    </div>
  );
};

const InsightCard: React.FC<InsightCardProps> = ({ insight, onExpand }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'anomaly': return <AlertTriangle className="w-5 h-5" />;
      case 'performance': return <TrendingUp className="w-5 h-5" />;
      case 'pattern': return <Activity className="w-5 h-5" />;
      case 'security': return <Shield className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div 
        className="flex items-start justify-between cursor-pointer"
        onClick={() => {
          setIsExpanded(!isExpanded);
          onExpand(insight);
        }}
      >
        <div className="flex items-start space-x-3 flex-1">
          <div className={`p-2 rounded-lg border ${getSeverityColor(insight.severity)}`}>
            {getTypeIcon(insight.type)}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">{insight.title}</h3>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(insight.severity)}`}>
                {insight.severity.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {insight.confidence}% confidence
              </span>
            </div>
            
            <p className="text-gray-600 mb-2">{insight.description}</p>
            
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>{formatTimeAgo(insight.detectedAt)}</span>
              </div>
              <span className="capitalize">{insight.type}</span>
            </div>
          </div>
        </div>
        
        <div className="ml-4">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          {/* Metrics */}
          {Object.keys(insight.metrics).length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Metrics</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(insight.metrics).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {typeof value === 'number' ? value.toLocaleString() : value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Recommendations */}
          {insight.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Recommendations</h4>
              <ul className="space-y-1">
                {insight.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LogInsightsDashboard;