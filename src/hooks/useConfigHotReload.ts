/**
 * React hook for configuration hot reload functionality
 * Provides configuration change notifications and reload capabilities
 */

import { useEffect, useState, useCallback } from 'react';
import { config, type ConfigurationChangeEvent, type EnvironmentConfig } from '../lib/config/index.js';

import { logger } from './logging';
export interface UseConfigHotReloadReturn {
  isHotReloadActive: boolean;
  currentConfig: EnvironmentConfig | null;
  lastChangeEvent: ConfigurationChangeEvent | null;
  reloadConfig: () => Promise<void>;
  isReloading: boolean;
  error: Error | null;
}

/**
 * Hook to monitor configuration changes and provide reload functionality
 */
export function useConfigHotReload(): UseConfigHotReloadReturn {
  const [isHotReloadActive, setIsHotReloadActive] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<EnvironmentConfig | null>(null);
  const [lastChangeEvent, setLastChangeEvent] = useState<ConfigurationChangeEvent | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize and set up event listeners
  useEffect(() => {
    const hotReload = config.getHotReload();
    
    if (!hotReload) {
      setIsHotReloadActive(false);
      return;
    }

    setIsHotReloadActive(hotReload.isRunning());
    setCurrentConfig(hotReload.getCurrentConfig());

    // Set up event listeners
    const handleConfigChange = (event: ConfigurationChangeEvent) => {
      setLastChangeEvent(event);
      
      if (event.type === 'config-reloaded' && event.config) {
        setCurrentConfig(event.config);
        setError(null);
      } else if (event.type === 'reload-error' && event.error) {
        setError(event.error);
      }
    };

    const handleReloadStart = () => {
      setIsReloading(true);
      setError(null);
    };

    const handleReloadEnd = () => {
      setIsReloading(false);
    };

    const handleError = (err: Error) => {
      setError(err);
      setIsReloading(false);
    };

    // Add event listeners
    hotReload.on('config-change', handleConfigChange);
    hotReload.on('reloaded', handleReloadEnd);
    hotReload.on('error', handleError);

    // Listen for reload start (we need to add this event to the hot reload class)
    hotReload.on('reload-start', handleReloadStart);

    // Cleanup
    return () => {
      hotReload.off('config-change', handleConfigChange);
      hotReload.off('reloaded', handleReloadEnd);
      hotReload.off('error', handleError);
      hotReload.off('reload-start', handleReloadStart);
    };
  }, []);

  // Manual reload function
  const reloadConfig = useCallback(async () => {
    try {
      setIsReloading(true);
      setError(null);
      await config.reloadConfiguration();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown reload error');
      setError(error);
      logger.error("Failed to reload configuration:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsReloading(false);
    }
  }, []);

  return {
    isHotReloadActive,
    currentConfig,
    lastChangeEvent,
    reloadConfig,
    isReloading,
    error
  };
}

/**
 * Hook to get configuration change notifications
 */
export function useConfigChangeNotifications(): {
  lastChange: ConfigurationChangeEvent | null;
  changeCount: number;
} {
  const [lastChange, setLastChange] = useState<ConfigurationChangeEvent | null>(null);
  const [changeCount, setChangeCount] = useState(0);

  useEffect(() => {
    const hotReload = config.getHotReload();
    
    if (!hotReload) {
      return;
    }

    const handleConfigChange = (event: ConfigurationChangeEvent) => {
      setLastChange(event);
      setChangeCount(prev => prev + 1);
    };

    hotReload.on('config-change', handleConfigChange);

    return () => {
      hotReload.off('config-change', handleConfigChange);
    };
  }, []);

  return {
    lastChange,
    changeCount
  };
}

/**
 * Hook to monitor specific configuration values for changes
 */
export function useConfigValue<T>(
  selector: (config: EnvironmentConfig) => T,
  defaultValue: T
): {
  value: T;
  hasChanged: boolean;
  lastUpdated: Date | null;
} {
  const [value, setValue] = useState<T>(defaultValue);
  const [hasChanged, setHasChanged] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const hotReload = config.getHotReload();
    
    if (!hotReload) {
      // Try to get initial value from current config
      try {
        const currentConfig = hotReload?.getCurrentConfig();
        if (currentConfig) {
          setValue(selector(currentConfig));
        }
      } catch (error) {
        logger.warn("Failed to get initial config value:", { error });
      }
      return;
    }

    // Set initial value
    const currentConfig = hotReload.getCurrentConfig();
    if (currentConfig) {
      setValue(selector(currentConfig));
    }

    const handleConfigChange = (event: ConfigurationChangeEvent) => {
      if (event.type === 'config-reloaded' && event.config) {
        const newValue = selector(event.config);
        const oldValue = value;
        
        setValue(newValue);
        
        if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
          setHasChanged(true);
          setLastUpdated(new Date());
        }
      }
    };

    hotReload.on('config-change', handleConfigChange);

    return () => {
      hotReload.off('config-change', handleConfigChange);
    };
  }, [selector, value]);

  return {
    value,
    hasChanged,
    lastUpdated
  };
}