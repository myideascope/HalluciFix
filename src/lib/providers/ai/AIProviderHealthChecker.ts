/**
 * AI Provider Health Checker
 * Monitors the health of AI providers and manages their availability
 */

import { AIProvider } from '../interfaces/AIProvider';
import { providerRegistry } from '../registry/ProviderRegistry';

import { logger } from '../../logging';
export interface HealthCheckConfig {
  interval: number; // milliseconds
  timeout: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
  failureThreshold: number; // consecutive failures before marking unhealthy
  recoveryThreshold: number; // consecutive successes before marking healthy
}

export interface ProviderHealthMetrics {
  providerName: string;
  isHealthy: boolean;
  lastHealthCheck: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  averageResponseTime: number;
  lastError?: string;
  uptime: number; // percentage
}

export interface HealthCheckResult {
  providerName: string;
  success: boolean;
  responseTime: number;
  error?: Error;
  timestamp: Date;
}

export class AIProviderHealthChecker {
  private config: HealthCheckConfig;
  private healthMetrics: Map<string, ProviderHealthMetrics> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(config?: Partial<HealthCheckConfig>) {
    this.config = {
      interval: 60000, // 1 minute
      timeout: 10000, // 10 seconds
      retryAttempts: 2,
      retryDelay: 5000, // 5 seconds
      failureThreshold: 3,
      recoveryThreshold: 2,
      ...config
    };
  }

  /**
   * Start health checking for all AI providers
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("Health checker is already running");
      return;
    }

    this.isRunning = true;
    this.initializeProviderMetrics();
    
    // Perform initial health check
    this.performHealthChecks();
    
    // Schedule periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.interval);

    console.log(`AI Provider Health Checker started (interval: ${this.config.interval}ms)`);
  }

  /**
   * Stop health checking
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    logger.debug("AI Provider Health Checker stopped");
  }

  /**
   * Perform health checks on all AI providers
   */
  async performHealthChecks(): Promise<HealthCheckResult[]> {
    const aiProviders = providerRegistry.getProvidersByType('ai') as AIProvider[];
    const results: HealthCheckResult[] = [];

    const healthCheckPromises = aiProviders.map(async (provider) => {
      const result = await this.checkProviderHealth(provider);
      results.push(result);
      this.updateProviderMetrics(result);
      return result;
    });

    await Promise.allSettled(healthCheckPromises);
    return results;
  }

  /**
   * Check health of a specific provider
   */
  async checkProviderHealth(provider: AIProvider): Promise<HealthCheckResult> {
    const providerName = provider.getName();
    const startTime = Date.now();

    try {
      // Perform health check with timeout
      await Promise.race([
        provider.performHealthCheck(),
        this.createTimeoutPromise(this.config.timeout)
      ]);

      const responseTime = Date.now() - startTime;
      
      return {
        providerName,
        success: true,
        responseTime,
        timestamp: new Date()
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        providerName,
        success: false,
        responseTime,
        error: error as Error,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get health metrics for all providers
   */
  getAllHealthMetrics(): ProviderHealthMetrics[] {
    return Array.from(this.healthMetrics.values());
  }

  /**
   * Get health metrics for a specific provider
   */
  getProviderHealthMetrics(providerName: string): ProviderHealthMetrics | null {
    return this.healthMetrics.get(providerName) || null;
  }

  /**
   * Get list of healthy providers
   */
  getHealthyProviders(): string[] {
    return Array.from(this.healthMetrics.values())
      .filter(metrics => metrics.isHealthy)
      .map(metrics => metrics.providerName);
  }

  /**
   * Get list of unhealthy providers
   */
  getUnhealthyProviders(): string[] {
    return Array.from(this.healthMetrics.values())
      .filter(metrics => !metrics.isHealthy)
      .map(metrics => metrics.providerName);
  }

  /**
   * Check if a specific provider is healthy
   */
  isProviderHealthy(providerName: string): boolean {
    const metrics = this.healthMetrics.get(providerName);
    return metrics?.isHealthy || false;
  }

  /**
   * Force a provider to be marked as healthy or unhealthy
   */
  setProviderHealth(providerName: string, isHealthy: boolean): void {
    const metrics = this.healthMetrics.get(providerName);
    if (metrics) {
      metrics.isHealthy = isHealthy;
      if (isHealthy) {
        metrics.consecutiveFailures = 0;
        metrics.consecutiveSuccesses = this.config.recoveryThreshold;
      } else {
        metrics.consecutiveSuccesses = 0;
        metrics.consecutiveFailures = this.config.failureThreshold;
      }
      console.log(`Manually set provider ${providerName} health to: ${isHealthy ? 'healthy' : 'unhealthy'}`);
    }
  }

  /**
   * Reset health metrics for all providers
   */
  resetMetrics(): void {
    this.healthMetrics.clear();
    this.initializeProviderMetrics();
    logger.debug("Reset all provider health metrics");
  }

  /**
   * Update health check configuration
   */
  updateConfig(newConfig: Partial<HealthCheckConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };

    if (wasRunning) {
      this.start();
    }

    logger.debug("Updated health check configuration");
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  private initializeProviderMetrics(): void {
    const aiProviders = providerRegistry.getProvidersByType('ai') as AIProvider[];
    
    for (const provider of aiProviders) {
      const providerName = provider.getName();
      
      if (!this.healthMetrics.has(providerName)) {
        this.healthMetrics.set(providerName, {
          providerName,
          isHealthy: true, // Assume healthy initially
          lastHealthCheck: new Date(),
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          totalChecks: 0,
          successfulChecks: 0,
          failedChecks: 0,
          averageResponseTime: 0,
          uptime: 100
        });
      }
    }
  }

  private updateProviderMetrics(result: HealthCheckResult): void {
    let metrics = this.healthMetrics.get(result.providerName);
    
    if (!metrics) {
      // Initialize metrics if not exists
      metrics = {
        providerName: result.providerName,
        isHealthy: true,
        lastHealthCheck: new Date(),
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        averageResponseTime: 0,
        uptime: 100
      };
      this.healthMetrics.set(result.providerName, metrics);
    }

    // Update basic metrics
    metrics.lastHealthCheck = result.timestamp;
    metrics.totalChecks++;

    if (result.success) {
      metrics.successfulChecks++;
      metrics.consecutiveSuccesses++;
      metrics.consecutiveFailures = 0;
      
      // Check if provider should be marked as healthy
      if (!metrics.isHealthy && metrics.consecutiveSuccesses >= this.config.recoveryThreshold) {
        metrics.isHealthy = true;
        console.log(`Provider ${result.providerName} marked as healthy after ${metrics.consecutiveSuccesses} successful checks`);
      }
    } else {
      metrics.failedChecks++;
      metrics.consecutiveFailures++;
      metrics.consecutiveSuccesses = 0;
      metrics.lastError = result.error?.message;
      
      // Check if provider should be marked as unhealthy
      if (metrics.isHealthy && metrics.consecutiveFailures >= this.config.failureThreshold) {
        metrics.isHealthy = false;
        console.warn(`Provider ${result.providerName} marked as unhealthy after ${metrics.consecutiveFailures} consecutive failures`);
      }
    }

    // Update average response time
    const totalResponseTime = metrics.averageResponseTime * (metrics.totalChecks - 1) + result.responseTime;
    metrics.averageResponseTime = totalResponseTime / metrics.totalChecks;

    // Update uptime percentage
    metrics.uptime = (metrics.successfulChecks / metrics.totalChecks) * 100;
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }
}