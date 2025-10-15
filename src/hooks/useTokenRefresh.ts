/**
 * React hook for managing automatic token refresh
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { TokenManager } from '../lib/oauth/tokenManager';
import { TokenRefreshService } from '../lib/oauth/tokenRefreshService';

interface UseTokenRefreshOptions {
  userId?: string;
  encryptionKey: string;
  autoStart?: boolean;
  onRefreshSuccess?: (userId: string) => void;
  onRefreshFailure?: (userId: string, error: Error) => void;
  onMaxRetriesReached?: (userId: string) => void;
}

interface TokenRefreshState {
  isRefreshing: boolean;
  lastRefreshTime: Date | null;
  refreshCount: number;
  error: Error | null;
}

export function useTokenRefresh(options: UseTokenRefreshOptions) {
  const {
    userId,
    encryptionKey,
    autoStart = true,
    onRefreshSuccess,
    onRefreshFailure,
    onMaxRetriesReached
  } = options;

  const tokenManagerRef = useRef<TokenManager | null>(null);
  const refreshServiceRef = useRef<TokenRefreshService | null>(null);
  
  const [state, setState] = useState<TokenRefreshState>({
    isRefreshing: false,
    lastRefreshTime: null,
    refreshCount: 0,
    error: null
  });

  // Initialize services
  useEffect(() => {
    if (!encryptionKey) return;

    try {
      tokenManagerRef.current = new TokenManager(encryptionKey);
      refreshServiceRef.current = new TokenRefreshService(tokenManagerRef.current);

      if (autoStart) {
        refreshServiceRef.current.startScheduler();
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to initialize token services')
      }));
    }

    return () => {
      if (refreshServiceRef.current) {
        refreshServiceRef.current.stopScheduler();
      }
    };
  }, [encryptionKey, autoStart]);

  // Manual refresh function
  const refreshTokens = useCallback(async (targetUserId?: string): Promise<boolean> => {
    const userIdToRefresh = targetUserId || userId;
    
    if (!userIdToRefresh || !refreshServiceRef.current) {
      return false;
    }

    setState(prev => ({ ...prev, isRefreshing: true, error: null }));

    try {
      const success = await refreshServiceRef.current.refreshUserTokens(userIdToRefresh);
      
      setState(prev => ({
        ...prev,
        isRefreshing: false,
        lastRefreshTime: new Date(),
        refreshCount: prev.refreshCount + 1,
        error: null
      }));

      if (success && onRefreshSuccess) {
        onRefreshSuccess(userIdToRefresh);
      }

      return success;
    } catch (error) {
      const refreshError = error instanceof Error ? error : new Error('Token refresh failed');
      
      setState(prev => ({
        ...prev,
        isRefreshing: false,
        error: refreshError
      }));

      if (onRefreshFailure) {
        onRefreshFailure(userIdToRefresh, refreshError);
      }

      return false;
    }
  }, [userId, onRefreshSuccess, onRefreshFailure]);

  // Check if tokens are valid
  const checkTokenValidity = useCallback(async (targetUserId?: string): Promise<boolean> => {
    const userIdToCheck = targetUserId || userId;
    
    if (!userIdToCheck || !tokenManagerRef.current) {
      return false;
    }

    try {
      return await tokenManagerRef.current.hasValidTokens(userIdToCheck);
    } catch {
      return false;
    }
  }, [userId]);

  // Get token statistics
  const getTokenStats = useCallback(async (targetUserId?: string) => {
    const userIdToCheck = targetUserId || userId;
    
    if (!userIdToCheck || !tokenManagerRef.current) {
      return null;
    }

    try {
      return await tokenManagerRef.current.getTokenStats(userIdToCheck);
    } catch {
      return null;
    }
  }, [userId]);

  // Start/stop scheduler
  const startScheduler = useCallback(() => {
    if (refreshServiceRef.current) {
      refreshServiceRef.current.startScheduler();
    }
  }, []);

  const stopScheduler = useCallback(() => {
    if (refreshServiceRef.current) {
      refreshServiceRef.current.stopScheduler();
    }
  }, []);

  // Get service statistics
  const getServiceStats = useCallback(() => {
    return refreshServiceRef.current?.getStats() || null;
  }, []);

  // Revoke tokens
  const revokeTokens = useCallback(async (targetUserId?: string): Promise<void> => {
    const userIdToRevoke = targetUserId || userId;
    
    if (!userIdToRevoke || !tokenManagerRef.current) {
      return;
    }

    try {
      await tokenManagerRef.current.revokeTokens(userIdToRevoke);
      setState(prev => ({
        ...prev,
        lastRefreshTime: null,
        refreshCount: 0,
        error: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Token revocation failed')
      }));
      throw error;
    }
  }, [userId]);

  return {
    // State
    isRefreshing: state.isRefreshing,
    lastRefreshTime: state.lastRefreshTime,
    refreshCount: state.refreshCount,
    error: state.error,
    
    // Actions
    refreshTokens,
    checkTokenValidity,
    getTokenStats,
    revokeTokens,
    
    // Scheduler control
    startScheduler,
    stopScheduler,
    getServiceStats,
    
    // Services (for advanced usage)
    tokenManager: tokenManagerRef.current,
    refreshService: refreshServiceRef.current
  };
}

// Helper hook for simpler use cases
export function useSimpleTokenRefresh(userId: string, encryptionKey: string) {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const {
    refreshTokens,
    checkTokenValidity,
    isRefreshing,
    error
  } = useTokenRefresh({
    userId,
    encryptionKey,
    autoStart: true,
    onRefreshSuccess: () => setIsValid(true),
    onRefreshFailure: () => setIsValid(false)
  });

  // Check validity on mount and when userId changes
  useEffect(() => {
    if (!userId) return;

    setIsChecking(true);
    checkTokenValidity()
      .then(setIsValid)
      .finally(() => setIsChecking(false));
  }, [userId, checkTokenValidity]);

  return {
    isValid,
    isChecking,
    isRefreshing,
    error,
    refreshTokens,
    checkTokenValidity
  };
}