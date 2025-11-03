import { signIn, signOut, getCurrentUser, fetchAuthSession, signUp, confirmSignUp, resendSignUpCode, resetPassword, confirmResetPassword, updatePassword } from '@aws-amplify/auth';
import { Hub } from '@aws-amplify/core';
import { CognitoUser, CognitoUserSession } from 'amazon-cognito-identity-js';
import { User, UserRole, DEFAULT_ROLES } from '../types/user';

export interface CognitoAuthUser {
  username: string;
  attributes: {
    email: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    sub: string;
    email_verified?: string;
    phone_number?: string;
    phone_number_verified?: string;
    'custom:subscriptionTier'?: string;
    'custom:usageQuota'?: string;
  };
  signInUserSession: CognitoUserSession;
}

export class CognitoAuthService {
  private static instance: CognitoAuthService;
  private authListeners: ((user: User | null) => void)[] = [];
  private currentUser: User | null = null;

  private constructor() {
    // Listen for auth events
    Hub.listen('auth', (data) => {
      const { payload } = data;
      console.log('Auth event:', payload.event, payload.data);
      
      switch (payload.event) {
        case 'signIn':
          this.handleSignIn(payload.data);
          break;
        case 'signOut':
          this.handleSignOut();
          break;
        case 'signIn_failure':
          console.error('Sign in failed:', payload.data);
          break;
        case 'tokenRefresh':
          console.log('Token refreshed successfully');
          break;
        case 'tokenRefresh_failure':
          console.error('Token refresh failed:', payload.data);
          this.handleSignOut(); // Force sign out on token refresh failure
          break;
      }
    });
  }

  public static getInstance(): CognitoAuthService {
    if (!CognitoAuthService.instance) {
      CognitoAuthService.instance = new CognitoAuthService();
    }
    return CognitoAuthService.instance;
  }

  // Subscribe to auth state changes
  public onAuthStateChange(callback: (user: User | null) => void): () => void {
    this.authListeners.push(callback);
    
    // Immediately call with current user
    callback(this.currentUser);
    
    // Return unsubscribe function
    return () => {
      this.authListeners = this.authListeners.filter(listener => listener !== callback);
    };
  }

  private notifyListeners(user: User | null) {
    this.currentUser = user;
    this.authListeners.forEach(listener => listener(user));
  }

  private async handleSignIn(cognitoUser: CognitoUser) {
    try {
      const user = await this.convertCognitoUserToAppUser(cognitoUser);
      this.notifyListeners(user);
    } catch (error) {
      console.error('Error handling sign in:', error);
      this.notifyListeners(null);
    }
  }

  private handleSignOut() {
    this.notifyListeners(null);
  }

  // Get current authenticated user
  public async getCurrentUser(): Promise<User | null> {
    try {
      const cognitoUser = await getCurrentUser();
      if (cognitoUser) {
        const user = await this.convertCognitoUserToAppUser(cognitoUser);
        this.currentUser = user;
        return user;
      }
      return null;
    } catch (error) {
      console.log('No authenticated user found');
      return null;
    }
  }

  // Sign in with email and password
  public async signInWithEmailPassword(email: string, password: string): Promise<User> {
    try {
      const cognitoUser = await signIn({ username: email, password });
      
      // Handle MFA challenge if required
      if (cognitoUser.challengeName === 'SMS_MFA' || cognitoUser.challengeName === 'SOFTWARE_TOKEN_MFA') {
        throw new Error(`MFA_REQUIRED:${cognitoUser.challengeName}`);
      }
      
      const user = await this.convertCognitoUserToAppUser(cognitoUser);
      return user;
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Sign up with email and password
  public async signUpWithEmailPassword(email: string, password: string, givenName?: string, familyName?: string): Promise<{ user: any; userConfirmed: boolean }> {
    try {
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            ...(givenName && { given_name: givenName }),
            ...(familyName && { family_name: familyName }),
          },
        },
      });
      
      return {
        user: result.user,
        userConfirmed: result.userConfirmed
      };
    } catch (error: any) {
      console.error('Sign up error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Confirm sign up with verification code
  public async confirmSignUp(email: string, code: string): Promise<void> {
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
    } catch (error: any) {
      console.error('Confirm sign up error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Resend confirmation code
  public async resendConfirmationCode(email: string): Promise<void> {
    try {
      await resendSignUpCode({ username: email });
    } catch (error: any) {
      console.error('Resend confirmation code error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Sign in with Google OAuth
  public async signInWithGoogle(): Promise<void> {
    try {
      // Note: federatedSignIn API has changed in v6, this needs to be updated based on your OAuth setup
      throw new Error('Google sign-in needs to be updated for AWS Amplify v6');
      // The actual sign in will be handled by the Hub listener
    } catch (error: any) {
      console.error('Google sign in error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Sign out
  public async signOut(): Promise<void> {
    try {
      await signOut();
      // The sign out will be handled by the Hub listener
    } catch (error: any) {
      console.error('Sign out error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Forgot password
  public async forgotPassword(email: string): Promise<void> {
    try {
      await resetPassword({ username: email });
    } catch (error: any) {
      console.error('Forgot password error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Confirm forgot password
  public async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
    } catch (error: any) {
      console.error('Confirm forgot password error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Change password
  public async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    try {
      await updatePassword({ oldPassword, newPassword });
    } catch (error: any) {
      console.error('Change password error:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  // Get current session
  public async getCurrentSession(): Promise<any | null> {
    try {
      const session = await fetchAuthSession();
      return session;
    } catch (error) {
      console.log('No current session found');
      return null;
    }
  }

  // Get JWT tokens
  public async getTokens(): Promise<{ accessToken: string; idToken: string; refreshToken: string } | null> {
    try {
      const session = await fetchAuthSession();
      const tokens = session.tokens;
      if (!tokens) return null;
      
      return {
        accessToken: tokens.accessToken?.toString() || '',
        idToken: tokens.idToken?.toString() || '',
        refreshToken: tokens.refreshToken?.toString() || '',
      };
    } catch (error) {
      console.log('No tokens available');
      return null;
    }
  }

  // Convert Cognito user to app user format
  public async convertCognitoUserToAppUser(cognitoUser: any): Promise<User> {
    const attributes = cognitoUser.attributes || {};
    
    // Determine user role based on custom attributes or default to user
    const roleId = attributes['custom:role'] || 'user';
    const role = DEFAULT_ROLES.find(r => r.name === roleId) || DEFAULT_ROLES[2]; // Default to user role

    return {
      id: attributes.sub,
      email: attributes.email || cognitoUser.username,
      name: this.buildFullName(attributes.given_name, attributes.family_name) || 
            attributes.email?.split('@')[0] || 
            cognitoUser.username,
      avatar: attributes.picture,
      role,
      department: attributes['custom:department'] || 'General',
      status: 'active',
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(), // Cognito doesn't provide creation date in attributes
      permissions: role.permissions,
      // Additional Cognito-specific fields
      emailVerified: attributes.email_verified === 'true',
      phoneNumber: attributes.phone_number,
      phoneVerified: attributes.phone_number_verified === 'true',
      subscriptionTier: attributes['custom:subscriptionTier'],
      usageQuota: attributes['custom:usageQuota'] ? parseInt(attributes['custom:usageQuota']) : undefined,
    };
  }

  private buildFullName(givenName?: string, familyName?: string): string | undefined {
    if (givenName && familyName) {
      return `${givenName} ${familyName}`;
    } else if (givenName) {
      return givenName;
    } else if (familyName) {
      return familyName;
    }
    return undefined;
  }

  // Convert AWS Cognito errors to user-friendly messages
  private getAuthErrorMessage(error: any): string {
    const errorCode = error.code || error.name;
    
    switch (errorCode) {
      case 'UserNotFoundException':
        return 'No account found with this email address.';
      case 'NotAuthorizedException':
        return 'Incorrect email or password.';
      case 'UserNotConfirmedException':
        return 'Please verify your email address before signing in.';
      case 'PasswordResetRequiredException':
        return 'Password reset is required. Please check your email.';
      case 'UserLambdaValidationException':
        return 'Account validation failed. Please contact support.';
      case 'InvalidPasswordException':
        return 'Password does not meet requirements.';
      case 'UsernameExistsException':
        return 'An account with this email already exists.';
      case 'InvalidParameterException':
        return 'Invalid request parameters.';
      case 'CodeMismatchException':
        return 'Invalid verification code.';
      case 'ExpiredCodeException':
        return 'Verification code has expired.';
      case 'LimitExceededException':
        return 'Too many attempts. Please try again later.';
      case 'TooManyRequestsException':
        return 'Too many requests. Please try again later.';
      case 'NetworkError':
        return 'Network error. Please check your connection.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
}

// Export singleton instance
export const cognitoAuth = CognitoAuthService.getInstance();