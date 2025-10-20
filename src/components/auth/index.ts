/**
 * Authentication and Authorization Components
 * Centralized exports for auth-related components and utilities
 */

// Error Boundaries
export { default as AuthenticationErrorBoundary } from './AuthenticationErrorBoundary';

// Error Display Components
export { default as AccessDeniedError } from './AccessDeniedError';

// Permission Guards
export { 
  default as PermissionGuard,
  MultiPermissionGuard,
  RoleGuard,
  FeatureGuard
} from './PermissionGuard';

// Subscription Guards
export { 
  default as SubscriptionGuard,
  UsageLimitGuard,
  FeatureGuard as SubscriptionFeatureGuard 
} from './SubscriptionGuard';

// Re-export existing auth components for convenience
export { default as AuthErrorBoundary } from '../AuthErrorBoundary';

// Types and utilities
export type { 
  AuthorizationError,
  AlternativeAction 
} from '../../lib/auth/authorizationErrorHandler';

export type {
  AuthRecoveryResult,
  AuthErrorContext
} from '../../lib/auth/authErrorRecovery';