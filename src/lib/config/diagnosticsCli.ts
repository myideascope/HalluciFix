/**
 * Configuration diagnostics CLI tool
 * Command-line interface for running configuration diagnostics and troubleshooting
 */

import { ConfigurationService } from './index.js';
import { ConfigurationDiagnosticService, ConfigurationDiagnosticReport } from './diagnostics.js';
import { ConfigurationMonitoringService } from './monitoring.js';

import { logger } from './logging';
export interface CliOptions {
  verbose?: boolean;
  format?: 'text' | 'json' | 'markdown';
  output?: string;
  category?: string;
  severity?: 'all' | 'fail' | 'warning' | 'pass';
}

/**
 * Configuration diagnostics CLI
 */
export class ConfigurationDiagnosticsCli {
  private configService: ConfigurationService;
  private diagnosticService: ConfigurationDiagnosticService;
  private monitoringService?: ConfigurationMonitoringService;

  constructor() {
    this.configService = ConfigurationService.getInstance();
    this.monitoringService = new ConfigurationMonitoringService(this.configService);
    this.diagnosticService = new ConfigurationDiagnosticService(
      this.configService, 
      this.monitoringService
    );
  }

  /**
   * Initialize and run diagnostics
   */
  async run(command: string, options: CliOptions = {}): Promise<void> {
    try {
      // Initialize configuration
      await this.configService.initialize();
      await this.monitoringService?.initialize();

      switch (command) {
        case 'check':
          await this.runDiagnostics(options);
          break;
        case 'health':
          await this.runHealthCheck(options);
          break;
        case 'validate':
          await this.runValidation(options);
          break;
        case 'troubleshoot':
          await this.runTroubleshooting(options);
          break;
        case 'report':
          await this.generateReport(options);
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      logger.error("❌ CLI Error:", error instanceof Error ? error.message : 'Unknown error' instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : new Error(String(error instanceof Error ? error.message : 'Unknown error')));
      process.exit(1);
    }
  }

  /**
   * Run configuration diagnostics
   */
  private async runDiagnostics(options: CliOptions): Promise<void> {
    logger.debug("🔍 Running configuration diagnostics...\n");

    const report = await this.diagnosticService.runDiagnostics();
    
    if (options.format === 'json') {
      this.outputJson(report, options.output);
    } else if (options.format === 'markdown') {
      this.outputMarkdown(report, options.output);
    } else {
      this.outputText(report, options);
    }
  }

  /**
   * Run health check
   */
  private async runHealthCheck(options: CliOptions): Promise<void> {
    logger.debug("🏥 Running configuration health check...\n");

    const healthReport = await this.diagnosticService.generateHealthReport();
    
    if (options.format === 'json') {
      this.outputJson(healthReport, options.output);
    } else {
      this.outputHealthText(healthReport, options);
    }
  }

  /**
   * Run validation guidance
   */
  private async runValidation(options: CliOptions): Promise<void> {
    logger.debug("✅ Generating validation guidance...\n");

    const guidance = await this.diagnosticService.generateValidationGuidance();
    
    if (options.format === 'json') {
      this.outputJson(guidance, options.output);
    } else {
      this.outputValidationText(guidance, options);
    }
  }

  /**
   * Run troubleshooting guide
   */
  private async runTroubleshooting(options: CliOptions): Promise<void> {
    logger.debug("🔧 Generating troubleshooting guide...\n");

    const report = await this.diagnosticService.runDiagnostics();
    const failedResults = Object.values(report.categories)
      .flat()
      .filter(result => result.status === 'fail');

    if (failedResults.length === 0) {
      logger.debug("✅ No issues found that require troubleshooting!");
      return;
    }

    logger.debug("🚨 Issues found that need attention:\n");
    
    failedResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.category} - ${result.name}`);
      console.log(`   Problem: ${result.message}`);
      if (result.recommendation) {
        console.log(`   Solution: ${result.recommendation}`);
      }
      if (result.documentationUrl) {
        console.log(`   Docs: ${result.documentationUrl}`);
      }
      logger.debug("");
    });

    // Show troubleshooting steps
    if (report.troubleshootingSteps.length > 0) {
      logger.debug("🔧 Troubleshooting Steps:\n");
      
      report.troubleshootingSteps.forEach((step, index) => {
        console.log(`${index + 1}. ${step.title}`);
        console.log(`   ${step.description}`);
        
        if (step.commands && step.commands.length > 0) {
          logger.debug("   Commands to run:");
          step.commands.forEach(cmd => {
            console.log(`   $ ${cmd}`);
          });
        }
        
        if (step.expectedOutput) {
          console.log(`   Expected output: ${step.expectedOutput}`);
        }
        
        if (step.troubleshootingUrl) {
          console.log(`   More info: ${step.troubleshootingUrl}`);
        }
        
        logger.debug("");
      });
    }
  }

  /**
   * Generate comprehensive report
   */
  private async generateReport(options: CliOptions): Promise<void> {
    logger.debug("📊 Generating comprehensive configuration report...\n");

    const healthReport = await this.diagnosticService.generateHealthReport();
    
    if (options.format === 'markdown') {
      this.outputComprehensiveMarkdown(healthReport, options.output);
    } else if (options.format === 'json') {
      this.outputJson(healthReport, options.output);
    } else {
      this.outputComprehensiveText(healthReport, options);
    }
  }

  /**
   * Output results as text
   */
  private outputText(report: ConfigurationDiagnosticReport, options: CliOptions): void {
    // Header
    console.log(`Configuration Diagnostic Report`);
    console.log(`Environment: ${report.environment}`);
    console.log(`Timestamp: ${report.timestamp.toISOString()}`);
    console.log(`Overall Status: ${this.getStatusEmoji(report.overallStatus)} ${report.overallStatus.toUpperCase()}`);
    logger.debug("");

    // Summary
    logger.debug("📊 Summary:");
    console.log(`  Total checks: ${report.summary.total}`);
    console.log(`  ✅ Passed: ${report.summary.passed}`);
    console.log(`  ❌ Failed: ${report.summary.failed}`);
    console.log(`  ⚠️  Warnings: ${report.summary.warnings}`);
    console.log(`  ℹ️  Info: ${report.summary.info}`);
    logger.debug("");

    // Results by category
    Object.entries(report.categories).forEach(([category, results]) => {
      if (options.category && category !== options.category) {
        return;
      }

      console.log(`📂 ${category}:`);
      
      results.forEach(result => {
        if (options.severity && options.severity !== 'all' && result.status !== options.severity) {
          return;
        }

        const statusEmoji = this.getResultStatusEmoji(result.status);
        console.log(`  ${statusEmoji} ${result.name}: ${result.message}`);
        
        if (options.verbose && result.details) {
          console.log(`     Details: ${JSON.stringify(result.details, null, 2)}`);
        }
        
        if (result.recommendation) {
          console.log(`     💡 Recommendation: ${result.recommendation}`);
        }
        
        if (result.documentationUrl) {
          console.log(`     📖 Documentation: ${result.documentationUrl}`);
        }
      });
      
      logger.debug("");
    });

    // Recommendations
    if (report.recommendations.length > 0) {
      logger.debug("💡 Recommendations:");
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
      logger.debug("");
    }
  }

  /**
   * Output health check results as text
   */
  private outputHealthText(healthReport: any, options: CliOptions): void {
    const { healthStatus, diagnosticReport } = healthReport;

    console.log(`Health Check Results`);
    console.log(`Overall Status: ${this.getStatusEmoji(healthStatus.overall)} ${healthStatus.overall.toUpperCase()}`);
    console.log(`Last Updated: ${healthStatus.lastUpdated}`);
    logger.debug("");

    logger.debug("🔍 Health Checks:");
    healthStatus.checks.forEach((check: any) => {
      const statusEmoji = this.getResultStatusEmoji(check.status);
      console.log(`  ${statusEmoji} ${check.name}: ${check.message}`);
      
      if (check.responseTime) {
        console.log(`     Response time: ${check.responseTime}ms`);
      }
      
      if (options.verbose && check.metadata) {
        console.log(`     Metadata: ${JSON.stringify(check.metadata, null, 2)}`);
      }
    });
    logger.debug("");

    logger.debug("📊 Summary:");
    console.log(`  Total: ${healthStatus.summary.total}`);
    console.log(`  ✅ Healthy: ${healthStatus.summary.healthy}`);
    console.log(`  ❌ Unhealthy: ${healthStatus.summary.unhealthy}`);
    console.log(`  ⚠️  Warnings: ${healthStatus.summary.warnings}`);
  }

  /**
   * Output validation guidance as text
   */
  private outputValidationText(guidance: any, options: CliOptions): void {
    logger.debug("Configuration Validation Guidance\n");

    if (guidance.missingVariables.length > 0) {
      logger.debug("❌ Missing Required Variables:");
      guidance.missingVariables.forEach((variable: any) => {
        console.log(`  • ${variable.variable} (${variable.description})`);
        console.log(`    Example: ${variable.example}`);
        if (variable.documentationUrl) {
          console.log(`    Docs: ${variable.documentationUrl}`);
        }
      });
      logger.debug("");
    }

    if (guidance.invalidFormats.length > 0) {
      logger.debug("⚠️  Invalid Formats:");
      guidance.invalidFormats.forEach((format: any) => {
        console.log(`  • ${format.variable}: Expected ${format.expectedFormat}`);
        console.log(`    Current: ${format.currentValue}`);
        console.log(`    Example: ${format.example}`);
      });
      logger.debug("");
    }

    if (guidance.securityIssues.length > 0) {
      logger.debug("🔒 Security Issues:");
      guidance.securityIssues.forEach((issue: any) => {
        const severityEmoji = {
          low: '🟡',
          medium: '🟠',
          high: '🔴',
          critical: '🚨'
        }[issue.severity];
        
        console.log(`  ${severityEmoji} ${issue.issue} (${issue.severity})`);
        console.log(`    ${issue.description}`);
        console.log(`    💡 ${issue.recommendation}`);
      });
      logger.debug("");
    }

    if (guidance.performanceWarnings.length > 0) {
      logger.debug("⚡ Performance Warnings:");
      guidance.performanceWarnings.forEach((warning: any) => {
        console.log(`  • ${warning.setting}: ${warning.impact}`);
        console.log(`    Current: ${warning.currentValue}`);
        console.log(`    Recommended: ${warning.recommendedValue}`);
      });
      logger.debug("");
    }

    if (guidance.missingVariables.length === 0 && 
        guidance.invalidFormats.length === 0 && 
        guidance.securityIssues.length === 0 && 
        guidance.performanceWarnings.length === 0) {
      logger.debug("✅ No validation issues found!");
    }
  }

  /**
   * Output comprehensive report as text
   */
  private outputComprehensiveText(healthReport: any, options: CliOptions): void {
    console.log('='.repeat(60));
    logger.debug("COMPREHENSIVE CONFIGURATION REPORT");
    console.log('='.repeat(60));
    logger.debug("");

    // Health status
    this.outputHealthText(healthReport, options);
    logger.debug("");

    // Diagnostic report
    this.outputText(healthReport.diagnosticReport, options);
    logger.debug("");

    // Validation guidance
    this.outputValidationText(healthReport.validationGuidance, options);
    logger.debug("");

    // Monitoring summary
    if (healthReport.monitoringSummary) {
      logger.debug("📊 Monitoring Summary:");
      const summary = healthReport.monitoringSummary;
      
      console.log(`  Load count: ${summary.metrics.loadCount}`);
      console.log(`  Error count: ${summary.metrics.errorCount}`);
      console.log(`  Last load: ${summary.metrics.lastLoadTimestamp}`);
      console.log(`  Active features: ${summary.metrics.activeFeatureFlags.join(', ')}`);
      
      if (summary.alertSummary.active > 0) {
        console.log(`  🚨 Active alerts: ${summary.alertSummary.active}`);
      }
    }
  }

  /**
   * Output as JSON
   */
  private outputJson(data: any, outputFile?: string): void {
    const json = JSON.stringify(data, null, 2);
    
    if (outputFile) {
      // In a real implementation, write to file
      console.log(`Would write JSON to: ${outputFile}`);
    }
    
    console.log(json);
  }

  /**
   * Output as Markdown
   */
  private outputMarkdown(report: ConfigurationDiagnosticReport, outputFile?: string): void {
    let markdown = `# Configuration Diagnostic Report\n\n`;
    markdown += `**Environment:** ${report.environment}\n`;
    markdown += `**Timestamp:** ${report.timestamp.toISOString()}\n`;
    markdown += `**Overall Status:** ${report.overallStatus.toUpperCase()}\n\n`;

    markdown += `## Summary\n\n`;
    markdown += `| Metric | Count |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Total checks | ${report.summary.total} |\n`;
    markdown += `| Passed | ${report.summary.passed} |\n`;
    markdown += `| Failed | ${report.summary.failed} |\n`;
    markdown += `| Warnings | ${report.summary.warnings} |\n`;
    markdown += `| Info | ${report.summary.info} |\n\n`;

    Object.entries(report.categories).forEach(([category, results]) => {
      markdown += `## ${category}\n\n`;
      
      results.forEach(result => {
        const statusIcon = {
          pass: '✅',
          fail: '❌',
          warning: '⚠️',
          info: 'ℹ️'
        }[result.status];
        
        markdown += `### ${statusIcon} ${result.name}\n\n`;
        markdown += `${result.message}\n\n`;
        
        if (result.recommendation) {
          markdown += `**Recommendation:** ${result.recommendation}\n\n`;
        }
        
        if (result.documentationUrl) {
          markdown += `**Documentation:** [Link](${result.documentationUrl})\n\n`;
        }
      });
    });

    if (report.recommendations.length > 0) {
      markdown += `## Recommendations\n\n`;
      report.recommendations.forEach((rec, index) => {
        markdown += `${index + 1}. ${rec}\n`;
      });
      markdown += '\n';
    }

    if (outputFile) {
      console.log(`Would write Markdown to: ${outputFile}`);
    }
    
    console.log(markdown);
  }

  /**
   * Output comprehensive report as Markdown
   */
  private outputComprehensiveMarkdown(healthReport: any, outputFile?: string): void {
    let markdown = `# Comprehensive Configuration Report\n\n`;
    
    // Add health status
    markdown += `## Health Status\n\n`;
    markdown += `**Overall:** ${healthReport.healthStatus.overall.toUpperCase()}\n`;
    markdown += `**Last Updated:** ${healthReport.healthStatus.lastUpdated}\n\n`;
    
    // Add diagnostic report
    const diagnosticMarkdown = this.generateMarkdownFromReport(healthReport.diagnosticReport);
    markdown += diagnosticMarkdown;
    
    if (outputFile) {
      console.log(`Would write comprehensive Markdown to: ${outputFile}`);
    }
    
    console.log(markdown);
  }

  private generateMarkdownFromReport(report: ConfigurationDiagnosticReport): string {
    // This would generate markdown from the diagnostic report
    // Implementation similar to outputMarkdown but returns string
    return `## Diagnostic Results\n\n(Diagnostic report content would go here)\n\n`;
  }

  /**
   * Show help information
   */
  private showHelp(): void {
    console.log(`
Configuration Diagnostics CLI

Usage:
  config-diagnostics <command> [options]

Commands:
  check        Run configuration diagnostics
  health       Run health checks
  validate     Generate validation guidance
  troubleshoot Show troubleshooting guide
  report       Generate comprehensive report

Options:
  --verbose    Show detailed information
  --format     Output format (text|json|markdown)
  --output     Output file path
  --category   Filter by category
  --severity   Filter by severity (all|fail|warning|pass)

Examples:
  config-diagnostics check
  config-diagnostics health --format json
  config-diagnostics validate --verbose
  config-diagnostics troubleshoot
  config-diagnostics report --format markdown --output report.md
`);
  }

  private getStatusEmoji(status: string): string {
    const emojis: { [key: string]: string } = {
      'healthy': '✅',
      'issues-found': '⚠️',
      'critical-issues': '❌',
      'unhealthy': '❌',
      'warning': '⚠️'
    };
    return emojis[status] || '❓';
  }

  private getResultStatusEmoji(status: string): string {
    const emojis: { [key: string]: string } = {
      'pass': '✅',
      'fail': '❌',
      'warning': '⚠️',
      'info': 'ℹ️'
    };
    return emojis[status] || '❓';
  }
}

/**
 * CLI entry point
 */
export async function runConfigurationDiagnosticsCli(args: string[]): Promise<void> {
  const cli = new ConfigurationDiagnosticsCli();
  
  // Parse command line arguments
  const command = args[0] || 'check';
  const options: CliOptions = {};
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[i + 1] as 'text' | 'json' | 'markdown';
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (arg === '--category' && args[i + 1]) {
      options.category = args[i + 1];
      i++;
    } else if (arg === '--severity' && args[i + 1]) {
      options.severity = args[i + 1] as 'all' | 'fail' | 'warning' | 'pass';
      i++;
    }
  }
  
  await cli.run(command, options);
}

// Export for use in scripts
export default ConfigurationDiagnosticsCli;