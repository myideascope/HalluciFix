import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { subscriptionService } from '../lib/subscriptionServiceClient';
import { SubscriptionPlan, UserSubscription } from '../types/subscription';

interface CheckoutSuccessProps {
  sessionId?: string;
  planId?: string;
  onContinue?: () => void;
}

export const CheckoutSuccess: React.FC<CheckoutSuccessProps> = ({
  sessionId,
  planId,
  onContinue
}) => {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const loadSubscriptionData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user's current subscription
      const userSubscription = await subscriptionService.getUserSubscription(user!.id);
      setSubscription(userSubscription);

      // Get plan details
      if (planId) {
        const planDetails = await subscriptionService.getSubscriptionPlan(planId);
        setPlan(planDetails);
      }

      setLoading(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load subscription data';
      setError(errorMessage);
      setLoading(false);
    }
  }, [user, planId]);

  useEffect(() => {
    if (user) {
      loadSubscriptionData();
    }
  }, [user, sessionId, planId, loadSubscriptionData]);

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
    } else {
      // Default: redirect to dashboard
      window.location.href = '/dashboard';
    }
  };

  const handleViewBilling = () => {
    window.location.href = '/billing';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Processing your subscription...
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Please wait while we set up your account.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Something went wrong
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {error}
          </p>
          <div className="space-y-3">
            <button
              onClick={loadSubscriptionData}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={handleViewBilling}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              View Billing Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Welcome to {plan?.name || 'HalluciFix'}!
          </h2>
          
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Your subscription has been successfully activated. You now have access to all {plan?.name || 'premium'} features.
          </p>

          {subscription && plan && (
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Subscription Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Plan:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium">{plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Price:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium">
                    ${plan.price}/{plan.interval}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Status:</span>
                  <span className={`font-medium capitalize ${
                    subscription.status === 'active' 
                      ? 'text-green-600 dark:text-green-400'
                      : subscription.status === 'trialing'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {subscription.status === 'trialing' ? 'Free Trial' : subscription.status}
                  </span>
                </div>
                {subscription.trialEnd && subscription.status === 'trialing' && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Trial ends:</span>
                    <span className="text-slate-900 dark:text-slate-100 font-medium">
                      {subscription.trialEnd.toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Next billing:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium">
                    {subscription.currentPeriodEnd.toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {plan && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
                What's included:
              </h3>
              <ul className="space-y-2">
                {plan.features.slice(0, 4).map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-700 dark:text-slate-300">{feature}</span>
                  </li>
                ))}
                {plan.features.length > 4 && (
                  <li className="text-sm text-slate-500 dark:text-slate-400 ml-6">
                    And {plan.features.length - 4} more features...
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleContinue}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
            
            <button
              onClick={handleViewBilling}
              className="w-full px-6 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              View Billing Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutSuccess;