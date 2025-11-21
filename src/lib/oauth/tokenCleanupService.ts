/**
 * Token cleanup service for managing token lifecycle and cleanup operations
 */

import { TokenManager } from './tokenManager';
import { supabase } from '../supabase';

import { logger } from './logging';
export interface CleanupConfig {
  cleanupIntervalMs: number; // How often to run cleanup
  expiredTokenGracePeriodMs: number; // Grace period before deleting expired tokens
  auditLogRetentionMs: number; // How long to keep audit logs
  batchSize: number; // Number of records to process in each batch
}

export interface CleanupStats {
  expiredTokensRemoved: number;
  auditLogsRemoved: number;
  statesRemoved: number;
  lastCleanupTime: Date | null;
  nextCleanupTime: Date | null;
}

export class TokenCleanupService {
  private tokenManager: TokenManager;
  private config: CleanupConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats: CleanupStats;

  constructor(tokenManager: TokenManager, config?: Partial<CleanupConfig>) {
    this.tokenManager = tokenManager;
    this.config = {
      cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
      expiredTokenGracePeriodMs: 24 * 60 * 60 * 1000, // 24 hours
      auditLogRetentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days
      batchSize: 100,
      ...config
    };

    this.stats = {
      expiredTokensRemoved: 0,
      auditLogsRemoved: 0,
      statesRemoved: 0,
      lastCleanupTime: null,
      nextCleanupTime: null
    };
  }

  /**
   * Starts the automatic cleanup scheduler
   */
  startCleanupScheduler(): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    this.cleanupInterval = setInterval(() => {
      this.performCleanup().catch(error => {
        logger.error("Token cleanup error:", error instanceof Error ? error : new Error(String(error)));
      });
    }, this.config.cleanupIntervalMs);

    // Update next cleanup time
    this.stats.nextCleanupTime = new Date(Date.now() + this.config.cleanupIntervalMs);

    logger.debug("Token cleanup scheduler started");
  }

  /**
   * Stops the automatic cleanup scheduler
   */
  stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.stats.nextCleanupTime = null;
      logger.debug("Token cleanup scheduler stopped");
    }
  }

  /**
   * Manually triggers a cleanup operation
   */
  async performCleanup(): Promise<CleanupStats> {
    logger.info("Starting token cleanup operation");
    const startTime = Date.now();

    try {
      // Clean up expired tokens
      const expiredTokensRemoved = await this.cleanupExpiredTokens();
      
      // Clean up expired OAuth states
      const statesRemoved = await this.cleanupExpiredStates();
      
      // Clean up old audit logs
      const auditLogsRemoved = await this.cleanupOldAuditLogs();

      // Update stats
      this.stats.expiredTokensRemoved += expiredTokensRemoved;
      this.stats.auditLogsRemoved += auditLogsRemoved;
      this.stats.statesRemoved += statesRemoved;
      this.stats.lastCleanupTime = new Date();
      
      if (this.cleanupInterval) {
        this.stats.nextCleanupTime = new Date(Date.now() + this.config.cleanupIntervalMs);
      }

      const duration = Date.now() - startTime;
      console.log(`Token cleanup completed in ${duration}ms:`, {
        expiredTokensRemoved,
        statesRemoved,
        auditLogsRemoved
      });

      return { ...this.stats };
    } catch (error) {
      logger.error("Token cleanup failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Revokes tokens for a specific user with comprehensive cleanup
   */
  async revokeUserTokens(userId: string, reason?: string): Promise<void> {
    try {
      // Log the revocation event
      await this.logRevocationEvent(userId, reason);

      // Revoke tokens using the token manager
      await this.tokenManager.revokeTokens(userId);

      // Clean up any related OAuth states for this user
      await this.cleanupUserStates(userId);

      console.log(`Successfully revoked tokens for user ${userId}`);
    } catch (error) {
      console.error(`Failed to revoke tokens for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Revokes all tokens (emergency cleanup)
   */
  async revokeAllTokens(reason: string): Promise<number> {
    try {
      logger.info("Starting emergency token revocation for all users");

      // Get all users with tokens
      const { data: userTokens, error } = await supabase
        .from('user_tokens')
        .select('user_id')
        .eq('provider', 'google');

      if (error) {
        throw new Error(`Failed to fetch user tokens: ${error.message}`);
      }

      if (!userTokens || userTokens.length === 0) {
        return 0;
      }

      // Process in batches
      let revokedCount = 0;
      const batchSize = this.config.batchSize;

      for (let i = 0; i < userTokens.length; i += batchSize) {
        const batch = userTokens.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (token) => {
            try {
              await this.revokeUserTokens(token.user_id, reason);
              revokedCount++;
            } catch (error) {
              console.error(`Failed to revoke tokens for user ${token.user_id}:`, error);
            }
          })
        );
      }

      console.log(`Emergency revocation completed: ${revokedCount} users processed`);
      return revokedCount;
    } catch (error) {
      logger.error("Emergency token revocation failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Cleans up expired tokens with grace period
   */
  private async cleanupExpiredTokens(): Promise<number> {
    const cutoffTime = new Date(Date.now() - this.config.expiredTokenGracePeriodMs);

    const { error, count } = await supabase
      .from('user_tokens')
      .delete({ count: 'exact' })
      .lt('expires_at', cutoffTime.toISOString());

    if (error) {
      throw new Error(`Failed to cleanup expired tokens: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Cleans up expired OAuth states
   */
  private async cleanupExpiredStates(): Promise<number> {
    const { error, count } = await supabase
      .from('oauth_states')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());

    if (error) {
      throw new Error(`Failed to cleanup expired states: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Cleans up old audit logs
   */
  private async cleanupOldAuditLogs(): Promise<number> {
    const cutoffTime = new Date(Date.now() - this.config.auditLogRetentionMs);

    const { error, count } = await supabase
      .from('oauth_audit_log')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffTime.toISOString());

    if (error) {
      throw new Error(`Failed to cleanup old audit logs: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Cleans up OAuth states for a specific user
   */
  private async cleanupUserStates(userId: string): Promise<void> {
    // Note: OAuth states don't directly reference users, but we can clean up
    // any expired states as part of user cleanup
    await this.cleanupExpiredStates();
  }

  /**
   * Logs a token revocation event
   */
  private async logRevocationEvent(userId: string, reason?: string): Promise<void> {
    try {
      await supabase
        .from('oauth_audit_log')
        .insert({
          user_id: userId,
          event_type: 'token_revoked',
          provider: 'google',
          metadata: {
            reason: reason || 'Manual revocation',
            timestamp: new Date().toISOString()
          },
          user_agent: navigator.userAgent
        });
    } catch (error) {
      logger.warn("Failed to log revocation event:", { error });
    }
  }

  /**
   * Gets cleanup statistics
   */
  getStats(): CleanupStats {
    return { ...this.stats };
  }

  /**
   * Resets cleanup statistics
   */
  resetStats(): void {
    this.stats = {
      expiredTokensRemoved: 0,
      auditLogsRemoved: 0,
      statesRemoved: 0,
      lastCleanupTime: this.stats.lastCleanupTime,
      nextCleanupTime: this.stats.nextCleanupTime
    };
  }

  /**
   * Updates cleanup configuration
   */
  updateConfig(newConfig: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart scheduler if it's running to apply new interval
    if (this.cleanupInterval) {
      this.stopCleanupScheduler();
      this.startCleanupScheduler();
    }
  }

  /**
   * Gets detailed cleanup information for monitoring
   */
  async getCleanupInfo(): Promise<{
    config: CleanupConfig;
    stats: CleanupStats;
    isRunning: boolean;
    tokenCounts: {
      total: number;
      expired: number;
      expiringSoon: number;
    };
    stateCounts: {
      total: number;
      expired: number;
    };
  }> {
    try {
      // Get token counts
      const [totalTokens, expiredTokens, expiringSoonTokens] = await Promise.all([
        this.getTokenCount(),
        this.getExpiredTokenCount(),
        this.getExpiringSoonTokenCount()
      ]);

      // Get state counts
      const [totalStates, expiredStates] = await Promise.all([
        this.getStateCount(),
        this.getExpiredStateCount()
      ]);

      return {
        config: this.config,
        stats: this.getStats(),
        isRunning: this.cleanupInterval !== null,
        tokenCounts: {
          total: totalTokens,
          expired: expiredTokens,
          expiringSoon: expiringSoonTokens
        },
        stateCounts: {
          total: totalStates,
          expired: expiredStates
        }
      };
    } catch (error) {
      logger.error("Failed to get cleanup info:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Helper methods for getting counts
  private async getTokenCount(): Promise<number> {
    const { count, error } = await supabase
      .from('user_tokens')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  }

  private async getExpiredTokenCount(): Promise<number> {
    const { count, error } = await supabase
      .from('user_tokens')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString());
    
    if (error) throw error;
    return count || 0;
  }

  private async getExpiringSoonTokenCount(): Promise<number> {
    const soonTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    const { count, error } = await supabase
      .from('user_tokens')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', soonTime.toISOString())
      .gte('expires_at', new Date().toISOString());
    
    if (error) throw error;
    return count || 0;
  }

  private async getStateCount(): Promise<number> {
    const { count, error } = await supabase
      .from('oauth_states')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  }

  private async getExpiredStateCount(): Promise<number> {
    const { count, error } = await supabase
      .from('oauth_states')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString());
    
    if (error) throw error;
    return count || 0;
  }
}