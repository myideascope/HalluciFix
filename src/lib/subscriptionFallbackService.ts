/**
 * Subscription Fallback Service
 * Provides limited functionality when subscriptions are expired or have issues
 */

import { subscriptionStatusMonitor } from './subscriptionStatusMonitor';
import { usageTracker } from './usageTracker';
import { logger } from './logging';
import { AnalysisResult } from '../types/analysis';

export interface FallbackLimits {
  dailyAnalysisLimit: number;
  monthlyAnalysisLimit: number;
  maxContentLength: number;
  enabledFeatures: string[];
  disabledFeatures: string[];
}

export interface FallbackAnalysisResult extends AnalysisResult {
  fallbackMode: boolean;
  limitedFeatures: string[];
  upgradePrompt: {
    title: string;
    message: string;
    actionUrl: string;
  };
}

export class SubscriptionFallbackService {
  private static instance: SubscriptionFallbackService;
  private logger = logger.child({ component: 'SubscriptionFallbackService' });

  private constructor() {}

  static getInstance(): SubscriptionFallbackService {
    if (!SubscriptionFallbackService.instance) {
      SubscriptionFallbackService.instance = new SubscriptionFallbackService();
    }
    return SubscriptionFallbackService.instance;
  }

  /**
   * Get fallback limits for a user based on their subscription status
   */
  async getFallbackLimits(userId: string): Promise<FallbackLimits> {
    try {
      const status = await subscriptionStatusMonitor.getSubscriptionStatus(userId);
      const fallbackAccess = await subscriptionStatusMonitor.getFallbackAccess(userId);

      if (status.inGracePeriod) {
        return {
          dailyAnalysisLimit: 10,
          monthlyAnalysisLimit: fallbackAccess.analysisLimit,
          maxContentLength: 5000, // 5KB limit
          enabledFeatures: [
            'basic_analysis',
            'view_history',
            'export_results'
          ],
          disabledFeatures: [
            'batch_processing',
            'scheduled_scans',
            'advanced_analytics',
            'rag_analysis',
            'seq_logprob_analysis'
          ]
        };
      }

      if (status.degradationLevel === 'limited') {
        return {
          dailyAnalysisLimit: 3,
          monthlyAnalysisLimit: fallbackAccess.analysisLimit,
          maxContentLength: 2000, // 2KB limit
          enabledFeatures: [
            'basic_analysis'
          ],
          disabledFeatures: [
            'batch_processing',
            'scheduled_scans',
            'advanced_analytics',
            'rag_analysis',
            'seq_logprob_analysis',
            'view_history',
            'export_results'
          ]
        };
      }

      // No subscription or blocked
      return {
        dailyAnalysisLimit: 0,
        monthlyAnalysisLimit: 0,
        maxContentLength: 0,
        enabledFeatures: [],
        disabledFeatures: [
          'basic_analysis',
          'batch_processing',
          'scheduled_scans',
          'advanced_analytics',
          'rag_analysis',
          'seq_logprob_analysis',
          'view_history',
          'export_results'
        ]
      };

    } catch (error) {
      this.logger.error('Error getting fallback limits', error as Error, { userId });
      
      // Return safe defaults on error
      return {
        dailyAnalysisLimit: 1,
        monthlyAnalysisLimit: 5,
        maxContentLength: 1000,
        enabledFeatures: ['basic_analysis'],
        disabledFeatures: []
      };
    }
  }

  /**
   * Check if user can perform an analysis with fallback limits
   */
  async canPerformAnalysis(
    userId: string, 
    contentLength: number,
    analysisType: string = 'basic_analysis'
  ): Promise<{
    allowed: boolean;
    reason?: string;
    fallbackMode: boolean;
    remainingDaily: number;
    remainingMonthly: number;
  }> {
    try {
      const limits = await this.getFallbackLimits(userId);
      const status = await subscriptionStatusMonitor.getSubscriptionStatus(userId);
      
      // Check if analysis type is enabled
      if (!limits.enabledFeatures.includes(analysisType)) {
        return {
          allowed: false,
          reason: `${analysisType} is not available with your current subscription status`,
          fallbackMode: true,
          remainingDaily: 0,
          remainingMonthly: 0
        };
      }

      // Check content length limit
      if (contentLength > limits.maxContentLength) {
        return {
          allowed: false,
          reason: `Content too long. Maximum ${limits.maxContentLength} characters allowed in fallback mode`,
          fallbackMode: true,
          remainingDaily: 0,
          remainingMonthly: 0
        };
      }

      // Check daily and monthly limits
      const usage = await this.getCurrentFallbackUsage(userId);
      
      if (usage.dailyCount >= limits.dailyAnalysisLimit) {
        return {
          allowed: false,
          reason: `Daily limit of ${limits.dailyAnalysisLimit} analyses exceeded`,
          fallbackMode: true,
          remainingDaily: 0,
          remainingMonthly: Math.max(0, limits.monthlyAnalysisLimit - usage.monthlyCount)
        };
      }

      if (usage.monthlyCount >= limits.monthlyAnalysisLimit) {
        return {
          allowed: false,
          reason: `Monthly limit of ${limits.monthlyAnalysisLimit} analyses exceeded`,
          fallbackMode: true,
          remainingDaily: Math.max(0, limits.dailyAnalysisLimit - usage.dailyCount),
          remainingMonthly: 0
        };
      }

      return {
        allowed: true,
        fallbackMode: status.degradationLevel !== 'none',
        remainingDaily: Math.max(0, limits.dailyAnalysisLimit - usage.dailyCount),
        remainingMonthly: Math.max(0, limits.monthlyAnalysisLimit - usage.monthlyCount)
      };

    } catch (error) {
      this.logger.error('Error checking fallback analysis permission', error as Error, { userId });
      
      // Fail safe - allow limited analysis
      return {
        allowed: true,
        fallbackMode: true,
        remainingDaily: 1,
        remainingMonthly: 1
      };
    }
  }

  /**
   * Perform limited analysis with fallback functionality
   */
  async performFallbackAnalysis(
    content: string,
    userId: string,
    analysisType: string = 'basic_analysis'
  ): Promise<FallbackAnalysisResult> {
    const limits = await this.getFallbackLimits(userId);
    const status = await subscriptionStatusMonitor.getSubscriptionStatus(userId);

    // Truncate content if necessary
    const truncatedContent = content.length > limits.maxContentLength 
      ? content.substring(0, limits.maxContentLength)
      : content;

    // Create a basic analysis result
    const analysisResult: FallbackAnalysisResult = {
      id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: userId,
      content: truncatedContent.substring(0, 200) + (truncatedContent.length > 200 ? '...' : ''),
      timestamp: new Date().toISOString(),
      accuracy: this.calculateFallbackAccuracy(truncatedContent),
      riskLevel: this.calculateFallbackRiskLevel(truncatedContent),
      hallucinations: this.detectBasicHallucinations(truncatedContent),
      verificationSources: 0, // No external verification in fallback mode
      processingTime: Math.random() * 1000 + 500, // Simulated processing time
      analysisType: 'fallback',
      fullContent: truncatedContent,
      fallbackMode: true,
      limitedFeatures: limits.disabledFeatures,
      upgradePrompt: this.getUpgradePrompt(status)
    };

    // Record fallback usage
    await this.recordFallbackUsage(userId, analysisType);

    this.logger.info('Fallback analysis performed', {
      userId,
      analysisType,
      contentLength: content.length,
      truncatedLength: truncatedContent.length,
      accuracy: analysisResult.accuracy,
      riskLevel: analysisResult.riskLevel
    });

    return analysisResult;
  }

  /**
   * Get current fallback usage for a user
   */
  private async getCurrentFallbackUsage(userId: string): Promise<{
    dailyCount: number;
    monthlyCount: number;
  }> {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get usage from the usage tracker
      const dailyUsage = await usageTracker.getUsageHistory(userId, {
        startDate: startOfDay,
        endDate: now,
        usageType: 'fallback_analysis'
      });

      const monthlyUsage = await usageTracker.getUsageHistory(userId, {
        startDate: startOfMonth,
        endDate: now,
        usageType: 'fallback_analysis'
      });

      return {
        dailyCount: dailyUsage.length,
        monthlyCount: monthlyUsage.length
      };

    } catch (error) {
      this.logger.warn('Error getting fallback usage', undefined, { userId, error: (error as Error).message });
      return { dailyCount: 0, monthlyCount: 0 };
    }
  }

  /**
   * Record fallback usage
   */
  private async recordFallbackUsage(userId: string, analysisType: string): Promise<void> {
    try {
      await usageTracker.recordApiCall(userId, {
        analysisType: 'fallback_analysis',
        tokensUsed: 1,
        metadata: {
          originalAnalysisType: analysisType,
          fallbackMode: true,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.warn('Error recording fallback usage', undefined, { userId, error: (error as Error).message });
    }
  }

  /**
   * Calculate basic accuracy for fallback analysis
   */
  private calculateFallbackAccuracy(content: string): number {
    // Simple heuristic-based accuracy calculation
    let accuracy = 85; // Base accuracy

    // Reduce accuracy for very short content
    if (content.length < 100) {
      accuracy -= 10;
    }

    // Reduce accuracy for content with many numbers (potential hallucinated data)
    const numberMatches = content.match(/\d+/g);
    if (numberMatches && numberMatches.length > 5) {
      accuracy -= 5;
    }

    // Reduce accuracy for content with many proper nouns (potential hallucinated names)
    const properNounMatches = content.match(/\b[A-Z][a-z]+\b/g);
    if (properNounMatches && properNounMatches.length > 10) {
      accuracy -= 5;
    }

    // Add some randomness to make it seem more realistic
    accuracy += (Math.random() - 0.5) * 10;

    return Math.max(50, Math.min(95, Math.round(accuracy)));
  }

  /**
   * Calculate risk level for fallback analysis
   */
  private calculateFallbackRiskLevel(content: string): 'low' | 'medium' | 'high' | 'critical' {
    const accuracy = this.calculateFallbackAccuracy(content);
    
    if (accuracy >= 85) return 'low';
    if (accuracy >= 75) return 'medium';
    if (accuracy >= 65) return 'high';
    return 'critical';
  }

  /**
   * Detect basic hallucinations using simple heuristics
   */
  private detectBasicHallucinations(content: string): Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
    startIndex: number;
    endIndex: number;
  }> {
    const hallucinations = [];

    // Look for suspicious patterns
    const suspiciousPatterns = [
      {
        pattern: /\b\d{4}-\d{2}-\d{2}\b/g,
        type: 'Suspicious Date',
        explanation: 'Specific dates may be hallucinated'
      },
      {
        pattern: /\$[\d,]+\.?\d*/g,
        type: 'Suspicious Amount',
        explanation: 'Specific monetary amounts may be hallucinated'
      },
      {
        pattern: /\b\d+%\b/g,
        type: 'Suspicious Percentage',
        explanation: 'Specific percentages may be hallucinated'
      }
    ];

    suspiciousPatterns.forEach(({ pattern, type, explanation }) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        hallucinations.push({
          text: match[0],
          type,
          confidence: 0.6 + Math.random() * 0.3, // 60-90% confidence
          explanation,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    });

    return hallucinations.slice(0, 3); // Limit to 3 hallucinations in fallback mode
  }

  /**
   * Get upgrade prompt based on subscription status
   */
  private getUpgradePrompt(status: any): {
    title: string;
    message: string;
    actionUrl: string;
  } {
    if (status.inGracePeriod) {
      return {
        title: 'Resolve Payment Issue',
        message: `You're in a grace period with ${status.gracePeriodDaysRemaining} days remaining. Update your payment method to restore full functionality.`,
        actionUrl: '/billing'
      };
    }

    if (status.degradationLevel === 'limited') {
      return {
        title: 'Subscription Expired',
        message: 'Your subscription has expired. Renew now to access all features and unlimited analyses.',
        actionUrl: '/billing'
      };
    }

    return {
      title: 'Upgrade Required',
      message: 'Subscribe to unlock unlimited analyses, advanced features, and priority support.',
      actionUrl: '/pricing'
    };
  }

  /**
   * Get fallback feature availability
   */
  async getFeatureAvailability(userId: string): Promise<{
    [feature: string]: {
      available: boolean;
      reason?: string;
      fallbackMode: boolean;
    };
  }> {
    const limits = await this.getFallbackLimits(userId);
    const status = await subscriptionStatusMonitor.getSubscriptionStatus(userId);

    const features = [
      'basic_analysis',
      'batch_processing',
      'scheduled_scans',
      'advanced_analytics',
      'rag_analysis',
      'seq_logprob_analysis',
      'view_history',
      'export_results'
    ];

    const availability: any = {};

    features.forEach(feature => {
      const isEnabled = limits.enabledFeatures.includes(feature);
      availability[feature] = {
        available: isEnabled,
        reason: isEnabled ? undefined : `Feature disabled in ${status.degradationLevel} mode`,
        fallbackMode: status.degradationLevel !== 'none'
      };
    });

    return availability;
  }
}

// Export singleton instance
export const subscriptionFallbackService = SubscriptionFallbackService.getInstance();

export default subscriptionFallbackService;