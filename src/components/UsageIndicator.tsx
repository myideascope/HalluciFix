import React from 'react';
import { BarChart3, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { formatCurrency } from '../lib/stripe';

interface UsageIndicatorProps {
  variant?: 'compact' | 'detailed' | 'minimal';
  showOverage?: boolean;
  className?: string;
}

export const UsageIndicator: React.FC<UsageIndicatorProps> = ({
  variant = 'compact',
  showOverage = true,
  className = ''
}) => {
  const {
    currentUsage,
    loading,
    error,
    subscriptionPlan,
    getUsagePercentage,
    getRemainingUsage,
    getUsageStatus
  } = useUsageTracking();

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div>
      </div>
    );
  }

  if (error || !currentUsage || !subscriptionPlan) {
    return null;
  }

  const percentage = getUsagePercentage();
  const remaining = getRemainingUsage();
  const status = getUsageStatus();

  const getStatusColor = () => {
    switch (status) {
      case 'exceeded':
        return 'text-red-600 dark:text-red-400';
      case 'critical':
        return 'text-red-600 dark:text-red-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-green-600 dark:text-green-400';
    }
  };

  const getProgressColor = () => {
    switch (status) {
      case 'exceeded':
        return 'bg-red-500';
      case 'critical':
        return 'bg-red-500';
      case 'warning':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-600';
    }
  };

  if (variant === 'minimal') {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <BarChart3 className={`w-4 h-4 ${getStatusColor()}`} />
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {currentUsage.limit === -1 
            ? `${currentUsage.current.toLocaleString()} calls`
            : `${currentUsage.current.toLocaleString()}/${currentUsage.limit.toLocaleString()}`
          }
        </span>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              API Usage
            </span>
          </div>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {currentUsage.limit === -1 
              ? currentUsage.current.toLocaleString()
              : `${currentUsage.current.toLocaleString()}/${currentUsage.limit.toLocaleString()}`
            }
          </span>
        </div>
        
        {currentUsage.limit !== -1 && (
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        )}
        
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
          <span>
            {currentUsage.limit === -1 
              ? 'Unlimited'
              : remaining > 0 
              ? `${remaining.toLocaleString()} remaining`
              : 'Limit exceeded'
            }
          </span>
          <span>Resets {currentUsage.resetDate.toLocaleDateString()}</span>
        </div>

        {showOverage && currentUsage.overage && currentUsage.overage > 0 && (
          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
            <div className="flex items-center space-x-1 text-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="w-3 h-3" />
              <span className="font-medium">Overage: {currentUsage.overage.toLocaleString()} calls</span>
            </div>
            {currentUsage.overageCost && (
              <div className="text-yellow-700 dark:text-yellow-300 mt-1">
                Additional cost: {formatCurrency(currentUsage.overageCost * 100, subscriptionPlan.currency)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Detailed variant
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Usage This Month
        </h3>
        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
          <Clock className="w-4 h-4" />
          <span>Resets {currentUsage.resetDate.toLocaleDateString()}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Usage Progress */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              API Calls
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {currentUsage.current.toLocaleString()} / {currentUsage.limit === -1 ? 'Unlimited' : currentUsage.limit.toLocaleString()}
            </span>
          </div>
          
          {currentUsage.limit !== -1 && (
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${getProgressColor()}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          )}
          
          <div className="flex justify-between items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{percentage.toFixed(1)}% used</span>
            {currentUsage.limit !== -1 && (
              <span>{remaining.toLocaleString()} remaining</span>
            )}
          </div>
        </div>

        {/* Usage Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <BarChart3 className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {currentUsage.current.toLocaleString()}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Total Usage
            </div>
          </div>
          
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {Math.round(currentUsage.current / new Date().getDate())}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Daily Average
            </div>
          </div>
          
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <Clock className="w-5 h-5 text-purple-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {Math.ceil((currentUsage.resetDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Days Left
            </div>
          </div>
          
          <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <BarChart3 className="w-5 h-5 text-orange-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {subscriptionPlan.name}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Current Plan
            </div>
          </div>
        </div>

        {/* Overage Warning */}
        {showOverage && currentUsage.overage && currentUsage.overage > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Usage Overage
                </h4>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                  You've used {currentUsage.overage.toLocaleString()} additional API calls this month.
                  {currentUsage.overageCost && (
                    <span className="block mt-1">
                      Additional usage cost: {formatCurrency(currentUsage.overageCost * 100, subscriptionPlan.currency)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsageIndicator;