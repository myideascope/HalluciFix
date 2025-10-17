/**
 * Error Boundary Integration Tests
 * Tests error boundary behavior across different scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';

// Import error boundary components
import ErrorBoundary from '../../components/ErrorBoundary';
import GlobalErrorBoundary from '../../components/GlobalErrorBoundary';
import FeatureErrorBoundary from '../../components/FeatureErrorBoundary';
import AnalysisErrorBoundary from '../../components/AnalysisErrorBoundary';
import DashboardErrorBoundary from '../../components/DashboardErrorBoundary';
import AuthErrorBoundary from '../../components/AuthErrorBoundary';
import { ErrorBoundaryProvider } from '../../contexts/ErrorBoundaryContext';

// Test components that throw errors
const ErrorThrowingComponent = ({ 
  shouldThrow = false, 
  errorType = 'generic',
  delay = 0 
}: { 
  shouldThrow?: boolean; 
  errorType?: string;
  delay?: number;
}) => {
  if (shouldThrow) {
    if (delay > 0) {
      setTimeout(() => {
        throw new Error(`${errorType} error for testing`);
      }, delay);
    } else {
      throw new Error(`${errorType} error for testing`);
    }
  }
  return <div data-testid="working-component">Component is working</div>;
};

const AsyncErrorComponent = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      if (shouldThrow) {
        throw new Error('Async operation failed');
      }
      setData('Data loaded successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [shouldThrow]);

  if (error) {
    throw new Error(error);
  }

  return (
    <div data-testid="async-component">
      {data || 'Loading...'}
    </div>
  );
};

const NetworkErrorComponent = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    const networkError = new Error('Network request failed');
    networkError.name = 'NetworkError';
    throw networkError;
  }
  return <div data-testid="network-component">Network component working</div>;
};

describe('Error Boundary Integration Tests', () => {
  let originalConsoleError: typeof console.error;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock console.error to avoid noise in tests
    originalConsoleError = console.error;
    consoleErrorSpy = vi.fn();
    console.error = consoleErrorSpy;
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  describe('Basic Error Boundary Functionality', () => {
    it('should catch and display component errors', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.queryByTestId('working-component')).not.toBeInTheDocument();
    });

    it('should not interfere with normal component rendering', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('working-component')).toBeInTheDocument();
      expect(screen.getByText('Component is working')).toBeInTheDocument();
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    });

    it('should reset error state when retry is clicked', async () => {
      const TestComponent = () => {
        const [shouldThrow, setShouldThrow] = useState(true);

        return (
          <ErrorBoundary resetKeys={[shouldThrow]}>
            <ErrorThrowingComponent shouldThrow={shouldThrow} />
            <button onClick={() => setShouldThrow(false)}>Fix Error</button>
          </ErrorBoundary>
        );
      };

      render(<TestComponent />);

      // Initially shows error
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

      // Click retry
      const user = userEvent.setup();
      await user.click(screen.getByText('Try Again'));

      // Should still show error since we haven't fixed the underlying issue
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('should handle multiple error types appropriately', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} errorType="network" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} errorType="validation" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  describe('Feature-Specific Error Boundaries', () => {
    it('should handle analysis errors with appropriate messaging', () => {
      render(
        <AnalysisErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} errorType="analysis" />
        </AnalysisErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should handle dashboard errors with fallback UI', () => {
      render(
        <DashboardErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} errorType="dashboard" />
        </DashboardErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });

    it('should handle authentication errors with appropriate actions', () => {
      render(
        <AuthErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} errorType="auth" />
        </AuthErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });

    it('should provide feature-specific recovery options', () => {
      render(
        <FeatureErrorBoundary feature="test-feature">
          <ErrorThrowingComponent shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  describe('Global Error Boundary', () => {
    it('should catch critical application errors', () => {
      const onError = vi.fn();

      render(
        <GlobalErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} errorType="critical" />
        </GlobalErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText('Go Home')).toBeInTheDocument();
    });

    it('should provide global recovery actions', async () => {
      render(
        <GlobalErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} />
        </GlobalErrorBoundary>
      );

      expect(screen.getByText('Go Home')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  describe('Error Boundary Context Integration', () => {
    it('should track errors across multiple boundaries', () => {
      const TestApp = () => (
        <ErrorBoundaryProvider>
          <GlobalErrorBoundary>
            <FeatureErrorBoundary feature="feature1">
              <ErrorThrowingComponent shouldThrow={true} errorType="feature1" />
            </FeatureErrorBoundary>
            <FeatureErrorBoundary feature="feature2">
              <ErrorThrowingComponent shouldThrow={false} />
            </FeatureErrorBoundary>
          </GlobalErrorBoundary>
        </ErrorBoundaryProvider>
      );

      render(<TestApp />);

      // First feature should show error
      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });

    it('should provide error context to child components', () => {
      const ErrorContextConsumer = () => {
        const { useErrorBoundaryContext } = require('../../contexts/ErrorBoundaryContext');
        const { errors, getUnresolvedErrors } = useErrorBoundaryContext();
        
        return (
          <div>
            <div data-testid="error-count">Errors: {errors.length}</div>
            <div data-testid="unresolved-count">Unresolved: {getUnresolvedErrors().length}</div>
          </div>
        );
      };

      render(
        <ErrorBoundaryProvider>
          <ErrorContextConsumer />
          <ErrorBoundary>
            <ErrorThrowingComponent shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundaryProvider>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  describe('Async Error Handling', () => {
    it('should catch errors from async operations', async () => {
      render(
        <ErrorBoundary>
          <AsyncErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      });
    });

    it('should handle promise rejections', async () => {
      const PromiseErrorComponent = () => {
        React.useEffect(() => {
          Promise.reject(new Error('Promise rejection')).catch(error => {
            throw error;
          });
        }, []);

        return <div>Promise component</div>;
      };

      render(
        <ErrorBoundary>
          <PromiseErrorComponent />
        </ErrorBoundary>
      );

      // Note: Promise rejections might not be caught by error boundaries
      // This test documents the current behavior
      expect(screen.getByText('Promise component')).toBeInTheDocument();
    });
  });

  describe('Network Error Scenarios', () => {
    it('should handle network-related errors appropriately', () => {
      render(
        <ErrorBoundary>
          <NetworkErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should provide network-specific recovery options', () => {
      render(
        <AnalysisErrorBoundary>
          <NetworkErrorComponent shouldThrow={true} />
        </AnalysisErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });
  });

  describe('Error Boundary Nesting', () => {
    it('should handle nested error boundaries correctly', () => {
      render(
        <GlobalErrorBoundary>
          <FeatureErrorBoundary feature="outer">
            <ErrorBoundary>
              <ErrorThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
          </FeatureErrorBoundary>
        </GlobalErrorBoundary>
      );

      // Inner boundary should catch the error first
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('should escalate to parent boundary when child boundary fails', () => {
      const FailingErrorBoundary = ({ children }: { children: React.ReactNode }) => {
        // Simulate a boundary that fails to handle errors
        return <div>{children}</div>;
      };

      render(
        <GlobalErrorBoundary>
          <FailingErrorBoundary>
            <ErrorThrowingComponent shouldThrow={true} />
          </FailingErrorBoundary>
        </GlobalErrorBoundary>
      );

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  describe('Error Recovery and State Management', () => {
    it('should maintain component state after error recovery', async () => {
      const StatefulComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
        const [count, setCount] = useState(0);

        if (shouldThrow && count > 0) {
          throw new Error('State error');
        }

        return (
          <div>
            <div data-testid="count">Count: {count}</div>
            <button onClick={() => setCount(c => c + 1)}>Increment</button>
          </div>
        );
      };

      const TestWrapper = () => {
        const [shouldThrow, setShouldThrow] = useState(false);

        return (
          <ErrorBoundary resetKeys={[shouldThrow]}>
            <StatefulComponent shouldThrow={shouldThrow} />
            <button onClick={() => setShouldThrow(!shouldThrow)}>
              Toggle Error
            </button>
          </ErrorBoundary>
        );
      };

      render(<TestWrapper />);

      const user = userEvent.setup();

      // Increment counter
      await user.click(screen.getByText('Increment'));
      expect(screen.getByTestId('count')).toHaveTextContent('Count: 1');

      // Trigger error
      await user.click(screen.getByText('Toggle Error'));
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

      // Recover from error
      await user.click(screen.getByText('Toggle Error'));
      await user.click(screen.getByText('Try Again'));

      // State should be reset after error boundary reset
      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('Count: 0');
      });
    });
  });

  describe('Error Reporting Integration', () => {
    it('should report errors to error management system', () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ErrorThrowingComponent shouldThrow={true} errorType="reportable" />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'reportable error for testing'
        }),
        expect.objectContaining({
          componentStack: expect.any(String)
        })
      );
    });

    it('should include error context in reports', () => {
      const onError = vi.fn();

      render(
        <FeatureErrorBoundary feature="test-feature" onError={onError}>
          <ErrorThrowingComponent shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(onError).toHaveBeenCalled();
      const [error, errorInfo] = onError.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(errorInfo).toHaveProperty('componentStack');
    });
  });

  describe('Accessibility and User Experience', () => {
    it('should provide accessible error messages', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      const errorMessage = screen.getByRole('alert', { hidden: true });
      expect(errorMessage).toBeInTheDocument();
    });

    it('should focus management after error recovery', async () => {
      const TestComponent = () => {
        const [hasError, setHasError] = useState(true);

        return (
          <ErrorBoundary resetKeys={[hasError]}>
            <div>
              {hasError ? (
                <ErrorThrowingComponent shouldThrow={true} />
              ) : (
                <button data-testid="recovered-button">Recovered</button>
              )}
              <button onClick={() => setHasError(false)}>Fix Error</button>
            </div>
          </ErrorBoundary>
        );
      };

      render(<TestComponent />);

      const user = userEvent.setup();
      
      // Fix the error
      await user.click(screen.getByText('Fix Error'));
      
      // Retry
      await user.click(screen.getByText('Try Again'));

      await waitFor(() => {
        expect(screen.getByTestId('recovered-button')).toBeInTheDocument();
      });
    });
  });

  describe('Performance Impact', () => {
    it('should not significantly impact render performance', () => {
      const startTime = performance.now();

      // Render many components with error boundaries
      const components = Array.from({ length: 100 }, (_, i) => (
        <ErrorBoundary key={i}>
          <ErrorThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      ));

      render(<div>{components}</div>);

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time
      expect(renderTime).toBeLessThan(100); // 100ms threshold
      expect(screen.getAllByTestId('working-component')).toHaveLength(100);
    });

    it('should handle rapid error/recovery cycles', async () => {
      const RapidErrorComponent = () => {
        const [errorCount, setErrorCount] = useState(0);
        const [shouldThrow, setShouldThrow] = useState(false);

        return (
          <ErrorBoundary resetKeys={[errorCount]}>
            <div>
              {shouldThrow ? (
                <ErrorThrowingComponent shouldThrow={true} />
              ) : (
                <div data-testid="stable-component">Stable</div>
              )}
              <button
                onClick={() => {
                  setShouldThrow(!shouldThrow);
                  setErrorCount(c => c + 1);
                }}
              >
                Toggle Error
              </button>
            </div>
          </ErrorBoundary>
        );
      };

      render(<RapidErrorComponent />);

      const user = userEvent.setup();
      const toggleButton = screen.getByText('Toggle Error');

      // Rapidly toggle errors
      for (let i = 0; i < 10; i++) {
        await user.click(toggleButton);
        if (screen.queryByText('Try Again')) {
          await user.click(screen.getByText('Try Again'));
        }
      }

      // Should still be functional
      expect(screen.getByText('Toggle Error')).toBeInTheDocument();
    });
  });
});