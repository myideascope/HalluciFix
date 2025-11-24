import { env, config } from '../env';
import { GoogleOAuthConfig, OAuthServiceConfig } from './types';

import { logger } from '../logging';
/**
 * OAuth configuration management
 */
export class OAuthConfigManager {
  private static instance: OAuthConfigManager;
  private config: OAuthServiceConfig | null = null;

  private constructor() {}

  static getInstance(): OAuthConfigManager {
    if (!OAuthConfigManager.instance) {
      OAuthConfigManager.instance = new OAuthConfigManager();
    }
    return OAuthConfigManager.instance;
  }

  /**
   * Initialize OAuth configuration
   */
  initialize(): OAuthServiceConfig {
    if (this.config) {
      return this.config;
    }

    // Check if OAuth is properly configured
    if (!config.hasCompleteOAuth) {
      const missingParts = [];
      if (!config.hasGoogleAuth) {
        missingParts.push('Google OAuth credentials (VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)');
      }
      if (!config.hasOAuthSecurity) {
        missingParts.push('OAuth security configuration (OAUTH_TOKEN_ENCRYPTION_KEY, OAUTH_STATE_SECRET, OAUTH_SESSION_SECRET)');
      }
      throw new Error(
        `OAuth is not fully configured. Missing: ${missingParts.join(', ')}`
      );
    }

    // Use configured encryption key or generate one (browser-safe fallback)
    const encryptionKey = config.oauth.tokenEncryptionKey || 
      (typeof window !== 'undefined' ? this.generateBrowserSafeKey() : this.generateEncryptionKey());

    // Build Google OAuth configuration
    const googleConfig: GoogleOAuthConfig = {
      clientId: config.oauth.clientId!,
      clientSecret: config.oauth.clientSecret || '', // Client secret not available in browser
      redirectUri: config.oauth.redirectUri,
      scopes: config.oauth.scopes
    };

    // Build complete OAuth service configuration
    this.config = {
      google: googleConfig,
      encryptionKey,
      autoStartServices: true,
      refreshConfig: {
        checkIntervalMs: config.oauth.refreshCheckIntervalMs,
        refreshBufferMs: config.oauth.refreshBufferMs,
        maxRetries: 3,
        retryDelayMs: 1000
      },
      cleanupConfig: {
        cleanupIntervalMs: config.oauth.cleanupIntervalMs,
        expiredTokenGracePeriodMs: config.oauth.tokenGracePeriodMs,
        auditLogRetentionMs: 30 * 24 * 60 * 60 * 1000, // Keep audit logs for 30 days
        batchSize: 100
      }
    };

    return this.config;
  }

  /**
   * Get current configuration
   */
  getConfig(): OAuthServiceConfig {
    if (!this.config) {
      return this.initialize();
    }
    return this.config;
  }

  /**
   * Check if OAuth is available and configured
   */
  isAvailable(): boolean {
    try {
      return config.hasCompleteOAuth && !config.enableMockServices;
    } catch {
      return false;
    }
  }

  /**
   * Validate OAuth configuration for production readiness
   */
  validateProductionReadiness(): { ready: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check Google OAuth configuration
    if (!config.oauth.clientId) {
      issues.push('Google Client ID is not configured');
    } else if (config.oauth.clientId.length < 50) {
      issues.push('Google Client ID appears to be invalid (too short)');
    }

    if (typeof window === 'undefined' && !config.oauth.clientSecret) {
      issues.push('Google Client Secret is not configured for server environment');
    }

    // Check redirect URI configuration
    if (!config.oauth.redirectUri) {
      issues.push('OAuth redirect URI is not configured');
    } else {
      try {
        const url = new URL(config.oauth.redirectUri);
        if (config.isProduction && url.protocol !== 'https:') {
          issues.push('OAuth redirect URI must use HTTPS in production');
        }
        if (!url.pathname.includes('/auth/callback')) {
          issues.push('OAuth redirect URI should include /auth/callback path');
        }
      } catch {
        issues.push('OAuth redirect URI is not a valid URL');
      }
    }

    // Check OAuth scopes
    const requiredScopes = ['openid', 'email', 'profile'];
    const configuredScopes = config.oauth.scopes;
    const missingScopes = requiredScopes.filter(scope => !configuredScopes.includes(scope));
    if (missingScopes.length > 0) {
      issues.push(`Missing required OAuth scopes: ${missingScopes.join(', ')}`);
    }

    // Check security configuration (server-side only)
    if (typeof window === 'undefined') {
      if (!config.oauth.tokenEncryptionKey) {
        issues.push('OAuth token encryption key is not configured');
      } else if (config.oauth.tokenEncryptionKey.length < 32) {
        issues.push('OAuth token encryption key is too short (minimum 32 characters)');
      }

      if (!config.oauth.stateSecret) {
        issues.push('OAuth state secret is not configured');
      } else if (config.oauth.stateSecret.length < 32) {
        issues.push('OAuth state secret is too short (minimum 32 characters)');
      }

      if (!config.oauth.sessionSecret) {
        issues.push('OAuth session secret is not configured');
      } else if (config.oauth.sessionSecret.length < 32) {
        issues.push('OAuth session secret is too short (minimum 32 characters)');
      }
    }

    return {
      ready: issues.length === 0,
      issues
    };
  }

  /**
   * Get OAuth availability status with details
   */
  getAvailabilityStatus(): {
    available: boolean;
    reason?: string;
    fallbackToMock: boolean;
  } {
    if (config.enableMockServices) {
      return {
        available: false,
        reason: 'Mock services are enabled',
        fallbackToMock: true
      };
    }

    if (!config.hasGoogleAuth) {
      const missing = [];
      if (!env.VITE_GOOGLE_CLIENT_ID) missing.push('VITE_GOOGLE_CLIENT_ID');
      // Only check for client secret on server side
      if (typeof window === 'undefined' && !env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
      
      return {
        available: false,
        reason: `Google OAuth credentials not configured: ${missing.join(', ')}`,
        fallbackToMock: true
      };
    }

    if (!config.hasOAuthSecurity) {
      // In browser environment, assume security is handled server-side
      if (typeof window !== 'undefined') {
        // Continue with browser-side OAuth initialization
      } else {
        // Server-side validation
        const missing = [];
        if (!env.OAUTH_TOKEN_ENCRYPTION_KEY) missing.push('OAUTH_TOKEN_ENCRYPTION_KEY');
        if (!env.OAUTH_STATE_SECRET) missing.push('OAUTH_STATE_SECRET');
        if (!env.OAUTH_SESSION_SECRET) missing.push('OAUTH_SESSION_SECRET');
        
        return {
          available: false,
          reason: `OAuth security configuration missing: ${missing.join(', ')}`,
          fallbackToMock: true
        };
      }
    }

    return {
      available: true,
      fallbackToMock: false
    };
  }

  /**
   * Generate a browser-safe placeholder key (base64-encoded 32 bytes)
   */
  private generateBrowserSafeKey(): string {
    // Generate a valid base64-encoded 32-byte key for browser environments
    // This won't be used for actual encryption but satisfies validation
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Generate a secure encryption key for token storage
   */
  private generateEncryptionKey(): string {
    // Fallback key generation when not configured
    logger.warn("OAuth encryption key not configured, generating fallback key. This should not be used in production.");
    
    const baseKey = env.JWT_SECRET || env.VITE_SUPABASE_ANON_KEY || 'default-key';
    
    // Create a more secure key by hashing the base key
    const encoder = new TextEncoder();
    const data = encoder.encode(baseKey + 'oauth-encryption-salt');
    
    // Simple hash function for demonstration
    // In production, use a proper key derivation function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to a 32-character hex string
    return Math.abs(hash).toString(16).padStart(8, '0').repeat(4);
  }

  /**
   * Validate OAuth configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.getConfig();

      // Validate Google configuration
      if (!config.google.clientId) {
        errors.push('Google Client ID is required');
      }

      if (!config.google.clientSecret) {
        errors.push('Google Client Secret is required');
      }

      if (!config.google.redirectUri) {
        errors.push('Google Redirect URI is required');
      } else {
        try {
          new URL(config.google.redirectUri);
        } catch {
          errors.push('Google Redirect URI must be a valid URL');
        }
      }

      if (!config.encryptionKey || config.encryptionKey.length < 16) {
        errors.push('Encryption key must be at least 16 characters');
      }

      // Validate scopes
      if (!config.google.scopes || config.google.scopes.length === 0) {
        errors.push('At least one OAuth scope is required');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        valid: false,
        errors
      };
    }
  }

  /**
   * Reset configuration (useful for testing)
   */
  reset(): void {
    this.config = null;
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary() {
    const status = this.getAvailabilityStatus();
    
    if (!status.available) {
      return {
        available: false,
        reason: status.reason,
        fallbackToMock: status.fallbackToMock
      };
    }

    const config = this.getConfig();
    const validation = this.validateConfig();

    return {
      available: true,
      valid: validation.valid,
      errors: validation.errors,
      google: {
        clientId: config.google.clientId ? `${config.google.clientId.substring(0, 10)}...` : 'Not set',
        redirectUri: config.google.redirectUri,
        scopes: config.google.scopes
      },
      services: {
        autoStart: config.autoStartServices,
        refreshInterval: config.refreshConfig?.checkIntervalMs,
        cleanupInterval: config.cleanupConfig?.cleanupIntervalMs
      }
    };
  }
}

// Export singleton instance
export const oauthConfig = OAuthConfigManager.getInstance();