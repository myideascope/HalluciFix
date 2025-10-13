# Integration Testing Framework

This directory contains the integration testing framework for the HalluciFix application. Integration tests verify that different components of the system work together correctly, including database operations, API integrations, and file processing workflows.

## Overview

The integration testing framework provides:

- **Database Integration Tests**: Test real database operations with proper isolation and cleanup
- **API Integration Tests**: Test complete API workflows from request to database storage
- **File Processing Integration Tests**: Test file upload, parsing, and analysis workflows
- **Google Drive Integration Tests**: Test Google Drive API integration and file processing
- **Performance Testing**: Monitor and validate system performance under realistic conditions

## Test Structure

### Test Files

- `api.integration.test.ts` - Tests for API integration workflows
- `database.integration.test.ts` - Tests for database operations and data consistency
- `file-processing.integration.test.ts` - Tests for file upload, processing, and analysis workflows

### Test Utilities

- `../utils/database.ts` - Database setup, cleanup, and test data management
- `../integration-setup.ts` - Integration test specific setup and configuration
- `../mocks/` - Mock services and API responses for integration tests

## Running Integration Tests

### Prerequisites

1. **Test Database**: Set up a test database instance
   ```bash
   # Set environment variables
   export VITE_TEST_SUPABASE_URL="your-test-supabase-url"
   export VITE_TEST_SUPABASE_ANON_KEY="your-test-anon-key"
   ```

2. **Test API Keys**: Configure test API keys for external services
   ```bash
   export VITE_TEST_HALLUCIFIX_API_KEY="test-api-key"
   export VITE_TEST_GOOGLE_CLIENT_ID="test-google-client-id"
   ```

### Commands

```bash
# Run all integration tests
npm run test:integration

# Run integration tests in watch mode
npm run test:integration:watch

# Run integration tests with coverage
npm run test:integration:coverage

# Run integration tests with UI
npm run test:integration:ui

# Run specific integration test file
npx vitest --config vitest.integration.config.ts src/lib/__tests__/analysisService.integration.test.ts --run
```

## Test Categories

### 1. Database Integration Tests

**Location**: `src/test/utils/__tests__/database.integration.test.ts`, `src/lib/__tests__/supabase.integration.test.ts`

**Purpose**: Test database operations, data consistency, and transaction handling

**Key Features**:
- Real database connections with test isolation
- Automatic cleanup after each test
- Performance monitoring for database operations
- Concurrent operation testing
- Foreign key constraint validation

### 2. API Integration Tests

**Location**: `src/lib/__tests__/analysisService.integration.test.ts`, `src/lib/__tests__/api.integration.test.ts`

**Purpose**: Test complete API workflows from request to database storage

**Key Features**:
- Mock external API responses with MSW
- Test authentication flows
- Validate data transformation and storage
- Error handling and fallback mechanisms
- Performance monitoring

### 3. File Processing Integration Tests

**Location**: `src/lib/__tests__/pdfParser.integration.test.ts`, `src/lib/__tests__/fileProcessing.integration.test.ts`

**Purpose**: Test file upload, parsing, and analysis workflows

**Key Features**:
- Mock file operations with realistic content
- Test different file formats (PDF, TXT, DOC)
- Validate content extraction and analysis
- Error handling for corrupted files
- Performance testing for large files

### 4. Google Drive Integration Tests

**Location**: `src/lib/__tests__/googleDrive.integration.test.ts`

**Purpose**: Test Google Drive API integration and file processing

**Key Features**:
- Mock Google Drive API responses
- Test authentication and authorization
- Validate file listing and download operations
- Test different Google file formats (Docs, Sheets, PDFs)
- Error handling for API failures

## Test Data Management

### Test Data Scenarios

The framework provides pre-built test scenarios:

```typescript
// User permission testing
const { adminUser, regularUser, viewerUser } = await testDataScenarios.userPermissions();

// Analysis workflow testing
const { user, highAccuracy, lowAccuracy } = await testDataScenarios.analysisWorkflow();

// Batch analysis testing
const { user, batchId, batchResults } = await testDataScenarios.batchAnalysis();
```

### Mock Services

Integration tests use Mock Service Worker (MSW) to mock external APIs:

- Google Drive API responses
- OpenAI API responses
- Stripe payment API responses
- File system operations

## Configuration

### Environment Variables

Integration tests use separate environment variables:

```bash
# Test Database
VITE_TEST_SUPABASE_URL=https://test.supabase.co
VITE_TEST_SUPABASE_ANON_KEY=test-anon-key

# Test API Keys
VITE_TEST_HALLUCIFIX_API_KEY=test-api-key
VITE_TEST_GOOGLE_CLIENT_ID=test-google-client-id
VITE_TEST_GOOGLE_CLIENT_SECRET=test-google-secret
```

### Vitest Configuration

Integration tests use a separate Vitest configuration:

```typescript
// vitest.integration.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.integration.ts'],
    include: ['src/**/*.integration.test.{ts,tsx}'],
    testTimeout: 30000, // Longer timeout for integration tests
    threads: false, // Sequential execution for database isolation
  }
});
```

## Best Practices

### Writing Integration Tests

1. **Use descriptive test names** that explain the complete workflow being tested
2. **Test realistic scenarios** that match actual user workflows
3. **Include error handling tests** for network failures, API errors, etc.
4. **Verify data persistence** by checking database state after operations
5. **Test performance** with realistic data sizes and concurrent operations

### Test Organization

```typescript
describe('Feature Integration Tests', () => {
  beforeEach(async () => {
    await setupTestDatabase();
    testData = await seedMinimalTestData();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('Specific Workflow', () => {
    it('should complete workflow successfully', async () => {
      // Test implementation
    });
  });
});
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify test database URL and credentials
   - Check database accessibility from test environment
   - Ensure test database schema is up to date

2. **Test Data Conflicts**
   - Use proper isolation and cleanup in test hooks
   - Verify cleanup functions are working correctly
   - Check for leftover test data from previous runs

3. **Mock Service Issues**
   - Verify MSW server is properly configured
   - Check mock handlers match actual API endpoints
   - Ensure mocks are reset between tests

4. **Timeout Issues**
   - Increase test timeout for slow operations
   - Check for infinite loops or hanging promises
   - Verify external service mocks are responding

### Debugging

```typescript
// Enable debug logging
console.debug('Test database state:', await getTestDatabase().from('users').select('*'));

// Measure operation performance
const { result, duration } = await testPerformance.measureOperation(
  'operation name',
  async () => {
    // Your operation
  }
);
```

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Use appropriate test utilities for isolation and cleanup
3. Include both success and error scenarios
4. Add performance assertions where relevant
5. Update this documentation for new test categories or utilities

## Environment Variables

Integration tests support the following environment variables:

- `VITE_TEST_SUPABASE_URL` - Test database URL
- `VITE_TEST_SUPABASE_ANON_KEY` - Test database anonymous key
- `VITE_TEST_MODE` - Set to 'integration' for integration test mode
- `VITE_DATABASE_ISOLATION` - Enable database isolation features

## Related Documentation

- [Unit Testing Guide](../README.md)
- [API Documentation](../../../docs/API_REFERENCE.md)
- [Database Schema](../../../docs/TECHNICAL_DOCUMENTATION.md)
- [Testing Strategy](../../../../.kiro/specs/comprehensive-testing-strategy/design.md)
