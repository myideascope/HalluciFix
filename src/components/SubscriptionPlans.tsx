import React, { useState, useEffect } from 'react';
import { Check, Zap, Crown, Star, ArrowRight, Loader2 } from 'lucide-react';
import { subscriptionService } from '../lib/subscriptionService';
import { SubscriptionPlan } from '../types/subscription';
import { useAuth } from '../hooks/useAuth';

interface PlanCardProps {
  plan: SubscriptionPlan;
  currentPlan?: string;
  onSelect: (plan: SubscriptionPlan) => void;
  loading?: boolean;
  isPopular?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  currentPlan,
  onSelect,
  loading,
  isPopular
}) => {
  const isCurrentPlan = currentPlan === plan.id;
  const isEnterprise = plan.id === 'enterprise';

  const getPlanIcon = () => {
    switch (plan.id) {
      case 'basic':
        return <Zap className="w-6 h-6 text-blue-600" />;
      case 'pro':
        return <Star className="w-6 h-6 text-purple-600" />;
      case 'enterprise':
        return <Crown className="w-6 h-6 text-amber-600" />;
      default:
        return <Zap className="w-6 h-6 text-blue-600" />;
    }
  };

  const getButtonStyles = () => {
    if (isCurrentPlan) {
      return 'bg-green-100 text-green-800 cursor-default dark:bg-green-900 dark:text-green-200';
    }
    if (loading) {
      return 'bg-slate-400 cursor-not-allowed text-white';
    }
    if (isPopular) {
      return 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600';
    }
    if (isEnterprise) {
      return 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600';
    }
    return 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600';
  };

  return (
    <div className={`relative bg-white dark:bg-slate-800 rounded-xl border-2 p-6 transition-all duration-200 hover:shadow-lg ${
      isPopular 
        ? 'border-blue-500 shadow-lg scale-105' 
        : isCurrentPlan 
        ? 'border-green-500 shadow-md' 
        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium flex items-center gap-1">
            <Star className="w-3 h-3" />
            Most Popular
          </span>
        </div>
      )}
      
      {isCurrentPlan && (
        <div className="absolute -top-3 right-4">
          <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
            <Check className="w-3 h-3" />
            Current Plan
          </span>
        </div>
      )}
      
      <div className="text-center mb-6">
        <div className="flex items-center justify-center mb-3">
          {getPlanIcon()}
        </div>
        
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          {plan.name}
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-4">{plan.description}</p>
        
        <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {isEnterprise ? (
            'Custom'
          ) : (
            <>
              ${plan.price}
              <span className="text-lg font-normal text-slate-600 dark:text-slate-400">
                /{plan.interval}
              </span>
            </>
          )}
        </div>
        
        {plan.trialDays && !isCurrentPlan && (
          <div className="mt-2 text-sm text-blue-600 dark:text-blue-400 font-medium">
            {plan.trialDays}-day free trial
          </div>
        )}
      </div>
      
      <ul className="space-y-3 mb-6">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start space-x-3">
            <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <span className="text-slate-700 dark:text-slate-300 text-sm">{feature}</span>
          </li>
        ))}
      </ul>
      
      <button
        onClick={() => onSelect(plan)}
        disabled={loading || isCurrentPlan}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${getButtonStyles()}`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : isCurrentPlan ? (
          'Current Plan'
        ) : isEnterprise ? (
          <>
            Contact Sales
            <ArrowRight className="w-4 h-4" />
          </>
        ) : (
          <>
            Get Started
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
};

interface SubscriptionPlansProps {
  onPlanSelect?: (plan: SubscriptionPlan) => void;
  showHeader?: boolean;
  currentPlanId?: string;
}

export const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({
  onPlanSelect,
  showHeader = true,
  currentPlanId
}) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  
  useEffect(() => {
    loadSubscriptionPlans();
  }, []);

  const loadSubscriptionPlans = async () => {
    try {
      setPlansLoading(true);
      setError(null);
      const subscriptionPlans = await subscriptionService.getSubscriptionPlans();
      setPlans(subscriptionPlans);
    } catch (error) {
      console.error('Failed to load subscription plans:', error);
      setError('Failed to load subscription plans. Please try again.');
    } finally {
      setPlansLoading(false);
    }
  };

  const handlePlanSelect = async (plan: SubscriptionPlan) => {
    if (!user) {
      // Redirect to login or show login modal
      console.warn('User must be logged in to select a plan');
      return;
    }

    if (plan.id === 'enterprise') {
      // Open contact sales
      window.open('mailto:sales@hallucifix.com?subject=Enterprise Plan Inquiry', '_blank');
      return;
    }

    setLoading(true);
    try {
      if (onPlanSelect) {
        onPlanSelect(plan);
      } else {
        // Default behavior: create checkout session
        const { url } = await subscriptionService.createCheckoutSession(
          user.id,
          plan.stripePriceId,
          {
            successUrl: `${window.location.origin}/billing/success?plan=${plan.id}`,
            cancelUrl: `${window.location.origin}/pricing`,
            trialPeriodDays: plan.trialDays,
            allowPromotionCodes: true,
            metadata: {
              planId: plan.id,
              planName: plan.name,
            },
          }
        );
        
        // Redirect to Stripe Checkout
        window.location.href = url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setError('Failed to start checkout process. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (plansLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-2 text-slate-600 dark:text-slate-400">Loading subscription plans...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
          <button
            onClick={loadSubscriptionPlans}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {showHeader && (
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Choose Your Plan
          </h2>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Start with a free trial and scale as you grow. All plans include our core AI accuracy verification features.
          </p>
        </div>
      )}
      
      <div className="grid md:grid-cols-3 gap-8 lg:gap-6">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentPlan={currentPlanId}
            onSelect={handlePlanSelect}
            loading={loading}
            isPopular={plan.popular}
          />
        ))}
      </div>
      
      {showHeader && (
        <div className="text-center mt-12">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            All plans include 24/7 support and a 30-day money-back guarantee
          </p>
          <div className="flex items-center justify-center space-x-6 text-sm text-slate-500 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <Check className="w-4 h-4 text-green-500" />
              No setup fees
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-4 h-4 text-green-500" />
              Cancel anytime
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-4 h-4 text-green-500" />
              Secure payments
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPlans;