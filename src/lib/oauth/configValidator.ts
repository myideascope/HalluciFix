/**
 * OAuth Configuration Validator
 * Validates OAuth configuration for security and compliance requirements
 */

import { config } from '../env';
import { OAuthServiceConfig } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export interface SecurityValidationResult extends ValidationResult {
  securityLevel: 'high' | 'medium' | 'low' | 'critical';
  complianceIssues: string[];
}

export class OAuthConfigValidator {
  /**
   * Validate complete OAuth configuration
   */
  static validateConfiguration(oauthConfig?: OAuthServiceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Validate Google OAuth configuration
    const googleValidation = this.validateGoogleOAuthConfig();
    errors.push(...googleValidation.errors);
    warnings.push(...googleValidation.warnings);
    recommendations.push(...googleValidation.recommendations);

    // Validate security configuration
    const securityValidation = this.validateSecurityConfig();
    errors.push(...securityValidation.errors);
    warnings.push(...securityValidation.warnings);
    recommendations.push(...securityValidation.recommendations);

    // Validate OAuth service configuration if provided
    if (oauthConfig) {
      const serviceValidation = this.validateServiceConfig(oauthConfig);
      errors.push(...serviceValidation.errors);
      warnings.push(...serviceValidation.warnings);
      recommendations.push(...serviceValidation.recommendations);
    }

    // Validate environment-specific requirements
    const envValidation = this.validateEnvironmentRequirements();
    errors.push(...envValidation.errors);
    warnings.push(...envValidation.warnings);
    recommendations.push(...envValidation.recommendations);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      recommendations
    };
  }

  /**
   * Validate Google OAuth configuration
   */
  static validateGoogleOAuthConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check Client ID
    if (!config.oauth.clientId) {
      errors.push('Google Client ID is not configured (VITE_GOOGLE_CLIENT_ID)');
    } else {
      // Validate Client ID format
      if (!config.oauth.clientId.endsWith('.apps.googleusercontent.com')) {
        errors.push('Google Client ID format appears invalid (should end with .apps.googleusercontent.com)');
      }
      if (config.oauth.clientId.length < 50) {
        warnings.push('Google Client ID appears unusually short');
      }
    }

    // Check Client Secret (server-side only)
    if (typeof window === 'undefined') {
      if (!config.oauth.clientSecret) {
        errors.push('Google Client Secret is not configured (GOOGLE_CLIENT_SECRET)');
      } else {
        if (!config.oauth.clientSecret.startsWith('GOCSPX-')) {
          warnings.push('Google Client Secret format appears non-standard');
        }
        if (config.oauth.clientSecret.length < 30) {
          warnings.push('Google Client Secret appears unusually short');
        }
      }
    }

    // Check Redirect URI
    if (!config.oauth.redirectUri) {
      errors.push('OAuth redirect URI is not configured');
    } else {
      try {
        const url = new URL(config.oauth.redirectUri);
        
        // Check protocol
        if (config.isProduction && url.protocol !== 'https:') {
          errors.push('OAuth redirect URI must use HTTPS in production');
        }
        
        // Check path
        if (!url.pathname.includes('/auth/callback')) {
          warnings.push('OAuth redirect URI should typically include /auth/callback path');
        }
        
        // Check for localhost in production
        if (config.isProduction && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
          errors.push('OAuth redirect URI cannot use localhost in production');
        }
      } catch {
        errors.push('OAuth redirect URI is not a valid URL');
      }
    }

    // Check OAuth scopes
    const requiredScopes = ['openid', 'email', 'profile'];
    const configuredScopes = config.oauth.scopes;
    
    if (!configuredScopes || configuredScopes.length === 0) {
      errors.push('No OAuth scopes configured');
    } else {
      const missingScopes = requiredScopes.filter(scope => !configuredScopes.includes(scope));
      if (missingScopes.length > 0) {
        errors.push(`Missing required OAuth scopes: ${missingScopes.join(', ')}`);
      }
      
      // Check for Drive scope if needed
      if (!configuredScopes.includes('https://www.googleapis.com/auth/drive.readonly')) {
        recommendations.push('Consider adding Google Drive readonly scope for file access features');
      }
    }

    return { valid: errors.length === 0, errors, warnings, recommendations };
  }

  /**
   * Validate security configuration
   */
  static validateSecurityConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Skip client-side validation for security secrets
    if (typeof window !== 'undefined') {
      return { valid: true, errors, warnings, recommendations };
    }

    // Check token encryption key
    if (!config.oauth.tokenEncryptionKey) {
      errors.push('OAuth token encryption key is not configured (OAUTH_TOKEN_ENCRYPTION_KEY)');
    } else {
      if (config.oauth.tokenEncryptionKey.length < 32) {
        errors.push('OAuth token encryption key must be at least 32 characters');
      }
      if (config.oauth.tokenEncryptionKey === 'your_32_character_encryption_key_here') {
        errors.push('OAuth token encryption key is using default/example value');
      }
      if (!/^[A-Za-z0-9+/=]+$/.test(config.oauth.tokenEncryptionKey)) {
        warnings.push('OAuth token encryption key should be base64 encoded');
      }
    }

    // Check state secret
    if (!config.oauth.stateSecret) {
      errors.push('OAuth state secret is not configured (OAUTH_STATE_SECRET)');
    } else {
      if (config.oauth.stateSecret.length < 32) {
        errors.push('OAuth state secret must be at least 32 characters');
      }
      if (config.oauth.stateSecret === 'your_oauth_state_secret_key_here') {
        errors.push('OAuth state secret is using default/example value');
      }
    }

    // Check session secret
    if (!config.oauth.sessionSecret) {
      errors.push('OAuth session secret is not configured (OAUTH_SESSION_SECRET)');
    } else {
      if (config.oauth.sessionSecret.length < 32) {
        errors.push('OAuth session secret must be at least 32 characters');
      }
      if (config.oauth.sessionSecret === 'your_session_secret_key_here') {
        errors.push('OAuth session secret is using default/example value');
      }
    }

    // Security recommendations
    if (config.isProduction) {
      recommendations.push('Ensure all OAuth secrets are stored securely and rotated regularly');
      recommendations.push('Consider using environment-specific encryption keys');
      recommendations.push('Implement proper secret management (e.g., AWS Secrets Manager, HashiCorp Vault)');
    }

    return { valid: errors.length === 0, errors, warnings, recommendations };
  }

  /**
   * Validate OAuth service configuration
   */
  static validateServiceConfig(serviceConfig: OAuthServiceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Validate refresh configuration
    if (serviceConfig.refreshConfig) {
      const { checkIntervalMs, refreshBufferMs, maxRetries, retryDelayMs } = serviceConfig.refreshConfig;
      
      if (checkIntervalMs && checkIntervalMs < 60000) {
        warnings.push('Token refresh check interval is very frequent (< 1 minute)');
      }
      
      if (refreshBufferMs && refreshBufferMs < 300000) {
        warnings.push('Token refresh buffer is very short (< 5 minutes)');
      }
      
      if (maxRetries && maxRetries > 10) {
        warnings.push('Maximum retry count is very high (> 10)');
      }
      
      if (retryDelayMs && retryDelayMs < 1000) {
        warnings.push('Retry delay is very short (< 1 second)');
      }
    }

    // Validate cleanup configuration
    if (serviceConfig.cleanupConfig) {
      const { cleanupIntervalMs, expiredTokenGracePeriodMs, batchSize } = serviceConfig.cleanupConfig;
      
      if (cleanupIntervalMs && cleanupIntervalMs < 3600000) {
        warnings.push('Cleanup interval is very frequent (< 1 hour)');
      }
      
      if (expiredTokenGracePeriodMs && expiredTokenGracePeriodMs < 86400000) {
        warnings.push('Expired token grace period is very short (< 1 day)');
      }
      
      if (batchSize && batchSize > 1000) {
        warnings.push('Cleanup batch size is very large (> 1000)');
      }
    }

    return { valid: errors.length === 0, errors, warnings, recommendations };
  }

  /**
   * Validate environment-specific requirements
   */
  static validateEnvironmentRequirements(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Production-specific validations
    if (config.isProduction) {
      if (config.enableMockServices) {
        errors.push('Mock services should not be enabled in production');
      }
      
      if (!config.oauth.redirectUri?.startsWith('https://')) {
        errors.push('OAuth redirect URI must use HTTPS in production');
      }
      
      recommendations.push('Ensure OAuth configuration is validated in CI/CD pipeline');
      recommendations.push('Implement OAuth configuration monitoring and alerting');
    }

    // Development-specific recommendations
    if (config.isDevelopment) {
      if (!config.enableMockServices && !config.hasCompleteOAuth) {
        warnings.push('OAuth not fully configured - consider enabling mock services for development');
      }
      
      recommendations.push('Test OAuth flow with different error scenarios');
      recommendations.push('Validate OAuth configuration before deploying to production');
    }

    return { valid: errors.length === 0, errors, warnings, recommendations };
  }

  /**
   * Perform comprehensive security validation
   */
  static validateSecurity(): SecurityValidationResult {
    const baseValidation = this.validateConfiguration();
    const complianceIssues: string[] = [];
    let securityLevel: 'high' | 'medium' | 'low' | 'critical' = 'high';

    // Check for critical security issues
    const criticalIssues = baseValidation.errors.filter(error => 
      error.includes('encryption key') || 
      error.includes('secret') || 
      error.includes('HTTPS') ||
      error.includes('default/example value')
    );

    if (criticalIssues.length > 0) {
      securityLevel = 'critical';
      complianceIssues.push(...criticalIssues);
    } else if (baseValidation.errors.length > 0) {
      securityLevel = 'low';
    } else if (baseValidation.warnings.length > 2) {
      securityLevel = 'medium';
    }

    // Check compliance requirements
    if (config.isProduction) {
      if (!config.oauth.redirectUri?.startsWith('https://')) {
        complianceIssues.push('HTTPS required for production OAuth flows (compliance requirement)');
      }
      
      if (typeof window === 'undefined' && config.oauth.tokenEncryptionKey?.length < 32) {
        complianceIssues.push('Encryption key length does not meet security standards');
      }
    }

    return {
      ...baseValidation,
      securityLevel,
      complianceIssues
    };
  }

  /**
   * Generate configuration report
   */
  static generateReport(): {
    summary: string;
    validation: ValidationResult;
    security: SecurityValidationResult;
    recommendations: string[];
  } {
    const validation = this.validateConfiguration();
    const security = this.validateSecurity();
    
    let summary = 'OAuth Configuration Report\n';
    summary += `Status: ${validation.valid ? '✅ Valid' : '❌ Invalid'}\n`;
    summary += `Security Level: ${security.securityLevel.toUpperCase()}\n`;
    summary += `Errors: ${validation.errors.length}\n`;
    summary += `Warnings: ${validation.warnings.length}\n`;
    summary += `Compliance Issues: ${security.complianceIssues.length}\n`;

    const recommendations = [
      ...validation.recommendations,
      ...security.recommendations
    ].filter((rec, index, arr) => arr.indexOf(rec) === index); // Remove duplicates

    return {
      summary,
      validation,
      security,
      recommendations
    };
  }
}