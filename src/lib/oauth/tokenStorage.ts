/**
 * Secure token storage service with database integration
 */

import { TokenStorage, TokenData, OAuthProvider } from './types';
import { TokenEncryptionService } from './tokenEncryption';
import { supabase } from '../supabase';

export class SecureTokenStorage implements TokenStorage {
  private encryptionService: TokenEncryptionService;
  private encryptionKey: string;

  constructor(encryptionKey: string) {
    this.encryptionService = new TokenEncryptionService();
    this.encryptionKey = encryptionKey;
    
    // Validate encryption key
    if (!this.encryptionService.validateKey(encryptionKey)) {
      throw new Error('Invalid encryption key provided');
    }
  }

  /**
   * Stores encrypted tokens in the database
   */
  async storeTokens(userId: string, tokens: TokenData): Promise<void> {
    try {
      // Encrypt the token data
      const tokenJson = JSON.stringify({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        scope: tokens.scope,
        tokenType: tokens.tokenType
      });

      const encryptedTokens = await this.encryptionService.encrypt(tokenJson, this.encryptionKey);

      // Store in database with upsert to handle existing records
      const { error } = await supabase
        .from('user_tokens')
        .upsert({
          user_id: userId,
          provider: 'google',
          encrypted_tokens: encryptedTokens,
          expires_at: tokens.expiresAt.toISOString(),
          scope: tokens.scope,
          token_type: tokens.tokenType,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,provider'
        });

      if (error) {
        throw new Error(`Failed to store tokens: ${error.message}`);
      }

      // Log successful token storage (without sensitive data)
      await this.logOAuthEvent(userId, 'token_stored', 'google');
    } catch (error) {
      throw new Error(`Token storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieves and decrypts tokens from the database
   */
  async getTokens(userId: string): Promise<TokenData | null> {
    try {
      const { data, error } = await supabase
        .from('user_tokens')
        .select('encrypted_tokens, expires_at, scope, token_type')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No tokens found
          return null;
        }
        throw new Error(`Failed to retrieve tokens: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      // Check if tokens are expired
      const expiresAt = new Date(data.expires_at);
      const now = new Date();
      
      if (now >= expiresAt) {
        // Tokens are expired, attempt refresh
        return await this.refreshTokens(userId);
      }

      // Decrypt token data
      const decryptedJson = await this.encryptionService.decrypt(
        data.encrypted_tokens, 
        this.encryptionKey
      );
      
      const tokenData = JSON.parse(decryptedJson);

      return {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt,
        scope: data.scope,
        tokenType: data.token_type
      };
    } catch (error) {
      throw new Error(`Token retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Refreshes expired tokens using the refresh token
   */
  async refreshTokens(userId: string): Promise<TokenData> {
    try {
      // Get current tokens (including expired ones)
      const { data, error } = await supabase
        .from('user_tokens')
        .select('encrypted_tokens, scope, token_type')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();

      if (error || !data) {
        throw new Error('No tokens found for refresh');
      }

      // Decrypt current tokens to get refresh token
      const decryptedJson = await this.encryptionService.decrypt(
        data.encrypted_tokens,
        this.encryptionKey
      );
      
      const currentTokens = JSON.parse(decryptedJson);
      
      if (!currentTokens.refreshToken) {
        throw new Error('No refresh token available');
      }

      // Make refresh request to Google
      const refreshResponse = await this.performTokenRefresh(currentTokens.refreshToken);
      
      // Create new token data
      const newTokenData: TokenData = {
        accessToken: refreshResponse.access_token,
        refreshToken: refreshResponse.refresh_token || currentTokens.refreshToken,
        expiresAt: new Date(Date.now() + refreshResponse.expires_in * 1000),
        scope: data.scope,
        tokenType: data.token_type
      };

      // Store the refreshed tokens
      await this.storeTokens(userId, newTokenData);

      // Log successful token refresh
      await this.logOAuthEvent(userId, 'token_refreshed', 'google');

      return newTokenData;
    } catch (error) {
      // Log failed token refresh
      await this.logOAuthEvent(userId, 'token_refresh_failed', 'google', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revokes and deletes tokens from storage
   */
  async revokeTokens(userId: string): Promise<void> {
    try {
      // Get current tokens for revocation
      const tokens = await this.getStoredTokensForRevocation(userId);
      
      if (tokens) {
        // Revoke tokens with Google
        await this.performTokenRevocation(tokens.accessToken);
      }

      // Delete from database
      const { error } = await supabase
        .from('user_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'google');

      if (error) {
        throw new Error(`Failed to delete tokens: ${error.message}`);
      }

      // Log successful token revocation
      await this.logOAuthEvent(userId, 'token_revoked', 'google');
    } catch (error) {
      throw new Error(`Token revocation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleans up expired tokens from the database
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_tokens')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        throw new Error(`Failed to cleanup expired tokens: ${error.message}`);
      }
    } catch (error) {
      console.error('Token cleanup failed:', error);
    }
  }

  /**
   * Performs the actual token refresh with Google
   */
  private async performTokenRefresh(refreshToken: string): Promise<any> {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth configuration missing');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Token refresh failed: ${errorData.error_description || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Performs token revocation with Google
   */
  private async performTokenRevocation(accessToken: string): Promise<void> {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        console.warn('Token revocation with Google failed, but continuing with local cleanup');
      }
    } catch (error) {
      console.warn('Token revocation with Google failed:', error);
    }
  }

  /**
   * Gets stored tokens for revocation (bypasses expiration check)
   */
  private async getStoredTokensForRevocation(userId: string): Promise<{ accessToken: string } | null> {
    try {
      const { data, error } = await supabase
        .from('user_tokens')
        .select('encrypted_tokens')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();

      if (error || !data) {
        return null;
      }

      const decryptedJson = await this.encryptionService.decrypt(
        data.encrypted_tokens,
        this.encryptionKey
      );
      
      const tokenData = JSON.parse(decryptedJson);
      return { accessToken: tokenData.accessToken };
    } catch (error) {
      console.warn('Failed to get tokens for revocation:', error);
      return null;
    }
  }

  /**
   * Logs OAuth events for audit purposes
   */
  private async logOAuthEvent(
    userId: string, 
    eventType: string, 
    provider: string, 
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase
        .from('oauth_audit_log')
        .insert({
          user_id: userId,
          event_type: eventType,
          provider,
          metadata: metadata || {},
          ip_address: null, // Will be populated by RLS policies if available
          user_agent: navigator.userAgent
        });
    } catch (error) {
      // Don't throw on audit log failures, just log the error
      console.warn('Failed to log OAuth event:', error);
    }
  }
}