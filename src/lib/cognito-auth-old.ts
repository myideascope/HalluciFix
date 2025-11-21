// This file is deprecated - use cognitoAuth.ts instead
// Keeping minimal exports for backward compatibility
import { CognitoAuthService as MainCognitoAuthService } from './cognitoAuth';
import { CognitoUser, CognitoUserSession } from 'amazon-cognito-identity-js';
import { User, DEFAULT_ROLES } from '../types/user';

import { logger } from './logging';
export interface CognitoAuthService {
  signIn: (email: string, password: string) => Promise<CognitoUser>;
  signUp: (email: string, password: string, attributes?: any) => Promise<any>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<CognitoUser>;
  getCurrentUser: () => Promise<CognitoUser | null>;
  getCurrentSession: () => Promise<CognitoUserSession | null>;
  refreshSession: () => Promise<CognitoUserSession>;
  confirmSignUp: (email: string, code: string) => Promise<any>;
  resendConfirmationCode: (email: string) => Promise<any>;
  forgotPassword: (email: string) => Promise<any>;
  confirmPassword: (email: string, code: string, newPassword: string) => Promise<any>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<any>;
  updateUserAttributes: (attributes: any) => Promise<any>;
  getUserAttributes: () => Promise<any>;
}

class CognitoAuthServiceImpl implements CognitoAuthService {
  async signIn(email: string, password: string): Promise<CognitoUser> {
    try {
      const user = await Auth.signIn(email, password);
      return user;
    } catch (error) {
      logger.error("Cognito sign in error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async signUp(email: string, password: string, attributes?: any): Promise<any> {
    try {
      const result = await Auth.signUp({
        username: email,
        password,
        attributes: {
          email,
          ...attributes,
        },
      });
      return result;
    } catch (error) {
      logger.error("Cognito sign up error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await Auth.signOut();
    } catch (error) {
      logger.error("Cognito sign out error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async signInWithGoogle(): Promise<CognitoUser> {
    try {
      const user = await Auth.federatedSignIn({ provider: 'Google' });
      return user;
    } catch (error) {
      logger.error("Google OAuth sign in error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async getCurrentUser(): Promise<CognitoUser | null> {
    try {
      const user = await Auth.currentAuthenticatedUser();
      return user;
    } catch (error) {
      // User not authenticated - this is expected behavior
      return null;
    }
  }

  async getCurrentSession(): Promise<CognitoUserSession | null> {
    try {
      const session = await Auth.currentSession();
      return session;
    } catch (error) {
      // No valid session - this is expected behavior
      return null;
    }
  }

  async refreshSession(): Promise<CognitoUserSession> {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const session = await Auth.currentSession();
      return session;
    } catch (error) {
      logger.error("Session refresh error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async confirmSignUp(email: string, code: string): Promise<any> {
    try {
      const result = await Auth.confirmSignUp(email, code);
      return result;
    } catch (error) {
      logger.error("Confirm sign up error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async resendConfirmationCode(email: string): Promise<any> {
    try {
      const result = await Auth.resendSignUp(email);
      return result;
    } catch (error) {
      logger.error("Resend confirmation error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async forgotPassword(email: string): Promise<any> {
    try {
      const result = await Auth.forgotPassword(email);
      return result;
    } catch (error) {
      logger.error("Forgot password error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async confirmPassword(email: string, code: string, newPassword: string): Promise<any> {
    try {
      const result = await Auth.forgotPasswordSubmit(email, code, newPassword);
      return result;
    } catch (error) {
      logger.error("Confirm password error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<any> {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const result = await Auth.changePassword(user, oldPassword, newPassword);
      return result;
    } catch (error) {
      logger.error("Change password error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async updateUserAttributes(attributes: any): Promise<any> {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const result = await Auth.updateUserAttributes(user, attributes);
      return result;
    } catch (error) {
      logger.error("Update user attributes error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  async getUserAttributes(): Promise<any> {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const attributes = await Auth.userAttributes(user);
      return attributes;
    } catch (error) {
      logger.error("Get user attributes error:", error instanceof Error ? error : new Error(String(error)));
      throw this.handleAuthError(error);
    }
  }

  private handleAuthError(error: any): Error {
    // Map Cognito errors to user-friendly messages
    const errorCode = error.code || error.name;
    
    switch (errorCode) {
      case 'UserNotConfirmedException':
        return new Error('Please verify your email address before signing in.');
      case 'NotAuthorizedException':
        return new Error('Invalid email or password.');
      case 'UserNotFoundException':
        return new Error('No account found with this email address.');
      case 'InvalidPasswordException':
        return new Error('Password does not meet requirements.');
      case 'UsernameExistsException':
        return new Error('An account with this email already exists.');
      case 'CodeMismatchException':
        return new Error('Invalid verification code.');
      case 'ExpiredCodeException':
        return new Error('Verification code has expired.');
      case 'LimitExceededException':
        return new Error('Too many attempts. Please try again later.');
      case 'NetworkError':
        return new Error('Network error. Please check your connection.');
      default:
        return new Error(error.message || 'Authentication failed. Please try again.');
    }
  }
}

// Convert Cognito user to application User type
export const convertCognitoUserToAppUser = async (cognitoUser: CognitoUser): Promise<User> => {
  try {
    const attributes = await Auth.userAttributes(cognitoUser);
    const attributeMap = attributes.reduce((acc: any, attr: any) => {
      acc[attr.Name] = attr.Value;
      return acc;
    }, {});

    return {
      id: cognitoUser.getUsername(),
      email: attributeMap.email || '',
      name: attributeMap.name || 
            attributeMap.given_name + ' ' + attributeMap.family_name ||
            attributeMap.email?.split('@')[0] || 'User',
      avatar: attributeMap.picture,
      role: DEFAULT_ROLES[2], // Default to user role
      department: attributeMap['custom:department'] || 'General',
      status: 'active',
      lastActive: new Date().toISOString(),
      createdAt: attributeMap.created_at || new Date().toISOString(),
      permissions: DEFAULT_ROLES[2].permissions
    };
  } catch (error) {
    logger.error("Error converting Cognito user:", error instanceof Error ? error : new Error(String(error)));
    
    // Fallback user object
    return {
      id: cognitoUser.getUsername(),
      email: cognitoUser.getUsername(),
      name: 'User',
      avatar: undefined,
      role: DEFAULT_ROLES[2],
      department: 'General',
      status: 'active',
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      permissions: DEFAULT_ROLES[2].permissions
    };
  }
};

// Export singleton instance
export const cognitoAuth = new CognitoAuthServiceImpl();