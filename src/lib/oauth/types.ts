/**
 * OAuth provider interface and related types
 */

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
  user: UserProfile;
}

export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  picture: string;
  locale: string;
  verified: boolean;
}

export interface OAuthProvider {
  name: string;
  clientId: string;
  scopes: string[];
  initiateAuth(redirectUri: string, state?: string): Promise<string>;
  handleCallback(code: string, state: string, codeVerifier: string): Promise<AuthResult>;
  refreshTokens(refreshToken: string): Promise<TokenResult>;
  revokeTokens(accessToken: string): Promise<void>;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export enum OAuthErrorType {
  INVALID_REQUEST = 'invalid_request',
  UNAUTHORIZED_CLIENT = 'unauthorized_client',
  ACCESS_DENIED = 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE = 'unsupported_response_type',
  INVALID_SCOPE = 'invalid_scope',
  SERVER_ERROR = 'server_error',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable'
}

export class OAuthError extends Error {
  constructor(
    public type: OAuthErrorType,
    public description?: string,
    public uri?: string
  ) {
    super(`OAuth Error: ${type}${description ? ` - ${description}` : ''}`);
  }
}