import { env, config } from '../env';
import { GoogleOAuthConfig, OAuthServiceConfig } from './types';

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
    if (!config.hasGoogleAuth) {
      throw new Error(
        'Google OAuth is not configured. Please set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
      );
    }

    // Generate encryption key for token storage
    const encryptionKey = this.generateEncryptionKey();

    // Build Google OAuth configuration
    const googleConfig: GoogleOAuthConfig = {
      clientId: env.VITE_GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      redirectUri: env.VITE_GOOGLE_REDIRECT_URI || `${env.VITE_APP_URL}/auth/callback`,
      scopes: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.readonly'
      ]
    };

    // Build complete OAuth service configuration
    this.config = {
      google: googleConfig,
      encryptionKey,
      autoStartServices: true,
      refreshConfig: {
        checkIntervalMs: 5 * 60 * 1000, // Check every 5 minutes
        refreshBufferMs: 5 * 60 * 1000, // Refresh 5 minutes before expiry
        maxRetries: 3,
        retryDelayMs: 1000
      },
      cleanupConfig: {
        cleanupIntervalMs: 60 * 60 * 1000, // Cleanup every hour
        expiredTokenGracePeriodMs: 24 * 60 * 60 * 1000, // Keep expired tokens for 24 hours
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
      return config.hasGoogleAuth && !config.enableMockServices;
    } catch {
      return false;
    }
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

    if (!env.VITE_GOOGLE_CLIENT_ID) {
      return {
        available: false,
        reason: 'Google Client ID not configured (VITE_GOOGLE_CLIENT_ID)',
        fallbackToMock: true
      };
    }

    if (!env.GOOGLE_CLIENT_SECRET) {
      return {
        available: false,
        reason: 'Google Client Secret not configured (GOOGLE_CLIENT_SECRET)',
        fallbackToMock: true
      };
    }

    return {
      available: true,
      fallbackToMock: false
    };
  }

  /**
   * Generate a secure encryption key for token storage
   */
  private generateEncryptionKey(): string {
    // In production, this should come from a secure key management service
    // For now, we'll generate a key based on environment variables
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