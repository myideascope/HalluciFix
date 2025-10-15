/**
 * OAuth 2.0 implementation with PKCE and Google provider
 */

export * from './types';
export * from './pkceHelper';
export * from './stateManager';
export * from './googleProvider';
export * from './tokenEncryption';
export * from './tokenStorage';
export * from './tokenManager';
export * from './tokenRefreshService';
export * from './tokenCleanupService';
export * from './oauthService';

// Re-export commonly used classes for convenience
export { GoogleOAuthProvider } from './googleProvider';
export { PKCEHelper } from './pkceHelper';
export { StateManager } from './stateManager';
export { TokenEncryptionService } from './tokenEncryption';
export { SecureTokenStorage } from './tokenStorage';
export { TokenManager } from './tokenManager';
export { TokenRefreshService } from './tokenRefreshService';
export { TokenCleanupService } from './tokenCleanupService';
export { OAuthService } from './oauthService';
export type { 
  OAuthProvider, 
  AuthResult, 
  TokenResult, 
  UserProfile, 
  GoogleOAuthConfig,
  OAuthStateData,
  TokenData,
  TokenStorage,
  EncryptionService
} from './types';