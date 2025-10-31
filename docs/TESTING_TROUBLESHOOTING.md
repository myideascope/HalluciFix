# Testing Troubleshooting Guide

## Overview

This guide provides solutions to common testing issues encountered in the HalluciFix project. It covers debugging techniques, common error patterns, and step-by-step resolution procedures.

## Quick Diagnosis

### Test Failure Checklist

1. **Check test output**: Look for specific error messages
2. **Verify environment**: Ensure all required environment variables are set
3. **Check dependencies**: Verify all packages are installed and up-to-date
4. **Review recent changes**: Identify what changed since tests last passed
5. **Run tests locally**: Reproduce the issue in your development environment

### Common Error Patterns

```bash
# Quick diagnostic commands
npm run test:debug          # Run tests with debug output
npm run test:verbose        # Run tests with verbose logging
npm run test:single <file>  # Run a single test file
npm run test:watch          # Run tests in watch mode for debugging
```

## Unit Test Issues

### Component Testing Problems

#### Issue: Component Not Rendering

**Error Message**:
```
TestingLibraryElementError: Unable to find an element with the text: "Expected Text"
```

**Common Causes**:
- Missing test wrapper (AuthProvider, QueryClient, etc.)
- Async rendering not awaited
- Incorrect test data setup

**Solution**:
```typescript
// ❌ Incorrect - Missing wrapper
render(<Dashboard />);

// ✅ Correct - With proper wrapper
render(
  <TestWrapper user={mockUser}>
    <Dashboard />
  </TestWrapper>
);

// ✅ Correct - Awaiting async rendering
await waitFor(() => {
  expect(screen.getByText('Dashboard')).toBeInTheDocument();
});
```

#### Issue: Mock Functions Not Working

**Error Message**:
```
AssertionError: expected "spy" to be called with arguments: [ "test@example.com" ]
```

**Common Causes**:
- Mock not properly configured
- Mock cleared between tests
- Wrong mock assertion

**Solution**:
```typescript
// ❌ Incorrect - Mock not configured
const mockLogin = vi.fn();

// ✅ Correct - Mock with return value
const mockLogin = vi.fn().mockResolvedValue({ user: mockUser });

// ✅ Correct - Proper assertion
expect(mockLogin).toHaveBeenCalledWith({
  email: 'test@example.com',
  password: 'password123'
});

// ✅ Correct - Clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

#### Issue: Async Operations Not Completing

**Error Message**:
```
Error: Timeout - Async callback was not invoked within the 5000 ms timeout
```

**Common Causes**:
- Missing await in test
- Promises not properly mocked
- Infinite loading states

**Solution**:
```typescript
// ❌ Incorrect - Missing await
it('should load data', () => {
  render(<DataComponent />);
  expect(screen.getByText('Data loaded')).toBeInTheDocument();
});

// ✅ Correct - Proper async handling
it('should load data', async () => {
  render(<DataComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Data loaded')).toBeInTheDocument();
  });
});

// ✅ Correct - Mock async functions
const mockFetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve(mockData)
});
```

### Service Layer Testing Problems

#### Issue: Supabase Client Mocking

**Error Message**:
```
TypeError: Cannot read properties of undefined (reading 'from')
```

**Common Causes**:
- Incomplete Supabase mock
- Mock not matching actual API structure
- Missing mock methods

**Solution**:
```typescript
// ❌ Incorrect - Incomplete mock
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}));

// ✅ Correct - Complete mock structure
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockData, error: null })
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn()
    }
  }
}));
```

#### Issue: Environment Variables in Tests

**Error Message**:
```
ReferenceError: process is not defined
```

**Common Causes**:
- Missing environment variable setup
- Incorrect variable access in browser environment
- Test environment not configured

**Solution**:
```typescript
// ✅ Setup test environment variables
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-key'
    }
  }
});

// ✅ Mock environment in tests
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
});
```

## Integration Test Issues

### Database Connection Problems

#### Issue: Database Connection Refused

**Error Message**:
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Common Causes**:
- PostgreSQL not running
- Wrong connection parameters
- Database not initialized

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Start PostgreSQL (macOS with Homebrew)
brew services start postgresql

# Start PostgreSQL (Linux)
sudo systemctl start postgresql

# Docker PostgreSQL for testing
docker run --name test-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hallucifix_test \
  -p 5432:5432 \
  -d postgres:15

# Verify connection
psql -h localhost -p 5432 -U postgres -d hallucifix_test
```

#### Issue: Database Schema Not Found

**Error Message**:
```
Error: relation "analyses" does not exist
```

**Common Causes**:
- Migrations not run
- Wrong database selected
- Schema not created

**Solution**:
```bash
# Run database migrations
npm run db:migrate:test

# Reset test database
npm run db:reset:test

# Check current schema
psql -h localhost -p 5432 -U postgres -d hallucifix_test -c "\dt"

# Manual migration (if needed)
psql -h localhost -p 5432 -U postgres -d hallucifix_test < supabase/migrations/latest.sql
```

### API Integration Issues

#### Issue: MSW Handlers Not Matching

**Error Message**:
```
Warning: captured a request without a matching request handler
```

**Common Causes**:
- Handler URL doesn't match request
- HTTP method mismatch
- Missing handler setup

**Solution**:
```typescript
// ✅ Correct handler setup
// src/test/mocks/handlers.ts
export const handlers = [
  rest.get('/rest/v1/analyses', (req, res, ctx) => {
    return res(ctx.json(mockAnalyses));
  }),
  
  rest.post('/rest/v1/analyses', (req, res, ctx) => {
    return res(ctx.json(mockAnalysis));
  }),
  
  // Catch-all for unhandled requests
  rest.all('*', (req, res, ctx) => {
    console.warn(`Unhandled ${req.method} request to ${req.url}`);
    return res(ctx.status(404));
  })
];

// ✅ Setup MSW in tests
// src/test/setup.ts
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## End-to-End Test Issues

### Playwright Configuration Problems

#### Issue: Browser Not Found

**Error Message**:
```
Error: Executable doesn't exist at /path/to/browser
```

**Common Causes**:
- Browsers not installed
- Incorrect Playwright installation
- Path issues

**Solution**:
```bash
# Install Playwright browsers
npx playwright install

# Install specific browser
npx playwright install chromium

# Install with dependencies (Linux)
npx playwright install --with-deps

# Check installed browsers
npx playwright --version
```

#### Issue: Test Timeout

**Error Message**:
```
Test timeout of 30000ms exceeded
```

**Common Causes**:
- Slow application startup
- Network requests taking too long
- Infinite loading states

**Solution**:
```typescript
// ✅ Increase timeout for specific test
test('slow operation', async ({ page }) => {
  // Test code
}, { timeout: 60000 });

// ✅ Global timeout configuration
// playwright.config.ts
export default defineConfig({
  timeout: 30000,
  expect: {
    timeout: 10000
  },
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000
  }
});

// ✅ Wait for specific conditions
await page.waitForLoadState('networkidle');
await page.waitForSelector('[data-testid="content-loaded"]');
```

### Element Selection Issues

#### Issue: Element Not Found

**Error Message**:
```
Error: Locator.click: No such element
```

**Common Causes**:
- Element not rendered yet
- Incorrect selector
- Element hidden or disabled

**Solution**:
```typescript
// ❌ Incorrect - Element might not be ready
await page.click('button');

// ✅ Correct - Wait for element
await page.waitForSelector('button');
await page.click('button');

// ✅ Correct - Use more specific selectors
await page.click('[data-testid="submit-button"]');
await page.click('button:has-text("Submit")');

// ✅ Correct - Check element state
const button = page.locator('button');
await expect(button).toBeVisible();
await expect(button).toBeEnabled();
await button.click();
```

### Authentication Issues in E2E Tests

#### Issue: Login Not Persisting

**Error Message**:
```
Error: User not authenticated in test
```

**Common Causes**:
- Session not properly stored
- Cookies not persisted
- Authentication state cleared

**Solution**:
```typescript
// ✅ Proper authentication setup
// e2e/utils/auth.ts
export async function authenticateUser(page: Page) {
  await page.goto('/login');
  
  await page.fill('[data-testid="email"]', 'test@example.com');
  await page.fill('[data-testid="password"]', 'password123');
  await page.click('[data-testid="login-button"]');
  
  // Wait for redirect to dashboard
  await page.waitForURL('/dashboard');
  
  // Verify authentication
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
}

// ✅ Use authentication state
// playwright.config.ts
export default defineConfig({
  use: {
    storageState: 'e2e/auth/user.json'
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    }
  ]
});
```

## Performance Test Issues

### Load Testing Problems

#### Issue: High Response Times

**Error Message**:
```
Error: Response time exceeded threshold (5000ms > 2000ms)
```

**Common Causes**:
- Database performance issues
- Unoptimized queries
- Resource constraints

**Solution**:
```bash
# Check database performance
npm run db:analyze

# Monitor resource usage during tests
htop  # or Activity Monitor on macOS

# Run performance profiling
npm run test:performance:profile

# Check for memory leaks
node --inspect-brk ./node_modules/.bin/vitest --run
```

#### Issue: Flaky Performance Tests

**Error Message**:
```
Error: Performance test results inconsistent
```

**Common Causes**:
- System load variations
- Network fluctuations
- Insufficient warm-up

**Solution**:
```typescript
// ✅ Proper performance test setup
describe('Performance Tests', () => {
  beforeEach(async () => {
    // Warm-up requests
    for (let i = 0; i < 5; i++) {
      await fetch('/api/health');
    }
    
    // Clear caches
    await clearApplicationCache();
    
    // Wait for system to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  
  it('should respond within threshold', async () => {
    const measurements = [];
    
    // Take multiple measurements
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await fetch('/api/analyses');
      const end = performance.now();
      measurements.push(end - start);
    }
    
    // Use median instead of single measurement
    const median = measurements.sort()[Math.floor(measurements.length / 2)];
    expect(median).toBeLessThan(2000);
  });
});
```

## CI/CD Pipeline Issues

### GitHub Actions Failures

#### Issue: Workflow Not Triggering

**Common Causes**:
- Incorrect trigger configuration
- Branch protection rules
- Workflow file syntax errors

**Solution**:
```yaml
# ✅ Check workflow syntax
name: Test Suite
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

# ✅ Debug workflow triggers
- name: Debug workflow context
  run: |
    echo "Event: ${{ github.event_name }}"
    echo "Ref: ${{ github.ref }}"
    echo "Actor: ${{ github.actor }}"
```

#### Issue: Environment Variables Not Available

**Error Message**:
```
Error: Environment variable SUPABASE_URL is not defined
```

**Common Causes**:
- Secrets not configured
- Wrong secret names
- Environment not specified

**Solution**:
```yaml
# ✅ Proper secret configuration
jobs:
  test:
    runs-on: ubuntu-latest
    environment: testing  # Specify environment
    
    steps:
      - name: Run tests
        run: npm test
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

# ✅ Debug available environment variables
- name: Debug environment
  run: env | grep -E '^(SUPABASE|VITE)_'
```

### Dependency Issues

#### Issue: Package Installation Failures

**Error Message**:
```
npm ERR! peer dep missing: react@^18.0.0
```

**Common Causes**:
- Peer dependency conflicts
- Node version mismatch
- Package lock file issues

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall dependencies
npm install

# Check for peer dependency issues
npm ls

# Update dependencies
npm update

# Fix peer dependencies
npm install --legacy-peer-deps
```

## Debugging Techniques

### Test Debugging Tools

#### Using Debug Mode

```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test with debugging
npm test -- --reporter=verbose src/components/Dashboard.test.tsx

# Run tests with Node.js inspector
node --inspect-brk ./node_modules/.bin/vitest --run
```

#### Browser Debugging for E2E Tests

```typescript
// ✅ Debug Playwright tests
test('debug test', async ({ page }) => {
  // Pause execution for debugging
  await page.pause();
  
  // Take screenshot
  await page.screenshot({ path: 'debug-screenshot.png' });
  
  // Record video
  const context = await browser.newContext({
    recordVideo: { dir: 'videos/' }
  });
});

// ✅ Run in headed mode
npx playwright test --headed --debug
```

### Logging and Monitoring

#### Test Logging Setup

```typescript
// src/test/utils/logger.ts
export const testLogger = {
  info: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'test') {
      console.log(`[TEST INFO] ${message}`, data || '');
    }
  },
  
  error: (message: string, error?: any) => {
    console.error(`[TEST ERROR] ${message}`, error || '');
  },
  
  debug: (message: string, data?: any) => {
    if (process.env.DEBUG) {
      console.log(`[TEST DEBUG] ${message}`, data || '');
    }
  }
};

// Usage in tests
it('should process data', async () => {
  testLogger.info('Starting data processing test');
  
  const result = await processData(testData);
  testLogger.debug('Processing result', result);
  
  expect(result).toBeDefined();
});
```

## Prevention Strategies

### Code Quality Gates

#### Pre-commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "pre-push": "npm run test:quick"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write",
      "npm run test:related"
    ]
  }
}
```

#### Test Coverage Enforcement

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        'src/lib/': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    }
  }
});
```

### Monitoring and Alerting

#### Test Health Monitoring

```typescript
// scripts/test-health-monitor.js
const testResults = require('./test-results.json');

const healthMetrics = {
  successRate: testResults.passed / testResults.total,
  averageDuration: testResults.duration / testResults.total,
  flakyTests: testResults.flaky.length,
  coveragePercentage: testResults.coverage.percentage
};

// Alert if health metrics are below threshold
if (healthMetrics.successRate < 0.95) {
  console.error('Test success rate below 95%');
  process.exit(1);
}

if (healthMetrics.flakyTests > 5) {
  console.warn(`${healthMetrics.flakyTests} flaky tests detected`);
}
```

## Getting Help

### Internal Resources

1. **Team Slack Channel**: #dev-testing
2. **Documentation**: Check docs/ directory for latest guides
3. **Code Reviews**: Ask team members for testing best practices
4. **Office Hours**: Weekly testing support sessions

### External Resources

1. **Vitest Documentation**: https://vitest.dev/
2. **React Testing Library**: https://testing-library.com/docs/react-testing-library/intro/
3. **Playwright Documentation**: https://playwright.dev/
4. **MSW Documentation**: https://mswjs.io/

### Escalation Process

1. **Level 1**: Check this troubleshooting guide
2. **Level 2**: Search team knowledge base and Slack history
3. **Level 3**: Ask in team Slack channel with error details
4. **Level 4**: Create GitHub issue with reproduction steps
5. **Level 5**: Schedule pair programming session with testing expert

Remember to always include relevant error messages, environment details, and steps to reproduce when asking for help.