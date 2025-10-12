# Design Document

## Overview

This design outlines a comprehensive testing strategy that ensures code quality, reliability, and maintainability through multiple layers of testing. The strategy includes unit testing, integration testing, end-to-end testing, performance testing, and accessibility testing, all integrated into a robust CI/CD pipeline with proper test data management and reporting.

## Architecture

### Testing Pyramid Architecture

```mermaid
graph TB
    subgraph "Testing Pyramid"
        E2E[End-to-End Tests<br/>~10% of tests<br/>High confidence, slow]
        Integration[Integration Tests<br/>~20% of tests<br/>Medium confidence, medium speed]
        Unit[Unit Tests<br/>~70% of tests<br/>Fast feedback, low cost]
    end
    
    subgraph "Supporting Tests"
        Performance[Performance Tests]
        Accessibility[Accessibility Tests]
        Security[Security Tests]
        Visual[Visual Regression Tests]
    end
    
    Unit --> Integration
    Integration --> E2E
    E2E --> Performance
    E2E --> Accessibility
    E2E --> Security
    E2E --> Visual
```

### Testing Infrastructure

```mermaid
graph TB
    subgraph "Test Execution Environment"
        TestRunner[Vitest Test Runner]
        Browser[Playwright Browser Automation]
        TestDB[Test Database]
        MockServices[Mock Service Worker]
    end
    
    subgraph "Test Data Management"
        Factories[Test Data Factories]
        Fixtures[Test Fixtures]
        Seeders[Database Seeders]
        Cleanup[Test Cleanup]
    end
    
    subgraph "CI/CD Integration"
        GitHub[GitHub Actions]
        Coverage[Coverage Reports]
        Artifacts[Test Artifacts]
        Notifications[Test Notifications]
    end
    
    TestRunner --> TestDB
    TestRunner --> MockServices
    Browser --> TestDB
    Factories --> TestDB
    Fixtures --> TestDB
    Seeders --> TestDB
    Cleanup --> TestDB
    
    TestRunner --> GitHub
    Browser --> GitHub
    Coverage --> GitHub
    Artifacts --> GitHub
```

## Components and Interfaces

### 1. Unit Testing Framework

#### Vitest Configuration
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
        '**/*.stories.*',
        'dist/',
        'build/'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        // Stricter thresholds for critical modules
        'src/lib/': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    },
    
    // Test timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Parallel execution
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    
    // Watch mode configuration
    watch: {
      ignore: ['node_modules/**', 'dist/**', 'build/**']
    }
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './src/test')
    }
  }
});
```

#### Test Setup and Utilities
```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './mocks/server';
import { setupTestDatabase } from './utils/database';
import { config } from '../lib/config';

// Mock Service Worker setup
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});

// Global test configuration
beforeAll(async () => {
  // Initialize test configuration
  await config.initialize();
  
  // Setup test database
  await setupTestDatabase();
  
  // Mock environment-specific APIs
  vi.mock('../lib/analytics', () => ({
    track: vi.fn(),
    identify: vi.fn(),
    page: vi.fn()
  }));
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

#### Component Testing Utilities
```typescript
// src/test/utils/render.tsx
import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../hooks/useAuth';
import { ToastProvider } from '../../hooks/useToast';
import { ThemeProvider } from '../../hooks/useTheme';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  user?: any;
  queryClient?: QueryClient;
}

const AllTheProviders: React.FC<{ children: React.ReactNode; options?: CustomRenderOptions }> = ({ 
  children, 
  options = {} 
}) => {
  const queryClient = options.queryClient || new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
        staleTime: 0
      }
    }
  });

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider initialUser={options.user}>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

const customRender = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  return render(ui, {
    wrapper: (props) => <AllTheProviders {...props} options={options} />,
    ...options
  });
};

export * from '@testing-library/react';
export { customRender as render };
```

### 2. Integration Testing Framework

#### Database Testing Setup
```typescript
// src/test/utils/database.ts
import { createClient } from '@supabase/supabase-js';
import { config } from '../../lib/config';

let testSupabase: any;

export async function setupTestDatabase() {
  // Use test database URL
  const testUrl = config.database.supabaseUrl.replace('supabase.co', 'test.supabase.co');
  
  testSupabase = createClient(testUrl, config.database.supabaseAnonKey);
  
  // Run database migrations for tests
  await runTestMigrations();
  
  return testSupabase;
}

export async function cleanupTestDatabase() {
  if (!testSupabase) return;
  
  // Clean up test data in reverse dependency order
  const tables = [
    'analysis_results',
    'user_tokens',
    'oauth_states',
    'user_subscriptions',
    'usage_records',
    'users'
  ];
  
  for (const table of tables) {
    await testSupabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }
}

export async function seedTestData() {
  const testUser = await createTestUser();
  const testAnalysisResults = await createTestAnalysisResults(testUser.id);
  
  return {
    user: testUser,
    analysisResults: testAnalysisResults
  };
}

async function runTestMigrations() {
  // Run any test-specific database setup
  // This could include creating test-specific tables or data
}

async function createTestUser() {
  const { data, error } = await testSupabase
    .from('users')
    .insert({
      email: 'test@example.com',
      name: 'Test User',
      role_id: 'user',
      status: 'active'
    })
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

async function createTestAnalysisResults(userId: string) {
  const results = Array.from({ length: 5 }, (_, i) => ({
    user_id: userId,
    content: `Test content ${i + 1}`,
    accuracy: 80 + Math.random() * 20,
    risk_level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
    hallucinations: [],
    verification_sources: Math.floor(Math.random() * 10) + 5,
    processing_time: Math.floor(Math.random() * 1000) + 500
  }));
  
  const { data, error } = await testSupabase
    .from('analysis_results')
    .insert(results)
    .select();
    
  if (error) throw error;
  return data;
}
```

#### API Integration Testing
```typescript
// src/test/integration/api.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase, seedTestData } from '../utils/database';
import { analysisService } from '../../lib/analysisService';
import { googleDriveService } from '../../lib/googleDrive';

describe('API Integration Tests', () => {
  let testData: any;
  
  beforeEach(async () => {
    await setupTestDatabase();
    testData = await seedTestData();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });
  
  describe('Analysis Service', () => {
    it('should perform complete analysis workflow', async () => {
      const content = 'This AI system achieves exactly 99.7% accuracy with zero false positives.';
      
      const result = await analysisService.analyzeContent(content, testData.user.id);
      
      expect(result.analysis).toMatchObject({
        user_id: testData.user.id,
        accuracy: expect.any(Number),
        riskLevel: expect.stringMatching(/low|medium|high|critical/),
        hallucinations: expect.any(Array),
        processingTime: expect.any(Number)
      });
      
      // Verify data was stored in database
      const { data: storedResult } = await testSupabase
        .from('analysis_results')
        .select('*')
        .eq('id', result.analysis.id)
        .single();
        
      expect(storedResult).toBeDefined();
      expect(storedResult.accuracy).toBe(result.analysis.accuracy);
    });
    
    it('should handle batch analysis correctly', async () => {
      const documents = [
        { id: '1', content: 'First test document' },
        { id: '2', content: 'Second test document' },
        { id: '3', content: 'Third test document' }
      ];
      
      const results = await analysisService.analyzeBatch(documents, testData.user.id);
      
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.analysis.analysisType).toBe('batch');
        expect(result.analysis.user_id).toBe(testData.user.id);
      });
    });
  });
  
  describe('Google Drive Integration', () => {
    it('should authenticate and list files', async () => {
      // This test would require test Google OAuth tokens
      // In practice, you might mock the Google API responses
      
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      ];
      
      // Mock the Google Drive API response
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.json({ files: mockFiles }));
        })
      );
      
      await googleDriveService.initialize();
      const files = await googleDriveService.listFiles();
      
      expect(files).toEqual(mockFiles);
    });
  });
});
```

### 3. End-to-End Testing Framework

#### Playwright Configuration
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }]
  ],
  
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] }
    }
  ],
  
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
```

#### Page Object Models
```typescript
// e2e/pages/AnalyzerPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class AnalyzerPage {
  readonly page: Page;
  readonly contentTextarea: Locator;
  readonly analyzeButton: Locator;
  readonly resultsSection: Locator;
  readonly accuracyScore: Locator;
  readonly riskLevel: Locator;
  readonly hallucinationsList: Locator;
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.contentTextarea = page.getByTestId('content-textarea');
    this.analyzeButton = page.getByTestId('analyze-button');
    this.resultsSection = page.getByTestId('analysis-results');
    this.accuracyScore = page.getByTestId('accuracy-score');
    this.riskLevel = page.getByTestId('risk-level');
    this.hallucinationsList = page.getByTestId('hallucinations-list');
    this.loadingSpinner = page.getByTestId('loading-spinner');
  }

  async goto() {
    await this.page.goto('/analyzer');
  }

  async analyzeContent(content: string) {
    await this.contentTextarea.fill(content);
    await this.analyzeButton.click();
    
    // Wait for loading to start and finish
    await expect(this.loadingSpinner).toBeVisible();
    await expect(this.loadingSpinner).toBeHidden({ timeout: 30000 });
    
    // Wait for results to appear
    await expect(this.resultsSection).toBeVisible();
  }

  async getAnalysisResults() {
    await expect(this.resultsSection).toBeVisible();
    
    const accuracy = await this.accuracyScore.textContent();
    const risk = await this.riskLevel.textContent();
    const hallucinations = await this.hallucinationsList.locator('li').count();
    
    return {
      accuracy: parseFloat(accuracy?.replace('%', '') || '0'),
      riskLevel: risk?.toLowerCase() || '',
      hallucinationCount: hallucinations
    };
  }

  async expectAnalysisComplete() {
    await expect(this.resultsSection).toBeVisible();
    await expect(this.accuracyScore).toContainText('%');
    await expect(this.riskLevel).toBeVisible();
  }
}
```

#### Critical User Journey Tests
```typescript
// e2e/user-journeys.spec.ts
import { test, expect } from '@playwright/test';
import { AnalyzerPage } from './pages/AnalyzerPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Critical User Journeys', () => {
  test('complete analysis workflow', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    await analyzerPage.goto();
    
    const testContent = `
      Our revolutionary AI system achieves exactly 99.7% accuracy with zero false positives.
      According to recent studies, this represents a 1000x improvement over existing solutions.
      All users report perfect satisfaction with unprecedented results.
    `;
    
    await analyzerPage.analyzeContent(testContent);
    
    const results = await analyzerPage.getAnalysisResults();
    
    expect(results.accuracy).toBeGreaterThan(0);
    expect(results.accuracy).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(results.riskLevel);
    expect(results.hallucinationCount).toBeGreaterThan(0); // Should detect suspicious claims
  });
  
  test('authentication and dashboard workflow', async ({ page }) => {
    const authPage = new AuthPage(page);
    const dashboardPage = new DashboardPage(page);
    
    // Navigate to login
    await authPage.goto();
    
    // Sign in with Google (mocked in test environment)
    await authPage.signInWithGoogle();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Verify dashboard loads with user data
    await dashboardPage.expectDashboardLoaded();
    
    const stats = await dashboardPage.getAnalyticsStats();
    expect(stats.totalAnalyses).toBeGreaterThanOrEqual(0);
    expect(stats.averageAccuracy).toBeGreaterThanOrEqual(0);
  });
  
  test('Google Drive integration workflow', async ({ page }) => {
    const authPage = new AuthPage(page);
    const drivePage = new GoogleDrivePage(page);
    
    // Authenticate first
    await authPage.goto();
    await authPage.signInWithGoogle();
    
    // Navigate to Drive integration
    await drivePage.goto();
    
    // Connect Google Drive
    await drivePage.connectGoogleDrive();
    
    // Verify file listing
    await drivePage.expectFilesLoaded();
    
    // Select and analyze a file
    await drivePage.selectFile('Test Document.docx');
    await drivePage.analyzeSelectedFile();
    
    // Verify analysis results
    await drivePage.expectAnalysisComplete();
  });
});
```

### 4. Performance Testing Framework

#### Performance Test Configuration
```typescript
// e2e/performance/performance.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './performance',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on',
    video: 'on'
  },
  projects: [
    {
      name: 'performance-desktop',
      use: {
        ...devices['Desktop Chrome'],
        // Throttle network for realistic testing
        launchOptions: {
          args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
        }
      }
    }
  ]
});
```

#### Core Web Vitals Testing
```typescript
// e2e/performance/core-web-vitals.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Core Web Vitals', () => {
  test('should meet performance benchmarks', async ({ page }) => {
    // Navigate to the main page
    await page.goto('/');
    
    // Measure Core Web Vitals
    const vitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const vitals: any = {};
          
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              vitals.fcp = entry.startTime;
            }
            if (entry.name === 'largest-contentful-paint') {
              vitals.lcp = entry.startTime;
            }
          });
          
          resolve(vitals);
        });
        
        observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
        
        // Timeout after 10 seconds
        setTimeout(() => resolve({}), 10000);
      });
    });
    
    // Assert performance benchmarks
    if (vitals.fcp) {
      expect(vitals.fcp).toBeLessThan(2000); // FCP should be < 2s
    }
    if (vitals.lcp) {
      expect(vitals.lcp).toBeLessThan(2500); // LCP should be < 2.5s
    }
  });
  
  test('analysis performance under load', async ({ page }) => {
    await page.goto('/analyzer');
    
    const startTime = Date.now();
    
    // Perform analysis
    await page.fill('[data-testid="content-textarea"]', 'Large content for performance testing..'.repeat(100));
    await page.click('[data-testid="analyze-button"]');
    
    // Wait for results
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 30000 });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Analysis should complete within 10 seconds
    expect(duration).toBeLessThan(10000);
  });
});
```

### 5. Accessibility Testing Framework

#### Accessibility Test Setup
```typescript
// e2e/accessibility/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test('should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });
  
  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/analyzer');
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('content-textarea')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('analyze-button')).toBeFocused();
    
    // Test Enter key activation
    await page.keyboard.press('Enter');
    // Should trigger analysis (though it might fail without content)
  });
  
  test('should provide proper ARIA labels', async ({ page }) => {
    await page.goto('/analyzer');
    
    // Check for proper ARIA labels
    const textarea = page.getByTestId('content-textarea');
    await expect(textarea).toHaveAttribute('aria-label');
    
    const button = page.getByTestId('analyze-button');
    await expect(button).toHaveAttribute('aria-describedby');
  });
  
  test('should support screen readers', async ({ page }) => {
    await page.goto('/analyzer');
    
    // Fill content and analyze
    await page.fill('[data-testid="content-textarea"]', 'Test content');
    await page.click('[data-testid="analyze-button"]');
    
    // Wait for results
    await page.waitForSelector('[data-testid="analysis-results"]');
    
    // Check for screen reader announcements
    const resultsRegion = page.getByTestId('analysis-results');
    await expect(resultsRegion).toHaveAttribute('aria-live', 'polite');
    await expect(resultsRegion).toHaveAttribute('role', 'region');
  });
});
```

## Data Models

### Test Data Factories
```typescript
// src/test/factories/userFactory.ts
import { faker } from '@faker-js/faker';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  role: 'user',
  status: 'active',
  createdAt: faker.date.past().toISOString(),
  ...overrides
});

export const createTestUsers = (count: number, overrides: Partial<TestUser> = {}): TestUser[] => {
  return Array.from({ length: count }, () => createTestUser(overrides));
};
```

### Test Database Schema
```sql
-- Test-specific database setup
CREATE SCHEMA IF NOT EXISTS test;

-- Test data cleanup function
CREATE OR REPLACE FUNCTION test.cleanup_test_data()
RETURNS void AS $$
BEGIN
  DELETE FROM analysis_results WHERE user_id LIKE 'test-%';
  DELETE FROM user_tokens WHERE user_id LIKE 'test-%';
  DELETE FROM users WHERE id LIKE 'test-%';
END;
$$ LANGUAGE plpgsql;

-- Test data seeding function
CREATE OR REPLACE FUNCTION test.seed_test_data()
RETURNS void AS $$
BEGIN
  INSERT INTO users (id, email, name, role, status) VALUES
  ('test-user-1', 'test1@example.com', 'Test User 1', 'user', 'active'),
  ('test-user-2', 'test2@example.com', 'Test User 2', 'admin', 'active');
  
  INSERT INTO analysis_results (user_id, content, accuracy, risk_level) VALUES
  ('test-user-1', 'Test content 1', 85.5, 'medium'),
  ('test-user-1', 'Test content 2', 92.1, 'low');
END;
$$ LANGUAGE plpgsql;
```

## Testing Strategy

### Test Organization
```
src/
├── test/
│   ├── setup.ts                    # Global test setup
│   ├── utils/
│   │   ├── render.tsx             # Custom render utilities
│   │   ├── database.ts            # Database test utilities
│   │   └── mocks.ts               # Mock utilities
│   ├── factories/
│   │   ├── userFactory.ts         # User test data factory
│   │   ├── analysisFactory.ts     # Analysis test data factory
│   │   └── index.ts               # Factory exports
│   ├── fixtures/
│   │   ├── users.json             # Static user fixtures
│   │   └── analysisResults.json   # Static analysis fixtures
│   └── mocks/
│       ├── server.ts              # MSW server setup
│       ├── handlers.ts            # API mock handlers
│       └── browser.ts             # Browser mock setup
├── components/
│   └── __tests__/                 # Component unit tests
├── lib/
│   └── __tests__/                 # Service unit tests
├── hooks/
│   └── __tests__/                 # Hook unit tests
└── pages/
    └── __tests__/                 # Page unit tests

e2e/
├── pages/                         # Page object models
├── fixtures/                      # E2E test fixtures
├── performance/                   # Performance tests
├── accessibility/                 # Accessibility tests
└── visual/                        # Visual regression tests
```

### CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
      
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Performance Considerations

### Test Execution Optimization
- Parallel test execution where possible
- Smart test selection based on changed files
- Test result caching for unchanged code
- Efficient test data management
- Resource cleanup and isolation

### CI/CD Optimization
- Matrix builds for different environments
- Test result caching and artifacts
- Fail-fast strategies for critical failures
- Incremental testing for large codebases
- Performance regression detection