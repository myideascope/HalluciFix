import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, Users, FileText, Zap } from 'lucide-react';
import { AnalysisResult } from '../types/analysis';
import { User } from '../types/user';
import { useOptimizedData } from '../hooks/useOptimizedData';
import { useUserEngagement, useFeatureTracking } from '../hooks/useUserEngagement';
import { useComponentLogger, usePerformanceLogger } from '../hooks/useLogger';
import ResultsViewer from './ResultsViewer';

interface DashboardProps {
  analysisResults?: AnalysisResult[]; // Made optional since we'll fetch optimized data
  setActiveTab: (tab: string) => void;
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ analysisResults: propAnalysisResults, setActiveTab, user }) => {
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [selectedRAGAnalysis, setSelectedRAGAnalysis] = useState<any>(null);

  // Logging hooks
  const { logUserAction, info, warn, error } = useComponentLogger('Dashboard', { userId: user?.id });
  const { measurePerformance } = usePerformanceLogger();

  // User engagement tracking
  const { trackPageView, trackFeatureUsage, trackInteraction, trackJourneyStep } = useUserEngagement({
    trackPageViews: true,
    trackClicks: true,
    trackScrolling: true
  });
  const dashboardTracking = useFeatureTracking('dashboard');

  // Track dashboard view
  useEffect(() => {
    const startTime = performance.now();
    
    // Log dashboard access
    info('Dashboard accessed', {
      userId: user?.id,
      timestamp: new Date().toISOString(),
    });
    
    // Track user engagement
    trackPageView('/dashboard', { title: 'Dashboard' });
    trackJourneyStep('dashboard_viewed');
    dashboardTracking.startTracking({ user_id: user?.id });

    return () => {
      const duration = performance.now() - startTime;
      
      // Log dashboard session duration
      logUserAction('dashboard_session_ended', {
        duration,
        userId: user?.id,
      });
      
      dashboardTracking.endTracking({ duration, user_id: user?.id });
    };
  }, [trackPageView, trackJourneyStep, dashboardTracking, user?.id, info, logUserAction]);

  // Use optimized data fetching to eliminate N+1 patterns
  const { data: optimizedData, isLoading, error } = useOptimizedData(user?.id || null, {
    includeAnalyses: true,
    includeDashboard: true,
    analysisLimit: 10,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000 // 5 minutes
  });

  // Track data loading performance
  useEffect(() => {
    if (isLoading) {
      info('Dashboard data loading started', { userId: user?.id });
    } else if (optimizedData) {
      info('Dashboard data loaded successfully', {
        userId: user?.id,
        analysisCount: optimizedData.analysisResults?.length || 0,
        hasDashboardData: !!optimizedData.dashboardData,
      });
    } else if (error) {
      // Log error with full context for tracking
      logUserAction('dashboard_data_load_failed', {
        userId: user?.id,
        errorMessage: error.message,
        timestamp: new Date().toISOString(),
      });
      
      warn('Dashboard data loading failed', undefined, {
        userId: user?.id,
        error: error.message,
      });
    }
  }, [isLoading, optimizedData, error, info, warn, logUserAction, user?.id]);

  // Use optimized data if available, fallback to props, then empty state
  const analysisResults = optimizedData?.analysisResults || propAnalysisResults || [];
  const dashboardData = optimizedData?.dashboardData;
  const hasData = analysisResults.length > 0;
  
  // Use optimized dashboard data if available, otherwise calculate from analysis results
  const stats = dashboardData?.stats || {
    totalAnalyses: analysisResults.length,
    averageAccuracy: hasData 
      ? analysisResults.reduce((sum, result) => sum + result.accuracy, 0) / analysisResults.length
      : 0,
    totalHallucinations: analysisResults.reduce((sum, result) => sum + result.hallucinations.length, 0),
    activeUsers: 1
  };

  const riskDistribution = dashboardData?.riskDistribution || (hasData ? {
    low: Math.round((analysisResults.filter(r => r.riskLevel === 'low').length / analysisResults.length) * 100),
    medium: Math.round((analysisResults.filter(r => r.riskLevel === 'medium').length / analysisResults.length) * 100),
    high: Math.round((analysisResults.filter(r => r.riskLevel === 'high').length / analysisResults.length) * 100),
    critical: Math.round((analysisResults.filter(r => r.riskLevel === 'critical').length / analysisResults.length) * 100)
  } : { low: 0, medium: 0, high: 0, critical: 0 });

  const statsArray = [
    {
      label: 'Total Analyses',
      value: hasData ? stats.totalAnalyses.toLocaleString() : '0',
      change: hasData ? '+' + Math.round(Math.random() * 20) + '%' : '0%',
      trend: 'up',
      icon: FileText,
      color: 'blue'
    },
    {
      label: 'Accuracy Rate',
      value: hasData ? stats.averageAccuracy.toFixed(1) + '%' : '0%',
      change: hasData ? '+' + (Math.random() * 5).toFixed(1) + '%' : '0%',
      trend: 'up',
      icon: CheckCircle2,
      color: 'green'
    },
    {
      label: 'Hallucinations Detected',
      value: stats.totalHallucinations.toString(),
      change: hasData ? '-' + Math.round(Math.random() * 10) + '%' : '0%',
      trend: hasData ? 'down' : 'up',
      icon: AlertTriangle,
      color: 'orange'
    },
    {
      label: 'Active Users',
      value: stats.activeUsers.toString(),
      change: '0%',
      trend: 'up',
      icon: Users,
      color: 'purple'
    }
  ];

  // Use optimized recent analyses or fallback to analysis results
  const recentAnalyses = dashboardData?.recentAnalyses || analysisResults.slice(0, 4);
  const recentDetections = recentAnalyses.map((result: AnalysisResult) => ({
    id: result.id,
    content: result.content,
    riskLevel: result.riskLevel,
    accuracy: result.accuracy,
    timestamp: getRelativeTime(result.timestamp),
    user: user?.name || 'Unknown User',
    fullResult: result
  }));

  function getRelativeTime(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-700 bg-green-100';
      case 'medium': return 'text-amber-700 bg-amber-100';
      case 'high': return 'text-orange-700 bg-orange-100';
      case 'critical': return 'text-red-700 bg-red-100';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  const getStatColor = (color: string) => {
    switch (color) {
      case 'blue': return 'bg-blue-100 text-blue-600';
      case 'green': return 'bg-green-100 text-green-600';
      case 'orange': return 'bg-orange-100 text-orange-600';
      case 'purple': return 'bg-purple-100 text-purple-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  // Show loading state
  if (isLoading && !optimizedData) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-slate-600 dark:text-slate-400">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !optimizedData) {
    return (
      <div className="space-y-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-3" />
          <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">Failed to Load Dashboard</h4>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">
            {error.message || 'An error occurred while loading the dashboard data.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsArray.map((stat, index) => {
          const Icon = stat.icon;
          const TrendIcon = stat.trend === 'up' ? TrendingUp : TrendingDown;
          
          return (
            <div 
              key={index} 
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200 cursor-pointer hover:shadow-md"
              onClick={() => {
                trackInteraction({
                  type: 'click',
                  element: 'stat_card',
                  metadata: { 
                    stat_label: stat.label,
                    stat_value: stat.value,
                    stat_color: stat.color
                  }
                });
                trackFeatureUsage('dashboard_stat_card', undefined, { stat_type: stat.label });
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${getStatColor(stat.color)}`}>
                  <Icon className="w-6 h-6" />
                </div>
                
                <div className={`flex items-center space-x-1 text-sm font-medium ${
                  stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  <TrendIcon className="w-4 h-4" />
                  <span>{stat.change}</span>
                </div>
              </div>
              
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">{stat.value}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accuracy Trends */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Accuracy Trends</h3>
            <select className="text-sm border border-slate-300 dark:border-slate-600 rounded px-3 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
            </select>
          </div>
          
          <div className="h-64 flex items-end justify-between space-x-2">
            {hasData ? 
              analysisResults.slice(-7).map((result, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-600 rounded-t transition-all duration-500 hover:bg-blue-700"
                    style={{ height: `${(result.accuracy / 100) * 200}px` }}
                  ></div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {new Date(result.timestamp).toLocaleDateString('en', { weekday: 'short' })}
                  </span>
                </div>
              )) :
              [0, 0, 0, 0, 0, 0, 0].map((value, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-slate-300 rounded-t transition-all duration-500"
                    style={{ height: `${value}px` }}
                  ></div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Risk Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Risk Distribution</h3>
          
          <div className="space-y-4">
            {[
              { label: 'Low Risk', value: riskDistribution.low, color: 'bg-green-500' },
              { label: 'Medium Risk', value: riskDistribution.medium, color: 'bg-amber-500' },
              { label: 'High Risk', value: riskDistribution.high, color: 'bg-orange-500' },
              { label: 'Critical Risk', value: riskDistribution.critical, color: 'bg-red-500' }
            ].map((item, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{item.value}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-500 ${item.color}`}
                    style={{ width: `${item.value}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Recent Detections */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Recent Detections</h3>
          <button 
            onClick={() => {
              trackInteraction({
                type: 'click',
                element: 'view_all_button',
                metadata: { section: 'recent_detections' }
              });
              trackFeatureUsage('dashboard_view_all', undefined, { section: 'analytics' });
              trackJourneyStep('analytics_navigation');
              setActiveTab('analytics');
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          >
            View All
          </button>
        </div>

        {hasData ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600">
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Content</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Risk Level</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Accuracy</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">User</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Seq-Logprob</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {recentDetections.map((detection) => (
                  <tr key={detection.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => {
                          trackInteraction({
                            type: 'click',
                            element: 'detection_result',
                            metadata: { 
                              detection_id: detection.id,
                              risk_level: detection.riskLevel,
                              accuracy: detection.accuracy
                            }
                          });
                          trackFeatureUsage('dashboard_result_viewer', undefined, { 
                            result_type: 'detection',
                            risk_level: detection.riskLevel 
                          });
                          trackJourneyStep('result_viewed');
                          setSelectedResult(detection.fullResult);
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 truncate max-w-xs text-left underline"
                      >
                        {detection.content}
                      </button>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(detection.riskLevel)}`}>
                        {detection.riskLevel}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {detection.accuracy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{detection.user}</span>
                    </td>
                    <td className="py-3">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{detection.timestamp}</span>
                    </td>
                    <td className="py-3">
                      {detection.fullResult.seqLogprobAnalysis && (
                        <div className="text-center">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {detection.fullResult.seqLogprobAnalysis.confidenceScore}%
                          </span>
                          <div className={`text-xs px-1 py-0.5 rounded mt-1 ${
                            detection.fullResult.seqLogprobAnalysis.isHallucinationSuspected 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {detection.fullResult.seqLogprobAnalysis.hallucinationRisk}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">No Analysis Data Yet</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Complete your first content analysis to see recent detections here.
            </p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 text-center transition-colors duration-200">
          <div className="p-3 bg-blue-100 rounded-lg w-fit mx-auto mb-4">
            <Zap className="w-6 h-6 text-blue-600" />
          </div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Batch Analysis</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Process multiple documents simultaneously for efficiency.
          </p>
          <button 
            onClick={() => {
              trackInteraction({
                type: 'click',
                element: 'quick_action_button',
                metadata: { action: 'batch_analysis' }
              });
              trackFeatureUsage('dashboard_quick_action', undefined, { action_type: 'batch' });
              trackJourneyStep('batch_analysis_started');
              setActiveTab('batch');
            }}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm"
          >
            Start Batch Process
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 text-center transition-colors duration-200">
          <div className="p-3 bg-green-100 rounded-lg w-fit mx-auto mb-4">
            <FileText className="w-6 h-6 text-green-600" />
          </div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">API Integration</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Integrate detection directly into your existing workflows.
          </p>
          <button 
            onClick={() => {
              trackInteraction({
                type: 'click',
                element: 'quick_action_button',
                metadata: { action: 'api_docs' }
              });
              trackFeatureUsage('dashboard_quick_action', undefined, { action_type: 'api_docs' });
              trackJourneyStep('api_docs_viewed');
              window.open('/api-docs', '_blank');
            }}
            className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium text-sm"
          >
            View API Docs
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 text-center transition-colors duration-200">
          <div className="p-3 bg-purple-100 rounded-lg w-fit mx-auto mb-4">
            <Clock className="w-6 h-6 text-purple-600" />
          </div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Scheduled Scans</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Set up automated content monitoring and alerts.
          </p>
          <button 
            onClick={() => {
              trackInteraction({
                type: 'click',
                element: 'quick_action_button',
                metadata: { action: 'scheduled_scans' }
              });
              trackFeatureUsage('dashboard_quick_action', undefined, { action_type: 'scheduled_scans' });
              trackJourneyStep('scheduled_scans_configured');
              setActiveTab('scheduled');
            }}
            className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium text-sm"
          >
            Configure Scans
          </button>
        </div>
      </div>

      {/* Results Viewer Modal */}
      {selectedResult && (
        <ResultsViewer 
          result={selectedResult} 
          ragAnalysis={selectedRAGAnalysis}
          onClose={() => {
            setSelectedResult(null);
            setSelectedRAGAnalysis(null);
          }} 
        />
      )}
    </div>
  );
};

export default Dashboard;