/**
 * Demo component showing configuration hot reload functionality
 * This component demonstrates how to use the hot reload system in development
 */

import React from 'react';
import { useConfigHotReload, useConfigValue } from '../hooks/useConfigHotReload.js';
import { ConfigHotReloadNotification } from './ConfigHotReloadNotification.js';
import { logger } from '../lib/logging';

export function ConfigHotReloadDemo() {
  const { 
    isHotReloadActive, 
    currentConfig, 
    lastChangeEvent, 
    reloadConfig, 
    isReloading, 
    error 
  } = useConfigHotReload();

  // Monitor specific configuration values
  const appName = useConfigValue(config => config.app.name, 'Unknown App');
  const environment = useConfigValue(config => config.app.environment, 'unknown');
  const hasOpenAI = useConfigValue(config => !!config.ai.openai?.apiKey, false);
  const enableAnalytics = useConfigValue(config => config.features.enableAnalytics, false);

  // Only show in development
  if (!isHotReloadActive) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 bg-gray-900 text-white p-4 rounded-lg shadow-lg max-w-md">
      <h3 className="text-lg font-semibold mb-3 text-green-400">🔥 Hot Reload Demo</h3>
      
      {/* Current configuration status */}
      <div className="space-y-2 text-sm font-mono">
        <div>
          <span className="text-gray-400">App Name:</span> 
          <span className={`ml-2 ${appName.hasChanged ? 'text-yellow-300' : 'text-white'}`}>
            {appName.value}
          </span>
          {appName.hasChanged && <span className="text-yellow-300 ml-1">*</span>}
        </div>
        
        <div>
          <span className="text-gray-400">Environment:</span> 
          <span className={`ml-2 ${environment.hasChanged ? 'text-yellow-300' : 'text-white'}`}>
            {environment.value}
          </span>
          {environment.hasChanged && <span className="text-yellow-300 ml-1">*</span>}
        </div>
        
        <div>
          <span className="text-gray-400">OpenAI:</span> 
          <span className={`ml-2 ${hasOpenAI.hasChanged ? 'text-yellow-300' : 'text-white'}`}>
            {hasOpenAI.value ? '🟢 Enabled' : '🔴 Disabled'}
          </span>
          {hasOpenAI.hasChanged && <span className="text-yellow-300 ml-1">*</span>}
        </div>
        
        <div>
          <span className="text-gray-400">Analytics:</span> 
          <span className={`ml-2 ${enableAnalytics.hasChanged ? 'text-yellow-300' : 'text-white'}`}>
            {enableAnalytics.value ? '🟢 Enabled' : '🔴 Disabled'}
          </span>
          {enableAnalytics.hasChanged && <span className="text-yellow-300 ml-1">*</span>}
        </div>
      </div>

      {/* Last change event */}
      {lastChangeEvent && (
        <div className="mt-3 p-2 bg-gray-800 rounded text-xs">
          <div className="text-gray-400">Last Change:</div>
          <div className="text-white">
            {lastChangeEvent.type === 'file-changed' && `📝 ${lastChangeEvent.filePath?.split('/').pop()}`}
            {lastChangeEvent.type === 'config-reloaded' && '✅ Config reloaded'}
            {lastChangeEvent.type === 'reload-error' && `❌ ${lastChangeEvent.error?.message}`}
          </div>
          <div className="text-gray-500">
            {lastChangeEvent.timestamp.toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-3 p-2 bg-red-900 rounded text-xs">
          <div className="text-red-300">Error:</div>
          <div className="text-red-100">{error.message}</div>
        </div>
      )}

      {/* Manual reload button */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={reloadConfig}
          disabled={isReloading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 px-3 py-1 rounded text-sm"
        >
          {isReloading ? '🔄 Reloading...' : '🔄 Reload Config'}
        </button>
        
        <button
          onClick={() => {
            logger.debug('Current configuration:', { currentConfig });
          }}
          className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm"
        >
          📋 Log Config
        </button>
      </div>

      {/* Instructions */}
      <div className="mt-3 p-2 bg-blue-900 rounded text-xs">
        <div className="text-blue-300 font-semibold">Try this:</div>
        <div className="text-blue-100">
          1. Edit .env.local file<br/>
          2. Change VITE_APP_NAME<br/>
          3. Watch config update automatically
        </div>
      </div>

      {/* Hot reload notification component */}
      <ConfigHotReloadNotification position="top-right" />
    </div>
  );
}