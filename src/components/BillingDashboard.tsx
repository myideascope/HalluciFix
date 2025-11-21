import React, { useState, useEffect, useCallback } from 'react';
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
  Zap,
  FileText,
  Receipt,
  Bell,
  X,
  Eye
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { subscriptionService } from '../lib/subscriptionServiceClient';
import { billingService } from '../lib/billingServiceClient';
import { formatCurrency } from '../lib/stripe';
import { 
  SubscriptionPlan, 
  UserSubscription, 
  Invoice, 
  PaymentHistory, 
  BillingNotification,
  UsageHistoryEntry 
} from '../types/subscription';
import { useToast } from '../hooks/useToast';
import { UsageChart } from './UsageChart';

import { logger } from './logging';
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // New state for invoice and payment history
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [notifications, setNotifications] = useState<BillingNotification[]>([]);
  const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'payments' | 'usage'>('overview');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'paid' | 'open' | 'past_due'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'succeeded' | 'failed'>('all');
  const [showNotifications, setShowNotifications] = useState(false);
  
  const { user } = useAuth();
  const { showToast } = useToast();

  const loadBillingData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Load subscription and billing information
      const [subscriptionData, invoicesData, paymentsData, notificationsData, usageHistoryData] = await Promise.all([
        subscriptionService.getSubscriptionBillingInfo(user.id),
        billingService.getUserInvoices(user.id, { limit: 10 }),
        billingService.getUserPaymentHistory(user.id, { limit: 10 }),
        billingService.getUserBillingNotifications(user.id, { limit: 5 }),
        billingService.getUserUsageHistory(user.id, { days: 30 })
      ]);

      setSubscription(subscriptionData.subscription);
      setPlan(subscriptionData.plan);
      setUsage({
        current: subscriptionData.usage.current,
        limit: subscriptionData.usage.limit,
        percentage: subscriptionData.usage.percentage,
        resetDate: subscriptionData.usage.resetDate,
        overage: subscriptionData.usage.overage,
        overageCost: subscriptionData.usage.overageCost,
      });
      
      setInvoices(invoicesData.invoices);
      setPaymentHistory(paymentsData.payments);
      setNotifications(notificationsData.notifications);
      setUsageHistory(usageHistoryData);

    } catch (error) {
      logger.error("Error loading billing data:", error instanceof Error ? error : new Error(String(error)));
      showToast('Failed to load billing information', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    if (user) {
      loadBillingData();
    }
  }, [user]); // Removed loadBillingData since it's now stable

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
      logger.error("Error opening billing portal:", error instanceof Error ? error : new Error(String(error)));
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
      logger.error("Error canceling subscription:", error instanceof Error ? error : new Error(String(error)));
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
      logger.error("Error reactivating subscription:", error instanceof Error ? error : new Error(String(error)));
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

  const getInvoiceStatusColor = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'open':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20';
      case 'past_due':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      case 'draft':
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
      case 'void':
      case 'uncollectible':
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
      default:
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
    }
  };

  const getPaymentStatusColor = (status: PaymentHistory['status']) => {
    switch (status) {
      case 'succeeded':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'failed':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      case 'canceled':
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
      default:
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
    }
  };

  const getNotificationSeverityColor = (severity: BillingNotification['severity']) => {
    switch (severity) {
      case 'success':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'info':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'error':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      default:
        return 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800';
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    if (invoice.invoicePdf) {
      window.open(invoice.invoicePdf, '_blank');
    } else if (invoice.hostedInvoiceUrl) {
      window.open(invoice.hostedInvoiceUrl, '_blank');
    } else {
      showToast('Invoice download not available', 'error');
    }
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    try {
      await billingService.markNotificationAsRead(user!.id, notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true, readAt: new Date() } : n)
      );
    } catch (error) {
      logger.error("Error marking notification as read:", error instanceof Error ? error : new Error(String(error)));
      showToast('Failed to mark notification as read', 'error');
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    if (invoiceFilter === 'all') return true;
    return invoice.status === invoiceFilter;
  });

  const filteredPayments = paymentHistory.filter(payment => {
    if (paymentFilter === 'all') return true;
    return payment.status === paymentFilter;
  });

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
          {/* Notifications Button */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="flex items-center space-x-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
              )}
            </button>
            
            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium text-slate-900 dark:text-slate-100">
                      Billing Notifications
                    </h3>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-4 border-b border-slate-100 dark:border-slate-700 last:border-0 ${
                          !notification.read ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getNotificationSeverityColor(notification.severity)}`}>
                                {notification.severity}
                              </span>
                              {!notification.read && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                              )}
                            </div>
                            <h4 className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                              {notification.title}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                              {notification.message}
                            </p>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                              {notification.createdAt.toLocaleDateString()}
                            </div>
                          </div>
                          {!notification.read && (
                            <button
                              onClick={() => handleMarkNotificationRead(notification.id)}
                              className="text-blue-600 hover:text-blue-700 text-xs"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                        {notification.actionUrl && notification.actionText && (
                          <a
                            href={notification.actionUrl}
                            className="inline-block mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                          >
                            {notification.actionText}
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
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

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'invoices', label: 'Invoices', icon: FileText },
            { id: 'payments', label: 'Payment History', icon: Receipt },
            { id: 'usage', label: 'Usage Trends', icon: TrendingUp },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
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
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-6">
          {/* Invoices Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Invoice History
            </h2>
            <div className="flex items-center space-x-3">
              <select
                value={invoiceFilter}
                onChange={(e) => setInvoiceFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Invoices</option>
                <option value="paid">Paid</option>
                <option value="open">Open</option>
                <option value="past_due">Past Due</option>
              </select>
            </div>
          </div>

          {/* Invoices List */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {filteredInvoices.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                  No Invoices Found
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  {invoiceFilter === 'all' 
                    ? "You don't have any invoices yet."
                    : `No ${invoiceFilter} invoices found.`
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredInvoices.map((invoice) => (
                  <div key={invoice.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-medium text-slate-900 dark:text-slate-100">
                            {invoice.invoiceNumber || `Invoice ${invoice.id.slice(-8)}`}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getInvoiceStatusColor(invoice.status)}`}>
                            {invoice.status}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                          {invoice.description}
                        </p>
                        <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                          <span>
                            Period: {invoice.periodStart.toLocaleDateString()} - {invoice.periodEnd.toLocaleDateString()}
                          </span>
                          <span>
                            Due: {invoice.dueDate?.toLocaleDateString() || 'N/A'}
                          </span>
                          {invoice.paidAt && (
                            <span>
                              Paid: {invoice.paidAt.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {formatCurrency(invoice.total, invoice.currency)}
                          </div>
                          {invoice.tax && invoice.tax > 0 && (
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              Tax: {formatCurrency(invoice.tax, invoice.currency)}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex space-x-2">
                          {(invoice.invoicePdf || invoice.hostedInvoiceUrl) && (
                            <button
                              onClick={() => handleDownloadInvoice(invoice)}
                              className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="Download Invoice"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          {invoice.hostedInvoiceUrl && (
                            <button
                              onClick={() => window.open(invoice.hostedInvoiceUrl, '_blank')}
                              className="p-2 text-slate-600 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                              title="View Invoice"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment History Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          {/* Payment History Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Payment History
            </h2>
            <div className="flex items-center space-x-3">
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Payments</option>
                <option value="succeeded">Successful</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {/* Payment History List */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {filteredPayments.length === 0 ? (
              <div className="p-8 text-center">
                <Receipt className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                  No Payment History
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  {paymentFilter === 'all' 
                    ? "You don't have any payment history yet."
                    : `No ${paymentFilter} payments found.`
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredPayments.map((payment) => (
                  <div key={payment.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="flex items-center space-x-2">
                            <CreditCard className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {payment.paymentMethod.brand?.toUpperCase()} •••• {payment.paymentMethod.last4}
                            </span>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPaymentStatusColor(payment.status)}`}>
                            {payment.status}
                          </span>
                        </div>
                        
                        {payment.description && (
                          <p className="text-slate-600 dark:text-slate-400 text-sm mb-2">
                            {payment.description}
                          </p>
                        )}
                        
                        <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                          <span>
                            {payment.createdAt.toLocaleDateString()} at {payment.createdAt.toLocaleTimeString()}
                          </span>
                          {payment.paymentMethod.expiryMonth && payment.paymentMethod.expiryYear && (
                            <span>
                              Expires {payment.paymentMethod.expiryMonth.toString().padStart(2, '0')}/{payment.paymentMethod.expiryYear}
                            </span>
                          )}
                        </div>
                        
                        {payment.status === 'failed' && payment.failureMessage && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
                            {payment.failureMessage}
                          </div>
                        )}
                        
                        {payment.refunded && payment.refundedAmount && (
                          <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-700 dark:text-yellow-400">
                            Refunded: {formatCurrency(payment.refundedAmount, payment.currency)}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {formatCurrency(payment.amount, payment.currency)}
                          </div>
                          {payment.receiptUrl && (
                            <a
                              href={payment.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              View Receipt
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Usage Trends Tab */}
      {activeTab === 'usage' && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Usage Trends
          </h2>
          
          {/* Usage Chart Placeholder */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                Daily Usage (Last 30 Days)
              </h3>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                API Calls per Day
              </div>
            </div>
            
            {usageHistory.length === 0 ? (
              <div className="text-center py-12">
                <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400">
                  No usage data available yet
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Usage Chart */}
                <UsageChart data={usageHistory} />
                
                {/* Usage Summary */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {usageHistory.reduce((sum, entry) => sum + entry.usage, 0).toLocaleString()}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Total Usage (30 days)
                    </div>
                  </div>
                  
                  <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {Math.round(usageHistory.reduce((sum, entry) => sum + entry.usage, 0) / usageHistory.length).toLocaleString()}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Daily Average
                    </div>
                  </div>
                  
                  <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {Math.max(...usageHistory.map(entry => entry.usage)).toLocaleString()}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Peak Day
                    </div>
                  </div>
                  
                  <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {usageHistory.filter(entry => entry.overage && entry.overage > 0).length}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Overage Days
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingDashboard;