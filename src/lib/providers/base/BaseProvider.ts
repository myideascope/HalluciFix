/**
 * Base provider interface and abstract class for all API providers
 * Provides common functionality for rate limiting, error handling, and monitoring
 */

export interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number;
  rateLimits?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
  timeout?: number;
  retryConfig?: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
}

export interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime?: Date;
  rateLimitHits: number;
  circuitBreakerTrips: number;
}

export interface ProviderHealthStatus {
  isHealthy: boolean;
  lastHealthCheck: Date;
  consecutiveFailures: number;
  responseTime?: number;
  errorMessage?: string;
}

export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected metrics: ProviderMetrics;
  protected healthStatus: ProviderHealthStatus;
  protected circuitBreakerOpen: boolean = false;
  protected circuitBreakerOpenTime?: Date;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0
    };
    this.healthStatus = {
      isHealthy: true,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0
    };
  }

  /**
   * Abstract method to validate API key/credentials
   */
  abstract validateCredentials(): Promise<boolean>;

  /**
   * Abstract method to perform health check
   */
  abstract performHealthCheck(): Promise<ProviderHealthStatus>;

  /**
   * Get provider name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Check if provider is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get provider priority (higher number = higher priority)
   */
  getPriority(): number {
    return this.config.priority;
  }

  /**
   * Get current metrics
   */
  getMetrics(): ProviderMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current health status
   */
  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(): boolean {
    // Auto-reset circuit breaker after 30 seconds
    if (this.circuitBreakerOpen && this.circuitBreakerOpenTime) {
      const timeSinceOpen = Date.now() - this.circuitBreakerOpenTime.getTime();
      if (timeSinceOpen > 30000) { // 30 seconds
        this.circuitBreakerOpen = false;
        this.circuitBreakerOpenTime = undefined;
        console.log(`Circuit breaker reset for provider: ${this.config.name}`);
      }
    }
    return this.circuitBreakerOpen;
  }

  /**
   * Execute a request with built-in error handling, retries, and circuit breaker
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'request'
  ): Promise<T> {
    if (this.isCircuitBreakerOpen()) {
      throw new Error(`Circuit breaker is open for provider: ${this.config.name}`);
    }

    const startTime = Date.now();
    let lastError: Error | null = null;
    const maxRetries = this.config.retryConfig?.maxRetries ?? 3;
    const baseDelay = this.config.retryConfig?.baseDelay ?? 1000;
    const maxDelay = this.config.retryConfig?.maxDelay ?? 30000;
    const backoffMultiplier = this.config.retryConfig?.backoffMultiplier ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.metrics.totalRequests++;
        
        const result = await operation();
        
        // Success - update metrics
        this.metrics.successfulRequests++;
        this.metrics.lastRequestTime = new Date();
        this.updateResponseTime(Date.now() - startTime);
        this.healthStatus.consecutiveFailures = 0;
        this.healthStatus.isHealthy = true;
        
        return result;
      } catch (error) {
        lastError = error as Error;
        this.metrics.failedRequests++;
        this.healthStatus.consecutiveFailures++;
        
        // Check if this is a rate limit error
        if (this.isRateLimitError(error as Error)) {
          this.metrics.rateLimitHits++;
        }
        
        // Open circuit breaker after 5 consecutive failures
        if (this.healthStatus.consecutiveFailures >= 5) {
          this.circuitBreakerOpen = true;
          this.circuitBreakerOpenTime = new Date();
          this.metrics.circuitBreakerTrips++;
          this.healthStatus.isHealthy = false;
          console.warn(`Circuit breaker opened for provider: ${this.config.name}`);
        }
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          baseDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        );
        const jitter = Math.random() * 0.1 * delay; // 10% jitter
        const totalDelay = delay + jitter;
        
        console.warn(
          `${operationName} failed for provider ${this.config.name}, attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${Math.round(totalDelay)}ms. Error: ${lastError.message}`
        );
        
        await this.sleep(totalDelay);
      }
    }
    
    throw lastError || new Error(`${operationName} failed after ${maxRetries + 1} attempts`);
  }

  /**
   * Update average response time
   */
  private updateResponseTime(responseTime: number): void {
    const totalRequests = this.metrics.successfulRequests;
    const currentAverage = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime = 
      (currentAverage * (totalRequests - 1) + responseTime) / totalRequests;
  }

  /**
   * Check if error is a rate limit error (to be overridden by specific providers)
   */
  protected isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('too many requests') ||
           message.includes('quota exceeded');
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0
    };
  }

  /**
   * Reset health status
   */
  resetHealthStatus(): void {
    this.healthStatus = {
      isHealthy: true,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0
    };
    this.circuitBreakerOpen = false;
    this.circuitBreakerOpenTime = undefined;
  }
}