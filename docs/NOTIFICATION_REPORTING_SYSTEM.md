# Notification and Reporting System

This document describes the comprehensive notification and reporting system implemented for the HalluciFix test infrastructure.

## Overview

The notification and reporting system provides automated issue management, real-time dashboards, and weekly health reports to maintain high code quality and test reliability.

## Components

### 1. Automated Issue Management

**Location**: `.github/actions/issue-management/`

**Features**:
- Automatic issue creation for test failures, coverage regressions, performance issues, and flaky tests
- Issue templates with detailed context and debugging information
- Automatic assignment based on CODEOWNERS
- Issue lifecycle management with automatic closure when resolved

**Issue Types**:
- **Test Failures**: Created when tests fail with error details and stack traces
- **Coverage Regressions**: Created when coverage drops below thresholds
- **Performance Regressions**: Created when performance metrics degrade
- **Flaky Tests**: Created when tests show intermittent failure patterns

### 2. Test Dashboard

**Location**: `docs/dashboard/`

**Features**:
- Real-time test metrics and trends
- Coverage analysis and visualization
- Performance monitoring with Web Vitals
- Flaky test identification and tracking
- Interactive charts and historical data

**Access**: Deployed to GitHub Pages at `https://your-org.github.io/hallucifix/`

**Data Sources**:
- GitHub Actions workflow runs
- Test result artifacts
- Coverage reports
- Performance metrics

### 3. Weekly Health Reports

**Location**: `scripts/weekly-report-generator.js`

**Features**:
- Comprehensive weekly analysis of test health
- Actionable insights and recommendations
- Trend analysis and quality metrics
- Automatic publication as GitHub issues
- Team notifications via Slack and email

**Schedule**: Generated every Monday at 9 AM UTC

## Configuration

### Environment Variables

```bash
# Required for issue management
GITHUB_TOKEN=<github_token>
GITHUB_REPOSITORY_OWNER=<org_name>
GITHUB_REPOSITORY_NAME=<repo_name>

# Optional for notifications
SLACK_WEBHOOK_URL=<slack_webhook>
EMAIL_USERNAME=<email_username>
EMAIL_PASSWORD=<email_password>
TEAM_EMAIL_LIST=<comma_separated_emails>
```

### CODEOWNERS Configuration

The `.github/CODEOWNERS` file defines automatic issue assignment:

```
# Global Owners
* @team-leads

# Frontend Components
/src/components/ @frontend-team @ui-team

# Backend Services
/src/lib/ @backend-team @api-team

# Testing Infrastructure
/src/test/ @qa-team @testing-team
/.github/workflows/ @devops-team @ci-cd-team
```

## Usage

### Manual Issue Creation

```bash
# Create test failure issue
node scripts/issue-manager.js test-failure test-failure-data.json

# Create coverage regression issue
node scripts/issue-manager.js coverage-regression coverage-data.json

# Create performance regression issue
node scripts/issue-manager.js performance-regression performance-data.json

# Create flaky test issue
node scripts/issue-manager.js flaky-test flaky-test-data.json
```

### Dashboard Data Generation

```bash
# Generate dashboard data
node scripts/dashboard-data-generator.js

# Generate weekly report
node scripts/weekly-report-generator.js
```

### Workflow Integration

The system integrates with existing workflows:

```yaml
# Add to any test workflow
- name: Analyze and manage issues
  uses: ./.github/actions/issue-management
  with:
    action-type: 'analyze'
    test-results-path: 'test-results'
    coverage-path: 'coverage'
    performance-path: 'performance-report'
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Data Formats

### Test Failure Data

```json
{
  "testSuite": "Unit Tests",
  "failureType": "assertion",
  "testName": "should validate user input",
  "errorMessage": "Expected true but got false",
  "stackTrace": "...",
  "testFramework": "vitest",
  "affectedFiles": ["src/components/Form.tsx"],
  "severity": "medium"
}
```

### Coverage Regression Data

```json
{
  "globalCoverage": 78.5,
  "previousCoverage": 82.1,
  "coverageDrop": 3.6,
  "threshold": 80,
  "status": "FAILED",
  "affectedModules": [
    {
      "name": "src/lib/api.ts",
      "coverage": 75.2,
      "change": -5.8,
      "status": "CRITICAL"
    }
  ]
}
```

### Performance Regression Data

```json
{
  "metricName": "Bundle Size",
  "currentValue": "2.1 MB",
  "baselineValue": "1.8 MB",
  "regressionPercentage": "16.7",
  "thresholdValue": "2.0 MB",
  "severity": "high"
}
```

## Notification Channels

### Slack Integration

- Real-time test result notifications
- Weekly report summaries
- Critical failure alerts
- Dashboard deployment notifications

### Email Notifications

- Weekly health reports
- Critical issue alerts
- Team distribution lists

### GitHub Integration

- Automatic issue creation
- PR comment integration
- Team discussions
- Issue lifecycle management

## Monitoring and Maintenance

### Dashboard Updates

- Automatic data refresh every hour
- Real-time updates after test runs
- Performance metric tracking
- Historical trend analysis

### Report Generation

- Weekly reports generated automatically
- Manual report generation available
- Historical report archive
- Trend analysis and insights

### Issue Management

- Automatic issue creation and assignment
- Resolution tracking and closure
- Pattern analysis and recommendations
- Escalation for critical issues

## Troubleshooting

### Common Issues

1. **Missing Dependencies**
   ```bash
   npm install @octokit/rest glob
   ```

2. **Permission Errors**
   - Ensure GITHUB_TOKEN has appropriate permissions
   - Check repository settings for Actions permissions

3. **Dashboard Not Updating**
   - Verify GitHub Pages is enabled
   - Check workflow artifacts are being generated
   - Validate data generation scripts

4. **Notifications Not Sending**
   - Verify webhook URLs and credentials
   - Check notification service configurations
   - Review workflow logs for errors

### Debug Commands

```bash
# Test issue creation
node scripts/issue-manager.js test-failure test-data.json

# Validate dashboard data
node scripts/dashboard-data-generator.js

# Generate test report
node scripts/weekly-report-generator.js

# Check workflow status
gh workflow list
gh run list --workflow="Comprehensive Test Suite"
```

## Best Practices

1. **Issue Management**
   - Keep issue templates updated
   - Review and update CODEOWNERS regularly
   - Monitor issue resolution times

2. **Dashboard Maintenance**
   - Regular data validation
   - Performance optimization
   - User feedback integration

3. **Report Quality**
   - Actionable insights
   - Clear recommendations
   - Trend analysis
   - Team engagement

4. **Notification Hygiene**
   - Avoid notification fatigue
   - Prioritize critical alerts
   - Regular channel maintenance

## Future Enhancements

- Integration with external monitoring tools
- Advanced analytics and ML-based insights
- Custom notification rules and filters
- Enhanced dashboard visualizations
- Mobile-responsive dashboard improvements

## Support

For questions or issues with the notification and reporting system:

1. Check the troubleshooting section above
2. Review workflow logs in GitHub Actions
3. Create an issue with the `notification-system` label
4. Contact the DevOps team for urgent issues

---

*This documentation is maintained by the DevOps and QA teams. Last updated: $(date)*