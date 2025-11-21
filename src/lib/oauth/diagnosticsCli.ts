/**
 * OAuth Diagnostics CLI Tool
 * Provides command-line interface for OAuth troubleshooting and diagnostics
 */

import { OAuthDiagnostics, DiagnosticResult } from './oauthDiagnostics';
import { OAuthHealthChecker } from './healthCheck';
import { OAuthStartupValidator } from './startupValidation';
import { oauthConfig } from './oauthConfig';

import { logger } from './logging';
export class OAuthDiagnosticsCLI {
  /**
   * Run comprehensive diagnostics and output results
   */
  static async runDiagnostics(): Promise<void> {
    logger.debug("🔍 Running OAuth Diagnostics...\n");

    try {
      const result = await OAuthDiagnostics.runDiagnostics();
      this.printDiagnosticResult(result);
    } catch (error) {
      logger.error("❌ Failed to run diagnostics:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run health check and output results
   */
  static async runHealthCheck(): Promise<void> {
    logger.debug("🏥 Running OAuth Health Check...\n");

    try {
      const result = await OAuthHealthChecker.performHealthCheck();
      this.printHealthCheckResult(result);
    } catch (error) {
      logger.error("❌ Failed to run health check:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run startup validation and output results
   */
  static async runStartupValidation(): Promise<void> {
    logger.info("🚀 Running OAuth Startup Validation...\n");

    try {
      const result = await OAuthStartupValidator.validateOnStartup();
      this.printStartupValidationResult(result);
    } catch (error) {
      logger.error("❌ Failed to run startup validation:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Show OAuth configuration summary
   */
  static showConfigurationSummary(): void {
    logger.debug("⚙️ OAuth Configuration Summary\n");

    try {
      const summary = oauthConfig.getConfigSummary();
      this.printConfigurationSummary(summary);
    } catch (error) {
      logger.error("❌ Failed to get configuration summary:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run all diagnostics
   */
  static async runAll(): Promise<void> {
    logger.info("🔧 Running Complete OAuth Diagnostics Suite\n");
    console.log('=' .repeat(60));

    await this.runStartupValidation();
    console.log('\n' + '=' .repeat(60));

    await this.runHealthCheck();
    console.log('\n' + '=' .repeat(60));

    await this.runDiagnostics();
    console.log('\n' + '=' .repeat(60));

    this.showConfigurationSummary();
    console.log('\n' + '=' .repeat(60));

    this.showTroubleshootingTips();
  }

  /**
   * Print diagnostic result
   */
  private static printDiagnosticResult(result: DiagnosticResult): void {
    const statusIcon = this.getStatusIcon(result.overall);
    console.log(`${statusIcon} Overall Status: ${result.overall.toUpperCase()}`);
    console.log(`📝 Summary: ${result.summary}`);
    console.log(`🕐 Timestamp: ${result.timestamp}\n`);

    logger.debug("📋 Detailed Checks:");
    result.checks.forEach((check, index) => {
      const icon = this.getCheckIcon(check.status);
      console.log(`  ${index + 1}. ${icon} ${check.name}`);
      console.log(`     ${check.message}`);
      
      if (check.details) {
        console.log(`     Details: ${check.details}`);
      }
      
      if (check.recommendation) {
        console.log(`     💡 Recommendation: ${check.recommendation}`);
      }
      
      logger.debug("");
    });
  }

  /**
   * Print health check result
   */
  private static printHealthCheckResult(result: any): void {
    const statusIcon = this.getStatusIcon(result.status);
    console.log(`${statusIcon} Health Status: ${result.status.toUpperCase()}`);
    console.log(`📝 Summary: ${result.summary}`);
    console.log(`🕐 Timestamp: ${result.timestamp}`);
    
    if (result.uptime) {
      console.log(`⏱️ Uptime: ${Math.round(result.uptime / 1000)}s\n`);
    }

    logger.debug("🔍 Health Checks:");
    
    Object.entries(result.checks).forEach(([name, check]: [string, any]) => {
      const icon = this.getCheckIcon(check.status);
      console.log(`  ${icon} ${name.charAt(0).toUpperCase() + name.slice(1)}: ${check.message}`);
      
      if (check.responseTime) {
        console.log(`     Response Time: ${check.responseTime}ms`);
      }
      
      if (check.details) {
        console.log(`     Details: ${JSON.stringify(check.details, null, 2).replace(/\n/g, '\n     ')}`);
      }
      
      logger.debug("");
    });
  }

  /**
   * Print startup validation result
   */
  private static printStartupValidationResult(result: any): void {
    const statusIcon = result.success ? '✅' : '❌';
    console.log(`${statusIcon} Startup Validation: ${result.success ? 'PASSED' : 'FAILED'}`);
    console.log(`🚀 Can Proceed: ${result.canProceed ? 'YES' : 'NO'}\n`);

    if (result.errors.length > 0) {
      logger.debug("🚨 Errors:");
      result.errors.forEach((error: string, index: number) => {
        console.log(`  ${index + 1}. ❌ ${error}`);
      });
      logger.debug("");
    }

    if (result.warnings.length > 0) {
      logger.debug("⚠️ Warnings:");
      result.warnings.forEach((warning: string, index: number) => {
        console.log(`  ${index + 1}. ⚠️ ${warning}`);
      });
      logger.debug("");
    }

    if (result.recommendations.length > 0) {
      logger.debug("💡 Recommendations:");
      result.recommendations.forEach((rec: string, index: number) => {
        console.log(`  ${index + 1}. 💡 ${rec}`);
      });
      logger.debug("");
    }
  }

  /**
   * Print configuration summary
   */
  private static printConfigurationSummary(summary: any): void {
    console.log(`🔧 Available: ${summary.available ? 'YES' : 'NO'}`);
    
    if (summary.available) {
      console.log(`✅ Valid: ${summary.valid ? 'YES' : 'NO'}`);
      
      if (summary.google) {
        logger.debug("\n📱 Google OAuth:");
        console.log(`  Client ID: ${summary.google.clientId}`);
        console.log(`  Redirect URI: ${summary.google.redirectUri}`);
        console.log(`  Scopes: ${summary.google.scopes?.join(', ')}`);
      }
      
      if (summary.services) {
        logger.debug("\n⚙️ Services:");
        console.log(`  Auto Start: ${summary.services.autoStart ? 'YES' : 'NO'}`);
        console.log(`  Refresh Interval: ${summary.services.refreshInterval}ms`);
        console.log(`  Cleanup Interval: ${summary.services.cleanupInterval}ms`);
      }
      
      if (summary.errors && summary.errors.length > 0) {
        logger.debug("\n❌ Configuration Errors:");
        summary.errors.forEach((error: string, index: number) => {
          console.log(`  ${index + 1}. ${error}`);
        });
      }
    } else {
      console.log(`❌ Reason: ${summary.reason || 'Unknown'}`);
      console.log(`🔄 Fallback to Mock: ${summary.fallbackToMock ? 'YES' : 'NO'}`);
    }
  }

  /**
   * Show troubleshooting tips
   */
  private static showTroubleshootingTips(): void {
    logger.debug("🛠️ Troubleshooting Tips\n");

    const tips = [
      {
        issue: 'OAuth not available',
        solutions: [
          'Set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
          'Ensure VITE_ENABLE_MOCK_SERVICES=false',
          'Check Google Cloud Console credentials'
        ]
      },
      {
        issue: 'Security configuration missing',
        solutions: [
          'Set OAUTH_TOKEN_ENCRYPTION_KEY (32+ characters)',
          'Set OAUTH_STATE_SECRET (16+ characters)',
          'Set OAUTH_SESSION_SECRET (16+ characters)'
        ]
      },
      {
        issue: 'Redirect URI issues',
        solutions: [
          'Use HTTPS in production',
          'Register redirect URI in Google Cloud Console',
          'Ensure VITE_GOOGLE_REDIRECT_URI matches registered URI'
        ]
      },
      {
        issue: 'Service initialization fails',
        solutions: [
          'Check all environment variables are set',
          'Verify Google Client ID/Secret format',
          'Restart application after configuration changes'
        ]
      }
    ];

    tips.forEach((tip, index) => {
      console.log(`${index + 1}. 🔍 ${tip.issue}:`);
      tip.solutions.forEach(solution => {
        console.log(`   • ${solution}`);
      });
      logger.debug("");
    });

    logger.debug("📚 For more help, check the OAuth setup documentation.");
  }

  /**
   * Get status icon
   */
  private static getStatusIcon(status: string): string {
    switch (status) {
      case 'healthy':
      case 'pass':
        return '✅';
      case 'warning':
      case 'degraded':
      case 'warn':
        return '⚠️';
      case 'error':
      case 'unhealthy':
      case 'fail':
        return '❌';
      case 'unavailable':
        return '🚫';
      default:
        return 'ℹ️';
    }
  }

  /**
   * Get check icon
   */
  private static getCheckIcon(status: string): string {
    switch (status) {
      case 'pass':
        return '✅';
      case 'warning':
      case 'warn':
        return '⚠️';
      case 'fail':
        return '❌';
      case 'info':
        return 'ℹ️';
      default:
        return '❓';
    }
  }
}

// Export convenience functions for direct use
export const runOAuthDiagnostics = () => OAuthDiagnosticsCLI.runDiagnostics();
export const runOAuthHealthCheck = () => OAuthDiagnosticsCLI.runHealthCheck();
export const runOAuthStartupValidation = () => OAuthDiagnosticsCLI.runStartupValidation();
export const showOAuthConfiguration = () => OAuthDiagnosticsCLI.showConfigurationSummary();
export const runAllOAuthDiagnostics = () => OAuthDiagnosticsCLI.runAll();

// Make available on window for browser console access
if (typeof window !== 'undefined') {
  (window as any).oauthDiagnostics = {
    runDiagnostics: runOAuthDiagnostics,
    runHealthCheck: runOAuthHealthCheck,
    runStartupValidation: runOAuthStartupValidation,
    showConfiguration: showOAuthConfiguration,
    runAll: runAllOAuthDiagnostics
  };
}