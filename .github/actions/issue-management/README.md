# Issue Management Action

This GitHub Action provides automated issue creation and management for workflow failures, security incidents, and CI/CD pipeline issues.

## Features

- **Automated Issue Creation**: Creates issues for workflow failures with proper categorization and labeling
- **Security Incident Handling**: Special handling for security-related failures with urgent notifications
- **Duplicate Prevention**: Checks for existing similar issues to prevent spam
- **Issue Analysis**: Analyzes test results, coverage, and performance data to create detailed reports
- **Intelligent Labeling**: Automatically applies appropriate labels based on failure type and severity
- **Team Assignment**: Assigns issues to appropriate teams based on failure type
- **Slack Integration**: Optional Slack notifications for critical issues

## Usage

### Basic Failure Issue Creation

```yaml
- name: Create failure issue
  uses: ./.github/actions/issue-management
  with:
    action-type: 'create-failure-issue'
    workflow-name: ${{ github.workflow }}
    failure-type: 'test-failure'
    severity: 'medium'
    failure-details: 'Detailed error information here'
    github-token: ${{ secrets.GITHUB_TOKEN }}
    assignees: 'qa-team,core-developers'
    labels: 'test-failure,needs-investigation'
```

### Security Issue Creation

```yaml
- name: Create security issue
  uses: ./.github/actions/issue-management
  with:
    action-type: 'create-security-issue'
    workflow-name: ${{ github.workflow }}
    failure-type: 'security-violation'
    severity: 'critical'
    failure-details: 'Security vulnerability detected'
    github-token: ${{ secrets.GITHUB_TOKEN }}
    assignees: 'security-team'
    labels: 'security,critical,vulnerability'
```

### Result Analysis

```yaml
- name: Analyze test results
  uses: ./.github/actions/issue-management
  with:
    action-type: 'analyze'
    test-results-path: 'test-results'
    coverage-path: 'coverage'
    performance-path: 'performance-report'
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `action-type` | Type of action to perform | Yes | - |
| `workflow-name` | Name of the workflow | No | `${{ github.workflow }}` |
| `failure-type` | Type of failure detected | No | `build-failure` |
| `severity` | Severity level (low/medium/high/critical) | No | `medium` |
| `failure-details` | Detailed failure information | No | - |
| `test-results-path` | Path to test results | No | `test-results` |
| `coverage-path` | Path to coverage reports | No | `coverage` |
| `performance-path` | Path to performance reports | No | `performance-report` |
| `github-token` | GitHub token for API access | Yes | - |
| `slack-webhook` | Slack webhook URL | No | - |
| `assignees` | Comma-separated list of assignees | No | - |
| `labels` | Comma-separated list of labels | No | - |
| `issue-number` | Issue number for update/close operations | No | - |
| `dry-run` | Run without making changes | No | `false` |

## Action Types

### `create-failure-issue`
Creates a new issue for workflow failures. Checks for existing similar issues and updates them instead of creating duplicates.

### `create-security-issue`
Creates a security incident issue with high priority labeling and urgent notifications.

### `update-issue`
Updates an existing issue with new information.

### `close-issue`
Closes an issue with a resolution comment.

### `analyze`
Analyzes test results, coverage, and performance data. Creates issues for significant problems automatically.

## Failure Types

- `build-failure`: Build or compilation failures
- `test-failure`: Unit, integration, or E2E test failures
- `deployment-failure`: Deployment or environment setup failures
- `security-violation`: Security scans or vulnerability detection
- `dependency-vulnerability`: Dependency security issues
- `configuration-error`: Configuration or setup errors

## Severity Levels

- `low`: Minor issues that don't block development
- `medium`: Moderate issues that may impact workflows
- `high`: Significant issues that block important workflows
- `critical`: Severe issues that block deployments or pose security risks

## Outputs

| Output | Description |
|--------|-------------|
| `issue-number` | Number of the created/updated issue |
| `issue-url` | URL of the created/updated issue |
| `action-taken` | Description of the action performed |
| `analysis-summary` | Summary of analysis results (for analyze action) |

## Automatic Team Assignment

The action automatically assigns issues to appropriate teams based on failure type:

- `security-violation`: security-team
- `deployment-failure`: devops-team
- `test-failure`: qa-team
- `build-failure`: core-developers

## Issue Labels

Issues are automatically labeled with:

- **Base labels**: `ci-failure`, `automated-issue`
- **Severity labels**: `severity-low`, `severity-medium`, `severity-high`, `severity-critical`
- **Type labels**: Based on failure type (e.g., `test-failure`, `security-violation`)
- **Workflow labels**: `workflow-{workflow-name}`
- **Custom labels**: Any additional labels specified in inputs

## Duplicate Prevention

The action searches for existing open issues with similar characteristics:

- Same workflow name
- Same failure type
- Created within the last 24 hours

If a similar issue is found, it updates the existing issue instead of creating a new one.

## Slack Integration

When a Slack webhook URL is provided, the action sends notifications for:

- New issue creation
- Security incidents (with urgent formatting)
- Critical failures

## Security Considerations

- The action requires `issues: write` permission
- GitHub token should have appropriate repository access
- Slack webhook URL should be stored as a secret
- Sensitive information is automatically redacted from issue descriptions

## Error Handling

The action includes comprehensive error handling:

- Graceful failure for missing artifacts or data
- Retry logic for API calls
- Detailed error logging
- Continues execution even if optional features fail

## Examples

### Integration with Test Workflow

```yaml
- name: Create test failure issue
  if: failure()
  uses: ./.github/actions/issue-management
  with:
    action-type: 'create-failure-issue'
    workflow-name: 'Test Suite'
    failure-type: 'test-failure'
    severity: ${{ steps.determine-severity.outputs.severity }}
    failure-details: |
      Test failures detected:
      - Unit Tests: ${{ needs.unit-tests.result }}
      - Integration Tests: ${{ needs.integration-tests.result }}
      - Coverage: ${{ steps.coverage.outputs.percentage }}%
    github-token: ${{ secrets.GITHUB_TOKEN }}
    assignees: 'qa-team'
```

### Integration with Security Workflow

```yaml
- name: Handle security failure
  if: failure()
  uses: ./.github/actions/issue-management
  with:
    action-type: 'create-security-issue'
    workflow-name: 'Security Scanning'
    failure-type: 'security-violation'
    severity: 'critical'
    failure-details: |
      Security scan failures:
      - Dependency Scan: ${{ needs.dependency-scan.result }}
      - Secret Scan: ${{ needs.secret-scan.result }}
      - CodeQL: ${{ needs.codeql.result }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    slack-webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Development

### Local Testing

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint
```

### Contributing

1. Make changes to the action code
2. Update tests if needed
3. Update documentation
4. Test with dry-run mode first
5. Submit pull request

## License

MIT License - see LICENSE file for details.