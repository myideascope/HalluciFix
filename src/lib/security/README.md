# Payment Security and Fraud Prevention

This module implements comprehensive security measures for the Stripe payment integration, including fraud detection, trial abuse prevention, billing data encryption, and audit logging.

## Components

### 1. Payment Security Service (`paymentSecurity.ts`)

Implements Stripe Radar integration and custom fraud detection rules:

- **Fraud Detection**: Analyzes payments using Stripe Radar and custom rules
- **Velocity Limits**: Prevents rapid-fire payment attempts
- **Risk Assessment**: Calculates risk scores based on multiple factors
- **IP Analysis**: Detects suspicious IP patterns and VPN usage
- **Device Fingerprinting**: Tracks device usage patterns

```typescript
import { paymentSecurityService } from './security';

// Analyze payment for fraud
const fraudResult = await paymentSecurityService.analyzePaymentFraud(
  paymentIntentId,
  userId,
  {
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    deviceFingerprint: 'abc123...',
    amount: 2999, // $29.99
    currency: 'usd'
  }
);

if (fraudResult.blocked) {
  // Block the payment
}
```

### 2. Billing Encryption Service (`billingEncryption.ts`)

Provides secure encryption for sensitive billing data:

- **AES-256-GCM Encryption**: Industry-standard encryption
- **Key Derivation**: PBKDF2 with salt for key security
- **Data Masking**: Safe display of sensitive information
- **Key Rotation**: Support for encryption key updates

```typescript
import { billingEncryptionService } from './security';

// Encrypt sensitive data
const encrypted = billingEncryptionService.encrypt('sensitive-data');

// Decrypt data
const decrypted = billingEncryptionService.decrypt(encrypted);

// Mask for display
const masked = billingEncryptionService.maskSensitiveData('4111111111111111', 'card');
// Returns: "**** **** **** 1111"
```

### 3. Trial Abuse Prevention Service (`trialAbusePreventionService.ts`)

Prevents trial abuse through comprehensive tracking:

- **Eligibility Checking**: Multi-factor trial eligibility validation
- **Device Fingerprinting**: Browser-based device identification
- **Email Analysis**: Disposable email detection
- **Pattern Recognition**: Suspicious behavior detection
- **Abuse Reporting**: Manual abuse reporting system

```typescript
import { trialAbusePreventionService } from './security';

// Check trial eligibility
const eligibility = await trialAbusePreventionService.checkTrialEligibility(
  userId,
  email,
  ipAddress,
  deviceFingerprint,
  userAgent
);

if (!eligibility.eligible) {
  // Deny trial access
}
```

### 4. Billing Audit Logger (`billingAuditLogger.ts`)

Comprehensive audit logging for compliance:

- **Operation Logging**: All billing operations tracked
- **Change Tracking**: Before/after value comparison
- **Query Interface**: Flexible audit log querying
- **Export Functionality**: CSV/JSON export for compliance
- **Retention Management**: Automated log cleanup

```typescript
import { billingAuditLogger } from './security';

// Log a billing operation
await billingAuditLogger.logSubscriptionCreated(
  userId,
  subscriptionData,
  {
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    performedBy: adminUserId
  }
);

// Query audit logs
const logs = await billingAuditLogger.queryAuditLogs({
  userId,
  actionType: 'subscription_created',
  startDate: new Date('2024-01-01'),
  limit: 50
});
```

### 5. Security Manager (`index.ts`)

Unified interface for all security operations:

- **Integrated Checks**: Combined security validation
- **Risk Assessment**: Comprehensive risk scoring
- **Configuration Validation**: Security setup verification
- **Reporting**: Security status reports

```typescript
import { securityManager } from './security';

// Perform comprehensive security check
const securityResult = await securityManager.performSecurityCheck(
  userId,
  {
    paymentIntentId: 'pi_123',
    amount: 2999,
    currency: 'usd',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    deviceFingerprint: 'abc123...'
  }
);

if (!securityResult.allowed) {
  // Block the operation
}
```

## Database Schema

The security system uses several database tables:

- `security_events`: General security event tracking
- `fraud_analysis_logs`: Fraud detection results
- `suspicious_activity_alerts`: Security alerts requiring attention
- `user_devices`: Device fingerprint tracking
- `trial_tracking`: Trial usage monitoring
- `billing_audit_log`: Comprehensive audit trail
- `encrypted_billing_data`: Encrypted sensitive data storage

## Configuration

Required environment variables:

```bash
# Billing data encryption (32-byte hex key)
BILLING_ENCRYPTION_KEY=your_64_character_hex_key

# Stripe configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Security Features

### Fraud Detection
- Stripe Radar integration
- Custom risk scoring algorithms
- IP geolocation analysis
- Device fingerprint tracking
- Payment velocity monitoring

### Trial Abuse Prevention
- Email hash tracking (privacy-preserving)
- Device fingerprint analysis
- IP address monitoring
- Disposable email detection
- Suspicious pattern recognition

### Data Protection
- AES-256-GCM encryption
- Secure key derivation (PBKDF2)
- Data masking for display
- Secure memory handling
- Key rotation support

### Audit & Compliance
- Comprehensive operation logging
- Change tracking with before/after values
- Flexible querying and filtering
- Export capabilities (CSV/JSON)
- Automated retention management

## Usage Examples

### Complete Payment Security Flow

```typescript
import { securityManager, paymentSecurityService } from './security';

async function processPayment(userId: string, paymentData: any) {
  // 1. Perform security check
  const securityCheck = await securityManager.performSecurityCheck(
    userId,
    paymentData
  );

  if (!securityCheck.allowed) {
    throw new Error(`Payment blocked: ${securityCheck.reasons.join(', ')}`);
  }

  // 2. Process payment with Stripe
  const paymentIntent = await stripe.paymentIntents.create({
    amount: paymentData.amount,
    currency: paymentData.currency,
    customer: paymentData.customerId,
  });

  // 3. Analyze for fraud
  const fraudAnalysis = await paymentSecurityService.analyzePaymentFraud(
    paymentIntent.id,
    userId,
    paymentData
  );

  if (fraudAnalysis.blocked) {
    await stripe.paymentIntents.cancel(paymentIntent.id);
    throw new Error('Payment blocked by fraud detection');
  }

  return paymentIntent;
}
```

### Trial Eligibility Check

```typescript
import { securityManager } from './security';

async function startTrial(userId: string, email: string, context: any) {
  // Check eligibility
  const eligibility = await securityManager.checkTrialEligibility(
    userId,
    email,
    context
  );

  if (!eligibility.eligible) {
    if (eligibility.recommendedAction === 'require_verification') {
      // Require additional verification
      return { requiresVerification: true, reasons: eligibility.reasons };
    } else {
      // Deny trial
      throw new Error(`Trial denied: ${eligibility.reasons.join(', ')}`);
    }
  }

  // Start trial...
}
```

## Best Practices

1. **Always validate configuration** before deployment
2. **Monitor security alerts** regularly
3. **Review audit logs** for compliance
4. **Rotate encryption keys** periodically
5. **Update fraud rules** based on patterns
6. **Test security measures** in staging environment

## Monitoring & Alerting

The system generates various alerts and logs:

- **High-risk transactions** trigger immediate alerts
- **Trial abuse patterns** are flagged for review
- **Failed security checks** are logged with context
- **Audit events** provide compliance trail
- **System errors** are captured for debugging

Regular monitoring of these events helps maintain security posture and compliance requirements.