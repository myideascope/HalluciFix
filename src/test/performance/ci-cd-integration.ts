import { PerformanceTestIntegration, PerformanceTestReport } from './performance-integration';
import { PerformanceValidation, ValidationResult } from '../../lib/performanceValidation';
import { DatabaseRegressionTester } from './regression-testing';

interface CICDConfig {
  environment: 'development' | 'staging' | 'production';
  triggerEvents: ('push' | 'pull_request' | 'scheduled' | 'manual')[];
  testSuites: string[];
  validationThresholds: {
    overallScore: number;
    mandatoryOnly: boolean;
    allowRegressions: boolean;
    maxRegressionPercent: number;
  };
  notifications: {
    slack?: { webhook: string; channel: string };
    email?: { recipients: string[] };
    github?: { createIssue: boolean };
  };
  artifacts: {
    saveReports: boolean;
    retentionDays: number;
    publishDashboard: boolean;
  };
}

interface CICDResult {
  pipelineId: string;
  timestamp: Date;
  environment: string;
  triggerEvent: string;
  branch: string;
  commit: string;
  testReports: PerformanceTestReport[];
  validationResults: ValidationResult[];
  overallStatus: 'passed' | 'failed' | 'warning';
  duration: number;
  artifacts: string[];
  notifications: NotificationResult[];
}

interface NotificationResult {
  type: 'slack' | 'email' | 'github';
  sent: boolean;
  error?: string;
}

class CICDPerformanceIntegration {
  private testIntegration = new PerformanceTestIntegration();
  private validation = new PerformanceValidation();
  private regressionTester = new DatabaseRegressionTester();

  async executePipeline(config: CICDConfig, context: {
    branch: string;
    commit: string;
    triggerEvent: string;
  }): Promise<CICDResult> {
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    console.log(`Starting CI/CD performance pipeline: ${pipelineId}`);
    console.log(`Environment: ${config.environment}`);
    console.log(`Trigger: ${context.triggerEvent}`);
    console.log(`Branch: ${context.branch}`);
    console.log(`Commit: ${context.commit}`);

    const result: CICDResult = {
      pipelineId,
      timestamp: new Date(),
      environment: config.environment,
      triggerEvent: context.triggerEvent,
      branch: context.branch,
      commit: context.commit,
      testReports: [],
      validationResults: [],
      overallStatus: 'passed',
      duration: 0,
      artifacts: [],
      notifications: []
    };

    try {
      // Step 1: Run performance test suites
      console.log('Step 1: Running performance test suites...');
      const testReports = await this.runTestSuites(config.testSuites);
      result.testReports = testReports;

      // Step 2: Validate performance results
      console.log('Step 2: Validating performance results...');
      const validationResults = await this.validateResults(testReports, config);
      result.validationResults = validationResults;

      // Step 3: Check for regressions
      console.log('Step 3: Checking for performance regressions...');
      const regressionCheck = await this.checkRegressions(config, context);

      // Step 4: Determine overall status
      result.overallStatus = this.determineOverallStatus(validationResults, regressionCheck, config);

      // Step 5: Generate artifacts
      console.log('Step 4: Generating artifacts...');
      result.artifacts = await this.generateArtifacts(result, config);

      // Step 6: Send notifications
      console.log('Step 5: Sending notifications...');
      result.notifications = await this.sendNotifications(result, config);

      result.duration = Date.now() - startTime;

      console.log(`Pipeline completed: ${pipelineId} (${result.overallStatus})`);
      console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);

      return result;

    } catch (error) {
      console.error(`Pipeline failed: ${pipelineId}`, error);
      result.overallStatus = 'failed';
      result.duration = Date.now() - startTime;
      
      // Send failure notifications
      result.notifications = await this.sendFailureNotifications(result, config, error);
      
      return result;
    }
  }

  private async runTestSuites(testSuites: string[]): Promise<PerformanceTestReport[]> {
    const reports: PerformanceTestReport[] = [];

    // Run standard test suites if none specified
    if (testSuites.length === 0) {
      const standardReports = await this.testIntegration.runAllStandardSuites();
      reports.push(...standardReports);
    } else {
      // Run specific test suites
      const allSuites = this.testIntegration.getStandardTestSuites();
      
      for (const suiteName of testSuites) {
        const suite = allSuites.find(s => s.name === suiteName);
        if (suite) {
          const report = await this.testIntegration.runPerformanceTestSuite(suite);
          reports.push(report);
        } else {
          console.warn(`Test suite not found: ${suiteName}`);
        }
      }
    }

    return reports;
  }

  private async validateResults(
    testReports: PerformanceTestReport[],
    config: CICDConfig
  ): Promise<ValidationResult[]> {
    const validationResults: ValidationResult[] = [];

    for (const report of testReports) {
      // Validate load test results
      if (report.results.loadTests.length > 0) {
        const loadValidation = await this.validation.validateLoadTestResults(
          report.results.loadTests,
          {
            overallPassingScore: config.validationThresholds.overallScore,
            mandatoryCriteriaRequired: config.validationThresholds.mandatoryOnly,
            environment: config.environment
          }
        );
        validationResults.push(loadValidation);
      }

      // Validate benchmark results
      if (report.results.loadTests.length > 0) {
        // Convert load test results to benchmark format for validation
        const benchmarkResults = this.convertLoadTestsToBenchmarks(report.results.loadTests);
        const benchmarkValidation = await this.validation.validateBenchmarkResults(
          benchmarkResults,
          {
            overallPassingScore: config.validationThresholds.overallScore,
            mandatoryCriteriaRequired: config.validationThresholds.mandatoryOnly,
            environment: config.environment
          }
        );
        validationResults.push(benchmarkValidation);
      }
    }

    return validationResults;
  }

  private convertLoadTestsToBenchmarks(loadTests: any[]): any[] {
    // Convert load test results to benchmark format
    // This is a simplified conversion
    return loadTests.map(test => ({
      configName: test.testName,
      timestamp: test.startTime,
      environment: 'ci_cd',
      version: process.env.APP_VERSION || '1.0.0',
      queryResults: new Map(),
      overallMetrics: {
        totalQueries: test.totalOperations,
        totalExecutionTime: test.totalOperations * test.averageResponseTime,
        averageExecutionTime: test.averageResponseTime,
        medianExecutionTime: test.averageResponseTime,
        p95ExecutionTime: test.p95ResponseTime,
        p99ExecutionTime: test.p99ResponseTime,
        successRate: ((test.successfulOperations / test.totalOperations) * 100)
      }
    }));
  }

  private async checkRegressions(
    config: CICDConfig,
    context: { branch: string; commit: string }
  ): Promise<{ hasRegressions: boolean; regressionPercent: number }> {
    if (config.validationThresholds.allowRegressions) {
      return { hasRegressions: false, regressionPercent: 0 };
    }

    try {
      // Run regression tests against baseline
      const regressionResults = await this.regressionTester.runStandardRegressionTests();
      
      const failedRegressions = regressionResults.filter(result => !result.passed);
      const hasRegressions = failedRegressions.length > 0;
      
      // Calculate average regression percentage
      const regressionPercent = failedRegressions.length > 0
        ? failedRegressions.reduce((sum, result) => {
            return sum + Math.abs(result.comparison.overallPerformanceChange);
          }, 0) / failedRegressions.length
        : 0;

      return { hasRegressions, regressionPercent };
    } catch (error) {
      console.error('Regression check failed:', error);
      return { hasRegressions: true, regressionPercent: 100 };
    }
  }

  private determineOverallStatus(
    validationResults: ValidationResult[],
    regressionCheck: { hasRegressions: boolean; regressionPercent: number },
    config: CICDConfig
  ): 'passed' | 'failed' | 'warning' {
    // Check validation results
    const allValidationsPassed = validationResults.every(result => result.passed);
    const hasSignOffRequired = validationResults.some(result => result.signOffRequired);

    // Check regressions
    const regressionExceedsThreshold = regressionCheck.regressionPercent > config.validationThresholds.maxRegressionPercent;

    if (!allValidationsPassed || regressionExceedsThreshold) {
      return 'failed';
    } else if (hasSignOffRequired || regressionCheck.hasRegressions) {
      return 'warning';
    } else {
      return 'passed';
    }
  }

  private async generateArtifacts(result: CICDResult, config: CICDConfig): Promise<string[]> {
    const artifacts: string[] = [];

    if (!config.artifacts.saveReports) {
      return artifacts;
    }

    try {
      // Generate performance report
      const performanceReport = await this.validation.generatePerformanceReport(result.validationResults);
      const reportPath = `artifacts/performance-report-${result.pipelineId}.md`;
      
      // In a real implementation, you would save to file system or artifact storage
      console.log(`Generated performance report: ${reportPath}`);
      artifacts.push(reportPath);

      // Generate test results JSON
      const testResultsPath = `artifacts/test-results-${result.pipelineId}.json`;
      const testResultsJson = JSON.stringify({
        pipelineId: result.pipelineId,
        testReports: result.testReports,
        validationResults: result.validationResults
      }, null, 2);
      
      console.log(`Generated test results: ${testResultsPath}`);
      artifacts.push(testResultsPath);

      // Generate dashboard data if enabled
      if (config.artifacts.publishDashboard) {
        const dashboardPath = `artifacts/dashboard-data-${result.pipelineId}.json`;
        const dashboardData = this.generateDashboardData(result);
        
        console.log(`Generated dashboard data: ${dashboardPath}`);
        artifacts.push(dashboardPath);
      }

    } catch (error) {
      console.error('Failed to generate artifacts:', error);
    }

    return artifacts;
  }

  private generateDashboardData(result: CICDResult): any {
    return {
      pipelineId: result.pipelineId,
      timestamp: result.timestamp,
      status: result.overallStatus,
      duration: result.duration,
      metrics: {
        totalTests: result.testReports.reduce((sum, report) => sum + report.totalTests, 0),
        passedTests: result.testReports.reduce((sum, report) => sum + report.passedTests, 0),
        averageScore: result.validationResults.reduce((sum, vr) => sum + vr.overallScore, 0) / result.validationResults.length || 0
      },
      trends: {
        // Would include historical trend data
      }
    };
  }

  private async sendNotifications(result: CICDResult, config: CICDConfig): Promise<NotificationResult[]> {
    const notifications: NotificationResult[] = [];

    // Only send notifications for failures or warnings
    if (result.overallStatus === 'passed') {
      return notifications;
    }

    // Send Slack notification
    if (config.notifications.slack) {
      const slackResult = await this.sendSlackNotification(result, config.notifications.slack);
      notifications.push(slackResult);
    }

    // Send email notification
    if (config.notifications.email) {
      const emailResult = await this.sendEmailNotification(result, config.notifications.email);
      notifications.push(emailResult);
    }

    // Create GitHub issue
    if (config.notifications.github?.createIssue) {
      const githubResult = await this.createGitHubIssue(result);
      notifications.push(githubResult);
    }

    return notifications;
  }

  private async sendSlackNotification(
    result: CICDResult,
    slackConfig: { webhook: string; channel: string }
  ): Promise<NotificationResult> {
    try {
      const message = {
        channel: slackConfig.channel,
        text: `Performance Pipeline ${result.overallStatus.toUpperCase()}`,
        attachments: [
          {
            color: result.overallStatus === 'failed' ? 'danger' : 'warning',
            fields: [
              { title: 'Pipeline ID', value: result.pipelineId, short: true },
              { title: 'Environment', value: result.environment, short: true },
              { title: 'Branch', value: result.branch, short: true },
              { title: 'Duration', value: `${(result.duration / 1000).toFixed(1)}s`, short: true }
            ]
          }
        ]
      };

      const response = await fetch(slackConfig.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });

      return {
        type: 'slack',
        sent: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        type: 'slack',
        sent: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async sendEmailNotification(
    result: CICDResult,
    emailConfig: { recipients: string[] }
  ): Promise<NotificationResult> {
    try {
      // In a real implementation, you would use an email service
      console.log(`Email notification would be sent to: ${emailConfig.recipients.join(', ')}`);
      console.log(`Subject: Performance Pipeline ${result.overallStatus.toUpperCase()} - ${result.pipelineId}`);
      
      return {
        type: 'email',
        sent: true
      };
    } catch (error) {
      return {
        type: 'email',
        sent: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async createGitHubIssue(result: CICDResult): Promise<NotificationResult> {
    try {
      // In a real implementation, you would use GitHub API
      console.log(`GitHub issue would be created for failed pipeline: ${result.pipelineId}`);
      
      return {
        type: 'github',
        sent: true
      };
    } catch (error) {
      return {
        type: 'github',
        sent: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async sendFailureNotifications(
    result: CICDResult,
    config: CICDConfig,
    error: any
  ): Promise<NotificationResult[]> {
    const notifications: NotificationResult[] = [];

    // Send critical failure notifications to all configured channels
    if (config.notifications.slack) {
      try {
        const message = {
          channel: config.notifications.slack.channel,
          text: `🚨 CRITICAL: Performance Pipeline Failed`,
          attachments: [
            {
              color: 'danger',
              fields: [
                { title: 'Pipeline ID', value: result.pipelineId, short: true },
                { title: 'Error', value: error.message || 'Unknown error', short: false }
              ]
            }
          ]
        };

        await fetch(config.notifications.slack.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });

        notifications.push({ type: 'slack', sent: true });
      } catch (notificationError) {
        notifications.push({ 
          type: 'slack', 
          sent: false, 
          error: notificationError instanceof Error ? notificationError.message : String(notificationError)
        });
      }
    }

    return notifications;
  }

  // Utility method to create CI/CD configuration for different environments
  createEnvironmentConfig(environment: 'development' | 'staging' | 'production'): CICDConfig {
    const baseConfig: CICDConfig = {
      environment,
      triggerEvents: ['push', 'pull_request'],
      testSuites: [],
      validationThresholds: {
        overallScore: 70,
        mandatoryOnly: true,
        allowRegressions: false,
        maxRegressionPercent: 10
      },
      notifications: {},
      artifacts: {
        saveReports: true,
        retentionDays: 30,
        publishDashboard: true
      }
    };

    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          validationThresholds: {
            ...baseConfig.validationThresholds,
            overallScore: 60,
            allowRegressions: true,
            maxRegressionPercent: 20
          }
        };

      case 'staging':
        return {
          ...baseConfig,
          triggerEvents: ['push', 'scheduled'],
          validationThresholds: {
            ...baseConfig.validationThresholds,
            overallScore: 75,
            maxRegressionPercent: 5
          }
        };

      case 'production':
        return {
          ...baseConfig,
          triggerEvents: ['manual'],
          validationThresholds: {
            ...baseConfig.validationThresholds,
            overallScore: 85,
            maxRegressionPercent: 2
          },
          artifacts: {
            ...baseConfig.artifacts,
            retentionDays: 90
          }
        };

      default:
        return baseConfig;
    }
  }
}

export { CICDPerformanceIntegration, CICDConfig, CICDResult };