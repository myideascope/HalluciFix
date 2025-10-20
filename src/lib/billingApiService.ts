/**
 * Billing API Service
 * Client-side service for interacting with billing and payment method endpoints
 */

import { supabase } from './supabase';

// Types
export interface BillingInfo {
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string;
    plan: {
      id: string;
      name: string;
      price: number;
      interval: string;
      currency: string;
      features: string[];
    };
    cancelAtPeriodEnd: boolean;
    trialEnd?: string;
  } | null;
  usage: {
    current: number;
    limit: number;
    percentage: number;
    resetDate: string;
    overage: number;
    overageCost: number;
  };
  paymentMethod: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  } | null;
  invoices: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    downloadUrl: string;
    description: string;
  }>;
}

export interface UsageAnalytics {
  totalUsage: number;
  dailyAverage: number;
  peakDay: { date: string; usage: number };
  trend: 'increasing' | 'decreasing' | 'stable';
  dailyBreakdown: Array<{ date: string; usage: number }>;
}

export interface PaymentMethodInfo {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
    country?: string;
    funding?: string;
  };
  isDefault: boolean;
  createdAt: string;
}

export interface SetupIntentResponse {
  clientSecret: string;
  setupIntentId: string;
}

export interface PaymentMethodValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export class BillingApiService {
  private baseUrl: string;

  constructor() {
    // Use Supabase Edge Functions URL
    this.baseUrl = `${supabase.supabaseUrl}/functions/v1`;
  }

  /**
   * Get authentication headers
   */
  private async getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No authentication token available');
    }

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  // =============================================================================
  // BILLING INFORMATION ENDPOINTS
  // =============================================================================

  /**
   * Get comprehensive billing information
   */
  async getBillingInfo(): Promise<BillingInfo> {
    return await this.makeRequest<BillingInfo>('/billing-api/info');
  }

  /**
   * Get usage analytics
   */
  async getUsageAnalytics(days: number = 30): Promise<UsageAnalytics> {
    return await this.makeRequest<UsageAnalytics>(`/billing-api/usage/analytics?days=${days}`);
  }

  /**
   * Get invoice history
   */
  async getInvoices(limit: number = 10): Promise<{ invoices: BillingInfo['invoices'] }> {
    return await this.makeRequest<{ invoices: BillingInfo['invoices'] }>(`/billing-api/invoices?limit=${limit}`);
  }

  /**
   * Create Stripe Customer Portal session
   */
  async createPortalSession(returnUrl: string): Promise<{ url: string }> {
    return await this.makeRequest<{ url: string }>('/billing-api/portal', {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(): Promise<{
    success: boolean;
    message: string;
    cancelAt: string;
  }> {
    return await this.makeRequest<{
      success: boolean;
      message: string;
      cancelAt: string;
    }>('/billing-api/cancel', {
      method: 'POST',
    });
  }

  // =============================================================================
  // PAYMENT METHOD ENDPOINTS
  // =============================================================================

  /**
   * Get all payment methods for user
   */
  async getPaymentMethods(): Promise<{ paymentMethods: PaymentMethodInfo[] }> {
    return await this.makeRequest<{ paymentMethods: PaymentMethodInfo[] }>('/payment-methods-api/payment-methods');
  }

  /**
   * Create setup intent for adding new payment method
   */
  async createSetupIntent(options: {
    usage?: string;
    metadata?: Record<string, string>;
  } = {}): Promise<SetupIntentResponse> {
    return await this.makeRequest<SetupIntentResponse>('/payment-methods-api/setup-intent', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    setAsDefault: boolean = false
  ): Promise<{
    success: boolean;
    paymentMethod: PaymentMethodInfo;
    message: string;
  }> {
    return await this.makeRequest<{
      success: boolean;
      paymentMethod: PaymentMethodInfo;
      message: string;
    }>('/payment-methods-api/payment-methods', {
      method: 'POST',
      body: JSON.stringify({
        paymentMethodId,
        setAsDefault,
      }),
    });
  }

  /**
   * Set payment method as default
   */
  async setDefaultPaymentMethod(paymentMethodId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return await this.makeRequest<{
      success: boolean;
      message: string;
    }>(`/payment-methods-api/payment-methods/${paymentMethodId}/default`, {
      method: 'PUT',
    });
  }

  /**
   * Remove payment method
   */
  async removePaymentMethod(paymentMethodId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return await this.makeRequest<{
      success: boolean;
      message: string;
    }>(`/payment-methods-api/payment-methods/${paymentMethodId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Validate payment method
   */
  async validatePaymentMethod(paymentMethodId: string): Promise<PaymentMethodValidation> {
    return await this.makeRequest<PaymentMethodValidation>(
      `/payment-methods-api/payment-methods/${paymentMethodId}/validate`
    );
  }

  // =============================================================================
  // CONVENIENCE METHODS
  // =============================================================================

  /**
   * Get current subscription status
   */
  async getSubscriptionStatus(): Promise<{
    hasActiveSubscription: boolean;
    status?: string;
    plan?: string;
    trialDaysRemaining?: number;
  }> {
    try {
      const billingInfo = await this.getBillingInfo();
      
      if (!billingInfo.subscription) {
        return { hasActiveSubscription: false };
      }

      const subscription = billingInfo.subscription;
      const hasActiveSubscription = ['active', 'trialing'].includes(subscription.status);
      
      let trialDaysRemaining: number | undefined;
      if (subscription.trialEnd) {
        const trialEnd = new Date(subscription.trialEnd);
        const now = new Date();
        trialDaysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      }

      return {
        hasActiveSubscription,
        status: subscription.status,
        plan: subscription.plan.name,
        trialDaysRemaining,
      };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return { hasActiveSubscription: false };
    }
  }

  /**
   * Check if user can make API calls (within usage limits)
   */
  async canMakeApiCall(): Promise<{
    allowed: boolean;
    remaining: number;
    resetDate: string;
    reason?: string;
  }> {
    try {
      const billingInfo = await this.getBillingInfo();
      const usage = billingInfo.usage;

      if (usage.limit === -1) {
        // Unlimited plan
        return {
          allowed: true,
          remaining: -1,
          resetDate: usage.resetDate,
        };
      }

      const remaining = Math.max(0, usage.limit - usage.current);
      
      return {
        allowed: remaining > 0,
        remaining,
        resetDate: usage.resetDate,
        reason: remaining === 0 ? 'Monthly usage limit exceeded' : undefined,
      };
    } catch (error) {
      console.error('Error checking usage limits:', error);
      // Fail open - allow usage if we can't check limits
      return {
        allowed: true,
        remaining: 0,
        resetDate: new Date().toISOString(),
        reason: 'Unable to verify usage limits',
      };
    }
  }

  /**
   * Get usage summary for display
   */
  async getUsageSummary(): Promise<{
    current: number;
    limit: number;
    percentage: number;
    status: 'normal' | 'warning' | 'exceeded';
    message: string;
  }> {
    try {
      const billingInfo = await this.getBillingInfo();
      const usage = billingInfo.usage;

      if (usage.limit === -1) {
        return {
          current: usage.current,
          limit: -1,
          percentage: 0,
          status: 'normal',
          message: 'Unlimited usage',
        };
      }

      const percentage = (usage.current / usage.limit) * 100;
      let status: 'normal' | 'warning' | 'exceeded' = 'normal';
      let message = `${usage.current.toLocaleString()} of ${usage.limit.toLocaleString()} API calls used`;

      if (percentage >= 100) {
        status = 'exceeded';
        message = `Usage limit exceeded by ${usage.overage.toLocaleString()} calls`;
      } else if (percentage >= 80) {
        status = 'warning';
        message = `${Math.round(100 - percentage)}% of monthly limit remaining`;
      }

      return {
        current: usage.current,
        limit: usage.limit,
        percentage: Math.min(percentage, 100),
        status,
        message,
      };
    } catch (error) {
      console.error('Error getting usage summary:', error);
      return {
        current: 0,
        limit: 0,
        percentage: 0,
        status: 'normal',
        message: 'Unable to load usage information',
      };
    }
  }

  /**
   * Open Stripe Customer Portal
   */
  async openCustomerPortal(returnUrl?: string): Promise<void> {
    try {
      const defaultReturnUrl = `${window.location.origin}/billing`;
      const { url } = await this.createPortalSession(returnUrl || defaultReturnUrl);
      window.location.href = url;
    } catch (error) {
      console.error('Error opening customer portal:', error);
      throw new Error('Failed to open billing portal');
    }
  }
}

// Export singleton instance
export const billingApiService = new BillingApiService();

// Export convenience functions
export const getBillingInfo = () => billingApiService.getBillingInfo();
export const getUsageAnalytics = (days?: number) => billingApiService.getUsageAnalytics(days);
export const getPaymentMethods = () => billingApiService.getPaymentMethods();
export const createSetupIntent = (options?: Parameters<BillingApiService['createSetupIntent']>[0]) => 
  billingApiService.createSetupIntent(options);
export const getSubscriptionStatus = () => billingApiService.getSubscriptionStatus();
export const canMakeApiCall = () => billingApiService.canMakeApiCall();
export const getUsageSummary = () => billingApiService.getUsageSummary();
export const openCustomerPortal = (returnUrl?: string) => billingApiService.openCustomerPortal(returnUrl);