/**
 * Runtime Feature Flag System
 * Provides runtime evaluation, caching, and React integration for feature flags
 */

import { EnvironmentConfig } from './types.js';
import { config } from './index.js';
import { featureFlagLogger } from './featureFlagLogger.js';

export type FeatureFlagKey = keyof EnvironmentConfig['features'];

export interface FeatureFlagValue {
  enabled: boolean;
  source: FeatureFlagSource;
  lastUpdated: number;
  metadata?: Record<string, any>;
}

export type FeatureFlagSource = 
  | 'environment'
  | 'runtime'
  | 'local_storage'
  | 'url_params'
  | 'default';

export interface FeatureFlagOverride {
  key: FeatureFlagKey;
  enabled: boolean;
  source: FeatureFlagSource;
  expiresAt?: number;
  metadata?: Record<string, any>;
}

export interface FeatureFlagEvaluationContext {
  userId?: string;
  environment: string;
  timestamp: number;
  userAgent?: string;
  customProperties?: Record<string, any>;
}

/**
 * Feature Flag Manager
 * Handles runtime evaluation, caching, and precedence rules
 */
export class FeatureFlagManager {
  private static instance: FeatureFlagManager;
  private cache = new Map<FeatureFlagKey, FeatureFlagValue>();
  private overrides = new Map<FeatureFlagKey, FeatureFlagOverride>();
  private listeners = new Map<FeatureFlagKey, Set<(value: boolean) => void>>();
  private globalListeners = new Set<(key: FeatureFlagKey, value: boolean) => void>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes
  private isInitialized = false;

  private constructor() {}

  static getInstance(): FeatureFlagManager {
    if (!FeatureFlagManager.instance) {
      FeatureFlagManager.instance = new FeatureFlagManager();
    }
    return FeatureFlagManager.instance;
  }

  /**
   * Initialize the feature flag manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load overrides from localStorage
      this.loadLocalStorageOverrides();
      
      // Load overrides from URL parameters
      this.loadUrlParameterOverrides();
      
      // Set up cleanup for expired overrides
      this.setupCleanupTimer();
      
      this.isInitialized = true;

      // Log initialization
      featureFlagLogger.logInitialization({
        localStorageOverrides: this.overrides.size,
        environment: config.app.environment,
        cacheExpiry: this.cacheExpiry
      });
    } catch (error) {
      featureFlagLogger.logError(error as Error, undefined, { phase: 'initialization' });
      throw error;
    }
  }

  /**
   * Evaluate a feature flag with full context and precedence rules
   */
  evaluateFlag(
    key: FeatureFlagKey, 
    context?: Partial<FeatureFlagEvaluationContext>
  ): FeatureFlagValue {
    try {
      const evaluationContext: FeatureFlagEvaluationContext = {
        environment: config.app.environment,
        timestamp: Date.now(),
        ...context
      };

      // Check cache first
      const cached = this.getCachedValue(key);
      if (cached && !this.isCacheExpired(cached)) {
        // Log cache hit
        featureFlagLogger.logEvaluation(key, cached, context);
        return cached;
      }

      // Evaluate with precedence rules
      const value = this.evaluateWithPrecedence(key, evaluationContext);
      
      // Cache the result
      this.cache.set(key, value);
      
      // Log evaluation
      featureFlagLogger.logEvaluation(key, value, context);
      
      return value;
    } catch (error) {
      featureFlagLogger.logError(error as Error, key, { phase: 'evaluation', context });
      
      // Return safe default on error
      return {
        enabled: this.getDefaultValue(key),
        source: 'default',
        lastUpdated: Date.now(),
        metadata: { error: (error as Error).message }
      };
    }
  }

  /**
   * Get a feature flag value (simplified interface)
   */
  isEnabled(key: FeatureFlagKey, context?: Partial<FeatureFlagEvaluationContext>): boolean {
    return this.evaluateFlag(key, context).enabled;
  }

  /**
   * Set a runtime override for a feature flag
   */
  setOverride(
    key: FeatureFlagKey, 
    enabled: boolean, 
    options?: {
      expiresIn?: number;
      persistToLocalStorage?: boolean;
      metadata?: Record<string, any>;
    }
  ): void {
    try {
      const override: FeatureFlagOverride = {
        key,
        enabled,
        source: 'runtime',
        expiresAt: options?.expiresIn ? Date.now() + options.expiresIn : undefined,
        metadata: options?.metadata
      };

      this.overrides.set(key, override);
      
      // Persist to localStorage if requested
      if (options?.persistToLocalStorage) {
        this.persistOverrideToLocalStorage(override);
      }

      // Invalidate cache
      this.cache.delete(key);
      
      // Log override
      featureFlagLogger.logOverrideSet(key, enabled, 'runtime', options?.metadata);
      
      // Notify listeners
      this.notifyListeners(key, enabled);
    } catch (error) {
      featureFlagLogger.logError(error as Error, key, { phase: 'setOverride', enabled, options });
      throw error;
    }
  }

  /**
   * Remove an override for a feature flag
   */
  removeOverride(key: FeatureFlagKey): void {
    try {
      this.overrides.delete(key);
      this.removeLocalStorageOverride(key);
      this.cache.delete(key);
      
      // Log override removal
      featureFlagLogger.logOverrideRemoved(key);
      
      // Re-evaluate and notify
      const newValue = this.evaluateFlag(key);
      this.notifyListeners(key, newValue.enabled);
    } catch (error) {
      featureFlagLogger.logError(error as Error, key, { phase: 'removeOverride' });
      throw error;
    }
  }

  /**
   * Clear all overrides
   */
  clearAllOverrides(): void {
    const keys = Array.from(this.overrides.keys());
    this.overrides.clear();
    this.clearLocalStorageOverrides();
    this.cache.clear();
    
    // Notify all affected listeners
    keys.forEach(key => {
      const newValue = this.evaluateFlag(key);
      this.notifyListeners(key, newValue.enabled);
    });
  }

  /**
   * Subscribe to changes for a specific feature flag
   */
  subscribe(key: FeatureFlagKey, callback: (value: boolean) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    this.listeners.get(key)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const keyListeners = this.listeners.get(key);
      if (keyListeners) {
        keyListeners.delete(callback);
        if (keyListeners.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  /**
   * Subscribe to all feature flag changes
   */
  subscribeToAll(callback: (key: FeatureFlagKey, value: boolean) => void): () => void {
    this.globalListeners.add(callback);
    
    return () => {
      this.globalListeners.delete(callback);
    };
  }

  /**
   * Get all current feature flag values
   */
  getAllFlags(context?: Partial<FeatureFlagEvaluationContext>): Record<FeatureFlagKey, boolean> {
    const flags: Record<string, boolean> = {};
    
    // Get all feature flag keys from the configuration
    const featureKeys = Object.keys(config.features) as FeatureFlagKey[];
    
    featureKeys.forEach(key => {
      flags[key] = this.isEnabled(key, context);
    });
    
    return flags as Record<FeatureFlagKey, boolean>;
  }

  /**
   * Get debug information about feature flags
   */
  getDebugInfo(): {
    flags: Record<FeatureFlagKey, FeatureFlagValue>;
    overrides: FeatureFlagOverride[];
    cacheSize: number;
    listenerCount: number;
  } {
    const flags: Record<string, FeatureFlagValue> = {};
    const featureKeys = Object.keys(config.features) as FeatureFlagKey[];
    
    featureKeys.forEach(key => {
      flags[key] = this.evaluateFlag(key);
    });
    
    return {
      flags: flags as Record<FeatureFlagKey, FeatureFlagValue>,
      overrides: Array.from(this.overrides.values()),
      cacheSize: this.cache.size,
      listenerCount: Array.from(this.listeners.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }

  /**
   * Evaluate feature flag with precedence rules
   * Precedence (highest to lowest):
   * 1. Runtime overrides
   * 2. URL parameters  
   * 3. Local storage overrides
   * 4. Environment configuration
   * 5. Default values
   */
  private evaluateWithPrecedence(
    key: FeatureFlagKey, 
    context: FeatureFlagEvaluationContext
  ): FeatureFlagValue {
    // 1. Check runtime overrides (highest precedence)
    const runtimeOverride = this.overrides.get(key);
    if (runtimeOverride && !this.isOverrideExpired(runtimeOverride)) {
      return {
        enabled: runtimeOverride.enabled,
        source: runtimeOverride.source,
        lastUpdated: context.timestamp,
        metadata: runtimeOverride.metadata
      };
    }

    // 2. Check URL parameters
    const urlValue = this.getUrlParameterValue(key);
    if (urlValue !== null) {
      return {
        enabled: urlValue,
        source: 'url_params',
        lastUpdated: context.timestamp
      };
    }

    // 3. Check local storage overrides
    const localStorageValue = this.getLocalStorageValue(key);
    if (localStorageValue !== null) {
      return {
        enabled: localStorageValue,
        source: 'local_storage',
        lastUpdated: context.timestamp
      };
    }

    // 4. Check environment configuration
    try {
      const envValue = config.features[key];
      if (envValue !== undefined) {
        return {
          enabled: envValue,
          source: 'environment',
          lastUpdated: context.timestamp
        };
      }
    } catch (error) {
      console.warn(`Failed to get environment value for feature flag ${key}:`, error);
    }

    // 5. Default value (lowest precedence)
    const defaultValue = this.getDefaultValue(key);
    return {
      enabled: defaultValue,
      source: 'default',
      lastUpdated: context.timestamp
    };
  }

  private getCachedValue(key: FeatureFlagKey): FeatureFlagValue | null {
    return this.cache.get(key) || null;
  }

  private isCacheExpired(value: FeatureFlagValue): boolean {
    return Date.now() - value.lastUpdated > this.cacheExpiry;
  }

  private isOverrideExpired(override: FeatureFlagOverride): boolean {
    return override.expiresAt ? Date.now() > override.expiresAt : false;
  }

  private getUrlParameterValue(key: FeatureFlagKey): boolean | null {
    if (typeof window === 'undefined') return null;
    
    const params = new URLSearchParams(window.location.search);
    const value = params.get(`ff_${key}`);
    
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    
    return null;
  }

  private getLocalStorageValue(key: FeatureFlagKey): boolean | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const stored = localStorage.getItem(`featureFlag_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          localStorage.removeItem(`featureFlag_${key}`);
          return null;
        }
        return parsed.enabled;
      }
    } catch (error) {
      console.warn(`Failed to read feature flag ${key} from localStorage:`, error);
    }
    
    return null;
  }

  private getDefaultValue(key: FeatureFlagKey): boolean {
    // Default values for each feature flag
    const defaults: Record<FeatureFlagKey, boolean> = {
      enableAnalytics: true,
      enablePayments: false,
      enableBetaFeatures: false,
      enableRagAnalysis: true,
      enableBatchProcessing: true,
      enableMockServices: true
    };
    
    return defaults[key] ?? false;
  }

  private loadLocalStorageOverrides(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('featureFlag_')) {
          const flagKey = key.replace('featureFlag_', '') as FeatureFlagKey;
          const stored = localStorage.getItem(key);
          
          if (stored) {
            const parsed = JSON.parse(stored);
            if (!parsed.expiresAt || Date.now() <= parsed.expiresAt) {
              this.overrides.set(flagKey, {
                key: flagKey,
                enabled: parsed.enabled,
                source: 'local_storage',
                expiresAt: parsed.expiresAt,
                metadata: parsed.metadata
              });
            } else {
              localStorage.removeItem(key);
            }
          }
        }
      });
    } catch (error) {
      console.warn('Failed to load feature flag overrides from localStorage:', error);
    }
  }

  private loadUrlParameterOverrides(): void {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => {
      if (key.startsWith('ff_')) {
        const flagKey = key.replace('ff_', '') as FeatureFlagKey;
        const enabled = value === 'true' || value === '1';
        
        this.overrides.set(flagKey, {
          key: flagKey,
          enabled,
          source: 'url_params'
        });
      }
    });
  }

  private persistOverrideToLocalStorage(override: FeatureFlagOverride): void {
    if (typeof window === 'undefined') return;
    
    try {
      const data = {
        enabled: override.enabled,
        expiresAt: override.expiresAt,
        metadata: override.metadata
      };
      
      localStorage.setItem(`featureFlag_${override.key}`, JSON.stringify(data));
    } catch (error) {
      console.warn(`Failed to persist feature flag ${override.key} to localStorage:`, error);
    }
  }

  private removeLocalStorageOverride(key: FeatureFlagKey): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(`featureFlag_${key}`);
    } catch (error) {
      console.warn(`Failed to remove feature flag ${key} from localStorage:`, error);
    }
  }

  private clearLocalStorageOverrides(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('featureFlag_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear feature flag overrides from localStorage:', error);
    }
  }

  private setupCleanupTimer(): void {
    // Clean up expired overrides every minute
    setInterval(() => {
      const expiredKeys: FeatureFlagKey[] = [];
      
      this.overrides.forEach((override, key) => {
        if (this.isOverrideExpired(override)) {
          expiredKeys.push(key);
        }
      });
      
      expiredKeys.forEach(key => {
        this.removeOverride(key);
      });
    }, 60000);
  }

  private notifyListeners(key: FeatureFlagKey, value: boolean): void {
    // Notify specific listeners
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(callback => {
        try {
          callback(value);
        } catch (error) {
          console.error(`Error in feature flag listener for ${key}:`, error);
        }
      });
    }
    
    // Notify global listeners
    this.globalListeners.forEach(callback => {
      try {
        callback(key, value);
      } catch (error) {
        console.error(`Error in global feature flag listener:`, error);
      }
    });
  }
}

// Export singleton instance
export const featureFlagManager = FeatureFlagManager.getInstance();