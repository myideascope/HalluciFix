#!/usr/bin/env node

/**
 * Webhook Testing Utility
 * Tests the Stripe webhook endpoint functionality
 */

const crypto = require('crypto');
const fetch = require('node-fetch');

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:54321/functions/v1/stripe-webhook';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

/**
 * Create a test webhook payload
 */
function createTestPayload(eventType = 'customer.created') {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const testEvents = {
    'customer.created': {
      id: 'evt_test_webhook',
      object: 'event',
      api_version: '2023-10-16',
      created: timestamp,
      type: 'customer.created',
      data: {
        object: {
          id: 'cus_test_webhook',
          object: 'customer',
          email: 'test@example.com',
          name: 'Test Customer',
          created: timestamp,
          metadata: {
            userId: 'test-user-id',
            test: 'webhook_test'
          }
        }
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: 'req_test_webhook',
        idempotency_key: null
      }
    },
    'checkout.session.completed': {
      id: 'evt_test_checkout',
      object: 'event',
      api_version: '2023-10-16',
      created: timestamp,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_checkout',
          object: 'checkout.session',
          mode: 'subscription',
          status: 'complete',
          customer: 'cus_test_webhook',
          subscription: 'sub_test_webhook',
          amount_total: 2900,
          currency: 'usd',
          metadata: {
            userId: 'test-user-id'
          }
        }
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: 'req_test_checkout',
        idempotency_key: null
      }
    },
    'customer.subscription.created': {
      id: 'evt_test_subscription',
      object: 'event',
      api_version: '2023-10-16',
      created: timestamp,
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_webhook',
          object: 'subscription',
          customer: 'cus_test_webhook',
          status: 'active',
          current_period_start: timestamp,
          current_period_end: timestamp + (30 * 24 * 60 * 60), // 30 days
          trial_end: null,
          cancel_at_period_end: false,
          items: {
            data: [
              {
                id: 'si_test_item',
                price: {
                  id: 'price_test_basic_monthly'
                }
              }
            ]
          },
          metadata: {
            userId: 'test-user-id'
          }
        }
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: 'req_test_subscription',
        idempotency_key: null
      }
    },
    'invoice.payment_succeeded': {
      id: 'evt_test_payment',
      object: 'event',
      api_version: '2023-10-16',
      created: timestamp,
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_test_invoice',
          object: 'invoice',
          customer: 'cus_test_webhook',
          subscription: 'sub_test_webhook',
          amount_paid: 2900,
          amount_due: 2900,
          currency: 'usd',
          status: 'paid',
          hosted_invoice_url: 'https://invoice.stripe.com/test',
          customer_email: 'test@example.com',
          description: 'Subscription payment',
          period_start: timestamp,
          period_end: timestamp + (30 * 24 * 60 * 60),
          created: timestamp
        }
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: 'req_test_payment',
        idempotency_key: null
      }
    }
  };

  return testEvents[eventType] || testEvents['customer.created'];
}

/**
 * Generate Stripe webhook signature
 */
function generateWebhookSignature(payload, secret, timestamp) {
  const payloadString = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${payloadString}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Send test webhook
 */
async function sendTestWebhook(eventType) {
  console.log(`\n🧪 Testing webhook event: ${eventType}`);
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);
  
  const payload = createTestPayload(eventType);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateWebhookSignature(payload, WEBHOOK_SECRET, timestamp);
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    console.log(`📊 Response Status: ${response.status}`);
    console.log(`📋 Response:`, responseData);

    if (response.ok) {
      console.log(`✅ ${eventType} webhook test passed`);
      return { success: true, response: responseData };
    } else {
      console.log(`❌ ${eventType} webhook test failed`);
      return { success: false, error: responseData };
    }
  } catch (error) {
    console.log(`💥 ${eventType} webhook test error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Run all webhook tests
 */
async function runAllTests() {
  console.log('🚀 Starting Stripe Webhook Tests');
  console.log('=' .repeat(50));

  const testEvents = [
    'customer.created',
    'checkout.session.completed',
    'customer.subscription.created',
    'invoice.payment_succeeded',
  ];

  const results = [];

  for (const eventType of testEvents) {
    const result = await sendTestWebhook(eventType);
    results.push({ eventType, ...result });
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n📈 Test Results Summary');
  console.log('=' .repeat(50));

  let passed = 0;
  let failed = 0;

  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.eventType}: PASSED`);
      passed++;
    } else {
      console.log(`❌ ${result.eventType}: FAILED`);
      failed++;
    }
  });

  console.log(`\n📊 Total: ${results.length} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 All webhook tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some webhook tests failed. Check the logs above.');
    process.exit(1);
  }
}

/**
 * Test webhook signature validation
 */
async function testSignatureValidation() {
  console.log('\n🔐 Testing webhook signature validation');
  
  const payload = createTestPayload('customer.created');
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Test with invalid signature
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 'invalid_signature',
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 400) {
      console.log('✅ Invalid signature correctly rejected');
    } else {
      console.log('❌ Invalid signature should be rejected with 400 status');
    }
  } catch (error) {
    console.log('💥 Signature validation test error:', error.message);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'signature') {
    await testSignatureValidation();
  } else if (command && command !== 'all') {
    await sendTestWebhook(command);
  } else {
    await runAllTests();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
  });
}

module.exports = {
  sendTestWebhook,
  runAllTests,
  testSignatureValidation,
  createTestPayload,
  generateWebhookSignature,
};