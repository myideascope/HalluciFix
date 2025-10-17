# Testing Troubleshooting Guide

## Overview

This guide helps developers diagnose and resolve common testing issues in the HalluciFix application. Use this as a reference when tests fail or behave unexpectedly.

## Quick Diagnosis Checklist

When tests fail, check these common issues first:

- [ ] Are all dependencies installed? (`npm ci`)
- [ ] Is the test database running and accessible?
- [ ] Are environment variables properly set?
- [ ] Are mocks configured correctly?
- [ ] Is test data properly cleaned up between tests?
- [ ] Are async operations properly awaited?

## Common Issues and Solutions

### 1. Unit Test Failures

#### Issue: "Cannot find module" errors

**Symptoms:**
```
Error: Cannot find module '@/components/MyComponent'
ENOENT: no such file or directory
```

**Causes:**
- Incorrect import paths
- Missing path aliases in test configuration
- File moved or renamed

**Solutions:**
```typescript
// ✅ Check vitest.config.ts for correct path aliases
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './src/test')
    }
  }
});

// ✅ Use correct import paths
import { MyComponent } from '@/components/MyComponent';
import { createTestUser } from '@test/factories';
```

#### Issue: "ReferenceError: window is not defined"

**Symptoms:**
```
ReferenceError: window is not defined
ReferenceError: document is not defined
```

**Causes:**
- Missing jsdom environment configuration
- Code running in Node.js context instead of browser

**Solutions:**
```typescript
// ✅ Ensure vitest.config.ts has jsdom environment
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
});

// ✅ Mock browser APIs in setup.ts
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

#### Issue: "act() warning" in React tests

**Symptoms:**
```
Warning: An update to Component inside a test was not wrapped in act(...)
```

**Causes:**
- State updates not properly wrapped in act()
- Async operations not properly awaited

**Solutions:**
```typescript
// ❌ Not wrapped in act()
it('should update state', () => {
  const { result } = renderHook(() => useMyHook());
  result.current.updateValue('new value');
  expect(result.current.value).toBe('new value');
});

// ✅ Properly wrapped in act()
it('should update state', () => {
  const { result } = renderHook(() => useMyHook());
  
  act(() => {
    result.current.updateValue('new value');
  });
  
  expect(result.current.value).toBe('new value');
});

// ✅ For async operations
it('should handle async updates', async () => {
  render(<MyComponent />);
  
  await user.click(screen.getByRole('button'));
  
  await waitFor(() => {
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });
});
```

#### Issue: Mock functions not working

**Symptoms:**
```
Expected mock function to have been called, but it was not called
```

**Causes:**
- Mocks not properly configured
- Module mocking issues
- Mock not reset between tests

**Solutions:**
```typescript
// ✅ Proper mock setup
vi.mock('@/lib/analysisService', () => ({
  analysisService: {
    analyze: vi.fn(),
    analyzeBatch: vi.fn()
  }
}));

// ✅ Reset mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});

// ✅ Verify mock is actually called
it('should call analysis service', async () => {
  const mockAnalyze = vi.mocked(analysisService.analyze);
  mockAnalyze.mockResolvedValue({ accuracy: 85 });
  
  render(<AnalyzerComponent />);
  await user.click(screen.getByRole('button', { name: /analyze/i }));
  
  expect(mockAnalyze).toHaveBeenCalledWith(expect.any(String), expect.any(String));
});
```

### 2. Integration Test Failures

#### Issue: Database connection errors

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
Database connection failed
```

**Causes:**
- Test database not running
- Incorrect connection configuration
- Missing environment variables

**Solutions:**
```bash
# ✅ Start test database
docker run --name test-postgres -e POSTGRES_PASSWORD=test -p 5432:5432 -d postgres:15

# ✅ Check environment variables
export DATABASE_URL="postgresql://postgres:test@localhost:5432/test"
export SUPABASE_URL="http://localhost:54321"
export SUPABASE_ANON_KEY="your-test-key"
```

```typescript
// ✅ Verify database connection in tests
beforeAll(async () => {
  try {
    await supabase.from('users').select('count').single();
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
});
```

#### Issue: Test data conflicts

**Symptoms:**
```
Error: duplicate key value violates unique constraint
Tests pass individually but fail when run together
```

**Causes:**
- Test data not properly isolated
- Cleanup not working correctly
- Parallel test execution conflicts

**Solutions:**
```typescript
// ✅ Use unique test data prefixes
const createTestUser = () => ({
  id: `test-${faker.string.uuid()}`,
  email: `test-${Date.now()}@example.com`,
  name: faker.person.fullName()
});

// ✅ Proper cleanup with transactions
describe('User Service', () => {
  let testUsers: string[] = [];
  
  afterEach(async () => {
    // Clean up in reverse dependency order
    await supabase.from('analysis_results').delete().in('user_id', testUsers);
    await supabase.from('users').delete().in('id', testUsers);
    testUsers = [];
  });
  
  it('should create user', async () => {
    const user = await userService.createUser(createTestUser());
    testUsers.push(user.id);
    
    expect(user.id).toBeDefined();
  });
});
```

#### Issue: API mocking not working

**Symptoms:**
```
Error: Network request failed
Mock handlers not intercepting requests
```

**Causes:**
- MSW not properly configured
- Request URLs not matching handlers
- Server not started in tests

**Solutions:**
```typescript
// ✅ Proper MSW setup in test setup
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ✅ Correct handler patterns
export const handlers = [
  rest.post('/api/analyze', (req, res, ctx) => {
    return res(
      ctx.json({
        accuracy: 85,
        riskLevel: 'medium',
        hallucinations: []
      })
    );
  }),
  
  rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
    return res(ctx.json({ files: [] }));
  })
];
```

### 3. End-to-End Test Failures

#### Issue: Playwright browser launch failures

**Symptoms:**
```
Error: Failed to launch browser
browserType.launch: Executable doesn't exist
```

**Causes:**
- Browsers not installed
- Incorrect Playwright configuration
- Missing system dependencies

**Solutions:**
```bash
# ✅ Install Playwright browsers
npx playwright install --with-deps

# ✅ Install specific browser
npx playwright install chromium

# ✅ Check system dependencies (Linux)
npx playwright install-deps
```

#### Issue: Element not found errors

**Symptoms:**
```
Error: Locator not found: [data-testid="submit-button"]
TimeoutError: Timeout 30000ms exceeded
```

**Causes:**
- Element not rendered yet
- Incorrect selector
- Page not fully loaded

**Solutions:**
```typescript
// ❌ Not waiting for element
await page.click('[data-testid="submit-button"]');

// ✅ Wait for element to be visible
await page.waitForSelector('[data-testid="submit-button"]', { state: 'visible' });
await page.click('[data-testid="submit-button"]');

// ✅ Use Playwright's auto-waiting
await page.locator('[data-testid="submit-button"]').click();

// ✅ Wait for network requests to complete
await page.goto('/analyzer');
await page.waitForLoadState('networkidle');
```

#### Issue: Flaky tests due to timing

**Symptoms:**
```
Tests pass sometimes, fail other times
Intermittent timeout errors
```

**Causes:**
- Race conditions
- Network timing issues
- Animation or transition delays

**Solutions:**
```typescript
// ✅ Use proper waiting strategies
await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 30000 });

// ✅ Wait for specific conditions
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="results"]')?.textContent?.includes('accuracy');
});

// ✅ Disable animations for testing
await page.addStyleTag({
  content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `
});
```

### 4. Performance Test Issues

#### Issue: Performance metrics not captured

**Symptoms:**
```
Performance metrics are undefined
Core Web Vitals not measured
```

**Causes:**
- Metrics API not available
- Page not fully loaded
- Incorrect measurement timing

**Solutions:**
```typescript
// ✅ Ensure page is fully loaded
await page.goto('/');
await page.waitForLoadState('networkidle');

// ✅ Wait for metrics to be available
const metrics = await page.evaluate(() => {
  return new Promise((resolve) => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const vitals = {};
      
      entries.forEach((entry) => {
        if (entry.name === 'first-contentful-paint') {
          vitals.fcp = entry.startTime;
        }
      });
      
      if (Object.keys(vitals).length > 0) {
        resolve(vitals);
      }
    });
    
    observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
    
    // Fallback timeout
    setTimeout(() => resolve({}), 10000);
  });
});
```

### 5. Coverage Issues

#### Issue: Low coverage despite tests

**Symptoms:**
```
Coverage below threshold
Files not included in coverage report
```

**Causes:**
- Files not imported in tests
- Incorrect coverage configuration
- Dead code not removed

**Solutions:**
```typescript
// ✅ Check vitest.config.ts coverage settings
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*'
      ],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
});

// ✅ Import modules to include in coverage
import { myUtilFunction } from '@/lib/utils';

describe('Utils', () => {
  it('should test utility function', () => {
    expect(myUtilFunction('input')).toBe('expected');
  });
});
```

## Environment-Specific Issues

### Development Environment

#### Issue: Tests work locally but fail in CI

**Causes:**
- Environment variable differences
- Different Node.js versions
- Missing system dependencies

**Solutions:**
```yaml
# ✅ GitHub Actions configuration
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '18'
    cache: 'npm'

- name: Install dependencies
  run: npm ci

- name: Setup test environment
  run: |
    cp .env.example .env.test
    npm run test:setup
```

### CI/CD Environment

#### Issue: Timeouts in CI

**Causes:**
- Slower CI environment
- Resource constraints
- Network latency

**Solutions:**
```typescript
// ✅ Increase timeouts for CI
const timeout = process.env.CI ? 60000 : 30000;

test('should complete analysis', async ({ page }) => {
  await page.goto('/analyzer');
  await page.fill('[data-testid="content"]', testContent);
  await page.click('[data-testid="analyze"]');
  
  await expect(page.getByTestId('results')).toBeVisible({ timeout });
});
```

## Debugging Strategies

### 1. Isolate the Problem

```bash
# Run specific test file
npm run test:run src/components/MyComponent.test.tsx

# Run specific test case
npm run test:run -- --grep "should handle user input"

# Run with verbose output
npm run test:run -- --reporter=verbose
```

### 2. Add Debug Output

```typescript
// Add debug statements
it('should process data correctly', () => {
  const input = createTestData();
  console.log('Input:', input);
  
  const result = processData(input);
  console.log('Result:', result);
  
  expect(result).toBeDefined();
});

// Use screen.debug() for React components
it('should render component', () => {
  render(<MyComponent />);
  screen.debug(); // Prints DOM structure
});
```

### 3. Use Test Debugging Tools

```bash
# Run Vitest UI for interactive debugging
npm run test:ui

# Run Playwright in headed mode
npx playwright test --headed

# Generate Playwright trace
npx playwright test --trace on
```

### 4. Check Test Configuration

```typescript
// Verify test setup is correct
describe('Test Configuration', () => {
  it('should have correct environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(vi).toBeDefined();
    expect(screen).toBeDefined();
  });
  
  it('should have mocks configured', () => {
    expect(vi.isMockFunction(mockFunction)).toBe(true);
  });
});
```

## Getting Help

### 1. Check Documentation
- Review framework documentation (Vitest, Playwright, React Testing Library)
- Check project-specific testing guides
- Look at existing test examples in the codebase

### 2. Use Community Resources
- Stack Overflow with specific error messages
- GitHub issues for framework-specific problems
- Discord/Slack channels for real-time help

### 3. Create Minimal Reproduction
When reporting issues:
- Create minimal test case that reproduces the problem
- Include relevant configuration files
- Provide error messages and stack traces
- Specify environment details (Node.js version, OS, etc.)

## Prevention Strategies

### 1. Regular Maintenance
- Update dependencies regularly
- Review and update test configurations
- Clean up obsolete tests and mocks
- Monitor test performance and flakiness

### 2. Code Review Practices
- Review test quality during code reviews
- Ensure new features include appropriate tests
- Check for test anti-patterns
- Verify test isolation and cleanup

### 3. Monitoring and Alerts
- Set up alerts for test failures
- Monitor test execution times
- Track coverage trends
- Review flaky test reports regularly

## Conclusion

Most testing issues can be resolved by:
1. **Checking the basics**: dependencies, environment, configuration
2. **Reading error messages carefully**: they often point to the exact problem
3. **Isolating the issue**: run specific tests to narrow down the problem
4. **Using debugging tools**: leverage built-in debugging capabilities
5. **Following best practices**: proper setup, cleanup, and test organization

When in doubt, refer to the framework documentation and existing working examples in the codebase.