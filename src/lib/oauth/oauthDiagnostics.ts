/**
 * OAuth Configuration Diagnostics and Health Checks
 * Provides comprehensive validation and troubleshooting for OAuth configuration
 */

import { config, env } from '../env';
import { oauthConfig } from './oauthConfig';

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  message: string;
  details?: string;
  recommendation?: string;
}

export interface DiagnosticResult {
  overall: 'healthy' | 'warning' | 'error' | 'unavailable';
  summary: string;
  checks: DiagnosticCheck[];
  timestamp: string;
}

export class OAuthDiagnostics {
  /**
   * Run comprehensive OAuth diagnostics
   */
  static async runDiagnostics(): Promise<DiagnosticResult> {
    const checks: DiagnosticCheck[] = [];
    const timestamp = new Date().toISOString();

    // Basic configuration checks
    checks.push(...this.checkBasicConfiguration());
    
    // Environment-specific checks
    checks.push(...this.checkEnvironmentConfiguration());
    
    // Security configuration checks
    checks.push(...this.checkSecurityConfiguration());
    
    // Service availability checks
    checks.push(...await this.checkServiceAvailability());
    
    // Network connectivity checks (if service is available)
    const serviceAvailable = checks.some(c => c.name === 'OAuth Service Initialization' && c.status === 'pass');
    if (serviceAvailable) {
      checks.push(...await this.checkNetworkConnectivity());
    }

    // Determine overall status
    const overall = this.determineOverallStatus(checks);
    const summary = this.generateSummary(overall, checks);

    return {
      overall,
      summary,
      checks,
      timestamp
    };
  }

  /**
   * Check basic OAuth configuration
   */
  private static checkBasicConfiguration(): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    // Check if mock services are enabled
    checks.push({
      name: 'Mock Services Status',
      status: config.enableMockServices ? 'warning' : 'info',
      message: config.enableMockServices 
        ? 'Mock services are enabled - OAuth will not be available'
        : 'Mock services are disabled - real OAuth can be used',
      details: config.enableMockServices 
        ? 'Set VITE_ENABLE_MOCK_SERVICES=false to enable real OAuth'
        : 'Real services are enabled for OAuth authentication'
    });

    // Check Google Client ID
    checks.push({
      name: 'Google Client ID',
      status: env.VITE_GOOGLE_CLIENT_ID ? 'pass' : 'fail',
      message: env.VITE_GOOGLE_CLIENT_ID 
        ? 'Google Client ID is configured'
        : 'Google Client ID is missing',
      details: env.VITE_GOOGLE_CLIENT_ID 
        ? `Client ID: ${env.VITE_GOOGLE_CLIENT_ID.substring(0, 20)}...`
        : 'Set VITE_GOOGLE_CLIENT_ID in your environment configuration',
      recommendation: !env.VITE_GOOGLE_CLIENT_ID 
        ? 'Get your Client ID from Google Cloud Console > APIs & Services > Credentials'
        : undefined
    });

    // Check Google Client Secret
    checks.push({
      name: 'Google Client Secret',
      status: env.GOOGLE_CLIENT_SECRET ? 'pass' : 'fail',
      message: env.GOOGLE_CLIENT_SECRET 
        ? 'Google Client Secret is configured'
        : 'Google Client Secret is missing',
      details: env.GOOGLE_CLIENT_SECRET 
        ? 'Client Secret is set (hidden for security)'
        : 'Set GOOGLE_CLIENT_SECRET in your environment configuration',
      recommendation: !env.GOOGLE_CLIENT_SECRET 
        ? 'Get your Client Secret from Google Cloud Console > APIs & Services > Credentials'
        : undefined
    });

    // Check redirect URI
    const redirectUri = config.oauth.redirectUri;
    checks.push({
      name: 'OAuth Redirect URI',
      status: this.validateRedirectUri(redirectUri) ? 'pass' : 'warning',
      message: this.validateRedirectUri(redirectUri)
        ? 'Redirect URI is properly configured'
        : 'Redirect URI may have issues',
      details: `Redirect URI: ${redirectUri}`,
      recommendation: !this.validateRedirectUri(redirectUri)
        ? 'Ensure the redirect URI is registered in Google Cloud Console and uses HTTPS in production'
        : undefined
    });

    // Check OAuth scopes
    const scopes = config.oauth.scopes;
    const requiredScopes = ['openid', 'email', 'profile'];
    const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope));
    
    checks.push({
      name: 'OAuth Scopes',
      status: missingScopes.length === 0 ? 'pass' : 'warning',
      message: missingScopes.length === 0
        ? 'All required OAuth scopes are configured'
        : `Missing required scopes: ${missingScopes.join(', ')}`,
      details: `Configured scopes: ${scopes.join(', ')}`,
      recommendation: missingScopes.length > 0
        ? 'Add missing scopes to GOOGLE_OAUTH_SCOPES environment variable'
        : undefined
    });

    return checks;
  }

  /**
   * Check environment-specific configuration
   */
  private static checkEnvironmentConfiguration(): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    // Check environment
    const environment = env.NODE_ENV;
    checks.push({
      name: 'Environment',
      status: 'info',
      message: `Running in ${environment} environment`,
      details: `NODE_ENV: ${environment}`
    });

    // Check app URL configuration
    const appUrl = env.VITE_APP_URL;
    checks.push({
      name: 'Application URL',
      status: this.validateAppUrl(appUrl, environment) ? 'pass' : 'warning',
      message: this.validateAppUrl(appUrl, environment)
        ? 'Application URL is properly configured for environment'
        : 'Application URL may not be suitable for current environment',
      details: `App URL: ${appUrl}`,
      recommendation: !this.validateAppUrl(appUrl, environment)
        ? environment === 'production' 
          ? 'Use HTTPS URL for production environment'
          : 'Ensure URL is accessible for OAuth callbacks'
        : undefined
    });

    return checks;
  }

  /**
   * Check security configuration
   */
  private static checkSecurityConfiguration(): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    // Check token encryption key
    const encryptionKey = env.OAUTH_TOKEN_ENCRYPTION_KEY;
    checks.push({
      name: 'Token Encryption Key',
      status: this.validateEncryptionKey(encryptionKey) ? 'pass' : 'fail',
      message: this.validateEncryptionKey(encryptionKey)
        ? 'Token encryption key is properly configured'
        : 'Token encryption key is missing or insufficient',
      details: encryptionKey 
        ? `Key length: ${encryptionKey.length} characters`
        : 'No encryption key configured',
      recommendation: !this.validateEncryptionKey(encryptionKey)
        ? 'Set OAUTH_TOKEN_ENCRYPTION_KEY to a secure 32+ character string'
        : undefined
    });

    // Check state secret
    const stateSecret = env.OAUTH_STATE_SECRET;
    checks.push({
      name: 'OAuth State Secret',
      status: this.validateSecret(stateSecret) ? 'pass' : 'fail',
      message: this.validateSecret(stateSecret)
        ? 'OAuth state secret is configured'
        : 'OAuth state secret is missing or insufficient',
      details: stateSecret 
        ? `Secret length: ${stateSecret.length} characters`
        : 'No state secret configured',
      recommendation: !this.validateSecret(stateSecret)
        ? 'Set OAUTH_STATE_SECRET to a secure 16+ character string'
        : undefined
    });

    // Check session secret
    const sessionSecret = env.OAUTH_SESSION_SECRET;
    checks.push({
      name: 'Session Secret',
      status: this.validateSecret(sessionSecret) ? 'pass' : 'fail',
      message: this.validateSecret(sessionSecret)
        ? 'Session secret is configured'
        : 'Session secret is missing or insufficient',
      details: sessionSecret 
        ? `Secret length: ${sessionSecret.length} characters`
        : 'No session secret configured',
      recommendation: !this.validateSecret(sessionSecret)
        ? 'Set OAUTH_SESSION_SECRET to a secure 16+ character string'
        : undefined
    });

    return checks;
  }

  /**
   * Check service availability
   */
  private static async checkServiceAvailability(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];

    // Check OAuth config availability
    try {
      const availability = oauthConfig.getAvailabilityStatus();
      checks.push({
        name: 'OAuth Availability',
        status: availability.available ? 'pass' : 'fail',
        message: availability.available 
          ? 'OAuth is available and ready to use'
          : `OAuth is not available: ${availability.reason}`,
        details: availability.available 
          ? 'All required configuration is present'
          : availability.reason || 'Configuration incomplete',
        recommendation: !availability.available && availability.fallbackToMock
          ? 'Complete the OAuth configuration or use mock services for development'
          : undefined
      });
    } catch (error) {
      checks.push({
        name: 'OAuth Availability',
        status: 'fail',
        message: 'Failed to check OAuth availability',
        details: error instanceof Error ? error.message : 'Unknown error',
        recommendation: 'Check OAuth configuration and try again'
      });
    }

    // Check OAuth service initialization
    try {
      const configSummary = oauthConfig.getConfigSummary();
      checks.push({
        name: 'OAuth Service Initialization',
        status: configSummary.available && configSummary.valid ? 'pass' : 'fail',
        message: configSummary.available && configSummary.valid
          ? 'OAuth service can be initialized successfully'
          : 'OAuth service initialization failed',
        details: configSummary.available 
          ? configSummary.valid 
            ? 'Service configuration is valid'
            : `Configuration errors: ${configSummary.errors?.join(', ')}`
          : 'Service is not available',
        recommendation: !configSummary.valid
          ? 'Fix configuration errors before using OAuth'
          : undefined
      });
    } catch (error) {
      checks.push({
        name: 'OAuth Service Initialization',
        status: 'fail',
        message: 'Failed to initialize OAuth service',
        details: error instanceof Error ? error.message : 'Unknown error',
        recommendation: 'Check OAuth configuration and dependencies'
      });
    }

    return checks;
  }

  /**
   * Check network connectivity (basic checks)
   */
  private static async checkNetworkConnectivity(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];

    // Check Google OAuth endpoints accessibility
    try {
      // This is a basic check - in a real implementation you might want to do more thorough testing
      const googleOAuthUrl = 'https://accounts.google.com/.well-known/openid_configuration';
      
      // Note: In a browser environment, this might be blocked by CORS
      // This is more of a placeholder for server-side diagnostics
      checks.push({
        name: 'Google OAuth Endpoints',
        status: 'info',
        message: 'Google OAuth endpoints should be accessible',
        details: 'Network connectivity check requires server-side implementation',
        recommendation: 'Ensure your application can reach accounts.google.com and www.googleapis.com'
      });
    } catch (error) {
      checks.push({
        name: 'Google OAuth Endpoints',
        status: 'warning',
        message: 'Could not verify Google OAuth endpoint accessibility',
        details: 'Network check failed or blocked by browser security',
        recommendation: 'Verify network connectivity to Google services'
      });
    }

    return checks;
  }

  /**
   * Validate redirect URI format and security
   */
  private static validateRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      const environment = env.NODE_ENV;
      
      // In development, allow localhost
      if (environment === 'development') {
        return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.protocol === 'https:';
      }
      
      // In production, require HTTPS
      return url.protocol === 'https:' && !url.hostname.includes('localhost');
    } catch {
      return false;
    }
  }

  /**
   * Validate app URL for environment
   */
  private static validateAppUrl(url: string, environment: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      if (environment === 'production') {
        return parsedUrl.protocol === 'https:' && !parsedUrl.hostname.includes('localhost');
      }
      
      return true; // More lenient for development/staging
    } catch {
      return false;
    }
  }

  /**
   * Validate encryption key strength
   */
  private static validateEncryptionKey(key?: string): boolean {
    return !!(key && key.length >= 32);
  }

  /**
   * Validate secret strength
   */
  private static validateSecret(secret?: string): boolean {
    return !!(secret && secret.length >= 16);
  }

  /**
   * Determine overall diagnostic status
   */
  private static determineOverallStatus(checks: DiagnosticCheck[]): 'healthy' | 'warning' | 'error' | 'unavailable' {
    const hasErrors = checks.some(c => c.status === 'fail');
    const hasWarnings = checks.some(c => c.status === 'warning');
    const mockServicesEnabled = config.enableMockServices;

    if (mockServicesEnabled) {
      return 'unavailable';
    }

    if (hasErrors) {
      return 'error';
    }

    if (hasWarnings) {
      return 'warning';
    }

    return 'healthy';
  }

  /**
   * Generate summary message
   */
  private static generateSummary(status: string, checks: DiagnosticCheck[]): string {
    const errorCount = checks.filter(c => c.status === 'fail').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;

    switch (status) {
      case 'healthy':
        return 'OAuth is properly configured and ready to use';
      case 'warning':
        return `OAuth is configured but has ${warningCount} warning(s) that should be addressed`;
      case 'error':
        return `OAuth configuration has ${errorCount} error(s) that must be fixed before use`;
      case 'unavailable':
        return 'OAuth is not available because mock services are enabled';
      default:
        return 'OAuth configuration status is unknown';
    }
  }

  /**
   * Get quick health status
   */
  static async getHealthStatus(): Promise<{
    status: 'healthy' | 'warning' | 'error' | 'unavailable';
    message: string;
  }> {
    try {
      if (config.enableMockServices) {
        return {
          status: 'unavailable',
          message: 'OAuth is disabled (mock services enabled)'
        };
      }

      const availability = oauthConfig.getAvailabilityStatus();
      if (!availability.available) {
        return {
          status: 'error',
          message: availability.reason || 'OAuth is not properly configured'
        };
      }

      const configSummary = oauthConfig.getConfigSummary();
      if (!configSummary.valid) {
        return {
          status: 'error',
          message: `Configuration errors: ${configSummary.errors?.join(', ')}`
        };
      }

      return {
        status: 'healthy',
        message: 'OAuth is properly configured and available'
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate configuration recommendations
   */
  static generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (config.enableMockServices) {
      recommendations.push('Set VITE_ENABLE_MOCK_SERVICES=false to enable real OAuth');
    }

    if (!config.hasGoogleAuth) {
      recommendations.push('Configure Google OAuth credentials (VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)');
    }

    if (!config.hasOAuthSecurity) {
      recommendations.push('Configure OAuth security settings (OAUTH_TOKEN_ENCRYPTION_KEY, OAUTH_STATE_SECRET, OAUTH_SESSION_SECRET)');
    }

    if (env.NODE_ENV === 'production' && env.VITE_APP_URL?.startsWith('http:')) {
      recommendations.push('Use HTTPS for production deployment');
    }

    return recommendations;
  }
}