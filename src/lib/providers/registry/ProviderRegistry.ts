/**
 * Provider Registry for managing and selecting API providers
 * Handles provider registration, selection, failover, and health monitoring
 */

import { BaseProvider, ProviderHealthStatus } from '../base/BaseProvider';
import { AIProvider, AIProviderType } from '../interfaces/AIProvider';
import { AuthProvider, AuthProviderType } from '../interfaces/AuthProvider';
import { DriveProvider, DriveProviderType } from '../interfaces/DriveProvider';
import { KnowledgeProvider, KnowledgeProviderType } from '../interfaces/KnowledgeProvider';

export type ProviderType = 'ai' | 'auth' | 'drive' | 'knowledge';

export interface ProviderRegistration<T extends BaseProvider> {
  provider: T;
  type: ProviderType;
  subtype: string;
  isDefault: boolean;
  fallbackOrder: number;
}

export interface ProviderSelectionOptions {
  preferredProvider?: string;
  excludeProviders?: string[];
  requireHealthy?: boolean;
  fallbackEnabled?: boolean;
}

export interface RegistryMetrics {
  totalProviders: number;
  healthyProviders: number;
  unhealthyProviders: number;
  providersByType: Record<ProviderType, number>;
  lastHealthCheck: Date;
}

export class ProviderRegistry {
  private providers: Map<string, ProviderRegistration<BaseProvider>> = new Map();
  private providersByType: Map<ProviderType, Map<string, ProviderRegistration<BaseProvider>>> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private healthCheckIntervalMs: number = 60000; // 1 minute

  constructor() {
    // Initialize type maps
    this.providersByType.set('ai', new Map());
    this.providersByType.set('auth', new Map());
    this.providersByType.set('drive', new Map());
    this.providersByType.set('knowledge', new Map());
  }

  /**
   * Register an AI provider
   */
  registerAIProvider(
    name: string,
    provider: AIProvider,
    subtype: AIProviderType,
    isDefault: boolean = false,
    fallbackOrder: number = 0
  ): void {
    this.registerProvider(name, provider, 'ai', subtype, isDefault, fallbackOrder);
  }

  /**
   * Register an Auth provider
   */
  registerAuthProvider(
    name: string,
    provider: AuthProvider,
    subtype: AuthProviderType,
    isDefault: boolean = false,
    fallbackOrder: number = 0
  ): void {
    this.registerProvider(name, provider, 'auth', subtype, isDefault, fallbackOrder);
  }

  /**
   * Register a Drive provider
   */
  registerDriveProvider(
    name: string,
    provider: DriveProvider,
    subtype: DriveProviderType,
    isDefault: boolean = false,
    fallbackOrder: number = 0
  ): void {
    this.registerProvider(name, provider, 'drive', subtype, isDefault, fallbackOrder);
  }

  /**
   * Register a Knowledge provider
   */
  registerKnowledgeProvider(
    name: string,
    provider: KnowledgeProvider,
    subtype: KnowledgeProviderType,
    isDefault: boolean = false,
    fallbackOrder: number = 0
  ): void {
    this.registerProvider(name, provider, 'knowledge', subtype, isDefault, fallbackOrder);
  }

  /**
   * Generic provider registration
   */
  private registerProvider<T extends BaseProvider>(
    name: string,
    provider: T,
    type: ProviderType,
    subtype: string,
    isDefault: boolean = false,
    fallbackOrder: number = 0
  ): void {
    if (this.providers.has(name)) {
      console.warn(`Provider ${name} is already registered. Overwriting.`);
    }

    const registration: ProviderRegistration<BaseProvider> = {
      provider: provider as BaseProvider,
      type,
      subtype,
      isDefault,
      fallbackOrder
    };

    this.providers.set(name, registration);
    this.providersByType.get(type)?.set(name, registration);

    console.log(`Registered ${type} provider: ${name} (${subtype})`);
  }

  /**
   * Get AI provider with fallback support
   */
  getAIProvider(options?: ProviderSelectionOptions): AIProvider | null {
    const provider = this.getProvider('ai', options);
    return provider as AIProvider | null;
  }

  /**
   * Get Auth provider with fallback support
   */
  getAuthProvider(options?: ProviderSelectionOptions): AuthProvider | null {
    const provider = this.getProvider('auth', options);
    return provider as AuthProvider | null;
  }

  /**
   * Get Drive provider with fallback support
   */
  getDriveProvider(options?: ProviderSelectionOptions): DriveProvider | null {
    const provider = this.getProvider('drive', options);
    return provider as DriveProvider | null;
  }

  /**
   * Get Knowledge provider with fallback support
   */
  getKnowledgeProvider(options?: ProviderSelectionOptions): KnowledgeProvider | null {
    const provider = this.getProvider('knowledge', options);
    return provider as KnowledgeProvider | null;
  }

  /**
   * Get provider by name
   */
  getProviderByName(name: string): BaseProvider | null {
    const registration = this.providers.get(name);
    return registration?.provider || null;
  }

  /**
   * Generic provider selection with fallback logic
   */
  private getProvider(
    type: ProviderType,
    options?: ProviderSelectionOptions
  ): BaseProvider | null {
    const typeProviders = this.providersByType.get(type);
    if (!typeProviders || typeProviders.size === 0) {
      console.warn(`No providers registered for type: ${type}`);
      return null;
    }

    // Convert to array and sort by priority
    const providers = Array.from(typeProviders.values())
      .filter(reg => reg.provider.isEnabled())
      .filter(reg => !options?.excludeProviders?.includes(reg.provider.getName()))
      .sort((a, b) => {
        // Primary sort: preferred provider first
        if (options?.preferredProvider) {
          if (a.provider.getName() === options.preferredProvider) return -1;
          if (b.provider.getName() === options.preferredProvider) return 1;
        }
        
        // Secondary sort: default providers first
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        
        // Tertiary sort: by priority (higher first)
        if (a.provider.getPriority() !== b.provider.getPriority()) {
          return b.provider.getPriority() - a.provider.getPriority();
        }
        
        // Quaternary sort: by fallback order (lower first)
        return a.fallbackOrder - b.fallbackOrder;
      });

    if (providers.length === 0) {
      console.warn(`No enabled providers available for type: ${type}`);
      return null;
    }

    // If health check is required, filter by healthy providers
    if (options?.requireHealthy) {
      const healthyProviders = providers.filter(reg => 
        reg.provider.getHealthStatus().isHealthy && 
        !reg.provider.isCircuitBreakerOpen()
      );
      
      if (healthyProviders.length > 0) {
        return healthyProviders[0].provider;
      } else if (!options.fallbackEnabled) {
        console.warn(`No healthy providers available for type: ${type}`);
        return null;
      }
      // Fall through to use any available provider if fallback is enabled
    }

    return providers[0].provider;
  }

  /**
   * Get all providers of a specific type
   */
  getProvidersByType(type: ProviderType): BaseProvider[] {
    const typeProviders = this.providersByType.get(type);
    if (!typeProviders) return [];
    
    return Array.from(typeProviders.values())
      .map(reg => reg.provider)
      .filter(provider => provider.isEnabled());
  }

  /**
   * Get fallback providers for a specific type
   */
  getFallbackProviders(
    type: ProviderType,
    excludeProvider?: string
  ): BaseProvider[] {
    const providers = this.getProvidersByType(type);
    
    return providers
      .filter(provider => provider.getName() !== excludeProvider)
      .filter(provider => provider.getHealthStatus().isHealthy)
      .sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(name: string): boolean {
    const registration = this.providers.get(name);
    if (!registration) {
      return false;
    }

    this.providers.delete(name);
    this.providersByType.get(registration.type)?.delete(name);
    
    console.log(`Unregistered provider: ${name}`);
    return true;
  }

  /**
   * Get registry metrics
   */
  getMetrics(): RegistryMetrics {
    const totalProviders = this.providers.size;
    let healthyProviders = 0;
    const providersByType: Record<ProviderType, number> = {
      ai: 0,
      auth: 0,
      drive: 0,
      knowledge: 0
    };

    for (const registration of this.providers.values()) {
      if (registration.provider.getHealthStatus().isHealthy) {
        healthyProviders++;
      }
      providersByType[registration.type]++;
    }

    return {
      totalProviders,
      healthyProviders,
      unhealthyProviders: totalProviders - healthyProviders,
      providersByType,
      lastHealthCheck: new Date()
    };
  }

  /**
   * Get health status of all providers
   */
  getHealthStatus(): Record<string, ProviderHealthStatus> {
    const status: Record<string, ProviderHealthStatus> = {};
    
    for (const [name, registration] of this.providers.entries()) {
      status[name] = registration.provider.getHealthStatus();
    }
    
    return status;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(intervalMs?: number): void {
    if (this.healthCheckInterval) {
      this.stopHealthChecks();
    }

    this.healthCheckIntervalMs = intervalMs || this.healthCheckIntervalMs;
    
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckIntervalMs);

    console.log(`Started provider health checks (interval: ${this.healthCheckIntervalMs}ms)`);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      console.log('Stopped provider health checks');
    }
  }

  /**
   * Perform health checks on all providers
   */
  async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.providers.values()).map(
      async (registration) => {
        try {
          await registration.provider.performHealthCheck();
        } catch (error) {
          console.warn(
            `Health check failed for provider ${registration.provider.getName()}:`,
            error
          );
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.stopHealthChecks();
    this.providers.clear();
    for (const typeMap of this.providersByType.values()) {
      typeMap.clear();
    }
    console.log('Cleared all providers from registry');
  }

  /**
   * Get list of all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get provider registration info
   */
  getProviderInfo(name: string): ProviderRegistration<BaseProvider> | null {
    return this.providers.get(name) || null;
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();