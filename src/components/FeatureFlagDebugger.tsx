/**
 * Feature Flag Debugger Component
 * Provides a comprehensive debugging interface for feature flags in development
 */

import React, { useState, useEffect } from 'react';
import { useAllFeatureFlags, useFeatureFlagDebug } from '../hooks/useFeatureFlag';
import { FeatureFlagKey, FeatureFlagValue, FeatureFlagOverride } from '../lib/config/featureFlags';
import { config } from '../lib/config';

interface FeatureFlagDebuggerProps {
  /**
   * Whether to show the debugger (typically only in development)
   */
  visible?: boolean;
  
  /**
   * Position of the debugger on screen
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  
  /**
   * Whether to start minimized
   */
  minimized?: boolean;
}

export function FeatureFlagDebugger({ 
  visible = config.app.environment === 'development',
  position = 'bottom-right',
  minimized = true 
}: FeatureFlagDebuggerProps) {
  const [isMinimized, setIsMinimized] = useState(minimized);
  const [activeTab, setActiveTab] = useState<'flags' | 'overrides' | 'logs' | 'docs'>('flags');
  const [logs, setLogs] = useState<Array<{ timestamp: number; message: string; type: 'info' | 'warn' | 'error' }>>([]);
  
  const { flags, debugInfo, setOverride, removeOverride, clearAllOverrides, refresh } = useAllFeatureFlags({ debug: true });
  const { logDebugInfo, exportDebugInfo } = useFeatureFlagDebug();

  // Capture console logs related to feature flags
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const captureLog = (type: 'info' | 'warn' | 'error', args: any[]) => {
      const message = args.join(' ');
      if (message.includes('[FeatureFlag]') || message.includes('🚩')) {
        setLogs(prev => [...prev.slice(-49), { // Keep last 50 logs
          timestamp: Date.now(),
          message: message.replace('[FeatureFlag]', '').replace('🚩', '').trim(),
          type
        }]);
      }
    };

    console.log = (...args) => {
      captureLog('info', args);
      originalLog(...args);
    };

    console.warn = (...args) => {
      captureLog('warn', args);
      originalWarn(...args);
    };

    console.error = (...args) => {
      captureLog('error', args);
      originalError(...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  if (!visible) {
    return null;
  }

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };

  const handleToggleFlag = (key: FeatureFlagKey, currentValue: boolean) => {
    if (debugInfo.overrides.some(o => o.key === key)) {
      removeOverride(key);
    } else {
      setOverride(key, !currentValue, { persistToLocalStorage: true });
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getFlagSource = (key: FeatureFlagKey): FeatureFlagValue => {
    return debugInfo.flags[key] || { enabled: false, source: 'default', lastUpdated: Date.now() };
  };

  const getSourceColor = (source: string) => {
    const colors = {
      'environment': 'text-green-600',
      'runtime': 'text-blue-600',
      'local_storage': 'text-purple-600',
      'url_params': 'text-orange-600',
      'default': 'text-gray-600'
    };
    return colors[source as keyof typeof colors] || 'text-gray-600';
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50 font-mono text-sm`}>
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-gray-700 transition-colors"
          title="Open Feature Flag Debugger"
        >
          🚩 FF Debug
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl w-96 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-300 dark:border-gray-600 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">🚩 Feature Flags</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={refresh}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                title="Refresh"
              >
                🔄
              </button>
              <button
                onClick={logDebugInfo}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                title="Log Debug Info"
              >
                📋
              </button>
              <button
                onClick={exportDebugInfo}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                title="Export Debug Data"
              >
                💾
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                title="Minimize"
              >
                ➖
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-300 dark:border-gray-600">
            {[
              { key: 'flags', label: 'Flags', count: Object.keys(flags).length },
              { key: 'overrides', label: 'Overrides', count: debugInfo.overrides.length },
              { key: 'logs', label: 'Logs', count: logs.length },
              { key: 'docs', label: 'Docs', count: null }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className="ml-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-1 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-4 max-h-64 overflow-y-auto">
            {activeTab === 'flags' && (
              <div className="space-y-2">
                {Object.entries(flags).map(([key, enabled]) => {
                  const flagInfo = getFlagSource(key as FeatureFlagKey);
                  const hasOverride = debugInfo.overrides.some(o => o.key === key);
                  
                  return (
                    <div key={key} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {key}
                          </span>
                          {hasOverride && (
                            <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1 rounded">
                              Override
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Source: <span className={getSourceColor(flagInfo.source)}>{flagInfo.source}</span>
                          {flagInfo.lastUpdated && (
                            <span className="ml-2">
                              Updated: {formatTimestamp(flagInfo.lastUpdated)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleFlag(key as FeatureFlagKey, enabled)}
                        className={`w-8 h-4 rounded-full transition-colors ${
                          enabled 
                            ? 'bg-green-500' 
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full transition-transform ${
                          enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'overrides' && (
              <div className="space-y-2">
                {debugInfo.overrides.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-4">
                    No active overrides
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {debugInfo.overrides.length} active override(s)
                      </span>
                      <button
                        onClick={clearAllOverrides}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                      >
                        Clear All
                      </button>
                    </div>
                    {debugInfo.overrides.map((override, index) => (
                      <div key={index} className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {override.key}
                          </span>
                          <button
                            onClick={() => removeOverride(override.key)}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Value: <span className={override.enabled ? 'text-green-600' : 'text-red-600'}>
                            {override.enabled ? 'enabled' : 'disabled'}
                          </span>
                          <br />
                          Source: <span className={getSourceColor(override.source)}>{override.source}</span>
                          {override.expiresAt && (
                            <>
                              <br />
                              Expires: {new Date(override.expiresAt).toLocaleString()}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-1">
                {logs.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-4">
                    No logs captured yet
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Last {logs.length} events
                      </span>
                      <button
                        onClick={() => setLogs([])}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {logs.slice().reverse().map((log, index) => (
                        <div key={index} className="text-xs p-1 bg-gray-50 dark:bg-gray-700 rounded">
                          <span className="text-gray-500 dark:text-gray-400">
                            {formatTimestamp(log.timestamp)}
                          </span>
                          <span className={`ml-2 ${
                            log.type === 'error' ? 'text-red-600 dark:text-red-400' :
                            log.type === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-gray-800 dark:text-gray-200'
                          }`}>
                            {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'docs' && (
              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">URL Parameters</h4>
                  <p className="text-gray-600 dark:text-gray-400 mb-1">
                    Add <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">?ff_flagName=true</code> to URL
                  </p>
                  <p className="text-gray-500 dark:text-gray-500">
                    Example: <code>?ff_enableAnalytics=true&ff_enablePayments=false</code>
                  </p>
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Console Commands</h4>
                  <div className="space-y-1 text-gray-600 dark:text-gray-400">
                    <p><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">featureFlagManager.isEnabled('flagName')</code></p>
                    <p><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">featureFlagManager.setOverride('flagName', true)</code></p>
                    <p><code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">featureFlagManager.getDebugInfo()</code></p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Precedence Order</h4>
                  <ol className="text-gray-600 dark:text-gray-400 space-y-1">
                    <li>1. Runtime overrides (highest)</li>
                    <li>2. URL parameters</li>
                    <li>3. Local storage</li>
                    <li>4. Environment config</li>
                    <li>5. Default values (lowest)</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Available Flags</h4>
                  <div className="space-y-1 text-gray-600 dark:text-gray-400">
                    {Object.keys(flags).map(key => (
                      <div key={key} className="flex justify-between">
                        <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">{key}</code>
                        <span className={flags[key as FeatureFlagKey] ? 'text-green-600' : 'text-red-600'}>
                          {flags[key as FeatureFlagKey] ? '✓' : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FeatureFlagDebugger;