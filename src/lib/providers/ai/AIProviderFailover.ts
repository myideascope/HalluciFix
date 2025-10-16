/**
 * AI Provider Failover System
 * Handles automatic failover between AI providers (OpenAI, Anthropic, etc.)
 */

import { AIProvider, AIAnalysisOptions, AIAnalysisResult } from '../interfaces/AIProvider';
import { providerRegistry } from '../registry/ProviderRegistry';
import { CircuitBreaker, CircuitBreakerState } from './CircuitBreaker';

export interface FailoverConfig {
  maxRetries: number;
  retryDelay: number;
  healthCheckInterval: number;
  enableCircuitBreaker: boolean;
  fallbackOrder: string[];
}

export interface FailoverAttempt {
  providerName: string;
  success: boolean;
  error?: Error;
  responseTime?: number;
  timestamp: Date;
}

export interface FailoverMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  failoverCount: number;
  averageResponseTime: number;
  providerUsage: Record<string, number>;
  recentAttempts: FailoverAttempt[];
}

export class AIProviderFailover {
  private config: FailoverConfig;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private metrics: FailoverMetrics;
  private recentAttempts: FailoverAttempt[] = [];
  private maxRecentAttempts = 100;

  constructor(config: Partial<FailoverConfig> = {}) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      healthCheckInterval: 60000,
      enableCircuitBreaker: true,
      fallbackOrder: ['openai', 'anthropic'],
      ...config
    };

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      failoverCount: 0,
      averageResponseTime: 0,
      providerUsage: {},
      recentAttempts: []
    };

    this.initializeCircuitBreakers();
  }

  /**
   * Execute content analysis with automatic failover
   */
  async analyzeContent(
    content: string,
    options?: AIAnalysisOptions,
    preferredProvider?: string
  ): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Get ordered list of providers to try
    const providersToTry = this.getProvidersToTry(preferredProvider);
    
    if (providersToTry.length === 0) {
      throw new Error('No AI providers available');
    }

    let lastError: Error | null = null;
    let attemptCount = 0;

    for (const providerName of providersToTry) {
      if (attemptCount >= this.config.maxRetries) {
        break;
      }

      try {
        const provider = this.getProvider(providerName);
        if (!provider) {
          continue;
        }

        // Check circuit breaker
        if (this.config.enableCircuitBreaker && this.isCircuitBreakerOpen(providerName)) {
          console.warn(`Circuit breaker open for provider: ${providerName}`);
          continue;
        }

        // Attempt analysis
        const result = await this.executeWithProvider(provider, content, options);
        
        // Record successful attempt
        const responseTime = Date.now() - startTime;
        this.recordAttempt(providerName, true, undefined, responseTime);
        this.updateMetrics(true, responseTime, providerName);
        
        // Reset circuit breaker on success
        if (this.config.enableCircuitBreaker) {
          this.recordCircuitBreakerSuccess(providerName);
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        attemptCount++;
        
        // Record failed attempt
        this.recordAttempt(providerName, false, lastError);
        
        // Update circuit breaker on failure
        if (this.config.enableCircuitBreaker) {
          this.recordCircuitBreakerFailure(providerName);
        }

        console.warn(`Provider ${providerName} failed (attempt ${attemptCount}):`, error);

        // If this isn't the last provider, record a failover
        if (providersToTry.indexOf(providerName) < providersToTry.length - 1) {
          this.metrics.failoverCount++;
          console.log(`Failing over from ${providerName} to next provider`);
        }

        // Wait before trying next provider (except for the last attempt)
        if (attemptCount < this.config.maxRetries && providersToTry.indexOf(providerName) < providersToTry.length - 1) {
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    // All providers failed
    this.updateMetrics(false, Date.now() - startTime);
    throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Get the best available provider
   */
  getBestProvider(preferredProvider?: string): AIProvider | null {
    const providersToTry = this.getProvidersToTry(preferredProvider);
    
    for (const providerName of providersToTry) {
      const provider = this.getProvider(providerName);
      if (provider && this.isProviderHealthy(providerName)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Get failover metrics
   */
  getMetrics(): FailoverMetrics {
    return {
      ...this.metrics,
      recentAttempts: [...this.recentAttempts]
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      failoverCount: 0,
      averageResponseTime: 0,
      providerUsage: {},
      recentAttempts: []
    };
    this.recentAttempts = [];
  }

  /**
   * Update failover configuration
   */
  updateConfig(newConfig: Partial<FailoverConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize circuit breakers if needed
    if (newConfig.enableCircuitBreaker !== undefined) {
      this.initializeCircuitBreakers();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FailoverConfig {
    return { ...this.config };
  }

  /**
   * Force circuit breaker state for a provider
   */
  setCircuitBreakerState(providerName: string, state: CircuitBreakerState): void {
    const circuitBreaker = this.circuitBreakers.get(providerName);
    if (circuitBreaker) {
      circuitBreaker.forceState(state);
    }
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates(): Record<string, CircuitBreakerState> {
    const states: Record<string, CircuitBreakerState> = {};
    
    for (const [providerName, circuitBreaker] of this.circuitBreakers.entries()) {
      states[providerName] = circuitBreaker.getMetrics().state;
    }
    
    return states;
  }

  private getProvidersToTry(preferredProvider?: string): string[] {
    const availableProviders = providerRegistry.getProvidersByType('ai')
      .map(provider => provider.getName())
      .filter(name => this.getProvider(name) !== null);

    if (availableProviders.length === 0) {
      return [];
    }

    // Start with preferred provider if specified and available
    const orderedProviders: string[] = [];
    
    if (preferredProvider && availableProviders.includes(preferredProvider)) {
      orderedProviders.push(preferredProvider);
    }

    // Add providers from fallback order
    for (const providerName of this.config.fallbackOrder) {
      if (availableProviders.includes(providerName) && !orderedProviders.includes(providerName)) {
        orderedProviders.push(providerName);
      }
    }

    // Add any remaining available providers
    for (const providerName of availableProviders) {
      if (!orderedProviders.includes(providerName)) {
        orderedProviders.push(providerName);
      }
    }

    return orderedProviders;
  }

  private getProvider(providerName: string): AIProvider | null {
    const provider = providerRegistry.getProviderByName(providerName);
    return provider as AIProvider | null;
  }

  private async executeWithProvider(
    provider: AIProvider,
    content: string,
    options?: AIAnalysisOptions
  ): Promise<AIAnalysisResult> {
    return provider.analyzeContent(content, options);
  }

  private isProviderHealthy(providerName: string): boolean {
    const provider = this.getProvider(providerName);
    if (!provider) return false;

    const healthStatus = provider.getHealthStatus();
    const circuitBreakerOpen = this.isCircuitBreakerOpen(providerName);
    
    return healthStatus.isHealthy && !circuitBreakerOpen;
  }

  private initializeCircuitBreakers(): void {
    if (!this.config.enableCircuitBreaker) {
      this.circuitBreakers.clear();
      return;
    }

    // Initialize circuit breakers for all providers in fallback order
    for (const providerName of this.config.fallbackOrder) {
      if (!this.circuitBreakers.has(providerName)) {
        this.circuitBreakers.set(providerName, new CircuitBreaker({
          failureThreshold: 5,
          recoveryTimeout: 30000,
          successThreshold: 3,
          monitoringWindow: 300000
        }));
      }
    }
  }

  private isCircuitBreakerOpen(providerName: string): boolean {
    if (!this.config.enableCircuitBreaker) return false;
    
    const circuitBreaker = this.circuitBreakers.get(providerName);
    return circuitBreaker ? !circuitBreaker.canExecute() : false;
  }

  private recordCircuitBreakerSuccess(providerName: string): void {
    const circuitBreaker = this.circuitBreakers.get(providerName);
    if (circuitBreaker) {
      // Circuit breaker success is recorded automatically by the execute method
      // This is just a placeholder for any additional logic
    }
  }

  private recordCircuitBreakerFailure(providerName: string): void {
    const circuitBreaker = this.circuitBreakers.get(providerName);
    if (circuitBreaker) {
      // Circuit breaker failure is recorded automatically by the execute method
      // This is just a placeholder for any additional logic
    }
  }

  private recordAttempt(
    providerName: string,
    success: boolean,
    error?: Error,
    responseTime?: number
  ): void {
    const attempt: FailoverAttempt = {
      providerName,
      success,
      error,
      responseTime,
      timestamp: new Date()
    };

    this.recentAttempts.push(attempt);
    
    // Keep only recent attempts
    if (this.recentAttempts.length > this.maxRecentAttempts) {
      this.recentAttempts = this.recentAttempts.slice(-this.maxRecentAttempts);
    }
  }

  private updateMetrics(success: boolean, responseTime: number, providerName?: string): void {
    if (success) {
      this.metrics.successfulRequests++;
      
      if (providerName) {
        this.metrics.providerUsage[providerName] = (this.metrics.providerUsage[providerName] || 0) + 1;
      }
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time
    const totalResponseTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime;
    this.metrics.averageResponseTime = totalResponseTime / this.metrics.totalRequests;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}