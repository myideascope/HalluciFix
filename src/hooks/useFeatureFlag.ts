/**
 * React hooks for feature flag access
 * Provides runtime feature flag evaluation and management
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  featureFlagManager, 
  type FeatureFlagKey, 
  type FeatureFlagValue,
  type FeatureFlagEvaluationContext 
} from '../lib/config';
import { useConfiguration } from './useConfiguration';

export interface UseFeatureFlagReturn<T extends FeatureFlagValue = boolean> {
  value: T;
  isLoaded: boolean;
  source: string;
  lastUpdated: Date | null;
  toggle: () => Promise<void>;
  setValue: (value: T) => Promise<void>;
}

/**
 * Hook to access a specific feature flag
 */
export function useFeatureFlag<T extends FeatureFlagValue = boolean>(
  flagKey: FeatureFlagKey,
  defaultValue: T,
  context?: FeatureFlagEvaluationContext
): UseFeatureFlagReturn<T> {
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const [source, setSource] = useState<string>('default');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load initial value
  useEffect(() => {
    const loadFlag = async () => {
      try {
        const result = await featureFlagManager.evaluateFlag(flagKey, defaultValue, context);
        setValue(result.value as T);
        setSource(result.source);
        setLastUpdated(new Date());
        setIsLoaded(true);
      } catch (error) {
        console.warn(`Failed to load feature flag ${flagKey}:`, error);
        setValue(defaultValue);
        setSource('default');
        setIsLoaded(true);
      }
    };

    loadFlag();
  }, [flagKey, defaultValue, context]);

  // Toggle function (for boolean flags)
  const toggle = useCallback(async () => {
    if (typeof value === 'boolean') {
      const newValue = !value as T;
      try {
        await featureFlagManager.setOverride(flagKey, newValue);
        setValue(newValue);
        setSource('override');
        setLastUpdated(new Date());
      } catch (error) {
        console.error(`Failed to toggle feature flag ${flagKey}:`, error);
      }
    } else {
      console.warn(`Cannot toggle non-boolean feature flag: ${flagKey}`);
    }
  }, [flagKey, value]);

  // Set value function
  const setValueCallback = useCallback(async (newValue: T) => {
    try {
      await featureFlagManager.setOverride(flagKey, newValue);
      setValue(newValue);
      setSource('override');
      setLastUpdated(new Date());
    } catch (error) {
      console.error(`Failed to set feature flag ${flagKey}:`, error);
    }
  }, [flagKey]);

  return {
    value,
    isLoaded,
    source,
    lastUpdated,
    toggle,
    setValue: setValueCallback
  };
}

/**
 * Hook to access multiple feature flags at once
 */
export function useFeatureFlags(
  flags: Record<string, { key: FeatureFlagKey; defaultValue: FeatureFlagValue }>,
  context?: FeatureFlagEvaluationContext
): Record<string, UseFeatureFlagReturn> {
  const [flagValues, setFlagValues] = useState<Record<string, UseFeatureFlagReturn>>({});

  useEffect(() => {
    const loadFlags = async () => {
      const results: Record<string, UseFeatureFlagReturn> = {};

      for (const [name, { key, defaultValue }] of Object.entries(flags)) {
        try {
          const result = await featureFlagManager.evaluateFlag(key, defaultValue, context);
          
          results[name] = {
            value: result.value,
            isLoaded: true,
            source: result.source,
            lastUpdated: new Date(),
            toggle: async () => {
              if (typeof result.value === 'boolean') {
                const newValue = !result.value;
                await featureFlagManager.setOverride(key, newValue);
                setFlagValues(prev => ({
                  ...prev,
                  [name]: {
                    ...prev[name],
                    value: newValue,
                    source: 'override',
                    lastUpdated: new Date()
                  }
                }));
              }
            },
            setValue: async (newValue: FeatureFlagValue) => {
              await featureFlagManager.setOverride(key, newValue);
              setFlagValues(prev => ({
                ...prev,
                [name]: {
                  ...prev[name],
                  value: newValue,
                  source: 'override',
                  lastUpdated: new Date()
                }
              }));
            }
          };
        } catch (error) {
          console.warn(`Failed to load feature flag ${key}:`, error);
          results[name] = {
            value: defaultValue,
            isLoaded: true,
            source: 'default',
            lastUpdated: null,
            toggle: async () => {},
            setValue: async () => {}
          };
        }
      }

      setFlagValues(results);
    };

    loadFlags();
  }, [flags, context]);

  return flagValues;
}

/**
 * Hook to access common application feature flags
 */
export function useAppFeatureFlags() {
  const { config } = useConfiguration();
  
  return useMemo(() => {
    if (!config) {
      return {
        enableAnalytics: false,
        enablePayments: false,
        enableBetaFeatures: false,
        enableRagAnalysis: false,
        enableBatchProcessing: false,
        isLoaded: false
      };
    }

    return {
      enableAnalytics: config.features.enableAnalytics,
      enablePayments: config.features.enablePayments,
      enableBetaFeatures: config.features.enableBetaFeatures,
      enableRagAnalysis: config.features.enableRagAnalysis,
      enableBatchProcessing: config.features.enableBatchProcessing,
      isLoaded: true
    };
  }, [config]);
}

/**
 * Hook for feature flag debugging (development only)
 */
export function useFeatureFlagDebug() {
  const { config } = useConfiguration();
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    if (config?.app.environment === 'development') {
      const getDebugInfo = async () => {
        try {
          const info = await featureFlagManager.getDebugInfo();
          setDebugInfo(info);
        } catch (error) {
          console.warn('Failed to get feature flag debug info:', error);
        }
      };

      getDebugInfo();
      
      // Update debug info periodically
      const interval = setInterval(getDebugInfo, 10000);
      return () => clearInterval(interval);
    }
  }, [config]);

  const clearOverrides = useCallback(async () => {
    try {
      await featureFlagManager.clearAllOverrides();
      console.log('All feature flag overrides cleared');
    } catch (error) {
      console.error('Failed to clear feature flag overrides:', error);
    }
  }, []);

  return {
    debugInfo,
    clearOverrides,
    isDevelopment: config?.app.environment === 'development'
  };
}\
n/**\n * Hook to access all feature flags with debugging capabilities\n */\nexport function useAllFeatureFlags(options?: { debug?: boolean }) {\n  const { config } = useConfiguration();\n  const [flags, setFlags] = useState<Record<FeatureFlagKey, FeatureFlagValue>>({} as any);\n  const [debugInfo, setDebugInfo] = useState<any>(null);\n  const [isLoaded, setIsLoaded] = useState(false);\n\n  // Load all flags\n  useEffect(() => {\n    const loadAllFlags = async () => {\n      try {\n        const flagKeys: FeatureFlagKey[] = [\n          'enableAnalytics',\n          'enablePayments', \n          'enableBetaFeatures',\n          'enableRagAnalysis',\n          'enableBatchProcessing'\n        ];\n\n        const flagValues: Record<FeatureFlagKey, FeatureFlagValue> = {} as any;\n        \n        for (const key of flagKeys) {\n          const result = await featureFlagManager.evaluateFlag(key, false);\n          flagValues[key] = result.value;\n        }\n\n        setFlags(flagValues);\n        setIsLoaded(true);\n\n        // Load debug info if requested\n        if (options?.debug) {\n          const info = await featureFlagManager.getDebugInfo();\n          setDebugInfo(info);\n        }\n      } catch (error) {\n        console.warn('Failed to load feature flags:', error);\n        setIsLoaded(true);\n      }\n    };\n\n    loadAllFlags();\n  }, [config, options?.debug]);\n\n  const setOverride = useCallback(async (key: FeatureFlagKey, value: FeatureFlagValue) => {\n    try {\n      await featureFlagManager.setOverride(key, value, 'manual');\n      setFlags(prev => ({ ...prev, [key]: value }));\n    } catch (error) {\n      console.error(`Failed to set override for ${key}:`, error);\n    }\n  }, []);\n\n  const removeOverride = useCallback(async (key: FeatureFlagKey) => {\n    try {\n      await featureFlagManager.removeOverride(key);\n      // Reload the flag value\n      const result = await featureFlagManager.evaluateFlag(key, false);\n      setFlags(prev => ({ ...prev, [key]: result.value }));\n    } catch (error) {\n      console.error(`Failed to remove override for ${key}:`, error);\n    }\n  }, []);\n\n  const clearAllOverrides = useCallback(async () => {\n    try {\n      await featureFlagManager.clearAllOverrides();\n      // Reload all flags\n      const flagKeys: FeatureFlagKey[] = Object.keys(flags) as FeatureFlagKey[];\n      const flagValues: Record<FeatureFlagKey, FeatureFlagValue> = {} as any;\n      \n      for (const key of flagKeys) {\n        const result = await featureFlagManager.evaluateFlag(key, false);\n        flagValues[key] = result.value;\n      }\n      \n      setFlags(flagValues);\n    } catch (error) {\n      console.error('Failed to clear all overrides:', error);\n    }\n  }, [flags]);\n\n  const refresh = useCallback(async () => {\n    const flagKeys: FeatureFlagKey[] = Object.keys(flags) as FeatureFlagKey[];\n    const flagValues: Record<FeatureFlagKey, FeatureFlagValue> = {} as any;\n    \n    for (const key of flagKeys) {\n      const result = await featureFlagManager.evaluateFlag(key, false);\n      flagValues[key] = result.value;\n    }\n    \n    setFlags(flagValues);\n    \n    if (options?.debug) {\n      const info = await featureFlagManager.getDebugInfo();\n      setDebugInfo(info);\n    }\n  }, [flags, options?.debug]);\n\n  return {\n    flags,\n    debugInfo,\n    isLoaded,\n    setOverride,\n    removeOverride,\n    clearAllOverrides,\n    refresh\n  };\n}\n