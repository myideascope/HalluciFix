/**
 * AWS Cognito Authentication Service
 * Replaces Supabase Auth with AWS Cognito integration
 */

import { Amplify } from 'aws-amplify';
import { 
  signIn, 
  signUp, 
  signOut, 
  getCurrentUser, 
  fetchAuthSession,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  updatePassword,
  signInWithRedirect,
  fetchUserAttributes,
  updateUserAttributes
} from 'aws-amplify/auth';
import { logger } from './logging';

// Cognito configuration interface
interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  identityPoolId?: string;
  domain?: string;
  redirectSignIn?: string;
  redirectSignOut?: string;
}

// User interface for Cognito
export interface CognitoUser {
  userId: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
  picture?: string;
  attributes?: Record<string, string>;
}

// Authentication result interface
export interface AuthResult {
  user: CognitoUser;
  accessToken: string;
  idToken: string;
  refreshToken?: string;
}

class CognitoAuthService {
  private initialized = false;
  private config: CognitoConfig | null = null;
  private logger = logger.child({ component: 'CognitoAuth' });

  /**
   * Initialize Cognito configuration
   */
  async initialize(config: CognitoConfig): Promise<void> {
    try {
      this.config = config;

      // Configure Amplify
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: config.userPoolId,
            userPoolClientId: config.userPoolClientId,
            identityPoolId: config.identityPoolId,
            loginWith: {
              oauth: {
                domain: config.domain,
                scopes: ['openid', 'email', 'profile'],
                redirectSignIn: [config.redirectSignIn || window.location.origin + '/callback'],
                redirectSignOut: [config.redirectSignOut || window.location.origin + '/logout'],
                responseType: 'code',
                providers: ['Google']
              },
              email: true,
              username: false
            }
          }
        }
      });

      this.initialized = true;
      this.logger.info('Cognito Auth service initialized', {
        userPoolId: config.userPoolId,
        region: config.region,
        hasIdentityPool: !!config.identityPoolId,
        hasDomain: !!config.domain
      });
    } catch (error) {
      this.logger.error('Failed to initialize Cognito Auth service', error as Error);
      throw error;
    }
  }

  /**
   * Check if service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.config) {
      throw new Error('CognitoAuthService not initialized. Call initialize() first.');
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
    this.ensureInitialized();

    try {
      this.logger.info('Attempting email/password sign in', { email });

      const result = await signIn({
        username: email,
        password: password
      });

      if (result.isSignedIn) {
        const user = await this.getCurrentUser();
        const session = await fetchAuthSession();
        
        return {
          user,
          accessToken: session.tokens?.accessToken?.toString() || '',
          idToken: session.tokens?.idToken?.toString() || '',
          refreshToken: session.tokens?.refreshToken?.toString()
        };
      } else {
        throw new Error('Sign in incomplete - additional steps required');
      }
    } catch (error) {
      this.logger.error('Email/password sign in failed', error as Error, { email });
      throw error;
    }
  }

  /**
   * Sign up with email and password
   */
  async signUpWithEmailPassword(email: string, password: string, attributes?: Record<string, string>): Promise<{ userId: string; isConfirmed: boolean }> {
    this.ensureInitialized();

    try {
      this.logger.info('Attempting email/password sign up', { email });

      const result = await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email,
            ...attributes
          }
        }
      });

      this.logger.info('Sign up successful', { 
        userId: result.userId, 
        isConfirmed: result.isSignUpComplete 
      });

      return {
        userId: result.userId || '',
        isConfirmed: result.isSignUpComplete
      };
    } catch (error) {
      this.logger.error('Email/password sign up failed', error as Error, { email });
      throw error;
    }
  }

  /**
   * Confirm sign up with verification code
   */
  async confirmSignUp(email: string, confirmationCode: string): Promise<void> {
    this.ensureInitialized();

    try {
      await confirmSignUp({
        username: email,
        confirmationCode
      });

      this.logger.info('Sign up confirmed successfully', { email });
    } catch (error) {
      this.logger.error('Sign up confirmation failed', error as Error, { email });
      throw error;
    }
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email: string): Promise<void> {
    this.ensureInitialized();

    try {
      await resendSignUpCode({ username: email });
      this.logger.info('Confirmation code resent', { email });
    } catch (error) {
      this.logger.error('Failed to resend confirmation code', error as Error, { email });
      throw error;
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle(): Promise<void> {
    this.ensureInitialized();

    try {
      this.logger.info('Initiating Google OAuth sign in');
      
      await signInWithRedirect({
        provider: 'Google'
      });

      // The redirect will happen, so this function won't return normally
    } catch (error) {
      this.logger.error('Google OAuth sign in failed', error as Error);
      throw error;
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<CognitoUser> {
    this.ensureInitialized();

    try {
      const user = await getCurrentUser();
      const attributes = await fetchUserAttributes();

      return {
        userId: user.userId,
        username: user.username,
        email: attributes.email,
        emailVerified: attributes.email_verified === 'true',
        givenName: attributes.given_name,
        familyName: attributes.family_name,
        name: attributes.name,
        picture: attributes.picture,
        attributes
      };
    } catch (error) {
      this.logger.error('Failed to get current user', error as Error);
      throw error;
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<AuthResult | null> {
    this.ensureInitialized();

    try {
      const session = await fetchAuthSession();
      
      if (session.tokens) {
        const user = await this.getCurrentUser();
        
        return {
          user,
          accessToken: session.tokens.accessToken?.toString() || '',
          idToken: session.tokens.idToken?.toString() || '',
          refreshToken: session.tokens.refreshToken?.toString()
        };
      }

      return null;
    } catch (error) {
      this.logger.debug('No current session available', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    this.ensureInitialized();

    try {
      await signOut();
      this.logger.info('User signed out successfully');
    } catch (error) {
      this.logger.error('Sign out failed', error as Error);
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<void> {
    this.ensureInitialized();

    try {
      await resetPassword({ username: email });
      this.logger.info('Password reset initiated', { email });
    } catch (error) {
      this.logger.error('Password reset failed', error as Error, { email });
      throw error;
    }
  }

  /**
   * Confirm password reset
   */
  async confirmPasswordReset(email: string, confirmationCode: string, newPassword: string): Promise<void> {
    this.ensureInitialized();

    try {
      await confirmResetPassword({
        username: email,
        confirmationCode,
        newPassword
      });

      this.logger.info('Password reset confirmed', { email });
    } catch (error) {
      this.logger.error('Password reset confirmation failed', error as Error, { email });
      throw error;
    }
  }

  /**
   * Update password for authenticated user
   */
  async updatePassword(oldPassword: string, newPassword: string): Promise<void> {
    this.ensureInitialized();

    try {
      await updatePassword({
        oldPassword,
        newPassword
      });

      this.logger.info('Password updated successfully');
    } catch (error) {
      this.logger.error('Password update failed', error as Error);
      throw error;
    }
  }

  /**
   * Update user attributes
   */
  async updateUserAttributes(attributes: Record<string, string>): Promise<void> {
    this.ensureInitialized();

    try {
      await updateUserAttributes({
        userAttributes: attributes
      });

      this.logger.info('User attributes updated', { attributes: Object.keys(attributes) });
    } catch (error) {
      this.logger.error('Failed to update user attributes', error as Error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      return session !== null;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const cognitoAuth = new CognitoAuthService();

// Export configuration helper
export const createCognitoConfig = (
  userPoolId: string,
  userPoolClientId: string,
  region: string = 'us-east-1',
  options: Partial<CognitoConfig> = {}
): CognitoConfig => ({
  userPoolId,
  userPoolClientId,
  region,
  ...options
});