/**
 * JWT Token Manager for secure session management
 * Integrates with OAuth tokens and provides JWT-based session tokens
 */

import { supabase } from '../supabase';
import { config } from '../env';
import { TokenEncryptionService } from './tokenEncryption';

import { logger } from '../logging';
export interface JWTPayload {
  sub: string; // User ID
  email: string;
  name: string;
  picture?: string;
  iat: number; // Issued at
  exp: number; // Expires at
  aud: string; // Audience
  iss: string; // Issuer
  jti: string; // JWT ID (unique identifier)
  scope: string; // OAuth scopes
  provider: string; // OAuth provider
  session_id: string; // Session identifier
}

export interface RefreshTokenPayload {
  sub: string; // User ID
  jti: string; // JWT ID
  session_id: string; // Session identifier
  iat: number; // Issued at
  exp: number; // Expires at
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface SessionData {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  picture?: string;
  provider: string;
  scope: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class JWTTokenManager {
  private encryptionService: TokenEncryptionService;
  private readonly accessTokenExpiryMs = 15 * 60 * 1000; // 15 minutes
  private readonly refreshTokenExpiryMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly issuer = config.appUrl;
  private readonly audience = config.appName;

  constructor() {
    this.encryptionService = new TokenEncryptionService();
  }

  /**
   * Creates a new JWT token pair for a user session
   */
  async createTokenPair(
    userId: string,
    email: string,
    name: string,
    provider: string,
    scope: string,
    picture?: string,
    sessionMetadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<TokenPair> {
    try {
      const now = Date.now();
      const sessionId = this.generateSessionId();
      const jwtId = this.generateJwtId();

      // Create access token payload
      const accessPayload: JWTPayload = {
        sub: userId,
        email,
        name,
        picture,
        iat: Math.floor(now / 1000),
        exp: Math.floor((now + this.accessTokenExpiryMs) / 1000),
        aud: this.audience,
        iss: this.issuer,
        jti: jwtId,
        scope,
        provider,
        session_id: sessionId
      };

      // Create refresh token payload
      const refreshPayload: RefreshTokenPayload = {
        sub: userId,
        jti: this.generateJwtId(),
        session_id: sessionId,
        iat: Math.floor(now / 1000),
        exp: Math.floor((now + this.refreshTokenExpiryMs) / 1000),
        type: 'refresh'
      };

      // Generate tokens
      const accessToken = await this.signToken(accessPayload);
      const refreshToken = await this.signToken(refreshPayload);

      // Store session data
      await this.storeSession({
        sessionId,
        userId,
        email,
        name,
        picture,
        provider,
        scope,
        createdAt: new Date(now),
        expiresAt: new Date(now + this.refreshTokenExpiryMs),
        lastAccessedAt: new Date(now),
        ipAddress: sessionMetadata?.ipAddress,
        userAgent: sessionMetadata?.userAgent
      });

      // Store refresh token securely
      await this.storeRefreshToken(userId, sessionId, refreshToken);

      return {
        accessToken,
        refreshToken,
        expiresIn: Math.floor(this.accessTokenExpiryMs / 1000),
        tokenType: 'Bearer'
      };
    } catch (error) {
      throw new Error(`Failed to create token pair: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates and decodes a JWT token
   */
  async validateToken(token: string): Promise<JWTPayload | null> {
    try {
      const payload = await this.verifyToken(token);
      
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      // Validate token structure
      if (!this.isValidJWTPayload(payload)) {
        return null;
      }

      // Check if session is still valid
      const sessionValid = await this.isSessionValid(payload.session_id, payload.sub);
      if (!sessionValid) {
        return null;
      }

      // Update last accessed time
      await this.updateSessionAccess(payload.session_id);

      return payload as JWTPayload;
    } catch (error) {
      logger.warn("Token validation failed:", { error });
      return null;
    }
  }

  /**
   * Refreshes an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    try {
      const payload = await this.verifyToken(refreshToken);
      
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      // Validate refresh token structure
      if (!this.isValidRefreshTokenPayload(payload)) {
        return null;
      }

      const refreshPayload = payload as RefreshTokenPayload;

      // Check if session is still valid
      const sessionData = await this.getSessionData(refreshPayload.session_id);
      if (!sessionData || sessionData.userId !== refreshPayload.sub) {
        return null;
      }

      // Check if refresh token is still valid
      const storedRefreshToken = await this.getStoredRefreshToken(
        refreshPayload.sub, 
        refreshPayload.session_id
      );
      
      if (!storedRefreshToken || storedRefreshToken !== refreshToken) {
        return null;
      }

      // Create new token pair
      return await this.createTokenPair(
        sessionData.userId,
        sessionData.email,
        sessionData.name,
        sessionData.provider,
        sessionData.scope,
        sessionData.picture
      );
    } catch (error) {
      logger.warn("Token refresh failed:", { error });
      return null;
    }
  }

  /**
   * Revokes a session and all associated tokens
   */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    try {
      // Delete session data
      await supabase
        .from('jwt_sessions')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', userId);

      // Delete stored refresh tokens
      await supabase
        .from('jwt_refresh_tokens')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', userId);

      // Log session revocation
      await this.logSessionEvent(userId, sessionId, 'session_revoked');
    } catch (error) {
      throw new Error(`Failed to revoke session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revokes all sessions for a user
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    try {
      // Delete all session data for user
      await supabase
        .from('jwt_sessions')
        .delete()
        .eq('user_id', userId);

      // Delete all stored refresh tokens for user
      await supabase
        .from('jwt_refresh_tokens')
        .delete()
        .eq('user_id', userId);

      // Log session revocation
      await this.logSessionEvent(userId, 'all', 'all_sessions_revoked');
    } catch (error) {
      throw new Error(`Failed to revoke all sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const { data, error } = await supabase
        .from('jwt_sessions')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('last_accessed_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to get user sessions: ${error.message}`);
      }

      return (data || []).map(row => ({
        sessionId: row.session_id,
        userId: row.user_id,
        email: row.email,
        name: row.name,
        picture: row.picture,
        provider: row.provider,
        scope: row.scope,
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
        lastAccessedAt: new Date(row.last_accessed_at),
        ipAddress: row.ip_address,
        userAgent: row.user_agent
      }));
    } catch (error) {
      throw new Error(`Failed to get user sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleans up expired sessions and tokens
   */
  async cleanupExpiredSessions(): Promise<{ sessionsDeleted: number; tokensDeleted: number }> {
    try {
      const now = new Date().toISOString();

      // Delete expired sessions
      const { data: expiredSessions, error: sessionError } = await supabase
        .from('jwt_sessions')
        .delete()
        .lt('expires_at', now)
        .select('session_id');

      if (sessionError) {
        throw new Error(`Failed to cleanup expired sessions: ${sessionError.message}`);
      }

      // Delete expired refresh tokens
      const { data: expiredTokens, error: tokenError } = await supabase
        .from('jwt_refresh_tokens')
        .delete()
        .lt('expires_at', now)
        .select('id');

      if (tokenError) {
        throw new Error(`Failed to cleanup expired tokens: ${tokenError.message}`);
      }

      return {
        sessionsDeleted: expiredSessions?.length || 0,
        tokensDeleted: expiredTokens?.length || 0
      };
    } catch (error) {
      throw new Error(`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Signs a JWT token using HMAC-SHA256
   */
  private async signToken(payload: JWTPayload | RefreshTokenPayload): Promise<string> {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.createSignature(data);
    
    return `${data}.${signature}`;
  }

  /**
   * Verifies and decodes a JWT token
   */
  private async verifyToken(token: string): Promise<any> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    
    // Verify signature
    const expectedSignature = await this.createSignature(data);
    if (signature !== expectedSignature) {
      throw new Error('Invalid token signature');
    }

    // Decode payload
    const payload = JSON.parse(this.base64UrlDecode(encodedPayload));
    
    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error('Token expired');
    }

    return payload;
  }

  /**
   * Creates HMAC-SHA256 signature for JWT
   */
  private async createSignature(data: string): Promise<string> {
    const secret = config.oauth.sessionSecret || config.supabaseAnonKey;
    const encoder = new TextEncoder();
    
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return this.base64UrlEncode(new Uint8Array(signature));
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(data: string | Uint8Array): string {
    const base64 = typeof data === 'string' 
      ? btoa(data)
      : btoa(String.fromCharCode(...data));
    
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Base64 URL decode
   */
  private base64UrlDecode(data: string): string {
    let base64 = data
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const padding = base64.length % 4;
    if (padding) {
      base64 += '='.repeat(4 - padding);
    }
    
    return atob(base64);
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generates a unique JWT ID
   */
  private generateJwtId(): string {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validates JWT payload structure
   */
  private isValidJWTPayload(payload: any): payload is JWTPayload {
    return payload &&
      typeof payload.sub === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.name === 'string' &&
      typeof payload.iat === 'number' &&
      typeof payload.exp === 'number' &&
      typeof payload.session_id === 'string' &&
      typeof payload.provider === 'string';
  }

  /**
   * Validates refresh token payload structure
   */
  private isValidRefreshTokenPayload(payload: any): payload is RefreshTokenPayload {
    return payload &&
      typeof payload.sub === 'string' &&
      typeof payload.session_id === 'string' &&
      typeof payload.iat === 'number' &&
      typeof payload.exp === 'number' &&
      payload.type === 'refresh';
  }

  /**
   * Stores session data in database
   */
  private async storeSession(sessionData: SessionData): Promise<void> {
    const { error } = await supabase
      .from('jwt_sessions')
      .insert({
        session_id: sessionData.sessionId,
        user_id: sessionData.userId,
        email: sessionData.email,
        name: sessionData.name,
        picture: sessionData.picture,
        provider: sessionData.provider,
        scope: sessionData.scope,
        created_at: sessionData.createdAt.toISOString(),
        expires_at: sessionData.expiresAt.toISOString(),
        last_accessed_at: sessionData.lastAccessedAt.toISOString(),
        ip_address: sessionData.ipAddress,
        user_agent: sessionData.userAgent
      });

    if (error) {
      throw new Error(`Failed to store session: ${error.message}`);
    }
  }

  /**
   * Stores encrypted refresh token
   */
  private async storeRefreshToken(userId: string, sessionId: string, refreshToken: string): Promise<void> {
    const encryptionKey = config.oauth.tokenEncryptionKey || config.supabaseAnonKey;
    const encryptedToken = await this.encryptionService.encrypt(refreshToken, encryptionKey);

    const { error } = await supabase
      .from('jwt_refresh_tokens')
      .insert({
        user_id: userId,
        session_id: sessionId,
        encrypted_token: encryptedToken,
        expires_at: new Date(Date.now() + this.refreshTokenExpiryMs).toISOString()
      });

    if (error) {
      throw new Error(`Failed to store refresh token: ${error.message}`);
    }
  }

  /**
   * Retrieves stored refresh token
   */
  private async getStoredRefreshToken(userId: string, sessionId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('jwt_refresh_tokens')
        .select('encrypted_token')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .single();

      if (error || !data) {
        return null;
      }

      const encryptionKey = config.oauth.tokenEncryptionKey || config.supabaseAnonKey;
      return await this.encryptionService.decrypt(data.encrypted_token, encryptionKey);
    } catch (error) {
      logger.warn("Failed to retrieve refresh token:", { error });
      return null;
    }
  }

  /**
   * Checks if session is valid
   */
  private async isSessionValid(sessionId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('jwt_sessions')
        .select('expires_at')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return false;
      }

      return new Date(data.expires_at) > new Date();
    } catch {
      return false;
    }
  }

  /**
   * Gets session data
   */
  private async getSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      const { data, error } = await supabase
        .from('jwt_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        sessionId: data.session_id,
        userId: data.user_id,
        email: data.email,
        name: data.name,
        picture: data.picture,
        provider: data.provider,
        scope: data.scope,
        createdAt: new Date(data.created_at),
        expiresAt: new Date(data.expires_at),
        lastAccessedAt: new Date(data.last_accessed_at),
        ipAddress: data.ip_address,
        userAgent: data.user_agent
      };
    } catch {
      return null;
    }
  }

  /**
   * Updates session last accessed time
   */
  private async updateSessionAccess(sessionId: string): Promise<void> {
    try {
      await supabase
        .from('jwt_sessions')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('session_id', sessionId);
    } catch (error) {
      // Don't throw on access update failures
      logger.warn("Failed to update session access time:", { error });
    }
  }

  /**
   * Logs session events for audit purposes
   */
  private async logSessionEvent(userId: string, sessionId: string, eventType: string): Promise<void> {
    try {
      await supabase
        .from('oauth_audit_log')
        .insert({
          user_id: userId,
          event_type: eventType,
          provider: 'jwt',
          metadata: { session_id: sessionId },
          ip_address: null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
        });
    } catch (error) {
      // Don't throw on audit log failures
      logger.warn("Failed to log session event:", { error });
    }
  }
}