/**
 * Alert System Usage Example
 * Demonstrates how to use the integrated alert system
 */

import { integratedAlertSystem } from './integratedAlertSystem';
import { alertingConfig } from '../config/alerting';

import { logger } from './logging';
/**
 * Example: Initialize and use the alert system
 */
export async function initializeAlertSystemExample(): Promise<void> {
  try {
    // Load configuration from environment
    const config = alertingConfig.load();
    
    // Validate configuration
    const validation = alertingConfig.validate(config);
    if (!validation.isValid) {
      logger.error("Alert system configuration errors:", validation.errors instanceof Error ? validation.errors : new Error(String(validation.errors)));
      return;
    }

    if (validation.warnings.length > 0) {
      logger.warn("Alert system configuration warnings:", { validation.warnings });
    }

    // Initialize the integrated alert system
    await integratedAlertSystem.initialize();

    // Add custom business impact rules
    integratedAlertSystem.addBusinessImpactRule('payment-processing-error', 1.0);
    integratedAlertSystem.addBusinessImpactRule('user-authentication-failure', 0.9);
    integratedAlertSystem.addBusinessImpactRule('data-export-failed', 0.6);

    // Add custom alert rule
    const customRuleId = integratedAlertSystem.addAlertRule({
      name: 'High Analysis Queue Length',
      description: 'Triggers when analysis queue has more than 100 pending items',
      condition: (metrics) => metrics.analysisQueueLength > 100,
      severity: 'warning',
      cooldownMs: 15 * 60 * 1000, // 15 minutes
      tags: ['analysis', 'queue', 'performance'],
      enabled: true
    });

    logger.info("Alert system initialized successfully", { {
      customRuleId,
      configSummary: integratedAlertSystem.getNotificationConfigSummary( })
    });

  } catch (error) {
    logger.error("Failed to initialize alert system:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Example: Check metrics and trigger alerts
 */
export async function checkSystemMetricsExample(): Promise<void> {
  // Simulate system metrics
  const metrics = {
    errorRate: 0.08, // 8% error rate - will trigger high error rate alert
    avgResponseTime: 1500, // 1.5 seconds - within normal range
    memoryUsage: 0.92, // 92% memory usage - will trigger critical memory alert
    dbConnectionFailed: false,
    serviceHealth: 'healthy',
    analysisQueueLength: 150, // Will trigger custom queue length alert
    
    // Additional context for intelligent alerting
    service: 'hallucifix-api',
    environment: 'production',
    component: 'analysis-service'
  };

  try {
    // Check metrics against all rules
    await integratedAlertSystem.checkMetrics(metrics);
    
    // Get system statistics
    const stats = integratedAlertSystem.getSystemStats();
    logger.info("Alert system stats after metrics check:", { stats });

  } catch (error) {
    logger.error("Error checking metrics:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Example: Handle alert resolution
 */
export async function handleAlertResolutionExample(): Promise<void> {
  // Get active alerts
  const activeAlerts = integratedAlertSystem.getActiveAlerts();
  
  if (activeAlerts.length > 0) {
    console.info(`Found ${activeAlerts.length} active alerts`);
    
    // Simulate resolving the first alert
    const alertToResolve = activeAlerts[0];
    integratedAlertSystem.resolveAlert(alertToResolve.id);
    
    console.info(`Resolved alert: ${alertToResolve.title}`, {
      alertId: alertToResolve.id,
      severity: alertToResolve.severity
    });
  }
}

/**
 * Example: Suppress noisy alert rule temporarily
 */
export async function suppressNoisyRuleExample(): Promise<void> {
  const rules = integratedAlertSystem.getAlertRules();
  const noisyRule = rules.find(rule => rule.name === 'High Memory Usage');
  
  if (noisyRule) {
    // Suppress for 1 hour during maintenance
    const oneHour = 60 * 60 * 1000;
    integratedAlertSystem.suppressRule(noisyRule.id, oneHour);
    
    console.info(`Suppressed rule "${noisyRule.name}" for 1 hour`);
  }
}

/**
 * Example: Monitor alert correlations
 */
export async function monitorCorrelationsExample(): Promise<void> {
  const correlations = integratedAlertSystem.getActiveCorrelations();
  
  if (correlations.length > 0) {
    console.info(`Found ${correlations.length} active alert correlations:`);
    
    correlations.forEach(correlation => {
      console.info(`Correlation ${correlation.id}:`, {
        pattern: correlation.pattern.type,
        alertCount: correlation.alerts.length,
        confidence: correlation.confidence,
        description: correlation.pattern.description
      });
    });
  }
}

/**
 * Example: Update notification configuration at runtime
 */
export async function updateNotificationConfigExample(): Promise<void> {
  // Update Slack configuration
  integratedAlertSystem.updateNotificationConfig({
    slack: {
      webhookUrl: import.meta.env.VITE_NEW_SLACK_WEBHOOK_URL || '',
      channel: '#critical-alerts',
      username: 'HalluciFix Critical Alerts'
    }
  });

  logger.info("Updated notification configuration");
}

/**
 * Example: Comprehensive alert system demo
 */
export async function runAlertSystemDemo(): Promise<void> {
  logger.info("Starting Alert System Demo...");

  // Initialize the system
  await initializeAlertSystemExample();

  // Simulate metrics checks over time
  for (let i = 0; i < 3; i++) {
    console.info(`\n--- Metrics Check ${i + 1} ---`);
    await checkSystemMetricsExample();
    
    // Wait a bit between checks
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Handle alert resolution
  logger.info("\n--- Alert Resolution ---");
  await handleAlertResolutionExample();

  // Monitor correlations
  logger.info("\n--- Correlation Monitoring ---");
  await monitorCorrelationsExample();

  // Suppress noisy rule
  logger.info("\n--- Rule Suppression ---");
  await suppressNoisyRuleExample();

  // Final statistics
  logger.info("\n--- Final Statistics ---");
  const finalStats = integratedAlertSystem.getSystemStats();
  logger.info("Final alert system statistics:", { finalStats });

  logger.info("Alert System Demo completed!");
}

// Export example functions
export const alertSystemExamples = {
  initialize: initializeAlertSystemExample,
  checkMetrics: checkSystemMetricsExample,
  handleResolution: handleAlertResolutionExample,
  suppressRule: suppressNoisyRuleExample,
  monitorCorrelations: monitorCorrelationsExample,
  updateConfig: updateNotificationConfigExample,
  runDemo: runAlertSystemDemo
};