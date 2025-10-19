/**
 * Stripe Service
 * Provides a centralized service for Stripe operations with error handling and configuration validation
 */

import Stripe from 'stripe';
import { loadStripe } from '@stripe/stripe-js';
import { config } from './config';

// Stripe client instance (server-side)
let stripeInstance: Stripe | null = null;

// Stripe.js instance (client-side)
let stripeJsInstance: Promise<Stripe | null> | null = null;

/**
 * Initialize Stripe server-side client
 * Only available in server environments (Node.js)
 */
export function initializeStripe(): Stripe {
  if (typeof window !== 'undefined') {
    throw new Error('Stripe server client cannot be initialized in browser environment');
  }

  if (!config.payments.stripe?.secretKey) {
    throw new Error('Stripe secret key not configured. Set STRIPE_SECRET_KEY in your environment.');
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(config.payments.stripe.secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
      telemetry: false, // Disable telemetry for privacy
    });
  }

  return stripeInstance;
}

/**
 * Get Stripe server-side client
 * Throws error if not properly initialized
 */
export function getStripe(): Stripe {
  if (!stripeInstance) {
    return initializeStripe();
  }
  return stripeInstance;
}

/**
 * Initialize Stripe.js client-side
 * Only available in browser environments
 */
export function initializeStripeJs(): Promise<Stripe | null> {
  if (typeof window === 'undefined') {
    throw new Error('Stripe.js cannot be initialized in server environment');
  }

  if (!config.payments.stripe?.publishableKey) {
    throw new Error('Stripe publishable key not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in your environment.');
  }

  if (!stripeJsInstance) {
    stripeJsInstance = loadStripe(config.payments.stripe.publishableKey);
  }

  return stripeJsInstance;
}

/**
 * Get Stripe.js client-side instance
 */
export function getStripeJs(): Promise<Stripe | null> {
  if (!stripeJsInstance) {
    return initializeStripeJs();
  }
  return stripeJsInstance;
}

/**
 * Stripe Error Handler
 * Provides consistent error handling for Stripe operations
 */
export class StripeError extends Error {
  public readonly code: string;
  public readonly type: string;
  public readonly statusCode?: number;
  public readonly requestId?: string;

  constructor(error: Stripe.StripeError) {
    super(error.message);
    this.name = 'StripeError';
    this.code = error.code || 'unknown';
    this.type = error.type || 'api_error';
    this.statusCode = error.statusCode;
    this.requestId = error.requestId;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case 'card_declined':
        return 'Your card was declined. Please try a different payment method.';
      case 'expired_card':
        return 'Your card has expired. Please use a different payment method.';
      case 'insufficient_funds':
        return 'Your card has insufficient funds. Please try a different payment method.';
      case 'incorrect_cvc':
        return 'Your card\'s security code is incorrect. Please check and try again.';
      case 'processing_error':
        return 'An error occurred processing your payment. Please try again.';
      case 'rate_limit':
        return 'Too many requests. Please wait a moment and try again.';
      case 'api_key_expired':
        return 'Payment system configuration error. Please contact support.';
      case 'invalid_request_error':
        return 'Invalid payment request. Please check your information and try again.';
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    const retryableCodes = [
      'rate_limit',
      'processing_error',
      'api_connection_error',
      'api_error'
    ];
    return retryableCodes.includes(this.code);
  }
}

/**
 * Stripe operation wrapper with error handling
 */
export async function withStripeErrorHandling<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      const stripeError = new StripeError(error);
      
      // Log error for debugging
      console.error(`Stripe error in ${context || 'unknown operation'}:`, {
        code: stripeError.code,
        type: stripeError.type,
        message: stripeError.message,
        requestId: stripeError.requestId,
      });

      throw stripeError;
    }
    
    // Re-throw non-Stripe errors
    throw error;
  }
}

/**
 * Validate Stripe configuration
 */
export function validateStripeConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.payments.stripe?.enabled) {
    errors.push('Stripe payments are not enabled');
  }

  if (!config.payments.stripe?.publishableKey) {
    errors.push('Stripe publishable key is not configured');
  }

  // Server-side validation
  if (typeof window === 'undefined') {
    if (!config.payments.stripe?.secretKey) {
      errors.push('Stripe secret key is not configured');
    }
    if (!config.payments.stripe?.webhookSecret) {
      errors.push('Stripe webhook secret is not configured');
    }
  }

  // Validate price IDs if configured
  if (config.payments.stripe?.priceIds) {
    const priceIds = config.payments.stripe.priceIds;
    if (!priceIds.basicMonthly && !priceIds.proMonthly) {
      errors.push('At least one subscription price ID must be configured');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get Stripe configuration status
 */
export function getStripeStatus(): {
  enabled: boolean;
  configured: boolean;
  publishableKey: boolean;
  secretKey: boolean;
  webhookSecret: boolean;
  priceIds: {
    basicMonthly: boolean;
    basicYearly: boolean;
    proMonthly: boolean;
    proYearly: boolean;
    apiCalls: boolean;
  };
  validation: { isValid: boolean; errors: string[] };
} {
  const validation = validateStripeConfig();
  const stripe = config.payments.stripe;

  return {
    enabled: stripe?.enabled || false,
    configured: !!(stripe?.publishableKey && stripe?.secretKey),
    publishableKey: !!stripe?.publishableKey,
    secretKey: !!stripe?.secretKey,
    webhookSecret: !!stripe?.webhookSecret,
    priceIds: {
      basicMonthly: !!stripe?.priceIds?.basicMonthly,
      basicYearly: !!stripe?.priceIds?.basicYearly,
      proMonthly: !!stripe?.priceIds?.proMonthly,
      proYearly: !!stripe?.priceIds?.proYearly,
      apiCalls: !!stripe?.priceIds?.apiCalls,
    },
    validation,
  };
}

/**
 * Test Stripe connection
 * Only available server-side
 */
export async function testStripeConnection(): Promise<{ success: boolean; error?: string }> {
  if (typeof window !== 'undefined') {
    return { success: false, error: 'Stripe connection test only available server-side' };
  }

  try {
    const stripe = getStripe();
    
    // Test connection by retrieving account information
    await stripe.accounts.retrieve();
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100); // Stripe amounts are in cents
}

/**
 * Convert currency amount to Stripe format (cents)
 */
export function toStripeAmount(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert Stripe amount to currency format
 */
export function fromStripeAmount(amount: number): number {
  return amount / 100;
}

// Export types for external use
export type { Stripe };
export { Stripe as StripeNamespace };