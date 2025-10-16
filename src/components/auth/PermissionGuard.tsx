/**
 * Permission Guard Component
 * Wraps components to enforce authorization and display appropriate error messages
 */

import React, { ReactNode } from 'react';
import { AuthorizationErrorHandler, AlternativeAction } from '../../lib/auth/authorizationErrorHandler';
import { User } from '../../types/user';
import { useAuth } from '../../hooks/useAuth';
import AccessDeniedError from './AccessDeniedError';

interface PermissionGuardProps {
  children: ReactNode;
  resource: string;
  action: string;
  user?: User | null;
  fallback?: ReactNode;
  showAlternatives?: boolean;
  onAccessDenied?: (error: any) => void;
  onAlternativeAction?: (action: AlternativeAction) => void;
  className?: string;
}

interface MultiPermissionGuardProps {
  children: ReactNode;
  permissions: Array<{ resource: string; action: string }>;
  requireAll?: boolean; // If true, user must have ALL permissions. If false, user needs ANY permission
  user?: User | null;
  fallback?: ReactNode;
  showAlternatives?: boolean;
  onAccessDenied?: (errors: any[]) => void;
  onAlternativeAction?: (action: AlternativeAction) => void;
  className?: string;
}

/**
 * Single Permission Guard
 * Checks a single permission and renders children or error UI
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  resource,
  action,
  user: propUser,
  fallback,
  showAlternatives = true,
  onAccessDenied,
  onAlternativeAction,
  className
}) => {
  const { user: authUser } = useAuth();
  const user = propUser ?? authUser;

  const permissionResult = AuthorizationErrorHandler.checkPermission(user, resource, action);

  if (permissionResult.hasPermission) {
    return <>{children}</>;
  }

  // Handle access denied
  if (onAccessDenied && permissionResult.error) {
    onAccessDenied(permissionResult.error);
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show default access denied UI
  return (
    <AccessDeniedError
      error={permissionResult.error!}
      user={user}
      alternatives={showAlternatives ? permissionResult.alternatives : []}
      onActionClick={onAlternativeAction}
      className={className}
    />
  );
};

/**
 * Multi Permission Guard
 * Checks multiple permissions with AND/OR logic
 */
export const MultiPermissionGuard: React.FC<MultiPermissionGuardProps> = ({
  children,
  permissions,
  requireAll = true,
  user: propUser,
  fallback,
  showAlternatives = true,
  onAccessDenied,
  onAlternativeAction,
  className
}) => {
  const { user: authUser } = useAuth();
  const user = propUser ?? authUser;

  const validationResult = AuthorizationErrorHandler.validatePermissions(user, permissions);

  // Check if access should be granted
  const hasAccess = requireAll ? validationResult.allGranted : 
    validationResult.results.some(r => r.granted);

  if (hasAccess) {
    return <>{children}</>;
  }

  // Get the first error for display
  const firstError = validationResult.results.find(r => r.error)?.error;
  const deniedPermissions = validationResult.results.filter(r => !r.granted);

  // Handle access denied
  if (onAccessDenied) {
    onAccessDenied(deniedPermissions.map(p => p.error).filter(Boolean));
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show default access denied UI with the first error
  if (firstError) {
    // Generate alternatives based on all denied permissions
    const allAlternatives = deniedPermissions
      .map(p => AuthorizationErrorHandler.checkPermission(user, p.resource, p.action).alternatives)
      .flat()
      .filter((alt, index, arr) => 
        // Remove duplicates based on label and action
        arr.findIndex(a => a.label === alt?.label && a.action === alt?.action) === index
      ) as AlternativeAction[];

    return (
      <AccessDeniedError
        error={firstError}
        user={user}
        alternatives={showAlternatives ? allAlternatives : []}
        onActionClick={onAlternativeAction}
        className={className}
      />
    );
  }

  // Fallback error display
  return (
    <div className={`p-6 text-center ${className}`}>
      <p className="text-slate-600 dark:text-slate-400">
        Access denied. You don't have the required permissions.
      </p>
    </div>
  );
};

/**
 * Role-based Guard
 * Checks if user has a specific role level or higher
 */
interface RoleGuardProps {
  children: ReactNode;
  minLevel: number; // 1 = Admin, 2 = Manager, 3 = Editor, 4 = Viewer
  user?: User | null;
  fallback?: ReactNode;
  showAlternatives?: boolean;
  onAccessDenied?: (error: any) => void;
  onAlternativeAction?: (action: AlternativeAction) => void;
  className?: string;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  minLevel,
  user: propUser,
  fallback,
  showAlternatives = true,
  onAccessDenied,
  onAlternativeAction,
  className
}) => {
  const { user: authUser } = useAuth();
  const user = propUser ?? authUser;

  if (!user) {
    const error = {
      type: 'AUTHORIZATION' as const,
      severity: 'medium' as const,
      message: 'Authentication required',
      userMessage: 'You must be signed in to access this feature.',
      statusCode: 401,
      retryable: false,
      timestamp: new Date().toISOString(),
      errorId: `auth_${Date.now()}`
    };

    if (onAccessDenied) {
      onAccessDenied(error);
    }

    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className={`p-6 text-center ${className}`}>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          You must be signed in to access this feature.
        </p>
        <button
          onClick={() => window.location.href = '/auth/login'}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Sign In
        </button>
      </div>
    );
  }

  if (user.role.level <= minLevel) {
    return <>{children}</>;
  }

  // User doesn't have sufficient role level
  const roleName = ['', 'Administrator', 'Manager', 'Editor', 'Viewer'][minLevel] || 'Unknown';
  const error = {
    type: 'AUTHORIZATION' as const,
    severity: 'medium' as const,
    message: 'Insufficient role level',
    userMessage: `This feature requires ${roleName} level access or higher. Your current role is ${user.role.name}.`,
    statusCode: 403,
    retryable: false,
    timestamp: new Date().toISOString(),
    errorId: `role_${Date.now()}`,
    userRole: user.role.name
  };

  if (onAccessDenied) {
    onAccessDenied(error);
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const alternatives: AlternativeAction[] = [
    {
      label: 'Contact Administrator',
      description: 'Request role upgrade to access this feature',
      action: 'contact_admin'
    },
    {
      label: 'Go to Dashboard',
      description: 'Return to your dashboard',
      action: 'navigate',
      target: '/dashboard'
    }
  ];

  return (
    <AccessDeniedError
      error={error as any}
      user={user}
      alternatives={showAlternatives ? alternatives : []}
      onActionClick={onAlternativeAction}
      className={className}
    />
  );
};

/**
 * Feature Flag Guard
 * Combines permission checking with feature flag logic
 */
interface FeatureGuardProps {
  children: ReactNode;
  feature: string;
  resource?: string;
  action?: string;
  user?: User | null;
  fallback?: ReactNode;
  showAlternatives?: boolean;
  onAccessDenied?: (error: any) => void;
  onAlternativeAction?: (action: AlternativeAction) => void;
  className?: string;
}

export const FeatureGuard: React.FC<FeatureGuardProps> = ({
  children,
  feature,
  resource,
  action,
  user: propUser,
  fallback,
  showAlternatives = true,
  onAccessDenied,
  onAlternativeAction,
  className
}) => {
  const { user: authUser } = useAuth();
  const user = propUser ?? authUser;

  // Check feature flag (you would implement this based on your feature flag system)
  const isFeatureEnabled = true; // Placeholder - implement your feature flag logic

  if (!isFeatureEnabled) {
    const error = {
      type: 'FEATURE_DISABLED' as const,
      severity: 'low' as const,
      message: 'Feature not available',
      userMessage: 'This feature is currently not available.',
      statusCode: 404,
      retryable: false,
      timestamp: new Date().toISOString(),
      errorId: `feature_${Date.now()}`
    };

    if (onAccessDenied) {
      onAccessDenied(error);
    }

    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className={`p-6 text-center ${className}`}>
        <p className="text-slate-600 dark:text-slate-400">
          This feature is currently not available.
        </p>
      </div>
    );
  }

  // If permission checking is required, use PermissionGuard
  if (resource && action) {
    return (
      <PermissionGuard
        resource={resource}
        action={action}
        user={user}
        fallback={fallback}
        showAlternatives={showAlternatives}
        onAccessDenied={onAccessDenied}
        onAlternativeAction={onAlternativeAction}
        className={className}
      >
        {children}
      </PermissionGuard>
    );
  }

  return <>{children}</>;
};

export default PermissionGuard;