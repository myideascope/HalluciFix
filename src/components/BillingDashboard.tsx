import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  Settings,
  ExternalLink,
  Loader2,
  Calendar,
  DollarSign,
  BarChart3,
  Zap
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { subscriptionService } from '../lib/subscriptionService';
import { formatCurrency } from '../lib/stripe';
import { SubscriptionPlan, UserSubscription, BillingInfo } from '../types/subscription';
import { useToast } from '../hooks/useToast';

interface UsageData {
  current: number;
  limit: number;
  percentage: number;
  resetDate: Date;
  overage?: number;
  overageCost?: number;
}

interface BillingDashboardProps {
  className?: string;
}

export const BillingDashboard: React.FC<BillingDashboardProps> = ({ className = '' }) => {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { user } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (user) {
      loadBillingData();
    }
  }, [user]);

  const loadBillingData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Load subscription and billing information
      const [subscriptionData, billingData] = await Promise.all([
        subscriptionService.getSubscriptionBillingInfo(user.id),
        loadBillingInfo()
      ]);

      setSubscription(subscriptionData.subscription);
      setPlan(subscriptionData.plan);
      setUsage({
        current: subscriptionData.usage.current,
        limit: subscriptionData.usage.limit,
        percentage: subscriptionData.usage.percentage,
        resetDate: subscriptionData.usage.resetDate,
      });
      setBillingInfo(billingData);

    } catch (error) {
      console.error('Error loading billing data:', error);
      showToast('Failed to load billing information', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadBillingInfo = async (): Promise<BillingInfo | null> => {
    // This would typically come from an API endpoint
    // For now, return mock data structure
    return null;
  };

  const handleManageBilling = async () => {
    if (!user) return;

    try {
      setActionLoading('portal');
      const { url } = await subscriptionService.createPortalSession(
        user.id,
        `${window.location.origin}/billing`
      );
      window.location.href = url;
    } catch (error) {
      console.error('Error opening billing portal:', error);
      showToast('Failed to open billing portal', 'error');
      setActionLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription || !user) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You will retain access until the end of your current billing period.'
    );

    if (!confirmed) return;

    try {
      setActionLoading('cancel');
      await subscriptionService.cancelSubscription(subscription.stripeSubscriptionId, {
        cancelAtPeriodEnd: true
      });
      
      showToast('Subscription will be canceled at the end of your billing period', 'success');
      await loadBillingData(); // Refresh data
    } catch (error) {
      console.error('Error canceling subscription:', error);
      showToast('Failed to cancel subscription', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivateSubscription = async () => {
    if (!subscription || !user) return;

    try {
      setActionLoading('reactivate');
      await subscriptionService.reactivateSubscription(subscription.stripeSubscriptionId);
      
      showToast('Subscription reactivated successfully', 'success');
      await loadBillingData(); // Refresh data
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      showToast('Failed to reactivate subscription', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpgradeDowngrade = (targetPlan: 'basic' | 'pro' | 'enterprise') => {
    // Navigate to pricing page with upgrade/downgrade context
    const currentPlanId = plan?.id;
    window.location.href = `/pricing?current=${currentPlanId}&target=${targetPlan}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'trialing':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20';
      case 'past_due':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'canceled':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      default:
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-blue-600';
  };

  if (loading) {
    return (
      <div className={`max-w-6xl mx-auto p-6 ${className}`}>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
          </div>
          <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!subscription || !plan) {
    return (
      <div className={`max-w-6xl mx-auto p-6 ${className}`}>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            No Active Subscription
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            You don't have an active subscription. Choose a plan to get started.
          </p>
          <button
            onClick={() => window.location.href = '/pricing'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Pricing Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-6xl mx-auto p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Billing & Usage
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage your subscription and monitor usage
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleManageBilling}
            disabled={actionLoading === 'portal'}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'portal' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Settings className="w-4 h-4" />
            )}
            <span>Manage Billing</span>
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Subscription Status Card */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Current Subscription
            </h2>
            <div className="flex items-center space-x-3">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {plan.name}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}>
                {subscription.status === 'trialing' ? 'Free Trial' : subscription.status}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {plan.description}
            </p>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {plan.price > 0 ? formatCurrency(plan.price * 100, plan.currency) : 'Custom'}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {plan.price > 0 ? `per ${plan.interval}` : 'pricing'}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="flex items-center space-x-3">
            <Calendar className="w-5 h-5 text-slate-400" />
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {subscription.trialEnd && subscription.status === 'trialing' ? 'Trial ends' : 'Next billing'}
              </div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {(subscription.trialEnd && subscription.status === 'trialing' 
                  ? subscription.trialEnd 
                  : subscription.currentPeriodEnd
                ).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Analysis Limit</div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {plan.analysisLimit === -1 ? 'Unlimited' : plan.analysisLimit.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Zap className="w-5 h-5 text-blue-500" />
            <div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Priority</div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {plan.priority === 1 ? 'Standard' : plan.priority === 2 ? 'High' : 'Enterprise'}
              </div>
            </div>
          </div>
        </div>

        {/* Cancellation Notice */}
        {subscription.cancelAtPeriodEnd && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Subscription Scheduled for Cancellation
                </h3>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                  Your subscription will end on {subscription.currentPeriodEnd.toLocaleDateString()}. 
                  You'll retain access to all features until then.
                </p>
              </div>
              <button
                onClick={handleReactivateSubscription}
                disabled={actionLoading === 'reactivate'}
                className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'reactivate' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Reactivate'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {plan.id !== 'enterprise' && (
            <>
              {plan.id === 'basic' && (
                <button
                  onClick={() => handleUpgradeDowngrade('pro')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <TrendingUp className="w-4 h-4 inline mr-2" />
                  Upgrade to Pro
                </button>
              )}
              {plan.id === 'pro' && (
                <button
                  onClick={() => handleUpgradeDowngrade('basic')}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Downgrade to Basic
                </button>
              )}
            </>
          )}
          
          {!subscription.cancelAtPeriodEnd && subscription.status === 'active' && (
            <button
              onClick={handleCancelSubscription}
              disabled={actionLoading === 'cancel'}
              className="px-4 py-2 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'cancel' ? (
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              ) : null}
              Cancel Subscription
            </button>
          )}
        </div>
      </div>

      {/* Usage Tracking Card */}
      {usage && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Usage This Month
            </h2>
            <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
              <Clock className="w-4 h-4" />
              <span>Resets {usage.resetDate.toLocaleDateString()}</span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Usage Progress */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  API Calls
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {usage.current.toLocaleString()} / {usage.limit === -1 ? 'Unlimited' : usage.limit.toLocaleString()}
                </span>
              </div>
              
              {usage.limit !== -1 && (
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-300 ${getUsageColor(usage.percentage)}`}
                    style={{ width: `${Math.min(usage.percentage, 100)}%` }}
                  />
                </div>
              )}
              
              <div className="flex justify-between items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{usage.percentage.toFixed(1)}% used</span>
                {usage.limit !== -1 && (
                  <span>{(usage.limit - usage.current).toLocaleString()} remaining</span>
                )}
              </div>
            </div>

            {/* Overage Warning */}
            {usage.overage && usage.overage > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      Usage Overage
                    </h3>
                    <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                      You've used {usage.overage.toLocaleString()} additional API calls this month.
                      {usage.overageCost && (
                        <span className="block mt-1">
                          Additional usage cost: {formatCurrency(usage.overageCost * 100, plan.currency)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Usage Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {usage.current.toLocaleString()}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Total Usage
                </div>
              </div>
              
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {Math.round(usage.current / new Date().getDate())}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Daily Average
                </div>
              </div>
              
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <DollarSign className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {formatCurrency(plan.price * 100, plan.currency)}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Monthly Cost
                </div>
              </div>
              
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <Calendar className="w-6 h-6 text-orange-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {Math.ceil((usage.resetDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Days Left
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Features */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Your Plan Features
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {plan.features.map((feature, index) => (
            <div key={index} className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span className="text-slate-700 dark:text-slate-300">{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BillingDashboard;