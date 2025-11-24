/**
 * Subscription Notifications Component
 * Displays subscription-related notifications and alerts
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { subscriptionStatusMonitor } from '../lib/subscriptionStatusMonitor';
import { logger } from '../lib/logging';
import { 
  AlertCircle, 
  Clock, 
  CreditCard, 
  Zap, 
  X, 
  ArrowRight,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

interface Notification {
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  action?: {
    label: string;
    url: string;
  };
  dismissible: boolean;
}

interface SubscriptionNotificationsProps {
  className?: string;
  maxNotifications?: number;
  showDismissed?: boolean;
}

export const SubscriptionNotifications: React.FC<SubscriptionNotificationsProps> = ({
  className = '',
  maxNotifications = 3,
  showDismissed = false
}) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
    
    // Refresh notifications every 5 minutes
    const interval = setInterval(loadNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const loadNotifications = async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const userNotifications = await subscriptionStatusMonitor.createSubscriptionNotifications(user.id);
      setNotifications(userNotifications);
    } catch (error) {
      logger.error("Error loading subscription notifications:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  };

  const dismissNotification = (notificationKey: string) => {
    setDismissedNotifications(prev => new Set([...prev, notificationKey]));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-slate-500" />;
    }
  };

  const getNotificationStyles = (type: string) => {
    switch (type) {
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="bg-slate-200 dark:bg-slate-700 rounded-lg h-16"></div>
      </div>
    );
  }

  // Filter notifications
  const visibleNotifications = notifications
    .filter(notification => {
      const notificationKey = `${notification.type}-${notification.title}`;
      return showDismissed || !dismissedNotifications.has(notificationKey);
    })
    .slice(0, maxNotifications);

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {visibleNotifications.map((notification, index) => {
        const notificationKey = `${notification.type}-${notification.title}`;
        
        return (
          <div
            key={notificationKey}
            className={`rounded-lg border p-4 ${getNotificationStyles(notification.type)}`}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                {getNotificationIcon(notification.type)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {notification.title}
                    </h4>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {notification.message}
                    </p>
                  </div>
                  
                  {notification.dismissible && (
                    <button
                      onClick={() => dismissNotification(notificationKey)}
                      className="ml-3 flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {notification.action && (
                  <div className="mt-3">
                    <a
                      href={notification.action.url}
                      className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      {notification.action.label}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Subscription Status Banner
 * Shows critical subscription status at the top of the app
 */
interface SubscriptionStatusBannerProps {
  className?: string;
}

export const SubscriptionStatusBanner: React.FC<SubscriptionStatusBannerProps> = ({
  className = ''
}) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, [user]);

  const loadStatus = async () => {
    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }

    try {
      const subscriptionStatus = await subscriptionStatusMonitor.getSubscriptionStatus(user.id);
      setStatus(subscriptionStatus);
    } catch (error) {
      logger.error("Error loading subscription status:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  };

  if (loading || !status) {
    return null;
  }

  // Only show banner for critical issues
  if (status.degradationLevel === 'none' || status.degradationLevel === 'warning') {
    return null;
  }

  const getBannerContent = () => {
    if (status.degradationLevel === 'blocked') {
      return {
        icon: <CreditCard className="w-5 h-5" />,
        title: 'Subscription Required',
        message: 'Subscribe to access premium features and continue using the service.',
        actionLabel: 'View Plans',
        actionUrl: '/pricing',
        bgColor: 'bg-red-600',
        textColor: 'text-white'
      };
    }

    if (status.degradationLevel === 'limited') {
      if (status.inGracePeriod) {
        return {
          icon: <Clock className="w-5 h-5" />,
          title: 'Payment Issue - Grace Period Active',
          message: `Limited functionality available. ${status.gracePeriodDaysRemaining} days remaining to resolve payment issues.`,
          actionLabel: 'Update Payment',
          actionUrl: '/billing',
          bgColor: 'bg-yellow-600',
          textColor: 'text-white'
        };
      }

      return {
        icon: <Zap className="w-5 h-5" />,
        title: 'Limited Access',
        message: 'Your subscription has expired. Some features are disabled.',
        actionLabel: 'Renew Subscription',
        actionUrl: '/billing',
        bgColor: 'bg-orange-600',
        textColor: 'text-white'
      };
    }

    return null;
  };

  const bannerContent = getBannerContent();
  if (!bannerContent) {
    return null;
  }

  return (
    <div className={`${bannerContent.bgColor} ${bannerContent.textColor} ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center space-x-3">
            {bannerContent.icon}
            <div>
              <span className="font-medium">{bannerContent.title}</span>
              <span className="ml-2 opacity-90">{bannerContent.message}</span>
            </div>
          </div>
          
          <a
            href={bannerContent.actionUrl}
            className="inline-flex items-center px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg text-sm font-medium transition-colors"
          >
            {bannerContent.actionLabel}
            <ArrowRight className="w-4 h-4 ml-2" />
          </a>
        </div>
      </div>
    </div>
  );
};

/**
 * Subscription Health Indicator
 * Small indicator showing subscription health status
 */
interface SubscriptionHealthIndicatorProps {
  userId: string;
  className?: string;
  showLabel?: boolean;
}

export const SubscriptionHealthIndicator: React.FC<SubscriptionHealthIndicatorProps> = ({
  userId,
  className = '',
  showLabel = false
}) => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHealth();
    
    // Refresh every 10 minutes
    const interval = setInterval(loadHealth, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  const loadHealth = async () => {
    try {
      const healthStatus = await subscriptionStatusMonitor.monitorSubscriptionHealth(userId);
      setHealth(healthStatus);
    } catch (error) {
      logger.error("Error loading subscription health:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  };

  if (loading || !health) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="w-3 h-3 bg-slate-300 rounded-full"></div>
      </div>
    );
  }

  const getHealthColor = () => {
    if (health.healthy) return 'bg-green-500';
    if (health.issues.length <= 2) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getHealthLabel = () => {
    if (health.healthy) return 'Healthy';
    if (health.issues.length <= 2) return 'Warning';
    return 'Critical';
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`w-3 h-3 rounded-full ${getHealthColor()}`} />
      {showLabel && (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {getHealthLabel()}
        </span>
      )}
    </div>
  );
};

export default SubscriptionNotifications;