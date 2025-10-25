# CI/CD Workflows Documentation

## Overview

This document provides comprehensive documentation for the GitHub Actions workflows used in the HalluciFix project. Our CI/CD pipeline ensures code quality, security, and performance through automated testing, analysis, and deployment processes.

## Workflow Architecture

### Workflow Hierarchy

```mermaid
graph TB
    A[Code Push/PR] --> B{Event Type}
    B -->|Push to main| C[Main Test Workflow]
    B -->|Pull Request| D[PR Test Workflow]
    B -->|Schedule| E[Scheduled Workflows]
    
    C --> F[Full Test Suite]
    C --> G[Security Scan]
    C --> H[Performance Test]
    C --> I[Deploy to Staging]
    
    D --> J[Smart Test Selection]
    D --> K[Coverage Analysis]
    D --> L[Quality Gates]
    
    E --> M[Nightly Security Scan]
    E --> N[Performance Monitoring]
    E --> O[Dependency Updates]
    
    F --> P[Quality Gates]
    G --> P
    H --> P
    J --> Q[PR Status Check]
    K --> Q
    L --> Q
    
    P -->|Pass| R[Deploy to Production]
    P -->|Fail| S[Block Deployment]
    Q -->|Pass| T[Allow Merge]
    Q -->|Fail| U[Block Merge]
```

## Core Workflows

### 1. Main Test Workflow

**File**: `.github/workflows/test.yml`

**Triggers**:
- Push to `main` branch
- Manual dispatch

**Purpose**: Comprehensive testing and deployment for production releases

#### Workflow Structure

```yaml
name: Main Test Suite

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      skip_e2e:
        description: 'Skip E2E tests'
        required: false
        default: 'false'
        type: boolean

env:
  NODE_VERSION: '18'
  CACHE_VERSION: 'v1'

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      cache-key: ${{ steps.cache-keys.outputs.cache-key }}
      test-matrix: ${{ steps.test-matrix.outputs.matrix }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Generate cache keys
        id: cache-keys
        run: |
          echo "cache-key=deps-${{ env.CACHE_VERSION }}-${{ hashFiles('package-lock.json') }}" >> $GITHUB_OUTPUT
      
      - name: Generate test matrix
        id: test-matrix
        run: |
          echo "matrix=$(node scripts/generate-test-matrix.js)" >> $GITHUB_OUTPUT

  unit-tests:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: |
            node_modules
            ~/.npm
          key: ${{ needs.setup.outputs.cache-key }}
          restore-keys: |
            deps-${{ env.CACHE_VERSION }}-
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit -- --shard=${{ matrix.shard }}/4 --coverage
        env:
          CI: true
      
      - name: Upload coverage
        uses: actions/upload-artifact@v3
        with:
          name: coverage-unit-${{ matrix.shard }}
          path: coverage/
          retention-days: 1

  integration-tests:
    needs: setup
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hallucifix_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup test database
        run: |
          npm run db:migrate:test
          npm run db:seed:test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hallucifix_test
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hallucifix_test
          SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: integration-test-results
          path: test-results/
          retention-days: 7

  e2e-tests:
    needs: setup
    runs-on: ubuntu-latest
    if: github.event.inputs.skip_e2e != 'true'
    
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
        shard: [1, 2, 3]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install ${{ matrix.browser }} --with-deps
      
      - name: Build application
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
      
      - name: Start application
        run: npm run preview &
        env:
          PORT: 3000
      
      - name: Wait for application
        run: npx wait-on http://localhost:3000
      
      - name: Run E2E tests
        run: npx playwright test --project=${{ matrix.browser }} --shard=${{ matrix.shard }}/3
        env:
          BASE_URL: http://localhost:3000
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: e2e-results-${{ matrix.browser }}-${{ matrix.shard }}
          path: |
            test-results/
            playwright-report/
          retention-days: 7

  coverage-analysis:
    needs: [unit-tests, integration-tests]
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Download coverage artifacts
        uses: actions/download-artifact@v3
        with:
          path: coverage-artifacts/
      
      - name: Merge coverage reports
        run: |
          npm install -g nyc
          nyc merge coverage-artifacts/coverage-*/coverage-final.json coverage/coverage-final.json
          nyc report --reporter=lcov --reporter=text-summary
      
      - name: Upload to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: coverage/lcov.info
          flags: unittests,integration
          name: codecov-umbrella
      
      - name: Coverage threshold check
        run: npm run test:coverage:check

  quality-gates:
    needs: [unit-tests, integration-tests, e2e-tests, coverage-analysis]
    runs-on: ubuntu-latest
    if: always()
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Check test results
        run: |
          if [[ "${{ needs.unit-tests.result }}" != "success" ]]; then
            echo "Unit tests failed"
            exit 1
          fi
          if [[ "${{ needs.integration-tests.result }}" != "success" ]]; then
            echo "Integration tests failed"
            exit 1
          fi
          if [[ "${{ needs.e2e-tests.result }}" != "success" && "${{ needs.e2e-tests.result }}" != "skipped" ]]; then
            echo "E2E tests failed"
            exit 1
          fi
          if [[ "${{ needs.coverage-analysis.result }}" != "success" ]]; then
            echo "Coverage analysis failed"
            exit 1
          fi
      
      - name: Quality gate passed
        run: echo "All quality gates passed successfully"

  deploy-staging:
    needs: quality-gates
    runs-on: ubuntu-latest
    environment: staging
    
    steps:
      - name: Deploy to staging
        run: |
          echo "Deploying to staging environment"
          # Add actual deployment steps here
```

### 2. Pull Request Test Workflow

**File**: `.github/workflows/pr-test.yml`

**Triggers**:
- Pull request opened/updated
- Pull request synchronize

**Purpose**: Optimized testing for pull requests with smart test selection

#### Key Features

1. **File Change Detection**: Analyzes changed files to determine test scope
2. **Risk-Based Testing**: Runs additional tests for high-risk changes
3. **Parallel Execution**: Optimizes test execution time
4. **PR Comments**: Provides detailed feedback on test results

```yaml
name: PR Test Suite

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

jobs:
  analyze-changes:
    runs-on: ubuntu-latest
    outputs:
      test-scope: ${{ steps.analyze.outputs.test-scope }}
      risk-level: ${{ steps.analyze.outputs.risk-level }}
      changed-files: ${{ steps.analyze.outputs.changed-files }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Analyze changes
        id: analyze
        run: |
          node scripts/analyze-pr-changes.js \
            --base=${{ github.event.pull_request.base.sha }} \
            --head=${{ github.event.pull_request.head.sha }}

  smart-test-selection:
    needs: analyze-changes
    runs-on: ubuntu-latest
    strategy:
      matrix:
        test-type: ${{ fromJson(needs.analyze-changes.outputs.test-scope) }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run selected tests
        run: |
          case "${{ matrix.test-type }}" in
            "unit")
              npm run test:unit:changed -- ${{ needs.analyze-changes.outputs.changed-files }}
              ;;
            "integration")
              npm run test:integration:changed -- ${{ needs.analyze-changes.outputs.changed-files }}
              ;;
            "e2e")
              npm run test:e2e:changed -- ${{ needs.analyze-changes.outputs.changed-files }}
              ;;
          esac

  pr-feedback:
    needs: [analyze-changes, smart-test-selection]
    runs-on: ubuntu-latest
    if: always()
    
    steps:
      - name: Generate PR comment
        uses: actions/github-script@v6
        with:
          script: |
            const { generatePRComment } = require('./scripts/pr-comment-generator.js');
            
            const comment = await generatePRComment({
              testResults: '${{ needs.smart-test-selection.result }}',
              riskLevel: '${{ needs.analyze-changes.outputs.risk-level }}',
              changedFiles: '${{ needs.analyze-changes.outputs.changed-files }}'
            });
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### 3. Performance Monitoring Workflow

**File**: `.github/workflows/performance.yml`

**Triggers**:
- Schedule (daily)
- Manual dispatch
- Push to main (performance-critical changes)

**Purpose**: Continuous performance monitoring and regression detection

```yaml
name: Performance Monitoring

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'src/lib/**'
      - 'src/components/**'
      - 'package*.json'

jobs:
  performance-benchmarks:
    runs-on: ubuntu-latest-4-cores
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
      
      - name: Run performance benchmarks
        run: npm run test:performance
        env:
          BENCHMARK_ITERATIONS: 10
          PERFORMANCE_BUDGET: 2000  # 2 seconds
      
      - name: Analyze bundle size
        run: |
          npm run analyze:bundle
          node scripts/bundle-size-check.js
      
      - name: Run Lighthouse CI
        run: |
          npm install -g @lhci/cli
          lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
      
      - name: Performance regression check
        run: node scripts/performance-regression-check.js
        env:
          BASELINE_BRANCH: main
          THRESHOLD_PERCENTAGE: 10  # 10% regression threshold

  load-testing:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup test environment
        run: |
          docker-compose -f docker-compose.test.yml up -d
          sleep 30  # Wait for services to start
      
      - name: Run load tests
        run: |
          npm install -g artillery
          artillery run e2e/load-tests/analysis-workflow.yml
          artillery run e2e/load-tests/concurrent-users.yml
      
      - name: Generate load test report
        run: |
          node scripts/load-test-analyzer.js
          
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: |
            performance-results/
            lighthouse-results/
            load-test-results/
```

### 4. Security Scanning Workflow

**File**: `.github/workflows/security.yml`

**Triggers**:
- Schedule (daily)
- Push to main
- Pull request (security-sensitive files)

**Purpose**: Automated security vulnerability detection and compliance checking

```yaml
name: Security Scanning

on:
  schedule:
    - cron: '0 1 * * *'  # Daily at 1 AM UTC
  push:
    branches: [main]
  pull_request:
    paths:
      - 'package*.json'
      - '.github/workflows/**'
      - 'src/lib/auth/**'
      - 'src/lib/security/**'

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run npm audit
        run: |
          npm audit --audit-level=moderate --json > audit-results.json
          node scripts/audit-analyzer.js
      
      - name: Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=medium
      
      - name: Upload security results
        uses: actions/upload-artifact@v3
        with:
          name: security-scan-results
          path: |
            audit-results.json
            snyk-results.json

  code-security-analysis:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: javascript
          queries: security-and-quality
      
      - name: Autobuild
        uses: github/codeql-action/autobuild@v2
      
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2

  secret-scanning:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Run TruffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD
          extra_args: --debug --only-verified

  security-compliance:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: OWASP ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.7.0
        with:
          target: 'http://localhost:3000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'
```

## Workflow Optimization

### Caching Strategy

#### Dependency Caching
```yaml
- name: Cache dependencies
  uses: actions/cache@v3
  with:
    path: |
      node_modules
      ~/.npm
      ~/.cache/Cypress
    key: deps-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      deps-${{ runner.os }}-
```

#### Build Artifact Caching
```yaml
- name: Cache build artifacts
  uses: actions/cache@v3
  with:
    path: |
      dist/
      .vite/
    key: build-${{ runner.os }}-${{ hashFiles('src/**/*', 'package.json') }}
    restore-keys: |
      build-${{ runner.os }}-
```

#### Test Result Caching
```yaml
- name: Cache test results
  uses: actions/cache@v3
  with:
    path: |
      coverage/
      test-results/
    key: tests-${{ runner.os }}-${{ hashFiles('src/**/*.test.*', 'e2e/**/*.spec.*') }}
```

### Parallel Execution

#### Matrix Strategy for Cross-Browser Testing
```yaml
strategy:
  matrix:
    browser: [chromium, firefox, webkit]
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [16, 18, 20]
  fail-fast: false
```

#### Test Sharding
```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - name: Run tests
    run: npm test -- --shard=${{ matrix.shard }}/4
```

## Notification and Reporting

### Slack Integration

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
    channel: '#dev-alerts'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
    fields: repo,message,commit,author,action,eventName,ref,workflow
```

### GitHub Issue Creation

```yaml
- name: Create issue on failure
  if: failure()
  uses: actions/github-script@v6
  with:
    script: |
      github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: 'Test Failure: ${{ github.workflow }}',
        body: `
          **Workflow**: ${{ github.workflow }}
          **Run**: ${{ github.run_id }}
          **Commit**: ${{ github.sha }}
          **Author**: ${{ github.actor }}
          
          [View Run](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }})
        `,
        labels: ['bug', 'ci-failure']
      });
```

### Test Result Comments

```yaml
- name: Comment PR with test results
  uses: actions/github-script@v6
  with:
    script: |
      const fs = require('fs');
      const testResults = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));
      
      const comment = `
      ## Test Results 📊
      
      - ✅ Unit Tests: ${testResults.unit.passed}/${testResults.unit.total}
      - ✅ Integration Tests: ${testResults.integration.passed}/${testResults.integration.total}
      - ✅ E2E Tests: ${testResults.e2e.passed}/${testResults.e2e.total}
      
      **Coverage**: ${testResults.coverage.percentage}%
      **Performance**: ${testResults.performance.score}/100
      `;
      
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: comment
      });
```

## Environment Management

### Environment Variables

#### Development Environment
```yaml
env:
  NODE_ENV: development
  VITE_SUPABASE_URL: ${{ secrets.SUPABASE_DEV_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_DEV_ANON_KEY }}
  GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID_DEV }}
```

#### Production Environment
```yaml
env:
  NODE_ENV: production
  VITE_SUPABASE_URL: ${{ secrets.SUPABASE_PROD_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_PROD_ANON_KEY }}
  GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID_PROD }}
```

### Secret Management

#### Required Secrets
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `STRIPE_PUBLISHABLE_KEY`: Stripe publishable key
- `STRIPE_SECRET_KEY`: Stripe secret key
- `CODECOV_TOKEN`: Codecov upload token
- `SLACK_WEBHOOK`: Slack notification webhook

## Troubleshooting

### Common Issues

#### Test Timeouts
```yaml
- name: Run tests with extended timeout
  run: npm test
  timeout-minutes: 30
```

#### Memory Issues
```yaml
- name: Run tests with increased memory
  run: node --max-old-space-size=4096 ./node_modules/.bin/vitest
```

#### Flaky Test Handling
```yaml
- name: Run tests with retry
  run: npm test -- --retry=3
```

### Debugging Workflows

#### Enable Debug Logging
```yaml
env:
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true
```

#### Artifact Collection for Debugging
```yaml
- name: Upload debug artifacts
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: debug-artifacts
    path: |
      logs/
      screenshots/
      videos/
      coverage/
```

## Monitoring and Analytics

### Workflow Metrics

#### Success Rate Tracking
```yaml
- name: Track workflow metrics
  run: |
    node scripts/track-workflow-metrics.js \
      --workflow="${{ github.workflow }}" \
      --status="${{ job.status }}" \
      --duration="${{ steps.test.outputs.duration }}"
```

#### Performance Tracking
```yaml
- name: Track performance metrics
  run: |
    echo "test_duration=${{ steps.test.outputs.duration }}" >> $GITHUB_OUTPUT
    echo "coverage_percentage=${{ steps.coverage.outputs.percentage }}" >> $GITHUB_OUTPUT
```

### Dashboard Integration

#### GitHub Pages Dashboard
```yaml
- name: Update dashboard
  run: |
    node scripts/update-dashboard.js \
      --results="test-results.json" \
      --coverage="coverage-summary.json"
    
    git config --local user.email "action@github.com"
    git config --local user.name "GitHub Action"
    git add docs/dashboard/
    git commit -m "Update test dashboard" || exit 0
    git push origin gh-pages
```

This comprehensive CI/CD workflow documentation provides the foundation for maintaining and extending the automated testing and deployment pipeline for the HalluciFix project.