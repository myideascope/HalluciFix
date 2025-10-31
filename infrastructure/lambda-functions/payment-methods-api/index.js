/**
 * AWS Lambda Function: Payment Methods API
 * Migrated from Supabase Edge Function
 * Provides payment method CRUD operations, setup intents, and security validation
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

// Get all payment methods for user
async function handleGetPaymentMethods(userId) {
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
      return {
        statusCode: 200,
        body: JSON.stringify({ paymentMethods: [] }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    const customerColumns = ['stripe_customer_id'];
    const customers = formatRDSResults(customerResult.records, customerColumns);
    const customer = customers[0];

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

    const formattedPaymentMethods = paymentMethods.data.map(pm => ({
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

    return {
      statusCode: 200,
      body: JSON.stringify({ paymentMethods: formattedPaymentMethods }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error getting payment methods:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get payment methods',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Create setup intent for adding new payment method
async function handleCreateSetupIntent(userId, body) {
  try {
    await initializeStripe();

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

    const response = {
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error creating setup intent:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to create setup intent',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Attach payment method to customer
async function handleAttachPaymentMethod(userId, body) {
  try {
    await initializeStripe();

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

    const formattedPaymentMethod = {
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
    const logSql = `
      INSERT INTO payment_method_events 
      (user_id, stripe_payment_method_id, stripe_customer_id, event_type, payment_method_type, card_brand, card_last4, is_default, created_at) 
      VALUES (:userId, :paymentMethodId, :customerId, :eventType, :paymentMethodType, :cardBrand, :cardLast4, :isDefault, :createdAt)
    `;
    
    await executeQuery(logSql, [
      { name: 'userId', value: { stringValue: userId } },
      { name: 'paymentMethodId', value: { stringValue: paymentMethodId } },
      { name: 'customerId', value: { stringValue: customerId } },
      { name: 'eventType', value: { stringValue: 'attached' } },
      { name: 'paymentMethodType', value: { stringValue: paymentMethod.type } },
      { name: 'cardBrand', value: { stringValue: paymentMethod.card?.brand || null } },
      { name: 'cardLast4', value: { stringValue: paymentMethod.card?.last4 || null } },
      { name: 'isDefault', value: { booleanValue: setAsDefault } },
      { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        paymentMethod: formattedPaymentMethod,
        message: 'Payment method attached successfully',
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error attaching payment method:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to attach payment method',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Set payment method as default
async function handleSetDefaultPaymentMethod(userId, paymentMethodId) {
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

    // Verify payment method belongs to customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== customer.stripe_customer_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Payment method does not belong to customer' }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    // Set as default payment method
    await stripe.customers.update(customer.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Log the change
    const logSql = `
      INSERT INTO payment_method_events 
      (user_id, stripe_payment_method_id, stripe_customer_id, event_type, payment_method_type, card_brand, card_last4, is_default, created_at) 
      VALUES (:userId, :paymentMethodId, :customerId, :eventType, :paymentMethodType, :cardBrand, :cardLast4, :isDefault, :createdAt)
    `;
    
    await executeQuery(logSql, [
      { name: 'userId', value: { stringValue: userId } },
      { name: 'paymentMethodId', value: { stringValue: paymentMethodId } },
      { name: 'customerId', value: { stringValue: customer.stripe_customer_id } },
      { name: 'eventType', value: { stringValue: 'set_default' } },
      { name: 'paymentMethodType', value: { stringValue: paymentMethod.type } },
      { name: 'cardBrand', value: { stringValue: paymentMethod.card?.brand || null } },
      { name: 'cardLast4', value: { stringValue: paymentMethod.card?.last4 || null } },
      { name: 'isDefault', value: { booleanValue: true } },
      { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Default payment method updated successfully',
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error setting default payment method:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to set default payment method',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Detach payment method from customer
async function handleDetachPaymentMethod(userId, paymentMethodId) {
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

    // Verify payment method belongs to customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== customer.stripe_customer_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Payment method does not belong to customer' }),
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
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
    const logSql = `
      INSERT INTO payment_method_events 
      (user_id, stripe_payment_method_id, stripe_customer_id, event_type, payment_method_type, card_brand, card_last4, is_default, created_at) 
      VALUES (:userId, :paymentMethodId, :customerId, :eventType, :paymentMethodType, :cardBrand, :cardLast4, :isDefault, :createdAt)
    `;
    
    await executeQuery(logSql, [
      { name: 'userId', value: { stringValue: userId } },
      { name: 'paymentMethodId', value: { stringValue: paymentMethodId } },
      { name: 'customerId', value: { stringValue: customer.stripe_customer_id } },
      { name: 'eventType', value: { stringValue: 'detached' } },
      { name: 'paymentMethodType', value: { stringValue: paymentMethod.type } },
      { name: 'cardBrand', value: { stringValue: paymentMethod.card?.brand || null } },
      { name: 'cardLast4', value: { stringValue: paymentMethod.card?.last4 || null } },
      { name: 'isDefault', value: { booleanValue: isDefault } },
      { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Payment method removed successfully',
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error detaching payment method:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to remove payment method',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Validate payment method security and compliance
async function handleValidatePaymentMethod(userId, paymentMethodId) {
  try {
    await initializeStripe();

    // Get payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    const validation = {
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
    const logSql = `
      INSERT INTO payment_method_validations 
      (user_id, stripe_payment_method_id, is_valid, risk_level, errors, warnings, validated_at) 
      VALUES (:userId, :paymentMethodId, :isValid, :riskLevel, :errors, :warnings, :validatedAt)
    `;
    
    await executeQuery(logSql, [
      { name: 'userId', value: { stringValue: userId } },
      { name: 'paymentMethodId', value: { stringValue: paymentMethodId } },
      { name: 'isValid', value: { booleanValue: validation.isValid } },
      { name: 'riskLevel', value: { stringValue: validation.riskLevel } },
      { name: 'errors', value: { stringValue: JSON.stringify(validation.errors) } },
      { name: 'warnings', value: { stringValue: JSON.stringify(validation.warnings) } },
      { name: 'validatedAt', value: { stringValue: new Date().toISOString() } }
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify(validation),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };

  } catch (error) {
    console.error('Error validating payment method:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to validate payment method',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
}

// Helper function to get or create Stripe customer
async function getOrCreateStripeCustomer(userId) {
  // Check if customer already exists
  const existingCustomerSql = `
    SELECT stripe_customer_id FROM stripe_customers 
    WHERE user_id = :userId
  `;
  
  const existingCustomerResult = await executeQuery(existingCustomerSql, [
    { name: 'userId', value: { stringValue: userId } }
  ]);

  if (existingCustomerResult.records && existingCustomerResult.records.length > 0) {
    const customerColumns = ['stripe_customer_id'];
    const customers = formatRDSResults(existingCustomerResult.records, customerColumns);
    return customers[0].stripe_customer_id;
  }

  // Get user details from Cognito
  const userSql = `
    SELECT email, name FROM users 
    WHERE id = :userId
  `;
  
  const userResult = await executeQuery(userSql, [
    { name: 'userId', value: { stringValue: userId } }
  ]);

  if (!userResult.records || userResult.records.length === 0) {
    throw new Error('User not found');
  }

  const userColumns = ['email', 'name'];
  const users = formatRDSResults(userResult.records, userColumns);
  const user = users[0];

  // Create new Stripe customer
  const stripeCustomer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: userId,
    },
  });

  // Save customer to database
  const saveCustomerSql = `
    INSERT INTO stripe_customers 
    (user_id, stripe_customer_id, email, name, created_at) 
    VALUES (:userId, :stripeCustomerId, :email, :name, :createdAt)
  `;
  
  await executeQuery(saveCustomerSql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'stripeCustomerId', value: { stringValue: stripeCustomer.id } },
    { name: 'email', value: { stringValue: user.email } },
    { name: 'name', value: { stringValue: user.name } },
    { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
  ]);

  return stripeCustomer.id;
}

// Extract payment method ID from URL path
function extractPaymentMethodId(path) {
  const matches = path.match(/\/payment-methods\/([^\/]+)/);
  if (!matches || !matches[1]) {
    throw new Error('Invalid payment method ID in path');
  }
  return matches[1];
}

// Main Lambda handler
exports.handler = async (event, context) => {
  console.log('Payment Methods API Lambda invoked:', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
      if (path.endsWith('/payment-methods')) {
        return await handleGetPaymentMethods(userId);
      } else if (path.includes('/payment-methods/') && path.endsWith('/validate')) {
        const paymentMethodId = extractPaymentMethodId(path);
        return await handleValidatePaymentMethod(userId, paymentMethodId);
      }
    } else if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      
      if (path.endsWith('/setup-intent')) {
        return await handleCreateSetupIntent(userId, body);
      } else if (path.endsWith('/payment-methods')) {
        return await handleAttachPaymentMethod(userId, body);
      }
    } else if (method === 'PUT') {
      if (path.includes('/payment-methods/') && path.endsWith('/default')) {
        const paymentMethodId = extractPaymentMethodId(path);
        return await handleSetDefaultPaymentMethod(userId, paymentMethodId);
      }
    } else if (method === 'DELETE') {
      if (path.includes('/payment-methods/')) {
        const paymentMethodId = extractPaymentMethodId(path);
        return await handleDetachPaymentMethod(userId, paymentMethodId);
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
    console.error('Payment Methods API error:', error);
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