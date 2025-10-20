/**
 * Subscription Guard Component
 * Wraps components to enforce subscription access and display appropriate upgrade prompts
 */

import React, { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSubscriptionAccess } from '../../hooks/useSubscriptionAccess';
import { 
  SubscriptionAccessOptions, 
  SubscriptionAccessResult,
  SubscriptionAccessMiddleware 
} from '../../lib/subscriptionAccessMiddleware';
import { CreditCard, Zap, Clock, AlertCircle, ArrowRight } from 'lucide-react';

interface SubscriptionGuardProps {
  children: ReactNode;
  feature?: string;
  options?: SubscriptionAccessOptions;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
  onAccessDenied?: (result: SubscriptionAccessResult) => void;
  className?: string;
}

interface UpgradePromptProps {
  accessResult: SubscriptionAccessResult;
  onUpgrade?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Upgrade Prompt Component
 */
const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  accessResult,
  onUpgrade,
  onDismiss,
  className
}) => {
  const getPromptContent = () => {
    if (accessResult.reason?.includes('subscription')) {
      return {
        icon: <CreditCard className="w-12 h-12 text-blue-500" />,
        title: 'Subscription Required',
        message: 'This feature requires an active subscription to access.',
        primaryAction: 'View Plans',
        primaryUrl: '/pricing'
      };
    }

    if (accessResult.reason?.includes('limit') || accessResult.reason?.includes('usage')) {
      return {
        icon: <Zap className="w-12 h-12 text-orange-500" />,
        title: 'Usage Limit Reached',
        message: 'You\'ve reached your monthly usage limit. Upgrade to continue using this feature.',
        primaryAction: 'Upgrade Plan',
        primaryUrl: '/pricing'
      };
    }

    if (accessResult.gracePeriod?.active) {
      return {
        icon: <Clock className="w-12 h-12 text-yellow-500" />,
        title: 'Payment Issue',
        message: `Your subscription has a payment issue. You have ${accessResult.gracePeriod.daysRemaining} days remaining in your grace period.`,
        primaryAction: 'Update Payment',
        primaryUrl: '/billing'
      };
    }

    return {
      icon: <AlertCircle className="w-12 h-12 text-red-500" />,
      title: 'Access Restricted',
      message: accessResult.reason || 'This feature is not available with your current plan.',
      primaryAction: 'View Options',
      primaryUrl: '/pricing'
    };
  };

  const content = getPromptContent();

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8 text-center ${className}`}>
      <div className="flex justify-center mb-4">
        {content.icon}
      </div>
      
      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {content.title}
      </h3>
      
      <p className="text-slate-600 dark:text-slate-400 mb-6">
        {content.message}
      </p>

      {/* Subscription Info */}
      {accessResult.subscription && (
        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Current Plan</span>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {accessResult.subscription.plan}
              </div>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <div className={`font-medium capitalize ${
                accessResult.subscription.status === 'active' 
                  ? 'text-green-600 dark:text-green-400'
                  : accessResult.subscription.status === 'past_due'
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {accessResult.subscription.status.replace('_', ' ')}
              </div>
            </div>
            {accessResult.subscription.limit > 0 && (
              <>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Usage</span>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {accessResult.subscription.current.toLocaleString()} / {accessResult.subscription.limit.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Resets</span>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {accessResult.subscription.resetDate.toLocaleDateString()}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={content.primaryUrl}
          onClick={onUpgrade}
          className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {content.primaryAction}
          <ArrowRight className="w-4 h-4 ml-2" />
        </a>

        {/* Alternative Actions */}
        {accessResult.alternatives && accessResult.alternatives.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {accessResult.alternatives.slice(0, 2).map((alt, index) => (
              <a
                key={index}
                href={alt.url}
                className="inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm"
              >
                {alt.label}
              </a>
            ))}
          </div>
        )}

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-sm"
          >
            Continue with limited access
          </button>
        )}
      </div>

      {/* Grace Period Warning */}
      {accessResult.gracePeriod?.active && (
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center justify-center text-yellow-800 dark:text-yellow-200 text-sm">
            <Clock className="w-4 h-4 mr-2" />
            Grace period ends on {accessResult.gracePeriod.endDate.toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Subscription Guard Component
 */
export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  children,
  feature,
  options = {},
  fallback,
  showUpgradePrompt = true,
  onAccessDenied,
  className
}) => {
  const { user } = useAuth();
  const [accessResult, setAccessResult] = useState<SubscriptionAccessResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      if (!user) {
        setAccessResult({
          allowed: false,
          reason: 'User not authenticated'
        });
        setLoading(false);
        return;
      }

      try {
        const result = await SubscriptionAccessMiddleware.checkSubscriptionAccess(user.id, {
          requiredFeature: feature,
          ...options
        });
        setAccessResult(result);

        if (!result.allowed && onAccessDenied) {
          onAccessDenied(result);
        }
      } catch (error) {
        console.error('Error checking subscription access:', error);
        setAccessResult({
          allowed: false,
          reason: 'Error checking subscription access'
        });
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [user, feature, options, onAccessDenied]);

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="bg-slate-200 dark:bg-slate-700 rounded-lg h-32"></div>
      </div>
    );
  }

  if (!accessResult) {
    return (
      <div className={`p-6 text-center ${className}`}>
        <p className="text-slate-600 dark:text-slate-400">
          Unable to verify access permissions.
        </p>
      </div>
    );
  }

  if (accessResult.allowed) {
    return <>{children}</>;
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show upgrade prompt if enabled
  if (showUpgradePrompt) {
    return (
      <UpgradePrompt
        accessResult={accessResult}
        className={className}
      />
    );
  }

  // Default access denied message
  return (
    <div className={`p-6 text-center ${className}`}>
      <p className="text-slate-600 dark:text-slate-400">
        {accessResult.reason || 'Access denied'}
      </p>
    </div>
  );
};

/**
 * Usage Limit Guard
 * Specifically for usage-based restrictions
 */
interface UsageLimitGuardProps {
  children: ReactNode;
  tokensRequired?: number;
  analysisType?: string;
  fallback?: ReactNode;
  showUsageInfo?: boolean;
  onLimitExceeded?: (result: SubscriptionAccessResult) => void;
  className?: string;
}

export const UsageLimitGuard: React.FC<UsageLimitGuardProps> = ({
  children,
  tokensRequired = 1,
  analysisType = 'api_call',
  fallback,
  showUsageInfo = true,
  onLimitExceeded,
  className
}) => {
  return (
    <SubscriptionGuard
      options={{
        enforceUsageLimit: true,
        tokensUsed: tokensRequired,
        analysisType
      }}
      fallback={fallback}
      showUpgradePrompt={showUsageInfo}
      onAccessDenied={onLimitExceeded}
      className={className}
    >
      {children}
    </SubscriptionGuard>
  );
};

/**
 * Feature Guard
 * For specific feature access
 */
interface FeatureGuardProps {
  children: ReactNode;
  feature: string;
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
  onAccessDenied?: (result: SubscriptionAccessResult) => void;
  className?: string;
}

export const FeatureGuard: React.FC<FeatureGuardProps> = ({
  children,
  feature,
  fallback,
  showUpgradePrompt = true,
  onAccessDenied,
  className
}) => {
  return (
    <SubscriptionGuard
      feature={feature}
      options={{
        requiredFeature: feature,
        enforceSubscription: true
      }}
      fallback={fallback}
      showUpgradePrompt={showUpgradePrompt}
      onAccessDenied={onAccessDenied}
      className={className}
    >
      {children}
    </SubscriptionGuard>
  );
};

export default SubscriptionGuard;