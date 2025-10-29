# Cognito Authentication Testing Guide

This document provides comprehensive testing coverage for the AWS Cognito authentication integration in HalluciFix.

## Test Structure

### Unit Tests (`src/tests/auth/`)
- **cognito-auth.test.ts**: Tests for the core Cognito authentication service
- **useCognitoAuth.test.tsx**: Tests for the React authentication hook

### Integration Tests (`src/tests/integration/`)
- **oauth-integration.test.ts**: Tests for Google OAuth integration with Cognito
- **mfa-integration.test.ts**: Tests for Multi-Factor Authentication flows

### End-to-End Tests (`src/tests/e2e/`)
- **cognito-auth-flow.spec.ts**: Complete authentication flow testing with Playwright

## Running Tests

### Unit and Integration Tests
```bash
# Run all Cognito auth tests
npm run test:cognito-auth

# Run tests in watch mode
npm run test:cognito-auth:watch

# Run tests with coverage
npm run test:cognito-auth:coverage

# Run tests with UI
npm run test:cognito-auth:ui
```

### End-to-End Tests
```bash
# Run E2E tests
npm run test:e2e:cognito-auth

# Run E2E tests with UI
npm run test:e2e:cognito-auth:ui

# Run E2E tests in headed mode
npm run test:e2e:cognito-auth:headed

# View E2E test report
npm run test:e2e:cognito-auth:report
```

## Test Coverage

### Authentication Service Tests

#### Sign In/Sign Up
- ✅ Email/password authentication
- ✅ Google OAuth authentication
- ✅ User registration with email verification
- ✅ Error handling for invalid credentials
- ✅ Error handling for unverified users
- ✅ Error handling for existing users

#### Session Management
- ✅ Current user retrieval
- ✅ Session validation and refresh
- ✅ Sign out functionality
- ✅ Session persistence across page reloads
- ✅ Session expiration handling

#### Password Management
- ✅ Password reset initiation
- ✅ Password reset confirmation
- ✅ Password change for authenticated users
- ✅ Password validation and requirements

#### User Profile Management
- ✅ User attribute retrieval
- ✅ User attribute updates
- ✅ Profile synchronization with Cognito
- ✅ User data conversion from Cognito format

### OAuth Integration Tests

#### Google OAuth Flow
- ✅ OAuth initiation with proper scopes
- ✅ OAuth callback handling
- ✅ Authorization code exchange
- ✅ Token refresh and expiration
- ✅ Error handling for OAuth failures

#### Google Drive Integration
- ✅ Drive API access after OAuth
- ✅ File listing and retrieval
- ✅ Permission and scope validation
- ✅ API error handling

#### OAuth Security
- ✅ State parameter validation
- ✅ CSRF protection
- ✅ HTTPS enforcement
- ✅ Scope validation and enforcement

### MFA Integration Tests

#### TOTP (Time-based One-Time Password)
- ✅ TOTP setup and QR code generation
- ✅ TOTP token verification
- ✅ Invalid token handling
- ✅ Time window validation

#### SMS MFA
- ✅ SMS MFA enablement/disablement
- ✅ SMS code verification
- ✅ SMS delivery confirmation

#### MFA Preferences
- ✅ MFA method selection (TOTP/SMS)
- ✅ MFA preference retrieval
- ✅ MFA requirement enforcement

#### MFA Security
- ✅ Rate limiting for MFA attempts
- ✅ MFA recovery procedures
- ✅ Backup code validation
- ✅ Admin MFA enforcement

### React Hook Tests

#### State Management
- ✅ Loading states during authentication
- ✅ User state updates via Hub events
- ✅ Subscription data loading
- ✅ Error state handling

#### Authentication Methods
- ✅ Hook-based sign in/sign up
- ✅ OAuth integration through hooks
- ✅ MFA challenge handling
- ✅ Password reset flows

#### Permission System
- ✅ Role-based permission checks
- ✅ Admin/manager role validation
- ✅ Feature access based on subscription
- ✅ Resource-action permission validation

### End-to-End Flow Tests

#### Complete Authentication Flows
- ✅ Full sign up and email verification
- ✅ Sign in with email/password
- ✅ Google OAuth complete flow
- ✅ MFA challenge completion
- ✅ Password reset end-to-end

#### User Interface Testing
- ✅ Form validation and error display
- ✅ Loading states and user feedback
- ✅ Navigation between auth states
- ✅ Responsive design validation

#### Error Scenarios
- ✅ Network error handling
- ✅ Service unavailability
- ✅ Invalid input validation
- ✅ Session timeout handling

## Test Configuration

### Environment Variables
Tests use mock environment variables defined in `src/tests/setup/cognito-auth-setup.ts`:

```typescript
VITE_AWS_REGION: 'us-east-1'
VITE_COGNITO_USER_POOL_ID: 'us-east-1_TEST123456'
VITE_COGNITO_USER_POOL_CLIENT_ID: 'test-client-id'
VITE_COGNITO_IDENTITY_POOL_ID: 'us-east-1:test-identity-pool-id'
VITE_COGNITO_DOMAIN: 'test-domain.auth.us-east-1.amazoncognito.com'
```

### Mock Services
- **AWS Amplify**: Mocked for all authentication operations
- **Google APIs**: Mocked for Drive integration testing
- **Subscription Service**: Mocked for user subscription testing
- **Browser APIs**: Mocked localStorage and location APIs

### Custom Matchers
The test setup includes custom Jest/Vitest matchers:

```typescript
expect(user).toBeAuthenticatedUser();
expect(session).toHaveValidSession();
```

## Test Data Management

### User Test Data
```typescript
const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  name: 'Test User',
  role: 'user',
  department: 'Engineering',
};
```

### Mock Responses
Tests use consistent mock responses for:
- Cognito authentication responses
- OAuth callback data
- MFA challenge responses
- User attribute data
- Subscription information

## Coverage Requirements

### Minimum Coverage Thresholds
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

### Coverage Reports
Coverage reports are generated in:
- `./coverage/cognito-auth/` - HTML and JSON reports
- Console output during test runs

## Continuous Integration

### GitHub Actions Integration
Tests are configured to run in CI/CD pipelines:

```yaml
- name: Run Cognito Auth Tests
  run: |
    npm run test:cognito-auth:coverage
    npm run test:e2e:cognito-auth
```

### Test Artifacts
- Coverage reports
- E2E test videos and screenshots
- Test result JSON files
- JUnit XML reports for CI integration

## Debugging Tests

### Unit Test Debugging
```bash
# Run specific test file
npx vitest src/tests/auth/cognito-auth.test.ts

# Run with debug output
DEBUG=* npm run test:cognito-auth:watch
```

### E2E Test Debugging
```bash
# Run with browser visible
npm run test:e2e:cognito-auth:headed

# Run with debug mode
npx playwright test --debug --config=playwright.cognito-auth.config.ts
```

### Common Issues and Solutions

#### Mock Setup Issues
- Ensure all AWS Amplify methods are properly mocked
- Verify environment variables are set in test setup
- Check that Hub listeners are properly mocked

#### Async Test Issues
- Use `waitFor` for async state updates
- Properly await all async operations
- Handle promise rejections in error tests

#### E2E Test Flakiness
- Increase timeouts for slow operations
- Use proper selectors with data-testid attributes
- Wait for elements to be visible before interaction

## Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

### Mock Management
- Reset mocks between tests
- Use specific mocks for each test scenario
- Avoid global state in mocks

### Error Testing
- Test both success and failure scenarios
- Verify error messages and types
- Test error recovery flows

### Performance Testing
- Test loading states and timeouts
- Verify efficient re-renders
- Test with realistic data sizes

## Migration Testing

### Dual Auth Mode Testing
The test suite supports testing both Supabase and Cognito authentication:

```typescript
// Test with Cognito auth
localStorage.setItem('hallucifix_auth_mode', 'cognito');

// Test with Supabase auth
localStorage.setItem('hallucifix_auth_mode', 'supabase');
```

### Migration Validation
- User data migration validation
- Session compatibility testing
- Feature parity verification
- Performance comparison testing

## Security Testing

### Authentication Security
- Password strength validation
- Session token security
- OAuth state validation
- CSRF protection testing

### Authorization Testing
- Role-based access control
- Permission boundary testing
- Subscription-based feature access
- Admin privilege escalation prevention

## Maintenance

### Regular Updates
- Update test data as features evolve
- Maintain mock responses with API changes
- Update coverage thresholds as codebase grows
- Review and update test documentation

### Test Health Monitoring
- Monitor test execution times
- Track flaky test patterns
- Review coverage trends
- Update deprecated testing patterns

This comprehensive testing suite ensures the Cognito authentication integration is robust, secure, and user-friendly across all supported scenarios.