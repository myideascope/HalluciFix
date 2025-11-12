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
  // Always call both hooks to follow Rules of Hooks
  const cognitoAuth = useCognitoAuthProvider();
  const supabaseAuth = useAuthProvider();

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
    return cognitoAuth;
  } else if (useSupabase) {
    hybridLogger.info('Using Supabase authentication provider');
    return supabaseAuth;
  } else {
    hybridLogger.warn('No authentication provider configured, using Supabase as fallback');
    return supabaseAuth;
  }
};

// Export the same context type for compatibility
export { AuthContext } from './useAuth';
export { CognitoAuthContext } from './useCognitoAuth';

// Import the hooks at the top level
import { useAuth as useSupabaseAuth } from './useAuth';
import { useCognitoAuth } from './useCognitoAuth';

// Create a unified auth context that works with both providers
export const useAuth = () => {
  // Always call both hooks to follow Rules of Hooks
  const cognitoAuth = useCognitoAuth();
  const supabaseAuth = useSupabaseAuth();

  const useCognito = config.useCognito;

  if (useCognito) {
    return cognitoAuth;
  } else {
    return supabaseAuth;
  }
};