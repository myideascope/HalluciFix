# Testing Best Practices Guide

## Overview

This guide provides practical best practices for writing effective tests in the HalluciFix application. Follow these guidelines to create maintainable, reliable, and efficient tests.

## General Testing Principles

### 1. Test Behavior, Not Implementation

❌ **Bad**: Testing internal implementation details
```typescript
it('should call setState with correct parameters', () => {
  const component = shallow(<MyComponent />);
  const instance = component.instance();
  const spy = jest.spyOn(instance, 'setState');
  
  instance.handleClick();
  
  expect(spy).toHaveBeenCalledWith({ clicked: true });
});
```

✅ **Good**: Testing user-visible behavior
```typescript
it('should show success message when button is clicked', async () => {
  render(<MyComponent />);
  
  await user.click(screen.getByRole('button', { name: /submit/i }));
  
  expect(screen.getByText(/success/i)).toBeInTheDocument();
});
```

### 2. Write Tests That Fail for the Right Reasons

Tests should fail when the feature breaks, not when implementation changes.

❌ **Bad**: Brittle test tied to implementation
```typescript
it('should have correct CSS class', () => {
  render(<Button variant="primary" />);
  expect(screen.getByRole('button')).toHaveClass('btn-primary-v2');
});
```

✅ **Good**: Test focused on user experience
```typescript
it('should be visually distinct as primary button', () => {
  render(<Button variant="primary">Submit</Button>);
  const button = screen.getByRole('button', { name: /submit/i });
  
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toBeEnabled();
});
```

### 3. Use the AAA Pattern

Structure tests with clear Arrange, Act, Assert sections:

```typescript
describe('HallucinationAnalyzer', () => {
  it('should display analysis results after processing', async () => {
    // Arrange
    const testContent = 'AI achieves 100% accuracy with zero errors';
    const mockResult = { accuracy: 75, riskLevel: 'medium' };
    vi.mocked(analysisService.analyze).mockResolvedValue(mockResult);
    
    render(<HallucinationAnalyzer />);
    
    // Act
    await user.type(screen.getByLabelText(/content/i), testContent);
    await user.click(screen.getByRole('button', { name: /analyze/i }));
    
    // Assert
    await waitFor(() => {
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText(/medium risk/i)).toBeInTheDocument();
    });
  });
});
```

## Unit Testing Best Practices

### Component Testing

#### 1. Test User Interactions

```typescript
describe('AuthForm', () => {
  it('should submit form with valid credentials', async () => {
    const mockOnSubmit = vi.fn();
    render(<AuthForm onSubmit={mockOnSubmit} />);
    
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    expect(mockOnSubmit).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123'
    });
  });
  
  it('should show validation errors for invalid input', async () => {
    render(<AuthForm onSubmit={vi.fn()} />);
    
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });
});
```

#### 2. Test Accessibility

```typescript
describe('Modal', () => {
  it('should be accessible to screen readers', () => {
    render(<Modal isOpen={true} title="Test Modal">Content</Modal>);
    
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveAttribute('aria-labelledby');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    
    // Focus should be trapped in modal
    expect(document.activeElement).toBeInTheDocument();
  });
  
  it('should support keyboard navigation', async () => {
    const mockOnClose = vi.fn();
    render(<Modal isOpen={true} onClose={mockOnClose}>Content</Modal>);
    
    await user.keyboard('{Escape}');
    
    expect(mockOnClose).toHaveBeenCalled();
  });
});
```

### Service Testing

#### 1. Test Business Logic

```typescript
describe('analysisService', () => {
  describe('analyzeContent', () => {
    it('should detect high-risk content with suspicious claims', async () => {
      const suspiciousContent = 'Our AI achieves 100% accuracy with zero false positives';
      
      const result = await analysisService.analyzeContent(suspiciousContent, 'user-123');
      
      expect(result.accuracy).toBeLessThan(80);
      expect(result.riskLevel).toBe('high');
      expect(result.hallucinations).toHaveLength(2); // "100% accuracy" and "zero false positives"
    });
    
    it('should handle empty content gracefully', async () => {
      const result = await analysisService.analyzeContent('', 'user-123');
      
      expect(result.accuracy).toBe(0);
      expect(result.riskLevel).toBe('low');
      expect(result.hallucinations).toHaveLength(0);
    });
  });
});
```

#### 2. Test Error Handling

```typescript
describe('googleDriveService', () => {
  it('should handle authentication errors gracefully', async () => {
    // Mock authentication failure
    vi.mocked(google.auth.OAuth2).mockImplementation(() => {
      throw new Error('Authentication failed');
    });
    
    await expect(googleDriveService.authenticate()).rejects.toThrow(
      'Failed to authenticate with Google Drive'
    );
  });
  
  it('should retry failed requests with exponential backoff', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, json: () => ({ files: [] }) });
    
    global.fetch = mockFetch;
    
    const result = await googleDriveService.listFiles();
    
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ files: [] });
  });
});
```

### Hook Testing

```typescript
describe('useAuth', () => {
  it('should manage authentication state correctly', async () => {
    const { result } = renderHook(() => useAuth());
    
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
    
    await act(async () => {
      await result.current.signIn('user@example.com', 'password');
    });
    
    expect(result.current.user).toEqual(
      expect.objectContaining({ email: 'user@example.com' })
    );
  });
  
  it('should handle sign out correctly', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider initialUser={createTestUser()}>
          {children}
        </AuthProvider>
      )
    });
    
    expect(result.current.user).toBeTruthy();
    
    await act(async () => {
      await result.current.signOut();
    });
    
    expect(result.current.user).toBeNull();
  });
});
```

## Integration Testing Best Practices

### Database Testing

```typescript
describe('User Management Integration', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });
  
  it('should create user with proper relationships', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    };
    
    const user = await userService.createUser(userData);
    
    expect(user.id).toBeDefined();
    expect(user.email).toBe(userData.email);
    
    // Verify database state
    const { data: dbUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
      
    expect(dbUser).toMatchObject(userData);
  });
});
```

### API Integration Testing

```typescript
describe('Analysis API Integration', () => {
  it('should handle complete analysis workflow', async () => {
    const testUser = await createTestUser();
    const testContent = 'Content to analyze';
    
    // Test API endpoint
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: testContent, userId: testUser.id })
    });
    
    expect(response.ok).toBe(true);
    
    const result = await response.json();
    expect(result).toMatchObject({
      accuracy: expect.any(Number),
      riskLevel: expect.stringMatching(/low|medium|high|critical/),
      processingTime: expect.any(Number)
    });
    
    // Verify data persistence
    const { data: analysisResults } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', testUser.id);
      
    expect(analysisResults).toHaveLength(1);
  });
});
```

## End-to-End Testing Best Practices

### Page Object Pattern

```typescript
// e2e/pages/AnalyzerPage.ts
export class AnalyzerPage {
  constructor(private page: Page) {}
  
  async goto() {
    await this.page.goto('/analyzer');
    await this.page.waitForLoadState('networkidle');
  }
  
  async analyzeContent(content: string) {
    await this.page.fill('[data-testid="content-textarea"]', content);
    await this.page.click('[data-testid="analyze-button"]');
    
    // Wait for analysis to complete
    await this.page.waitForSelector('[data-testid="analysis-results"]', {
      timeout: 30000
    });
  }
  
  async getResults() {
    const accuracy = await this.page.textContent('[data-testid="accuracy-score"]');
    const riskLevel = await this.page.textContent('[data-testid="risk-level"]');
    
    return {
      accuracy: parseFloat(accuracy?.replace('%', '') || '0'),
      riskLevel: riskLevel?.toLowerCase() || ''
    };
  }
}
```

### Reliable E2E Tests

```typescript
test.describe('Analysis Workflow', () => {
  test('should complete analysis successfully', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    await analyzerPage.goto();
    
    // Use realistic test data
    const testContent = `
      Recent studies show our AI model achieves unprecedented 99.9% accuracy.
      Users report 100% satisfaction with zero complaints.
      This represents a revolutionary breakthrough in the field.
    `;
    
    await analyzerPage.analyzeContent(testContent);
    
    const results = await analyzerPage.getResults();
    
    // Verify realistic expectations
    expect(results.accuracy).toBeGreaterThan(0);
    expect(results.accuracy).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(results.riskLevel);
  });
  
  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate network failure
    await page.route('**/api/analyze', route => route.abort());
    
    const analyzerPage = new AnalyzerPage(page);
    await analyzerPage.goto();
    await analyzerPage.analyzeContent('Test content');
    
    // Should show error message
    await expect(page.getByText(/analysis failed/i)).toBeVisible();
    await expect(page.getByText(/try again/i)).toBeVisible();
  });
});
```

## Test Data Management

### Using Factories

```typescript
// src/test/factories/userFactory.ts
export const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  role: 'user',
  status: 'active',
  createdAt: faker.date.past().toISOString(),
  ...overrides
});

// Usage in tests
describe('UserService', () => {
  it('should update user profile', async () => {
    const user = createTestUser({ name: 'Original Name' });
    const updates = { name: 'Updated Name' };
    
    const updatedUser = await userService.updateProfile(user.id, updates);
    
    expect(updatedUser.name).toBe('Updated Name');
  });
});
```

### Test Data Cleanup

```typescript
// Automatic cleanup with hooks
describe('Database Operations', () => {
  const createdUsers: string[] = [];
  
  afterEach(async () => {
    // Clean up created test data
    for (const userId of createdUsers) {
      await supabase.from('users').delete().eq('id', userId);
    }
    createdUsers.length = 0;
  });
  
  it('should create user successfully', async () => {
    const user = await userService.createUser(createTestUser());
    createdUsers.push(user.id);
    
    expect(user.id).toBeDefined();
  });
});
```

## Performance Testing Best Practices

### Measuring Core Web Vitals

```typescript
test('should meet performance benchmarks', async ({ page }) => {
  await page.goto('/');
  
  const metrics = await page.evaluate(() => {
    return new Promise((resolve) => {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const vitals = {};
        
        entries.forEach((entry) => {
          if (entry.name === 'first-contentful-paint') {
            vitals.fcp = entry.startTime;
          }
          if (entry.name === 'largest-contentful-paint') {
            vitals.lcp = entry.startTime;
          }
        });
        
        resolve(vitals);
      }).observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
      
      setTimeout(() => resolve({}), 5000);
    });
  });
  
  if (metrics.fcp) expect(metrics.fcp).toBeLessThan(2000);
  if (metrics.lcp) expect(metrics.lcp).toBeLessThan(2500);
});
```

## Common Anti-Patterns to Avoid

### ❌ Testing Implementation Details

```typescript
// Don't test internal state or methods
it('should set loading state to true', () => {
  const wrapper = shallow(<Component />);
  wrapper.instance().handleSubmit();
  expect(wrapper.state('loading')).toBe(true);
});
```

### ❌ Overly Complex Test Setup

```typescript
// Don't create overly complex test scenarios
beforeEach(() => {
  // 50 lines of setup code...
  setupComplexScenarioWithMultipleServicesAndDependencies();
});
```

### ❌ Testing Multiple Things in One Test

```typescript
// Don't test multiple behaviors in a single test
it('should handle user registration, email verification, and profile setup', () => {
  // This test is doing too much
});
```

### ❌ Brittle Selectors

```typescript
// Don't rely on implementation-specific selectors
expect(wrapper.find('.component-class-name-v2')).toHaveLength(1);

// Use semantic selectors instead
expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
```

## Debugging Test Failures

### 1. Use Debugging Tools

```typescript
// Add debug output for failing tests
it('should display results', async () => {
  render(<Component />);
  
  // Debug DOM state
  screen.debug();
  
  // Or debug specific elements
  screen.debug(screen.getByTestId('results'));
});
```

### 2. Check Async Operations

```typescript
// Use waitFor for async operations
it('should load data', async () => {
  render(<Component />);
  
  // Wait for async operation to complete
  await waitFor(() => {
    expect(screen.getByText(/loaded/i)).toBeInTheDocument();
  }, { timeout: 5000 });
});
```

### 3. Verify Test Environment

```typescript
// Check mocks and setup
beforeEach(() => {
  // Verify mocks are properly configured
  expect(vi.isMockFunction(mockService.method)).toBe(true);
  
  // Reset mocks between tests
  vi.clearAllMocks();
});
```

## Conclusion

Following these best practices will help you write maintainable, reliable tests that provide confidence in your code while being resilient to refactoring. Remember:

1. **Test behavior, not implementation**
2. **Keep tests simple and focused**
3. **Use realistic test data**
4. **Make tests readable and maintainable**
5. **Ensure tests fail for the right reasons**

For more specific guidance, refer to the framework-specific documentation and examples in the codebase.