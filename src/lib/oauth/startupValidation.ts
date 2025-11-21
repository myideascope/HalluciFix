/**
 * OAuth Startup Configuration Validation
 * Validates OAuth configuration on application startup and provides clear error messages
 */

import { config, env } from '../env';
import { OAuthDiagnostics } from './oauthDiagnostics';

import { logger } from './logging';
export interface StartupValidationResult {
  success: boolean;
  canProceed: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export class OAuthStartupValidator {
  /**
   * Validate OAuth configuration on startup
   */
  static async validateOnStartup(): Promise<StartupValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // If mock services are enabled, OAuth is not needed
    if (config.enableMockServices) {
      return {
        success: true,
        canProceed: true,
        errors,
        warnings: ['Mock services are enabled - OAuth will not be available'],
        recommendations: ['Set VITE_ENABLE_MOCK_SERVICES=false to enable real OAuth authentication']
      };
    }

    // Check critical OAuth configuration
    const criticalErrors = this.checkCriticalConfiguration();
    errors.push(...criticalErrors);

    // Check security configuration
    const securityIssues = this.checkSecurityConfiguration();
    errors.push(...securityIssues.errors);
    warnings.push(...securityIssues.warnings);

    // Check environment-specific issues
    const environmentIssues = this.checkEnvironmentConfiguration();
    warnings.push(...environmentIssues.warnings);
    recommendations.push(...environmentIssues.recommendations);

    // Generate recommendations
    recommendations.push(...OAuthDiagnostics.generateRecommendations());

    const success = errors.length === 0;
    const canProceed = success || config.enableMockServices;

    return {
      success,
      canProceed,
      errors,
      warnings,
      recommendations
    };
  }

  /**
   * Check critical configuration that prevents OAuth from working
   */
  private static checkCriticalConfiguration(): string[] {
    const errors: string[] = [];

    if (!env.VITE_GOOGLE_CLIENT_ID) {
      errors.push('Google Client ID is required (VITE_GOOGLE_CLIENT_ID)');
    }

    // Note: Client secret is not available in browser environment for security reasons
    // This validation should only run on the server side
    if (typeof window === 'undefined' && !env.GOOGLE_CLIENT_SECRET) {
      errors.push('Google Client Secret is required (GOOGLE_CLIENT_SECRET)');
    }

    // Validate Client ID format
    if (env.VITE_GOOGLE_CLIENT_ID && !this.isValidGoogleClientId(env.VITE_GOOGLE_CLIENT_ID)) {
      errors.push('Google Client ID format appears invalid');
    }

    // Validate Client Secret format
    if (env.GOOGLE_CLIENT_SECRET && !this.isValidGoogleClientSecret(env.GOOGLE_CLIENT_SECRET)) {
      errors.push('Google Client Secret format appears invalid');
    }

    return errors;
  }

  /**
   * Check security configuration
   */
  private static checkSecurityConfiguration(): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // In browser environment, security configuration is handled server-side
    if (typeof window !== 'undefined') {
      // Only show informational message in development
      if (env.NODE_ENV === 'development') {
        warnings.push('OAuth security configuration is handled server-side (not visible in browser)');
      }
      return { errors, warnings };
    }

    // Server-side security checks
    // Check encryption key
    if (!env.OAUTH_TOKEN_ENCRYPTION_KEY) {
      if (env.NODE_ENV === 'production') {
        errors.push('OAuth token encryption key is required in production (OAUTH_TOKEN_ENCRYPTION_KEY)');
      } else {
        warnings.push('OAuth token encryption key not configured - using fallback (not recommended for production)');
      }
    } else if (env.OAUTH_TOKEN_ENCRYPTION_KEY.length < 32) {
      errors.push('OAuth token encryption key must be at least 32 characters long');
    }

    // Check state secret
    if (!env.OAUTH_STATE_SECRET) {
      if (env.NODE_ENV === 'production') {
        errors.push('OAuth state secret is required in production (OAUTH_STATE_SECRET)');
      } else {
        warnings.push('OAuth state secret not configured - using fallback (not recommended for production)');
      }
    } else if (env.OAUTH_STATE_SECRET.length < 16) {
      errors.push('OAuth state secret must be at least 16 characters long');
    }

    // Check session secret
    if (!env.OAUTH_SESSION_SECRET) {
      if (env.NODE_ENV === 'production') {
        errors.push('OAuth session secret is required in production (OAUTH_SESSION_SECRET)');
      } else {
        warnings.push('OAuth session secret not configured - using fallback (not recommended for production)');
      }
    } else if (env.OAUTH_SESSION_SECRET.length < 16) {
      errors.push('OAuth session secret must be at least 16 characters long');
    }

    return { errors, warnings };
  }

  /**
   * Check environment-specific configuration
   */
  private static checkEnvironmentConfiguration(): { warnings: string[]; recommendations: string[] } {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check redirect URI
    const redirectUri = config.oauth.redirectUri;
    if (redirectUri) {
      try {
        const url = new URL(redirectUri);
        
        if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
          warnings.push('Redirect URI should use HTTPS in production');
          recommendations.push('Update VITE_GOOGLE_REDIRECT_URI to use HTTPS for production deployment');
        }

        if (url.hostname.includes('localhost') && env.NODE_ENV === 'production') {
          warnings.push('Redirect URI uses localhost in production environment');
          recommendations.push('Update redirect URI to use your production domain');
        }
      } catch {
        warnings.push('Redirect URI format is invalid');
        recommendations.push('Ensure VITE_GOOGLE_REDIRECT_URI is a valid URL');
      }
    }

    // Check app URL
    if (env.VITE_APP_URL) {
      try {
        const url = new URL(env.VITE_APP_URL);
        
        if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
          warnings.push('Application URL should use HTTPS in production');
          recommendations.push('Update VITE_APP_URL to use HTTPS for production deployment');
        }
      } catch {
        warnings.push('Application URL format is invalid');
      }
    }

    // Check OAuth scopes
    const scopes = config.oauth.scopes;
    const requiredScopes = ['openid', 'email', 'profile'];
    const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
    
    if (missingScopes.length > 0) {
      warnings.push(`Missing recommended OAuth scopes: ${missingScopes.join(', ')}`);
      recommendations.push('Add missing scopes to GOOGLE_OAUTH_SCOPES environment variable');
    }

    return { warnings, recommendations };
  }

  /**
   * Validate Google Client ID format
   */
  private static isValidGoogleClientId(clientId: string): boolean {
    // Google Client IDs typically end with .apps.googleusercontent.com
    return clientId.includes('.apps.googleusercontent.com') && clientId.length > 20;
  }

  /**
   * Validate Google Client Secret format
   */
  private static isValidGoogleClientSecret(clientSecret: string): boolean {
    // Google Client Secrets typically start with GOCSPX-
    return clientSecret.startsWith('GOCSPX-') && clientSecret.length > 20;
  }

  /**
   * Log startup validation results
   */
  static logValidationResults(result: StartupValidationResult): void {
    if (result.success) {
      logger.debug("✅ OAuth configuration validation passed");
    } else {
      logger.error("❌ OAuth configuration validation failed");
    }

    if (result.errors.length > 0) {
      console.group('🚨 Configuration Errors:');
      result.errors.forEach(error => console.error(`  • ${error}`));
      console.groupEnd();
    }

    if (result.warnings.length > 0) {
      console.group('⚠️ Configuration Warnings:');
      result.warnings.forEach(warning => console.warn(`  • ${warning}`));
      console.groupEnd();
    }

    if (result.recommendations.length > 0) {
      console.group('💡 Recommendations:');
      result.recommendations.forEach(rec => console.info(`  • ${rec}`));
      console.groupEnd();
    }

    if (!result.canProceed) {
      logger.error("🛑 Application cannot start with current OAuth configuration");
      logger.error("Please fix the configuration errors above and restart the application");
    }
  }

  /**
   * Throw error if configuration is invalid and cannot proceed
   */
  static enforceValidConfiguration(result: StartupValidationResult): void {
    if (!result.canProceed) {
      const errorMessage = [
        'OAuth configuration validation failed:',
        ...result.errors.map(error => `  • ${error}`),
        '',
        'Please fix these errors and restart the application.',
        'Alternatively, set VITE_ENABLE_MOCK_SERVICES=true to use mock authentication.'
      ].join('\n');

      throw new Error(errorMessage);
    }
  }
}