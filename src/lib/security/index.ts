/**
 * Security Integration Service
 * Central hub for all payment security and fraud prevention features
 */

export { PaymentSecurityService, paymentSecurityService } from './paymentSecurity';
export { BillingEncryptionService, billingEncryptionService } from './billingEncryption';
export { TrialAbusePreventionService, trialAbusePreventionService } from './trialAbusePreventionService';
export { BillingAuditLogger, billingAuditLogger } from './billingAuditLogger';

// Re-export types
export type {
  SecurityRiskLevel,
  FraudDetectionResult,
  PaymentVelocityCheck,
  SuspiciousActivityAlert,
} from './paymentSecurity';

export type {
  EncryptedData,
  SensitiveBillingData,
} from './billingEncryption';

export type {
  TrialEligibilityResult,
  DeviceFingerprint,
  TrialTrackingData,
} from './trialAbusePreventionService';

export type {
  AuditActionType,
  ResourceType,
  AuditLogEntry,
  AuditQueryFilters,
  AuditSummary,
} from './billingAuditLogger';

import { paymentSecurityService } from './paymentSecurity';
import { billingEncryptionService } from './billingEncryption';
import { trialAbusePreventionService } from './trialAbusePreventionService';
import { billingAuditLogger } from './billingAuditLogger';

/**
 * Integrated Security Manager
 * Provides a unified interface for all security operations
 */
export class SecurityManager {
  /**
   * Comprehensive payment security check
   */
  async performSecurityCheck(
    userId: string,
    paymentData: {
      paymentIntentId?: string;
      amount: number;
      currency: string;
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
    }
  ): Promise<{
    allowed: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
    requiresReview: boolean;
    velocityCheck: any;
    fraudAnalysis?: any;
  }> {
    const results = {
      allowed: true,
      riskLevel: 'low' as const,
      reasons: [] as string[],
      requiresReview: false,
      velocityCheck: null as any,
      fraudAnalysis: null as any,
    };

    try {
      // Check payment velocity
      results.velocityCheck = await paymentSecurityService.checkPaymentVelocity(
        userId,
        'payment_attempt'
      );

      if (!results.velocityCheck.allowed) {
        results.allowed = false;
        results.riskLevel = 'high';
        results.reasons.push(results.velocityCheck.reason);
        results.requiresReview = true;
      }

      // Perform fraud analysis if payment intent exists
      if (paymentData.paymentIntentId) {
        results.fraudAnalysis = await paymentSecurityService.analyzePaymentFraud(
          paymentData.paymentIntentId,
          userId,
          {
            ipAddress: paymentData.ipAddress,
            userAgent: paymentData.userAgent,
            deviceFingerprint: paymentData.deviceFingerprint,
            amount: paymentData.amount,
            currency: paymentData.currency,
          }
        );

        if (results.fraudAnalysis.blocked) {
          results.allowed = false;
        }

        if (results.fraudAnalysis.requiresReview) {
          results.requiresReview = true;
        }

        // Use highest risk level
        if (results.fraudAnalysis.riskLevel === 'critical' || 
            (results.fraudAnalysis.riskLevel === 'high' && results.riskLevel !== 'critical')) {
          results.riskLevel = results.fraudAnalysis.riskLevel;
        }

        results.reasons.push(...results.fraudAnalysis.reasons);
      }

      // Record security event
      await paymentSecurityService.recordSecurityEvent(
        userId,
        'payment_security_check',
        {
          ipAddress: paymentData.ipAddress,
          userAgent: paymentData.userAgent,
          deviceFingerprint: paymentData.deviceFingerprint,
          riskLevel: results.riskLevel,
          allowed: results.allowed,
          requiresReview: results.requiresReview,
        }
      );

      // Log audit event
      await billingAuditLogger.logBillingOperation({
        userId,
        actionType: 'payment_processed',
        resourceType: 'payment',
        resourceId: paymentData.paymentIntentId,
        success: results.allowed,
        errorMessage: results.allowed ? undefined : results.reasons.join('; '),
        ipAddress: paymentData.ipAddress,
        userAgent: paymentData.userAgent,
        metadata: {
          security_check: {
            risk_level: results.riskLevel,
            velocity_check: results.velocityCheck,
            fraud_analysis: results.fraudAnalysis,
          },
        },
      });

      return results;

    } catch (error) {
      console.error('Security check failed:', error);
      
      // Return restrictive result on error
      return {
        allowed: false,
        riskLevel: 'high',
        reasons: ['Security check failed'],
        requiresReview: true,
        velocityCheck: null,
        fraudAnalysis: null,
      };
    }
  }

  /**
   * Comprehensive trial eligibility check
   */
  async checkTrialEligibility(
    userId: string,
    email: string,
    context: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      referrer?: string;
      utmSource?: string;
    } = {}
  ): Promise<{
    eligible: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
    recommendedAction: 'allow' | 'require_verification' | 'deny';
    abuseFlags: string[];
  }> {
    try {
      // Check trial eligibility
      const eligibilityResult = await trialAbusePreventionService.checkTrialEligibility(
        userId,
        email,
        context.ipAddress,
        context.deviceFingerprint,
        context.userAgent
      );

      // Log audit event
      await billingAuditLogger.logTrialEvent(
        userId,
        'started',
        {
          eligible: eligibilityResult.eligible,
          risk_level: eligibilityResult.riskLevel,
          abuse_flags: eligibilityResult.abuseFlags,
          recommended_action: eligibilityResult.recommendedAction,
        },
        context
      );

      return eligibilityResult;

    } catch (error) {
      console.error('Trial eligibility check failed:', error);
      
      return {
        eligible: false,
        riskLevel: 'high',
        reasons: ['Trial eligibility check failed'],
        recommendedAction: 'require_verification',
        abuseFlags: ['system_error'],
      };
    }
  }

  /**
   * Secure data encryption for billing information
   */
  async encryptBillingData(
    userId: string,
    dataType: string,
    data: Record<string, any>
  ): Promise<string> {
    try {
      const encryptedData = billingEncryptionService.encrypt(JSON.stringify(data));
      
      // Log audit event
      await billingAuditLogger.logBillingOperation({
        userId,
        actionType: 'billing_address_updated', // Generic action for data encryption
        resourceType: 'customer',
        success: true,
        metadata: {
          data_type: dataType,
          encryption_version: 1,
        },
      });

      return JSON.stringify(encryptedData);

    } catch (error) {
      console.error('Billing data encryption failed:', error);
      throw new Error('Failed to encrypt billing data');
    }
  }

  /**
   * Secure data decryption for billing information
   */
  async decryptBillingData(
    userId: string,
    encryptedDataString: string
  ): Promise<Record<string, any>> {
    try {
      const encryptedData = JSON.parse(encryptedDataString);
      const decryptedString = billingEncryptionService.decrypt(encryptedData);
      
      return JSON.parse(decryptedString);

    } catch (error) {
      console.error('Billing data decryption failed:', error);
      throw new Error('Failed to decrypt billing data');
    }
  }

  /**
   * Initialize security monitoring for a new user
   */
  async initializeUserSecurity(
    userId: string,
    email: string,
    context: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      referrer?: string;
    } = {}
  ): Promise<void> {
    try {
      // Record initial security event
      await paymentSecurityService.recordSecurityEvent(
        userId,
        'user_registered',
        context
      );

      // Log audit event
      await billingAuditLogger.logBillingOperation({
        userId,
        actionType: 'customer_created',
        resourceType: 'customer',
        success: true,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          registration_context: context,
          security_initialized: true,
        },
      });

    } catch (error) {
      console.error('Failed to initialize user security:', error);
    }
  }

  /**
   * Generate security report for user
   */
  async generateSecurityReport(userId: string): Promise<{
    riskScore: number;
    securityAlerts: any[];
    auditSummary: any;
    recommendations: string[];
  }> {
    try {
      // Get security alerts
      const securityAlerts = await paymentSecurityService.getUserSecurityAlerts(userId, {
        resolved: false,
        limit: 10,
      });

      // Get audit summary
      const auditSummary = await billingAuditLogger.getAuditSummary('month', userId);

      // Calculate risk score (simplified)
      let riskScore = 0;
      securityAlerts.forEach(alert => {
        switch (alert.severity) {
          case 'critical': riskScore += 40; break;
          case 'high': riskScore += 25; break;
          case 'medium': riskScore += 10; break;
          case 'low': riskScore += 5; break;
        }
      });

      // Generate recommendations
      const recommendations: string[] = [];
      if (securityAlerts.length > 0) {
        recommendations.push('Review and resolve security alerts');
      }
      if (auditSummary.failedEvents > auditSummary.successfulEvents * 0.1) {
        recommendations.push('High failure rate detected - review payment methods');
      }
      if (riskScore > 50) {
        recommendations.push('Consider additional verification steps');
      }

      return {
        riskScore: Math.min(riskScore, 100),
        securityAlerts,
        auditSummary,
        recommendations,
      };

    } catch (error) {
      console.error('Failed to generate security report:', error);
      return {
        riskScore: 0,
        securityAlerts: [],
        auditSummary: null,
        recommendations: ['Unable to generate security report'],
      };
    }
  }

  /**
   * Validate security configuration
   */
  validateConfiguration(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check encryption key
    const encryptionKey = process.env.BILLING_ENCRYPTION_KEY;
    if (!encryptionKey) {
      errors.push('BILLING_ENCRYPTION_KEY environment variable is required');
    } else {
      const keyValidation = BillingEncryptionService.validateEncryptionKey(encryptionKey);
      if (!keyValidation.valid) {
        errors.push(...keyValidation.errors);
      }
      if (keyValidation.strength === 'weak') {
        warnings.push('Encryption key strength is weak');
      }
    }

    // Check Stripe configuration
    if (!process.env.STRIPE_SECRET_KEY) {
      errors.push('STRIPE_SECRET_KEY environment variable is required');
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      errors.push('STRIPE_WEBHOOK_SECRET environment variable is required');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// Export singleton instance
export const securityManager = new SecurityManager();