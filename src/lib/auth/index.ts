/**
 * Authentication and Authorization Library
 * Centralized exports for auth-related services and utilities
 */

// Error Recovery
export { 
  AuthErrorRecoveryManager,
  attemptAuthRecovery,
  useAuthErrorRecovery
} from './authErrorRecovery';

export type {
  AuthRecoveryResult,
  AuthErrorContext
} from './authErrorRecovery';

// Authorization Error Handling
export { 
  AuthorizationErrorHandler,
  useAuthorizationHandler
} from './authorizationErrorHandler';

export type {
  AuthorizationError,
  AlternativeAction,
  PermissionCheckResult
} from './authorizationErrorHandler';

// Session Recovery
export {
  SessionRecoveryService,
  useSessionRecovery,
  sessionRecoveryService
} from './sessionRecoveryService';

export type {
  SessionStatus,
  SessionRecoveryOptions
} from './sessionRecoveryService';