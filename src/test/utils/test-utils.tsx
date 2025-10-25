import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

// Mock contexts for testing
const MockAuthProvider = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="mock-auth-provider">{children}</div>;
};

const MockToastProvider = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="mock-toast-provider">{children}</div>;
};

const MockErrorBoundaryProvider = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="mock-error-boundary-provider">{children}</div>;
};

// All providers wrapper for testing
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <MockErrorBoundaryProvider>
      <MockAuthProvider>
        <MockToastProvider>
          {children}
        </MockToastProvider>
      </MockAuthProvider>
    </MockErrorBoundaryProvider>
  );
};

// Custom render function with providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Mock user data for testing
export const mockUser = {
  id: 'mock-user-id',
  email: 'test@example.com',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  email_confirmed_at: new Date().toISOString()
};

// Mock analysis data for testing
export const mockAnalysis = {
  id: 'mock-analysis-1',
  content: 'This is test content for analysis',
  accuracy_score: 85.5,
  risk_level: 'medium' as const,
  created_at: new Date().toISOString(),
  user_id: 'mock-user-id',
  analysis_details: {
    content_length: 35,
    sources_checked: 3,
    confidence_score: 0.855
  }
};

// Mock scheduled scan data
export const mockScheduledScan = {
  id: 'mock-scan-1',
  name: 'Test Scheduled Scan',
  frequency: 'daily' as const,
  source_type: 'url' as const,
  source_config: { url: 'https://example.com' },
  is_active: true,
  created_at: new Date().toISOString(),
  user_id: 'mock-user-id'
};

// Utility functions for testing
export const createMockFile = (name: string, type: string, content: string = 'test content') => {
  const file = new File([content], name, { type });
  return file;
};

export const createMockEvent = (type: string, properties: Record<string, any> = {}) => {
  return {
    type,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: { value: '' },
    ...properties
  };
};

export const waitForLoadingToFinish = () => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

// Mock localStorage for testing
export const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};

// Mock sessionStorage for testing
export const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };