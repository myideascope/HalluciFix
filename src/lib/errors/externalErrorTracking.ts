/**
 * External Error Tracking Service
 * Provides a unified interface for multiple error tracking providers
 */

import { ApiError, ErrorContext, ErrorSeverity } from './types';
import { ErrorLogEntry } from './errorManager';
import { sentryIntegration, SentryConfig } from './sentryIntegration';

import { logger } from './logging';
/**
 * Error tracking provider types
 */
export enum ErrorTrackingProvider {
  SENTRY = 'sentry',
  BUGSNAG = 'bugsnag',
  ROLLBAR = 'rollbar',
  CUSTOM = 'custom'
}

/**
 * Generic error tracking configuration
 */
export interface ErrorTrackingConfig {
  provider: ErrorTrackingProvider;
  enabled: boolean;
  config: any; // Provider-specific configuration
  filters?: ErrorFilter[];
  enrichers?: ErrorEnricher[];
}

/**
 * Error filter function
 */
export type ErrorFilter = (error: ApiError, context: ErrorContext) => boolean;

/**
 * Error enricher function
 */
export type ErrorEnricher = (error: ApiError, context: ErrorContext) => { error: ApiError; context: ErrorContext };

/**
 * Error tracking provider interface
 */
export interface IErrorTrackingProvider {
  initialize(config: any): Promise<void>;
  reportError(error: ApiError, context: ErrorContext): Promise<void>;
  reportErrorBatch(errors: ErrorLogEntry[]): Promise<void>;
  setUser(user: any): void;
  setContext(key: string, context: any): void;
  addBreadcrumb(breadcrumb: any): void;
  flush(timeout?: number): Promise<boolean>;
  isInitialized(): boolean;
}

/**
 * Sentry provider implementation
 */
class SentryProvider implements IErrorTrackingProvider {
  async initialize(config: SentryConfig): Promise<void> {
    sentryIntegration.initialize(config);
  }

  async reportError(error: ApiError, context: ErrorContext): Promise<void> {
    sentryIntegration.reportError(error, context);
  }

  async reportErrorBatch(errors: ErrorLogEntry[]): Promise<void> {
    sentryIntegration.reportErrorBatch(errors);
  }

  setUser(user: any): void {
    sentryIntegration.setUser(user);
  }

  setContext(key: string, context: any): void {
    sentryIntegration.setContext(key, context);
  }

  addBreadcrumb(breadcrumb: any): void {
    sentryIntegration.addBreadcrumb(breadcrumb);
  }

  async flush(timeout: number = 2000): Promise<boolean> {
    return sentryIntegration.flush(timeout);
  }

  isInitialized(): boolean {
    return sentryIntegration.isInitialized();
  }
}

/**
 * Custom provider implementation (for custom error tracking endpoints)
 */
class CustomProvider implements IErrorTrackingProvider {
  private initialized = false;
  private endpoint?: string;
  private apiKey?: string;

  async initialize(config: { endpoint: string; apiKey?: string }): Promise<void> {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.initialized = true;
  }

  async reportError(error: ApiError, context: ErrorContext): Promise<void> {
    if (!this.initialized || !this.endpoint) return;

    try {
      const payload = {
        error: {
          id: error.errorId,
          type: error.type,
          severity: error.severity,
          message: error.message,
          userMessage: error.userMessage,
          timestamp: error.timestamp,
          statusCode: error.statusCode,
          url: error.url,
          userAgent: error.userAgent,
          userId: error.userId,
          sessionId: error.sessionId
        },
        context,
        metadata: {
          source: 'hallucifix-web',
          version: import.meta.env.VITE_APP_VERSION || '1.0.0'
        }
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      logger.error("Failed to send error to custom endpoint:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  async reportErrorBatch(errors: ErrorLogEntry[]): Promise<void> {
    if (!this.initialized || !this.endpoint) return;

    try {
      const payload = {
        errors: errors.map(entry => ({
          id: entry.errorId,
          type: entry.type,
          severity: entry.severity,
          message: entry.message,
          userMessage: entry.userMessage,
          timestamp: entry.timestamp,
          statusCode: entry.statusCode,
          url: entry.url,
          userAgent: entry.userAgent,
          userId: entry.userId,
          sessionId: entry.sessionId,
          context: entry.context
        })),
        metadata: {
          source: 'hallucifix-web',
          version: import.meta.env.VITE_APP_VERSION || '1.0.0',
          batchSize: errors.length
        }
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      await fetch(`${this.endpoint}/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      logger.error("Failed to send error batch to custom endpoint:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  setUser(user: any): void {
    // Store user context for inclusion in future error reports
    if (typeof window !== 'undefined') {
      (window as any).__errorTrackingUser = user;
    }
  }

  setContext(key: string, context: any): void {
    // Store context for inclusion in future error reports
    if (typeof window !== 'undefined') {
      (window as any).__errorTrackingContext = {
        ...(window as any).__errorTrackingContext,
        [key]: context
      };
    }
  }

  addBreadcrumb(breadcrumb: any): void {
    // Store breadcrumbs for inclusion in future error reports
    if (typeof window !== 'undefined') {
      (window as any).__errorTrackingBreadcrumbs = [
        ...((window as any).__errorTrackingBreadcrumbs || []).slice(-50), // Keep last 50
        {
          ...breadcrumb,
          timestamp: new Date().toISOString()
        }
      ];
    }
  }

  async flush(timeout: number = 2000): Promise<boolean> {
    // Custom providers don't typically need flushing
    return true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * External Error Tracking Service
 * Manages multiple error tracking providers with filtering and enrichment
 */
export class ExternalErrorTracking {
  private static instance: ExternalErrorTracking;
  private providers: Map<ErrorTrackingProvider, IErrorTrackingProvider> = new Map();
  private configs: Map<ErrorTrackingProvider, ErrorTrackingConfig> = new Map();
  private globalFilters: ErrorFilter[] = [];
  private globalEnrichers: ErrorEnricher[] = [];

  private constructor() {
    // Register built-in providers
    this.providers.set(ErrorTrackingProvider.SENTRY, new SentryProvider());
    this.providers.set(ErrorTrackingProvider.CUSTOM, new CustomProvider());
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ExternalErrorTracking {
    if (!ExternalErrorTracking.instance) {
      ExternalErrorTracking.instance = new ExternalErrorTracking();
    }
    return ExternalErrorTracking.instance;
  }

  /**
   * Configure error tracking provider
   */
  public async configureProvider(config: ErrorTrackingConfig): Promise<void> {
    const provider = this.providers.get(config.provider);
    if (!provider) {
      throw new Error(`Unknown error tracking provider: ${config.provider}`);
    }

    try {
      if (config.enabled) {
        await provider.initialize(config.config);
        console.log(`Error tracking provider ${config.provider} initialized`);
      }
      
      this.configs.set(config.provider, config);
    } catch (error) {
      console.error(`Failed to initialize error tracking provider ${config.provider}:`, error);
    }
  }

  /**
   * Report error to all configured providers
   */
  public async reportError(error: ApiError, context: ErrorContext = {}): Promise<void> {
    // Apply global filters
    if (!this.shouldReportError(error, context)) {
      return;
    }

    // Apply global enrichers
    const enriched = this.enrichError(error, context);

    // Report to all enabled providers
    const promises: Promise<void>[] = [];
    
    for (const [providerType, config] of this.configs) {
      if (!config.enabled) continue;

      const provider = this.providers.get(providerType);
      if (!provider || !provider.isInitialized()) continue;

      // Apply provider-specific filters
      if (config.filters && !this.applyFilters(enriched.error, enriched.context, config.filters)) {
        continue;
      }

      // Apply provider-specific enrichers
      const providerEnriched = config.enrichers 
        ? this.applyEnrichers(enriched.error, enriched.context, config.enrichers)
        : enriched;

      promises.push(provider.reportError(providerEnriched.error, providerEnriched.context));
    }

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      logger.error("Error reporting to external providers:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Report error batch to all configured providers
   */
  public async reportErrorBatch(errors: ErrorLogEntry[]): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [providerType, config] of this.configs) {
      if (!config.enabled) continue;

      const provider = this.providers.get(providerType);
      if (!provider || !provider.isInitialized()) continue;

      // Filter errors for this provider
      const filteredErrors = config.filters 
        ? errors.filter(entry => {
            const apiError: ApiError = {
              type: entry.type,
              severity: entry.severity,
              errorId: entry.errorId,
              timestamp: entry.timestamp,
              message: entry.message,
              userMessage: entry.userMessage,
              statusCode: entry.statusCode,
              retryable: false,
              url: entry.url,
              userAgent: entry.userAgent,
              userId: entry.userId,
              sessionId: entry.sessionId,
              context: entry.context
            };
            return this.applyFilters(apiError, entry.context, config.filters!);
          })
        : errors;

      if (filteredErrors.length > 0) {
        promises.push(provider.reportErrorBatch(filteredErrors));
      }
    }

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      logger.error("Error reporting batch to external providers:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Set user context for all providers
   */
  public setUser(user: any): void {
    for (const [providerType, config] of this.configs) {
      if (!config.enabled) continue;

      const provider = this.providers.get(providerType);
      if (provider && provider.isInitialized()) {
        provider.setUser(user);
      }
    }
  }

  /**
   * Set context for all providers
   */
  public setContext(key: string, context: any): void {
    for (const [providerType, config] of this.configs) {
      if (!config.enabled) continue;

      const provider = this.providers.get(providerType);
      if (provider && provider.isInitialized()) {
        provider.setContext(key, context);
      }
    }
  }

  /**
   * Add breadcrumb to all providers
   */
  public addBreadcrumb(breadcrumb: any): void {
    for (const [providerType, config] of this.configs) {
      if (!config.enabled) continue;

      const provider = this.providers.get(providerType);
      if (provider && provider.isInitialized()) {
        provider.addBreadcrumb(breadcrumb);
      }
    }
  }

  /**
   * Add global error filter
   */
  public addGlobalFilter(filter: ErrorFilter): void {
    this.globalFilters.push(filter);
  }

  /**
   * Add global error enricher
   */
  public addGlobalEnricher(enricher: ErrorEnricher): void {
    this.globalEnrichers.push(enricher);
  }

  /**
   * Flush all providers
   */
  public async flush(timeout: number = 2000): Promise<boolean[]> {
    const promises: Promise<boolean>[] = [];
    
    for (const [providerType, config] of this.configs) {
      if (!config.enabled) continue;

      const provider = this.providers.get(providerType);
      if (provider && provider.isInitialized()) {
        promises.push(provider.flush(timeout));
      }
    }

    try {
      return await Promise.all(promises);
    } catch (error) {
      logger.error("Error flushing external providers:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Get configured providers
   */
  public getConfiguredProviders(): ErrorTrackingProvider[] {
    return Array.from(this.configs.keys()).filter(provider => 
      this.configs.get(provider)?.enabled
    );
  }

  // Private helper methods

  private shouldReportError(error: ApiError, context: ErrorContext): boolean {
    return this.applyFilters(error, context, this.globalFilters);
  }

  private applyFilters(error: ApiError, context: ErrorContext, filters: ErrorFilter[]): boolean {
    return filters.every(filter => {
      try {
        return filter(error, context);
      } catch (filterError) {
        logger.error("Error in error filter:", filterError instanceof Error ? filterError : new Error(String(filterError)));
        return true; // Default to allowing the error through
      }
    });
  }

  private enrichError(error: ApiError, context: ErrorContext): { error: ApiError; context: ErrorContext } {
    return this.applyEnrichers(error, context, this.globalEnrichers);
  }

  private applyEnrichers(
    error: ApiError, 
    context: ErrorContext, 
    enrichers: ErrorEnricher[]
  ): { error: ApiError; context: ErrorContext } {
    let enriched = { error: { ...error }, context: { ...context } };

    for (const enricher of enrichers) {
      try {
        enriched = enricher(enriched.error, enriched.context);
      } catch (enricherError) {
        logger.error("Error in error enricher:", enricherError instanceof Error ? enricherError : new Error(String(enricherError)));
      }
    }

    return enriched;
  }
}

// Export singleton instance
export const externalErrorTracking = ExternalErrorTracking.getInstance();

// Common error filters
export const commonFilters = {
  // Filter out low severity errors in production
  productionSeverityFilter: (error: ApiError, context: ErrorContext): boolean => {
    if (import.meta.env.MODE === 'production') {
      return error.severity !== ErrorSeverity.LOW;
    }
    return true;
  },

  // Filter out network errors that are likely temporary
  networkErrorFilter: (error: ApiError, context: ErrorContext): boolean => {
    // Don't report network errors that are likely due to user connectivity
    return !(error.type === 'NETWORK' && !navigator.onLine);
  },

  // Filter out validation errors (usually user input issues)
  validationErrorFilter: (error: ApiError, context: ErrorContext): boolean => {
    return error.type !== 'VALIDATION';
  }
};

// Common error enrichers
export const commonEnrichers = {
  // Add browser information
  browserEnricher: (error: ApiError, context: ErrorContext): { error: ApiError; context: ErrorContext } => {
    return {
      error,
      context: {
        ...context,
        browser: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine
        }
      }
    };
  },

  // Add performance information
  performanceEnricher: (error: ApiError, context: ErrorContext): { error: ApiError; context: ErrorContext } => {
    const perfData: any = {};
    
    if (typeof performance !== 'undefined') {
      perfData.timing = performance.timing;
      perfData.navigation = performance.navigation;
      
      if ((performance as any).memory) {
        perfData.memory = (performance as any).memory;
      }
    }

    return {
      error,
      context: {
        ...context,
        performance: perfData
      }
    };
  }
};