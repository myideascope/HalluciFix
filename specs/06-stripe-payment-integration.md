# Spec: Complete Stripe Payment Integration

**Priority:** High (P2)  
**Estimated Effort:** 2-3 weeks  
**Dependencies:** Environment configuration, user management system

## Overview

Implement a complete Stripe payment integration to enable subscription management, billing, and payment processing for HalluciFix's premium features and usage-based pricing.

## Current State

- Basic Stripe configuration in environment variables
- Placeholder webhook endpoints
- No payment UI components
- Missing subscription management
- No billing dashboard or invoice handling

## Requirements

### 1. Subscription Management

**Acceptance Criteria:**
- [ ] Multiple subscription tiers (Basic, Pro, Enterprise)
- [ ] Usage-based billing for API calls
- [ ] Subscription upgrade/downgrade functionality
- [ ] Automatic billing and invoice generation
- [ ] Trial period management

**Technical Details:**
- Implement Stripe Checkout for subscriptions
- Create subscription management dashboard
- Handle proration for plan changes
- Implement usage metering for API calls
- Add trial period tracking

### 2. Payment Processing

**Acceptance Criteria:**
- [ ] Secure payment form with Stripe Elements
- [ ] Support for multiple payment methods
- [ ] Payment method management
- [ ] Failed payment handling and retry logic
- [ ] PCI compliance through Stripe

**Technical Details:**
- Integrate Stripe Elements for secure forms
- Implement payment method storage
- Add automatic payment retry logic
- Handle 3D Secure authentication
- Implement payment confirmation flow

### 3. Billing Dashboard

**Acceptance Criteria:**
- [ ] Current subscription status display
- [ ] Usage metrics and billing history
- [ ] Invoice download and management
- [ ] Payment method management
- [ ] Billing alerts and notifications

**Technical Details:**
- Create billing dashboard component
- Implement invoice listing and download
- Add usage tracking visualization
- Create payment method management UI
- Implement billing notifications

### 4. Webhook Integration

**Acceptance Criteria:**
- [ ] Secure webhook endpoint handling
- [ ] Subscription status synchronization
- [ ] Payment confirmation processing
- [ ] Failed payment notifications
- [ ] Usage reporting automation

**Technical Details:**
- Implement Stripe webhook handlers
- Add webhook signature verification
- Create database synchronization logic
- Implement event processing queue
- Add webhook monitoring and logging

## Implementation Plan

### Phase 1: Stripe Setup and Configuration (Week 1)
1. Configure Stripe products and pricing
2. Set up webhook endpoints
3. Implement basic Stripe client
4. Create subscription models in database

### Phase 2: Payment Processing (Week 1-2)
1. Implement Stripe Checkout integration
2. Create payment form components
3. Add payment method management
4. Implement payment confirmation flow

### Phase 3: Subscription Management (Week 2)
1. Create subscription dashboard
2. Implement plan upgrade/downgrade
3. Add usage tracking and metering
4. Implement trial period management

### Phase 4: Billing and Invoicing (Week 2-3)
1. Create billing dashboard
2. Implement invoice management
3. Add usage reporting
4. Create billing notifications

### Phase 5: Testing and Security (Week 3)
1. Implement comprehensive testing
2. Security audit and compliance check
3. Performance optimization
4. Documentation and deployment

## Stripe Configuration

### Product and Pricing Setup
```typescript
// Stripe Dashboard Configuration
const products = [
  {
    name: 'HalluciFix Basic',
    description: 'Essential AI accuracy verification',
    pricing: {
      monthly: '$29/month',
      yearly: '$290/year (2 months free)'
    },
    features: [
      '1,000 analyses per month',
      'Basic hallucination detection',
      'Email support',
      'Standard accuracy reports'
    ]
  },
  {
    name: 'HalluciFix Pro',
    description: 'Advanced verification with team features',
    pricing: {
      monthly: '$99/month',
      yearly: '$990/year (2 months free)'
    },
    features: [
      '10,000 analyses per month',
      'Advanced seq-logprob analysis',
      'Team collaboration',
      'Priority support',
      'Custom integrations',
      'Advanced analytics'
    ]
  },
  {
    name: 'HalluciFix Enterprise',
    description: 'Custom solutions for large organizations',
    pricing: 'Custom pricing',
    features: [
      'Unlimited analyses',
      'Custom model training',
      'Dedicated support',
      'SLA guarantees',
      'On-premise deployment',
      'Custom integrations'
    ]
  }
];
```

### Environment Variables
```env
# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Product Price IDs
STRIPE_PRICE_ID_BASIC_MONTHLY=price_...
STRIPE_PRICE_ID_BASIC_YEARLY=price_...
STRIPE_PRICE_ID_PRO_MONTHLY=price_...
STRIPE_PRICE_ID_PRO_YEARLY=price_...

# Usage-based pricing
STRIPE_PRICE_ID_API_CALLS=price_...
```

## Payment Integration

### Stripe Client Setup
```typescript
// src/lib/stripe.ts
import { loadStripe } from '@stripe/stripe-js';
import Stripe from 'stripe';

// Client-side Stripe
export const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
);

// Server-side Stripe (for API routes)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true
});
```

### Subscription Service
```typescript
// src/lib/subscriptionService.ts
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  stripePriceId: string;
  analysisLimit: number;
}

export class SubscriptionService {
  async createCheckoutSession(
    priceId: string,
    userId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string }> {
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email,
      client_reference_id: userId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          userId: userId
        }
      }
    });

    return { sessionId: session.id };
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    return { url: session.url };
  }

  async updateSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    return await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId
        }
      ],
      proration_behavior: 'create_prorations'
    });
  }
}
```

### Payment Components

#### Subscription Plans Component
```typescript
// src/components/SubscriptionPlans.tsx
import { useState } from 'react';
import { Check, Zap, Crown } from 'lucide-react';
import { useStripe } from '@stripe/react-stripe-js';

interface PlanCardProps {
  plan: SubscriptionPlan;
  isPopular?: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
  loading?: boolean;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, isPopular, onSelect, loading }) => {
  return (
    <div className={`relative bg-white rounded-lg border-2 p-6 ${
      isPopular ? 'border-blue-500 shadow-lg' : 'border-slate-200'
    }`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      )}
      
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold text-slate-900 mb-2">{plan.name}</h3>
        <p className="text-slate-600 mb-4">{plan.description}</p>
        <div className="text-3xl font-bold text-slate-900">
          ${plan.price}
          <span className="text-lg font-normal text-slate-600">/{plan.interval}</span>
        </div>
      </div>
      
      <ul className="space-y-3 mb-6">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-center space-x-3">
            <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
            <span className="text-slate-700">{feature}</span>
          </li>
        ))}
      </ul>
      
      <button
        onClick={() => onSelect(plan)}
        disabled={loading}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
          isPopular
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loading ? 'Processing...' : 'Get Started'}
      </button>
    </div>
  );
};

export const SubscriptionPlans: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const stripe = useStripe();
  
  const handlePlanSelect = async (plan: SubscriptionPlan) => {
    if (!stripe) return;
    
    setLoading(true);
    try {
      const { sessionId } = await subscriptionService.createCheckoutSession(
        plan.stripePriceId,
        user.id,
        `${window.location.origin}/billing/success`,
        `${window.location.origin}/billing/cancel`
      );
      
      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) {
        console.error('Stripe error:', error);
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">
          Choose Your Plan
        </h2>
        <p className="text-xl text-slate-600">
          Start with a 14-day free trial. No credit card required.
        </p>
      </div>
      
      <div className="grid md:grid-cols-3 gap-8">
        {plans.map((plan, index) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isPopular={index === 1}
            onSelect={handlePlanSelect}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
};
```

#### Billing Dashboard Component
```typescript
// src/components/BillingDashboard.tsx
import { useState, useEffect } from 'react';
import { CreditCard, Download, AlertCircle } from 'lucide-react';

interface BillingInfo {
  subscription: {
    status: string;
    currentPeriodEnd: string;
    plan: string;
    amount: number;
  };
  usage: {
    current: number;
    limit: number;
    resetDate: string;
  };
  paymentMethod: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  };
  invoices: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    downloadUrl: string;
  }>;
}

export const BillingDashboard: React.FC = () => {
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBillingInfo();
  }, []);

  const loadBillingInfo = async () => {
    try {
      const response = await fetch('/api/billing/info');
      const data = await response.json();
      setBillingInfo(data);
    } catch (error) {
      console.error('Error loading billing info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST'
      });
      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error opening billing portal:', error);
    }
  };

  if (loading) {
    return <div>Loading billing information...</div>;
  }

  if (!billingInfo) {
    return <div>Error loading billing information</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Subscription Status */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Current Subscription
        </h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {billingInfo.subscription.plan}
            </div>
            <div className="text-slate-600">
              ${billingInfo.subscription.amount}/month
            </div>
            <div className="mt-2">
              <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                billingInfo.subscription.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {billingInfo.subscription.status}
              </span>
            </div>
          </div>
          
          <div>
            <div className="text-sm text-slate-600 mb-1">Next billing date</div>
            <div className="text-slate-900">
              {new Date(billingInfo.subscription.currentPeriodEnd).toLocaleDateString()}
            </div>
          </div>
        </div>
        
        <button
          onClick={handleManageBilling}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Manage Subscription
        </button>
      </div>

      {/* Usage Tracking */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Usage This Month
        </h3>
        
        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>API Calls</span>
            <span>{billingInfo.usage.current} / {billingInfo.usage.limit}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{
                width: `${Math.min((billingInfo.usage.current / billingInfo.usage.limit) * 100, 100)}%`
              }}
            />
          </div>
        </div>
        
        {billingInfo.usage.current / billingInfo.usage.limit > 0.8 && (
          <div className="flex items-center space-x-2 text-amber-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>You're approaching your monthly limit</span>
          </div>
        )}
      </div>

      {/* Payment Method */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Payment Method
        </h3>
        
        <div className="flex items-center space-x-3">
          <CreditCard className="w-8 h-8 text-slate-400" />
          <div>
            <div className="font-medium text-slate-900">
              {billingInfo.paymentMethod.brand.toUpperCase()} •••• {billingInfo.paymentMethod.last4}
            </div>
            <div className="text-sm text-slate-600">
              Expires {billingInfo.paymentMethod.expiryMonth}/{billingInfo.paymentMethod.expiryYear}
            </div>
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Invoice History
        </h3>
        
        <div className="space-y-3">
          {billingInfo.invoices.map((invoice) => (
            <div key={invoice.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
              <div>
                <div className="font-medium text-slate-900">
                  ${invoice.amount}
                </div>
                <div className="text-sm text-slate-600">
                  {new Date(invoice.date).toLocaleDateString()}
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  invoice.status === 'paid'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {invoice.status}
                </span>
                
                <a
                  href={invoice.downloadUrl}
                  className="text-blue-600 hover:text-blue-700"
                  download
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

## Webhook Implementation

### Webhook Handler
```typescript
// src/api/webhooks/stripe.ts
import { stripe } from '../../lib/stripe';
import { supabase } from '../../lib/supabase';

export async function handleStripeWebhook(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCancellation(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSuccess(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailure(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response('Webhook handled', { status: 200 });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response('Webhook handler failed', { status: 500 });
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const { error } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: subscription.metadata.userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      plan_id: subscription.items.data[0].price.id,
      updated_at: new Date()
    });

  if (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
}
```

## Usage Tracking

### API Call Metering
```typescript
// src/lib/usageTracking.ts
export class UsageTracker {
  static async recordApiCall(userId: string, analysisType: string) {
    const { error } = await supabase
      .from('usage_records')
      .insert({
        user_id: userId,
        event_type: 'api_call',
        analysis_type: analysisType,
        timestamp: new Date(),
        quantity: 1
      });

    if (error) {
      console.error('Failed to record usage:', error);
    }

    // Also report to Stripe for usage-based billing
    await this.reportToStripe(userId, 1);
  }

  static async reportToStripe(userId: string, quantity: number) {
    try {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', userId)
        .single();

      if (subscription?.stripe_subscription_id) {
        await stripe.subscriptionItems.createUsageRecord(
          subscription.stripe_subscription_id,
          {
            quantity: quantity,
            timestamp: Math.floor(Date.now() / 1000)
          }
        );
      }
    } catch (error) {
      console.error('Failed to report usage to Stripe:', error);
    }
  }

  static async getCurrentUsage(userId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('usage_records')
      .select('quantity')
      .eq('user_id', userId)
      .gte('timestamp', startOfMonth.toISOString());

    if (error) {
      console.error('Failed to get usage:', error);
      return 0;
    }

    return data.reduce((total, record) => total + record.quantity, 0);
  }
}
```

## Testing Strategy

### Payment Flow Tests
```typescript
// src/components/__tests__/SubscriptionPlans.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubscriptionPlans } from '../SubscriptionPlans';

// Mock Stripe
jest.mock('@stripe/react-stripe-js', () => ({
  useStripe: () => ({
    redirectToCheckout: jest.fn().mockResolvedValue({ error: null })
  })
}));

describe('SubscriptionPlans', () => {
  it('should handle plan selection', async () => {
    render(<SubscriptionPlans />);
    
    const basicPlanButton = screen.getByText('Get Started');
    fireEvent.click(basicPlanButton);
    
    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });
  });
});
```

### Webhook Tests
```typescript
// src/api/__tests__/webhooks.test.ts
import { handleStripeWebhook } from '../webhooks/stripe';

describe('Stripe Webhooks', () => {
  it('should handle subscription created event', async () => {
    const mockEvent = {
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test',
          customer: 'cus_test',
          status: 'active',
          metadata: { userId: 'user_test' }
        }
      }
    };

    const request = new Request('http://localhost/webhook', {
      method: 'POST',
      body: JSON.stringify(mockEvent),
      headers: {
        'stripe-signature': 'test_signature'
      }
    });

    const response = await handleStripeWebhook(request);
    expect(response.status).toBe(200);
  });
});
```

## Security Considerations

### PCI Compliance
- Use Stripe Elements for secure payment forms
- Never store payment card data
- Implement proper webhook signature verification
- Use HTTPS for all payment-related communications

### Data Protection
- Encrypt sensitive billing information
- Implement proper access controls
- Add audit logging for billing operations
- Regular security audits and compliance checks

## Success Metrics

- [ ] Payment success rate > 99%
- [ ] Subscription conversion rate > 15%
- [ ] Churn rate < 5% monthly
- [ ] Payment processing time < 3 seconds
- [ ] Zero PCI compliance violations

## Documentation Requirements

- [ ] Payment integration guide
- [ ] Subscription management documentation
- [ ] Webhook handling procedures
- [ ] Security and compliance guidelines
- [ ] Troubleshooting guide for payment issues