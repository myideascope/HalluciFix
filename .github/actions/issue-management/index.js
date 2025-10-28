const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class IssueManager {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    
    this.context = {
      repository: process.env.GITHUB_REPOSITORY,
      runId: process.env.GITHUB_RUN_ID,
      runNumber: process.env.GITHUB_RUN_NUMBER,
      sha: process.env.GITHUB_SHA,
      ref: process.env.GITHUB_REF,
      actor: process.env.GITHUB_ACTOR,
      eventName: process.env.GITHUB_EVENT_NAME,
      serverUrl: process.env.GITHUB_SERVER_URL
    };
    
    this.inputs = {
      actionType: process.env.INPUT_ACTION_TYPE,
      workflowName: process.env.INPUT_WORKFLOW_NAME,
      failureType: process.env.INPUT_FAILURE_TYPE,
      severity: process.env.INPUT_SEVERITY,
      failureDetails: process.env.INPUT_FAILURE_DETAILS,
      testResultsPath: process.env.INPUT_TEST_RESULTS_PATH,
      coveragePath: process.env.INPUT_COVERAGE_PATH,
      performancePath: process.env.INPUT_PERFORMANCE_PATH,
      assignees: process.env.INPUT_ASSIGNEES,
      labels: process.env.INPUT_LABELS,
      issueNumber: process.env.INPUT_ISSUE_NUMBER,
      dryRun: process.env.INPUT_DRY_RUN === 'true'
    };
    
    this.slackWebhook = process.env.SLACK_WEBHOOK_URL;
    
    // Parse repository owner and name
    const [owner, repo] = this.context.repository.split('/');
    this.owner = owner;
    this.repo = repo;
  }

  async run() {
    try {
      console.log(`Running issue management action: ${this.inputs.actionType}`);
      
      let result;
      switch (this.inputs.actionType) {
        case 'create-failure-issue':
          result = await this.createFailureIssue();
          break;
        case 'create-security-issue':
          result = await this.createSecurityIssue();
          break;
        case 'update-issue':
          result = await this.updateIssue();
          break;
        case 'close-issue':
          result = await this.closeIssue();
          break;
        case 'analyze':
          result = await this.analyzeResults();
          break;
        default:
          throw new Error(`Unknown action type: ${this.inputs.actionType}`);
      }
      
      // Set outputs
      if (result.issueNumber) {
        core.setOutput('issue-number', result.issueNumber);
      }
      if (result.issueUrl) {
        core.setOutput('issue-url', result.issueUrl);
      }
      if (result.actionTaken) {
        core.setOutput('action-taken', result.actionTaken);
      }
      if (result.analysisSummary) {
        core.setOutput('analysis-summary', result.analysisSummary);
      }
      
      console.log('Issue management action completed successfully');
      
    } catch (error) {
      core.setFailed(`Issue management action failed: ${error.message}`);
      console.error('Error details:', error);
    }
  }

  async createFailureIssue() {
    console.log('Creating failure issue...');
    
    // Check for existing similar issues
    const existingIssue = await this.findExistingIssue();
    if (existingIssue) {
      console.log(`Found existing issue #${existingIssue.number}, updating instead`);
      return await this.updateExistingIssue(existingIssue);
    }
    
    const title = this.generateIssueTitle();
    const body = await this.generateIssueBody();
    const labels = this.generateLabels();
    const assignees = this.parseAssignees();
    
    if (this.inputs.dryRun) {
      console.log('DRY RUN - Would create issue:');
      console.log(`Title: ${title}`);
      console.log(`Labels: ${labels.join(', ')}`);
      console.log(`Assignees: ${assignees.join(', ')}`);
      return {
        issueNumber: 'DRY-RUN',
        issueUrl: 'DRY-RUN',
        actionTaken: 'dry-run-create-issue'
      };
    }
    
    const issue = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
      assignees
    });
    
    console.log(`Created issue #${issue.data.number}: ${issue.data.html_url}`);
    
    // Send notification
    await this.sendNotification({
      type: 'issue-created',
      issue: issue.data,
      severity: this.inputs.severity
    });
    
    return {
      issueNumber: issue.data.number,
      issueUrl: issue.data.html_url,
      actionTaken: 'created-failure-issue'
    };
  }

  async createSecurityIssue() {
    console.log('Creating security issue...');
    
    const title = `🚨 Security Issue Detected - ${this.inputs.workflowName}`;
    const body = await this.generateSecurityIssueBody();
    const labels = ['security', 'critical', 'bug', this.inputs.failureType];
    const assignees = this.parseAssignees() || ['security-team'];
    
    if (this.inputs.dryRun) {
      console.log('DRY RUN - Would create security issue:');
      console.log(`Title: ${title}`);
      return {
        issueNumber: 'DRY-RUN',
        issueUrl: 'DRY-RUN',
        actionTaken: 'dry-run-create-security-issue'
      };
    }
    
    const issue = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
      assignees
    });
    
    console.log(`Created security issue #${issue.data.number}: ${issue.data.html_url}`);
    
    // Send urgent notification
    await this.sendNotification({
      type: 'security-issue-created',
      issue: issue.data,
      severity: 'critical'
    });
    
    return {
      issueNumber: issue.data.number,
      issueUrl: issue.data.html_url,
      actionTaken: 'created-security-issue'
    };
  }

  async updateIssue() {
    if (!this.inputs.issueNumber) {
      throw new Error('Issue number is required for update operation');
    }
    
    console.log(`Updating issue #${this.inputs.issueNumber}...`);
    
    const updateBody = await this.generateUpdateBody();
    
    if (this.inputs.dryRun) {
      console.log('DRY RUN - Would update issue');
      return {
        issueNumber: this.inputs.issueNumber,
        actionTaken: 'dry-run-update-issue'
      };
    }
    
    // Add comment to existing issue
    const comment = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.inputs.issueNumber,
      body: updateBody
    });
    
    console.log(`Updated issue #${this.inputs.issueNumber} with comment`);
    
    return {
      issueNumber: this.inputs.issueNumber,
      actionTaken: 'updated-issue'
    };
  }

  async closeIssue() {
    if (!this.inputs.issueNumber) {
      throw new Error('Issue number is required for close operation');
    }
    
    console.log(`Closing issue #${this.inputs.issueNumber}...`);
    
    if (this.inputs.dryRun) {
      console.log('DRY RUN - Would close issue');
      return {
        issueNumber: this.inputs.issueNumber,
        actionTaken: 'dry-run-close-issue'
      };
    }
    
    // Add closing comment
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.inputs.issueNumber,
      body: `✅ **Issue Resolved**\n\nThis issue has been automatically resolved.\n\n**Resolution Details:**\n- Workflow: ${this.inputs.workflowName}\n- Run: [#${this.context.runNumber}](${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId})\n- Resolved by: @${this.context.actor}\n- Timestamp: ${new Date().toISOString()}`
    });
    
    // Close the issue
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.inputs.issueNumber,
      state: 'closed'
    });
    
    console.log(`Closed issue #${this.inputs.issueNumber}`);
    
    return {
      issueNumber: this.inputs.issueNumber,
      actionTaken: 'closed-issue'
    };
  }

  async analyzeResults() {
    console.log('Analyzing test results and generating reports...');
    
    const analysis = {
      testResults: await this.analyzeTestResults(),
      coverage: await this.analyzeCoverage(),
      performance: await this.analyzePerformance(),
      issues: []
    };
    
    // Determine if issues need to be created
    if (analysis.testResults.failureCount > 0) {
      analysis.issues.push({
        type: 'test-failure',
        severity: analysis.testResults.failureCount > 10 ? 'high' : 'medium',
        details: `${analysis.testResults.failureCount} test failures detected`
      });
    }
    
    if (analysis.coverage.percentage < 80) {
      analysis.issues.push({
        type: 'coverage-low',
        severity: analysis.coverage.percentage < 60 ? 'high' : 'medium',
        details: `Code coverage is ${analysis.coverage.percentage}% (below 80% threshold)`
      });
    }
    
    if (analysis.performance.issues.length > 0) {
      analysis.issues.push({
        type: 'performance-issue',
        severity: 'medium',
        details: `${analysis.performance.issues.length} performance issues detected`
      });
    }
    
    // Create issues for significant problems
    for (const issue of analysis.issues) {
      if (issue.severity === 'high' || issue.severity === 'critical') {
        await this.createAnalysisIssue(issue);
      }
    }
    
    const summary = this.generateAnalysisSummary(analysis);
    
    return {
      actionTaken: 'analyzed-results',
      analysisSummary: summary
    };
  }

  async findExistingIssue() {
    const searchQuery = `repo:${this.context.repository} is:open label:ci-failure "${this.inputs.workflowName}"`;
    
    try {
      const searchResults = await this.octokit.search.issuesAndPullRequests({
        q: searchQuery,
        sort: 'created',
        order: 'desc',
        per_page: 5
      });
      
      // Look for issues created in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      for (const issue of searchResults.data.items) {
        const createdAt = new Date(issue.created_at);
        if (createdAt > oneDayAgo && issue.title.includes(this.inputs.workflowName)) {
          return issue;
        }
      }
    } catch (error) {
      console.log('Error searching for existing issues:', error.message);
    }
    
    return null;
  }

  async updateExistingIssue(existingIssue) {
    const updateComment = `## 🔄 **Workflow Failed Again**\n\n` +
      `The workflow **${this.inputs.workflowName}** has failed again with a similar issue.\n\n` +
      `**Latest Failure Details:**\n` +
      `- **Run:** [#${this.context.runNumber}](${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId})\n` +
      `- **Commit:** ${this.context.sha.substring(0, 7)}\n` +
      `- **Branch:** ${this.context.ref.replace('refs/heads/', '')}\n` +
      `- **Triggered by:** @${this.context.actor}\n` +
      `- **Timestamp:** ${new Date().toISOString()}\n\n` +
      `${this.inputs.failureDetails ? `**Error Details:**\n\`\`\`\n${this.inputs.failureDetails}\n\`\`\`` : ''}`;
    
    if (this.inputs.dryRun) {
      console.log('DRY RUN - Would update existing issue');
      return {
        issueNumber: existingIssue.number,
        issueUrl: existingIssue.html_url,
        actionTaken: 'dry-run-update-existing-issue'
      };
    }
    
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: existingIssue.number,
      body: updateComment
    });
    
    // Update labels to increase severity if multiple failures
    const currentLabels = existingIssue.labels.map(label => typeof label === 'string' ? label : label.name);
    if (!currentLabels.includes('recurring-failure')) {
      await this.octokit.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: existingIssue.number,
        labels: ['recurring-failure']
      });
    }
    
    console.log(`Updated existing issue #${existingIssue.number}`);
    
    return {
      issueNumber: existingIssue.number,
      issueUrl: existingIssue.html_url,
      actionTaken: 'updated-existing-issue'
    };
  }

  generateIssueTitle() {
    const severityEmoji = {
      low: '⚠️',
      medium: '🚨',
      high: '🔥',
      critical: '💥'
    };
    
    const emoji = severityEmoji[this.inputs.severity] || '🚨';
    return `${emoji} ${this.inputs.failureType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${this.inputs.workflowName}`;
  }

  async generateIssueBody() {
    const workflowUrl = `${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId}`;
    
    let body = `## 🚨 **Workflow Failure Report**\n\n`;
    body += `A workflow failure has been detected and requires attention.\n\n`;
    body += `### 📋 **Failure Details**\n\n`;
    body += `| Field | Value |\n`;
    body += `|-------|-------|\n`;
    body += `| **Workflow** | ${this.inputs.workflowName} |\n`;
    body += `| **Failure Type** | ${this.inputs.failureType} |\n`;
    body += `| **Severity** | ${this.inputs.severity.toUpperCase()} |\n`;
    body += `| **Run Number** | [#${this.context.runNumber}](${workflowUrl}) |\n`;
    body += `| **Commit** | ${this.context.sha.substring(0, 7)} |\n`;
    body += `| **Branch** | ${this.context.ref.replace('refs/heads/', '')} |\n`;
    body += `| **Triggered by** | @${this.context.actor} |\n`;
    body += `| **Event** | ${this.context.eventName} |\n`;
    body += `| **Timestamp** | ${new Date().toISOString()} |\n\n`;
    
    if (this.inputs.failureDetails) {
      body += `### 🔍 **Error Details**\n\n`;
      body += `\`\`\`\n${this.inputs.failureDetails}\n\`\`\`\n\n`;
    }
    
    body += `### 🔗 **Quick Links**\n\n`;
    body += `- [View Workflow Run](${workflowUrl})\n`;
    body += `- [View Commit](${this.context.serverUrl}/${this.context.repository}/commit/${this.context.sha})\n`;
    body += `- [Repository Actions](${this.context.serverUrl}/${this.context.repository}/actions)\n\n`;
    
    body += `### 📝 **Next Steps**\n\n`;
    body += `1. **Investigate** the failure by reviewing the workflow logs\n`;
    body += `2. **Identify** the root cause of the issue\n`;
    body += `3. **Fix** the underlying problem\n`;
    body += `4. **Test** the fix in a development environment\n`;
    body += `5. **Close** this issue once resolved\n\n`;
    
    body += `### 🏷️ **Issue Management**\n\n`;
    body += `- This issue was automatically created by the CI/CD system\n`;
    body += `- Please update the issue with your investigation findings\n`;
    body += `- Add the \`investigating\` label when you start working on this\n`;
    body += `- Close the issue when the problem is resolved\n\n`;
    
    body += `---\n`;
    body += `*Automatically generated by [Issue Management Action](${this.context.serverUrl}/${this.context.repository}/actions)*`;
    
    return body;
  }

  async generateSecurityIssueBody() {
    const workflowUrl = `${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId}`;
    
    let body = `## 🚨 **SECURITY ALERT**\n\n`;
    body += `⚠️ **IMMEDIATE ATTENTION REQUIRED** ⚠️\n\n`;
    body += `A security issue has been detected in the CI/CD pipeline.\n\n`;
    body += `### 🔒 **Security Issue Details**\n\n`;
    body += `| Field | Value |\n`;
    body += `|-------|-------|\n`;
    body += `| **Issue Type** | ${this.inputs.failureType} |\n`;
    body += `| **Severity** | **${this.inputs.severity.toUpperCase()}** |\n`;
    body += `| **Workflow** | ${this.inputs.workflowName} |\n`;
    body += `| **Detection Time** | ${new Date().toISOString()} |\n`;
    body += `| **Run Number** | [#${this.context.runNumber}](${workflowUrl}) |\n`;
    body += `| **Commit** | ${this.context.sha.substring(0, 7)} |\n`;
    body += `| **Actor** | @${this.context.actor} |\n\n`;
    
    if (this.inputs.failureDetails) {
      body += `### 🔍 **Security Details**\n\n`;
      body += `\`\`\`\n${this.inputs.failureDetails}\n\`\`\`\n\n`;
    }
    
    body += `### 🚨 **Immediate Actions Required**\n\n`;
    body += `1. **🔒 STOP** - Halt any related deployments immediately\n`;
    body += `2. **🔍 INVESTIGATE** - Review the security issue details\n`;
    body += `3. **🛡️ CONTAIN** - Implement containment measures if needed\n`;
    body += `4. **📞 ESCALATE** - Notify security team and stakeholders\n`;
    body += `5. **🔧 REMEDIATE** - Fix the security issue\n`;
    body += `6. **✅ VERIFY** - Confirm the fix resolves the issue\n\n`;
    
    body += `### 📞 **Escalation Contacts**\n\n`;
    body += `- **Security Team**: @security-team\n`;
    body += `- **DevOps Team**: @devops-team\n`;
    body += `- **On-call Engineer**: Check PagerDuty rotation\n\n`;
    
    body += `---\n`;
    body += `*🤖 Automatically generated security alert - Treat as HIGH PRIORITY*`;
    
    return body;
  }

  async generateUpdateBody() {
    return `## 🔄 **Issue Update**\n\n` +
      `**Workflow:** ${this.inputs.workflowName}\n` +
      `**Run:** [#${this.context.runNumber}](${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId})\n` +
      `**Update Time:** ${new Date().toISOString()}\n\n` +
      `${this.inputs.failureDetails || 'Issue update from automated system.'}`;
  }

  generateLabels() {
    const baseLabels = ['ci-failure', 'automated-issue'];
    
    // Add severity label
    baseLabels.push(`severity-${this.inputs.severity}`);
    
    // Add failure type label
    baseLabels.push(this.inputs.failureType);
    
    // Add workflow-specific label
    const workflowLabel = this.inputs.workflowName.toLowerCase().replace(/\s+/g, '-');
    baseLabels.push(`workflow-${workflowLabel}`);
    
    // Add custom labels if provided
    if (this.inputs.labels) {
      const customLabels = this.inputs.labels.split(',').map(label => label.trim());
      baseLabels.push(...customLabels);
    }
    
    return baseLabels;
  }

  parseAssignees() {
    if (!this.inputs.assignees) {
      // Default assignees based on failure type
      const defaultAssignees = {
        'security-violation': ['security-team'],
        'deployment-failure': ['devops-team'],
        'test-failure': ['qa-team'],
        'build-failure': ['core-developers']
      };
      
      return defaultAssignees[this.inputs.failureType] || ['core-developers'];
    }
    
    return this.inputs.assignees.split(',').map(assignee => assignee.trim());
  }

  async analyzeTestResults() {
    const analysis = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      failureCount: 0,
      failures: []
    };
    
    try {
      if (fs.existsSync(this.inputs.testResultsPath)) {
        const files = fs.readdirSync(this.inputs.testResultsPath);
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(this.inputs.testResultsPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const testData = JSON.parse(content);
            
            // Parse different test result formats
            if (testData.numTotalTests) {
              // Jest format
              analysis.totalTests += testData.numTotalTests;
              analysis.passedTests += testData.numPassedTests;
              analysis.failedTests += testData.numFailedTests;
              analysis.skippedTests += testData.numPendingTests || 0;
            }
          }
        }
        
        analysis.failureCount = analysis.failedTests;
      }
    } catch (error) {
      console.log('Error analyzing test results:', error.message);
    }
    
    return analysis;
  }

  async analyzeCoverage() {
    const analysis = {
      percentage: 0,
      lines: { covered: 0, total: 0 },
      functions: { covered: 0, total: 0 },
      branches: { covered: 0, total: 0 }
    };
    
    try {
      const coverageFile = path.join(this.inputs.coveragePath, 'coverage-summary.json');
      if (fs.existsSync(coverageFile)) {
        const content = fs.readFileSync(coverageFile, 'utf8');
        const coverageData = JSON.parse(content);
        
        if (coverageData.total) {
          analysis.percentage = coverageData.total.lines.pct || 0;
          analysis.lines = coverageData.total.lines;
          analysis.functions = coverageData.total.functions;
          analysis.branches = coverageData.total.branches;
        }
      }
    } catch (error) {
      console.log('Error analyzing coverage:', error.message);
    }
    
    return analysis;
  }

  async analyzePerformance() {
    const analysis = {
      issues: [],
      metrics: {}
    };
    
    try {
      if (fs.existsSync(this.inputs.performancePath)) {
        const files = fs.readdirSync(this.inputs.performancePath);
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(this.inputs.performancePath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const perfData = JSON.parse(content);
            
            // Analyze performance metrics
            if (perfData.metrics) {
              analysis.metrics = { ...analysis.metrics, ...perfData.metrics };
            }
            
            // Check for performance issues
            if (perfData.loadTime && perfData.loadTime > 3000) {
              analysis.issues.push(`Slow load time: ${perfData.loadTime}ms`);
            }
          }
        }
      }
    } catch (error) {
      console.log('Error analyzing performance:', error.message);
    }
    
    return analysis;
  }

  async createAnalysisIssue(issue) {
    const title = `📊 Analysis Issue: ${issue.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
    const body = `## 📊 **Automated Analysis Issue**\n\n` +
      `**Issue Type:** ${issue.type}\n` +
      `**Severity:** ${issue.severity}\n` +
      `**Details:** ${issue.details}\n\n` +
      `**Workflow:** ${this.inputs.workflowName}\n` +
      `**Run:** [#${this.context.runNumber}](${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId})\n` +
      `**Detected:** ${new Date().toISOString()}\n\n` +
      `This issue was automatically detected during result analysis.`;
    
    const labels = ['analysis-issue', issue.type, `severity-${issue.severity}`];
    
    if (!this.inputs.dryRun) {
      await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        labels
      });
    }
  }

  generateAnalysisSummary(analysis) {
    let summary = `## 📊 Analysis Summary\n\n`;
    
    if (analysis.testResults.totalTests > 0) {
      summary += `**Tests:** ${analysis.testResults.passedTests}/${analysis.testResults.totalTests} passed`;
      if (analysis.testResults.failedTests > 0) {
        summary += ` (${analysis.testResults.failedTests} failed)`;
      }
      summary += `\n`;
    }
    
    if (analysis.coverage.percentage > 0) {
      summary += `**Coverage:** ${analysis.coverage.percentage}%\n`;
    }
    
    if (analysis.performance.issues.length > 0) {
      summary += `**Performance Issues:** ${analysis.performance.issues.length}\n`;
    }
    
    if (analysis.issues.length > 0) {
      summary += `\n**Issues Created:** ${analysis.issues.length}\n`;
    }
    
    return summary;
  }

  async sendNotification(notification) {
    if (!this.slackWebhook) {
      console.log('No Slack webhook configured, skipping notification');
      return;
    }
    
    try {
      const message = this.formatSlackMessage(notification);
      
      await axios.post(this.slackWebhook, message, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('Notification sent successfully');
    } catch (error) {
      console.log('Failed to send notification:', error.message);
    }
  }

  formatSlackMessage(notification) {
    const severityColors = {
      low: '#36a64f',
      medium: '#ff9500',
      high: '#ff0000',
      critical: '#8B0000'
    };
    
    const color = severityColors[notification.severity] || '#36a64f';
    
    let title, text;
    
    switch (notification.type) {
      case 'issue-created':
        title = `🚨 New Issue Created: ${notification.issue.title}`;
        text = `Issue #${notification.issue.number} has been created for workflow failure.`;
        break;
      case 'security-issue-created':
        title = `🚨 SECURITY ALERT: ${notification.issue.title}`;
        text = `Critical security issue detected! Immediate attention required.`;
        break;
      default:
        title = 'CI/CD Notification';
        text = 'Automated notification from CI/CD system.';
    }
    
    return {
      attachments: [{
        color,
        title,
        text,
        fields: [
          {
            title: 'Repository',
            value: this.context.repository,
            short: true
          },
          {
            title: 'Workflow',
            value: this.inputs.workflowName,
            short: true
          },
          {
            title: 'Run',
            value: `<${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId}|#${this.context.runNumber}>`,
            short: true
          },
          {
            title: 'Issue',
            value: notification.issue ? `<${notification.issue.html_url}|#${notification.issue.number}>` : 'N/A',
            short: true
          }
        ],
        footer: 'GitHub Actions',
        ts: Math.floor(Date.now() / 1000)
      }]
    };
  }
}

// Run the action
const issueManager = new IssueManager();
issueManager.run();