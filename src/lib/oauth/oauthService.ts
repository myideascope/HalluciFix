/**
 * Comprehensive OAuth service that combines all token management functionality
 */

import { TokenManager } from './tokenManager';
import { TokenRefreshService } from './tokenRefreshService';
import { TokenCleanupService } from './tokenCleanupService';
import { GoogleOAuthProvider } from './googleProvider';
import { StateManager } from './stateManager';
import { OAuthErrorHandler, OAuthErrorMonitor } from './oauthErrorHandler';
import { GoogleProfileService, ProfileCacheConfig } from './profileService';
import { TokenData, AuthResult, GoogleOAuthConfig, OAuthError } from './types';

import { logger } from '../logging';
export interface OAuthServiceConfig {
  google: GoogleOAuthConfig;
  encryptionKey: string;
  autoStartServices?: boolean;
  refreshConfig?: {
    checkIntervalMs?: number;
    refreshBufferMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  };
  cleanupConfig?: {
    cleanupIntervalMs?: number;
    expiredTokenGracePeriodMs?: number;
    auditLogRetentionMs?: number;
    batchSize?: number;
  };
  profileConfig?: ProfileCacheConfig;
}

export class OAuthService {
  private tokenManager: TokenManager;
  private refreshService: TokenRefreshService;
  private cleanupService: TokenCleanupService;
  private googleProvider: GoogleOAuthProvider;
  private stateManager: StateManager;
  private profileService: GoogleProfileService;
  private config: OAuthServiceConfig;

  constructor(config: OAuthServiceConfig) {
    this.config = config;

    // Initialize core services
    this.tokenManager = new TokenManager(config.encryptionKey);
    this.refreshService = new TokenRefreshService(this.tokenManager, config.refreshConfig);
    this.cleanupService = new TokenCleanupService(this.tokenManager, config.cleanupConfig);
    this.googleProvider = new GoogleOAuthProvider(config.google);
    this.stateManager = new StateManager();
    this.profileService = new GoogleProfileService(this.tokenManager, config.profileConfig);

    // Auto-start services if configured
    if (config.autoStartServices !== false) {
      this.startServices();
    }
  }

  /**
   * Starts all background services
   */
  startServices(): void {
    this.refreshService.startScheduler();
    this.cleanupService.startCleanupScheduler();
  }

  /**
   * Stops all background services
   */
  stopServices(): void {
    this.refreshService.stopScheduler();
    this.cleanupService.stopCleanupScheduler();
  }

  /**
   * Initiates OAuth authentication flow
   */
  async initiateAuth(redirectUri: string): Promise<{ authUrl: string; state: string }> {
    try {
      const state = await this.stateManager.createState(redirectUri);
      const authUrl = await this.googleProvider.initiateAuth(redirectUri, state);
      
      return { authUrl, state };
    } catch (error) {
      throw new Error(`Failed to initiate auth: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handles OAuth callback and completes authentication
   */
  async handleCallback(
    code: string, 
    state: string, 
    redirectUri: string
  ): Promise<{ user: any; tokens: TokenData }> {
    const context = { code: code?.substring(0, 10) + '...', state, redirectUri };
    
    try {
      // Validate required parameters
      if (!code || !state) {
        const error = new Error('Missing required OAuth callback parameters');
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      // Validate state and get code verifier
      let stateData;
      try {
        stateData = await this.stateManager.validateState(state, redirectUri);
      } catch (error) {
        const stateError = new Error('State validation failed - possible CSRF attack');
        OAuthErrorMonitor.recordError(stateError, { ...context, originalError: error });
        throw stateError;
      }
      
      // Exchange code for tokens
      let authResult: AuthResult;
      try {
        authResult = await this.googleProvider.handleCallback(
          code, 
          state, 
          stateData.codeVerifier
        );
      } catch (error) {
        const tokenError = new Error('Token exchange failed');
        OAuthErrorMonitor.recordError(tokenError, { ...context, originalError: error });
        throw tokenError;
      }

      // Create token data
      const tokenData: TokenData = {
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken,
        expiresAt: new Date(Date.now() + authResult.expiresIn * 1000),
        scope: authResult.scope,
        tokenType: authResult.tokenType
      };

      // Store tokens securely
      try {
        await this.tokenManager.storeTokens(authResult.user.id, tokenData);
      } catch (error) {
        const storageError = new Error('Failed to store OAuth tokens');
        OAuthErrorMonitor.recordError(storageError, { ...context, userId: authResult.user.id, originalError: error });
        throw storageError;
      }

      return {
        user: authResult.user,
        tokens: tokenData
      };
    } catch (error) {
      // Log the error with context
      OAuthErrorHandler.logError(error instanceof Error ? error : new Error(String(error)), context);
      
      // Re-throw with user-friendly message
      const userMessage = OAuthErrorHandler.getUserMessage(error instanceof Error ? error : String(error));
      throw new Error(userMessage);
    }
  }

  /**
   * Gets valid tokens for a user (with automatic refresh)
   */
  async getValidTokens(userId: string): Promise<TokenData | null> {
    return this.tokenManager.getValidTokens(userId);
  }

  /**
   * Checks if user has valid tokens
   */
  async hasValidTokens(userId: string): Promise<boolean> {
    return this.tokenManager.hasValidTokens(userId);
  }

  /**
   * Manually refreshes tokens for a user
   */
  async refreshUserTokens(userId: string): Promise<boolean> {
    return this.refreshService.refreshUserTokens(userId);
  }

  /**
   * Revokes tokens for a user
   */
  async revokeUserTokens(userId: string, reason?: string): Promise<void> {
    return this.cleanupService.revokeUserTokens(userId, reason);
  }

  /**
   * Emergency revocation of all tokens
   */
  async revokeAllTokens(reason: string): Promise<number> {
    return this.cleanupService.revokeAllTokens(reason);
  }

  /**
   * Performs manual cleanup
   */
  async performCleanup() {
    return this.cleanupService.performCleanup();
  }

  /**
   * Gets comprehensive service statistics
   */
  async getServiceStats() {
    const [refreshStats, cleanupInfo, profileStats] = await Promise.all([
      this.refreshService.getStats(),
      this.cleanupService.getCleanupInfo(),
      Promise.resolve(this.profileService.getCacheStats())
    ]);

    return {
      refresh: refreshStats,
      cleanup: cleanupInfo,
      profile: profileStats,
      isConfigured: this.isConfigured()
    };
  }

  /**
   * Gets token statistics for a user
   */
  async getUserTokenStats(userId: string) {
    return this.tokenManager.getTokenStats(userId);
  }

  /**
   * Gets user profile with caching and synchronization
   */
  async getUserProfile(userId: string, forceRefresh = false) {
    return this.profileService.getUserProfile(userId, forceRefresh);
  }

  /**
   * Synchronizes user profile with Google
   */
  async syncUserProfile(userId: string) {
    return this.profileService.syncProfile(userId);
  }

  /**
   * Clears profile cache for a user
   */
  clearUserProfileCache(userId: string): void {
    this.profileService.clearUserCache(userId);
  }

  /**
   * Gets profile cache statistics
   */
  getProfileCacheStats() {
    return this.profileService.getCacheStats();
  }

  /**
   * Validates service configuration
   */
  isConfigured(): boolean {
    return this.tokenManager.validateConfiguration();
  }

  /**
   * Updates service configuration
   */
  updateConfig(newConfig: Partial<OAuthServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (newConfig.refreshConfig) {
      this.refreshService.updateConfig(newConfig.refreshConfig);
    }

    if (newConfig.cleanupConfig) {
      this.cleanupService.updateConfig(newConfig.cleanupConfig);
    }

    if (newConfig.profileConfig) {
      // Profile service config is immutable, would need to recreate service
      logger.warn("Profile configuration updates require service restart");
    }
  }

  /**
   * Health check for the OAuth service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      tokenManager: boolean;
      refreshService: boolean;
      cleanupService: boolean;
      googleProvider: boolean;
    };
    issues: string[];
  }> {
    const issues: string[] = [];
    const services = {
      tokenManager: true,
      refreshService: true,
      cleanupService: true,
      googleProvider: true
    };

    try {
      // Check configuration
      if (!this.isConfigured()) {
        issues.push('OAuth configuration is invalid');
        services.googleProvider = false;
      }

      // Check if services are running
      const refreshStats = this.refreshService.getStats();
      if (!refreshStats.isRunning) {
        issues.push('Token refresh service is not running');
        services.refreshService = false;
      }

      const cleanupStats = this.cleanupService.getStats();
      if (!cleanupStats.nextCleanupTime) {
        issues.push('Token cleanup service is not scheduled');
        services.cleanupService = false;
      }

      // Determine overall status
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (issues.length === 0) {
        status = 'healthy';
      } else if (services.tokenManager && services.googleProvider) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return { status, services, issues };
    } catch (error) {
      return {
        status: 'unhealthy',
        services: {
          tokenManager: false,
          refreshService: false,
          cleanupService: false,
          googleProvider: false
        },
        issues: [`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Graceful shutdown of all services
   */
  async shutdown(): Promise<void> {
    logger.debug("Shutting down OAuth service...");
    
    try {
      // Stop background services
      this.stopServices();
      
      // Perform final cleanup if needed
      await this.performCleanup();
      
      logger.debug("OAuth service shutdown complete");
    } catch (error) {
      logger.error("Error during OAuth service shutdown:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}