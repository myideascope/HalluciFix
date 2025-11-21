/**
 * Health Check Dashboard
 * System health monitoring and diagnostics interface
 */

import React, { useState, useEffect } from 'react';
import { logger } from './logging';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Cpu, 
  HardDrive, 
  Wifi, 
  Memory,
  RefreshCw,
  Download,
  Search,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { 
  healthCheckService, 
  HealthCheckResult, 
  HealthStatus, 
  SystemDiagnostics,
  ErrorCorrelation 
} from '../lib/errors/healthCheck';

interface HealthCheckDashboardProps {
  className?: string;
}

export const HealthCheckDashboard: React.FC<HealthCheckDashboardProps> = ({ 
  className = '' 
}) => {
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [selectedErrorId, setSelectedErrorId] = useState<string>('');
  const [errorCorrelation, setErrorCorrelation] = useState<ErrorCorrelation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'health' | 'diagnostics' | 'correlation'>('health');

  // Load health data
  useEffect(() => {
    const loadHealthData = async () => {
      try {
        setIsLoading(true);
        const [health, diag] = await Promise.all([
          healthCheckService.performHealthCheck(),
          healthCheckService.getSystemDiagnostics()
        ]);
        
        setHealthResult(health);
        setDiagnostics(diag);
      } catch (error) {
        logger.error("Failed to load health data:", error instanceof Error ? error : new Error(String(error)));
      } finally {
        setIsLoading(false);
      }
    };

    loadHealthData();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const [health, diag] = await Promise.all([
        healthCheckService.performHealthCheck(),
        healthCheckService.getSystemDiagnostics()
      ]);
      
      setHealthResult(health);
      setDiagnostics(diag);
    } catch (error) {
      logger.error("Failed to refresh health data:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeError = () => {
    if (!selectedErrorId.trim()) return;
    
    const correlation = healthCheckService.analyzeErrorCorrelation(selectedErrorId);
    setErrorCorrelation(correlation);
  };

  const handleDownloadDiagnostics = () => {
    if (!diagnostics) return;
    
    const dataStr = JSON.stringify(diagnostics, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-diagnostics-${new Date().toISOString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
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
        return <Minus className="w-5 h-5 text-yellow-600" />;
      case HealthStatus.UNHEALTHY:
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case HealthStatus.CRITICAL:
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Activity className="w-5 h-5 text-slate-600" />;
    }
  };

  if (isLoading && !healthResult) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-600">Loading health data...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Health</h2>
          <p className="text-slate-600">Monitor system health and diagnostics</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center space-x-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleDownloadDiagnostics}
            className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Overall Status */}
      {healthResult && (
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {getStatusIcon(healthResult.status)}
              <div>
                <h3 className="text-lg font-semibold text-slate-900">System Status</h3>
                <p className={`text-sm font-medium ${getStatusColor(healthResult.status).split(' ')[0]}`}>
                  {healthResult.status.toUpperCase()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Last Updated</p>
              <p className="text-sm font-medium text-slate-900">
                {new Date(healthResult.timestamp).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{healthResult.summary.healthyChecks}</p>
              <p className="text-sm text-slate-600">Healthy</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{healthResult.summary.degradedChecks}</p>
              <p className="text-sm text-slate-600">Degraded</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{healthResult.summary.unhealthyChecks}</p>
              <p className="text-sm text-slate-600">Unhealthy</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{healthResult.summary.criticalChecks}</p>
              <p className="text-sm text-slate-600">Critical</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'health', label: 'Health Checks', icon: Activity },
            { id: 'diagnostics', label: 'System Diagnostics', icon: Cpu },
            { id: 'correlation', label: 'Error Analysis', icon: Search }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === id
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

      {/* Tab Content */}
      {activeTab === 'health' && healthResult && (
        <div className="space-y-6">
          {/* Health Checks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(healthResult.checks).map(([checkName, result]) => (
              <div key={checkName} className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(result.status)}
                    <h3 className="text-lg font-semibold text-slate-900 capitalize">
                      {checkName.replace(/([A-Z])/g, ' $1').trim()}
                    </h3>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)}`}>
                    {result.status}
                  </span>
                </div>
                
                <p className="text-sm text-slate-600 mb-3">{result.message}</p>
                
                {result.value !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Current Value:</span>
                    <span className="font-medium text-slate-900">{result.value}</span>
                  </div>
                )}
                
                {result.threshold !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Threshold:</span>
                    <span className="font-medium text-slate-900">{result.threshold}</span>
                  </div>
                )}
                
                <div className="mt-3 text-xs text-slate-500">
                  Last checked: {new Date(result.lastChecked).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          {healthResult.recommendations.length > 0 && (
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {healthResult.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start space-x-2 text-sm text-blue-800">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                    <span>{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'diagnostics' && diagnostics && (
        <div className="space-y-6">
          {/* System Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Memory Usage */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-3 mb-3">
                <Memory className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-semibold text-slate-900">Memory</h3>
              </div>
              {diagnostics.system.memoryInfo ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Used:</span>
                    <span className="font-medium">
                      {Math.round(diagnostics.system.memoryInfo.usedJSHeapSize / 1024 / 1024)}MB
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Total:</span>
                    <span className="font-medium">
                      {Math.round(diagnostics.system.memoryInfo.totalJSHeapSize / 1024 / 1024)}MB
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ 
                        width: `${(diagnostics.system.memoryInfo.usedJSHeapSize / diagnostics.system.memoryInfo.jsHeapSizeLimit) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Memory info not available</p>
              )}
            </div>

            {/* Storage */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-3 mb-3">
                <HardDrive className="w-6 h-6 text-green-600" />
                <h3 className="text-lg font-semibold text-slate-900">Storage</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Local Storage:</span>
                  <span className={`font-medium ${diagnostics.storage.localStorage.available ? 'text-green-600' : 'text-red-600'}`}>
                    {diagnostics.storage.localStorage.available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Session Storage:</span>
                  <span className={`font-medium ${diagnostics.storage.sessionStorage.available ? 'text-green-600' : 'text-red-600'}`}>
                    {diagnostics.storage.sessionStorage.available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">IndexedDB:</span>
                  <span className={`font-medium ${diagnostics.storage.indexedDB.available ? 'text-green-600' : 'text-red-600'}`}>
                    {diagnostics.storage.indexedDB.available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>

            {/* Connectivity */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-3 mb-3">
                <Wifi className="w-6 h-6 text-purple-600" />
                <h3 className="text-lg font-semibold text-slate-900">Network</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Status:</span>
                  <span className={`font-medium ${diagnostics.connectivity.online ? 'text-green-600' : 'text-red-600'}`}>
                    {diagnostics.connectivity.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                {diagnostics.connectivity.effectiveType && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Connection:</span>
                    <span className="font-medium">{diagnostics.connectivity.effectiveType}</span>
                  </div>
                )}
                {diagnostics.connectivity.downlink && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Downlink:</span>
                    <span className="font-medium">{diagnostics.connectivity.downlink} Mbps</span>
                  </div>
                )}
              </div>
            </div>

            {/* Error Stats */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-3 mb-3">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                <h3 className="text-lg font-semibold text-slate-900">Errors</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total:</span>
                  <span className="font-medium">{diagnostics.errorStats.totalErrors}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Rate:</span>
                  <span className="font-medium">{diagnostics.errorStats.errorRate}/min</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Recent:</span>
                  <span className="font-medium">{diagnostics.errorStats.recentErrors.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed System Info */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">System Information</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-3">Environment</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Platform:</span>
                      <span className="font-medium">{diagnostics.system.platform}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Language:</span>
                      <span className="font-medium">{diagnostics.system.language}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Cookies:</span>
                      <span className={`font-medium ${diagnostics.system.cookieEnabled ? 'text-green-600' : 'text-red-600'}`}>
                        {diagnostics.system.cookieEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-3">Configuration</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Environment:</span>
                      <span className="font-medium">{diagnostics.configuration.environment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Version:</span>
                      <span className="font-medium">{diagnostics.configuration.version}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'correlation' && (
        <div className="space-y-6">
          {/* Error Analysis Input */}
          <div className="bg-white p-6 rounded-lg border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Error Correlation Analysis</h3>
            <div className="flex space-x-3">
              <input
                type="text"
                placeholder="Enter error ID to analyze..."
                value={selectedErrorId}
                onChange={(e) => setSelectedErrorId(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleAnalyzeError}
                disabled={!selectedErrorId.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Analyze
              </button>
            </div>
          </div>

          {/* Correlation Results */}
          {errorCorrelation && (
            <div className="space-y-6">
              {/* Root Cause Analysis */}
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Root Cause Analysis</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Likely Root Cause</h4>
                    <p className="text-sm text-slate-900">{errorCorrelation.rootCauseAnalysis.likelyRootCause}</p>
                    <div className="mt-2">
                      <span className="text-xs text-slate-600">Confidence: </span>
                      <span className="text-xs font-medium">
                        {Math.round(errorCorrelation.rootCauseAnalysis.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  
                  {errorCorrelation.rootCauseAnalysis.contributingFactors.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Contributing Factors</h4>
                      <ul className="space-y-1">
                        {errorCorrelation.rootCauseAnalysis.contributingFactors.map((factor, index) => (
                          <li key={index} className="text-sm text-slate-600 flex items-start space-x-2">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></span>
                            <span>{factor}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {errorCorrelation.rootCauseAnalysis.recommendations.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Recommendations</h4>
                      <ul className="space-y-1">
                        {errorCorrelation.rootCauseAnalysis.recommendations.map((recommendation, index) => (
                          <li key={index} className="text-sm text-blue-600 flex items-start space-x-2">
                            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                            <span>{recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Impact Assessment */}
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Impact Assessment</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-1">User Impact</p>
                    <p className={`text-lg font-semibold ${
                      errorCorrelation.impactAssessment.userImpact === 'critical' ? 'text-red-600' :
                      errorCorrelation.impactAssessment.userImpact === 'high' ? 'text-orange-600' :
                      errorCorrelation.impactAssessment.userImpact === 'medium' ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {errorCorrelation.impactAssessment.userImpact.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-1">System Impact</p>
                    <p className={`text-lg font-semibold ${
                      errorCorrelation.impactAssessment.systemImpact === 'critical' ? 'text-red-600' :
                      errorCorrelation.impactAssessment.systemImpact === 'high' ? 'text-orange-600' :
                      errorCorrelation.impactAssessment.systemImpact === 'medium' ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {errorCorrelation.impactAssessment.systemImpact.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-1">Business Impact</p>
                    <p className={`text-lg font-semibold ${
                      errorCorrelation.impactAssessment.businessImpact === 'critical' ? 'text-red-600' :
                      errorCorrelation.impactAssessment.businessImpact === 'high' ? 'text-orange-600' :
                      errorCorrelation.impactAssessment.businessImpact === 'medium' ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {errorCorrelation.impactAssessment.businessImpact.toUpperCase()}
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Affected Users:</span>
                    <span className="font-medium">{errorCorrelation.impactAssessment.affectedUsers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Estimated Downtime:</span>
                    <span className="font-medium">{errorCorrelation.impactAssessment.estimatedDowntime} min</span>
                  </div>
                </div>
              </div>

              {/* Related Errors and Patterns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg border border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Related Errors</h3>
                  {errorCorrelation.relatedErrors.length > 0 ? (
                    <div className="space-y-2">
                      {errorCorrelation.relatedErrors.slice(0, 5).map((errorId, index) => (
                        <div key={index} className="text-sm font-mono text-slate-600 bg-slate-50 p-2 rounded">
                          {errorId}
                        </div>
                      ))}
                      {errorCorrelation.relatedErrors.length > 5 && (
                        <p className="text-sm text-slate-500">
                          +{errorCorrelation.relatedErrors.length - 5} more errors
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No related errors found</p>
                  )}
                </div>

                <div className="bg-white p-6 rounded-lg border border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Common Patterns</h3>
                  {errorCorrelation.commonPatterns.length > 0 ? (
                    <ul className="space-y-2">
                      {errorCorrelation.commonPatterns.map((pattern, index) => (
                        <li key={index} className="text-sm text-slate-600 flex items-start space-x-2">
                          <span className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-2 flex-shrink-0"></span>
                          <span>{pattern}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No common patterns identified</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};