/**
 * React Hook for Feature Flags
 * Provides React integration for the feature flag system with debugging support
 */

import { useState, useEffect, useCallback } from 'react';
import { featureFlagManager, FeatureFlagKey, FeatureFlagValue } from '../lib/config/featureFlags.js';

export interface UseFeatureFlagOptions {
  /**
   * Enable debugging for this hook instance
   */
  debug?: boolean;
  
  /**
   * Custom context for feature flag evaluation
   */
  context?: {
    userId?: string;
    customProperties?: Record<string, any>;
  };
}

export interface UseFeatureFlagResult {
  /**
   * Current value of the feature flag
   */
  isEnabled: boolean;
  
  /**
   * Detailed information about the feature flag evaluation
   */
  flagInfo: FeatureFlagValue;
  
  /**
   * Set a runtime override for this feature flag
   */
  setOverride: (enabled: boolean, options?: { expiresIn?: number; persistToLocalStorage?: boolean }) => void;
  
  /**
   * Remove any runtime override for this feature flag
   */
  removeOverride: () => void;
  
  /**
   * Force re-evaluation of the feature flag
   */
  refresh: () => void;
}

/**
 * Hook for accessing a single feature flag with debugging support
 */
export function useFeatureFlag(
  key: FeatureFlagKey, 
  options: UseFeatureFlagOptions = {}
): UseFeatureFlagResult {
  const [flagInfo, setFlagInfo] = useState<FeatureFlagValue>(() => 
    featureFlagManager.evaluateFlag(key, options.context)
  );

  const refresh = useCallback(() => {
    const newFlagInfo = featureFlagManager.evaluateFlag(key, options.context);
    setFlagInfo(newFlagInfo);
    
    if (options.debug) {
      console.log(`[FeatureFlag] ${key} evaluated:`, {
        enabled: newFlagInfo.enabled,
        source: newFlagInfo.source,
        lastUpdated: new Date(newFlagInfo.lastUpdated).toISOString(),
        metadata: newFlagInfo.metadata
      });
    }
  }, [key, options.context, options.debug]);

  const setOverride = useCallback((
    enabled: boolean, 
    overrideOptions?: { expiresIn?: number; persistToLocalStorage?: boolean }
  ) => {
    featureFlagManager.setOverride(key, enabled, {
      ...overrideOptions,
      metadata: {
        setBy: 'useFeatureFlag',
        timestamp: Date.now(),
        ...overrideOptions
      }
    });
    
    if (options.debug) {
      console.log(`[FeatureFlag] Override set for ${key}:`, { enabled, options: overrideOptions });
    }
  }, [key, options.debug]);

  const removeOverride = useCallback(() => {
    featureFlagManager.removeOverride(key);
    
    if (options.debug) {
      console.log(`[FeatureFlag] Override removed for ${key}`);
    }
  }, [key, options.debug]);

  useEffect(() => {
    // Subscribe to changes for this specific flag
    const unsubscribe = featureFlagManager.subscribe(key, (newValue) => {
      const newFlagInfo = featureFlagManager.evaluateFlag(key, options.context);
      setFlagInfo(newFlagInfo);
      
      if (options.debug) {
        console.log(`[FeatureFlag] ${key} changed:`, {
          enabled: newValue,
          source: newFlagInfo.source,
          previousValue: flagInfo.enabled
        });
      }
    });

    return unsubscribe;
  }, [key, options.context, options.debug, flagInfo.enabled]);

  return {
    isEnabled: flagInfo.enabled,
    flagInfo,
    setOverride,
    removeOverride,
    refresh
  };
}

/**
 * Hook for accessing all feature flags with debugging support
 */
export function useAllFeatureFlags(options: UseFeatureFlagOptions = {}) {
  const [flags, setFlags] = useState<Record<FeatureFlagKey, boolean>>(() => 
    featureFlagManager.getAllFlags(options.context)
  );
  
  const [debugInfo, setDebugInfo] = useState(() => 
    featureFlagManager.getDebugInfo()
  );

  const refresh = useCallback(() => {
    const newFlags = featureFlagManager.getAllFlags(options.context);
    const newDebugInfo = featureFlagManager.getDebugInfo();
    
    setFlags(newFlags);
    setDebugInfo(newDebugInfo);
    
    if (options.debug) {
      console.log('[FeatureFlag] All flags refreshed:', {
        flags: newFlags,
        debugInfo: newDebugInfo
      });
    }
  }, [options.context, options.debug]);

  const setOverride = useCallback((
    key: FeatureFlagKey,
    enabled: boolean, 
    overrideOptions?: { expiresIn?: number; persistToLocalStorage?: boolean }
  ) => {
    featureFlagManager.setOverride(key, enabled, {
      ...overrideOptions,
      metadata: {
        setBy: 'useAllFeatureFlags',
        timestamp: Date.now(),
        ...overrideOptions
      }
    });
    
    if (options.debug) {
      console.log(`[FeatureFlag] Override set for ${key}:`, { enabled, options: overrideOptions });
    }
  }, [options.debug]);

  const removeOverride = useCallback((key: FeatureFlagKey) => {
    featureFlagManager.removeOverride(key);
    
    if (options.debug) {
      console.log(`[FeatureFlag] Override removed for ${key}`);
    }
  }, [options.debug]);

  const clearAllOverrides = useCallback(() => {
    featureFlagManager.clearAllOverrides();
    
    if (options.debug) {
      console.log('[FeatureFlag] All overrides cleared');
    }
  }, [options.debug]);

  useEffect(() => {
    // Subscribe to all feature flag changes
    const unsubscribe = featureFlagManager.subscribeToAll((key, value) => {
      setFlags(prev => ({ ...prev, [key]: value }));
      setDebugInfo(featureFlagManager.getDebugInfo());
      
      if (options.debug) {
        console.log(`[FeatureFlag] Global change detected:`, { key, value });
      }
    });

    return unsubscribe;
  }, [options.debug]);

  return {
    flags,
    debugInfo,
    setOverride,
    removeOverride,
    clearAllOverrides,
    refresh
  };
}

/**
 * Hook for feature flag debugging utilities
 */
export function useFeatureFlagDebug() {
  const [debugInfo, setDebugInfo] = useState(() => 
    featureFlagManager.getDebugInfo()
  );

  const refresh = useCallback(() => {
    setDebugInfo(featureFlagManager.getDebugInfo());
  }, []);

  const logDebugInfo = useCallback(() => {
    const info = featureFlagManager.getDebugInfo();
    console.group('🚩 Feature Flag Debug Information');
    console.log('Current Flags:', info.flags);
    console.log('Active Overrides:', info.overrides);
    console.log('Cache Size:', info.cacheSize);
    console.log('Listener Count:', info.listenerCount);
    console.groupEnd();
  }, []);

  const exportDebugInfo = useCallback(() => {
    const info = featureFlagManager.getDebugInfo();
    const exportData = {
      timestamp: new Date().toISOString(),
      environment: window.location.hostname,
      userAgent: navigator.userAgent,
      ...info
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feature-flags-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    // Subscribe to all changes to keep debug info updated
    const unsubscribe = featureFlagManager.subscribeToAll(() => {
      setDebugInfo(featureFlagManager.getDebugInfo());
    });

    return unsubscribe;
  }, []);

  return {
    debugInfo,
    refresh,
    logDebugInfo,
    exportDebugInfo
  };
}