/**
 * Service Degradation Status Component
 * Shows current service status and degradation information to users
 */

import React, { useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Database,
  Cloud,
  Zap,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { useServiceDegradation, useOfflineCache } from '../hooks/useServiceDegradation';
import { ServiceStatus } from '../lib/serviceDegradationManager';

interface ServiceDegradationStatusProps {
  compact?: boolean;
  showCacheInfo?: boolean;
  className?: string;
}

const ServiceDegradationStatus: React.FC<ServiceDegradationStatusProps> = ({
  compact = false,
  showCacheInfo = true,
  className = ''
}) => {
  const {
    isOnline,
    isOfflineMode,
    serviceStatuses,
    degradedServices,
    unavailableServices,
    fallbackServices,
    retryService,
    refreshServiceStatus
  } = useServiceDegradation();

  const { cacheStats } = useOfflineCache();
  const [isExpanded, setIsExpanded] = useState(false);
  const [retryingServices, setRetryingServices] = useState<Set<string>>(new Set());

  const getStatusIcon = (status: ServiceStatus) => {
    switch (status) {
      case ServiceStatus.AVAILABLE:
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case ServiceStatus.DEGRADED:
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      case ServiceStatus.UNAVAILABLE:
        return <XCircle className="w-4 h-4 text-red-600" />;
      case ServiceStatus.FALLBACK:
        return <Database className="w-4 h-4 text-blue-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case ServiceStatus.AVAILABLE:
        return 'text-green-600 bg-green-50 border-green-200';
      case ServiceStatus.DEGRADED:
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case ServiceStatus.UNAVAILABLE:
        return 'text-red-600 bg-red-50 border-red-200';
      case ServiceStatus.FALLBACK:
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getServiceDisplayName = (serviceId: string) => {
    const names: Record<string, string> = {
      googleDrive: 'Google Drive',
      hallucifix: 'AI Analysis',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      ragService: 'Knowledge Base'
    };
    return names[serviceId] || serviceId;
  };

  const handleRetryService = async (serviceId: string) => {
    setRetryingServices(prev => new Set(prev).add(serviceId));
    
    try {
      await retryService(serviceId);
    } catch (error) {
      console.error(`Failed to retry service ${serviceId}:`, error);
    } finally {
      setRetryingServices(prev => {
        const newSet = new Set(prev);
        newSet.delete(serviceId);
        return newSet;
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Overall system status
  const hasIssues = degradedServices.length > 0 || unavailableServices.length > 0 || isOfflineMode;
  const allServicesAvailable = Object.values(serviceStatuses).every(status => status === ServiceStatus.AVAILABLE);

  if (compact && !hasIssues) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {isOnline ? (
          <Wifi className="w-4 h-4 text-green-600" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-600" />
        )}
        <span className="text-sm text-green-600">All systems operational</span>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {isOnline ? (
              <Wifi className={`w-5 h-5 ${allServicesAvailable ? 'text-green-600' : 'text-amber-600'}`} />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
            
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                System Status
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isOfflineMode ? 'Offline Mode Active' : 
                 hasIssues ? 'Some services degraded' : 
                 'All systems operational'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={refreshServiceStatus}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            
            {!compact && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Quick status indicators */}
        {!isExpanded && hasIssues && (
          <div className="mt-3 flex flex-wrap gap-2">
            {isOfflineMode && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                <WifiOff className="w-3 h-3 mr-1" />
                Offline
              </span>
            )}
            
            {fallbackServices.length > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                <Database className="w-3 h-3 mr-1" />
                {fallbackServices.length} using backup
              </span>
            )}
            
            {unavailableServices.length > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                <XCircle className="w-3 h-3 mr-1" />
                {unavailableServices.length} unavailable
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* Service status list */}
          <div className="p-4 space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Service Status
            </h4>
            
            <div className="space-y-2">
              {Object.entries(serviceStatuses).map(([serviceId, status]) => (
                <div
                  key={serviceId}
                  className={`flex items-center justify-between p-2 rounded-md border ${getStatusColor(status)}`}
                >
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(status)}
                    <span className="text-sm font-medium">
                      {getServiceDisplayName(serviceId)}
                    </span>
                    <span className="text-xs opacity-75 capitalize">
                      {status}
                    </span>
                  </div>
                  
                  {(status === ServiceStatus.UNAVAILABLE || status === ServiceStatus.DEGRADED) && (
                    <button
                      onClick={() => handleRetryService(serviceId)}
                      disabled={retryingServices.has(serviceId)}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded border border-current hover:bg-current hover:bg-opacity-10 transition-colors disabled:opacity-50"
                    >
                      {retryingServices.has(serviceId) ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Cache information */}
          {showCacheInfo && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Offline Cache
              </h4>
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Cached Items</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {cacheStats.totalEntries.toLocaleString()}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Cache Size</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatBytes(cacheStats.totalSize)}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Hit Rate</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {cacheStats.hitRate.toFixed(1)}%
                  </div>
                </div>
              </div>
              
              {isOfflineMode && (
                <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <div className="flex items-start space-x-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-xs text-blue-800 dark:text-blue-300">
                      You're currently offline. The app is using cached data and backup services to maintain functionality.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServiceDegradationStatus;