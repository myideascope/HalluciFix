/**
 * GitHub Actions Integration
 * Utilities for integrating with GitHub Actions workflows and API
 */

export interface GitHubActionsConfig {
  token: string;
  repository: string;
  owner: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  created_at: string;
  updated_at: string;
  run_number: number;
  event: string;
  actor: {
    login: string;
    avatar_url: string;
  };
  pull_requests: PullRequest[];
}

export interface PullRequest {
  id: number;
  number: number;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
}

export interface WorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  started_at: string;
  completed_at: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  number: number;
  started_at: string;
  completed_at: string;
}

export interface CheckRun {
  id: number;
  name: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  started_at: string;
  completed_at: string;
  output: {
    title: string;
    summary: string;
    text?: string;
    annotations?: CheckAnnotation[];
  };
}

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title?: string;
  raw_details?: string;
}

export interface PRComment {
  id: number;
  body: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

export class GitHubActionsIntegration {
  private config: GitHubActionsConfig;
  private baseUrl: string;

  constructor(config: GitHubActionsConfig) {
    this.config = config;
    this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repository}`;
  }

  /**
   * Get workflow run details
   */
  async getWorkflowRun(runId: number): Promise<WorkflowRun> {
    const response = await this.makeRequest(`/actions/runs/${runId}`);
    return response;
  }

  /**
   * Get workflow jobs for a run
   */
  async getWorkflowJobs(runId: number): Promise<WorkflowJob[]> {
    const response = await this.makeRequest(`/actions/runs/${runId}/jobs`);
    return response.jobs;
  }

  /**
   * Get workflow run logs
   */
  async getWorkflowLogs(runId: number): Promise<string> {
    const response = await fetch(`${this.baseUrl}/actions/runs/${runId}/logs`, {
      headers: {
        'Authorization': `token ${this.config.token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch workflow logs: ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * Create or update a check run
   */
  async createCheckRun(
    name: string,
    headSha: string,
    status: 'queued' | 'in_progress' | 'completed',
    options: {
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
      output?: {
        title: string;
        summary: string;
        text?: string;
        annotations?: CheckAnnotation[];
      };
      actions?: Array<{
        label: string;
        description: string;
        identifier: string;
      }>;
    } = {}
  ): Promise<CheckRun> {
    const body: any = {
      name,
      head_sha: headSha,
      status,
    };

    if (options.conclusion) {
      body.conclusion = options.conclusion;
    }

    if (options.output) {
      body.output = options.output;
    }

    if (options.actions) {
      body.actions = options.actions;
    }

    const response = await this.makeRequest('/check-runs', 'POST', body);
    return response;
  }

  /**
   * Update an existing check run
   */
  async updateCheckRun(
    checkRunId: number,
    updates: {
      status?: 'queued' | 'in_progress' | 'completed';
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
      output?: {
        title: string;
        summary: string;
        text?: string;
        annotations?: CheckAnnotation[];
      };
    }
  ): Promise<CheckRun> {
    const response = await this.makeRequest(`/check-runs/${checkRunId}`, 'PATCH', updates);
    return response;
  }

  /**
   * Add comment to pull request
   */
  async addPRComment(prNumber: number, body: string): Promise<PRComment> {
    const response = await this.makeRequest(`/issues/${prNumber}/comments`, 'POST', { body });
    return response;
  }

  /**
   * Update existing PR comment
   */
  async updatePRComment(commentId: number, body: string): Promise<PRComment> {
    const response = await this.makeRequest(`/issues/comments/${commentId}`, 'PATCH', { body });
    return response;
  }

  /**
   * Find existing PR comment by bot
   */
  async findBotComment(prNumber: number, identifier: string): Promise<PRComment | null> {
    const comments = await this.makeRequest(`/issues/${prNumber}/comments`);
    
    return comments.find((comment: PRComment) => 
      comment.user.login === 'github-actions[bot]' && 
      comment.body.includes(identifier)
    ) || null;
  }

  /**
   * Create or update PR comment with test results
   */
  async createOrUpdateTestComment(
    prNumber: number,
    testResults: any,
    identifier: string = '<!-- test-results-comment -->'
  ): Promise<void> {
    const commentBody = this.buildTestResultsComment(testResults, identifier);
    
    const existingComment = await this.findBotComment(prNumber, identifier);
    
    if (existingComment) {
      await this.updatePRComment(existingComment.id, commentBody);
    } else {
      await this.addPRComment(prNumber, commentBody);
    }
  }

  /**
   * Set commit status
   */
  async setCommitStatus(
    sha: string,
    state: 'pending' | 'success' | 'error' | 'failure',
    context: string,
    description: string,
    targetUrl?: string
  ): Promise<void> {
    const body: any = {
      state,
      context,
      description,
    };

    if (targetUrl) {
      body.target_url = targetUrl;
    }

    await this.makeRequest(`/statuses/${sha}`, 'POST', body);
  }

  /**
   * Get pull request files
   */
  async getPRFiles(prNumber: number): Promise<Array<{
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>> {
    const response = await this.makeRequest(`/pulls/${prNumber}/files`);
    return response;
  }

  /**
   * Get repository content
   */
  async getFileContent(path: string, ref?: string): Promise<{
    content: string;
    encoding: string;
    sha: string;
  }> {
    const url = `/contents/${path}${ref ? `?ref=${ref}` : ''}`;
    const response = await this.makeRequest(url);
    return response;
  }

  /**
   * Create GitHub issue for test failure
   */
  async createTestFailureIssue(
    title: string,
    body: string,
    labels: string[] = [],
    assignees: string[] = []
  ): Promise<any> {
    const issueBody = {
      title,
      body,
      labels,
      assignees,
    };

    const response = await this.makeRequest('/issues', 'POST', issueBody);
    return response;
  }

  /**
   * Close GitHub issue
   */
  async closeIssue(issueNumber: number, comment?: string): Promise<void> {
    if (comment) {
      await this.makeRequest(`/issues/${issueNumber}/comments`, 'POST', { body: comment });
    }

    await this.makeRequest(`/issues/${issueNumber}`, 'PATCH', { state: 'closed' });
  }

  /**
   * Search for existing issues
   */
  async searchIssues(query: string): Promise<any[]> {
    const searchQuery = `repo:${this.config.owner}/${this.config.repository} ${query}`;
    const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(searchQuery)}`, {
      headers: {
        'Authorization': `token ${this.config.token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to search issues: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items;
  }

  /**
   * Build test results comment for PR
   */
  private buildTestResultsComment(testResults: any, identifier: string): string {
    const {
      status,
      test_suites,
      coverage_data,
      performance_metrics,
      duration,
      commit_sha,
    } = testResults;

    const totalTests = test_suites.reduce(
      (sum: number, suite: any) => sum + suite.tests_passed + suite.tests_failed + suite.tests_skipped,
      0
    );
    const failedTests = test_suites.reduce((sum: number, suite: any) => sum + suite.tests_failed, 0);
    const passedTests = test_suites.reduce((sum: number, suite: any) => sum + suite.tests_passed, 0);

    const statusEmoji = status === 'success' ? '✅' : '❌';
    const coverageEmoji = coverage_data.global.lines.percentage >= 80 ? '✅' : '⚠️';

    let comment = `${identifier}\n\n`;
    comment += `## ${statusEmoji} Test Results\n\n`;
    comment += `**Commit:** \`${commit_sha.substring(0, 7)}\`\n`;
    comment += `**Duration:** ${this.formatDuration(duration)}\n\n`;

    // Test Summary
    comment += `### 📊 Test Summary\n\n`;
    comment += `| Metric | Value |\n`;
    comment += `|--------|-------|\n`;
    comment += `| Total Tests | ${totalTests} |\n`;
    comment += `| Passed | ${passedTests} |\n`;
    comment += `| Failed | ${failedTests} |\n`;
    comment += `| Coverage | ${coverageEmoji} ${coverage_data.global.lines.percentage.toFixed(1)}% |\n\n`;

    // Test Suites
    if (test_suites.length > 0) {
      comment += `### 🧪 Test Suites\n\n`;
      for (const suite of test_suites) {
        const suiteEmoji = suite.status === 'passed' ? '✅' : suite.status === 'failed' ? '❌' : '⏭️';
        comment += `- ${suiteEmoji} **${suite.name}** (${suite.type}): ${suite.tests_passed}/${suite.tests_passed + suite.tests_failed} passed\n`;
      }
      comment += '\n';
    }

    // Failures
    if (failedTests > 0) {
      comment += `### ❌ Test Failures\n\n`;
      for (const suite of test_suites) {
        if (suite.failures && suite.failures.length > 0) {
          comment += `**${suite.name}:**\n`;
          for (const failure of suite.failures.slice(0, 5)) { // Limit to 5 failures per suite
            comment += `- \`${failure.test_name}\`: ${failure.error_message}\n`;
          }
          if (suite.failures.length > 5) {
            comment += `- ... and ${suite.failures.length - 5} more failures\n`;
          }
          comment += '\n';
        }
      }
    }

    // Performance Alerts
    if (performance_metrics.regression_alerts.length > 0) {
      comment += `### ⚡ Performance Alerts\n\n`;
      for (const alert of performance_metrics.regression_alerts) {
        const alertEmoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'high' ? '⚠️' : 'ℹ️';
        comment += `- ${alertEmoji} ${alert.message}\n`;
      }
      comment += '\n';
    }

    // Coverage Regression
    if (coverage_data.regression_detected) {
      comment += `### 📉 Coverage Regression\n\n`;
      comment += `Coverage has decreased from ${coverage_data.previous_coverage?.toFixed(1)}% to ${coverage_data.global.lines.percentage.toFixed(1)}%\n\n`;
    }

    comment += `---\n`;
    comment += `*This comment was automatically generated by the test notification system.*`;

    return comment;
  }

  /**
   * Format duration in milliseconds to human readable string
   */
  private formatDuration(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Make authenticated request to GitHub API
   */
  private async makeRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `token ${this.config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get current workflow run context (when running in GitHub Actions)
   */
  static getCurrentWorkflowContext(): {
    runId: number;
    sha: string;
    ref: string;
    repository: string;
    actor: string;
    eventName: string;
    prNumber?: number;
  } | null {
    if (!process.env.GITHUB_ACTIONS) {
      return null;
    }

    const context = {
      runId: parseInt(process.env.GITHUB_RUN_ID || '0'),
      sha: process.env.GITHUB_SHA || '',
      ref: process.env.GITHUB_REF || '',
      repository: process.env.GITHUB_REPOSITORY || '',
      actor: process.env.GITHUB_ACTOR || '',
      eventName: process.env.GITHUB_EVENT_NAME || '',
    };

    // Extract PR number for pull_request events
    if (context.eventName === 'pull_request' && process.env.GITHUB_REF) {
      const prMatch = process.env.GITHUB_REF.match(/refs\/pull\/(\d+)\/merge/);
      if (prMatch) {
        return { ...context, prNumber: parseInt(prMatch[1]) };
      }
    }

    return context;
  }
}

// Export configured instance (would be initialized with actual config in real usage)
export const githubActionsIntegration = new GitHubActionsIntegration({
  token: process.env.GITHUB_TOKEN || '',
  repository: process.env.GITHUB_REPOSITORY?.split('/')[1] || '',
  owner: process.env.GITHUB_REPOSITORY?.split('/')[0] || '',
});