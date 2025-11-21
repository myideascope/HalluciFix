import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { logger } from './logging';
import '@testing-library/jest-dom';

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_AWS_REGION: 'us-east-1',
    VITE_COGNITO_USER_POOL_ID: 'us-east-1_TEST123456',
    VITE_COGNITO_USER_POOL_CLIENT_ID: 'test-client-id',
    VITE_COGNITO_IDENTITY_POOL_ID: 'us-east-1:test-identity-pool-id',
    VITE_COGNITO_DOMAIN: 'test-domain.auth.us-east-1.amazoncognito.com',
    VITE_API_GATEWAY_URL: 'https://test-api.execute-api.us-east-1.amazonaws.com/dev',
    VITE_S3_BUCKET_NAME: 'test-bucket',
    VITE_ENABLE_MIGRATION_MODE: 'true',
    VITE_DEFAULT_AUTH_MODE: 'cognito',
    DEV: true,
  },
  writable: true,
});

// Mock AWS Amplify globally
vi.mock('aws-amplify', () => ({
  Amplify: {
    configure: vi.fn(),
  },
  Auth: {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    federatedSignIn: vi.fn(),
    currentAuthenticatedUser: vi.fn(),
    currentSession: vi.fn(),
    confirmSignUp: vi.fn(),
    resendSignUp: vi.fn(),
    forgotPassword: vi.fn(),
    forgotPasswordSubmit: vi.fn(),
    changePassword: vi.fn(),
    updateUserAttributes: vi.fn(),
    userAttributes: vi.fn(),
    setupTOTP: vi.fn(),
    verifyTotpToken: vi.fn(),
    setPreferredMFA: vi.fn(),
    getPreferredMFA: vi.fn(),
    enableSMS: vi.fn(),
    disableSMS: vi.fn(),
    confirmSignIn: vi.fn(),
  },
  Hub: {
    listen: vi.fn(),
    remove: vi.fn(),
  },
}));

// Mock subscription service
vi.mock('../../lib/subscriptionServiceClient', () => ({
  subscriptionService: {
    getUserSubscription: vi.fn(),
    getSubscriptionPlan: vi.fn(),
  },
}));

// Mock Google APIs
vi.mock('googleapis', () => ({
  google: {
    drive: vi.fn(() => ({
      files: {
        list: vi.fn(),
        get: vi.fn(),
      },
    })),
    auth: {
      OAuth2: vi.fn(),
    },
  },
}));

// Mock browser APIs
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:5173',
    origin: 'http://localhost:5173',
    reload: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// Global test setup
beforeAll(() => {
  // Set up any global test configuration
  logger.debug("🧪 Setting up Cognito Auth tests...");
});

afterAll(() => {
  // Clean up after all tests
  logger.debug("🧹 Cleaning up Cognito Auth tests...");
});

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
  
  // Reset localStorage
  vi.mocked(localStorage.getItem).mockReturnValue(null);
  vi.mocked(localStorage.setItem).mockImplementation(() => {});
  vi.mocked(localStorage.removeItem).mockImplementation(() => {});
  vi.mocked(localStorage.clear).mockImplementation(() => {});
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});

// Custom matchers for authentication testing
expect.extend({
  toBeAuthenticatedUser(received) {
    const pass = received && 
                 typeof received.id === 'string' && 
                 typeof received.email === 'string' &&
                 received.role && 
                 Array.isArray(received.permissions);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid authenticated user`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid authenticated user with id, email, role, and permissions`,
        pass: false,
      };
    }
  },
  
  toHaveValidSession(received) {
    const pass = received && 
                 typeof received.accessToken === 'string' &&
                 typeof received.refreshToken === 'string';
    
    if (pass) {
      return {
        message: () => `expected ${received} not to have a valid session`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to have valid session tokens`,
        pass: false,
      };
    }
  },
});

// Extend Vitest types
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeAuthenticatedUser(): T;
    toHaveValidSession(): T;
  }
  interface AsymmetricMatchersContaining {
    toBeAuthenticatedUser(): any;
    toHaveValidSession(): any;
  }
}

export {};