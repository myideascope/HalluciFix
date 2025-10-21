/**
 * Test Notification Service
 * Handles notifications for test results, failures, and performance metrics
 */

export interface TestResult {
  id: string;
  workflow_id: string;
  commit_sha: string;
  branch: string;
  trigger_event: 'push' | 'pull_request' | 'schedule' | 'manual';
  status: 'running' | 'success' | 'failure' | 'cancelled';
  test_suites: TestSuiteResult[];
  coverage_data: CoverageData;
  performance_metrics: PerformanceMetrics;
  start_time: Date;
  end_time?: Date;
  duration?: number;
}

export interface TestSuiteResult {
  name: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  status: 'passed' | 'failed' | 'skipped';
  tests_passed: number;
  tests_failed: number;
  tests_skipped: number;
  duration: number;
  failures?: TestFailure[];
}

export interface TestFailure {
  test_name: string;
  error_message: string;
  stack_trace?: string;
  file_path: string;
  line_number?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CoverageData {
  global: CoverageMetrics;
  by_module: Record<string, CoverageMetrics>;
  regression_detected: boolean;
  previous_coverage?: number;
}

export interface CoverageMetrics {
  lines: { covered: number; total: number; percentage: number };
  functions: { covered: number; total: number; percentage: number };
  branches: { covered: number; total: number; percentage: number };
  statements: { covered: number; total: number; percentage: number };
}

export interface PerformanceMetrics {
  test_execution_time: number;
  bundle_size?: BundleMetrics;
  web_vitals?: WebVitalsMetrics;
  regression_alerts: RegressionAlert[];
}

export interface BundleMetrics {
  total_size: number;
  gzipped_size: number;
  change_from_baseline: number;
  change_percentage: number;
}

export interface WebVitalsMetrics {
  first_contentful_paint: number;
  largest_contentful_paint: number;
  cumulative_layout_shift: number;
  first_input_delay: number;
}

export interface RegressionAlert {
  type: 'performance' | 'coverage' | 'bundle_size';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  current_value: number;
  baseline_value: number;
  threshold_exceeded: number;
}

export interface SlackNotificationConfig {
  webhook_url: string;
  channels: {
    failures: string;
    reports: string;
    performance: string;
  };
  enabled: boolean;
}

export interface GitHubNotificationConfig {
  token: string;
  repository: string;
  enabled: boolean;
}

export interface NotificationTemplate {
  type: 'test_failure' | 'coverage_regression' | 'performance_regression' | 'daily_report' | 'weekly_report';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title_template: string;
  message_template: string;
  slack_template?: SlackMessageTemplate;
  github_template?: GitHubCommentTemplate;
}

export interface SlackMessageTemplate {
  color: string;
  emoji: string;
  fields: SlackField[];
}

export interface SlackField {
  title: string;
  value: string;
  short: boolean;
}

export interface GitHubCommentTemplate {
  header: string;
  sections: GitHubSection[];
  footer: string;
}

export interface GitHubSection {
  title: string;
  content: string;
  collapsible?: boolean;
}

export class TestNotificationService {
  private slackConfig: SlackNotificationConfig;
  private githubConfig: GitHubNotificationConfig;
  private templates: Map<string, NotificationTemplate>;

  constructor(
    slackConfig: SlackNotificationConfig,
    githubConfig: GitHubNotificationConfig
  ) {
    this.slackConfig = slackConfig;
    this.githubConfig = githubConfig;
    this.templates = new Map();
    this.initializeTemplates();
  }

  /**
   * Send test result notification to appropriate channels
   */
  async sendTestResultNotification(testResult: TestResult): Promise<void> {
    const notifications = this.determineNotifications(testResult);

    for (const notification of notifications) {
      try {
        if (notification.channel === 'slack' && this.slackConfig.enabled) {
          await this.sendSlackNotification(testResult, notification);
        } else if (notification.channel === 'github' && this.githubConfig.enabled) {
          await this.sendGitHubComment(testResult, notification);
        }
      } catch (error) {
        console.error(`Failed to send ${notification.channel} notification:`, error);
      }
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    testResult: TestResult,
    notification: { type: string; severity: string; channel: string }
  ): Promise<void> {
    const template = this.templates.get(`${notification.type}_${notification.severity}`);
    if (!template?.slack_template) return;

    const slackMessage = this.buildSlackMessage(testResult, template);
    const channel = this.getSlackChannel(notification.type);

    const response = await fetch(this.slackConfig.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        ...slackMessage,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  /**
   * Send GitHub PR comment
   */
  private async sendGitHubComment(
    testResult: TestResult,
    notification: { type: string; severity: string; channel: string }
  ): Promise<void> {
    if (testResult.trigger_event !== 'pull_request') return;

    const template = this.templates.get(`${notification.type}_${notification.severity}`);
    if (!template?.github_template) return;

    const comment = this.buildGitHubComment(testResult, template);
    
    // Extract PR number from workflow context (would be passed in real implementation)
    const prNumber = this.extractPRNumber(testResult);
    if (!prNumber) return;

    const response = await fetch(
      `https://api.github.com/repos/${this.githubConfig.repository}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.githubConfig.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: comment,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub comment failed: ${response.statusText}`);
    }
  }

  /**
   * Determine which notifications to send based on test results
   */
  private determineNotifications(testResult: TestResult): Array<{
    type: string;
    severity: string;
    channel: string;
  }> {
    const notifications: Array<{ type: string; severity: string; channel: string }> = [];

    // Test failures
    if (testResult.status === 'failure') {
      const severity = this.calculateFailureSeverity(testResult);
      notifications.push(
        { type: 'test_failure', severity, channel: 'slack' },
        { type: 'test_failure', severity, channel: 'github' }
      );
    }

    // Coverage regression
    if (testResult.coverage_data.regression_detected) {
      const severity = this.calculateCoverageSeverity(testResult.coverage_data);
      notifications.push(
        { type: 'coverage_regression', severity, channel: 'slack' },
        { type: 'coverage_regression', severity, channel: 'github' }
      );
    }

    // Performance regression
    if (testResult.performance_metrics.regression_alerts.length > 0) {
      const severity = this.calculatePerformanceSeverity(testResult.performance_metrics);
      notifications.push(
        { type: 'performance_regression', severity, channel: 'slack' },
        { type: 'performance_regression', severity, channel: 'github' }
      );
    }

    return notifications;
  }

  /**
   * Calculate failure severity based on test results
   */
  private calculateFailureSeverity(testResult: TestResult): string {
    const totalFailures = testResult.test_suites.reduce(
      (sum, suite) => sum + suite.tests_failed,
      0
    );
    const criticalFailures = testResult.test_suites
      .flatMap(suite => suite.failures || [])
      .filter(failure => failure.severity === 'critical').length;

    if (criticalFailures > 0) return 'critical';
    if (totalFailures > 10) return 'high';
    if (totalFailures > 3) return 'medium';
    return 'low';
  }

  /**
   * Calculate coverage severity based on regression
   */
  private calculateCoverageSeverity(coverageData: CoverageData): string {
    const currentCoverage = coverageData.global.lines.percentage;
    const previousCoverage = coverageData.previous_coverage || 0;
    const regression = previousCoverage - currentCoverage;

    if (regression > 10) return 'critical';
    if (regression > 5) return 'high';
    if (regression > 2) return 'medium';
    return 'low';
  }

  /**
   * Calculate performance severity based on regressions
   */
  private calculatePerformanceSeverity(performanceMetrics: PerformanceMetrics): string {
    const criticalAlerts = performanceMetrics.regression_alerts.filter(
      alert => alert.severity === 'critical'
    ).length;
    const highAlerts = performanceMetrics.regression_alerts.filter(
      alert => alert.severity === 'high'
    ).length;

    if (criticalAlerts > 0) return 'critical';
    if (highAlerts > 0) return 'high';
    if (performanceMetrics.regression_alerts.length > 2) return 'medium';
    return 'low';
  }

  /**
   * Build Slack message from template
   */
  private buildSlackMessage(testResult: TestResult, template: NotificationTemplate): any {
    const slackTemplate = template.slack_template!;
    
    return {
      attachments: [{
        color: slackTemplate.color,
        title: this.interpolateTemplate(template.title_template, testResult),
        text: this.interpolateTemplate(template.message_template, testResult),
        fields: slackTemplate.fields.map(field => ({
          title: field.title,
          value: this.interpolateTemplate(field.value, testResult),
          short: field.short,
        })),
        footer: `Test Run ${testResult.id}`,
        ts: Math.floor(testResult.start_time.getTime() / 1000),
      }],
    };
  }

  /**
   * Build GitHub comment from template
   */
  private buildGitHubComment(testResult: TestResult, template: NotificationTemplate): string {
    const githubTemplate = template.github_template!;
    
    let comment = this.interpolateTemplate(githubTemplate.header, testResult) + '\n\n';
    
    for (const section of githubTemplate.sections) {
      if (section.collapsible) {
        comment += `<details>\n<summary>${section.title}</summary>\n\n`;
        comment += this.interpolateTemplate(section.content, testResult);
        comment += '\n</details>\n\n';
      } else {
        comment += `## ${section.title}\n\n`;
        comment += this.interpolateTemplate(section.content, testResult) + '\n\n';
      }
    }
    
    comment += this.interpolateTemplate(githubTemplate.footer, testResult);
    
    return comment;
  }

  /**
   * Interpolate template variables with test result data
   */
  private interpolateTemplate(template: string, testResult: TestResult): string {
    return template
      .replace(/\{\{commit_sha\}\}/g, testResult.commit_sha.substring(0, 7))
      .replace(/\{\{branch\}\}/g, testResult.branch)
      .replace(/\{\{status\}\}/g, testResult.status)
      .replace(/\{\{duration\}\}/g, this.formatDuration(testResult.duration || 0))
      .replace(/\{\{coverage\}\}/g, testResult.coverage_data.global.lines.percentage.toFixed(1))
      .replace(/\{\{failed_tests\}\}/g, this.getTotalFailedTests(testResult).toString())
      .replace(/\{\{total_tests\}\}/g, this.getTotalTests(testResult).toString())
      .replace(/\{\{workflow_url\}\}/g, this.getWorkflowUrl(testResult));
  }

  /**
   * Get appropriate Slack channel for notification type
   */
  private getSlackChannel(notificationType: string): string {
    switch (notificationType) {
      case 'test_failure':
        return this.slackConfig.channels.failures;
      case 'performance_regression':
        return this.slackConfig.channels.performance;
      default:
        return this.slackConfig.channels.reports;
    }
  }

  /**
   * Extract PR number from test result (implementation depends on workflow context)
   */
  private extractPRNumber(testResult: TestResult): number | null {
    // This would be implemented based on how PR number is passed to the service
    // For now, return null as placeholder
    return null;
  }

  /**
   * Helper methods
   */
  private getTotalFailedTests(testResult: TestResult): number {
    return testResult.test_suites.reduce((sum, suite) => sum + suite.tests_failed, 0);
  }

  private getTotalTests(testResult: TestResult): number {
    return testResult.test_suites.reduce(
      (sum, suite) => sum + suite.tests_passed + suite.tests_failed + suite.tests_skipped,
      0
    );
  }

  private formatDuration(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  private getWorkflowUrl(testResult: TestResult): string {
    return `https://github.com/${this.githubConfig.repository}/actions/runs/${testResult.workflow_id}`;
  }

  /**
   * Initialize notification templates
   */
  private initializeTemplates(): void {
    // Test failure templates
    this.templates.set('test_failure_critical', {
      type: 'test_failure',
      severity: 'critical',
      title_template: '🚨 Critical Test Failures on {{branch}}',
      message_template: 'Critical test failures detected in commit {{commit_sha}}. Immediate attention required.',
      slack_template: {
        color: '#ff0000',
        emoji: '🚨',
        fields: [
          { title: 'Branch', value: '{{branch}}', short: true },
          { title: 'Commit', value: '{{commit_sha}}', short: true },
          { title: 'Failed Tests', value: '{{failed_tests}}/{{total_tests}}', short: true },
          { title: 'Duration', value: '{{duration}}', short: true },
        ],
      },
      github_template: {
        header: '## 🚨 Critical Test Failures',
        sections: [
          {
            title: 'Summary',
            content: '**{{failed_tests}}** tests failed out of **{{total_tests}}** total tests in **{{duration}}**.',
          },
          {
            title: 'Details',
            content: 'View full results in the [workflow run]({{workflow_url}}).',
            collapsible: true,
          },
        ],
        footer: '_This is an automated message from the test notification system._',
      },
    });

    // Add more templates for other severities and types...
    this.addRemainingTemplates();
  }

  private addRemainingTemplates(): void {
    // Coverage regression templates
    this.templates.set('coverage_regression_high', {
      type: 'coverage_regression',
      severity: 'high',
      title_template: '📉 Coverage Regression Detected',
      message_template: 'Code coverage has decreased significantly on {{branch}}.',
      slack_template: {
        color: '#ff9900',
        emoji: '📉',
        fields: [
          { title: 'Current Coverage', value: '{{coverage}}%', short: true },
          { title: 'Branch', value: '{{branch}}', short: true },
        ],
      },
      github_template: {
        header: '## 📉 Coverage Regression Detected',
        sections: [
          {
            title: 'Coverage Impact',
            content: 'Code coverage is now **{{coverage}}%**.',
          },
        ],
        footer: '_Please review and add tests to maintain coverage standards._',
      },
    });

    // Performance regression templates
    this.templates.set('performance_regression_medium', {
      type: 'performance_regression',
      severity: 'medium',
      title_template: '⚡ Performance Regression Alert',
      message_template: 'Performance metrics have degraded on {{branch}}.',
      slack_template: {
        color: '#ffcc00',
        emoji: '⚡',
        fields: [
          { title: 'Branch', value: '{{branch}}', short: true },
          { title: 'Duration', value: '{{duration}}', short: true },
        ],
      },
      github_template: {
        header: '## ⚡ Performance Regression Alert',
        sections: [
          {
            title: 'Performance Impact',
            content: 'Test execution time: **{{duration}}**',
          },
        ],
        footer: '_Consider optimizing performance-critical code paths._',
      },
    });
  }
}

// Export singleton instance (would be configured with actual credentials)
export const testNotificationService = new TestNotificationService(
  {
    webhook_url: process.env.SLACK_WEBHOOK_URL || '',
    channels: {
      failures: '#test-failures',
      reports: '#test-reports',
      performance: '#performance-alerts',
    },
    enabled: !!process.env.SLACK_WEBHOOK_URL,
  },
  {
    token: process.env.GITHUB_TOKEN || '',
    repository: process.env.GITHUB_REPOSITORY || '',
    enabled: !!process.env.GITHUB_TOKEN,
  }
);