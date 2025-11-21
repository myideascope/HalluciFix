/**
 * React hooks for configuration access
 * Provides type-safe access to configuration values in React components
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { config, type EnvironmentConfig } from '../lib/config';
import { serviceRegistry, type ServiceAvailability } from '../lib/serviceRegistry';

import { logger } from './logging';
export interface UseConfigurationReturn {
  config: EnvironmentConfig | null;
  isLoaded: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

/**
 * Hook to access the configuration system
 */
export function useConfiguration(): UseConfigurationReturn {
  const [configData, setConfigData] = useState<EnvironmentConfig | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize configuration on mount
  useEffect(() => {
    const initializeConfig = async () => {
      try {
        await config.initialize();
        setConfigData({
          app: config.app,
          database: config.database,
          ai: config.ai,
          auth: config.auth,
          payments: config.payments,
          monitoring: config.monitoring,
          features: config.features,
          security: config.security
        });
        setIsLoaded(true);
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Configuration initialization failed');
        setError(error);
        setIsLoaded(false);
      }
    };

    initializeConfig();
  }, []);

  // Reload function
  const reload = useCallback(async () => {
    try {
      setError(null);
      await config.reloadConfiguration();
      setConfigData({
        app: config.app,
        database: config.database,
        ai: config.ai,
        auth: config.auth,
        payments: config.payments,
        monitoring: config.monitoring,
        features: config.features,
        security: config.security
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Configuration reload failed');
      setError(error);
    }
  }, []);

  return {
    config: configData,
    isLoaded,
    error,
    reload
  };
}

/**
 * Hook to access application configuration
 */
export function useAppConfig() {
  const { config: configData, isLoaded } = useConfiguration();
  
  return useMemo(() => ({
    name: configData?.app.name || 'HalluciFix',
    version: configData?.app.version || '1.0.0',
    environment: configData?.app.environment || 'development',
    url: configData?.app.url || 'http://localhost:5173',
    port: configData?.app.port || 5173,
    logLevel: configData?.app.logLevel || 'info',
    isDevelopment: configData?.app.environment === 'development',
    isProduction: configData?.app.environment === 'production',
    isStaging: configData?.app.environment === 'staging',
    isLoaded
  }), [configData, isLoaded]);
}

/**
 * Hook to access database configuration
 */
export function useDatabaseConfig() {
  const { config: configData, isLoaded } = useConfiguration();
  
  return useMemo(() => ({
    supabaseUrl: configData?.database.supabaseUrl || '',
    supabaseAnonKey: configData?.database.supabaseAnonKey || '',
    supabaseServiceKey: configData?.database.supabaseServiceKey,
    connectionPoolSize: configData?.database.connectionPoolSize || 10,
    queryTimeout: configData?.database.queryTimeout || 30000,
    isLoaded
  }), [configData, isLoaded]);
}

/**
 * Hook to access AI services configuration
 */
export function useAIConfig() {
  const { config: configData, isLoaded } = useConfiguration();
  
  return useMemo(() => ({
    openai: configData?.ai.openai || null,
    anthropic: configData?.ai.anthropic || null,
    hallucifix: configData?.ai.hallucifix || null,
    hasOpenAI: !!configData?.ai.openai?.apiKey,
    hasAnthropic: !!configData?.ai.anthropic?.apiKey,
    hasHallucifix: !!configData?.ai.hallucifix?.apiKey,
    isLoaded
  }), [configData, isLoaded]);
}

/**
 * Hook to access authentication configuration
 */
export function useAuthConfig() {
  const { config: configData, isLoaded } = useConfiguration();
  
  return useMemo(() => ({
    google: configData?.auth.google || null,
    jwt: configData?.auth.jwt || null,
    hasGoogleAuth: !!(configData?.auth.google.clientId && configData?.auth.google.clientSecret),
    isLoaded
  }), [configData, isLoaded]);
}

/**
 * Hook to access payments configuration
 */
export function usePaymentsConfig() {
  const { config: configData, isLoaded } = useConfiguration();
  
  return useMemo(() => ({
    stripe: configData?.payments?.stripe || null,
    hasStripe: !!configData?.payments?.stripe,
    isEnabled: !!configData?.features.enablePayments,
    isLoaded
  }), [configData, isLoaded]);
}

/**
 * Hook to access monitoring configuration
 */
export function useMonitoringConfig() {
  const { config: configData, isLoaded } = useConfiguration();
  
  return useMemo(() => ({
    sentry: configData?.monitoring.sentry || null,
    analytics: configData?.monitoring.analytics || null,
    logging: configData?.monitoring.logging || null,
    hasSentry: !!configData?.monitoring.sentry?.dsn,
    hasAnalytics: !!configData?.monitoring.analytics,
    isLoaded
  }), [configData, isLoaded]);
}

/**
 * Hook to access service availability
 */
export function useServiceAvailability(): ServiceAvailability & { isLoaded: boolean } {
  const [availability, setAvailability] = useState<ServiceAvailability>({
    googleDrive: false,
    hallucifix: false,
    openai: false,
    anthropic: false,
    stripe: false,
    sentry: false,
    analytics: false
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const updateAvailability = () => {
      try {
        const serviceAvailability = serviceRegistry.getAvailability();
        setAvailability(serviceAvailability);
        setIsLoaded(true);
      } catch (error) {
        logger.warn("Failed to get service availability:", { error });
      }
    };

    // Initial load
    updateAvailability();

    // Set up periodic updates (in case configuration changes)
    const interval = setInterval(updateAvailability, 5000);

    return () => clearInterval(interval);
  }, []);

  return {
    ...availability,
    isLoaded
  };
}

/**
 * Hook to check if a specific service is available
 */
export function useServiceStatus(serviceName: keyof ServiceAvailability): {
  isAvailable: boolean;
  isLoaded: boolean;
} {
  const { [serviceName]: isAvailable, isLoaded } = useServiceAvailability();
  
  return {
    isAvailable,
    isLoaded
  };
}