/**
 * AWS Lambda Function: Billing API
 * Migrated from Supabase Edge Function
 * Provides billing information, invoice history, and usage analytics
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { CognitoIdentityProviderClient, GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const Stripe = require('stripe');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const STRIPE_SECRET_KEY_ARN = process.env.STRIPE_SECRET_KEY_ARN;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

let stripe;

// Helper function to get secret value
async function getSecret(secretArn) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await secretsManager.send(command);
    return response.SecretString;
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw new Error('Failed to retrieve secret');
  }
}

// Initialize Stripe client
async function initializeStripe() {
  if (!stripe) {
    const stripeSecretKey = await getSecret(STRIPE_SECRET_KEY_ARN);
    stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  }
  return stripe;
}

// Helper function to execute RDS queries
async function executeQuery(sql, parameters = []) {
  const params = {
    resourceArn: DB_CLUSTER_ARN,
    secretArn: DB_SECRET_ARN,
    database: 'hallucifix',
    sql: sql,
    parameters: parameters
  };

  try {
    const result = await rdsData.executeStatement(params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

// Helper function to format RDS results
function formatRDSResults(records, columns) {
  if (!records || records.length === 0) return [];
  
  return records.map(record => {
    const row = {};
    record.forEach((field, index) => {
      const columnName = columns[index];
      row[columnName] = extractFieldValue(field);
    });
    return row;
  });
}

function extractFieldValue(field) {
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.isNull) return null;
  return field;
}

// Get user ID from Cognito token
async function getUserFromToken(accessToken) {
  try {
    const command = new GetUserCommand({
      AccessToken: accessToken
    });
    const response = await cognitoClient.send(command);
    
    // Extract user ID from attributes
    const userIdAttr = response.UserAttributes.find(attr => attr.Name === 'sub');
    return userIdAttr ? userIdAttr.Value : null;
  } catch (error) {
    console.error('Error getting user from token:', error);
    throw new Error('Invalid or expired token');
  }
}

// Get comprehensive billing information
async function handleGetBillingInfo(userId) {
  try {
    await initializeStripe();

    // Get user subscription
    const subscriptionSql = `
      SELECT * FROM user_subscriptions 
      WHERE user_id = :userId AND status = 'active' 
      ORDER BY created_at DESC LIMIT 1
    `;
    
    const subscriptionResult = await executeQuery(subscriptionSql, [
      { name: 'userId', value: { stringValue: userId } }
    ]);

    const billingInfo = {
      subscription: null,
      usage: {
        current: 0,
        limit: 0,
        percentage: 0,
        resetDate: new Date().toISOString(),
        overage: 0,
        overageCost: 0,
      },
      paymentMethod: null,
      invoices: [],
    };

    if (subscriptionResult.records && subscriptionResult.records.length > 0) {
      const subscriptionColumns = ['id', 'user_id', 'stripe_customer_id', 'stripe_subscription_id', 'plan_id', 'status', 'current_period_start', 'current_period_end', 'trial_end', 'cancel_at_period_end', 'created_at', 'updated_at'];
      const subscriptions = formatRDSResults(subscriptionResult.records, subscriptionColumns);
      const subscription = subscriptions[0];

      // Get subscription plan details
      const plan = await getSubscriptionPlan(subscription.plan_id);
      
      billingInfo.subscription = {
        id: subscription.stripe_subscription_id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        plan: plan,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEnd: subscription.trial_end,
      };

      // Get current usage
      billingInfo.usage = await getCurrentUsage(userId, subscription);

      // Get payment method
      billingInfo.paymentMethod = await getDefaultPaymentMethod(subscription.stripe_customer_id);

      // Get recent invoices
      billingInfo.invoices = await getRecentInvoices(subscription.stripe_customer_id, 5);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(billingInfo),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error getting billing info:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get billing information',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Get usage analytics
async function handleGetUsageAnalytics(userId, days) {
  try {
    const analytics = await getUsageAnalytics(userId, days);

    return {
      statusCode: 200,
      body: JSON.stringify(analytics),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error getting usage analytics:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get usage analytics',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Get invoice history
async function handleGetInvoices(userId, limit) {
  try {
    await initializeStripe();

    // Get user's Stripe customer ID
    const customerSql = `
      SELECT stripe_customer_id FROM stripe_customers 
      WHERE user_id = :userId
    `;
    
    const customerResult = await executeQuery(customerSql, [
      { name: 'userId', value: { stringValue: userId } }
    ]);

    if (!customerResult.records || customerResult.records.length === 0) {
      throw new Error('No Stripe customer found');
    }

    const customerColumns = ['stripe_customer_id'];
    const customers = formatRDSResults(customerResult.records, customerColumns);
    const customer = customers[0];

    const invoices = await getRecentInvoices(customer.stripe_customer_id, limit);

    return {
      statusCode: 200,
      body: JSON.stringify({ invoices }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error getting invoices:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get invoices',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Create Stripe Customer Portal session
async function handleCreatePortalSession(userId, returnUrl) {
  try {
    await initializeStripe();

    // Get user's Stripe customer ID
    const customerSql = `
      SELECT stripe_customer_id FROM stripe_customers 
      WHERE user_id = :userId
    `;
    
    const customerResult = await executeQuery(customerSql, [
      { name: 'userId', value: { stringValue: userId } }
    ]);

    if (!customerResult.records || customerResult.records.length === 0) {
      throw new Error('No Stripe customer found');
    }

    const customerColumns = ['stripe_customer_id'];
    const customers = formatRDSResults(customerResult.records, customerColumns);
    const customer = customers[0];

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: returnUrl,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error creating portal session:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to create portal session',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Cancel subscription
async function handleCancelSubscription(userId) {
  try {
    await initializeStripe();

    // Get user subscription
    const subscriptionSql = `
      SELECT stripe_subscription_id FROM user_subscriptions 
      WHERE user_id = :userId AND status = 'active'
    `;
    
    const subscriptionResult = await executeQuery(subscriptionSql, [
      { name: 'userId', value: { stringValue: userId } }
    ]);

    if (!subscriptionResult.records || subscriptionResult.records.length === 0) {
      throw new Error('No active subscription found');
    }

    const subscriptionColumns = ['stripe_subscription_id'];
    const subscriptions = formatRDSResults(subscriptionResult.records, subscriptionColumns);
    const subscription = subscriptions[0];

    // Cancel at period end
    const canceledSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      }
    );

    // Update database
    const updateSql = `
      UPDATE user_subscriptions 
      SET cancel_at_period_end = :cancelAtPeriodEnd, updated_at = :updatedAt 
      WHERE stripe_subscription_id = :subscriptionId
    `;
    
    await executeQuery(updateSql, [
      { name: 'cancelAtPeriodEnd', value: { booleanValue: true } },
      { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
      { name: 'subscriptionId', value: { stringValue: subscription.stripe_subscription_id } }
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Subscription will be canceled at the end of the current period',
        cancelAt: new Date(canceledSubscription.current_period_end * 1000).toISOString(),
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error canceling subscription:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to cancel subscription',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Helper functions
async function getSubscriptionPlan(planId) {
  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      price: 29,
      interval: 'month',
      currency: 'usd',
      features: [
        '1,000 analyses per month',
        'Basic hallucination detection',
        'Email support',
        'Standard accuracy reports',
        'API access',
      ],
      analysisLimit: 1000,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 99,
      interval: 'month',
      currency: 'usd',
      features: [
        '10,000 analyses per month',
        'Advanced seq-logprob analysis',
        'Team collaboration',
        'Priority support',
        'Custom integrations',
        'Advanced analytics',
        'Batch processing',
        'Scheduled monitoring',
      ],
      analysisLimit: 10000,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 0,
      interval: 'month',
      currency: 'usd',
      features: [
        'Unlimited analyses',
        'Custom model training',
        'Dedicated support',
        'SLA guarantees',
        'On-premise deployment',
        'Custom integrations',
        'Advanced security',
        'Custom reporting',
      ],
      analysisLimit: -1,
    },
  ];

  return plans.find(plan => plan.id === planId) || plans[0];
}

async function getCurrentUsage(userId, subscription) {
  try {
    const usageSql = `
      SELECT SUM(quantity) as total_usage FROM usage_records 
      WHERE user_id = :userId 
      AND usage_type = 'api_calls' 
      AND timestamp >= :periodStart 
      AND timestamp < :periodEnd
    `;
    
    const usageResult = await executeQuery(usageSql, [
      { name: 'userId', value: { stringValue: userId } },
      { name: 'periodStart', value: { stringValue: subscription.current_period_start } },
      { name: 'periodEnd', value: { stringValue: subscription.current_period_end } }
    ]);

    const usageColumns = ['total_usage'];
    const usageRecords = formatRDSResults(usageResult.records || [], usageColumns);
    
    const currentUsage = usageRecords.length > 0 ? (usageRecords[0].total_usage || 0) : 0;
    const plan = await getSubscriptionPlan(subscription.plan_id);
    const limit = plan.analysisLimit;
    const percentage = limit > 0 ? Math.min((currentUsage / limit) * 100, 100) : 0;
    const overage = limit > 0 ? Math.max(0, currentUsage - limit) : 0;
    const overageCost = overage * 0.01;

    return {
      current: currentUsage,
      limit,
      percentage,
      resetDate: subscription.current_period_end,
      overage,
      overageCost,
    };
  } catch (error) {
    console.error('Error getting current usage:', error);
    return {
      current: 0,
      limit: 0,
      percentage: 0,
      resetDate: subscription.current_period_end,
      overage: 0,
      overageCost: 0,
    };
  }
}

async function getDefaultPaymentMethod(customerId) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted || !customer.invoice_settings?.default_payment_method) {
      return null;
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(
      customer.invoice_settings.default_payment_method
    );

    if (paymentMethod.card) {
      return {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expiryMonth: paymentMethod.card.exp_month,
        expiryYear: paymentMethod.card.exp_year,
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting payment method:', error);
    return null;
  }
}

async function getRecentInvoices(customerId, limit = 10) {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: limit,
      status: 'paid',
    });

    return invoices.data.map(invoice => ({
      id: invoice.id,
      date: new Date(invoice.created * 1000).toISOString(),
      amount: invoice.amount_paid / 100,
      status: invoice.status || 'unknown',
      downloadUrl: invoice.invoice_pdf || invoice.hosted_invoice_url || '',
      description: invoice.description || `Invoice for ${new Date(invoice.created * 1000).toLocaleDateString()}`,
    }));
  } catch (error) {
    console.error('Error getting invoices:', error);
    return [];
  }
}

async function getUsageAnalytics(userId, days) {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    const analyticsSql = `
      SELECT quantity, timestamp FROM usage_records 
      WHERE user_id = :userId 
      AND usage_type = 'api_calls' 
      AND timestamp >= :startDate 
      AND timestamp <= :endDate 
      ORDER BY timestamp ASC
    `;
    
    const analyticsResult = await executeQuery(analyticsSql, [
      { name: 'userId', value: { stringValue: userId } },
      { name: 'startDate', value: { stringValue: startDate.toISOString() } },
      { name: 'endDate', value: { stringValue: endDate.toISOString() } }
    ]);

    const analyticsColumns = ['quantity', 'timestamp'];
    const records = formatRDSResults(analyticsResult.records || [], analyticsColumns);

    // Group by day
    const dailyUsage = new Map();
    let totalUsage = 0;

    records.forEach(record => {
      const date = new Date(record.timestamp).toISOString().split('T')[0];
      dailyUsage.set(date, (dailyUsage.get(date) || 0) + record.quantity);
      totalUsage += record.quantity;
    });

    // Convert to array and fill missing days with 0
    const dailyBreakdown = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      dailyBreakdown.push({
        date,
        usage: dailyUsage.get(date) || 0
      });
    }

    // Find peak day
    const peakDay = dailyBreakdown.reduce((peak, day) => 
      day.usage > peak.usage ? day : peak,
      { date: '', usage: 0 }
    );

    // Calculate trend (simple linear regression)
    const n = dailyBreakdown.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = dailyBreakdown.reduce((sum, day) => sum + day.usage, 0);
    const sumXY = dailyBreakdown.reduce((sum, day, index) => sum + index * day.usage, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const trend = slope > 1 ? 'increasing' : slope < -1 ? 'decreasing' : 'stable';

    return {
      totalUsage,
      dailyAverage: totalUsage / days,
      peakDay,
      trend,
      dailyBreakdown
    };
  } catch (error) {
    console.error('Error getting usage analytics:', error);
    return {
      totalUsage: 0,
      dailyAverage: 0,
      peakDay: { date: '', usage: 0 },
      trend: 'stable',
      dailyBreakdown: []
    };
  }
}

// Main Lambda handler
exports.handler = async (event, context) => {
  console.log('Billing API Lambda invoked:', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
      body: ''
    };
  }

  try {
    // Extract user ID from authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Missing authorization header' }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const userId = await getUserFromToken(accessToken);

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid or expired token' }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    const path = event.path || event.rawPath;
    const method = event.httpMethod || event.requestContext?.http?.method;

    // Route requests
    if (method === 'GET') {
      if (path.endsWith('/info')) {
        return await handleGetBillingInfo(userId);
      } else if (path.endsWith('/usage/analytics')) {
        const days = parseInt(event.queryStringParameters?.days || '30');
        return await handleGetUsageAnalytics(userId, days);
      } else if (path.endsWith('/invoices')) {
        const limit = parseInt(event.queryStringParameters?.limit || '10');
        return await handleGetInvoices(userId, limit);
      }
    } else if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      
      if (path.endsWith('/portal')) {
        return await handleCreatePortalSession(userId, body.returnUrl);
      } else if (path.endsWith('/cancel')) {
        return await handleCancelSubscription(userId);
      }
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Endpoint not found' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Billing API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
};