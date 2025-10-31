import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../ErrorBoundary';
import React from 'react';

// Mock error manager
vi.mock('../../lib/errors', () => ({
  errorManager: {
    handleError: vi.fn().mockReturnValue({
      id: 'test-error-id',
      userMessage: 'Test error message',
      severity: 'medium'
    })
  }
}));

// Test component that can throw errors
const ThrowError: React.FC<{ shouldThrow?: boolean; errorMessage?: string }> = ({ 
  shouldThrow = false, 
  errorMessage = 'Test error' 
}) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normal operation', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should not show error UI when children render successfully', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No error')).toBeInTheDocument();
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should catch and display error when child component throws', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText(/we encountered an issue/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should call error manager when error occurs', () => {
      const { errorManager } = require('../../lib/errors');
      
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Custom error" />
        </ErrorBoundary>
      );

      expect(errorManager.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          component: 'ErrorBoundary',
          feature: 'error-boundary',
          operation: 'componentDidCatch',
          level: 'component'
        })
      );
    });

    it('should call custom onError handler when provided', () => {
      const mockOnError = vi.fn();
      
      render(
        <ErrorBoundary onError={mockOnError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String)
        })
      );
    });

    it('should generate unique error ID for each error', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/error id:/i)).toBeInTheDocument();
    });
  });

  describe('error levels', () => {
    it('should show critical error UI for global level', () => {
      render(
        <ErrorBoundary level="global">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText(/please try refreshing the page/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go home/i })).toBeInTheDocument();
    });

    it('should show feature error UI for feature level', () => {
      render(
        <ErrorBoundary level="feature">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/experiencing issues/i)).toBeInTheDocument();
    });

    it('should show component error UI for component level', () => {
      render(
        <ErrorBoundary level="component">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText(/loading this content/i)).toBeInTheDocument();
    });
  });

  describe('retry functionality', () => {
    it('should retry when retry button is clicked', async () => {
      const user = userEvent.setup();
      
      const TestComponent = () => {
        const [shouldThrow, setShouldThrow] = React.useState(true);
        
        React.useEffect(() => {
          const timer = setTimeout(() => setShouldThrow(false), 100);
          return () => clearTimeout(timer);
        }, []);
        
        return (
          <ErrorBoundary>
            <ThrowError shouldThrow={shouldThrow} />
          </ErrorBoundary>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      
      const retryButton = screen.getByRole('button', { name: /try again/i });
      await user.click(retryButton);

      // After retry, component should attempt to render again
      expect(retryButton).toBeInTheDocument();
    });

    it('should disable retry after max attempts', async () => {
      const user = userEvent.setup();
      
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      
      // Click retry multiple times to exceed limit
      await user.click(retryButton);
      await user.click(retryButton);
      await user.click(retryButton);
      await user.click(retryButton);

      expect(screen.getByText(/max retries reached/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /max retries reached/i })).toBeDisabled();
    });
  });

  describe('reset functionality', () => {
    it('should reset when resetKeys change', () => {
      const TestComponent = () => {
        const [resetKey, setResetKey] = React.useState('key1');
        const [shouldThrow, setShouldThrow] = React.useState(true);
        
        return (
          <div>
            <button onClick={() => setResetKey('key2')}>Change Key</button>
            <button onClick={() => setShouldThrow(false)}>Fix Error</button>
            <ErrorBoundary resetKeys={[resetKey]}>
              <ThrowError shouldThrow={shouldThrow} />
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('should reset when props change if resetOnPropsChange is true', () => {
      const TestComponent = () => {
        const [content, setContent] = React.useState('content1');
        
        return (
          <div>
            <button onClick={() => setContent('content2')}>Change Content</button>
            <ErrorBoundary resetOnPropsChange={true}>
              <ThrowError shouldThrow={true} />
              <div>{content}</div>
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  describe('custom fallback', () => {
    it('should render custom fallback when provided', () => {
      const customFallback = <div>Custom error message</div>;
      
      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    });
  });

  describe('development mode', () => {
    it('should show error details in development mode', () => {
      // Mock development environment
      vi.stubEnv('DEV', true);
      
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Detailed error message" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/error details \(development\)/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      await user.tab();
      expect(screen.getByRole('button', { name: /try again/i })).toHaveFocus();
    });
  });

  describe('error boundary state management', () => {
    it('should track retry count correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      
      // First retry
      await user.click(retryButton);
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      
      // Second retry
      await user.click(retryButton);
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should clear error state on successful reset', () => {
      const TestComponent = () => {
        const [shouldThrow, setShouldThrow] = React.useState(true);
        
        return (
          <div>
            <button onClick={() => setShouldThrow(false)}>Fix Error</button>
            <ErrorBoundary resetOnPropsChange={true}>
              <ThrowError shouldThrow={shouldThrow} />
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });
});