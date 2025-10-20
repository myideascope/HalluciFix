import React from 'react';
import { Lock, Crown, Zap, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface SubscriptionGuardProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgrade?: boolean;
  className?: string;
}

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  feature,
  children,
  fallback,
  showUpgrade = true,
  className = ''
}) => {
  const { canAccessFeature, subscriptionPlan, hasActiveSubscription } = useAuth();

  if (canAccessFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgrade) {
    return null;
  }

  const getRequiredPlan = (feature: string): string => {
    const featureMap: Record<string, string> = {
      'basic_analysis': 'Basic',
      'advanced_analysis': 'Pro',
      'seq_logprob': 'Pro',
      'batch_processing': 'Pro',
      'scheduled_monitoring': 'Pro',
      'team_collaboration': 'Pro',
      'custom_integrations': 'Pro',
      'advanced_analytics': 'Pro',
      'unlimited_analyses': 'Enterprise',
      'custom_model_training': 'Enterprise',
      'dedicated_support': 'Enterprise',
      'sla_guarantees': 'Enterprise',
      'on_premise_deployment': 'Enterprise',
      'advanced_security': 'Enterprise'
    };
    return featureMap[feature] || 'Pro';
  };

  const requiredPlan = getRequiredPlan(feature);
  const currentPlan = subscriptionPlan?.name || 'Free';

  const getPlanIcon = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'basic':
        return <Zap className="w-5 h-5 text-blue-600" />;
      case 'pro':
        return <Crown className="w-5 h-5 text-purple-600" />;
      case 'enterprise':
        return <Crown className="w-5 h-5 text-amber-600" />;
      default:
        return <Lock className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg z-10 flex items-center justify-center">
        <div className="text-center p-6 max-w-sm">
          <div className="flex items-center justify-center mb-4">
            {getPlanIcon(requiredPlan)}
          </div>
          
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            {requiredPlan} Plan Required
          </h3>
          
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
            {hasActiveSubscription() 
              ? `Upgrade from ${currentPlan} to ${requiredPlan} to access this feature.`
              : `Subscribe to the ${requiredPlan} plan to access this feature.`
            }
          </p>
          
          <button
            onClick={() => window.location.href = `/pricing?upgrade=${requiredPlan.toLowerCase()}`}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <span>{hasActiveSubscription() ? 'Upgrade Plan' : 'View Pricing'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Blurred content */}
      <div className="filter blur-sm pointer-events-none">
        {children}
      </div>
    </div>
  );
};

export default SubscriptionGuard;