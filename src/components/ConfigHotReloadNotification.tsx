/**
 * Development-only configuration hot reload notification component
 * Shows configuration change notifications and reload status
 */

import React, { useState, useEffect } from 'react';
import { useConfigHotReload, useConfigChangeNotifications } from '../hooks/useConfigHotReload.js';

interface ConfigHotReloadNotificationProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  showDebugPanel?: boolean;
}

export function ConfigHotReloadNotification({ 
  position = 'top-right',
  showDebugPanel = true 
}: ConfigHotReloadNotificationProps) {
  const { 
    isHotReloadActive, 
    currentConfig, 
    lastChangeEvent, 
    reloadConfig, 
    isReloading, 
    error 
  } = useConfigHotReload();
  
  const { changeCount } = useConfigChangeNotifications();
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Show notifications for configuration changes
  useEffect(() => {
    if (!lastChangeEvent) return;

    let message = '';
    switch (lastChangeEvent.type) {
      case 'file-changed':
        message = `🔥 Config file changed: ${lastChangeEvent.filePath?.split('/').pop()}`;
        break;
      case 'config-reloaded':
        message = '✅ Configuration reloaded successfully';
        break;
      case 'reload-error':
        message = `❌ Reload failed: ${lastChangeEvent.error?.message}`;
        break;
    }

    if (message) {
      setNotification(message);
      setTimeout(() => setNotification(null), 3000);
    }
  }, [lastChangeEvent]);

  // Only render in development
  if (!isHotReloadActive || !currentConfig) {
    return null;
  }

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  return (
    <>
      {/* Status indicator */}
      <div className={`fixed ${positionClasses[position]} z-50 flex flex-col gap-2`}>
        {/* Hot reload status */}
        <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-mono flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span>Hot Reload Active</span>
          {changeCount > 0 && (
            <span className="bg-blue-500 text-white px-2 py-1 rounded text-xs">
              {changeCount} changes
            </span>
          )}
        </div>

        {/* Loading indicator */}
        {isReloading && (
          <div className="bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-mono flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-spin"></div>
            <span>Reloading config...</span>
          </div>
        )}

        {/* Error indicator */}
        {error && (
          <div className="bg-red-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-mono flex items-center gap-2">
            <span>❌</span>
            <span>Reload failed</span>
            <button
              onClick={reloadConfig}
              className="bg-red-700 hover:bg-red-800 px-2 py-1 rounded text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* Notification */}
        {notification && (
          <div className="bg-orange-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-mono animate-fade-in">
            {notification}
          </div>
        )}

        {/* Debug panel toggle */}
        {showDebugPanel && (
          <button
            onClick={() => setIsDebugPanelOpen(!isDebugPanelOpen)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-mono"
          >
            🔧 Config Debug
          </button>
        )}
      </div>

      {/* Debug panel */}
      {isDebugPanelOpen && showDebugPanel && (
        <ConfigDebugPanel 
          config={currentConfig}
          onClose={() => setIsDebugPanelOpen(false)}
          onReload={reloadConfig}
        />
      )}
    </>
  );
}

interface ConfigDebugPanelProps {
  config: any;
  onClose: () => void;
  onReload: () => Promise<void>;
}

function ConfigDebugPanel({ config, onClose, onReload }: ConfigDebugPanelProps) {
  const [isReloading, setIsReloading] = useState(false);

  const handleReload = async () => {
    setIsReloading(true);
    try {
      await onReload();
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 text-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold">Configuration Debug Panel</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReload}
              disabled={isReloading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 px-3 py-1 rounded text-sm"
            >
              {isReloading ? 'Reloading...' : '🔄 Reload'}
            </button>
            <button
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4 font-mono text-sm">
            {/* Environment info */}
            <div>
              <h4 className="text-green-400 font-semibold mb-2">Environment</h4>
              <div className="bg-gray-800 p-3 rounded">
                <div>Environment: <span className="text-yellow-300">{config.app.environment}</span></div>
                <div>App Name: <span className="text-yellow-300">{config.app.name}</span></div>
                <div>Version: <span className="text-yellow-300">{config.app.version}</span></div>
                <div>URL: <span className="text-yellow-300">{config.app.url}</span></div>
              </div>
            </div>

            {/* Services status */}
            <div>
              <h4 className="text-green-400 font-semibold mb-2">Services</h4>
              <div className="bg-gray-800 p-3 rounded space-y-1">
                <div>OpenAI: {config.ai.openai ? '🟢 Configured' : '🔴 Not configured'}</div>
                <div>Anthropic: {config.ai.anthropic ? '🟢 Configured' : '🔴 Not configured'}</div>
                <div>Stripe: {config.payments?.stripe ? '🟢 Configured' : '🔴 Not configured'}</div>
                <div>Sentry: {config.monitoring.sentry ? '🟢 Configured' : '🔴 Not configured'}</div>
              </div>
            </div>

            {/* Feature flags */}
            <div>
              <h4 className="text-green-400 font-semibold mb-2">Feature Flags</h4>
              <div className="bg-gray-800 p-3 rounded space-y-1">
                {Object.entries(config.features).map(([key, value]) => (
                  <div key={key}>
                    {key}: {value ? '🟢 Enabled' : '🔴 Disabled'}
                  </div>
                ))}
              </div>
            </div>

            {/* Raw config (collapsed by default) */}
            <details>
              <summary className="text-green-400 font-semibold cursor-pointer">
                Raw Configuration (Click to expand)
              </summary>
              <div className="bg-gray-800 p-3 rounded mt-2 overflow-x-auto">
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}