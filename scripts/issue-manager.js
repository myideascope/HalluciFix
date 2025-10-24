#!/usr/bin/env node

/**
 * GitHub Issue Management Script
 * Handles automated issue creation, assignment, and lifecycle management for test failures
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

class IssueManager {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
    this.owner = process.env.GITHUB_REPOSITORY_OWNER || 'your-org';
    this.repo = process.env.GITHUB_REPOSITORY_NAME || 'hallucifix';
    this.workflowRunId = process.env.GITHUB_RUN_ID;
    this.workflowRunUrl = `https://github.com/${this.owner}/${this.repo}/actions/runs/${this.workflowRunId}`;
  }

  /**
   * Create issue for test failure
   */
  async createTestFailureIssue(failureData) {
    const template = await this.loadTemplate('test-failure.md');
    const title = `[TEST FAILURE] ${failureData.testSuite} - ${failureData.failureType}`;
    
    const body = this.replaceTemplateVariables(template, {
      test_suite: failureData.testSuite,
      failure_type: failureData.failureType,
      branch: process.env.GITHUB_REF_NAME,
      commit_sha: process.env.GITHUB_SHA,
      workflow_run_id: this.workflowRunId,
      workflow_run_url: this.workflowRunUrl,
      timestamp: new Date().toISOString(),
      failed_tests_list: this.formatFailedTests(failureData.failedTests),
      error_message: failureData.errorMessage,
      stack_trace: failureData.stackTrace,
      runner_os: process.env.RUNNER_OS,
      node_version: process.env.NODE_VERSION,
      test_framework: failureData.testFramework,
      browser: failureData.browser || 'N/A',
      previous_coverage: failureData.previousCoverage || 'N/A',
      current_coverage: failureData.currentCoverage || 'N/A',
      coverage_change: failureData.coverageChange || 'N/A',
      recent_file_changes: await this.getRecentFileChanges(),
      first_failure_date: failureData.firstFailureDate || 'Unknown',
      failure_count: failureData.failureCount || 1,
      total_runs: failureData.totalRuns || 1,
      is_flaky: failureData.isFlaky ? 'Yes' : 'No',
      suggested_actions: this.generateSuggestedActions(failureData),
      related_issues: await this.findRelatedIssues(failureData.testSuite)
    });

    const assignees = await this.getCodeOwners(failureData.affectedFiles);
    
    return await this.createIssue({
      title,
      body,
      labels: ['test-failure', 'needs-investigation', 'ci-cd', failureData.severity || 'medium'],
      assignees
    });
  }

  /**
   * Create issue for performance regression
   */
  async createPerformanceRegressionIssue(performanceData) {
    const template = await this.loadTemplate('performance-regression.md');
    const title = `[PERFORMANCE] Regression detected in ${performanceData.metricName}`;
    
    const body = this.replaceTemplateVariables(template, {
      metric_name: performanceData.metricName,
      current_value: performanceData.currentValue,
      baseline_value: performanceData.baselineValue,
      regression_percentage: performanceData.regressionPercentage,
      threshold_value: performanceData.thresholdValue,
      branch: process.env.GITHUB_REF_NAME,
      commit_sha: process.env.GITHUB_SHA,
      workflow_run_id: this.workflowRunId,
      workflow_run_url: this.workflowRunUrl,
      performance_table: this.formatPerformanceTable(performanceData.metrics),
      affected_components: performanceData.affectedComponents.join(', '),
      recent_file_changes: await this.getRecentFileChanges(),
      bundle_size_change: performanceData.bundleSizeChange || 'N/A',
      test_execution_change: performanceData.testExecutionChange || 'N/A',
      memory_usage_change: performanceData.memoryUsageChange || 'N/A',
      cpu_usage_change: performanceData.cpuUsageChange || 'N/A',
      fcp_change: performanceData.fcpChange || 'N/A',
      lcp_change: performanceData.lcpChange || 'N/A',
      cls_change: performanceData.clsChange || 'N/A',
      fid_change: performanceData.fidChange || 'N/A',
      performance_trend_chart: performanceData.trendChart || 'No trend data available',
      optimization_suggestions: this.generateOptimizationSuggestions(performanceData)
    });

    const assignees = await this.getCodeOwners(performanceData.affectedFiles);
    
    return await this.createIssue({
      title,
      body,
      labels: ['performance', 'regression', 'needs-investigation'],
      assignees
    });
  }

  /**
   * Create issue for coverage regression
   */
  async createCoverageRegressionIssue(coverageData) {
    const template = await this.loadTemplate('coverage-regression.md');
    const title = '[COVERAGE] Coverage dropped below threshold';
    
    const body = this.replaceTemplateVariables(template, {
      global_coverage: coverageData.globalCoverage,
      previous_coverage: coverageData.previousCoverage,
      coverage_drop: coverageData.coverageDrop,
      coverage_threshold: coverageData.threshold,
      coverage_status: coverageData.status,
      branch: process.env.GITHUB_REF_NAME,
      commit_sha: process.env.GITHUB_SHA,
      workflow_run_id: this.workflowRunId,
      workflow_run_url: this.workflowRunUrl,
      lines_coverage: coverageData.lines.current,
      prev_lines: coverageData.lines.previous,
      lines_change: coverageData.lines.change,
      lines_threshold: coverageData.lines.threshold,
      lines_status: coverageData.lines.status,
      functions_coverage: coverageData.functions.current,
      prev_functions: coverageData.functions.previous,
      functions_change: coverageData.functions.change,
      functions_threshold: coverageData.functions.threshold,
      functions_status: coverageData.functions.status,
      branches_coverage: coverageData.branches.current,
      prev_branches: coverageData.branches.previous,
      branches_change: coverageData.branches.change,
      branches_threshold: coverageData.branches.threshold,
      branches_status: coverageData.branches.status,
      statements_coverage: coverageData.statements.current,
      prev_statements: coverageData.statements.previous,
      statements_change: coverageData.statements.change,
      statements_threshold: coverageData.statements.threshold,
      statements_status: coverageData.statements.status,
      affected_modules_table: this.formatAffectedModulesTable(coverageData.affectedModules),
      uncovered_code_sections: this.formatUncoveredCode(coverageData.uncoveredSections),
      recent_file_changes: await this.getRecentFileChanges(),
      missing_coverage_details: this.formatMissingCoverage(coverageData.missingCoverage),
      critical_modules_coverage: this.formatCriticalModulesCoverage(coverageData.criticalModules),
      coverage_trend_analysis: coverageData.trendAnalysis || 'No trend data available',
      test_suggestions: this.generateTestSuggestions(coverageData.uncoveredSections)
    });

    const assignees = await this.getCodeOwners(coverageData.affectedFiles);
    
    return await this.createIssue({
      title,
      body,
      labels: ['coverage', 'regression', 'test-quality'],
      assignees
    });
  }

  /**
   * Create issue for flaky test
   */
  async createFlakyTestIssue(flakyData) {
    const template = await this.loadTemplate('flaky-test.md');
    const title = `[FLAKY TEST] ${flakyData.testName} - Intermittent failures detected`;
    
    const body = this.replaceTemplateVariables(template, {
      test_name: flakyData.testName,
      test_file: flakyData.testFile,
      test_suite: flakyData.testSuite,
      detection_date: new Date().toISOString(),
      failure_rate: flakyData.failureRate,
      failures: flakyData.failures,
      total_runs: flakyData.totalRuns,
      first_failure_date: flakyData.firstFailureDate,
      recent_failures_count: flakyData.recentFailuresCount,
      time_period: flakyData.timePeriod || '7 days',
      failure_frequency: flakyData.failureFrequency,
      success_rate: 100 - flakyData.failureRate,
      recent_failure_logs: this.formatRecentFailureLogs(flakyData.recentFailures),
      error_patterns: this.analyzeErrorPatterns(flakyData.errorPatterns),
      environment_correlation_table: this.formatEnvironmentCorrelation(flakyData.environmentData),
      avg_execution_time: flakyData.avgExecutionTime,
      timeout_threshold: flakyData.timeoutThreshold,
      timing_variance: flakyData.timingVariance,
      potential_causes: this.identifyPotentialCauses(flakyData),
      cicd_impact: this.assessCICDImpact(flakyData.failureRate),
      dev_productivity_impact: this.assessProductivityImpact(flakyData.failureRate),
      deployment_confidence_impact: this.assessDeploymentImpact(flakyData.failureRate)
    });

    const assignees = await this.getCodeOwners([flakyData.testFile]);
    
    return await this.createIssue({
      title,
      body,
      labels: ['flaky-test', 'test-stability', 'needs-investigation'],
      assignees
    });
  }

  /**
   * Close resolved issues automatically
   */
  async closeResolvedIssues(resolvedData) {
    const issues = await this.findIssuesByLabels(resolvedData.labels);
    
    for (const issue of issues) {
      if (this.isIssueResolved(issue, resolvedData)) {
        await this.closeIssue(issue.number, resolvedData.resolutionComment);
      }
    }
  }

  /**
   * Update existing issues with new information
   */
  async updateExistingIssue(issueNumber, updateData) {
    const issue = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    const updatedBody = this.appendToIssueBody(issue.data.body, updateData);
    
    return await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: updatedBody
    });
  }

  // Helper methods
  async loadTemplate(templateName) {
    const templatePath = path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE', templateName);
    return fs.readFileSync(templatePath, 'utf8');
  }

  replaceTemplateVariables(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || 'N/A');
    }
    return result;
  }

  async createIssue({ title, body, labels, assignees }) {
    return await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
      assignees: assignees.slice(0, 10) // GitHub limit
    });
  }

  async closeIssue(issueNumber, comment) {
    if (comment) {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: comment
      });
    }

    return await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      state: 'closed'
    });
  }

  async getCodeOwners(filePaths) {
    // Parse CODEOWNERS file and return relevant owners
    const codeownersPath = path.join(__dirname, '..', '.github', 'CODEOWNERS');
    if (!fs.existsSync(codeownersPath)) return [];

    const codeowners = fs.readFileSync(codeownersPath, 'utf8');
    const owners = new Set();

    for (const filePath of filePaths || []) {
      const matchingOwners = this.parseCodeOwners(codeowners, filePath);
      matchingOwners.forEach(owner => owners.add(owner));
    }

    return Array.from(owners).map(owner => owner.replace('@', ''));
  }

  parseCodeOwners(codeowners, filePath) {
    const lines = codeowners.split('\n').filter(line => 
      line.trim() && !line.startsWith('#')
    );

    const owners = [];
    for (const line of lines) {
      const [pattern, ...ownerList] = line.trim().split(/\s+/);
      if (this.matchesPattern(filePath, pattern)) {
        owners.push(...ownerList);
      }
    }

    return owners;
  }

  matchesPattern(filePath, pattern) {
    // Simple glob pattern matching
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\//g, '\\/');
    
    return new RegExp(`^${regex}`).test(filePath);
  }

  async getRecentFileChanges() {
    try {
      const commits = await this.octokit.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        per_page: 5
      });

      const changes = [];
      for (const commit of commits.data) {
        const commitData = await this.octokit.repos.getCommit({
          owner: this.owner,
          repo: this.repo,
          ref: commit.sha
        });

        changes.push({
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message.split('\n')[0],
          files: commitData.data.files?.map(f => f.filename) || []
        });
      }

      return changes.map(change => 
        `- ${change.sha}: ${change.message} (${change.files.length} files)`
      ).join('\n');
    } catch (error) {
      return 'Unable to fetch recent changes';
    }
  }

  async findRelatedIssues(testSuite) {
    try {
      const issues = await this.octokit.search.issuesAndPullRequests({
        q: `repo:${this.owner}/${this.repo} is:issue ${testSuite} label:test-failure`
      });

      return issues.data.items
        .slice(0, 5)
        .map(issue => `- #${issue.number}: ${issue.title}`)
        .join('\n') || 'No related issues found';
    } catch (error) {
      return 'Unable to search for related issues';
    }
  }

  async findIssuesByLabels(labels) {
    const labelQuery = labels.map(label => `label:${label}`).join(' ');
    const issues = await this.octokit.search.issuesAndPullRequests({
      q: `repo:${this.owner}/${this.repo} is:issue is:open ${labelQuery}`
    });

    return issues.data.items;
  }

  // Formatting helper methods
  formatFailedTests(failedTests) {
    return failedTests?.map(test => `- ${test.name}: ${test.error}`).join('\n') || 'No failed tests provided';
  }

  formatPerformanceTable(metrics) {
    return Object.entries(metrics || {})
      .map(([key, data]) => `| ${key} | ${data.baseline} | ${data.current} | ${data.change} | ${data.status} |`)
      .join('\n');
  }

  formatAffectedModulesTable(modules) {
    return modules?.map(module => 
      `| ${module.name} | ${module.coverage}% | ${module.change}% | ${module.status} |`
    ).join('\n') || 'No affected modules';
  }

  formatUncoveredCode(sections) {
    return sections?.map(section => 
      `**${section.file}**\n- Lines: ${section.lines.join(', ')}\n- Functions: ${section.functions.join(', ')}`
    ).join('\n\n') || 'No uncovered code sections identified';
  }

  formatMissingCoverage(missing) {
    return missing?.map(item => `- ${item.type}: ${item.description}`).join('\n') || 'No specific missing coverage identified';
  }

  formatCriticalModulesCoverage(modules) {
    return modules?.map(module => 
      `- **${module.name}**: ${module.coverage}% (threshold: ${module.threshold}%) - ${module.status}`
    ).join('\n') || 'No critical modules data';
  }

  formatRecentFailureLogs(failures) {
    return failures?.slice(0, 3).map(failure => 
      `**${failure.date}**\n\`\`\`\n${failure.error}\n\`\`\``
    ).join('\n\n') || 'No recent failure logs available';
  }

  formatEnvironmentCorrelation(envData) {
    return Object.entries(envData || {})
      .map(([env, data]) => `| ${env} | ${data.failureRate}% | ${data.notes} |`)
      .join('\n');
  }

  // Analysis helper methods
  generateSuggestedActions(failureData) {
    const actions = [];
    
    if (failureData.failureType === 'timeout') {
      actions.push('- Consider increasing test timeout values');
      actions.push('- Check for performance bottlenecks in test code');
    }
    
    if (failureData.failureType === 'assertion') {
      actions.push('- Review test assertions for correctness');
      actions.push('- Verify test data and expected outcomes');
    }
    
    if (failureData.isFlaky) {
      actions.push('- Investigate race conditions and timing issues');
      actions.push('- Add proper test isolation and cleanup');
    }

    return actions.join('\n') || '- Investigate test failure and fix underlying issue';
  }

  generateOptimizationSuggestions(performanceData) {
    const suggestions = [];
    
    if (performanceData.bundleSizeChange > 10) {
      suggestions.push('- Analyze bundle composition for unnecessary dependencies');
      suggestions.push('- Consider code splitting and lazy loading');
    }
    
    if (performanceData.memoryUsageChange > 20) {
      suggestions.push('- Check for memory leaks in recent changes');
      suggestions.push('- Review object lifecycle and cleanup');
    }

    return suggestions.join('\n') || '- Profile and optimize performance bottlenecks';
  }

  generateTestSuggestions(uncoveredSections) {
    const suggestions = [];
    
    uncoveredSections?.forEach(section => {
      suggestions.push(`- Add unit tests for ${section.file}`);
      if (section.functions.length > 0) {
        suggestions.push(`  - Test functions: ${section.functions.join(', ')}`);
      }
    });

    return suggestions.join('\n') || '- Add comprehensive test coverage for uncovered code';
  }

  analyzeErrorPatterns(patterns) {
    return patterns?.map(pattern => 
      `- **${pattern.type}**: ${pattern.description} (${pattern.frequency}% of failures)`
    ).join('\n') || 'No error patterns identified';
  }

  identifyPotentialCauses(flakyData) {
    const causes = [];
    
    if (flakyData.timingVariance > 1000) {
      causes.push('- High timing variance suggests race conditions');
    }
    
    if (flakyData.environmentData?.production?.failureRate > flakyData.environmentData?.staging?.failureRate) {
      causes.push('- Environment-specific issues (production vs staging)');
    }

    return causes.join('\n') || '- Unknown - requires investigation';
  }

  assessCICDImpact(failureRate) {
    if (failureRate > 20) return 'High - Significantly impacts CI/CD reliability';
    if (failureRate > 10) return 'Medium - Moderate impact on pipeline stability';
    return 'Low - Minimal impact on CI/CD operations';
  }

  assessProductivityImpact(failureRate) {
    if (failureRate > 15) return 'High - Developers frequently blocked by false failures';
    if (failureRate > 5) return 'Medium - Occasional developer interruptions';
    return 'Low - Minimal developer productivity impact';
  }

  assessDeploymentImpact(failureRate) {
    if (failureRate > 25) return 'High - Deployment confidence significantly reduced';
    if (failureRate > 10) return 'Medium - Some deployment hesitation';
    return 'Low - Minimal impact on deployment confidence';
  }

  isIssueResolved(issue, resolvedData) {
    // Logic to determine if an issue should be closed based on resolution data
    return resolvedData.resolvedTests?.includes(issue.title) || 
           resolvedData.fixedCommits?.some(commit => issue.body.includes(commit));
  }

  appendToIssueBody(existingBody, updateData) {
    const updateSection = `\n\n---\n\n**Update ${new Date().toISOString()}**\n\n${updateData.message}`;
    return existingBody + updateSection;
  }
}

// CLI interface
if (require.main === module) {
  const issueManager = new IssueManager();
  const action = process.argv[2];
  const dataFile = process.argv[3];

  if (!action || !dataFile) {
    console.error('Usage: node issue-manager.js <action> <data-file>');
    console.error('Actions: test-failure, performance-regression, coverage-regression, flaky-test, close-resolved');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

  (async () => {
    try {
      let result;
      
      switch (action) {
        case 'test-failure':
          result = await issueManager.createTestFailureIssue(data);
          break;
        case 'performance-regression':
          result = await issueManager.createPerformanceRegressionIssue(data);
          break;
        case 'coverage-regression':
          result = await issueManager.createCoverageRegressionIssue(data);
          break;
        case 'flaky-test':
          result = await issueManager.createFlakyTestIssue(data);
          break;
        case 'close-resolved':
          result = await issueManager.closeResolvedIssues(data);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      console.log('Issue management completed:', result?.data?.html_url || 'Success');
    } catch (error) {
      console.error('Issue management failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = IssueManager;