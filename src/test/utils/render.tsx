import React, { createContext } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi, expect } from 'vitest';
import { User, DEFAULT_ROLES } from '../../types/user';
import { ToastMessage } from '../../components/Toast';

// Mock Auth Context
interface MockAuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  canManageUsers: () => boolean;
}

const MockAuthContext = createContext<MockAuthContextType | undefined>(undefined);

// Mock Theme Context
interface MockThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const MockThemeContext = createContext<MockThemeContextType | undefined>(undefined);

// Mock Toast Context
interface MockToastContextType {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => string;
  removeToast: (id: string) => void;
  showSuccess: (title: string, message: string, duration?: number) => string;
  showWarning: (title: string, message: string, duration?: number) => string;
  showError: (title: string, message: string, duration?: number) => string;
  showInfo: (title: string, message: string, duration?: number) => string;
}

const MockToastContext = createContext<MockToastContextType | undefined>(undefined);

// Mock Auth Provider
const MockAuthProvider: React.FC<{ 
  children: React.ReactNode; 
  initialUser?: User | null;
  loading?: boolean;
}> = ({ 
  children, 
  initialUser = null,
  loading = false
}) => {
  const mockAuthContext: MockAuthContextType = {
    user: initialUser,
    loading,
    signOut: vi.fn().mockResolvedValue(undefined),
    hasPermission: vi.fn().mockImplementation((resource: string, action: string) => {
      if (!initialUser) return false;
      if (initialUser.role.level === 1) return true; // Admin has all permissions
      return initialUser.permissions?.some(permission => {
        const resourceMatch = permission.resource === '*' || permission.resource === resource;
        const actionMatch = permission.actions.includes('*') || permission.actions.includes(action);
        return resourceMatch && actionMatch;
      }) || false;
    }),
    isAdmin: vi.fn().mockImplementation(() => initialUser?.role.level === 1),
    isManager: vi.fn().mockImplementation(() => (initialUser?.role.level || 999) <= 2),
    canManageUsers: vi.fn().mockImplementation(() => {
      if (!initialUser) return false;
      return initialUser.role.level === 1 || initialUser.permissions?.some(p => 
        p.resource === 'users' && p.actions.includes('update')
      ) || false;
    })
  };

  return (
    <MockAuthContext.Provider value={mockAuthContext}>
      <div data-testid="mock-auth-provider" data-user={JSON.stringify(initialUser)}>
        {children}
      </div>
    </MockAuthContext.Provider>
  );
};

// Mock Theme Provider
const MockThemeProvider: React.FC<{ 
  children: React.ReactNode;
  initialTheme?: 'light' | 'dark';
}> = ({ children, initialTheme = 'light' }) => {
  const mockThemeContext: MockThemeContextType = {
    isDarkMode: initialTheme === 'dark',
    toggleDarkMode: vi.fn()
  };

  return (
    <MockThemeContext.Provider value={mockThemeContext}>
      <div data-testid="mock-theme-provider" data-theme={initialTheme}>
        {children}
      </div>
    </MockThemeContext.Provider>
  );
};

// Mock Toast Provider
const MockToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockToastContext: MockToastContextType = {
    toasts: [],
    addToast: vi.fn().mockImplementation(() => 'mock-toast-id'),
    removeToast: vi.fn(),
    showSuccess: vi.fn().mockImplementation(() => 'mock-success-toast-id'),
    showWarning: vi.fn().mockImplementation(() => 'mock-warning-toast-id'),
    showError: vi.fn().mockImplementation(() => 'mock-error-toast-id'),
    showInfo: vi.fn().mockImplementation(() => 'mock-info-toast-id')
  };

  return (
    <MockToastContext.Provider value={mockToastContext}>
      <div data-testid="mock-toast-provider">
        {children}
      </div>
    </MockToastContext.Provider>
  );
};

// Custom render options interface
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialUser?: User | null;
  theme?: 'light' | 'dark';
  loading?: boolean;
}

// All providers wrapper
const AllTheProviders: React.FC<{ 
  children: React.ReactNode; 
  options?: CustomRenderOptions 
}> = ({ children, options = {} }) => {
  return (
    <MockThemeProvider initialTheme={options.theme}>
      <MockAuthProvider 
        initialUser={options.initialUser} 
        loading={options.loading}
      >
        <MockToastProvider>
          {children}
        </MockToastProvider>
      </MockAuthProvider>
    </MockThemeProvider>
  );
};

// Custom render function
const customRender = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  return render(ui, {
    wrapper: (props) => <AllTheProviders {...props} options={options} />,
    ...options
  });
};

// Re-export everything from testing library
export * from '@testing-library/react';
export { customRender as render };

// Export mock contexts for advanced testing
export { MockAuthContext, MockThemeContext, MockToastContext };

// Test data factory functions
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  avatar: undefined,
  role: DEFAULT_ROLES[0], // Admin role by default
  department: 'Engineering',
  status: 'active',
  lastActive: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  permissions: DEFAULT_ROLES[0].permissions,
  ...overrides
});

export const createMockAdminUser = (overrides: Partial<User> = {}): User => 
  createMockUser({
    role: DEFAULT_ROLES[0], // Admin
    permissions: DEFAULT_ROLES[0].permissions,
    ...overrides
  });

export const createMockRegularUser = (overrides: Partial<User> = {}): User => 
  createMockUser({
    role: DEFAULT_ROLES[2] || DEFAULT_ROLES[0], // User role or fallback to admin
    permissions: DEFAULT_ROLES[2]?.permissions || [],
    ...overrides
  });

// Utility functions for common testing patterns
export const waitForLoadingToFinish = async () => {
  const { waitForElementToBeRemoved } = await import('@testing-library/react');
  try {
    await waitForElementToBeRemoved(
      () => document.querySelector('[data-testid="loading"]'),
      { timeout: 5000 }
    );
  } catch {
    // Loading element might not exist, which is fine
  }
};

export const waitForAnalysisToComplete = async () => {
  const { waitFor } = await import('@testing-library/react');
  await waitFor(
    () => {
      const results = document.querySelector('[data-testid="analysis-results"]');
      const loading = document.querySelector('[data-testid="analysis-loading"]');
      return results && !loading;
    },
    { timeout: 10000 }
  );
};

export const expectElementToHaveAriaLabel = (element: HTMLElement, expectedLabel: string) => {
  // Use testing library's built-in assertion
  expect(element).toHaveAttribute('aria-label', expectedLabel);
};

export const expectElementToBeAccessible = async (element: HTMLElement) => {
  // Check for basic accessibility attributes
  const hasAriaLabel = element.hasAttribute('aria-label');
  const hasAriaLabelledBy = element.hasAttribute('aria-labelledby');
  const hasAriaDescribedBy = element.hasAttribute('aria-describedby');
  const hasRole = element.hasAttribute('role');
  
  // Element should have at least one accessibility attribute
  expect(hasAriaLabel || hasAriaLabelledBy || hasAriaDescribedBy || hasRole).toBe(true);
};

// Mock API response helpers
export const createMockAnalysisResult = (overrides = {}) => ({
  id: 'test-analysis-id',
  user_id: 'test-user-id',
  content: 'Test content for analysis',
  timestamp: new Date().toISOString(),
  accuracy: 85.5,
  riskLevel: 'medium' as const,
  hallucinations: [
    {
      text: 'suspicious claim',
      type: 'Unverified Statistic',
      confidence: 0.75,
      explanation: 'This statistic could not be verified'
    }
  ],
  verificationSources: 5,
  processingTime: 1250,
  analysisType: 'single' as const,
  ...overrides
});

// Component testing utilities
export const renderWithUser = (ui: React.ReactElement, user?: User | null) => {
  return customRender(ui, { initialUser: user || createMockUser() });
};

export const renderWithAdminUser = (ui: React.ReactElement) => {
  return customRender(ui, { initialUser: createMockAdminUser() });
};

export const renderWithRegularUser = (ui: React.ReactElement) => {
  return customRender(ui, { initialUser: createMockRegularUser() });
};

export const renderWithoutUser = (ui: React.ReactElement) => {
  return customRender(ui, { initialUser: null });
};

export const renderWithDarkTheme = (ui: React.ReactElement, user?: User | null) => {
  return customRender(ui, { 
    initialUser: user || createMockUser(),
    theme: 'dark'
  });
};

export const renderWithLoading = (ui: React.ReactElement) => {
  return customRender(ui, { loading: true });
};