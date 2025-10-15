/**
 * Token manager that handles automatic refresh and concurrent request management
 */

import { TokenStorage, TokenData } from './types';
import { SecureTokenStorage } from './tokenStorage';

export class TokenManager {
  private tokenStorage: TokenStorage;
  private refreshPromises: Map<string, Promise<TokenData>> = new Map();
  private refreshTimeoutMs = 5 * 60 * 1000; // 5 minutes before expiry

  constructor(encryptionKey: string) {
    this.tokenStorage = new SecureTokenStorage(encryptionKey);
  }

  /**
   * Gets valid tokens, automatically refreshing if needed
   */
  async getValidTokens(userId: string): Promise<TokenData | null> {
    try {
      const tokens = await this.tokenStorage.getTokens(userId);
      
      if (!tokens) {
        return null;
      }

      // Check if tokens need refresh (refresh 5 minutes before expiry)
      const now = new Date();
      const refreshTime = new Date(tokens.expiresAt.getTime() - this.refreshTimeoutMs);
      
      if (now >= refreshTime) {
        return await this.refreshTokensWithConcurrencyControl(userId);
      }

      return tokens;
    } catch (error) {
      throw new Error(`Failed to get valid tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stores tokens using the secure storage
   */
  async storeTokens(userId: string, tokens: TokenData): Promise<void> {
    return this.tokenStorage.storeTokens(userId, tokens);
  }

  /**
   * Refreshes tokens with concurrency control to prevent multiple simultaneous refreshes
   */
  async refreshTokensWithConcurrencyControl(userId: string): Promise<TokenData> {
    // Check if there's already a refresh in progress for this user
    const existingPromise = this.refreshPromises.get(userId);
    if (existingPromise) {
      return existingPromise;
    }

    // Create new refresh promise
    const refreshPromise = this.performTokenRefresh(userId);
    this.refreshPromises.set(userId, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // Clean up the promise regardless of success/failure
      this.refreshPromises.delete(userId);
    }
  }

  /**
   * Performs the actual token refresh
   */
  private async performTokenRefresh(userId: string): Promise<TokenData> {
    try {
      return await this.tokenStorage.refreshTokens(userId);
    } catch (error) {
      throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revokes tokens and clears from storage
   */
  async revokeTokens(userId: string): Promise<void> {
    // Cancel any pending refresh for this user
    this.refreshPromises.delete(userId);
    
    return this.tokenStorage.revokeTokens(userId);
  }

  /**
   * Checks if user has valid tokens
   */
  async hasValidTokens(userId: string): Promise<boolean> {
    try {
      const tokens = await this.getValidTokens(userId);
      return tokens !== null;
    } catch {
      return false;
    }
  }

  /**
   * Gets token expiration time
   */
  async getTokenExpiration(userId: string): Promise<Date | null> {
    try {
      const tokens = await this.tokenStorage.getTokens(userId);
      return tokens?.expiresAt || null;
    } catch {
      return null;
    }
  }

  /**
   * Cleans up expired tokens (should be called periodically)
   */
  async cleanupExpiredTokens(): Promise<void> {
    return this.tokenStorage.cleanupExpiredTokens();
  }

  /**
   * Validates that the token manager is properly configured
   */
  validateConfiguration(): boolean {
    try {
      // Check if required environment variables are present
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
      
      return !!(clientId && clientSecret);
    } catch {
      return false;
    }
  }

  /**
   * Gets token statistics for monitoring
   */
  async getTokenStats(userId: string): Promise<{
    hasTokens: boolean;
    expiresAt: Date | null;
    needsRefresh: boolean;
    timeUntilExpiry: number | null;
  }> {
    try {
      const tokens = await this.tokenStorage.getTokens(userId);
      
      if (!tokens) {
        return {
          hasTokens: false,
          expiresAt: null,
          needsRefresh: false,
          timeUntilExpiry: null
        };
      }

      const now = new Date();
      const timeUntilExpiry = tokens.expiresAt.getTime() - now.getTime();
      const needsRefresh = timeUntilExpiry <= this.refreshTimeoutMs;

      return {
        hasTokens: true,
        expiresAt: tokens.expiresAt,
        needsRefresh,
        timeUntilExpiry
      };
    } catch {
      return {
        hasTokens: false,
        expiresAt: null,
        needsRefresh: false,
        timeUntilExpiry: null
      };
    }
  }
}