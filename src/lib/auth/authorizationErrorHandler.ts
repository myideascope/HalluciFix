/**
 * Authorization Error Handler
 * Provides permission-based error messages, role-based guidance, and alternative action suggestions
 */

import { User, Permission, UserRole } from '../../types/user';
import { ApiError, ErrorType, ErrorSeverity } from '../errors/types';
import { generateErrorId } from '../errors/classifier';
import React from 'react';

export interface AuthorizationError extends ApiError {
  requiredPermission?: {
    resource: string;
    action: string;
  };
  userRole?: string;
  userPermissions?: Permission[];
  alternativeActions?: AlternativeAction[];
}

export interface AlternativeAction {
  label: string;
  description: string;
  action: 'navigate' | 'request_access' | 'contact_admin' | 'upgrade_role' | 'view_alternative';
  target?: string;
  permission?: {
    resource: string;
    action: string;
  };
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  error?: AuthorizationError;
  alternatives?: AlternativeAction[];
}

/**
 * Authorization Error Handler
 * Manages permission-based errors and provides user guidance
 */
export class AuthorizationErrorHandler {
  private static readonly RESOURCE_LABELS: Record<string, string> = {
    'analysis': 'Content Analysis',
    'batch': 'Batch Processing',
    'scheduled': 'Scheduled Scans',
    'analytics': 'Analytics & Reports',
    'settings': 'System Settings',
    'users': 'User Management',
    'admin': 'Administration',
    'billing': 'Billing & Subscriptions'
  };

  private static readonly ACTION_LABELS: Record<string, string> = {
    'create': 'create',
    'read': 'view',
    'update': 'modify',
    'delete': 'delete',
    'execute': 'run',
    'manage': 'manage'
  };

  /**
   * Checks if a user has the required permission
   */
  static checkPermission(
    user: User | null,
    resource: string,
    action: string
  ): PermissionCheckResult {
    if (!user) {
      return {
        hasPermission: false,
        error: this.createAuthorizationError(
          'Authentication required',
          'You must be signed in to access this feature.',
          resource,
          action,
          null
        ),
        alternatives: [
          {
            label: 'Sign In',
            description: 'Sign in to access this feature',
            action: 'navigate',
            target: '/auth/login'
          }
        ]
      };
    }

    // Admin has all permissions
    if (user.role.level === 1) {
      return { hasPermission: true };
    }

    // Check if user has the specific permission
    const hasPermission = user.permissions.some(permission => {
      const resourceMatch = permission.resource === '*' || permission.resource === resource;
      const actionMatch = permission.actions.includes('*') || permission.actions.includes(action);
      return resourceMatch && actionMatch;
    });

    if (hasPermission) {
      return { hasPermission: true };
    }

    // Generate error with alternatives
    const error = this.createAuthorizationError(
      'Insufficient permissions',
      this.getPermissionDeniedMessage(resource, action, user.role),
      resource,
      action,
      user
    );

    const alternatives = this.generateAlternativeActions(resource, action, user);

    return {
      hasPermission: false,
      error,
      alternatives
    };
  }

  /**
   * Creates a detailed authorization error
   */
  private static createAuthorizationError(
    message: string,
    userMessage: string,
    resource: string,
    action: string,
    user: User | null
  ): AuthorizationError {
    return {
      type: ErrorType.AUTHORIZATION,
      severity: ErrorSeverity.MEDIUM,
      message,
      userMessage,
      statusCode: 403,
      retryable: false,
      timestamp: new Date().toISOString(),
      errorId: generateErrorId(),
      requiredPermission: { resource, action },
      userRole: user?.role.name,
      userPermissions: user?.permissions,
      context: {
        resource,
        action,
        userId: user?.id,
        userRole: user?.role.name,
        userLevel: user?.role.level
      }
    };
  }

  /**
   * Generates user-friendly permission denied messages
   */
  private static getPermissionDeniedMessage(
    resource: string,
    action: string,
    userRole: UserRole
  ): string {
    const resourceLabel = this.RESOURCE_LABELS[resource] || resource;
    const actionLabel = this.ACTION_LABELS[action] || action;

    const baseMessage = `You don't have permission to ${actionLabel} ${resourceLabel}.`;
    
    // Add role-specific guidance
    switch (userRole.level) {
      case 4: // Viewer
        return `${baseMessage} Your current role (${userRole.name}) provides read-only access. Contact your administrator to request additional permissions.`;
      
      case 3: // Editor
        return `${baseMessage} Your current role (${userRole.name}) allows content analysis but not ${actionLabel} access to ${resourceLabel}. Contact your manager or administrator for elevated permissions.`;
      
      case 2: // Manager
        return `${baseMessage} This action requires administrator privileges. Contact your system administrator for access.`;
      
      default:
        return `${baseMessage} Contact your administrator to request the necessary permissions.`;
    }
  }

  /**
   * Generates alternative actions based on the user's role and the requested permission
   */
  private static generateAlternativeActions(
    resource: string,
    action: string,
    user: User
  ): AlternativeAction[] {
    const alternatives: AlternativeAction[] = [];

    // Always offer to contact admin
    alternatives.push({
      label: 'Contact Administrator',
      description: 'Request access to this feature from your administrator',
      action: 'contact_admin'
    });

    // Resource-specific alternatives
    switch (resource) {
      case 'analysis':
        if (action === 'create' || action === 'execute') {
          // If user can't create analysis, suggest viewing existing ones
          if (this.userCanPerformAction(user, 'analysis', 'read')) {
            alternatives.unshift({
              label: 'View Existing Analysis',
              description: 'Browse previously completed analysis results',
              action: 'navigate',
              target: '/dashboard/analysis'
            });
          }
        } else if (action === 'delete' || action === 'update') {
          alternatives.unshift({
            label: 'View Analysis',
            description: 'You can view this analysis but cannot modify it',
            action: 'view_alternative',
            permission: { resource: 'analysis', action: 'read' }
          });
        }
        break;

      case 'batch':
        if (action === 'create' || action === 'execute') {
          // Suggest single analysis as alternative
          if (this.userCanPerformAction(user, 'analysis', 'create')) {
            alternatives.unshift({
              label: 'Single Analysis',
              description: 'Analyze individual content instead of batch processing',
              action: 'navigate',
              target: '/dashboard/analysis'
            });
          }
        }
        break;

      case 'scheduled':
        if (action === 'create' || action === 'update') {
          if (this.userCanPerformAction(user, 'scheduled', 'read')) {
            alternatives.unshift({
              label: 'View Scheduled Scans',
              description: 'Browse existing scheduled scans',
              action: 'navigate',
              target: '/dashboard/scheduled'
            });
          }
        }
        break;

      case 'analytics':
        if (action === 'read') {
          // If user can't view analytics, suggest basic dashboard
          alternatives.unshift({
            label: 'Basic Dashboard',
            description: 'View your personal analysis history',
            action: 'navigate',
            target: '/dashboard'
          });
        }
        break;

      case 'users':
        if (action === 'read') {
          alternatives.unshift({
            label: 'View Profile',
            description: 'Manage your own profile settings',
            action: 'navigate',
            target: '/profile'
          });
        }
        break;

      case 'settings':
        alternatives.unshift({
          label: 'Personal Settings',
          description: 'Manage your personal preferences',
          action: 'navigate',
          target: '/profile/settings'
        });
        break;
    }

    // Role-based upgrade suggestions
    if (user.role.level > 2) {
      alternatives.push({
        label: 'Request Role Upgrade',
        description: `Request upgrade from ${user.role.name} to access more features`,
        action: 'request_access'
      });
    }

    return alternatives;
  }

  /**
   * Checks if a user can perform a specific action (helper method)
   */
  private static userCanPerformAction(user: User, resource: string, action: string): boolean {
    if (user.role.level === 1) return true; // Admin
    
    return user.permissions.some(permission => {
      const resourceMatch = permission.resource === '*' || permission.resource === resource;
      const actionMatch = permission.actions.includes('*') || permission.actions.includes(action);
      return resourceMatch && actionMatch;
    });
  }

  /**
   * Gets detailed permission information for a user
   */
  static getUserPermissionInfo(user: User | null): {
    canAnalyze: boolean;
    canBatch: boolean;
    canSchedule: boolean;
    canViewAnalytics: boolean;
    canManageUsers: boolean;
    canManageSettings: boolean;
    isAdmin: boolean;
    isManager: boolean;
    permissionSummary: string;
  } {
    if (!user) {
      return {
        canAnalyze: false,
        canBatch: false,
        canSchedule: false,
        canViewAnalytics: false,
        canManageUsers: false,
        canManageSettings: false,
        isAdmin: false,
        isManager: false,
        permissionSummary: 'Not authenticated'
      };
    }

    const isAdmin = user.role.level === 1;
    const isManager = user.role.level <= 2;

    return {
      canAnalyze: isAdmin || this.userCanPerformAction(user, 'analysis', 'create'),
      canBatch: isAdmin || this.userCanPerformAction(user, 'batch', 'create'),
      canSchedule: isAdmin || this.userCanPerformAction(user, 'scheduled', 'create'),
      canViewAnalytics: isAdmin || this.userCanPerformAction(user, 'analytics', 'read'),
      canManageUsers: isAdmin || this.userCanPerformAction(user, 'users', 'update'),
      canManageSettings: isAdmin || this.userCanPerformAction(user, 'settings', 'update'),
      isAdmin,
      isManager,
      permissionSummary: this.getPermissionSummary(user)
    };
  }

  /**
   * Gets a human-readable summary of user permissions
   */
  private static getPermissionSummary(user: User): string {
    const role = user.role.name;
    const level = user.role.level;

    switch (level) {
      case 1:
        return `${role} - Full system access`;
      case 2:
        return `${role} - Advanced features and team oversight`;
      case 3:
        return `${role} - Content analysis and review capabilities`;
      case 4:
        return `${role} - Read-only access to results and reports`;
      default:
        return `${role} - Limited access`;
    }
  }

  /**
   * Validates multiple permissions at once
   */
  static validatePermissions(
    user: User | null,
    requiredPermissions: Array<{ resource: string; action: string }>
  ): {
    allGranted: boolean;
    results: Array<{ resource: string; action: string; granted: boolean; error?: AuthorizationError }>;
  } {
    const results = requiredPermissions.map(({ resource, action }) => {
      const result = this.checkPermission(user, resource, action);
      return {
        resource,
        action,
        granted: result.hasPermission,
        error: result.error
      };
    });

    return {
      allGranted: results.every(r => r.granted),
      results
    };
  }

  /**
   * Creates a permission guard function for use in components
   */
  static createPermissionGuard(resource: string, action: string) {
    return (user: User | null): PermissionCheckResult => {
      return this.checkPermission(user, resource, action);
    };
  }

  /**
   * Gets suggested next steps for a user based on their current permissions
   */
  static getSuggestedActions(user: User | null): AlternativeAction[] {
    if (!user) {
      return [
        {
          label: 'Sign In',
          description: 'Sign in to access HalluciFix features',
          action: 'navigate',
          target: '/auth/login'
        }
      ];
    }

    const suggestions: AlternativeAction[] = [];
    const info = this.getUserPermissionInfo(user);

    // Suggest actions based on what the user can do
    if (info.canAnalyze) {
      suggestions.push({
        label: 'Analyze Content',
        description: 'Check content for AI hallucinations',
        action: 'navigate',
        target: '/dashboard/analysis'
      });
    }

    if (info.canBatch) {
      suggestions.push({
        label: 'Batch Analysis',
        description: 'Process multiple files at once',
        action: 'navigate',
        target: '/dashboard/batch'
      });
    }

    if (info.canViewAnalytics) {
      suggestions.push({
        label: 'View Analytics',
        description: 'Review analysis trends and insights',
        action: 'navigate',
        target: '/dashboard/analytics'
      });
    }

    // If user has limited permissions, suggest requesting more
    if (user.role.level > 2) {
      suggestions.push({
        label: 'Request More Access',
        description: 'Contact your administrator for additional permissions',
        action: 'contact_admin'
      });
    }

    return suggestions;
  }
}

/**
 * React hook for authorization error handling
 */
export function useAuthorizationHandler() {
  const checkPermission = React.useCallback(
    (user: User | null, resource: string, action: string) => {
      return AuthorizationErrorHandler.checkPermission(user, resource, action);
    },
    []
  );

  const getUserInfo = React.useCallback((user: User | null) => {
    return AuthorizationErrorHandler.getUserPermissionInfo(user);
  }, []);

  const getSuggestions = React.useCallback((user: User | null) => {
    return AuthorizationErrorHandler.getSuggestedActions(user);
  }, []);

  const validatePermissions = React.useCallback(
    (user: User | null, permissions: Array<{ resource: string; action: string }>) => {
      return AuthorizationErrorHandler.validatePermissions(user, permissions);
    },
    []
  );

  return {
    checkPermission,
    getUserInfo,
    getSuggestions,
    validatePermissions
  };
}