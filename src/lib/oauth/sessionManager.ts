import { supabase } from '../supabase';
import { User } from '../../types/user';
import { UserProfile } from './types';
import { JWTTokenManager, TokenPair } from './jwtTokenManager';

import { logger } from '../logging';
/**
 * Enhanced session management for OAuth authentication with JWT integration
 */
export class SessionManager {
  private static readonly SESSION_KEY = 'hallucifix_oauth_session';
  private static readonly USER_KEY = 'hallucifix_user_data';
  private static readonly JWT_ACCESS_TOKEN_KEY = 'hallucifix_jwt_access_token';
  private static readonly JWT_REFRESH_TOKEN_KEY = 'hallucifix_jwt_refresh_token';
  
  private static jwtManager = new JWTTokenManager();

  /**
   * Create a user session after successful OAuth with JWT integration
   */
  static async createSession(oauthUser: UserProfile, oauthTokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string;
  }): Promise<User> {
    try {
      // First, try to find existing user in our database
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', oauthUser.email)
        .single();

      let userId: string;
      let userData: any;

      if (existingUser && !fetchError) {
        // Update existing user with latest OAuth data
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            name: oauthUser.name,
            avatar_url: oauthUser.picture,
            google_id: oauthUser.id,
            last_active: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Failed to update user: ${updateError.message}`);
        }

        userId = existingUser.id;
        userData = updatedUser;
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email: oauthUser.email,
            name: oauthUser.name,
            avatar_url: oauthUser.picture,
            google_id: oauthUser.id,
            role_id: 'user', // Default role
            department: 'General',
            status: 'active',
            last_active: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          throw new Error(`Failed to create user: ${createError.message}`);
        }

        userId = newUser.id;
        userData = newUser;
      }

      // Get session metadata
      const sessionMetadata = {
        ipAddress: await this.getClientIP(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
      };

      // Create JWT token pair for session management
      const jwtTokens = await this.jwtManager.createTokenPair(
        userId,
        oauthUser.email,
        oauthUser.name,
        'google',
        oauthTokens.scope,
        oauthUser.picture,
        sessionMetadata
      );

      // Create Supabase auth session using OAuth tokens
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: oauthTokens.accessToken,
        refresh_token: oauthTokens.refreshToken
      });

      if (sessionError) {
        throw new Error(`Failed to create Supabase session: ${sessionError.message}`);
      }

      // Store session info locally for quick access
      const sessionData = {
        userId,
        email: oauthUser.email,
        name: oauthUser.name,
        avatar: oauthUser.picture,
        provider: 'google',
        scope: oauthTokens.scope,
        oauthExpiresAt: oauthTokens.expiresAt.toISOString(),
        jwtExpiresAt: new Date(Date.now() + jwtTokens.expiresIn * 1000).toISOString(),
        createdAt: new Date().toISOString()
      };

      // Store session and JWT tokens securely
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
      localStorage.setItem(this.USER_KEY, JSON.stringify(userData));
      
      // Store JWT tokens securely (consider using secure storage in production)
      this.storeJWTTokens(jwtTokens);

      // Convert to our User type
      return this.convertToAppUser(userData);
    } catch (error) {
      logger.error("Session creation failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get current session info
   */
  static getSessionInfo(): {
    userId: string;
    email: string;
    name: string;
    avatar?: string;
    expiresAt: Date;
    createdAt: Date;
  } | null {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      if (!sessionData) return null;

      const parsed = JSON.parse(sessionData);
      return {
        ...parsed,
        expiresAt: new Date(parsed.expiresAt),
        createdAt: new Date(parsed.createdAt)
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if session is valid
   */
  static isSessionValid(): boolean {
    const session = this.getSessionInfo();
    if (!session) return false;

    // Check if session has expired
    return new Date() < session.expiresAt;
  }

  /**
   * Clear session data including JWT tokens
   */
  static async clearSession(): Promise<void> {
    try {
      // Get current session to revoke JWT session
      const session = this.getSessionInfo();
      if (session && session.userId) {
        // Revoke all JWT sessions for the user
        await this.jwtManager.revokeAllUserSessions(session.userId);
      }
    } catch (error) {
      logger.warn("Failed to revoke JWT sessions during logout:", { error });
    }

    // Clear local storage
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.JWT_ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.JWT_REFRESH_TOKEN_KEY);
  }

  /**
   * Get stored user data
   */
  static getStoredUser(): User | null {
    try {
      const userData = localStorage.getItem(this.USER_KEY);
      if (!userData) return null;

      const parsed = JSON.parse(userData);
      return this.convertToAppUser(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Update stored user data
   */
  static updateStoredUser(userData: any): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(userData));
  }

  /**
   * Convert database user to app User type
   */
  private static convertToAppUser(userData: any): User {
    // Define role mapping
    const roleMapping: Record<string, { name: string; level: number; permissions: any[] }> = {
      'admin': { name: 'admin', level: 1, permissions: [] },
      'manager': { name: 'manager', level: 2, permissions: [] },
      'user': { name: 'user', level: 3, permissions: [] }
    };

    const role = roleMapping[userData.role] || roleMapping['user'];

    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      avatar: userData.avatar,
      role,
      department: userData.department || 'General',
      status: userData.status || 'active',
      lastActive: userData.last_active || new Date().toISOString(),
      createdAt: userData.created_at,
      permissions: role.permissions
    };
  }

  /**
   * Refresh session with new token data
   */
  static async refreshSession(tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }): Promise<void> {
    const session = this.getSessionInfo();
    if (!session) {
      throw new Error('No active session to refresh');
    }

    // Update Supabase session
    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken
    });

    if (error) {
      throw new Error(`Failed to refresh Supabase session: ${error.message}`);
    }

    // Update local session data
    const updatedSession = {
      ...session,
      expiresAt: tokens.expiresAt.toISOString()
    };

    localStorage.setItem(this.SESSION_KEY, JSON.stringify(updatedSession));
  }

  /**
   * Handle session expiry
   */
  static handleSessionExpiry(): void {
    logger.warn("Session has expired");
    this.clearSession();
    
    // Redirect to login or show re-authentication prompt
    // This could be customized based on app requirements
    window.location.reload();
  }

  /**
   * Monitor session validity including JWT token validation
   */
  static startSessionMonitoring(): () => void {
    const checkInterval = 60000; // Check every minute
    
    const intervalId = setInterval(async () => {
      if (!this.isSessionValid()) {
        this.handleSessionExpiry();
        return;
      }

      // Check JWT token validity and refresh if needed
      try {
        await this.ensureValidJWTToken();
      } catch (error) {
        logger.warn("JWT token validation failed:", { error });
        this.handleSessionExpiry();
      }
    }, checkInterval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }

  /**
   * Store JWT tokens securely
   */
  private static storeJWTTokens(tokens: TokenPair): void {
    // In production, consider using more secure storage methods
    // For now, using localStorage with the understanding that JWT tokens are short-lived
    localStorage.setItem(this.JWT_ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(this.JWT_REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  /**
   * Get stored JWT access token
   */
  static getJWTAccessToken(): string | null {
    return localStorage.getItem(this.JWT_ACCESS_TOKEN_KEY);
  }

  /**
   * Get stored JWT refresh token
   */
  static getJWTRefreshToken(): string | null {
    return localStorage.getItem(this.JWT_REFRESH_TOKEN_KEY);
  }

  /**
   * Validate current JWT token and refresh if needed
   */
  static async ensureValidJWTToken(): Promise<string | null> {
    const accessToken = this.getJWTAccessToken();
    
    if (!accessToken) {
      return null;
    }

    // Validate current access token
    const payload = await this.jwtManager.validateToken(accessToken);
    
    if (payload) {
      return accessToken; // Token is still valid
    }

    // Try to refresh the token
    const refreshToken = this.getJWTRefreshToken();
    if (!refreshToken) {
      return null;
    }

    const newTokens = await this.jwtManager.refreshAccessToken(refreshToken);
    if (!newTokens) {
      return null;
    }

    // Store new tokens
    this.storeJWTTokens(newTokens);
    
    return newTokens.accessToken;
  }

  /**
   * Get current JWT payload if token is valid
   */
  static async getCurrentJWTPayload() {
    const accessToken = await this.ensureValidJWTToken();
    if (!accessToken) {
      return null;
    }

    return await this.jwtManager.validateToken(accessToken);
  }

  /**
   * Get user's active sessions
   */
  static async getUserSessions(): Promise<any[]> {
    const session = this.getSessionInfo();
    if (!session?.userId) {
      return [];
    }

    try {
      return await this.jwtManager.getUserSessions(session.userId);
    } catch (error) {
      logger.warn("Failed to get user sessions:", { error });
      return [];
    }
  }

  /**
   * Revoke a specific session
   */
  static async revokeSession(sessionId: string): Promise<void> {
    const session = this.getSessionInfo();
    if (!session?.userId) {
      throw new Error('No active session');
    }

    await this.jwtManager.revokeSession(sessionId, session.userId);
  }

  /**
   * Get client IP address (best effort)
   */
  private static async getClientIP(): Promise<string | undefined> {
    try {
      // This is a simple approach - in production you might want to use a more reliable service
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return undefined;
    }
  }

  /**
   * Enhanced session validation including JWT tokens
   */
  static async isSessionFullyValid(): Promise<boolean> {
    // Check basic session validity
    if (!this.isSessionValid()) {
      return false;
    }

    // Check JWT token validity
    try {
      const jwtToken = await this.ensureValidJWTToken();
      return jwtToken !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get comprehensive session status
   */
  static async getSessionStatus() {
    const basicSession = this.getSessionInfo();
    const jwtPayload = await this.getCurrentJWTPayload();
    const sessions = await this.getUserSessions();

    return {
      hasBasicSession: !!basicSession,
      basicSessionValid: this.isSessionValid(),
      hasJWTToken: !!this.getJWTAccessToken(),
      jwtTokenValid: !!jwtPayload,
      fullyValid: await this.isSessionFullyValid(),
      activeSessions: sessions.length,
      currentSession: basicSession,
      jwtPayload
    };
  }
}