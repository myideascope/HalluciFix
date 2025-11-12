/**
 * Hybrid Authentication Provider Component
 * Provides authentication context that works with both Supabase and Cognito
 */

import React from 'react';
import { AuthContext, useAuthProvider } from '../hooks/useAuth';
import { CognitoAuthContext, useCognitoAuthProvider } from '../hooks/useCognitoAuth';
import { config } from '../lib/env';
import { logger } from '../lib/logging';

interface HybridAuthProviderProps {
  children: React.ReactNode;
}

export const HybridAuthProvider: React.FC<HybridAuthProviderProps> = ({ children }) => {
  const hybridLogger = logger.child({ component: 'HybridAuthProvider' });

  // Always call both hooks to follow Rules of Hooks
  const cognitoAuthProvider = useCognitoAuthProvider();
  const supabaseAuthProvider = useAuthProvider();

  // Determine which authentication provider to use
  const useCognito = config.useCognito;
  const useSupabase = config.useSupabase;

  hybridLogger.info('Hybrid auth provider initialization', {
    useCognito,
    useSupabase,
    cognitoConfigured: !!(config.cognitoUserPoolId && config.cognitoUserPoolClientId),
    supabaseConfigured: !!(config.supabaseUrl && config.supabaseAnonKey)
  });

  // Use Cognito if configured, otherwise fall back to Supabase
  if (useCognito) {
    hybridLogger.info('Using Cognito authentication provider');

    return (
      <CognitoAuthContext.Provider value={cognitoAuthProvider}>
        {children}
      </CognitoAuthContext.Provider>
    );
  } else {
    hybridLogger.info('Using Supabase authentication provider');

    return (
      <AuthContext.Provider value={supabaseAuthProvider}>
        {children}
      </AuthContext.Provider>
    );
  }
};