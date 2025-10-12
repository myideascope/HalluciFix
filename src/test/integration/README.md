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

```
src/
├── test/
│   ├── setup.integration.ts          # Integration test setup
│   ├── utils/
│   │   ├── database.ts               # Database utilities with isolation
│   │   └── mocks.ts                  # Mock utilities for external services
│   └── integration/
│       └── README.md                 # This file
├── lib/__tests__/
│   ├── *.integration.test.ts         # Service integration tests
│   └── supabase.integration.test.ts  # Database integration tests
└── components/__tests__/
    └── *.integration.test.tsx         # Component integration tests
```

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

### Running Tests

```bash
# Run all integration tests
npm run test:integration

# Run integration tests in watch mode
npm run test:integration:watch

# Run integration tests with coverage
npm run test:integration:coverage

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

**Example**:
```typescript
describe('Database Integration Tests', () => {
  let testIsolation: DatabaseTestIsolation;

  beforeEach(async () => {
    testIsolation = new DatabaseTestIsolation();
    await setupTestDatabase();
  });

  afterEach(async () => {
    await testIsolation.cleanup();
  });

  it('should create and retrieve user data', async () => {
    const user = await testIsolation.createIsolatedUser();
    const analysis = await testIsolation.createIsolatedAnalysis({
      user_id: user.id
    });

    expect(analysis.user_id).toBe(user.id);
  });
});
```

### 2. API Integration Tests

**Location**: `src/lib/__tests__/analysisService.integration.test.ts`, `src/lib/__tests__/api.integration.test.ts`

**Purpose**: Test complete API workflows from request to database storage

**Key Features**:
- Mock external API responses with MSW
- Test authentication flows
- Validate data transformation and storage
- Error handling and fallback mechanisms
- Performance monitoring

**Example**:
```typescript
describe('Analysis Service Integration', () => {
  it('should complete analysis workflow with database storage', async () => {
    const content = 'Test content with suspicious claims...';
    
    const { analysis } = await analysisService.analyzeContent(content, testUser.id);
    
    expect(analysis.accuracy).toBeLessThan(70);
    
    // Verify database storage
    const { data: storedAnalysis } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', testUser.id)
      .single();
      
    expect(storedAnalysis.accuracy).toBe(analysis.accuracy);
  });
});
```

### 3. File Processing Integration Tests

**Location**: `src/lib/__tests__/pdfParser.integration.test.ts`, `src/lib/__tests__/fileProcessing.integration.test.ts`

**Purpose**: Test file upload, parsing, and analysis workflows

**Key Features**:
- Mock file operations with realistic content
- Test different file formats (PDF, TXT, DOC)
- Validate content extraction and analysis
- Error handling for corrupted files
- Performance testing for large files

**Example**:
```typescript
describe('File Processing Integration', () => {
  it('should process PDF file through complete pipeline', async () => {
    const pdfFile = createMockFile('test.pdf', 'content', 'application/pdf');
    
    const extractedText = await parsePDF(pdfFile);
    const { analysis } = await analysisService.analyzeContent(extractedText, testUser.id);
    
    expect(analysis).toBeDefined();
    expect(analysis.user_id).toBe(testUser.id);
  });
});
```

### 4. Google Drive Integration Tests

**Location**: `src/lib/__tests__/googleDrive.integration.test.ts`

**Purpose**: Test Google Drive API integration and file processing

**Key Features**:
- Mock Google Drive API responses
- Test authentication and authorization
- Validate file listing and download operations
- Test different Google file formats (Docs, Sheets, PDFs)
- Error handling for API failures

**Example**:
```typescript
describe('Google Drive Integration', () => {
  it('should download and analyze Google Drive file', async () => {
    server.use(
      rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
        return res(ctx.json({ files: mockFiles }));
      })
    );

    await googleDriveService.initialize();
    const files = await googleDriveService.listFiles();
    const content = await googleDriveService.downloadFile(files[0].id);
    
    expect(content).toBeDefined();
  });
});
```

## Test Utilities

### Database Test Isolation

The `DatabaseTestIsolation` class provides isolated test data management:

```typescript
const isolation = new DatabaseTestIsolation();

// Create isolated test data
const user = await isolation.createIsolatedUser();
const analysis = await isolation.createIsolatedAnalysis({ user_id: user.id });

// Cleanup all test data
await isolation.cleanup();
```

### Performance Monitoring

The `DatabasePerformanceMonitor` class tracks operation performance:

```typescript
const monitor = new DatabasePerformanceMonitor();

monitor.start();
await someOperation();
monitor.recordOperation('operation_name');

const report = monitor.getReport();
expect(report.totalTime).toBeLessThan(5000);
```

### Mock Service Worker (MSW)

External API calls are mocked using MSW:

```typescript
server.use(
  rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
    return res(ctx.json(mockAnalysisResponse));
  })
);
```

## Test Data Management

### Test Data Scenarios

Pre-built scenarios for common testing patterns:

```typescript
// User permission testing
const { adminUser, regularUser, viewerUser } = await testDataScenarios.userPermissions();

// Analysis workflow testing
const { user, highAccuracy, lowAccuracy } = await testDataScenarios.analysisWorkflow();

// Batch analysis testing
const { user, batchId, batchResults } = await testDataScenarios.batchAnalysis();
```

### Data Cleanup

Automatic cleanup ensures test isolation:

```typescript
beforeEach(async () => {
  await cleanupTestDatabase(); // Clean before each test
});

afterEach(async () => {
  await testIsolation.cleanup(); // Clean after each test
});
```

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

### 1. Test Isolation

- Use `DatabaseTestIsolation` for isolated test data
- Clean up after each test to prevent interference
- Use unique identifiers for test data

### 2. Realistic Testing

- Use realistic test data and scenarios
- Mock external services consistently
- Test error conditions and edge cases

### 3. Performance Awareness

- Monitor test execution time
- Use performance assertions for critical operations
- Test concurrent operations where applicable

### 4. Error Handling

- Test both success and failure scenarios
- Verify graceful degradation
- Test recovery mechanisms

### 5. Documentation

- Document test scenarios and expected outcomes
- Include setup instructions for new developers
- Maintain clear test descriptions

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify test database URL and credentials
   - Check database accessibility from test environment
   - Ensure test database schema is up to date

2. **Test Data Conflicts**
   - Use `DatabaseTestIsolation` for proper isolation
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

### Debugging Tips

1. **Enable Debug Logging**
   ```typescript
   // Add to test setup
   console.log('Test database health:', await checkDatabaseHealth());
   ```

2. **Inspect Test Data**
   ```typescript
   // Check what data exists after test
   const { data } = await supabase.from('users').select('*');
   console.log('Remaining users:', data);
   ```

3. **Monitor Performance**
   ```typescript
   const monitor = new DatabasePerformanceMonitor();
   // ... run operations
   console.log('Performance report:', monitor.getReport());
   ```

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Use appropriate test utilities for isolation and cleanup
3. Include both success and error scenarios
4. Add performance assertions where relevant
5. Update this documentation for new test categories or utilities

## Related Documentation

- [Unit Testing Guide](../README.md)
- [API Documentation](../../../docs/API_REFERENCE.md)
- [Database Schema](../../../docs/TECHNICAL_DOCUMENTATION.md)
- [Testing Strategy](../../../../.kiro/specs/comprehensive-testing-strategy/design.md)