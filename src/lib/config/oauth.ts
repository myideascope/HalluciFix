/**
 * OAuth Configuration Management
 * Handles OAuth provider configuration, validation, and environment-specific settings
 */

import { z } from 'zod';

// =============================================================================
// CONFIGURATION SCHEMAS
// =============================================================================

/**
 * Google OAuth Configuration Schema
 */
export const GoogleOAuthConfigSchema = z.object({
  clientId: z.string().min(1, 'Google Client ID is required'),
  clientSecret: z.string().min(1, 'Google Client Secret is required'),
  redirectUri: z.string().url('Invalid redirect URI format'),
  scopes: z.array(z.string()).min(1, 'At least one OAuth scope is required'),
});

/**
 * OAuth Security Configuration Schema
 */
export const OAuthSecurityConfigSchema = z.object({
  tokenEncryptionKey: z.string().min(32, 'Token encryption key must be at least 32 characters'),
  stateSecret: z.string().min(16, 'OAuth state secret must be at least 16 characters'),
  sessionSecret: z.string().min(16, 'Session secret must be at least 16 characters'),
});

/**
 * Complete OAuth Configuration Schema
 */
export const OAuthConfigSchema = z.object({
  google: GoogleOAuthConfigSchema,
  security: OAuthSecurityConfigSchema,
  environment: z.enum(['development', 'staging', 'production']),
});

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type GoogleOAuthConfig = z.infer<typeof GoogleOAuthConfigSchema>;
export type OAuthSecurityConfig = z.infer<typeof OAuthSecurityConfigSchema>;
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;

/**
 * OAuth Provider Interface
 */
export interface OAuthProvider {
  name: string;
  clientId: string;
  scopes: string[];
  initiateAuth(redirectUri: string, state?: string): Promise<string>;
  handleCallback(code: string, state: string, codeVerifier: string): Promise<AuthResult>;
  refreshTokens(refreshToken: string): Promise<TokenResult>;
  revokeTokens(accessToken: string): Promise<void>;
}

/**
 * Authentication Result
 */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
  user: UserProfile;
}

/**
 * Token Refresh Result
 */
export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/**
 * User Profile from OAuth Provider
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  picture: string;
  locale: string;
  verified: boolean;
}

/**
 * OAuth Error Types
 */
export enum OAuthErrorType {
  INVALID_REQUEST = 'invalid_request',
  UNAUTHORIZED_CLIENT = 'unauthorized_client',
  ACCESS_DENIED = 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE = 'unsupported_response_type',
  INVALID_SCOPE = 'invalid_scope',
  SERVER_ERROR = 'server_error',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable',
  INVALID_GRANT = 'invalid_grant',
  INVALID_CLIENT = 'invalid_client',
}

/**
 * OAuth Error Class
 */
export class OAuthError extends Error {
  constructor(
    public type: OAuthErrorType,
    public description?: string,
    public uri?: string
  ) {
    super(`OAuth Error: ${type}${description ? ` - ${description}` : ''}`);
    this.name = 'OAuthError';
  }
}

// =============================================================================
// CONFIGURATION LOADER
// =============================================================================

/**
 * Load and validate OAuth configuration from environment variables
 */
export function loadOAuthConfig(): OAuthConfig {
  const config = {
    google: {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
      clientSecret: import.meta.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: import.meta.env.VITE_GOOGLE_REDIRECT_URI || '',
      scopes: (import.meta.env.GOOGLE_OAUTH_SCOPES || 'openid email profile')
        .split(' ')
        .filter(Boolean),
    },
    security: {
      tokenEncryptionKey: import.meta.env.OAUTH_TOKEN_ENCRYPTION_KEY || '',
      stateSecret: import.meta.env.OAUTH_STATE_SECRET || '',
      sessionSecret: import.meta.env.OAUTH_SESSION_SECRET || '',
    },
    environment: (import.meta.env.NODE_ENV || 'development') as 'development' | 'staging' | 'production',
  };

  try {
    return OAuthConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`OAuth configuration validation failed:\n${issues.join('\n')}`);
    }
    throw error;
  }
}

/**
 * Validate OAuth configuration without throwing
 */
export function validateOAuthConfig(): { valid: boolean; errors: string[] } {
  try {
    loadOAuthConfig();
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: error instanceof Error ? [error.message] : ['Unknown configuration error'],
    };
  }
}

// =============================================================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// =============================================================================

/**
 * Get environment-specific OAuth settings
 */
export function getEnvironmentOAuthSettings(environment: string) {
  const baseSettings = {
    cookieSecure: false,
    cookieSameSite: 'lax' as const,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    tokenRefreshThreshold: 5 * 60 * 1000, // 5 minutes
  };

  switch (environment) {
    case 'production':
      return {
        ...baseSettings,
        cookieSecure: true,
        cookieSameSite: 'strict' as const,
        sessionTimeout: 12 * 60 * 60 * 1000, // 12 hours in production
      };

    case 'staging':
      return {
        ...baseSettings,
        cookieSecure: true,
        cookieSameSite: 'lax' as const,
      };

    case 'development':
    default:
      return {
        ...baseSettings,
        sessionTimeout: 7 * 24 * 60 * 60 * 1000, // 7 days in development
      };
  }
}

// =============================================================================
// CONFIGURATION VALIDATION HELPERS
// =============================================================================

/**
 * Validate Google OAuth redirect URI format
 */
export function validateRedirectUri(uri: string, environment: string): boolean {
  try {
    const url = new URL(uri);
    
    // In development, allow localhost
    if (environment === 'development') {
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    }
    
    // In production, require HTTPS and proper domain
    return url.protocol === 'https:' && !url.hostname.includes('localhost');
  } catch {
    return false;
  }
}

/**
 * Validate OAuth scopes
 */
export function validateOAuthScopes(scopes: string[]): { valid: boolean; missing: string[] } {
  const requiredScopes = ['openid', 'email', 'profile'];
  const missing = requiredScopes.filter(scope => !scopes.includes(scope));
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Generate secure random string for secrets
 */
export function generateSecureSecret(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

// =============================================================================
// CONFIGURATION DIAGNOSTICS
// =============================================================================

/**
 * Run OAuth configuration diagnostics
 */
export function runOAuthDiagnostics(): {
  status: 'healthy' | 'warning' | 'error';
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
  }>;
} {
  const checks = [];
  let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';

  // Check configuration validity
  const configValidation = validateOAuthConfig();
  checks.push({
    name: 'Configuration Validation',
    status: configValidation.valid ? 'pass' : 'fail',
    message: configValidation.valid 
      ? 'OAuth configuration is valid'
      : `Configuration errors: ${configValidation.errors.join(', ')}`,
  });

  if (!configValidation.valid) {
    overallStatus = 'error';
  }

  // If config is valid, run additional checks
  if (configValidation.valid) {
    try {
      const config = loadOAuthConfig();

      // Check redirect URI
      const redirectUriValid = validateRedirectUri(config.google.redirectUri, config.environment);
      checks.push({
        name: 'Redirect URI Validation',
        status: redirectUriValid ? 'pass' : 'fail',
        message: redirectUriValid
          ? 'Redirect URI format is valid for environment'
          : 'Redirect URI format is invalid for current environment',
      });

      if (!redirectUriValid && overallStatus !== 'error') {
        overallStatus = 'warning';
      }

      // Check OAuth scopes
      const scopeValidation = validateOAuthScopes(config.google.scopes);
      checks.push({
        name: 'OAuth Scopes',
        status: scopeValidation.valid ? 'pass' : 'warning',
        message: scopeValidation.valid
          ? 'All required OAuth scopes are configured'
          : `Missing required scopes: ${scopeValidation.missing.join(', ')}`,
      });

      if (!scopeValidation.valid && overallStatus === 'healthy') {
        overallStatus = 'warning';
      }

      // Check encryption key strength
      const keyStrength = config.security.tokenEncryptionKey.length >= 32;
      checks.push({
        name: 'Encryption Key Strength',
        status: keyStrength ? 'pass' : 'fail',
        message: keyStrength
          ? 'Token encryption key meets security requirements'
          : 'Token encryption key is too short (minimum 32 characters)',
      });

      if (!keyStrength) {
        overallStatus = 'error';
      }

    } catch (error) {
      checks.push({
        name: 'Configuration Loading',
        status: 'fail',
        message: `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      overallStatus = 'error';
    }
  }

  return {
    status: overallStatus,
    checks,
  };
}