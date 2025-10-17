/**
 * Configuration Validator
 * Validates API provider configurations before service initialization
 */

import { logger } from '../../logging';
import { config } from '../../config';

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  missingOptional: string[];
  securityIssues: string[];
  recommendations: string[];
  providerStatus: {
    ai: { configured: number; total: number; providers: string[] };
    auth: { configured: number; total: number; providers: string[] };
    drive: { configured: number; total: number; providers: string[] };
    knowledge: { configured: number; total: number; providers: string[] };
  };
}

export interface ValidationOptions {
  environment?: 'development' | 'staging' | 'production';
  requireAllProviders?: boolean;
  strictSecurity?: boolean;
  validateApiKeys?: boolean;
  checkNetworkAccess?: boolean;
}

export class ConfigurationValidator {
  private static instance: ConfigurationValidator;
  private validationLogger = logger.child({ component: 'ConfigurationValidator' });

  private constructor() {}

  static getInstance(): ConfigurationValidator {
    if (!ConfigurationValidator.instance) {
      ConfigurationValidator.instance = new ConfigurationValidator();
    }
    return ConfigurationValidator.instance;
  }

  /**
   * Validate all provider configurations
   */
  async validateConfiguration(options: ValidationOptions = {}): Promise<ConfigurationValidationResult> {
    this.validationLogger.info('Starting configuration validation');

    const errors: string[] = [];
    const warnings: string[] = [];
    const missingRequired: string[] = [];
    const missingOptional: string[] = [];
    const securityIssues: string[] = [];
    const recommendations: string[] = [];

    // Validate core configuration
    this.validateCoreConfiguration(errors, warnings, missingRequired, options);

    // Validate AI providers
    const aiStatus = this.validateAIProviders(errors, warnings, missingRequired, missingOptional, options);

    // Validate Auth providers
    const authStatus = this.validateAuthProviders(errors, warnings, missingRequired, missingOptional, options);

    // Validate Drive providers
    const driveStatus = this.validateDriveProviders(errors, warnings, missingRequired, missingOptional, options);

    // Validate Knowledge providers
    const knowledgeStatus = this.validateKnowledgeProviders(errors, warnings, missingRequired, missingOptional, options);

    // Validate security configuration
    this.validateSecurityConfiguration(securityIssues, warnings, recommendations, options);

    // Generate recommendations
    this.generateConfigurationRecommendations(
      { ai: aiStatus, auth: authStatus, drive: driveStatus, knowledge: knowledgeStatus },
      recommendations,
      options
    );

    const result: ConfigurationValidationResult = {
      isValid: errors.length === 0 && missingRequired.length === 0,
      errors,
      warnings,
      missingRequired,
      missingOptional,
      securityIssues,
      recommendations,
      providerStatus: {
        ai: aiStatus,
        auth: authStatus,
        drive: driveStatus,
        knowledge: knowledgeStatus
      }
    };

    this.validationLogger.info('Configuration validation completed', {
      isValid: result.isValid,
      errors: errors.length,
      warnings: warnings.length,
      missingRequired: missingRequired.length,
      securityIssues: securityIssues.length
    });

    return result;
  }

  /**
   * Validate core application configuration
   */
  private validateCoreConfiguration(
    errors: string[],
    warnings: string[],
    missingRequired: string[],
    options: ValidationOptions
  ): void {
    // Database configuration (always required)
    if (!config.database.url) {
      missingRequired.push('VITE_SUPABASE_URL - Database URL is required');
    } else if (!this.isValidUrl(config.database.url)) {
      errors.push('VITE_SUPABASE_URL - Invalid database URL format');
    }

    if (!config.database.anonKey) {
      missingRequired.push('VITE_SUPABASE_ANON_KEY - Database anonymous key is required');
    } else if (config.database.anonKey.length < 32) {
      warnings.push('VITE_SUPABASE_ANON_KEY - Database key appears to be too short');
    }

    // Production-specific requirements
    const env = options.environment || config.app.environment;
    if (env === 'production') {
      if (!config.database.serviceKey) {
        missingRequired.push('SUPABASE_SERVICE_KEY - Service key is required in production');
      }
      if (!config.security.jwt.secret) {
        missingRequired.push('JWT_SECRET - JWT secret is required in production');
      }
    }

    // App configuration
    if (!config.app.url || !this.isValidUrl(config.app.url)) {
      warnings.push('VITE_APP_URL - Invalid or missing application URL');
    }
  }

  /**
   * Validate AI provider configurations
   */
  private validateAIProviders(
    errors: string[],
    warnings: string[],
    missingRequired: string[],
    missingOptional: string[],
    options: ValidationOptions
  ): { configured: number; total: number; providers: string[] } {
    const providers: string[] = [];
    let configured = 0;
    const total = 3; // OpenAI, Anthropic, HalluciFix

    // OpenAI validation
    if (config.ai.openai.apiKey) {
      if (this.validateApiKeyFormat(config.ai.openai.apiKey, 'sk-')) {
        providers.push('openai');
        configured++;
      } else {
        errors.push('VITE_OPENAI_API_KEY - Invalid OpenAI API key format');
      }

      // Validate model
      if (!config.ai.openai.model) {
        warnings.push('VITE_OPENAI_MODEL - No model specified, using default');
      }

      // Validate numeric parameters
      if (config.ai.openai.maxTokens && (config.ai.openai.maxTokens < 1 || config.ai.openai.maxTokens > 32000)) {
        warnings.push('VITE_OPENAI_MAX_TOKENS - Max tokens should be between 1 and 32000');
      }

      if (config.ai.openai.temperature && (config.ai.openai.temperature < 0 || config.ai.openai.temperature > 2)) {
        warnings.push('VITE_OPENAI_TEMPERATURE - Temperature should be between 0 and 2');
      }
    } else {
      missingOptional.push('VITE_OPENAI_API_KEY - OpenAI API key not configured');
    }

    // Anthropic validation
    if (config.ai.anthropic.apiKey) {
      if (this.validateApiKeyFormat(config.ai.anthropic.apiKey, 'sk-ant-')) {
        providers.push('anthropic');
        configured++;
      } else {
        errors.push('VITE_ANTHROPIC_API_KEY - Invalid Anthropic API key format');
      }
    } else {
      missingOptional.push('VITE_ANTHROPIC_API_KEY - Anthropic API key not configured');
    }

    // HalluciFix validation
    if (config.ai.hallucifix?.apiKey) {
      if (config.ai.hallucifix.apiKey.length >= 32) {
        providers.push('hallucifix');
        configured++;
      } else {
        errors.push('VITE_HALLUCIFIX_API_KEY - Invalid HalluciFix API key format');
      }

      if (config.ai.hallucifix.apiUrl && !this.isValidUrl(config.ai.hallucifix.apiUrl)) {
        errors.push('VITE_HALLUCIFIX_API_URL - Invalid HalluciFix API URL');
      }
    } else {
      missingOptional.push('VITE_HALLUCIFIX_API_KEY - HalluciFix API key not configured');
    }

    // Check if at least one AI provider is configured when mock services are disabled
    if (!config.features.enableMockServices && configured === 0) {
      missingRequired.push('At least one AI provider must be configured when mock services are disabled');
    }

    return { configured, total, providers };
  }

  /**
   * Validate Auth provider configurations
   */
  private validateAuthProviders(
    errors: string[],
    warnings: string[],
    missingRequired: string[],
    missingOptional: string[],
    options: ValidationOptions
  ): { configured: number; total: number; providers: string[] } {
    const providers: string[] = [];
    let configured = 0;
    const total = 1; // Currently only Google OAuth

    // Google OAuth validation
    if (config.auth.google.clientId) {
      if (this.validateGoogleClientId(config.auth.google.clientId)) {
        providers.push('google');
        configured++;

        // Client secret validation (server-side only)
        if (typeof window === 'undefined') {
          if (!config.auth.google.clientSecret) {
            missingRequired.push('GOOGLE_CLIENT_SECRET - Required for server-side OAuth');
          } else if (!this.validateGoogleClientSecret(config.auth.google.clientSecret)) {
            errors.push('GOOGLE_CLIENT_SECRET - Invalid Google client secret format');
          }
        }

        // Redirect URI validation
        if (config.auth.google.redirectUri && !this.isValidUrl(config.auth.google.redirectUri)) {
          errors.push('VITE_GOOGLE_REDIRECT_URI - Invalid redirect URI format');
        }

        // Scopes validation
        if (!config.auth.google.scopes || config.auth.google.scopes.length === 0) {
          warnings.push('GOOGLE_OAUTH_SCOPES - No OAuth scopes configured, using defaults');
        }
      } else {
        errors.push('VITE_GOOGLE_CLIENT_ID - Invalid Google client ID format');
      }
    } else {
      missingOptional.push('VITE_GOOGLE_CLIENT_ID - Google OAuth client ID not configured');
    }

    // Check if auth is required when mock services are disabled
    if (!config.features.enableMockServices && configured === 0) {
      warnings.push('No authentication providers configured, users will not be able to log in');
    }

    return { configured, total, providers };
  }

  /**
   * Validate Drive provider configurations
   */
  private validateDriveProviders(
    errors: string[],
    warnings: string[],
    missingRequired: string[],
    missingOptional: string[],
    options: ValidationOptions
  ): { configured: number; total: number; providers: string[] } {
    const providers: string[] = [];
    let configured = 0;
    const total = 1; // Currently only Google Drive

    // Google Drive depends on Google OAuth
    if (config.auth.google.enabled && config.auth.google.clientId) {
      providers.push('google-drive');
      configured++;
    } else {
      missingOptional.push('Google Drive requires Google OAuth configuration');
    }

    return { configured, total, providers };
  }

  /**
   * Validate Knowledge provider configurations
   */
  private validateKnowledgeProviders(
    errors: string[],
    warnings: string[],
    missingRequired: string[],
    missingOptional: string[],
    options: ValidationOptions
  ): { configured: number; total: number; providers: string[] } {
    const providers: string[] = [];
    let configured = 0;
    const total = 4; // Wikipedia, arXiv, PubMed, News APIs

    // Knowledge providers don't require API keys for basic functionality
    // They are always considered "configured" unless explicitly disabled
    providers.push('wikipedia', 'arxiv', 'pubmed', 'news');
    configured = 4;

    return { configured, total, providers };
  }

  /**
   * Validate security configuration
   */
  private validateSecurityConfiguration(
    securityIssues: string[],
    warnings: string[],
    recommendations: string[],
    options: ValidationOptions
  ): void {
    const env = options.environment || config.app.environment;
    const strictSecurity = options.strictSecurity || env === 'production';

    // OAuth security
    if (!config.security.oauth.tokenEncryptionKey) {
      if (strictSecurity) {
        securityIssues.push('OAUTH_TOKEN_ENCRYPTION_KEY - Token encryption key is required for secure OAuth');
      } else {
        warnings.push('OAUTH_TOKEN_ENCRYPTION_KEY - Token encryption key not configured');
      }
    } else if (config.security.oauth.tokenEncryptionKey.length < 32) {
      securityIssues.push('OAUTH_TOKEN_ENCRYPTION_KEY - Encryption key should be at least 32 characters');
    }

    if (!config.security.oauth.stateSecret) {
      if (strictSecurity) {
        securityIssues.push('OAUTH_STATE_SECRET - State secret is required for CSRF protection');
      } else {
        warnings.push('OAUTH_STATE_SECRET - State secret not configured');
      }
    }

    if (!config.security.oauth.sessionSecret) {
      if (strictSecurity) {
        securityIssues.push('OAUTH_SESSION_SECRET - Session secret is required for secure sessions');
      } else {
        warnings.push('OAUTH_SESSION_SECRET - Session secret not configured');
      }
    }

    // JWT security
    if (!config.security.jwt.secret) {
      if (strictSecurity) {
        securityIssues.push('JWT_SECRET - JWT secret is required for token security');
      } else {
        warnings.push('JWT_SECRET - JWT secret not configured');
      }
    } else if (config.security.jwt.secret.length < 32) {
      securityIssues.push('JWT_SECRET - JWT secret should be at least 32 characters');
    }

    // Production-specific security checks
    if (env === 'production') {
      if (config.features.enableMockServices) {
        securityIssues.push('Mock services should not be enabled in production');
      }

      if (config.features.enableBetaFeatures) {
        warnings.push('Beta features are enabled in production');
      }

      if (!config.monitoring.sentry?.enabled) {
        recommendations.push('Enable error monitoring (Sentry) for production');
      }
    }
  }

  /**
   * Generate configuration recommendations
   */
  private generateConfigurationRecommendations(
    providerStatus: ConfigurationValidationResult['providerStatus'],
    recommendations: string[],
    options: ValidationOptions
  ): void {
    // AI provider recommendations
    if (providerStatus.ai.configured === 0) {
      recommendations.push('Configure at least one AI provider (OpenAI or Anthropic) for content analysis');
    } else if (providerStatus.ai.configured === 1) {
      recommendations.push('Configure multiple AI providers for redundancy and fallback support');
    }

    // Auth provider recommendations
    if (providerStatus.auth.configured === 0) {
      recommendations.push('Configure Google OAuth for user authentication');
    }

    // Monitoring recommendations
    const env = options.environment || config.app.environment;
    if (env !== 'development') {
      if (!config.monitoring.sentry?.enabled) {
        recommendations.push('Configure Sentry for error monitoring and debugging');
      }
      if (!config.monitoring.analytics?.enabled) {
        recommendations.push('Configure analytics for usage insights and optimization');
      }
    }

    // Performance recommendations
    if (!config.database.enableReadReplicas && env === 'production') {
      recommendations.push('Consider enabling read replicas for better database performance');
    }

    // Security recommendations
    if (env === 'production') {
      recommendations.push('Regularly rotate API keys and secrets');
      recommendations.push('Monitor API usage and set up alerts for unusual activity');
      recommendations.push('Enable rate limiting and DDoS protection');
    }
  }

  /**
   * Validate API key format
   */
  private validateApiKeyFormat(apiKey: string, prefix?: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') return false;
    if (apiKey.length < 20) return false;
    if (prefix && !apiKey.startsWith(prefix)) return false;
    return true;
  }

  /**
   * Validate Google Client ID format
   */
  private validateGoogleClientId(clientId: string): boolean {
    if (!clientId || typeof clientId !== 'string') return false;
    // Google Client IDs end with .googleusercontent.com
    return clientId.endsWith('.googleusercontent.com') && clientId.length > 50;
  }

  /**
   * Validate Google Client Secret format
   */
  private validateGoogleClientSecret(clientSecret: string): boolean {
    if (!clientSecret || typeof clientSecret !== 'string') return false;
    // Google Client Secrets are typically 24 characters
    return clientSecret.length >= 20 && clientSecret.length <= 50;
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configuration summary
   */
  getConfigurationSummary(): {
    environment: string;
    mockServicesEnabled: boolean;
    configuredProviders: {
      ai: string[];
      auth: string[];
      drive: string[];
      knowledge: string[];
    };
    securityFeatures: {
      jwtConfigured: boolean;
      oauthSecurityConfigured: boolean;
      encryptionConfigured: boolean;
    };
    monitoringEnabled: {
      sentry: boolean;
      analytics: boolean;
      datadog: boolean;
    };
  } {
    return {
      environment: config.app.environment,
      mockServicesEnabled: config.features.enableMockServices,
      configuredProviders: {
        ai: [
          config.ai.openai.enabled ? 'openai' : null,
          config.ai.anthropic.enabled ? 'anthropic' : null,
          config.ai.hallucifix?.enabled ? 'hallucifix' : null
        ].filter(Boolean) as string[],
        auth: [
          config.auth.google.enabled ? 'google' : null
        ].filter(Boolean) as string[],
        drive: [
          config.auth.google.enabled ? 'google-drive' : null
        ].filter(Boolean) as string[],
        knowledge: ['wikipedia', 'arxiv', 'pubmed', 'news']
      },
      securityFeatures: {
        jwtConfigured: !!config.security.jwt.secret,
        oauthSecurityConfigured: !!(
          config.security.oauth.tokenEncryptionKey &&
          config.security.oauth.stateSecret &&
          config.security.oauth.sessionSecret
        ),
        encryptionConfigured: !!config.security.oauth.tokenEncryptionKey
      },
      monitoringEnabled: {
        sentry: config.monitoring.sentry?.enabled || false,
        analytics: config.monitoring.analytics?.enabled || false,
        datadog: config.monitoring.datadog?.enabled || false
      }
    };
  }
}

// Export singleton instance
export const configurationValidator = ConfigurationValidator.getInstance();