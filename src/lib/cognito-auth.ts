// This file is deprecated - use cognitoAuth.ts instead
// Keeping minimal exports for backward compatibility

import { CognitoUser, CognitoUserSession } from 'amazon-cognito-identity-js';
import { User, DEFAULT_ROLES } from '../types/user';

export interface CognitoAuthService {
  signIn: (email: string, password: string) => Promise<CognitoUser>;
  signUp: (email: string, password: string, attributes?: any) => Promise<any>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<CognitoUser>;
  getCurrentUser: () => Promise<CognitoUser | null>;
  getCurrentSession: () => Promise<CognitoUserSession | null>;
  confirmSignUp: (email: string, code: string) => Promise<any>;
  resendConfirmationCode: (email: string) => Promise<any>;
  forgotPassword: (email: string) => Promise<any>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<any>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<any>;
  updateUserAttributes: (attributes: any) => Promise<any>;
  getUserAttributes: () => Promise<any>;
}

// Stub implementation - throws errors to encourage migration to new service
export const cognitoAuthService: CognitoAuthService = {
  async signIn(email: string, password: string): Promise<CognitoUser> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async signUp(email: string, password: string, attributes?: any): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async signOut(): Promise<void> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async signInWithGoogle(): Promise<CognitoUser> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async getCurrentUser(): Promise<CognitoUser | null> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async getCurrentSession(): Promise<CognitoUserSession | null> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async confirmSignUp(email: string, code: string): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async resendConfirmationCode(email: string): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async forgotPassword(email: string): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async updateUserAttributes(attributes: any): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  },

  async getUserAttributes(): Promise<any> {
    throw new Error('This service is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
  }
};

// Helper functions for backward compatibility
export const convertCognitoUserToAppUser = (cognitoUser: CognitoUser): User => {
  throw new Error('This function is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
};

export const extractUserAttributesFromCognito = (attributes: any[]): any => {
  throw new Error('This function is deprecated. Please use the main CognitoAuthService from cognitoAuth.ts');
};

export default cognitoAuthService;