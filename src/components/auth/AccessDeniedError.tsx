/**
 * Access Denied Error Component
 * Provides user-friendly error display for authorization failures with alternative actions
 */

import React from 'react';
import { 
  Lock, 
  Shield, 
  User, 
  Mail, 
  ArrowRight, 
  Home, 
  Eye, 
  Settings,
  Users,
  BarChart3,
  FileText,
  Calendar
} from 'lucide-react';
import { AuthorizationError, AlternativeAction } from '../../lib/auth/authorizationErrorHandler';
import { User as UserType } from '../../types/user';

interface AccessDeniedErrorProps {
  error: AuthorizationError;
  user?: UserType | null;
  alternatives?: AlternativeAction[];
  onActionClick?: (action: AlternativeAction) => void;
  className?: string;
}

const AccessDeniedError: React.FC<AccessDeniedErrorProps> = ({
  error,
  user,
  alternatives = [],
  onActionClick,
  className = ''
}) => {
  const getResourceIcon = (resource: string) => {
    switch (resource) {
      case 'analysis':
        return FileText;
      case 'batch':
        return FileText;
      case 'scheduled':
        return Calendar;
      case 'analytics':
        return BarChart3;
      case 'users':
        return Users;
      case 'settings':
        return Settings;
      default:
        return Lock;
    }
  };

  const getActionIcon = (action: AlternativeAction['action']) => {
    switch (action) {
      case 'navigate':
        return ArrowRight;
      case 'contact_admin':
        return Mail;
      case 'request_access':
        return User;
      case 'upgrade_role':
        return Shield;
      case 'view_alternative':
        return Eye;
      default:
        return ArrowRight;
    }
  };

  const handleActionClick = (action: AlternativeAction) => {
    if (onActionClick) {
      onActionClick(action);
      return;
    }

    // Default action handling
    switch (action.action) {
      case 'navigate':
        if (action.target) {
          window.location.href = action.target;
        }
        break;
      case 'contact_admin':
        // Open email client or contact form
        window.location.href = 'mailto:admin@hallucifix.com?subject=Access Request&body=I need access to additional features.';
        break;
      case 'request_access':
        // Could open a modal or navigate to a request form
        console.log('Request access action triggered');
        break;
      default:
        console.log('Action not implemented:', action.action);
    }
  };

  const ResourceIcon = error.requiredPermission ? 
    getResourceIcon(error.requiredPermission.resource) : Lock;

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-start space-x-4 mb-6">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
            <ResourceIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Access Denied
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            {error.userMessage}
          </p>
        </div>
      </div>

      {/* Permission Details */}
      {error.requiredPermission && (
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
            Required Permission
          </h4>
          <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-mono bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded">
              {error.requiredPermission.resource}:{error.requiredPermission.action}
            </span>
          </div>
        </div>
      )}

      {/* User Role Information */}
      {user && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
            Your Current Access
          </h4>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Role: <span className="font-medium">{user.role.name}</span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Department: <span className="font-medium">{user.department}</span>
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              {user.role.description}
            </p>
          </div>
        </div>
      )}

      {/* Alternative Actions */}
      {alternatives.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
            What you can do instead:
          </h4>
          <div className="space-y-2">
            {alternatives.map((action, index) => {
              const ActionIcon = getActionIcon(action.action);
              return (
                <button
                  key={index}
                  onClick={() => handleActionClick(action)}
                  className="w-full flex items-center space-x-3 p-3 text-left bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors group"
                >
                  <div className="flex-shrink-0">
                    <ActionIcon className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-300">
                      {action.label}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {action.description}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => window.location.href = '/'}
          className="flex items-center justify-center space-x-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Go to Dashboard</span>
        </button>
        
        <button
          onClick={() => handleActionClick({
            label: 'Contact Support',
            description: 'Get help with access issues',
            action: 'contact_admin'
          })}
          className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
        >
          <Mail className="w-4 h-4" />
          <span>Contact Support</span>
        </button>
      </div>

      {/* Error ID for support */}
      {error.errorId && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Error ID: {error.errorId}
          </p>
        </div>
      )}
    </div>
  );
};

export default AccessDeniedError;