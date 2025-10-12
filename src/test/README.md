# Testing Framework Setup

This directory contains the comprehensive testing framework for the HalluciFix application, implementing unit tests, integration tests, and end-to-end tests with proper coverage reporting.

## Framework Overview

### Testing Stack
- **Vitest**: Fast unit test runner with TypeScript support
- **React Testing Library**: Component testing with accessibility focus
- **jsdom**: Browser environment simulation
- **@faker-js/faker**: Realistic test data generation
- **@testing-library/jest-dom**: Extended DOM matchers

### Coverage Configuration
- **Provider**: v8 (built into Vitest)
- **Thresholds**: 80%+ overall, 90%+ for critical modules (`src/lib/`, `src/hooks/`)
- **Reports**: Text, JSON, HTML, and LCOV formats
- **Exclusions**: Test files, config files, type definitions

## Directory Structure

```
src/test/
├── setup.ts                 # Global test configuration
├── utils/
│   ├── render.tsx           # Custom React render with providers
│   └── mocks.ts             # Mock utilities and helpers
├── factories/
│   └── index.ts             # Test data factories using Faker
└── README.md                # This documentation
```

## Available Scripts

```bash
# Run all tests
npm run test

# Run tests once (CI mode)
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run tests in watch mode
npm run test:watch
```

## Writing Tests

### Component Tests

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@test/utils/render';
import { createTestUser } from '@test/factories';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    const user = createTestUser();
    
    render(<MyComponent user={user} />);
    
    expect(screen.getByText(user.name)).toBeInTheDocument();
  });
});
```

### Service Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createMockSupabaseClient } from '@test/utils/mocks';
import { myService } from '../myService';

describe('MyService', () => {
  it('should handle API calls correctly', async () => {
    const mockClient = createMockSupabaseClient();
    
    const result = await myService.getData();
    
    expect(result).toBeDefined();
    expect(mockClient.from).toHaveBeenCalledWith('table_name');
  });
});
```

### Hook Tests

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from '../useMyHook';

describe('useMyHook', () => {
  it('should manage state correctly', () => {
    const { result } = renderHook(() => useMyHook());
    
    act(() => {
      result.current.updateValue('new value');
    });
    
    expect(result.current.value).toBe('new value');
  });
});
```

## Test Utilities

### Custom Render
The custom render utility provides all necessary providers:
- Mock Auth Provider
- Mock Toast Provider  
- Mock Theme Provider

```typescript
import { render } from '@test/utils/render';

// Basic usage
render(<Component />);

// With initial user
render(<Component />, { initialUser: testUser });
```

### Mock Utilities
Pre-configured mocks for common services:
- Supabase client
- Google APIs
- Fetch responses
- LocalStorage
- File operations

### Test Data Factories
Generate realistic test data:
- `createTestUser()` - User objects
- `createTestAnalysisResult()` - Analysis results
- `createTestScheduledScan()` - Scheduled scans
- `createTestReview()` - Review objects

## Environment Setup

### Global Configuration
- Environment variables mocked for tests
- Console methods mocked to reduce noise
- DOM APIs mocked (matchMedia, IntersectionObserver, etc.)
- Automatic cleanup after each test

### Coverage Thresholds
- **Global**: 80% branches, functions, lines, statements
- **Critical modules** (`src/lib/`, `src/hooks/`): 90% all metrics
- **Excluded**: Test files, configs, type definitions, build outputs

## Best Practices

### Test Organization
- Group related tests in `describe` blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Keep tests focused and isolated

### Mocking Strategy
- Mock external dependencies
- Use MSW for API mocking (when implemented)
- Prefer dependency injection for testability
- Mock at the boundary, not implementation details

### Data Management
- Use factories for consistent test data
- Clean up after each test automatically
- Isolate test data to prevent interference
- Use realistic data that matches production

### Performance
- Tests run in parallel by default
- Smart test selection based on changed files
- Coverage caching for unchanged code
- Efficient cleanup and setup

## Troubleshooting

### Common Issues

1. **Tests failing due to missing providers**
   - Use the custom render utility from `@test/utils/render`

2. **Environment variables not available**
   - Check `src/test/setup.ts` for mocked env vars

3. **DOM APIs not available**
   - Global mocks are set up in `src/test/setup.ts`

4. **Coverage thresholds failing**
   - Check `vitest.config.ts` for current thresholds
   - Add tests for uncovered code paths

### Running Specific Tests

```bash
# Run specific test file
npm run test:run src/path/to/test.test.ts

# Run tests matching pattern
npm run test:run -- --grep "pattern"

# Run tests in specific directory
npm run test:run src/components/
```

## Integration with CI/CD

The testing framework is designed to integrate seamlessly with GitHub Actions:
- Parallel test execution
- Coverage reporting with Codecov
- Test result artifacts
- Performance regression detection

See the main project documentation for CI/CD configuration details.