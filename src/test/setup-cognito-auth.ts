import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';

// Create mock Auth object
const mockAuth = {
  configure: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  currentAuthenticatedUser: vi.fn(),
  currentSession: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUp: vi.fn(),
  forgotPassword: vi.fn(),
  forgotPasswordSubmit: vi.fn(),
  changePassword: vi.fn(),
  federatedSignIn: vi.fn(),
};

// Mock AWS Amplify
vi.mock('@aws-amplify/auth', () => ({
  Auth: mockAuth,
}));

// Create mock Hub object
const mockHub = {
  listen: vi.fn(),
  dispatch: vi.fn(),
};

vi.mock('@aws-amplify/core', () => ({
  Amplify: {
    configure: vi.fn(),
  },
  Hub: mockHub,
}));

vi.mock('amazon-cognito-identity-js', () => ({
  CognitoUser: vi.fn(),
  CognitoUserSession: vi.fn(),
  CognitoUserPool: vi.fn(),
  CognitoUserAttribute: vi.fn(),
  AuthenticationDetails: vi.fn(),
}));

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_AWS_REGION: 'us-east-1',
    VITE_AWS_USER_POOL_ID: 'us-east-1_TEST123',
    VITE_AWS_USER_POOL_CLIENT_ID: 'test-client-id',
    VITE_AWS_IDENTITY_POOL_ID: 'us-east-1:test-identity-pool',
    VITE_AWS_USER_POOL_DOMAIN: 'test-domain.auth.us-east-1.amazoncognito.com',
    VITE_AWS_OAUTH_REDIRECT_SIGN_IN: 'http://localhost:3000/callback',
    VITE_AWS_OAUTH_REDIRECT_SIGN_OUT: 'http://localhost:3000/logout',
    VITE_AWS_S3_BUCKET: 'test-bucket',
    VITE_AWS_API_GATEWAY_URL: 'https://test-api.execute-api.us-east-1.amazonaws.com/test',
  },
  writable: true,
});

// Global test setup
beforeAll(() => {
  // Setup global mocks
  global.console = {
    ...console,
    // Suppress console.log in tests unless explicitly needed
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
});

afterAll(() => {
  // Cleanup global mocks
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
  
  // Reset mock implementations
  Object.values(mockAuth).forEach(mock => mock.mockReset());
  Object.values(mockHub).forEach(mock => mock.mockReset());
});

afterEach(() => {
  // Cleanup after each test
  vi.clearAllTimers();
});