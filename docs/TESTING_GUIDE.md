# Developer Testing Guide

## Overview

This guide provides practical instructions for developers to write, maintain, and execute tests in the HalluciFix project. It covers best practices, common patterns, and step-by-step instructions for different types of testing.

## Quick Start

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run specific test file
npm test -- src/components/Dashboard.test.tsx

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

### Test File Structure

```
src/
├── components/
│   ├── Dashboard.tsx
│   └── __tests__/
│       └── Dashboard.test.tsx
├── lib/
│   ├── analysisService.ts
│   └── __tests__/
│       └── analysisService.test.ts
└── hooks/
    ├── useAuth.ts
    └── __tests__/
        └── useAuth.test.ts
```

## Unit Testing

### Component Testing

#### Basic Component Test

```typescript
// src/components/__tests__/Dashboard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../Dashboard';
import { TestWrapper } from '../../test/utils/TestWrapper';

describe('Dashboard', () => {
  it('should display user analytics when data is loaded', async () => {
    // Arrange
    const mockUser = { id: '1', email: 'test@example.com' };
    
    // Act
    render(
      <TestWrapper user={mockUser}>
        <Dashboard />
      </TestWrapper>
    );
    
    // Assert
    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });
  });

  it('should handle analysis submission', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockAnalyze = vi.fn().mockResolvedValue({ id: '123', score: 85 });
    
    render(
      <TestWrapper>
        <Dashboard onAnalyze={mockAnalyze} />
      </TestWrapper>
    );
    
    // Act
    const textInput = screen.getByLabelText('Content to analyze');
    await user.type(textInput, 'Test content');
    await user.click(screen.getByRole('button', { name: 'Analyze' }));
    
    // Assert
    await waitFor(() => {
      expect(mockAnalyze).toHaveBeenCalledWith('Test content');
    });
  });
});
```

#### Testing with Context

```typescript
// src/components/__tests__/AuthForm.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from '../AuthForm';
import { AuthProvider } from '../../contexts/AuthContext';

const renderWithAuth = (ui: React.ReactElement) => {
  return render(
    <AuthProvider>
      {ui}
    </AuthProvider>
  );
};

describe('AuthForm', () => {
  it('should call login function with correct credentials', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockLogin = vi.fn();
    
    renderWithAuth(<AuthForm onLogin={mockLogin} />);
    
    // Act
    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    
    // Assert
    expect(mockLogin).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123'
    });
  });
});
```

### Service Testing

#### API Service Testing

```typescript
// src/lib/__tests__/analysisService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analysisService } from '../analysisService';
import { supabase } from '../supabase';

// Mock Supabase client
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }
}));

describe('analysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeContent', () => {
    it('should return analysis result for valid content', async () => {
      // Arrange
      const mockContent = 'Test content for analysis';
      const mockResult = {
        id: '123',
        content: mockContent,
        score: 85,
        risk_level: 'low'
      };

      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockResult, error: null })
          })
        })
      });

      (supabase.from as any).mockReturnValue(mockFrom());

      // Act
      const result = await analysisService.analyzeContent(mockContent);

      // Assert
      expect(result).toEqual(mockResult);
      expect(supabase.from).toHaveBeenCalledWith('analyses');
    });

    it('should throw error for invalid content', async () => {
      // Arrange
      const invalidContent = '';

      // Act & Assert
      await expect(analysisService.analyzeContent(invalidContent))
        .rejects.toThrow('Content cannot be empty');
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const mockContent = 'Test content';
      const mockError = new Error('Database connection failed');

      const mockFrom = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: mockError })
          })
        })
      });

      (supabase.from as any).mockReturnValue(mockFrom());

      // Act & Assert
      await expect(analysisService.analyzeContent(mockContent))
        .rejects.toThrow('Database connection failed');
    });
  });
});
```

### Hook Testing

#### Custom Hook Testing

```typescript
// src/hooks/__tests__/useAuth.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '../useAuth';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase');

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with null user', () => {
    // Act
    const { result } = renderHook(() => useAuth());

    // Assert
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('should handle successful login', async () => {
    // Arrange
    const mockUser = { id: '1', email: 'test@example.com' };
    const mockSignIn = vi.fn().mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    (supabase.auth.signInWithPassword as any) = mockSignIn;

    const { result } = renderHook(() => useAuth());

    // Act
    await act(async () => {
      await result.current.signIn('test@example.com', 'password');
    });

    // Assert
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.loading).toBe(false);
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password'
    });
  });

  it('should handle login error', async () => {
    // Arrange
    const mockError = new Error('Invalid credentials');
    const mockSignIn = vi.fn().mockResolvedValue({
      data: { user: null },
      error: mockError
    });

    (supabase.auth.signInWithPassword as any) = mockSignIn;

    const { result } = renderHook(() => useAuth());

    // Act & Assert
    await act(async () => {
      await expect(result.current.signIn('test@example.com', 'wrong'))
        .rejects.toThrow('Invalid credentials');
    });

    expect(result.current.user).toBeNull();
  });
});
```

## Integration Testing

### Database Integration Tests

```typescript
// src/test/integration/analysisService.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { analysisService } from '../../lib/analysisService';
import { createTestUser, cleanupTestData } from '../utils/testHelpers';

describe('Analysis Service Integration', () => {
  let testUserId: string;

  beforeEach(async () => {
    testUserId = await createTestUser();
  });

  afterEach(async () => {
    await cleanupTestData(testUserId);
  });

  it('should create and retrieve analysis from database', async () => {
    // Arrange
    const content = 'This is a test analysis content';

    // Act
    const analysis = await analysisService.analyzeContent(content, testUserId);
    const retrieved = await analysisService.getAnalysis(analysis.id);

    // Assert
    expect(retrieved).toBeDefined();
    expect(retrieved.content).toBe(content);
    expect(retrieved.user_id).toBe(testUserId);
    expect(retrieved.score).toBeGreaterThan(0);
  });

  it('should handle batch analysis workflow', async () => {
    // Arrange
    const contents = [
      'First analysis content',
      'Second analysis content',
      'Third analysis content'
    ];

    // Act
    const batchId = await analysisService.createBatch(testUserId);
    const results = await analysisService.processBatch(batchId, contents);

    // Assert
    expect(results).toHaveLength(3);
    results.forEach((result, index) => {
      expect(result.content).toBe(contents[index]);
      expect(result.batch_id).toBe(batchId);
    });
  });
});
```

### API Integration Tests

```typescript
// src/test/integration/api.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/app';
import { createTestUser, getTestToken } from '../utils/authHelpers';

describe('API Integration Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    testUserId = await createTestUser();
    authToken = await getTestToken(testUserId);
  });

  afterAll(async () => {
    await cleanupTestData(testUserId);
  });

  describe('POST /api/analyses', () => {
    it('should create new analysis with valid data', async () => {
      // Arrange
      const analysisData = {
        content: 'Test content for analysis',
        type: 'text'
      };

      // Act
      const response = await request(app)
        .post('/api/analyses')
        .set('Authorization', `Bearer ${authToken}`)
        .send(analysisData)
        .expect(201);

      // Assert
      expect(response.body).toMatchObject({
        id: expect.any(String),
        content: analysisData.content,
        score: expect.any(Number),
        risk_level: expect.stringMatching(/^(low|medium|high|critical)$/)
      });
    });

    it('should return 400 for invalid content', async () => {
      // Act
      const response = await request(app)
        .post('/api/analyses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: '' })
        .expect(400);

      // Assert
      expect(response.body.error).toBe('Content cannot be empty');
    });

    it('should return 401 for unauthorized requests', async () => {
      // Act
      await request(app)
        .post('/api/analyses')
        .send({ content: 'Test content' })
        .expect(401);
    });
  });
});
```

## End-to-End Testing

### Page Object Model

```typescript
// e2e/pages/AnalyzerPage.ts
import { Page, Locator } from '@playwright/test';

export class AnalyzerPage {
  readonly page: Page;
  readonly contentInput: Locator;
  readonly analyzeButton: Locator;
  readonly resultsSection: Locator;
  readonly scoreDisplay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.contentInput = page.getByLabel('Content to analyze');
    this.analyzeButton = page.getByRole('button', { name: 'Analyze' });
    this.resultsSection = page.getByTestId('analysis-results');
    this.scoreDisplay = page.getByTestId('accuracy-score');
  }

  async goto() {
    await this.page.goto('/analyzer');
  }

  async analyzeContent(content: string) {
    await this.contentInput.fill(content);
    await this.analyzeButton.click();
  }

  async waitForResults() {
    await this.resultsSection.waitFor({ state: 'visible' });
  }

  async getScore(): Promise<number> {
    const scoreText = await this.scoreDisplay.textContent();
    return parseInt(scoreText?.replace('%', '') || '0');
  }
}
```

### E2E Test Example

```typescript
// e2e/tests/analysis-workflow.spec.ts
import { test, expect } from '@playwright/test';
import { AnalyzerPage } from '../pages/AnalyzerPage';
import { LandingPage } from '../pages/LandingPage';
import { authenticateUser } from '../utils/auth';

test.describe('Analysis Workflow', () => {
  test('should complete full analysis workflow', async ({ page }) => {
    // Arrange
    await authenticateUser(page);
    const analyzerPage = new AnalyzerPage(page);
    
    // Act
    await analyzerPage.goto();
    await analyzerPage.analyzeContent('This is a test content for analysis');
    await analyzerPage.waitForResults();
    
    // Assert
    const score = await analyzerPage.getScore();
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
    
    await expect(analyzerPage.resultsSection).toContainText('Analysis Complete');
  });

  test('should handle batch analysis', async ({ page }) => {
    // Arrange
    await authenticateUser(page);
    
    // Act
    await page.goto('/batch-analysis');
    
    // Upload test files
    const fileInput = page.getByLabel('Upload files');
    await fileInput.setInputFiles([
      'e2e/fixtures/test-document-1.txt',
      'e2e/fixtures/test-document-2.txt'
    ]);
    
    await page.getByRole('button', { name: 'Start Batch Analysis' }).click();
    
    // Wait for processing
    await page.waitForSelector('[data-testid="batch-complete"]', { timeout: 30000 });
    
    // Assert
    const results = page.getByTestId('batch-results');
    await expect(results).toContainText('2 files processed');
    
    const resultItems = page.getByTestId('result-item');
    await expect(resultItems).toHaveCount(2);
  });
});
```

## Test Data Management

### Test Fixtures

```typescript
// src/test/fixtures/users.ts
export const testUsers = {
  basicUser: {
    id: 'test-user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user'
  },
  adminUser: {
    id: 'test-admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin'
  }
};

// src/test/fixtures/analyses.ts
export const testAnalyses = {
  lowRisk: {
    id: 'analysis-1',
    content: 'This is accurate content',
    score: 95,
    risk_level: 'low'
  },
  highRisk: {
    id: 'analysis-2',
    content: 'This content has issues',
    score: 45,
    risk_level: 'high'
  }
};
```

### Test Factories

```typescript
// src/test/factories/userFactory.ts
import { faker } from '@faker-js/faker';

export const createUser = (overrides = {}) => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  role: 'user',
  created_at: faker.date.past().toISOString(),
  ...overrides
});

export const createAnalysis = (overrides = {}) => ({
  id: faker.string.uuid(),
  content: faker.lorem.paragraph(),
  score: faker.number.int({ min: 0, max: 100 }),
  risk_level: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']),
  created_at: faker.date.recent().toISOString(),
  ...overrides
});
```

### Test Utilities

```typescript
// src/test/utils/TestWrapper.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

interface TestWrapperProps {
  children: React.ReactNode;
  user?: any;
  queryClient?: QueryClient;
}

export const TestWrapper: React.FC<TestWrapperProps> = ({
  children,
  user,
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
}) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={user}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
```

## Mocking Strategies

### MSW Setup

```typescript
// src/test/mocks/handlers.ts
import { rest } from 'msw';
import { testUsers, testAnalyses } from '../fixtures';

export const handlers = [
  // Auth endpoints
  rest.post('/auth/v1/token', (req, res, ctx) => {
    return res(
      ctx.json({
        access_token: 'mock-token',
        user: testUsers.basicUser
      })
    );
  }),

  // Analysis endpoints
  rest.post('/rest/v1/analyses', (req, res, ctx) => {
    return res(
      ctx.json(testAnalyses.lowRisk)
    );
  }),

  rest.get('/rest/v1/analyses', (req, res, ctx) => {
    return res(
      ctx.json([testAnalyses.lowRisk, testAnalyses.highRisk])
    );
  }),

  // Google Drive API
  rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
    return res(
      ctx.json({
        files: [
          { id: 'file-1', name: 'test-document.pdf' }
        ]
      })
    );
  })
];

// src/test/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

### Component Mocking

```typescript
// Mock external components
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/test' }),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>
}));

// Mock Supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
    }))
  }
}));
```

## Best Practices

### Test Organization

1. **Group Related Tests**: Use `describe` blocks to group related tests
2. **Clear Test Names**: Use descriptive names that explain the expected behavior
3. **Single Responsibility**: Each test should validate one specific behavior
4. **Independent Tests**: Tests should not depend on each other

### Assertion Guidelines

```typescript
// Good: Specific assertions
expect(user.email).toBe('test@example.com');
expect(analysis.score).toBeGreaterThan(80);
expect(errorMessage).toContain('Invalid input');

// Avoid: Vague assertions
expect(result).toBeTruthy();
expect(data).toBeDefined();
```

### Async Testing

```typescript
// Good: Proper async handling
await waitFor(() => {
  expect(screen.getByText('Loading...')).not.toBeInTheDocument();
});

// Good: Testing async functions
await expect(analysisService.analyzeContent('')).rejects.toThrow();

// Avoid: Missing await
waitFor(() => {
  expect(screen.getByText('Data loaded')).toBeInTheDocument();
});
```

### Error Testing

```typescript
// Test error boundaries
it('should display error boundary when component throws', () => {
  const ThrowError = () => {
    throw new Error('Test error');
  };

  render(
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
});

// Test error states
it('should display error message on API failure', async () => {
  server.use(
    rest.post('/api/analyses', (req, res, ctx) => {
      return res(ctx.status(500), ctx.json({ error: 'Server error' }));
    })
  );

  render(<AnalysisForm />);
  
  await user.click(screen.getByRole('button', { name: 'Analyze' }));
  
  await waitFor(() => {
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });
});
```

## Debugging Tests

### Common Issues and Solutions

#### Test Timeouts
```typescript
// Increase timeout for slow operations
it('should handle large file upload', async () => {
  // ... test code
}, 30000); // 30 second timeout

// Use waitFor with custom timeout
await waitFor(() => {
  expect(screen.getByText('Upload complete')).toBeInTheDocument();
}, { timeout: 10000 });
```

#### Flaky Tests
```typescript
// Use fake timers for time-dependent tests
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should auto-save after 5 seconds', async () => {
  render(<AutoSaveForm />);
  
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  
  expect(mockSave).toHaveBeenCalled();
});
```

#### Memory Leaks
```typescript
// Proper cleanup in tests
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.clearAllTimers();
});
```

### Test Debugging Tools

```typescript
// Debug component state
import { screen, debug } from '@testing-library/react';

it('should render correctly', () => {
  render(<MyComponent />);
  
  // Print current DOM
  screen.debug();
  
  // Print specific element
  screen.debug(screen.getByTestId('my-element'));
});

// Debug queries
import { logRoles } from '@testing-library/dom';

it('should have correct accessibility roles', () => {
  const { container } = render(<MyComponent />);
  logRoles(container);
});
```

## Performance Testing

### Load Testing Example

```typescript
// e2e/tests/performance.spec.ts
import { test, expect } from '@playwright/test';

test('should handle concurrent users', async ({ browser }) => {
  const contexts = await Promise.all(
    Array.from({ length: 10 }, () => browser.newContext())
  );
  
  const pages = await Promise.all(
    contexts.map(context => context.newPage())
  );
  
  // Simulate concurrent analysis requests
  const startTime = Date.now();
  
  await Promise.all(
    pages.map(async (page, index) => {
      await page.goto('/analyzer');
      await page.fill('[data-testid="content-input"]', `Test content ${index}`);
      await page.click('[data-testid="analyze-button"]');
      await page.waitForSelector('[data-testid="results"]');
    })
  );
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
  
  // Cleanup
  await Promise.all(contexts.map(context => context.close()));
});
```

## Continuous Integration

### GitHub Actions Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:coverage
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
      
      - name: Run e2e tests
        run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

This guide provides comprehensive instructions for writing and maintaining tests in the HalluciFix project. Follow these patterns and best practices to ensure high-quality, maintainable test suites.