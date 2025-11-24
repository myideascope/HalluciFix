/**
 * Migration Validation Component
 * 
 * Displays migration validation results and cleanup actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Loader2,
  Activity,
  Database,
  Shield,
  Cloud,
  Zap,
  Monitor,
  Trash2,
  Download,
  RefreshCw,
  Clock,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { 
  migrationValidationService, 
  ValidationReport, 
  ValidationResult,
  CleanupResult
} from '../lib/migrationValidationService';
import { useToast } from '../hooks/useToast';

interface MigrationValidationProps {
  onValidationComplete?: (report: ValidationReport) => void;
  onCleanupComplete?: (results: CleanupResult[]) => void;
}

export const MigrationValidation: React.FC<MigrationValidationProps> = ({
  onValidationComplete,
  onCleanupComplete
}) => {
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupResults, setCleanupResults] = useState<CleanupResult[]>([]);
  const [showDetails, setShowDetails] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  const runValidation = useCallback(async () => {
    if (isValidating) return;

    setIsValidating(true);
    
    try {
      const report = await migrationValidationService.runFullValidation();
      setValidationReport(report);
      showToast('Validation completed successfully', 'success');
      onValidationComplete?.(report);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      showToast(`Validation failed: ${errorMessage}`, 'error');
    } finally {
      setIsValidating(false);
    }
  }, [onValidationComplete]);

  useEffect(() => {
    runValidation();
  }, []);

  const executeCleanup = async () => {
    if (!validationReport || isCleaningUp) return;

    setIsCleaningUp(true);
    
    try {
      showToast('Starting cleanup process...', 'info');
      
      const results = await migrationValidationService.executeCleanup(validationReport.cleanupActions);
      setCleanupResults(results);
      
      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;
      
      if (errorCount === 0) {
        showToast(`Cleanup completed successfully (${successCount} actions)`, 'success');
      } else {
        showToast(`Cleanup completed with ${errorCount} errors`, 'warning');
      }
      
      onCleanupComplete?.(results);
      
    } catch (error) {
      const errorMessage = (error as Error).message;
      showToast(`Cleanup failed: ${errorMessage}`, 'error');
    } finally {
      setIsCleaningUp(false);
    }
  };

  const toggleDetails = (serviceId: string) => {
    setShowDetails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serviceId)) {
        newSet.delete(serviceId);
      } else {
        newSet.add(serviceId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: ValidationResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
    }
  };

  const getServiceIcon = (service: string) => {
    if (service.includes('cognito') || service.includes('auth')) return <Shield className="w-4 h-4" />;
    if (service.includes('database') || service.includes('rds')) return <Database className="w-4 h-4" />;
    if (service.includes('storage') || service.includes('s3')) return <Cloud className="w-4 h-4" />;
    if (service.includes('api') || service.includes('gateway')) return <Zap className="w-4 h-4" />;
    if (service.includes('lambda')) return <Activity className="w-4 h-4" />;
    if (service.includes('monitoring') || service.includes('cloudwatch')) return <Monitor className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const getCleanupStatusIcon = (status: CleanupResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
  };

  const formatLatency = (latency: number) => {
    if (latency < 1000) return `${latency}ms`;
    return `${(latency / 1000).toFixed(2)}s`;
  };

  const getOverallStatusColor = (status: ValidationReport['overallStatus']) => {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Migration Validation & Cleanup
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Verify migration success and clean up legacy resources
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        <button
          onClick={runValidation}
          disabled={isValidating}
          className={`
            flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors
            ${isValidating
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
          `}
        >
          {isValidating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Validating...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              <span>Run Validation</span>
            </>
          )}
        </button>

        {validationReport && validationReport.overallStatus === 'success' && (
          <button
            onClick={executeCleanup}
            disabled={isCleaningUp}
            className={`
              flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors
              ${isCleaningUp
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
              }
            `}
          >
            {isCleaningUp ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Cleaning Up...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                <span>Execute Cleanup</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Validation Report */}
      {validationReport && (
        <div className="space-y-6">
          {/* Overall Status */}
          <div className={`p-6 rounded-lg border ${getOverallStatusColor(validationReport.overallStatus)}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                {getStatusIcon(validationReport.overallStatus)}
                <h2 className="text-xl font-semibold">
                  Migration Validation {validationReport.overallStatus.toUpperCase()}
                </h2>
              </div>
              <div className="text-sm">
                Duration: {(validationReport.duration / 1000).toFixed(2)}s
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{formatLatency(validationReport.performanceMetrics.authenticationLatency)}</div>
                <div className="text-sm opacity-75">Auth Latency</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatLatency(validationReport.performanceMetrics.databaseLatency)}</div>
                <div className="text-sm opacity-75">DB Latency</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatLatency(validationReport.performanceMetrics.storageLatency)}</div>
                <div className="text-sm opacity-75">Storage Latency</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatLatency(validationReport.performanceMetrics.apiLatency)}</div>
                <div className="text-sm opacity-75">API Latency</div>
              </div>
            </div>

            {/* Error Rates */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-lg font-semibold">{validationReport.errorRates.authentication.toFixed(1)}%</div>
                <div className="text-xs opacity-75">Auth Errors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{validationReport.errorRates.database.toFixed(1)}%</div>
                <div className="text-xs opacity-75">DB Errors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{validationReport.errorRates.storage.toFixed(1)}%</div>
                <div className="text-xs opacity-75">Storage Errors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{validationReport.errorRates.api.toFixed(1)}%</div>
                <div className="text-xs opacity-75">API Errors</div>
              </div>
            </div>
          </div>

          {/* Service Validation Results */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Service Validation Results
            </h3>
            
            <div className="space-y-3">
              {validationReport.validationResults.map((result, index) => (
                <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleDetails(result.service)}
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(result.status)}
                      {getServiceIcon(result.service)}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {result.service.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {result.message}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500">
                        {result.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  {showDetails.has(result.service) && result.details && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                      <pre className="text-xs bg-gray-50 dark:bg-gray-700 p-3 rounded overflow-x-auto">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {validationReport.recommendations.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-4 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Recommendations
              </h3>
              <ul className="space-y-2">
                {validationReport.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start space-x-2 text-blue-700 dark:text-blue-300">
                    <span className="text-blue-500 mt-1">•</span>
                    <span className="text-sm">{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cleanup Actions */}
          {validationReport.cleanupActions.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-4 flex items-center">
                <Trash2 className="w-5 h-5 mr-2" />
                Cleanup Actions
              </h3>
              <ul className="space-y-2">
                {validationReport.cleanupActions.map((action, index) => (
                  <li key={index} className="flex items-start space-x-2 text-green-700 dark:text-green-300">
                    <span className="text-green-500 mt-1">•</span>
                    <span className="text-sm">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Cleanup Results */}
      {cleanupResults.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Cleanup Results
          </h3>
          
          <div className="space-y-3">
            {cleanupResults.map((result, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getCleanupStatusIcon(result.status)}
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {result.action}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {result.message}
                    </div>
                    {result.resourcesAffected && (
                      <div className="text-xs text-gray-400">
                        {result.resourcesAffected} resources affected
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {result.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Report */}
      {validationReport && (
        <div className="text-center">
          <button
            onClick={() => {
              const reportData = JSON.stringify(validationReport, null, 2);
              const blob = new Blob([reportData], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `migration-validation-report-${new Date().toISOString().split('T')[0]}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MigrationValidation;