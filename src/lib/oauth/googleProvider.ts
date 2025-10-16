import { OAuthProvider, AuthResult, TokenResult, UserProfile, GoogleOAuthConfig, OAuthError, OAuthErrorType } from './types';
import { PKCEHelper } from './pkceHelper';
import { StateManager } from './stateManager';
import { OAuthErrorHandler, OAuthErrorMonitor } from './oauthErrorHandler';

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
      // Validate redirect URI
      if (!redirectUri) {
        throw new OAuthError(OAuthErrorType.INVALID_REQUEST, 'Redirect URI is required');
      }

      try {
        const url = new URL(redirectUri);
        // Ensure HTTPS in production
        if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.protocol !== 'https:') {
          throw new OAuthError(OAuthErrorType.INVALID_REQUEST, 'Redirect URI must use HTTPS in production');
        }
      } catch (urlError) {
        throw new OAuthError(OAuthErrorType.INVALID_REQUEST, 'Invalid redirect URI format');
      }

      // Generate PKCE parameters
      const codeVerifier = PKCEHelper.generateCodeVerifier();
      const codeChallenge = await PKCEHelper.generateCodeChallenge(codeVerifier);
      
      // Validate PKCE parameters
      if (!PKCEHelper.validateCodeVerifier(codeVerifier)) {
        throw new OAuthError(OAuthErrorType.SERVER_ERROR, 'Failed to generate valid PKCE code verifier');
      }

      // Generate and store state for CSRF protection
      const authState = state || StateManager.generateState();
      
      // Validate state format
      if (!StateManager.validateStateFormat(authState)) {
        throw new OAuthError(OAuthErrorType.SERVER_ERROR, 'Invalid state parameter format');
      }

      await StateManager.storeState(authState, codeVerifier, redirectUri);

      // Build authorization URL with enhanced security parameters
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
        include_granted_scopes: 'true',
        // Additional security parameters
        hd: '', // Restrict to specific domain if needed (empty for any domain)
        login_hint: '', // Can be used to pre-fill email if available
      });

      const authUrl = `${this.authUrl}?${params.toString()}`;
      
      // Log initiation for monitoring (without sensitive data)
      console.log('OAuth flow initiated', {
        provider: this.name,
        redirectUri,
        scopes: this.scopes,
        timestamp: new Date().toISOString()
      });

      return authUrl;
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
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
    const context = { provider: this.name, code: code?.substring(0, 10) + '...', state };
    
    try {
      // Validate required parameters
      if (!code || !state || !codeVerifier) {
        const error = new OAuthError(
          OAuthErrorType.INVALID_REQUEST, 
          'Missing required callback parameters (code, state, or codeVerifier)'
        );
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      // Validate parameter formats
      if (!StateManager.validateStateFormat(state)) {
        const error = new OAuthError(OAuthErrorType.INVALID_REQUEST, 'Invalid state parameter format');
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      if (!PKCEHelper.validateCodeVerifier(codeVerifier)) {
        const error = new OAuthError(OAuthErrorType.INVALID_REQUEST, 'Invalid code verifier format');
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      // Validate state parameter and CSRF protection
      const isValidState = await StateManager.validateState(state, codeVerifier);
      if (!isValidState) {
        const error = new OAuthError(
          OAuthErrorType.INVALID_REQUEST, 
          'State validation failed - possible CSRF attack or expired state'
        );
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      // Exchange authorization code for tokens
      let tokenResponse;
      try {
        tokenResponse = await this.exchangeCodeForTokens(code, codeVerifier, state);
      } catch (error) {
        const tokenError = error instanceof OAuthError ? error : new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          `Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        OAuthErrorMonitor.recordError(tokenError, context);
        throw tokenError;
      }
      
      // Fetch user profile
      let userProfile;
      try {
        userProfile = await this.fetchUserProfile(tokenResponse.accessToken);
      } catch (error) {
        const profileError = error instanceof OAuthError ? error : new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          `Profile fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        OAuthErrorMonitor.recordError(profileError, { ...context, originalError: error });
        throw profileError;
      }
      
      // Validate user profile data
      if (!userProfile.id || !userProfile.email) {
        const error = new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Incomplete user profile data received from Google'
        );
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      // Clean up state (best effort - don't fail auth if cleanup fails)
      try {
        await StateManager.cleanupState(state);
      } catch (error) {
        console.warn('Failed to cleanup OAuth state (non-critical):', error);
      }

      // Log successful authentication (without sensitive data)
      console.log('OAuth callback completed successfully', {
        provider: this.name,
        userId: userProfile.id,
        email: userProfile.email,
        timestamp: new Date().toISOString()
      });

      return {
        ...tokenResponse,
        user: userProfile
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }
      
      const wrappedError = new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Callback handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      OAuthErrorMonitor.recordError(wrappedError, { ...context, originalError: error });
      throw wrappedError;
    }
  }

  /**
   * Refresh access tokens using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<TokenResult> {
    const context = { provider: this.name, action: 'refresh_tokens' };
    
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

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          const error = new OAuthError(
            OAuthErrorType.SERVER_ERROR,
            `Token refresh failed with status ${response.status}: ${response.statusText}`
          );
          OAuthErrorMonitor.recordError(error, context);
          throw error;
        }

        // Map specific refresh token errors
        let errorType = OAuthErrorType.SERVER_ERROR;
        let errorMessage = errorData.error_description || errorData.error;

        switch (errorData.error) {
          case 'invalid_grant':
            errorType = OAuthErrorType.INVALID_REQUEST;
            errorMessage = 'Refresh token is invalid or expired. Please sign in again.';
            break;
          case 'invalid_client':
            errorType = OAuthErrorType.UNAUTHORIZED_CLIENT;
            errorMessage = 'OAuth client configuration is invalid.';
            break;
          case 'invalid_request':
            errorType = OAuthErrorType.INVALID_REQUEST;
            break;
        }

        const error = new OAuthError(errorType, errorMessage);
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      const data = await response.json();

      // Validate response
      if (!data.access_token) {
        const error = new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Invalid refresh response: missing access_token'
        );
        OAuthErrorMonitor.recordError(error, context);
        throw error;
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token, // May be undefined if not rotated
        expiresIn: data.expires_in || 3600 // Default to 1 hour
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Network error during token refresh. Please check your internet connection.'
        );
        OAuthErrorMonitor.recordError(networkError, context);
        throw networkError;
      }

      const wrappedError = new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      OAuthErrorMonitor.recordError(wrappedError, { ...context, originalError: error });
      throw wrappedError;
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

    try {
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

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          // If we can't parse the error response, create a generic error
          throw new OAuthError(
            OAuthErrorType.SERVER_ERROR,
            `Token exchange failed with status ${response.status}: ${response.statusText}`
          );
        }

        // Map Google's error codes to our OAuth error types
        let errorType = OAuthErrorType.SERVER_ERROR;
        switch (errorData.error) {
          case 'invalid_request':
            errorType = OAuthErrorType.INVALID_REQUEST;
            break;
          case 'invalid_client':
            errorType = OAuthErrorType.UNAUTHORIZED_CLIENT;
            break;
          case 'invalid_grant':
            errorType = OAuthErrorType.INVALID_REQUEST;
            break;
          case 'unauthorized_client':
            errorType = OAuthErrorType.UNAUTHORIZED_CLIENT;
            break;
          case 'unsupported_grant_type':
            errorType = OAuthErrorType.UNSUPPORTED_RESPONSE_TYPE;
            break;
          case 'invalid_scope':
            errorType = OAuthErrorType.INVALID_SCOPE;
            break;
        }

        throw new OAuthError(errorType, errorData.error_description || errorData.error);
      }

      const data = await response.json();

      // Validate required fields in response
      if (!data.access_token) {
        throw new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Invalid token response: missing access_token'
        );
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600, // Default to 1 hour if not provided
        tokenType: data.token_type || 'Bearer',
        scope: data.scope || this.scopes.join(' ')
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Network error during token exchange. Please check your internet connection.'
        );
      }

      throw new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Fetch user profile from Google
   */
  private async fetchUserProfile(accessToken: string): Promise<UserProfile> {
    try {
      const response = await fetch(this.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        let errorMessage = `Failed to fetch user profile: ${response.statusText}`;
        
        if (response.status === 401) {
          errorMessage = 'Access token is invalid or expired';
        } else if (response.status === 403) {
          errorMessage = 'Insufficient permissions to access user profile';
        } else if (response.status >= 500) {
          errorMessage = 'Google server error while fetching profile';
        }

        throw new OAuthError(OAuthErrorType.SERVER_ERROR, errorMessage);
      }

      let profileData;
      try {
        profileData = await response.json();
      } catch (error) {
        throw new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Invalid profile response format from Google'
        );
      }

      // Validate required profile fields
      if (!profileData.id || !profileData.email) {
        throw new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Incomplete profile data received from Google'
        );
      }

      return this.mapGoogleProfileToUserProfile(profileData);
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new OAuthError(
          OAuthErrorType.SERVER_ERROR,
          'Network error while fetching profile. Please check your internet connection.'
        );
      }

      throw new OAuthError(
        OAuthErrorType.SERVER_ERROR,
        `Profile fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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