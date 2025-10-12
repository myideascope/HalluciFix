import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { 
  render, 
  createMockUser, 
  createMockAdminUser, 
  createMockRegularUser,
  renderWithUser,
  renderWithAdminUser,
  renderWithRegularUser,
  renderWithoutUser,
  renderWithDarkTheme,
  renderWithLoading,
  waitForLoadingToFinish,
  waitForAnalysisToComplete,
  expectElementToHaveAriaLabel,
  expectElementToBeAccessible,
  createMockAnalysisResult
} from '../render';
import { DEFAULT_ROLES } from '../../../types/user';

// Test component to verify provider setup
const TestComponent: React.FC<{ testId?: string }> = ({ testId = 'test-component' }) => {
  return (
    <div data-testid={testId}>
      <div data-testid="mock-auth-provider-check">Auth Provider Active</div>
      <div data-testid="mock-theme-provider-check">Theme Provider Active</div>
      <div data-testid="mock-toast-provider-check">Toast Provider Active</div>
    </div>
  );
};

const ComponentWithAriaLabel: React.FC = () => (
  <button aria-label="Test button" data-testid="aria-button">
    Click me
  </button>
);

const ComponentWithAccessibility: React.FC = () => (
  <div>
    <button aria-label="Accessible button" data-testid="accessible-element">
      Button
    </button>
    <input aria-describedby="help-text" data-testid="input-element" />
    <div id="help-text">Help text</div>
  </div>
);

const LoadingComponent: React.FC = () => (
  <div>
    <div data-testid="loading">Loading...</div>
    <div data-testid="content">Content</div>
  </div>
);

const AnalysisComponent: React.FC = () => (
  <div>
    <div data-testid="analysis-loading">Analyzing...</div>
    <div data-testid="analysis-results" style={{ display: 'none' }}>
      Results
    </div>
  </div>
);

describe('Custom Render Utilities', () => {
  describe('Basic render function', () => {
    it('should render component with all providers', () => {
      render(<TestComponent />);
      
      expect(screen.getByTestId('test-component')).toBeInTheDocument();
      expect(screen.getByTestId('mock-auth-provider')).toBeInTheDocument();
      expect(screen.getByTestId('mock-theme-provider')).toBeInTheDocument();
      expect(screen.getByTestId('mock-toast-provider')).toBeInTheDocument();
    });

    it('should render with custom options', () => {
      const mockUser = createMockUser();
      render(<TestComponent />, { 
        initialUser: mockUser,
        theme: 'dark'
      });
      
      const authProvider = screen.getByTestId('mock-auth-provider');
      expect(authProvider).toHaveAttribute('data-user', JSON.stringify(mockUser));
      
      const themeProvider = screen.getByTestId('mock-theme-provider');
      expect(themeProvider).toHaveAttribute('data-theme', 'dark');
    });
  });

  describe('User factory functions', () => {
    it('should create mock user with default values', () => {
      const user = createMockUser();
      
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('department');
      expect(user).toHaveProperty('status');
      expect(user).toHaveProperty('permissions');
      expect(typeof user.id).toBe('string');
      expect(typeof user.email).toBe('string');
      expect(typeof user.name).toBe('string');
    });

    it('should create mock user with overrides', () => {
      const overrides = {
        id: 'custom-id',
        email: 'custom@test.com',
        name: 'Custom User'
      };
      
      const user = createMockUser(overrides);
      
      expect(user.id).toBe('custom-id');
      expect(user.email).toBe('custom@test.com');
      expect(user.name).toBe('Custom User');
    });

    it('should create admin user with correct permissions', () => {
      const adminUser = createMockAdminUser();
      
      expect(adminUser.role.level).toBe(1);
      expect(adminUser.role.name).toBe('Administrator');
      expect(adminUser.permissions).toEqual(DEFAULT_ROLES[0].permissions);
    });

    it('should create regular user with limited permissions', () => {
      const regularUser = createMockRegularUser();
      
      expect(regularUser.role.level).toBeGreaterThan(1);
      expect(regularUser.permissions.length).toBeGreaterThan(0);
    });
  });

  describe('Specialized render functions', () => {
    it('should render with user context', () => {
      const mockUser = createMockUser({ name: 'Test User' });
      renderWithUser(<TestComponent />, mockUser);
      
      const authProvider = screen.getByTestId('mock-auth-provider');
      expect(authProvider).toHaveAttribute('data-user', JSON.stringify(mockUser));
    });

    it('should render with admin user', () => {
      renderWithAdminUser(<TestComponent />);
      
      const authProvider = screen.getByTestId('mock-auth-provider');
      const userData = JSON.parse(authProvider.getAttribute('data-user') || '{}');
      expect(userData.role.level).toBe(1);
    });

    it('should render with regular user', () => {
      renderWithRegularUser(<TestComponent />);
      
      const authProvider = screen.getByTestId('mock-auth-provider');
      const userData = JSON.parse(authProvider.getAttribute('data-user') || '{}');
      expect(userData.role.level).toBeGreaterThan(1);
    });

    it('should render without user', () => {
      renderWithoutUser(<TestComponent />);
      
      const authProvider = screen.getByTestId('mock-auth-provider');
      expect(authProvider).toHaveAttribute('data-user', 'null');
    });

    it('should render with dark theme', () => {
      renderWithDarkTheme(<TestComponent />);
      
      const themeProvider = screen.getByTestId('mock-theme-provider');
      expect(themeProvider).toHaveAttribute('data-theme', 'dark');
    });

    it('should render with loading state', () => {
      renderWithLoading(<TestComponent />);
      
      // The loading state should be reflected in the auth provider
      // This is a simplified test - in real implementation, loading might affect the UI differently
      expect(screen.getByTestId('test-component')).toBeInTheDocument();
    });
  });

  describe('Utility functions', () => {
    it('should wait for loading to finish', async () => {
      render(<LoadingComponent />);
      
      // Initially loading should be present
      expect(screen.getByTestId('loading')).toBeInTheDocument();
      
      // Remove loading element to simulate completion
      const loadingElement = screen.getByTestId('loading');
      loadingElement.remove();
      
      // Wait for loading to finish should not throw
      await expect(waitForLoadingToFinish()).resolves.toBeUndefined();
    });

    it('should wait for analysis to complete', async () => {
      render(<AnalysisComponent />);
      
      // Show results and hide loading to simulate completion
      const resultsElement = screen.getByTestId('analysis-results');
      const loadingElement = screen.getByTestId('analysis-loading');
      
      resultsElement.style.display = 'block';
      loadingElement.remove();
      
      // Wait for analysis should not throw
      await expect(waitForAnalysisToComplete()).resolves.toBeUndefined();
    });

    it('should check aria label', () => {
      render(<ComponentWithAriaLabel />);
      
      const button = screen.getByTestId('aria-button');
      expect(() => expectElementToHaveAriaLabel(button, 'Test button')).not.toThrow();
    });

    it('should check element accessibility', async () => {
      render(<ComponentWithAccessibility />);
      
      const accessibleButton = screen.getByTestId('accessible-element');
      await expect(expectElementToBeAccessible(accessibleButton)).resolves.toBeUndefined();
      
      const inputElement = screen.getByTestId('input-element');
      await expect(expectElementToBeAccessible(inputElement)).resolves.toBeUndefined();
    });
  });

  describe('Mock data generators', () => {
    it('should create mock analysis result', () => {
      const result = createMockAnalysisResult();
      
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('user_id');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('accuracy');
      expect(result).toHaveProperty('riskLevel');
      expect(result).toHaveProperty('hallucinations');
      expect(result).toHaveProperty('verificationSources');
      expect(result).toHaveProperty('processingTime');
      expect(result).toHaveProperty('analysisType');
      
      expect(typeof result.accuracy).toBe('number');
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
      expect(Array.isArray(result.hallucinations)).toBe(true);
    });

    it('should create mock analysis result with overrides', () => {
      const overrides = {
        accuracy: 95.5,
        riskLevel: 'low' as const,
        user_id: 'custom-user-id'
      };
      
      const result = createMockAnalysisResult(overrides);
      
      expect(result.accuracy).toBe(95.5);
      expect(result.riskLevel).toBe('low');
      expect(result.user_id).toBe('custom-user-id');
    });
  });

  describe('Provider context validation', () => {
    it('should provide mock auth context', () => {
      const mockUser = createMockUser();
      render(<TestComponent />, { initialUser: mockUser });
      
      // Verify that the auth provider is properly set up
      const authProvider = screen.getByTestId('mock-auth-provider');
      expect(authProvider).toBeInTheDocument();
      
      const userData = JSON.parse(authProvider.getAttribute('data-user') || '{}');
      expect(userData.id).toBe(mockUser.id);
      expect(userData.email).toBe(mockUser.email);
    });

    it('should provide mock theme context', () => {
      render(<TestComponent />, { theme: 'dark' });
      
      const themeProvider = screen.getByTestId('mock-theme-provider');
      expect(themeProvider).toHaveAttribute('data-theme', 'dark');
    });

    it('should provide mock toast context', () => {
      render(<TestComponent />);
      
      const toastProvider = screen.getByTestId('mock-toast-provider');
      expect(toastProvider).toBeInTheDocument();
    });
  });
});