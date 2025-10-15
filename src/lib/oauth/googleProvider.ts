import { OAuthProvider, AuthResult, TokenResult, UserProfile, GoogleOAuthConfig, OAuthError, OAuthErrorType } from './types';
import { PKCEHelper } from './pkceHelper';
import { StateManager } from './stateManager';

/**
 * Google OAuth 2.0 provider implementation with PKCE support
 */
export class GoogleOAuthProvider implements OAuthProvider {
  public readonly name = 'google';
  public readonly clientId: string;
  private readonly clientSecret: string;
  public readonly scopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/drive.readonly'
  ];

  private readonly authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';
  private readonly userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
  private readonly revokeUrl = 'https://oauth2.googleapis.com/revoke';

  constructor(config: GoogleOAuthConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Google OAuth configuration missing required fields');
    }
    
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  /**
   * Initiate OAuth authorization flow with PKCE
   */
  async initiateAuth(redirectUri: string, state?: string): Promise<string> {
    try {
      // Generate PKCE parameters
      const codeVerifier = PKCEHelper.generateCodeVerifier();
      const codeChallenge = await PKCEHelper.generateCodeChallenge(codeVerifier);
      
      // Generate and store state for CSRF protection
      const authState = state || StateManager.generateState();
      await StateManager.storeState(authState, codeVerifier, redirectUri);

      // Build authorization URL
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: this.scopes.join(' '),
        state: authState,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true'
      });

      return `${this.authUrl}?${params.toString()}`;
    } catch (error) {
      throw new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Failed to initiate OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle OAuth callback and exchange authorization code for tokens
   */
  async handleCallback(code: string, state: string, codeVerifier: string): Promise<AuthResult> {
    try {
      // Validate state parameter
      const isValidState = await StateManager.validateState(state, codeVerifier);
      if (!isValidState) {
        throw new OAuthError(OAuthErrorType.INVALID_REQUEST, 'Invalid state parameter');
      }

      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code, codeVerifier, state);
      
      // Fetch user profile
      const userProfile = await this.fetchUserProfile(tokenResponse.access_token);
      
      // Clean up state
      await StateManager.cleanupState(state);

      return {
        ...tokenResponse,
        user: userProfile
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      throw new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Callback handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Refresh access tokens using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<TokenResult> {
    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new OAuthError(
          data.error || OAuthErrorType.SERVER_ERROR,
          data.error_description
        );
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token, // May be undefined if not rotated
        expiresIn: data.expires_in
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      throw new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Revoke access tokens
   */
  async revokeTokens(accessToken: string): Promise<void> {
    try {
      const response = await fetch(this.revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: accessToken
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new OAuthError(
          data.error || OAuthErrorType.SERVER_ERROR,
          data.error_description
        );
      }
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      throw new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Token revocation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string, state: string): Promise<Omit<AuthResult, 'user'>> {
    const stateData = await StateManager.getStateData(state);
    if (!stateData) {
      throw new OAuthError(OAuthErrorType.INVALID_REQUEST, 'State data not found');
    }

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: stateData.redirectUri
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new OAuthError(
        data.error || OAuthErrorType.SERVER_ERROR,
        data.error_description
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope || this.scopes.join(' ')
    };
  }

  /**
   * Fetch user profile from Google
   */
  private async fetchUserProfile(accessToken: string): Promise<UserProfile> {
    const response = await fetch(this.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Failed to fetch user profile: ${response.statusText}`
      );
    }

    const profileData = await response.json();
    return this.mapGoogleProfileToUserProfile(profileData);
  }

  /**
   * Map Google profile response to UserProfile interface
   */
  private mapGoogleProfileToUserProfile(googleProfile: any): UserProfile {
    return {
      id: googleProfile.id,
      email: googleProfile.email,
      name: googleProfile.name,
      givenName: googleProfile.given_name || '',
      familyName: googleProfile.family_name || '',
      picture: googleProfile.picture || '',
      locale: googleProfile.locale || 'en',
      verified: googleProfile.verified_email || false
    };
  }
}