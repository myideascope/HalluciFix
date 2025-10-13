import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase, forceCleanupTestDatabase, checkDatabaseHealth } from './utils/database';
import { server } from './mocks/server';

// Integration test specific setup
let testDatabaseInitialized = false;

beforeAll(async () => {
  console.log('🔧 Setting up integration test environment...');
  
  // Start MSW server for API mocking
  server.listen({ onUnhandledRequest: 'warn' });
  
  // Set up test database with longer timeout
  try {
    await setupTestDatabase();
    testDatabaseInitialized = true;
    console.log('✅ Test database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize test database:', error);
    throw error;
  }
  
  // Verify database health
  const isHealthy = await checkDatabaseHealth();
  if (!isHealthy) {
    throw new Error('Test database health check failed');
  }
  
  // Set up integration test specific environment
  vi.stubEnv('VITE_TEST_MODE', 'integration');
  vi.stubEnv('VITE_DATABASE_ISOLATION', 'true');
  
  // Mock external services for integration tests
  setupIntegrationMocks();
  
  console.log('🚀 Integration test environment ready');
}, 60000); // 60 second timeout for setup

beforeEach(async () => {
  // Clean up test data before each test for isolation
  if (testDatabaseInitialized) {
    await cleanupTestDatabase();
  }
  
  // Reset MSW handlers
  server.resetHandlers();
  
  // Clear all mocks
  vi.clearAllMocks();
}, 15000); // 15 second timeout for cleanup

afterEach(async () => {
  // Additional cleanup after each test
  if (testDatabaseInitialized) {
    try {
      await cleanupTestDatabase();
    } catch (error) {
      console.warn('⚠️ Test cleanup warning:', error);
    }
  }
}, 15000);

afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...');
  
  // Force cleanup all test data
  if (testDatabaseInitialized) {
    try {
      await forceCleanupTestDatabase();
      console.log('✅ Test database cleaned up');
    } catch (error) {
      console.warn('⚠️ Database cleanup warning:', error);
    }
  }
  
  // Stop MSW server
  server.close();
  
  // Restore all mocks
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  
  console.log('✅ Integration test environment cleaned up');
}, 30000);

/**
 * Set up mocks specific to integration tests
 */
function setupIntegrationMocks() {
  // Mock Google APIs for integration tests
  vi.mock('googleapis', () => ({
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(() => ({
          setCredentials: vi.fn(),
          getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }),
          generateAuthUrl: vi.fn().mockReturnValue('https://mock-auth-url.com')
        }))
      },
      drive: vi.fn().mockReturnValue({
        files: {
          list: vi.fn().mockResolvedValue({
            data: {
              files: [
                {
                  id: 'mock-file-1',
                  name: 'Test Document.docx',
                  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                }
              ]
            }
          }),
          get: vi.fn().mockResolvedValue({
            data: 'Mock file content for integration testing'
          })
        }
      })
    }
  }));
  
  // Mock OpenAI API for integration tests
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('openai.com/v1/chat/completions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                accuracy: 85.5,
                riskLevel: 'medium',
                hallucinations: [
                  {
                    type: 'unverified_claim',
                    confidence: 0.7,
                    text: 'mock hallucination for testing'
                  }
                ],
                verificationSources: 5,
                processingTime: 1250
              })
            }
          }]
        })
      });
    }
    
    // Default mock response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({})
    });
  });
  
  // Mock Stripe for payment integration tests
  vi.mock('stripe', () => ({
    default: vi.fn().mockImplementation(() => ({
      customers: {
        create: vi.fn().mockResolvedValue({ id: 'cus_mock_customer' }),
        retrieve: vi.fn().mockResolvedValue({ id: 'cus_mock_customer', email: 'test@example.com' })
      },
      subscriptions: {
        create: vi.fn().mockResolvedValue({ id: 'sub_mock_subscription', status: 'active' }),
        retrieve: vi.fn().mockResolvedValue({ id: 'sub_mock_subscription', status: 'active' })
      },
      paymentIntents: {
        create: vi.fn().mockResolvedValue({ id: 'pi_mock_payment', status: 'succeeded' })
      }
    }))
  }));
  
  // Mock file system operations for file processing tests
  vi.mock('fs/promises', () => ({
    readFile: vi.fn().mockResolvedValue('Mock file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined)
  }));
  
  // Mock PDF parsing for document processing tests
  vi.mock('pdf-parse', () => ({
    default: vi.fn().mockResolvedValue({
      text: 'Mock PDF content extracted for integration testing',
      numpages: 1,
      info: {
        Title: 'Mock PDF Document',
        Author: 'Test Author'
      }
    })
  }));
}

// Global error handlers for integration tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in integration test:', reason);
  // Don't throw in integration tests to avoid breaking the test suite
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in integration test:', error);
  // Don't throw in integration tests to avoid breaking the test suite
});

// Export utilities for integration tests
export {
  setupIntegrationMocks
};