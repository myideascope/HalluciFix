/**
 * Automatic token refresh service with background scheduling
 */

import { TokenManager } from './tokenManager';

export interface RefreshSchedulerConfig {
  checkIntervalMs: number; // How often to check for tokens needing refresh
  refreshBufferMs: number; // How long before expiry to refresh tokens
  maxRetries: number; // Maximum retry attempts for failed refreshes
  retryDelayMs: number; // Base delay between retries (exponential backoff)
}

export class TokenRefreshService {
  private tokenManager: TokenManager;
  private config: RefreshSchedulerConfig;
  private refreshInterval: NodeJS.Timeout | null = null;
  private activeRefreshes: Set<string> = new Set();
  private retryAttempts: Map<string, number> = new Map();

  constructor(tokenManager: TokenManager, config?: Partial<RefreshSchedulerConfig>) {
    this.tokenManager = tokenManager;
    this.config = {
      checkIntervalMs: 5 * 60 * 1000, // Check every 5 minutes
      refreshBufferMs: 10 * 60 * 1000, // Refresh 10 minutes before expiry
      maxRetries: 3,
      retryDelayMs: 30 * 1000, // 30 seconds base delay
      ...config
    };
  }

  /**
   * Starts the automatic token refresh scheduler
   */
  startScheduler(): void {
    if (this.refreshInterval) {
      return; // Already running
    }

    this.refreshInterval = setInterval(() => {
      this.checkAndRefreshTokens().catch(error => {
        console.error('Token refresh scheduler error:', error);
      });
    }, this.config.checkIntervalMs);

    console.log('Token refresh scheduler started');
  }

  /**
   * Stops the automatic token refresh scheduler
   */
  stopScheduler(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('Token refresh scheduler stopped');
    }
  }

  /**
   * Manually triggers token refresh for a specific user
   */
  async refreshUserTokens(userId: string): Promise<boolean> {
    if (this.activeRefreshes.has(userId)) {
      console.log(`Token refresh already in progress for user ${userId}`);
      return false;
    }

    try {
      this.activeRefreshes.add(userId);
      await this.tokenManager.refreshTokensWithConcurrencyControl(userId);
      this.retryAttempts.delete(userId); // Reset retry count on success
      return true;
    } catch (error) {
      console.error(`Failed to refresh tokens for user ${userId}:`, error);
      await this.handleRefreshFailure(userId, error);
      return false;
    } finally {
      this.activeRefreshes.delete(userId);
    }
  }

  /**
   * Checks all users' tokens and refreshes those that need it
   */
  private async checkAndRefreshTokens(): Promise<void> {
    try {
      // Get list of users with tokens that might need refresh
      const usersNeedingRefresh = await this.getUsersNeedingRefresh();
      
      if (usersNeedingRefresh.length === 0) {
        return;
      }

      console.log(`Checking ${usersNeedingRefresh.length} users for token refresh`);

      // Process users in batches to avoid overwhelming the system
      const batchSize = 5;
      for (let i = 0; i < usersNeedingRefresh.length; i += batchSize) {
        const batch = usersNeedingRefresh.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(userId => this.refreshUserTokensIfNeeded(userId))
        );
      }
    } catch (error) {
      console.error('Error during token refresh check:', error);
    }
  }

  /**
   * Refreshes tokens for a user if they need it
   */
  private async refreshUserTokensIfNeeded(userId: string): Promise<void> {
    try {
      const stats = await this.tokenManager.getTokenStats(userId);
      
      if (!stats.hasTokens) {
        return; // No tokens to refresh
      }

      if (!stats.needsRefresh && stats.timeUntilExpiry && stats.timeUntilExpiry > this.config.refreshBufferMs) {
        return; // Tokens don't need refresh yet
      }

      await this.refreshUserTokens(userId);
    } catch (error) {
      console.error(`Error checking refresh need for user ${userId}:`, error);
    }
  }

  /**
   * Gets list of users that might need token refresh
   * This is a simplified implementation - in a real app, you'd query the database
   */
  private async getUsersNeedingRefresh(): Promise<string[]> {
    // In a real implementation, this would query the database for users with tokens
    // that are approaching expiry. For now, we'll return an empty array since
    // we don't have a way to enumerate all users with tokens.
    return [];
  }

  /**
   * Handles refresh failures with retry logic
   */
  private async handleRefreshFailure(userId: string, error: any): Promise<void> {
    const currentAttempts = this.retryAttempts.get(userId) || 0;
    const newAttempts = currentAttempts + 1;

    if (newAttempts >= this.config.maxRetries) {
      console.error(`Max retry attempts reached for user ${userId}, giving up`);
      this.retryAttempts.delete(userId);
      
      // Optionally notify the user or trigger re-authentication
      await this.handleMaxRetriesReached(userId, error);
      return;
    }

    this.retryAttempts.set(userId, newAttempts);
    
    // Schedule retry with exponential backoff
    const delay = this.config.retryDelayMs * Math.pow(2, currentAttempts);
    console.log(`Scheduling retry ${newAttempts}/${this.config.maxRetries} for user ${userId} in ${delay}ms`);
    
    setTimeout(() => {
      this.refreshUserTokens(userId).catch(error => {
        console.error(`Retry ${newAttempts} failed for user ${userId}:`, error);
      });
    }, delay);
  }

  /**
   * Handles the case when max retries are reached
   */
  private async handleMaxRetriesReached(userId: string, error: any): Promise<void> {
    // Log the failure for monitoring
    console.error(`Token refresh failed permanently for user ${userId}:`, error);
    
    // In a real implementation, you might:
    // 1. Send a notification to the user
    // 2. Mark the user as needing re-authentication
    // 3. Trigger an alert for administrators
    // 4. Clean up the failed tokens
    
    try {
      // Clean up failed tokens to prevent further refresh attempts
      await this.tokenManager.revokeTokens(userId);
    } catch (cleanupError) {
      console.error(`Failed to cleanup tokens for user ${userId}:`, cleanupError);
    }
  }

  /**
   * Gets refresh service statistics
   */
  getStats(): {
    isRunning: boolean;
    activeRefreshes: number;
    pendingRetries: number;
    config: RefreshSchedulerConfig;
  } {
    return {
      isRunning: this.refreshInterval !== null,
      activeRefreshes: this.activeRefreshes.size,
      pendingRetries: this.retryAttempts.size,
      config: this.config
    };
  }

  /**
   * Updates the refresh configuration
   */
  updateConfig(newConfig: Partial<RefreshSchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart scheduler if it's running to apply new interval
    if (this.refreshInterval) {
      this.stopScheduler();
      this.startScheduler();
    }
  }

  /**
   * Clears all retry attempts (useful for testing or manual intervention)
   */
  clearRetryAttempts(): void {
    this.retryAttempts.clear();
  }
}