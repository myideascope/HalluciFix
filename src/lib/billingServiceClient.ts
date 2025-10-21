/**
 * Client-Side Billing Service
 * Browser-safe version of billing service that only includes methods that can run in the browser
 */

import { supabase } from './supabase';

export class ClientBillingService {
  // =============================================================================
  // SERVER-SIDE ONLY METHODS (Throw errors in browser)
  // =============================================================================

  /**
   * Get user invoices - Server-side only
   */
  async getUserInvoices(): Promise<never> {
    throw new Error('getUserInvoices can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Get user payment history - Server-side only
   */
  async getUserPaymentHistory(): Promise<never> {
    throw new Error('getUserPaymentHistory can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Get user billing notifications - Server-side only
   */
  async getUserBillingNotifications(): Promise<never> {
    throw new Error('getUserBillingNotifications can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Get user usage history - Server-side only
   */
  async getUserUsageHistory(): Promise<never> {
    throw new Error('getUserUsageHistory can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Mark notification as read - Server-side only
   */
  async markNotificationAsRead(): Promise<never> {
    throw new Error('markNotificationAsRead can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Sync invoice from Stripe - Server-side only
   */
  async syncInvoiceFromStripe(): Promise<never> {
    throw new Error('syncInvoiceFromStripe can only be called from server-side code.');
  }

  /**
   * Sync payment from Stripe - Server-side only
   */
  async syncPaymentFromStripe(): Promise<never> {
    throw new Error('syncPaymentFromStripe can only be called from server-side code.');
  }
}

// Export singleton instance
export const clientBillingService = new ClientBillingService();

// For backward compatibility, export as billingService for client-side code
export const billingService = clientBillingService;