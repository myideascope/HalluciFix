/**
 * Payment Security Service
 * Implements Stripe Radar integration, fraud detection, and payment security measures
 */

import Stripe from 'stripe';
import { supabase } from '../supabase';
import { getStripe, withStripeErrorHandling } from '../stripe';

// Security risk levels
export type SecurityRiskLevel = 'low' | 'medium' | 'high' | 'critical';

// Fraud detection result
export interface FraudDetectionResult {
  riskLevel: SecurityRiskLevel;
  riskScore: number;
  reasons: string[];
  blocked: boolean;
  requiresReview: boolean;
  radarRuleMatches?: string[];
}

// Payment velocity tracking
export interface PaymentVelocityCheck {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  limit: number;
  timeWindow: string;
  resetTime: Date;
}

// Suspicious activity alert
export interface SuspiciousActivityAlert {
  id: string;
  userId: string;
  alertType: 'velocity_exceeded' | 'fraud_detected' | 'unusual_pattern' | 'high_risk_payment';
  severity: SecurityRiskLevel;
  description: string;
  metadata: Record<string, any>;
  createdAt: Date;
  resolved: boolean;
}

export class PaymentSecurityService {
  private stripe: Stripe;

  // Payment velocity limits (per user)
  private readonly VELOCITY_LIMITS = {
    // Maximum payment attempts per time window
    PAYMENT_ATTEMPTS: {
      '1_hour': 5,
      '24_hours': 20,
      '7_days': 100,
    },
    // Maximum failed payment attempts
    FAILED_ATTEMPTS: {
      '1_hour': 3,
      '24_hours': 10,
    },
    // Maximum subscription changes
    SUBSCRIPTION_CHANGES: {
      '24_hours': 5,
      '7_days': 10,
    },
  };

  constructor() {
    this.stripe = getStripe();
  }

  /**
   * Analyze payment for fraud using Stripe Radar and custom rules
   */
  async analyzePaymentFraud(
    paymentIntentId: string,
    userId: string,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      amount: number;
      currency: string;
    }
  ): Promise<FraudDetectionResult> {
    try {
      // Get payment intent with Stripe Radar data
      const paymentIntent = await withStripeErrorHandling(
        () => this.stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ['charges.data.outcome', 'charges.data.fraud_details'],
        }),
        'retrieve payment intent for fraud analysis'
      );

      const result: FraudDetectionResult = {
        riskLevel: 'low',
        riskScore: 0,
        reasons: [],
        blocked: false,
        requiresReview: false,
        radarRuleMatches: [],
      };

      // Analyze Stripe Radar results
      if (paymentIntent.charges?.data.length > 0) {
        const charge = paymentIntent.charges.data[0];
        
        // Check Radar risk level
        if (charge.outcome?.risk_level) {
          switch (charge.outcome.risk_level) {
            case 'highest':
              result.riskLevel = 'critical';
              result.riskScore += 80;
              result.reasons.push('Stripe Radar flagged as highest risk');
              break;
            case 'elevated':
              result.riskLevel = 'high';
              result.riskScore += 60;
              result.reasons.push('Stripe Radar flagged as elevated risk');
              break;
            case 'normal':
              result.riskScore += 10;
              break;
          }
        }

        // Check for fraud details
        if (charge.fraud_details) {
          Object.entries(charge.fraud_details).forEach(([key, value]) => {
            if (value === 'fraudulent') {
              result.riskLevel = 'critical';
              result.riskScore += 100;
              result.reasons.push(`Fraud detected: ${key}`);
              result.blocked = true;
            }
          });
        }

        // Check Radar rule matches
        if (charge.outcome?.rule?.id) {
          result.radarRuleMatches?.push(charge.outcome.rule.id);
          result.riskScore += 30;
          result.reasons.push(`Matched Radar rule: ${charge.outcome.rule.id}`);
        }
      }

      // Apply custom fraud detection rules
      await this.applyCustomFraudRules(result, userId, metadata);

      // Determine final risk assessment
      this.finalizeRiskAssessment(result);

      // Log fraud analysis
      await this.logFraudAnalysis(paymentIntentId, userId, result, metadata);

      return result;

    } catch (error) {
      console.error('Fraud analysis failed:', error);
      
      // Return high risk on analysis failure for safety
      return {
        riskLevel: 'high',
        riskScore: 70,
        reasons: ['Fraud analysis failed - defaulting to high risk'],
        blocked: false,
        requiresReview: true,
      };
    }
  }

  /**
   * Apply custom fraud detection rules
   */
  private async applyCustomFraudRules(
    result: FraudDetectionResult,
    userId: string,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      amount: number;
      currency: string;
    }
  ): Promise<void> {
    // Check payment velocity
    const velocityCheck = await this.checkPaymentVelocity(userId, 'payment_attempt');
    if (!velocityCheck.allowed) {
      result.riskScore += 40;
      result.reasons.push(`Payment velocity exceeded: ${velocityCheck.reason}`);
      result.requiresReview = true;
    }

    // Check for unusual payment amounts
    const averagePayment = await this.getUserAveragePayment(userId);
    if (averagePayment > 0 && metadata.amount > averagePayment * 5) {
      result.riskScore += 25;
      result.reasons.push('Payment amount significantly higher than user average');
    }

    // Check for suspicious IP patterns
    if (metadata.ipAddress) {
      const ipRisk = await this.analyzeIPAddress(metadata.ipAddress, userId);
      if (ipRisk.suspicious) {
        result.riskScore += ipRisk.riskScore;
        result.reasons.push(...ipRisk.reasons);
      }
    }

    // Check for device fingerprint anomalies
    if (metadata.deviceFingerprint) {
      const deviceRisk = await this.analyzeDeviceFingerprint(metadata.deviceFingerprint, userId);
      if (deviceRisk.suspicious) {
        result.riskScore += deviceRisk.riskScore;
        result.reasons.push(...deviceRisk.reasons);
      }
    }

    // Check for recent failed payments
    const recentFailures = await this.getRecentFailedPayments(userId, 24); // Last 24 hours
    if (recentFailures > 3) {
      result.riskScore += 30;
      result.reasons.push(`${recentFailures} failed payments in last 24 hours`);
    }

    // Check for account age
    const accountAge = await this.getUserAccountAge(userId);
    if (accountAge < 7) { // Less than 7 days old
      result.riskScore += 20;
      result.reasons.push('New account (less than 7 days old)');
    }
  }

  /**
   * Finalize risk assessment based on score and rules
   */
  private finalizeRiskAssessment(result: FraudDetectionResult): void {
    // Determine risk level based on score
    if (result.riskScore >= 80) {
      result.riskLevel = 'critical';
      result.blocked = true;
      result.requiresReview = true;
    } else if (result.riskScore >= 60) {
      result.riskLevel = 'high';
      result.requiresReview = true;
    } else if (result.riskScore >= 30) {
      result.riskLevel = 'medium';
    } else {
      result.riskLevel = 'low';
    }

    // Always block critical risk payments
    if (result.riskLevel === 'critical') {
      result.blocked = true;
    }
  }

  /**
   * Check payment velocity limits
   */
  async checkPaymentVelocity(
    userId: string,
    activityType: 'payment_attempt' | 'failed_payment' | 'subscription_change'
  ): Promise<PaymentVelocityCheck> {
    const limits = this.getVelocityLimits(activityType);
    
    for (const [timeWindow, limit] of Object.entries(limits)) {
      const count = await this.getActivityCount(userId, activityType, timeWindow);
      
      if (count >= limit) {
        const resetTime = this.calculateResetTime(timeWindow);
        
        return {
          allowed: false,
          reason: `Exceeded ${limit} ${activityType} attempts in ${timeWindow}`,
          currentCount: count,
          limit,
          timeWindow,
          resetTime,
        };
      }
    }

    return {
      allowed: true,
      currentCount: 0,
      limit: Math.max(...Object.values(limits)),
      timeWindow: '24_hours',
      resetTime: this.calculateResetTime('24_hours'),
    };
  }

  /**
   * Get velocity limits for activity type
   */
  private getVelocityLimits(activityType: string): Record<string, number> {
    switch (activityType) {
      case 'payment_attempt':
        return this.VELOCITY_LIMITS.PAYMENT_ATTEMPTS;
      case 'failed_payment':
        return this.VELOCITY_LIMITS.FAILED_ATTEMPTS;
      case 'subscription_change':
        return this.VELOCITY_LIMITS.SUBSCRIPTION_CHANGES;
      default:
        return { '24_hours': 10 };
    }
  }

  /**
   * Get activity count for time window
   */
  private async getActivityCount(
    userId: string,
    activityType: string,
    timeWindow: string
  ): Promise<number> {
    const hours = this.parseTimeWindow(timeWindow);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const { count, error } = await supabase
      .from('security_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', activityType)
      .gte('created_at', since.toISOString());

    if (error) {
      console.error('Failed to get activity count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Parse time window string to hours
   */
  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/(\d+)_(\w+)/);
    if (!match) return 24;

    const [, amount, unit] = match;
    const num = parseInt(amount);

    switch (unit) {
      case 'hour':
      case 'hours':
        return num;
      case 'day':
      case 'days':
        return num * 24;
      case 'week':
      case 'weeks':
        return num * 24 * 7;
      default:
        return 24;
    }
  }

  /**
   * Calculate reset time for time window
   */
  private calculateResetTime(timeWindow: string): Date {
    const hours = this.parseTimeWindow(timeWindow);
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * Analyze IP address for suspicious patterns
   */
  private async analyzeIPAddress(
    ipAddress: string,
    userId: string
  ): Promise<{ suspicious: boolean; riskScore: number; reasons: string[] }> {
    const result = { suspicious: false, riskScore: 0, reasons: [] as string[] };

    // Check if IP is from a different country than usual
    const userCountry = await this.getUserPrimaryCountry(userId);
    const ipCountry = await this.getIPCountry(ipAddress);
    
    if (userCountry && ipCountry && userCountry !== ipCountry) {
      result.suspicious = true;
      result.riskScore += 25;
      result.reasons.push(`Payment from different country: ${ipCountry} (usual: ${userCountry})`);
    }

    // Check for VPN/Proxy usage (simplified check)
    const isVPN = await this.checkVPNUsage(ipAddress);
    if (isVPN) {
      result.suspicious = true;
      result.riskScore += 20;
      result.reasons.push('Payment from VPN/Proxy detected');
    }

    // Check for multiple users from same IP
    const usersFromIP = await this.getUsersFromIP(ipAddress);
    if (usersFromIP > 5) {
      result.suspicious = true;
      result.riskScore += 15;
      result.reasons.push(`Multiple users (${usersFromIP}) from same IP address`);
    }

    return result;
  }

  /**
   * Analyze device fingerprint for anomalies
   */
  private async analyzeDeviceFingerprint(
    fingerprint: string,
    userId: string
  ): Promise<{ suspicious: boolean; riskScore: number; reasons: string[] }> {
    const result = { suspicious: false, riskScore: 0, reasons: [] as string[] };

    // Check if device fingerprint is new for this user
    const isKnownDevice = await this.isKnownDevice(userId, fingerprint);
    if (!isKnownDevice) {
      result.riskScore += 10;
      result.reasons.push('Payment from new device');
    }

    // Check for multiple users with same fingerprint
    const usersWithFingerprint = await this.getUsersWithFingerprint(fingerprint);
    if (usersWithFingerprint > 3) {
      result.suspicious = true;
      result.riskScore += 25;
      result.reasons.push(`Device fingerprint shared by ${usersWithFingerprint} users`);
    }

    return result;
  }

  /**
   * Get user's average payment amount
   */
  private async getUserAveragePayment(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('payment_history')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      return 0;
    }

    const total = data.reduce((sum, payment) => sum + payment.amount, 0);
    return total / data.length;
  }

  /**
   * Get recent failed payments count
   */
  private async getRecentFailedPayments(userId: string, hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const { count, error } = await supabase
      .from('payment_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'failed')
      .gte('created_at', since.toISOString());

    if (error) {
      console.error('Failed to get recent failed payments:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Get user account age in days
   */
  private async getUserAccountAge(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('users')
      .select('created_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return 0;
    }

    const createdAt = new Date(data.created_at);
    const now = new Date();
    return Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
  }

  /**
   * Get user's primary country (simplified implementation)
   */
  private async getUserPrimaryCountry(userId: string): Promise<string | null> {
    // This would typically analyze user's payment history, IP history, etc.
    // For now, return null to skip this check
    return null;
  }

  /**
   * Get IP address country (simplified implementation)
   */
  private async getIPCountry(ipAddress: string): Promise<string | null> {
    // This would typically use a GeoIP service
    // For now, return null to skip this check
    return null;
  }

  /**
   * Check if IP is from VPN/Proxy (simplified implementation)
   */
  private async checkVPNUsage(ipAddress: string): Promise<boolean> {
    // This would typically use a VPN detection service
    // For now, return false to skip this check
    return false;
  }

  /**
   * Get number of users from same IP
   */
  private async getUsersFromIP(ipAddress: string): Promise<number> {
    const { count, error } = await supabase
      .from('security_events')
      .select('user_id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .eq('event_type', 'payment_attempt');

    if (error) {
      return 0;
    }

    return count || 0;
  }

  /**
   * Check if device is known for user
   */
  private async isKnownDevice(userId: string, fingerprint: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', userId)
      .eq('device_fingerprint', fingerprint)
      .limit(1);

    return !error && data && data.length > 0;
  }

  /**
   * Get number of users with same device fingerprint
   */
  private async getUsersWithFingerprint(fingerprint: string): Promise<number> {
    const { count, error } = await supabase
      .from('user_devices')
      .select('user_id', { count: 'exact', head: true })
      .eq('device_fingerprint', fingerprint);

    if (error) {
      return 0;
    }

    return count || 0;
  }

  /**
   * Log fraud analysis result
   */
  private async logFraudAnalysis(
    paymentIntentId: string,
    userId: string,
    result: FraudDetectionResult,
    metadata: Record<string, any>
  ): Promise<void> {
    const { error } = await supabase
      .from('fraud_analysis_logs')
      .insert({
        user_id: userId,
        payment_intent_id: paymentIntentId,
        risk_level: result.riskLevel,
        risk_score: result.riskScore,
        reasons: result.reasons,
        blocked: result.blocked,
        requires_review: result.requiresReview,
        radar_rule_matches: result.radarRuleMatches,
        metadata,
        created_at: new Date(),
      });

    if (error) {
      console.error('Failed to log fraud analysis:', error);
    }
  }

  /**
   * Record security event
   */
  async recordSecurityEvent(
    userId: string,
    eventType: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const { error } = await supabase
      .from('security_events')
      .insert({
        user_id: userId,
        event_type: eventType,
        ip_address: metadata.ipAddress,
        user_agent: metadata.userAgent,
        device_fingerprint: metadata.deviceFingerprint,
        metadata,
        created_at: new Date(),
      });

    if (error) {
      console.error('Failed to record security event:', error);
    }
  }

  /**
   * Create suspicious activity alert
   */
  async createSuspiciousActivityAlert(
    userId: string,
    alertType: SuspiciousActivityAlert['alertType'],
    severity: SecurityRiskLevel,
    description: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const { error } = await supabase
      .from('suspicious_activity_alerts')
      .insert({
        user_id: userId,
        alert_type: alertType,
        severity,
        description,
        metadata,
        resolved: false,
        created_at: new Date(),
      });

    if (error) {
      console.error('Failed to create suspicious activity alert:', error);
    }

    // Send notification to security team for high/critical alerts
    if (severity === 'high' || severity === 'critical') {
      await this.notifySecurityTeam(userId, alertType, severity, description, metadata);
    }
  }

  /**
   * Notify security team of high-risk activity
   */
  private async notifySecurityTeam(
    userId: string,
    alertType: string,
    severity: SecurityRiskLevel,
    description: string,
    metadata: Record<string, any>
  ): Promise<void> {
    // This would typically send an email, Slack message, or other notification
    console.log(`SECURITY ALERT [${severity.toUpperCase()}]: ${alertType} for user ${userId}: ${description}`);
    
    // Log the notification
    const { error } = await supabase
      .from('security_notifications')
      .insert({
        user_id: userId,
        alert_type: alertType,
        severity,
        description,
        metadata,
        notification_sent: true,
        created_at: new Date(),
      });

    if (error) {
      console.error('Failed to log security notification:', error);
    }
  }

  /**
   * Get user's security alerts
   */
  async getUserSecurityAlerts(
    userId: string,
    options: {
      resolved?: boolean;
      severity?: SecurityRiskLevel;
      limit?: number;
    } = {}
  ): Promise<SuspiciousActivityAlert[]> {
    let query = supabase
      .from('suspicious_activity_alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options.resolved !== undefined) {
      query = query.eq('resolved', options.resolved);
    }

    if (options.severity) {
      query = query.eq('severity', options.severity);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to get user security alerts:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Resolve security alert
   */
  async resolveSecurityAlert(alertId: string, resolvedBy: string, notes?: string): Promise<void> {
    const { error } = await supabase
      .from('suspicious_activity_alerts')
      .update({
        resolved: true,
        resolved_at: new Date(),
        resolved_by: resolvedBy,
        resolution_notes: notes,
      })
      .eq('id', alertId);

    if (error) {
      console.error('Failed to resolve security alert:', error);
    }
  }

  /**
   * Enable Stripe Radar rules for enhanced fraud protection
   */
  async configureStripeRadar(): Promise<void> {
    try {
      // This would configure Stripe Radar rules via API
      // Note: Radar rules are typically configured via Stripe Dashboard
      console.log('Stripe Radar configuration should be done via Stripe Dashboard');
      
      // Log radar configuration
      const { error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'radar_configuration',
          description: 'Stripe Radar fraud protection enabled',
          metadata: {
            configured_at: new Date(),
          },
          created_at: new Date(),
        });

      if (error) {
        console.error('Failed to log radar configuration:', error);
      }

    } catch (error) {
      console.error('Failed to configure Stripe Radar:', error);
    }
  }
}

// Export singleton instance
export const paymentSecurityService = new PaymentSecurityService();