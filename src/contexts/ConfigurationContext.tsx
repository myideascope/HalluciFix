/**
 * Configuration Context Provider
 * Provides configuration access throughout the React application
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { config, type EnvironmentConfig } from '../lib/config';
import { serviceRegistry, type ServiceAvailability } from '../lib/serviceRegistry';

export interface ConfigurationContextValue {
  config: EnvironmentConfig | null;
  serviceAvailability: ServiceAvailability;
  isLoaded: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

export interface ConfigurationProviderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Configuration Provider Component
 */
export function ConfigurationProvider({ children, fallback }: ConfigurationProviderProps) {
  const [configData, setConfigData] = useState<EnvironmentConfig | null>(null);
  const [serviceAvailability, setServiceAvailability] = useState<ServiceAvailability>({
    googleDrive: false,
    hallucifix: false,
    openai: false,
    anthropic: false,
    stripe: false,
    sentry: false,
    analytics: false
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize configuration and services
  useEffect(() => {
    const initialize = async () => {
      try {
        // Configuration should already be initialized in main.tsx
        // But we'll ensure it's ready here
        await config.initialize();
        await serviceRegistry.initialize();

        // Get configuration data
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

        // Get service availability
        setServiceAvailability(serviceRegistry.getAvailability());

        setIsLoaded(true);
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Configuration initialization failed');
        setError(error);
        setIsLoaded(false);
        console.error('Configuration context initialization failed:', error);
      }
    };

    initialize();
  }, []);

  // Reload function
  const reload = async () => {
    try {
      setError(null);
      
      // Reload configuration
      await config.reloadConfiguration();
      
      // Reinitialize services
      await serviceRegistry.initialize();

      // Update state
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

      setServiceAvailability(serviceRegistry.getAvailability());
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Configuration reload failed');
      setError(error);
      console.error('Configuration reload failed:', error);
    }
  };

  const contextValue: ConfigurationContextValue = {
    config: configData,
    serviceAvailability,
    isLoaded,
    error,
    reload
  };

  // Show fallback while loading or on error
  if (!isLoaded) {
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold mb-4">Configuration Error</h1>
            <p className="text-gray-300 mb-6">
              Failed to load application configuration. Please check your environment settings.
            </p>
            <details className="text-left bg-gray-800 p-4 rounded-lg mb-4">
              <summary className="cursor-pointer font-semibold">Error Details</summary>
              <pre className="mt-2 text-sm text-red-400 whitespace-pre-wrap">
                {error.message}
              </pre>
            </details>
            <button
              onClick={reload}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Loading configuration...</p>
          </div>
        </div>
      )
    );
  }

  return (
    <ConfigurationContext.Provider value={contextValue}>
      {children}
    </ConfigurationContext.Provider>
  );
}

/**
 * Hook to use configuration context
 */
export function useConfigurationContext(): ConfigurationContextValue {
  const context = useContext(ConfigurationContext);
  
  if (!context) {
    throw new Error('useConfigurationContext must be used within a ConfigurationProvider');
  }
  
  return context;
}

/**
 * HOC to wrap components with configuration context
 */
export function withConfiguration<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return function ConfigurationWrappedComponent(props: P) {
    return (
      <ConfigurationProvider>
        <Component {...props} />
      </ConfigurationProvider>
    );
  };
}