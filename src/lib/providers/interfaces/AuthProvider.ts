/**
 * Authentication Provider interface for OAuth and other auth services
 */

import { BaseProvider, ProviderConfig } from '../base/BaseProvider';

export interface AuthResult {
  success: boolean;
  user?: UserProfile;
  tokens?: TokenSet;
  error?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: Date;
  tokenType: string;
  scope?: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
  provider: string;
  providerAccountId: string;
}

export interface AuthUrl {
  url: string;
  state: string;
  codeVerifier?: string; // For PKCE
}

export interface TokenRefreshResult {
  success: boolean;
  tokens?: TokenSet;
  error?: string;
}

export interface AuthProviderConfig extends ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

export abstract class AuthProvider extends BaseProvider {
  protected authConfig: AuthProviderConfig;

  constructor(config: AuthProviderConfig) {
    super(config);
    this.authConfig = config;
  }

  /**
   * Initiate OAuth authentication flow
   */
  abstract initiateAuth(state?: string): Promise<AuthUrl>;

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  abstract handleCallback(
    code: string, 
    state: string, 
    codeVerifier?: string
  ): Promise<AuthResult>;

  /**
   * Refresh access token using refresh token
   */
  abstract refreshToken(refreshToken: string): Promise<TokenRefreshResult>;

  /**
   * Validate and decode access token
   */
  abstract validateToken(accessToken: string): Promise<UserProfile | null>;

  /**
   * Revoke tokens (logout)
   */
  abstract revokeTokens(accessToken: string, refreshToken?: string): Promise<boolean>;

  /**
   * Get user profile information
   */
  abstract getUserProfile(accessToken: string): Promise<UserProfile>;

  /**
   * Get configured scopes
   */
  getScopes(): string[] {
    return this.authConfig.scopes;
  }

  /**
   * Get redirect URI
   */
  getRedirectUri(): string {
    return this.authConfig.redirectUri;
  }

  /**
   * Get client ID (safe to expose)
   */
  getClientId(): string {
    return this.authConfig.clientId;
  }

  /**
   * Get masked client secret for debugging
   */
  getMaskedClientSecret(): string {
    const secret = this.authConfig.clientSecret;
    if (secret.length <= 8) return '***';
    return secret.substring(0, 4) + '***' + secret.substring(secret.length - 4);
  }

  /**
   * Update auth-specific configuration
   */
  updateAuthConfig(newConfig: Partial<AuthProviderConfig>): void {
    this.authConfig = { ...this.authConfig, ...newConfig };
    this.updateConfig(newConfig);
  }
}

export type AuthProviderType = 'google' | 'github' | 'microsoft' | 'mock';