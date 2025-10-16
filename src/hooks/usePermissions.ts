/**
 * Permissions Hook
 * Provides easy access to permission checking and authorization utilities
 */

import { useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';
import { AuthorizationErrorHandler, AlternativeAction } from '../lib/auth/authorizationErrorHandler';
import { User } from '../types/user';

export interface PermissionHookResult {
  // Permission checking
  hasPermission: (resource: string, action: string) => boolean;
  checkPermission: (resource: string, action: string) => {
    hasPermission: boolean;
    error?: any;
    alternatives?: AlternativeAction[];
  };
  
  // Role checking
  isAdmin: boolean;
  isManager: boolean;
  isEditor: boolean;
  isViewer: boolean;
  hasMinRole: (level: number) => boolean;
  
  // Feature permissions
  canAnalyze: boolean;
  canBatch: boolean;
  canSchedule: boolean;
  canViewAnalytics: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  
  // User info
  user: User | null;
  userRole: string | null;
  userLevel: number | null;
  permissionSummary: string;
  
  // Utilities
  getSuggestedActions: () => AlternativeAction[];
  validatePermissions: (permissions: Array<{ resource: string; action: string }>) => {
    allGranted: boolean;
    results: Array<{ resource: string; action: string; granted: boolean; error?: any }>;
  };
}

/**
 * Hook for permission checking and authorization
 */
export function usePermissions(): PermissionHookResult {
  const { user } = useAuth();

  // Memoized permission info
  const permissionInfo = useMemo(() => {
    return AuthorizationErrorHandler.getUserPermissionInfo(user);
  }, [user]);

  // Permission checking functions
  const hasPermission = useCallback((resource: string, action: string): boolean => {
    const result = AuthorizationErrorHandler.checkPermission(user, resource, action);
    return result.hasPermission;
  }, [user]);

  const checkPermission = useCallback((resource: string, action: string) => {
    return AuthorizationErrorHandler.checkPermission(user, resource, action);
  }, [user]);

  // Role checking functions
  const hasMinRole = useCallback((level: number): boolean => {
    return user ? user.role.level <= level : false;
  }, [user]);

  // Utility functions
  const getSuggestedActions = useCallback((): AlternativeAction[] => {
    return AuthorizationErrorHandler.getSuggestedActions(user);
  }, [user]);

  const validatePermissions = useCallback((permissions: Array<{ resource: string; action: string }>) => {
    return AuthorizationErrorHandler.validatePermissions(user, permissions);
  }, [user]);

  return {
    // Permission checking
    hasPermission,
    checkPermission,
    
    // Role checking
    isAdmin: permissionInfo.isAdmin,
    isManager: permissionInfo.isManager,
    isEditor: user?.role.level === 3,
    isViewer: user?.role.level === 4,
    hasMinRole,
    
    // Feature permissions
    canAnalyze: permissionInfo.canAnalyze,
    canBatch: permissionInfo.canBatch,
    canSchedule: permissionInfo.canSchedule,
    canViewAnalytics: permissionInfo.canViewAnalytics,
    canManageUsers: permissionInfo.canManageUsers,
    canManageSettings: permissionInfo.canManageSettings,
    
    // User info
    user,
    userRole: user?.role.name || null,
    userLevel: user?.role.level || null,
    permissionSummary: permissionInfo.permissionSummary,
    
    // Utilities
    getSuggestedActions,
    validatePermissions
  };
}

/**
 * Hook for checking a specific permission
 */
export function usePermission(resource: string, action: string) {
  const { user } = useAuth();
  
  return useMemo(() => {
    return AuthorizationErrorHandler.checkPermission(user, resource, action);
  }, [user, resource, action]);
}

/**
 * Hook for checking multiple permissions
 */
export function usePermissions(permissions: Array<{ resource: string; action: string }>) {
  const { user } = useAuth();
  
  return useMemo(() => {
    return AuthorizationErrorHandler.validatePermissions(user, permissions);
  }, [user, permissions]);
}

/**
 * Hook for role-based access control
 */
export function useRole() {
  const { user } = useAuth();
  
  return useMemo(() => {
    if (!user) {
      return {
        role: null,
        level: null,
        isAdmin: false,
        isManager: false,
        isEditor: false,
        isViewer: false,
        hasMinRole: () => false
      };
    }

    return {
      role: user.role.name,
      level: user.role.level,
      isAdmin: user.role.level === 1,
      isManager: user.role.level <= 2,
      isEditor: user.role.level === 3,
      isViewer: user.role.level === 4,
      hasMinRole: (level: number) => user.role.level <= level
    };
  }, [user]);
}

/**
 * Hook for feature-specific permissions
 */
export function useFeaturePermissions() {
  const permissions = usePermissions();
  
  return {
    analysis: {
      canCreate: permissions.hasPermission('analysis', 'create'),
      canRead: permissions.hasPermission('analysis', 'read'),
      canUpdate: permissions.hasPermission('analysis', 'update'),
      canDelete: permissions.hasPermission('analysis', 'delete'),
      canExecute: permissions.hasPermission('analysis', 'execute')
    },
    batch: {
      canCreate: permissions.hasPermission('batch', 'create'),
      canRead: permissions.hasPermission('batch', 'read'),
      canUpdate: permissions.hasPermission('batch', 'update'),
      canDelete: permissions.hasPermission('batch', 'delete'),
      canExecute: permissions.hasPermission('batch', 'execute')
    },
    scheduled: {
      canCreate: permissions.hasPermission('scheduled', 'create'),
      canRead: permissions.hasPermission('scheduled', 'read'),
      canUpdate: permissions.hasPermission('scheduled', 'update'),
      canDelete: permissions.hasPermission('scheduled', 'delete'),
      canExecute: permissions.hasPermission('scheduled', 'execute')
    },
    analytics: {
      canRead: permissions.hasPermission('analytics', 'read'),
      canExport: permissions.hasPermission('analytics', 'export')
    },
    users: {
      canCreate: permissions.hasPermission('users', 'create'),
      canRead: permissions.hasPermission('users', 'read'),
      canUpdate: permissions.hasPermission('users', 'update'),
      canDelete: permissions.hasPermission('users', 'delete')
    },
    settings: {
      canRead: permissions.hasPermission('settings', 'read'),
      canUpdate: permissions.hasPermission('settings', 'update')
    }
  };
}

/**
 * Hook for permission-based UI rendering
 */
export function usePermissionUI() {
  const permissions = usePermissions();
  
  const renderIfPermitted = useCallback((
    resource: string, 
    action: string, 
    component: React.ReactNode,
    fallback?: React.ReactNode
  ) => {
    return permissions.hasPermission(resource, action) ? component : (fallback || null);
  }, [permissions]);

  const renderIfRole = useCallback((
    minLevel: number,
    component: React.ReactNode,
    fallback?: React.ReactNode
  ) => {
    return permissions.hasMinRole(minLevel) ? component : (fallback || null);
  }, [permissions]);

  return {
    renderIfPermitted,
    renderIfRole,
    ...permissions
  };
}

export default usePermissions;