/**
 * Payment Methods API Endpoint
 * Provides payment method CRUD operations, setup intents, and security validation
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0';

// Environment variables
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Stripe and Supabase clients
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Types
interface PaymentMethodInfo {
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

interface SetupIntentResponse {
  clientSecret: string;
  setupIntentId: string;
}

interface PaymentMethodValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Main request handler
 */
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Extract user ID from JWT token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const url = new URL(req.url);
    const path = url.pathname;

    // Route requests
    if (req.method === 'GET') {
      if (path.endsWith('/payment-methods')) {
        return await handleGetPaymentMethods(userId);
      } else if (path.includes('/payment-methods/') && path.endsWith('/validate')) {
        const paymentMethodId = extractPaymentMethodId(path);
        return await handleValidatePaymentMethod(userId, paymentMethodId);
      }
    } else if (req.method === 'POST') {
      if (path.endsWith('/setup-intent')) {
        const body = await req.json();
        return await handleCreateSetupIntent(userId, body);
      } else if (path.endsWith('/payment-methods')) {
        const body = await req.json();
        return await handleAttachPaymentMethod(userId, body);
      }
    } else if (req.method === 'PUT') {
      if (path.includes('/payment-methods/') && path.endsWith('/default')) {
        const paymentMethodId = extractPaymentMethodId(path);
        return await handleSetDefaultPaymentMethod(userId, paymentMethodId);
      }
    } else if (req.method === 'DELETE') {
      if (path.includes('/payment-methods/')) {
        const paymentMethodId = extractPaymentMethodId(path);
        return await handleDetachPaymentMethod(userId, paymentMethodId);
      }
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Payment Methods API error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Get all payment methods for user
 */
async function handleGetPaymentMethods(userId: string): Promise<Response> {
  try {
    // Get user's Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (customerError) {
      return new Response(
        JSON.stringify({ paymentMethods: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.stripe_customer_id,
      type: 'card',
    });

    // Get customer details to identify default payment method
    const stripeCustomer = await stripe.customers.retrieve(customer.stripe_customer_id);
    const defaultPaymentMethodId = stripeCustomer.deleted 
      ? null 
      : stripeCustomer.invoice_settings?.default_payment_method;

    const formattedPaymentMethods: PaymentMethodInfo[] = paymentMethods.data.map(pm => ({
      id: pm.id,
      type: pm.type,
      card: pm.card ? {
        brand: pm.card.brand,
        last4: pm.card.last4,
        expiryMonth: pm.card.exp_month,
        expiryYear: pm.card.exp_year,
        country: pm.card.country || undefined,
        funding: pm.card.funding || undefined,
      } : undefined,
      isDefault: pm.id === defaultPaymentMethodId,
      createdAt: new Date(pm.created * 1000).toISOString(),
    }));

    return new Response(
      JSON.stringify({ paymentMethods: formattedPaymentMethods }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error getting payment methods:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get payment methods',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Create setup intent for adding new payment method
 */
async function handleCreateSetupIntent(
  userId: string, 
  body: { usage?: string; metadata?: Record<string, string> }
): Promise<Response> {
  try {
    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(userId);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: body.usage || 'off_session',
      payment_method_types: ['card'],
      metadata: {
        userId: userId,
        ...body.metadata,
      },
    });

    const response: SetupIntentResponse = {
      clientSecret: setupIntent.client_secret!,
      setupIntentId: setupIntent.id,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating setup intent:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to create setup intent',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Attach payment method to customer
 */
async function handleAttachPaymentMethod(
  userId: string,
  body: { paymentMethodId: string; setAsDefault?: boolean }
): Promise<Response> {
  try {
    const { paymentMethodId, setAsDefault = false } = body;

    // Get Stripe customer ID
    const customerId = await getOrCreateStripeCustomer(userId);

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default if requested
    if (setAsDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    // Get the attached payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    const formattedPaymentMethod: PaymentMethodInfo = {
      id: paymentMethod.id,
      type: paymentMethod.type,
      card: paymentMethod.card ? {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expiryMonth: paymentMethod.card.exp_month,
        expiryYear: paymentMethod.card.exp_year,
        country: paymentMethod.card.country || undefined,
        funding: paymentMethod.card.funding || undefined,
      } : undefined,
      isDefault: setAsDefault,
      createdAt: new Date(paymentMethod.created * 1000).toISOString(),
    };

    // Log payment method attachment
    await supabase
      .from('payment_method_events')
      .insert({
        user_id: userId,
        stripe_payment_method_id: paymentMethodId,
        stripe_customer_id: customerId,
        event_type: 'attached',
        payment_method_type: paymentMethod.type,
        card_brand: paymentMethod.card?.brand,
        card_last4: paymentMethod.card?.last4,
        is_default: setAsDefault,
        created_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({
        success: true,
        paymentMethod: formattedPaymentMethod,
        message: 'Payment method attached successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error attaching payment method:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to attach payment method',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Set payment method as default
 */
async function handleSetDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<Response> {
  try {
    // Get user's Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (customerError) {
      throw new Error(`No Stripe customer found: ${customerError.message}`);
    }

    // Verify payment method belongs to customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== customer.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'Payment method does not belong to customer' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Set as default payment method
    await stripe.customers.update(customer.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Log the change
    await supabase
      .from('payment_method_events')
      .insert({
        user_id: userId,
        stripe_payment_method_id: paymentMethodId,
        stripe_customer_id: customer.stripe_customer_id,
        event_type: 'set_default',
        payment_method_type: paymentMethod.type,
        card_brand: paymentMethod.card?.brand,
        card_last4: paymentMethod.card?.last4,
        is_default: true,
        created_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Default payment method updated successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error setting default payment method:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to set default payment method',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Detach payment method from customer
 */
async function handleDetachPaymentMethod(userId: string, paymentMethodId: string): Promise<Response> {
  try {
    // Get user's Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (customerError) {
      throw new Error(`No Stripe customer found: ${customerError.message}`);
    }

    // Verify payment method belongs to customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== customer.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'Payment method does not belong to customer' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is the default payment method
    const stripeCustomer = await stripe.customers.retrieve(customer.stripe_customer_id);
    const isDefault = !stripeCustomer.deleted && 
      stripeCustomer.invoice_settings?.default_payment_method === paymentMethodId;

    if (isDefault) {
      // Get other payment methods to set a new default
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.stripe_customer_id,
        type: 'card',
      });

      const otherPaymentMethods = paymentMethods.data.filter(pm => pm.id !== paymentMethodId);
      
      if (otherPaymentMethods.length > 0) {
        // Set the first available payment method as default
        await stripe.customers.update(customer.stripe_customer_id, {
          invoice_settings: {
            default_payment_method: otherPaymentMethods[0].id,
          },
        });
      } else {
        // Clear default payment method if no others available
        await stripe.customers.update(customer.stripe_customer_id, {
          invoice_settings: {
            default_payment_method: null,
          },
        });
      }
    }

    // Detach payment method
    await stripe.paymentMethods.detach(paymentMethodId);

    // Log the detachment
    await supabase
      .from('payment_method_events')
      .insert({
        user_id: userId,
        stripe_payment_method_id: paymentMethodId,
        stripe_customer_id: customer.stripe_customer_id,
        event_type: 'detached',
        payment_method_type: paymentMethod.type,
        card_brand: paymentMethod.card?.brand,
        card_last4: paymentMethod.card?.last4,
        is_default: isDefault,
        created_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment method removed successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error detaching payment method:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to remove payment method',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Validate payment method security and compliance
 */
async function handleValidatePaymentMethod(userId: string, paymentMethodId: string): Promise<Response> {
  try {
    // Get payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    const validation: PaymentMethodValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      riskLevel: 'low',
    };

    // Validate card details if it's a card payment method
    if (paymentMethod.type === 'card' && paymentMethod.card) {
      const card = paymentMethod.card;

      // Check expiry date
      const currentDate = new Date();
      const expiryDate = new Date(card.exp_year, card.exp_month - 1);
      
      if (expiryDate < currentDate) {
        validation.errors.push('Card has expired');
        validation.isValid = false;
      } else if (expiryDate.getTime() - currentDate.getTime() < 30 * 24 * 60 * 60 * 1000) {
        validation.warnings.push('Card expires within 30 days');
      }

      // Check card brand
      const supportedBrands = ['visa', 'mastercard', 'amex', 'discover'];
      if (!supportedBrands.includes(card.brand)) {
        validation.warnings.push(`Card brand ${card.brand} may have limited support`);
      }

      // Check funding type
      if (card.funding === 'prepaid') {
        validation.warnings.push('Prepaid cards may have transaction limitations');
        validation.riskLevel = 'medium';
      }

      // Check country restrictions (example)
      const restrictedCountries = ['XX']; // Add actual restricted countries
      if (card.country && restrictedCountries.includes(card.country)) {
        validation.errors.push(`Cards from ${card.country} are not supported`);
        validation.isValid = false;
        validation.riskLevel = 'high';
      }

      // Check for potential fraud indicators
      if (card.cvc_check === 'fail') {
        validation.errors.push('CVC verification failed');
        validation.isValid = false;
        validation.riskLevel = 'high';
      } else if (card.cvc_check === 'unavailable') {
        validation.warnings.push('CVC verification unavailable');
        validation.riskLevel = 'medium';
      }

      // Check address verification
      if (card.address_zip_check === 'fail') {
        validation.warnings.push('ZIP code verification failed');
        validation.riskLevel = 'medium';
      }
    }

    // Log validation attempt
    await supabase
      .from('payment_method_validations')
      .insert({
        user_id: userId,
        stripe_payment_method_id: paymentMethodId,
        is_valid: validation.isValid,
        risk_level: validation.riskLevel,
        errors: validation.errors,
        warnings: validation.warnings,
        validated_at: new Date().toISOString(),
      });

    return new Response(JSON.stringify(validation), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error validating payment method:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to validate payment method',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get or create Stripe customer for user
 */
async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  // Check if customer already exists
  const { data: existingCustomer, error: fetchError } = await supabase
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch customer: ${fetchError.message}`);
  }

  if (existingCustomer) {
    return existingCustomer.stripe_customer_id;
  }

  // Get user details
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email, name')
    .eq('id', userId)
    .single();

  if (userError) {
    throw new Error(`Failed to fetch user: ${userError.message}`);
  }

  // Create new Stripe customer
  const stripeCustomer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: userId,
    },
  });

  // Save customer to database
  const { error: saveError } = await supabase
    .from('stripe_customers')
    .insert({
      user_id: userId,
      stripe_customer_id: stripeCustomer.id,
      email: user.email,
      name: user.name,
      created_at: new Date().toISOString(),
    });

  if (saveError) {
    throw new Error(`Failed to save customer: ${saveError.message}`);
  }

  return stripeCustomer.id;
}

/**
 * Extract payment method ID from URL path
 */
function extractPaymentMethodId(path: string): string {
  const matches = path.match(/\/payment-methods\/([^\/]+)/);
  if (!matches || !matches[1]) {
    throw new Error('Invalid payment method ID in path');
  }
  return matches[1];
}