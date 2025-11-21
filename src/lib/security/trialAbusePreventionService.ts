/**
 * Trial Abuse Prevention Service
 * Implements comprehensive trial abuse detection and prevention measures
 */

import { createHash } from 'crypto';
import { supabase } from '../supabase';
import { paymentSecurityService } from './paymentSecurity';

import { logger } from './logging';
// Trial eligibility result
export interface TrialEligibilityResult {
  eligible: boolean;
  reasons: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  abuseFlags: string[];
  recommendedAction: 'allow' | 'require_verification' | 'deny';
  cooldownPeriod?: number; // days
}

// Device fingerprint data
export interface DeviceFingerprint {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  cookiesEnabled: boolean;
  doNotTrack: boolean;
  plugins: string[];
  canvas?: string;
  webgl?: string;
  audioContext?: string;
}

// Trial tracking data
export interface TrialTrackingData {
  userId: string;
  email: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  userAgent?: string;
  referrer?: string;
  utmSource?: string;
  metadata?: Record<string, any>;
}

export class TrialAbusePreventionService {
  // Trial abuse detection thresholds
  private readonly ABUSE_THRESHOLDS = {
    // Maximum trials per email hash in 30 days
    MAX_EMAIL_TRIALS: 1,
    // Maximum trials per IP in 7 days
    MAX_IP_TRIALS: 3,
    // Maximum trials per device fingerprint in 7 days
    MAX_DEVICE_TRIALS: 2,
    // Maximum trials per user agent in 24 hours
    MAX_USER_AGENT_TRIALS: 5,
    // Minimum account age before trial (hours)
    MIN_ACCOUNT_AGE_HOURS: 1,
    // Cooldown period after abuse detection (days)
    ABUSE_COOLDOWN_DAYS: 30,
  };

  /**
   * Check if user is eligible for trial
   */
  async checkTrialEligibility(
    userId: string,
    email: string,
    ipAddress?: string,
    deviceFingerprint?: string,
    userAgent?: string
  ): Promise<TrialEligibilityResult> {
    const result: TrialEligibilityResult = {
      eligible: true,
      reasons: [],
      riskLevel: 'low',
      abuseFlags: [],
      recommendedAction: 'allow',
    };

    try {
      // Hash email for privacy
      const emailHash = this.hashEmail(email);

      // Check existing trial usage
      await this.checkExistingTrials(result, userId, emailHash);

      // Check IP-based abuse patterns
      if (ipAddress) {
        await this.checkIPAbusePatterns(result, ipAddress);
      }

      // Check device fingerprint abuse patterns
      if (deviceFingerprint) {
        await this.checkDeviceAbusePatterns(result, deviceFingerprint);
      }

      // Check user agent patterns
      if (userAgent) {
        await this.checkUserAgentPatterns(result, userAgent);
      }

      // Check account age
      await this.checkAccountAge(result, userId);

      // Check for suspicious patterns
      await this.checkSuspiciousPatterns(result, {
        userId,
        email,
        ipAddress,
        deviceFingerprint,
        userAgent,
      });

      // Determine final eligibility and action
      this.determineFinalEligibility(result);

      // Log eligibility check
      await this.logEligibilityCheck(userId, emailHash, result, {
        ipAddress,
        deviceFingerprint,
        userAgent,
      });

      return result;

    } catch (error) {
      logger.error("Trial eligibility check failed:", error instanceof Error ? error : new Error(String(error)));
      
      // Return restrictive result on error
      return {
        eligible: false,
        reasons: ['System error during eligibility check'],
        riskLevel: 'high',
        abuseFlags: ['system_error'],
        recommendedAction: 'require_verification',
      };
    }
  }

  /**
   * Start trial tracking
   */
  async startTrialTracking(data: TrialTrackingData): Promise<void> {
    const emailHash = this.hashEmail(data.email);
    
    // Detect abuse flags
    const abuseFlags = await this.detectAbuseFlags(
      emailHash,
      data.ipAddress,
      data.deviceFingerprint
    );

    // Record trial start
    const { error } = await supabase
      .from('trial_tracking')
      .insert({
        user_id: data.userId,
        email_hash: emailHash,
        ip_address: data.ipAddress,
        device_fingerprint: data.deviceFingerprint,
        trial_started_at: new Date(),
        abuse_flags: abuseFlags,
        metadata: {
          user_agent: data.userAgent,
          referrer: data.referrer,
          utm_source: data.utmSource,
          ...data.metadata,
        },
      });

    if (error) {
      logger.error("Failed to start trial tracking:", error instanceof Error ? error : new Error(String(error)));
    }

    // Record device if not already tracked
    if (data.deviceFingerprint) {
      await this.recordDevice(data.userId, data.deviceFingerprint, data.userAgent);
    }

    // Record security event
    await paymentSecurityService.recordSecurityEvent(
      data.userId,
      'trial_started',
      {
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        deviceFingerprint: data.deviceFingerprint,
        abuseFlags,
      }
    );
  }

  /**
   * End trial tracking
   */
  async endTrialTracking(
    userId: string,
    converted: boolean,
    reason?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('trial_tracking')
      .update({
        trial_ended_at: new Date(),
        trial_converted: converted,
        metadata: supabase.rpc('jsonb_set', {
          target: supabase.raw('metadata'),
          path: '{end_reason}',
          new_value: JSON.stringify(reason || 'trial_expired'),
        }),
      })
      .eq('user_id', userId)
      .is('trial_ended_at', null);

    if (error) {
      logger.error("Failed to end trial tracking:", error instanceof Error ? error : new Error(String(error)));
    }

    // Record security event
    await paymentSecurityService.recordSecurityEvent(
      userId,
      converted ? 'trial_converted' : 'trial_ended',
      { reason }
    );
  }

  /**
   * Generate device fingerprint from browser data
   */
  generateDeviceFingerprint(data: DeviceFingerprint): string {
    const components = [
      data.userAgent,
      data.screenResolution,
      data.timezone,
      data.language,
      data.platform,
      data.cookiesEnabled.toString(),
      data.doNotTrack.toString(),
      data.plugins.sort().join(','),
      data.canvas || '',
      data.webgl || '',
      data.audioContext || '',
    ];

    const fingerprint = components.join('|');
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  /**
   * Check existing trials for user
   */
  private async checkExistingTrials(
    result: TrialEligibilityResult,
    userId: string,
    emailHash: string
  ): Promise<void> {
    // Check if user already has an active subscription
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('status')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .limit(1);

    if (subscription && subscription.length > 0) {
      result.eligible = false;
      result.reasons.push('User already has active subscription');
      result.abuseFlags.push('existing_subscription');
      return;
    }

    // Check for previous trials by email hash
    const { data: emailTrials } = await supabase
      .from('trial_tracking')
      .select('trial_started_at, trial_converted')
      .eq('email_hash', emailHash)
      .gte('trial_started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (emailTrials && emailTrials.length >= this.ABUSE_THRESHOLDS.MAX_EMAIL_TRIALS) {
      result.eligible = false;
      result.reasons.push(`Email has already used ${emailTrials.length} trial(s) in last 30 days`);
      result.abuseFlags.push('multiple_email_trials');
      result.riskLevel = 'high';
    }

    // Check for previous trials by user ID
    const { data: userTrials } = await supabase
      .from('trial_tracking')
      .select('trial_started_at')
      .eq('user_id', userId);

    if (userTrials && userTrials.length > 0) {
      result.eligible = false;
      result.reasons.push('User has already used a trial');
      result.abuseFlags.push('previous_trial');
    }
  }

  /**
   * Check IP-based abuse patterns
   */
  private async checkIPAbusePatterns(
    result: TrialEligibilityResult,
    ipAddress: string
  ): Promise<void> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data: ipTrials } = await supabase
      .from('trial_tracking')
      .select('user_id')
      .eq('ip_address', ipAddress)
      .gte('trial_started_at', since.toISOString());

    if (ipTrials && ipTrials.length >= this.ABUSE_THRESHOLDS.MAX_IP_TRIALS) {
      result.eligible = false;
      result.reasons.push(`IP address has ${ipTrials.length} trials in last 7 days`);
      result.abuseFlags.push('multiple_ip_trials');
      result.riskLevel = 'high';
    }

    // Check for suspicious IP patterns
    const uniqueUsers = new Set(ipTrials?.map(t => t.user_id) || []).size;
    if (uniqueUsers >= 3) {
      result.riskLevel = 'medium';
      result.reasons.push(`IP address used by ${uniqueUsers} different users`);
      result.abuseFlags.push('shared_ip_address');
    }
  }

  /**
   * Check device fingerprint abuse patterns
   */
  private async checkDeviceAbusePatterns(
    result: TrialEligibilityResult,
    deviceFingerprint: string
  ): Promise<void> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data: deviceTrials } = await supabase
      .from('trial_tracking')
      .select('user_id')
      .eq('device_fingerprint', deviceFingerprint)
      .gte('trial_started_at', since.toISOString());

    if (deviceTrials && deviceTrials.length >= this.ABUSE_THRESHOLDS.MAX_DEVICE_TRIALS) {
      result.eligible = false;
      result.reasons.push(`Device has ${deviceTrials.length} trials in last 7 days`);
      result.abuseFlags.push('multiple_device_trials');
      result.riskLevel = 'high';
    }

    // Check for device sharing patterns
    const uniqueUsers = new Set(deviceTrials?.map(t => t.user_id) || []).size;
    if (uniqueUsers >= 2) {
      result.riskLevel = 'medium';
      result.reasons.push(`Device fingerprint used by ${uniqueUsers} different users`);
      result.abuseFlags.push('shared_device');
    }
  }

  /**
   * Check user agent patterns
   */
  private async checkUserAgentPatterns(
    result: TrialEligibilityResult,
    userAgent: string
  ): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { count } = await supabase
      .from('trial_tracking')
      .select('*', { count: 'exact', head: true })
      .eq('metadata->>user_agent', userAgent)
      .gte('trial_started_at', since.toISOString());

    if (count && count >= this.ABUSE_THRESHOLDS.MAX_USER_AGENT_TRIALS) {
      result.riskLevel = 'medium';
      result.reasons.push(`User agent has ${count} trials in last 24 hours`);
      result.abuseFlags.push('suspicious_user_agent');
    }

    // Check for bot-like user agents
    if (this.isSuspiciousUserAgent(userAgent)) {
      result.riskLevel = 'high';
      result.reasons.push('Suspicious or bot-like user agent detected');
      result.abuseFlags.push('bot_user_agent');
    }
  }

  /**
   * Check account age
   */
  private async checkAccountAge(
    result: TrialEligibilityResult,
    userId: string
  ): Promise<void> {
    const { data: user } = await supabase
      .from('users')
      .select('created_at')
      .eq('id', userId)
      .single();

    if (user) {
      const accountAge = Date.now() - new Date(user.created_at).getTime();
      const ageHours = accountAge / (60 * 60 * 1000);

      if (ageHours < this.ABUSE_THRESHOLDS.MIN_ACCOUNT_AGE_HOURS) {
        result.riskLevel = 'medium';
        result.reasons.push(`Account created ${Math.round(ageHours * 60)} minutes ago`);
        result.abuseFlags.push('new_account');
      }
    }
  }

  /**
   * Check for suspicious patterns
   */
  private async checkSuspiciousPatterns(
    result: TrialEligibilityResult,
    data: {
      userId: string;
      email: string;
      ipAddress?: string;
      deviceFingerprint?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    // Check for disposable email domains
    if (this.isDisposableEmail(data.email)) {
      result.riskLevel = 'high';
      result.reasons.push('Disposable email address detected');
      result.abuseFlags.push('disposable_email');
    }

    // Check for suspicious email patterns
    if (this.isSuspiciousEmail(data.email)) {
      result.riskLevel = 'medium';
      result.reasons.push('Suspicious email pattern detected');
      result.abuseFlags.push('suspicious_email');
    }

    // Check for existing security alerts
    const { data: alerts } = await supabase
      .from('suspicious_activity_alerts')
      .select('alert_type, severity')
      .eq('user_id', data.userId)
      .eq('resolved', false);

    if (alerts && alerts.length > 0) {
      const highSeverityAlerts = alerts.filter(a => a.severity === 'high' || a.severity === 'critical');
      if (highSeverityAlerts.length > 0) {
        result.eligible = false;
        result.reasons.push('User has unresolved security alerts');
        result.abuseFlags.push('security_alerts');
        result.riskLevel = 'critical';
      }
    }
  }

  /**
   * Determine final eligibility and recommended action
   */
  private determineFinalEligibility(result: TrialEligibilityResult): void {
    // Set cooldown period for abuse cases
    if (result.abuseFlags.length > 0) {
      result.cooldownPeriod = this.ABUSE_THRESHOLDS.ABUSE_COOLDOWN_DAYS;
    }

    // Determine recommended action based on risk level and flags
    if (result.riskLevel === 'critical' || result.abuseFlags.includes('multiple_email_trials')) {
      result.eligible = false;
      result.recommendedAction = 'deny';
    } else if (result.riskLevel === 'high' || result.abuseFlags.length >= 2) {
      result.eligible = false;
      result.recommendedAction = 'require_verification';
    } else if (result.riskLevel === 'medium' || result.abuseFlags.length === 1) {
      result.recommendedAction = 'require_verification';
    } else {
      result.recommendedAction = 'allow';
    }

    // Override eligibility based on recommended action
    if (result.recommendedAction === 'deny') {
      result.eligible = false;
    }
  }

  /**
   * Detect abuse flags using database function
   */
  private async detectAbuseFlags(
    emailHash: string,
    ipAddress?: string,
    deviceFingerprint?: string
  ): Promise<string[]> {
    const { data, error } = await supabase
      .rpc('detect_trial_abuse', {
        p_email_hash: emailHash,
        p_ip_address: ipAddress,
        p_device_fingerprint: deviceFingerprint,
      });

    if (error) {
      logger.error("Failed to detect abuse flags:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }

    return data || [];
  }

  /**
   * Hash email for privacy-preserving tracking
   */
  private hashEmail(email: string): string {
    const normalizedEmail = email.toLowerCase().trim();
    return createHash('sha256').update(normalizedEmail).digest('hex');
  }

  /**
   * Record device for tracking
   */
  private async recordDevice(
    userId: string,
    deviceFingerprint: string,
    userAgent?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('user_devices')
      .upsert({
        user_id: userId,
        device_fingerprint: deviceFingerprint,
        device_info: {
          user_agent: userAgent,
          first_seen: new Date(),
        },
        last_seen: new Date(),
      }, {
        onConflict: 'user_id,device_fingerprint',
      });

    if (error) {
      logger.error("Failed to record device:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check if user agent is suspicious or bot-like
   */
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
      /^$/,
      /test/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Check if email is from a disposable email service
   */
  private isDisposableEmail(email: string): boolean {
    const disposableDomains = [
      '10minutemail.com',
      'tempmail.org',
      'guerrillamail.com',
      'mailinator.com',
      'yopmail.com',
      'temp-mail.org',
      'throwaway.email',
      'getnada.com',
      'maildrop.cc',
      'sharklasers.com',
    ];

    const domain = email.split('@')[1]?.toLowerCase();
    return domain ? disposableDomains.includes(domain) : false;
  }

  /**
   * Check if email has suspicious patterns
   */
  private isSuspiciousEmail(email: string): boolean {
    const suspiciousPatterns = [
      /\+.*\+/,  // Multiple plus signs
      /\.{2,}/,  // Multiple consecutive dots
      /^[a-z]{1,3}[0-9]{5,}@/,  // Short letters followed by many numbers
      /^[0-9]+@/,  // Starts with only numbers
      /test.*test/i,  // Contains "test" multiple times
    ];

    return suspiciousPatterns.some(pattern => pattern.test(email));
  }

  /**
   * Log eligibility check for audit purposes
   */
  private async logEligibilityCheck(
    userId: string,
    emailHash: string,
    result: TrialEligibilityResult,
    metadata: Record<string, any>
  ): Promise<void> {
    const { error } = await supabase
      .from('trial_eligibility_logs')
      .insert({
        user_id: userId,
        email_hash: emailHash,
        eligible: result.eligible,
        risk_level: result.riskLevel,
        abuse_flags: result.abuseFlags,
        reasons: result.reasons,
        recommended_action: result.recommendedAction,
        cooldown_period: result.cooldownPeriod,
        metadata,
        created_at: new Date(),
      });

    if (error) {
      logger.error("Failed to log eligibility check:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get trial abuse statistics for monitoring
   */
  async getTrialAbuseStats(timeframe: 'day' | 'week' | 'month' = 'week'): Promise<{
    totalTrials: number;
    abuseAttempts: number;
    abuseRate: number;
    topAbuseFlags: Array<{ flag: string; count: number }>;
    conversionRate: number;
  }> {
    const days = timeframe === 'day' ? 1 : timeframe === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get total trials
    const { count: totalTrials } = await supabase
      .from('trial_tracking')
      .select('*', { count: 'exact', head: true })
      .gte('trial_started_at', since.toISOString());

    // Get abuse attempts (trials with abuse flags)
    const { count: abuseAttempts } = await supabase
      .from('trial_tracking')
      .select('*', { count: 'exact', head: true })
      .gte('trial_started_at', since.toISOString())
      .neq('abuse_flags', '{}');

    // Get conversions
    const { count: conversions } = await supabase
      .from('trial_tracking')
      .select('*', { count: 'exact', head: true })
      .gte('trial_started_at', since.toISOString())
      .eq('trial_converted', true);

    // Calculate rates
    const abuseRate = totalTrials ? (abuseAttempts || 0) / totalTrials : 0;
    const conversionRate = totalTrials ? (conversions || 0) / totalTrials : 0;

    // Get top abuse flags (this would need a more complex query in practice)
    const topAbuseFlags = [
      { flag: 'multiple_email_trials', count: 0 },
      { flag: 'multiple_ip_trials', count: 0 },
      { flag: 'multiple_device_trials', count: 0 },
    ];

    return {
      totalTrials: totalTrials || 0,
      abuseAttempts: abuseAttempts || 0,
      abuseRate,
      topAbuseFlags,
      conversionRate,
    };
  }

  /**
   * Report suspected trial abuse
   */
  async reportTrialAbuse(
    userId: string,
    reportedBy: string,
    reason: string,
    evidence?: Record<string, any>
  ): Promise<void> {
    // Create suspicious activity alert
    await paymentSecurityService.createSuspiciousActivityAlert(
      userId,
      'unusual_pattern',
      'high',
      `Trial abuse reported: ${reason}`,
      {
        reported_by: reportedBy,
        evidence,
        report_type: 'trial_abuse',
      }
    );

    // Log the report
    const { error } = await supabase
      .from('abuse_reports')
      .insert({
        user_id: userId,
        report_type: 'trial_abuse',
        reported_by: reportedBy,
        reason,
        evidence,
        status: 'pending',
        created_at: new Date(),
      });

    if (error) {
      logger.error("Failed to log abuse report:", error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// Export singleton instance
export const trialAbusePreventionService = new TrialAbusePreventionService();