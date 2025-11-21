/**
 * Provider Configuration Manager
 * Handles loading, validation, and management of provider configurations
 */

import { config } from '../../config';
import { AIProviderConfig } from '../interfaces/AIProvider';
import { AuthProviderConfig } from '../interfaces/AuthProvider';
import { DriveProviderConfig } from '../interfaces/DriveProvider';
import { KnowledgeProviderConfig } from '../interfaces/KnowledgeProvider';

import { logger } from './logging';
export interface ProviderConfigurations {
  ai: {
    openai?: AIProviderConfig;
    anthropic?: AIProviderConfig;
    hallucifix?: AIProviderConfig;
  };
  auth: {
    google?: AuthProviderConfig;
  };
  drive: {
    google?: DriveProviderConfig;
  };
  knowledge: {
    wikipedia?: KnowledgeProviderConfig;
    arxiv?: KnowledgeProviderConfig;
    pubmed?: KnowledgeProviderConfig;
    news?: KnowledgeProviderConfig;
  };
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingOptional: string[];
}

export class ProviderConfigManager {
  private configurations: ProviderConfigurations;
  private validationCache: Map<string, ConfigValidationResult> = new Map();

  constructor() {
    this.configurations = {
      ai: {},
      auth: {},
      drive: {},
      knowledge: {}
    };
  }

  /**
   * Load all provider configurations from environment
   */
  async loadConfigurations(): Promise<ProviderConfigurations> {
    try {
      await this.loadAIConfigurations();
      await this.loadAuthConfigurations();
      await this.loadDriveConfigurations();
      await this.loadKnowledgeConfigurations();
      
      logger.debug("✅ Provider configurations loaded successfully");
      return this.configurations;
    } catch (error) {
      logger.error("❌ Failed to load provider configurations:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Load AI provider configurations
   */
  private async loadAIConfigurations(): Promise<void> {
    const aiConfig = await config.getAi();

    // OpenAI Configuration
    if (aiConfig.openai?.apiKey) {
      this.configurations.ai.openai = {
        name: 'openai',
        enabled: true,
        priority: 100,
        apiKey: aiConfig.openai.apiKey,
        model: aiConfig.openai.model,
        maxTokens: aiConfig.openai.maxTokens,
        temperature: aiConfig.openai.temperature,
        baseUrl: 'https://api.openai.com/v1',
        rateLimits: {
          requestsPerMinute: 3000,
          requestsPerDay: 200000
        },
        timeout: 30000,
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        }
      };
    }

    // Anthropic Configuration
    if (aiConfig.anthropic?.apiKey) {
      this.configurations.ai.anthropic = {
        name: 'anthropic',
        enabled: true,
        priority: 90,
        apiKey: aiConfig.anthropic.apiKey,
        model: aiConfig.anthropic.model,
        maxTokens: aiConfig.anthropic.maxTokens,
        temperature: aiConfig.anthropic.temperature || 0.1,
        baseUrl: 'https://api.anthropic.com',
        rateLimits: {
          requestsPerMinute: 1000,
          requestsPerDay: 50000
        },
        timeout: 30000,
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        }
      };
    }

    // HalluciFix Configuration
    if (aiConfig.hallucifix?.apiKey) {
      this.configurations.ai.hallucifix = {
        name: 'hallucifix',
        enabled: true,
        priority: 110,
        apiKey: aiConfig.hallucifix.apiKey,
        model: 'hallucifix-v1',
        maxTokens: 4000,
        temperature: 0.1,
        baseUrl: aiConfig.hallucifix.apiUrl,
        rateLimits: {
          requestsPerMinute: 100,
          requestsPerDay: 10000
        },
        timeout: 30000,
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        }
      };
    }
  }

  /**
   * Load Auth provider configurations
   */
  private async loadAuthConfigurations(): Promise<void> {
    const authConfig = await config.getAuth();

    // Google OAuth Configuration
    if (authConfig.google?.clientId) {
      this.configurations.auth.google = {
        name: 'google',
        enabled: true,
        priority: 100,
        clientId: authConfig.google.clientId,
        clientSecret: authConfig.google.clientSecret,
        redirectUri: authConfig.google.redirectUri,
        scopes: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/drive.readonly'
        ],
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        rateLimits: {
          requestsPerMinute: 100,
          requestsPerHour: 1000
        },
        timeout: 10000,
        retryConfig: {
          maxRetries: 2,
          baseDelay: 1000,
          maxDelay: 5000,
          backoffMultiplier: 2
        }
      };
    }
  }

  /**
   * Load Drive provider configurations
   */
  private async loadDriveConfigurations(): Promise<void> {
    const authConfig = await config.getAuth();

    // Google Drive Configuration (uses same OAuth as auth)
    if (authConfig.google?.clientId) {
      this.configurations.drive.google = {
        name: 'google-drive',
        enabled: true,
        priority: 100,
        accessToken: '', // Will be set dynamically after auth
        refreshToken: '', // Will be set dynamically after auth
        clientId: authConfig.google.clientId,
        clientSecret: authConfig.google.clientSecret,
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.file'
        ],
        apiUrl: 'https://www.googleapis.com/drive/v3',
        rateLimits: {
          requestsPerMinute: 1000,
          requestsPerDay: 1000000
        },
        timeout: 30000,
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        }
      };
    }
  }

  /**
   * Load Knowledge provider configurations
   */
  private async loadKnowledgeConfigurations(): Promise<void> {
    // Wikipedia Configuration (no API key required)
    this.configurations.knowledge.wikipedia = {
      name: 'wikipedia',
      enabled: true,
      priority: 80,
      baseUrl: 'https://en.wikipedia.org/api/rest_v1',
      defaultLanguage: 'en',
      cacheTTL: 3600000, // 1 hour
      maxConcurrentRequests: 10,
      reliabilityThreshold: 0.8,
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerHour: 5000
      },
      timeout: 10000,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      }
    };

    // arXiv Configuration (no API key required)
    this.configurations.knowledge.arxiv = {
      name: 'arxiv',
      enabled: true,
      priority: 90,
      baseUrl: 'http://export.arxiv.org/api',
      defaultLanguage: 'en',
      cacheTTL: 7200000, // 2 hours
      maxConcurrentRequests: 5,
      reliabilityThreshold: 0.9,
      rateLimits: {
        requestsPerMinute: 30,
        requestsPerHour: 1000
      },
      timeout: 15000,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 2000,
        maxDelay: 15000,
        backoffMultiplier: 2
      }
    };

    // PubMed Configuration (no API key required, but rate limited)
    this.configurations.knowledge.pubmed = {
      name: 'pubmed',
      enabled: true,
      priority: 95,
      baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
      defaultLanguage: 'en',
      cacheTTL: 7200000, // 2 hours
      maxConcurrentRequests: 3,
      reliabilityThreshold: 0.95,
      rateLimits: {
        requestsPerMinute: 10,
        requestsPerHour: 100
      },
      timeout: 20000,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 3000,
        maxDelay: 20000,
        backoffMultiplier: 2
      }
    };

    // News API Configuration (would require API key for production)
    this.configurations.knowledge.news = {
      name: 'news-api',
      enabled: false, // Disabled by default until API key is provided
      priority: 70,
      baseUrl: 'https://newsapi.org/v2',
      defaultLanguage: 'en',
      cacheTTL: 1800000, // 30 minutes
      maxConcurrentRequests: 5,
      reliabilityThreshold: 0.7,
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerDay: 1000
      },
      timeout: 10000,
      retryConfig: {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      }
    };
  }

  /**
   * Validate all configurations
   */
  validateConfigurations(): ConfigValidationResult {
    const cacheKey = 'all-configurations';
    const cached = this.validationCache.get(cacheKey);
    if (cached) return cached;

    const result: ConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      missingOptional: []
    };

    // Validate AI configurations
    this.validateAIConfigurations(result);
    
    // Validate Auth configurations
    this.validateAuthConfigurations(result);
    
    // Validate Drive configurations
    this.validateDriveConfigurations(result);
    
    // Validate Knowledge configurations
    this.validateKnowledgeConfigurations(result);

    // Cache result for 5 minutes
    this.validationCache.set(cacheKey, result);
    setTimeout(() => this.validationCache.delete(cacheKey), 300000);

    return result;
  }

  /**
   * Validate AI configurations
   */
  private validateAIConfigurations(result: ConfigValidationResult): void {
    const aiConfigs = this.configurations.ai;
    let hasAnyAI = false;

    // Check OpenAI
    if (aiConfigs.openai) {
      hasAnyAI = true;
      if (!aiConfigs.openai.apiKey || !aiConfigs.openai.apiKey.startsWith('sk-')) {
        result.errors.push('OpenAI API key is invalid or missing');
        result.isValid = false;
      }
    }

    // Check Anthropic
    if (aiConfigs.anthropic) {
      hasAnyAI = true;
      if (!aiConfigs.anthropic.apiKey) {
        result.errors.push('Anthropic API key is missing');
        result.isValid = false;
      }
    }

    // Check HalluciFix
    if (aiConfigs.hallucifix) {
      hasAnyAI = true;
      if (!aiConfigs.hallucifix.apiKey) {
        result.errors.push('HalluciFix API key is missing');
        result.isValid = false;
      }
    }

    if (!hasAnyAI) {
      result.warnings.push('No AI providers configured - will use mock analysis');
    }
  }

  /**
   * Validate Auth configurations
   */
  private validateAuthConfigurations(result: ConfigValidationResult): void {
    const authConfigs = this.configurations.auth;

    if (authConfigs.google) {
      if (!authConfigs.google.clientId) {
        result.errors.push('Google OAuth client ID is missing');
        result.isValid = false;
      }
      if (!authConfigs.google.clientSecret) {
        result.warnings.push('Google OAuth client secret is missing (required for server-side auth)');
      }
      if (!authConfigs.google.redirectUri) {
        result.errors.push('Google OAuth redirect URI is missing');
        result.isValid = false;
      }
    } else {
      result.warnings.push('No OAuth providers configured - will use mock authentication');
    }
  }

  /**
   * Validate Drive configurations
   */
  private validateDriveConfigurations(result: ConfigValidationResult): void {
    const driveConfigs = this.configurations.drive;

    if (!driveConfigs.google) {
      result.warnings.push('No Drive providers configured - will use mock file operations');
    }
  }

  /**
   * Validate Knowledge configurations
   */
  private validateKnowledgeConfigurations(result: ConfigValidationResult): void {
    const knowledgeConfigs = this.configurations.knowledge;
    const enabledProviders = Object.values(knowledgeConfigs).filter(config => config?.enabled);

    if (enabledProviders.length === 0) {
      result.warnings.push('No knowledge providers enabled - will use mock RAG analysis');
    }
  }

  /**
   * Get configuration for a specific provider
   */
  getProviderConfig<T>(
    type: keyof ProviderConfigurations,
    provider: string
  ): T | null {
    const typeConfigs = this.configurations[type] as any;
    return typeConfigs[provider] || null;
  }

  /**
   * Update configuration for a specific provider
   */
  updateProviderConfig<T>(
    type: keyof ProviderConfigurations,
    provider: string,
    config: Partial<T>
  ): void {
    const typeConfigs = this.configurations[type] as any;
    if (typeConfigs[provider]) {
      typeConfigs[provider] = { ...typeConfigs[provider], ...config };
      // Clear validation cache
      this.validationCache.clear();
    }
  }

  /**
   * Get all configurations
   */
  getAllConfigurations(): ProviderConfigurations {
    return { ...this.configurations };
  }

  /**
   * Check if any providers are configured for a type
   */
  hasProvidersConfigured(type: keyof ProviderConfigurations): boolean {
    const typeConfigs = this.configurations[type] as any;
    return Object.values(typeConfigs).some(config => config && (config as any).enabled);
  }

  /**
   * Get enabled providers for a type
   */
  getEnabledProviders(type: keyof ProviderConfigurations): string[] {
    const typeConfigs = this.configurations[type] as any;
    return Object.keys(typeConfigs).filter(key => typeConfigs[key]?.enabled);
  }

  /**
   * Enable/disable a provider
   */
  setProviderEnabled(
    type: keyof ProviderConfigurations,
    provider: string,
    enabled: boolean
  ): boolean {
    const typeConfigs = this.configurations[type] as any;
    if (typeConfigs[provider]) {
      typeConfigs[provider].enabled = enabled;
      this.validationCache.clear();
      return true;
    }
    return false;
  }

  /**
   * Get configuration summary for logging
   */
  getConfigurationSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    // AI providers
    summary.ai = Object.keys(this.configurations.ai)
      .filter(key => this.configurations.ai[key as keyof typeof this.configurations.ai]?.enabled)
      .map(key => ({
        name: key,
        model: this.configurations.ai[key as keyof typeof this.configurations.ai]?.model,
        hasApiKey: !!this.configurations.ai[key as keyof typeof this.configurations.ai]?.apiKey
      }));

    // Auth providers
    summary.auth = Object.keys(this.configurations.auth)
      .filter(key => this.configurations.auth[key as keyof typeof this.configurations.auth]?.enabled)
      .map(key => ({
        name: key,
        hasClientId: !!this.configurations.auth[key as keyof typeof this.configurations.auth]?.clientId,
        hasClientSecret: !!this.configurations.auth[key as keyof typeof this.configurations.auth]?.clientSecret
      }));

    // Drive providers
    summary.drive = Object.keys(this.configurations.drive)
      .filter(key => this.configurations.drive[key as keyof typeof this.configurations.drive]?.enabled)
      .map(key => ({ name: key }));

    // Knowledge providers
    summary.knowledge = Object.keys(this.configurations.knowledge)
      .filter(key => this.configurations.knowledge[key as keyof typeof this.configurations.knowledge]?.enabled)
      .map(key => ({
        name: key,
        reliability: this.configurations.knowledge[key as keyof typeof this.configurations.knowledge]?.reliabilityThreshold
      }));

    return summary;
  }
}

// Export singleton instance
export const providerConfigManager = new ProviderConfigManager();