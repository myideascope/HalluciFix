/**
 * Hybrid Authentication Hook
 * Supports both Supabase and Cognito authentication based on configuration
 * This allows for gradual migration from Supabase to Cognito
 */

import { useAuthProvider } from './useAuth';
import { useCognitoAuthProvider } from './useCognitoAuth';
import { config } from '../lib/env';
import { logger } from '../lib/logging';

const hybridLogger = logger.child({ component: 'HybridAuth' });

export const useHybridAuthProvider = () => {
  // Determine which authentication provider to use
  const useCognito = config.useCognito;
  const useSupabase = config.useSupabase;

  hybridLogger.info('Hybrid auth provider selection', {
    useCognito,
    useSupabase,
    cognitoConfigured: !!(config.cognitoUserPoolId && config.cognitoUserPoolClientId),
    supabaseConfigured: !!(config.supabaseUrl && config.supabaseAnonKey)
  });

  // Priority: Cognito > Supabase > Mock
  if (useCognito) {
    hybridLogger.info('Using Cognito authentication provider');
    return useCognitoAuthProvider();
  } else if (useSupabase) {
    hybridLogger.info('Using Supabase authentication provider');
    return useAuthProvider();
  } else {
    hybridLogger.warn('No authentication provider configured, using Supabase as fallback');
    return useAuthProvider();
  }
};

// Export the same context type for compatibility
export { AuthContext } from './useAuth';
export { CognitoAuthContext } from './useCognitoAuth';

// Create a unified auth context that works with both providers
export const useAuth = () => {
  const useCognito = config.useCognito;
  
  if (useCognito) {
    // Use Cognito auth hook
    const { useCognitoAuth } = require('./useCognitoAuth');
    return useCognitoAuth();
  } else {
    // Use Supabase auth hook
    const { useAuth: useSupabaseAuth } = require('./useAuth');
    return useSupabaseAuth();
  }
};