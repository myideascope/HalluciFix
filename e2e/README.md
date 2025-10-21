# End-to-End Testing with Playwright

This directory contains the complete E2E testing infrastructure for HalluciFix using Playwright.

## Directory Structure

```
e2e/
├── auth/                    # Authentication state files (generated)
├── pages/                   # Page Object Models
│   ├── BasePage.ts         # Base page class with common utilities
│   ├── LandingPage.ts      # Landing page interactions
│   ├── Dashboard.ts        # Dashboard page interactions
│   └── AnalyzerPage.ts     # Analysis page interactions
├── tests/                   # Test specifications
│   ├── landing-page.spec.ts
│   ├── dashboard.spec.ts
│   └── analyzer.spec.ts
├── utils/                   # Test utilities
│   ├── auth.ts             # Authentication helpers
│   └── testData.ts         # Test data management
├── global-setup.ts         # Global test setup
├── global-teardown.ts      # Global test cleanup
└── README.md              # This file
```

## Page Object Model Architecture

### BasePage Class
The `BasePage` class provides common functionality for all page objects:
- Navigation and URL handling
- Element interaction methods (click, fill, wait, etc.)
- Screenshot and debugging utilities
- Performance monitoring
- Accessibility validation
- Error handling and retry logic

### Specific Page Classes
Each page extends `BasePage` and implements:
- Page-specific selectors and methods
- Business logic for user interactions
- Validation methods for page state
- Data retrieval methods

## Test Utilities

### Authentication Helper (`auth.ts`)
- Login/logout functionality
- User session management
- OAuth flow simulation
- Test user creation and cleanup
- Authentication state persistence

### Test Data Manager (`testData.ts`)
- Test data creation and seeding
- Database cleanup utilities
- File upload test data
- Realistic scenario generation

## Running E2E Tests

### Basic Commands
```bash
# Run all E2E tests
npm run test:e2e

# Run tests in UI mode
npm run test:e2e:ui

# Run tests in headed mode (visible browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test e2e/tests/landing-page.spec.ts

# Run tests for specific browser
npx playwright test --project=chromium
```

### Debug Mode
```bash
# Run in debug mode
npm run test:e2e:debug

# Run specific test in debug mode
npx playwright test e2e/tests/dashboard.spec.ts --debug
```

### Test Reports
```bash
# Show test report
npm run test:e2e:report

# Generate and show report
npx playwright show-report
```

## Test Configuration

The E2E tests are configured in `playwright.config.ts` with:
- Multiple browser support (Chromium, Firefox, WebKit)
- Mobile device testing
- Automatic test server startup
- Screenshot and video capture on failures
- Parallel test execution
- Retry logic for flaky tests

## Writing New Tests

### 1. Create Page Object Model
```typescript
import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class MyPage extends BasePage {
  private readonly selectors = {
    myButton: '[data-testid="my-button"]',
    myInput: '[data-testid="my-input"]',
  };

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/my-page');
    await this.waitForLoad();
  }

  async waitForLoad(): Promise<void> {
    await this.waitForElement(this.selectors.myButton);
  }

  async clickMyButton(): Promise<void> {
    await this.clickElement(this.selectors.myButton);
  }
}
```

### 2. Create Test Specification
```typescript
import { test, expect } from '@playwright/test';
import { MyPage } from '../pages/MyPage';

test.describe('My Page', () => {
  let myPage: MyPage;

  test.beforeEach(async ({ page }) => {
    myPage = new MyPage(page);
    await myPage.goto();
  });

  test('should perform basic interaction', async () => {
    await myPage.clickMyButton();
    // Add assertions
  });
});
```

## Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Keep tests independent and isolated
- Use proper setup and teardown

### Page Objects
- Use data-testid attributes for reliable selectors
- Implement wait strategies for dynamic content
- Add validation methods for page state
- Handle loading states and errors

### Test Data
- Use factories for consistent test data
- Clean up test data after tests
- Use realistic data scenarios
- Avoid hardcoded values

### Assertions
- Use Playwright's built-in assertions
- Add meaningful error messages
- Test both positive and negative scenarios
- Validate accessibility and performance

## Debugging Tests

### Visual Debugging
- Use `--headed` flag to see browser actions
- Add `await page.pause()` to stop execution
- Take screenshots at key points
- Use browser developer tools

### Logging and Tracing
- Enable trace collection for failed tests
- Use console.log for debugging information
- Check network requests and responses
- Monitor performance metrics

## CI/CD Integration

The E2E tests are designed to run in CI/CD pipelines with:
- Headless browser execution
- Parallel test execution
- Artifact collection (screenshots, videos, reports)
- Test result reporting
- Failure notifications

## Troubleshooting

### Common Issues
1. **Flaky Tests**: Add proper wait strategies and retry logic
2. **Slow Tests**: Optimize selectors and reduce unnecessary waits
3. **Authentication Issues**: Check test user setup and session management
4. **Data Issues**: Ensure proper test data cleanup and isolation

### Performance Optimization
- Use efficient selectors
- Minimize page reloads
- Reuse authentication state
- Run tests in parallel
- Use test data factories

## Maintenance

### Regular Tasks
- Update page objects when UI changes
- Review and update test data
- Monitor test execution times
- Update browser versions
- Review test coverage

### Code Quality
- Follow TypeScript best practices
- Use consistent naming conventions
- Add proper error handling
- Document complex test scenarios
- Regular code reviews