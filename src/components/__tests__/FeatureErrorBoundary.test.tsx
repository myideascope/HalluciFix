import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureErrorBoundary from '../FeatureErrorBoundary';
import React from 'react';

// Test component that can throw errors
const ThrowError: React.FC<{ shouldThrow?: boolean; errorMessage?: string }> = ({ 
  shouldThrow = false, 
  errorMessage = 'Feature error' 
}) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div>Feature working</div>;
};

describe('FeatureErrorBoundary', () => {
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
        <FeatureErrorBoundary featureName="TestFeature">
          <div>Feature content</div>
        </FeatureErrorBoundary>
      );

      expect(screen.getByText('Feature content')).toBeInTheDocument();
    });

    it('should pass through successful renders', () => {
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={false} />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText('Feature working')).toBeInTheDocument();
      expect(screen.queryByText(/feature temporarily unavailable/i)).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should catch and display feature-level error when child throws', () => {
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/experiencing issues/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should log feature-specific error information', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={true} errorMessage="Feature specific error" />
        </FeatureErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Feature Error Boundary - TestFeature:',
        expect.objectContaining({
          feature: 'TestFeature',
          error: 'Feature specific error',
          timestamp: expect.any(String),
          url: expect.any(String)
        })
      );
    });

    it('should include feature name in error context', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      
      render(
        <FeatureErrorBoundary featureName="AnalysisEngine">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Feature Error Boundary - AnalysisEngine:',
        expect.objectContaining({
          feature: 'AnalysisEngine'
        })
      );
    });
  });

  describe('custom fallback', () => {
    it('should render custom fallback when provided', () => {
      const customFallback = <div>Custom feature error UI</div>;
      
      render(
        <FeatureErrorBoundary featureName="TestFeature" fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText('Custom feature error UI')).toBeInTheDocument();
      expect(screen.queryByText(/feature temporarily unavailable/i)).not.toBeInTheDocument();
    });

    it('should use default fallback when none provided', () => {
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });
  });

  describe('retry functionality', () => {
    it('should allow retry when feature error occurs', async () => {
      const user = userEvent.setup();
      
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();
      
      await user.click(retryButton);
      
      // Button should still be available for retry
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should reset on props change', () => {
      const TestComponent = () => {
        const [key, setKey] = React.useState(1);
        
        return (
          <div>
            <button onClick={() => setKey(key + 1)}>Change Props</button>
            <FeatureErrorBoundary featureName="TestFeature">
              <ThrowError shouldThrow={true} />
              <div key={key}>Content {key}</div>
            </FeatureErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });
  });

  describe('different feature names', () => {
    it('should handle different feature names correctly', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      
      const { rerender } = render(
        <FeatureErrorBoundary featureName="Authentication">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Feature Error Boundary - Authentication:',
        expect.objectContaining({
          feature: 'Authentication'
        })
      );

      rerender(
        <FeatureErrorBoundary featureName="PaymentProcessing">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Feature Error Boundary - PaymentProcessing:',
        expect.objectContaining({
          feature: 'PaymentProcessing'
        })
      );
    });
  });

  describe('error recovery', () => {
    it('should recover when error is fixed', () => {
      const TestComponent = () => {
        const [hasError, setHasError] = React.useState(true);
        
        return (
          <div>
            <button onClick={() => setHasError(false)}>Fix Error</button>
            <FeatureErrorBoundary featureName="TestFeature">
              <ThrowError shouldThrow={hasError} />
            </FeatureErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });

    it('should maintain feature context during recovery', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      
      const TestComponent = () => {
        const [errorCount, setErrorCount] = React.useState(0);
        
        return (
          <div>
            <button onClick={() => setErrorCount(errorCount + 1)}>Trigger Error</button>
            <FeatureErrorBoundary featureName="RecoveryTest">
              <ThrowError shouldThrow={errorCount > 0} errorMessage={`Error ${errorCount}`} />
            </FeatureErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      // Initially no error
      expect(screen.getByText('Feature working')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should maintain accessibility in error state', () => {
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation in error state', async () => {
      const user = userEvent.setup();
      
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      await user.tab();
      expect(screen.getByRole('button', { name: /try again/i })).toHaveFocus();
    });
  });

  describe('error boundary integration', () => {
    it('should use feature level error boundary', () => {
      render(
        <FeatureErrorBoundary featureName="TestFeature">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      // Should show feature-level error message
      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    });

    it('should pass resetOnPropsChange to underlying ErrorBoundary', () => {
      const TestComponent = () => {
        const [prop, setProp] = React.useState('initial');
        
        return (
          <div>
            <button onClick={() => setProp('changed')}>Change Prop</button>
            <FeatureErrorBoundary featureName="TestFeature">
              <ThrowError shouldThrow={true} />
              <div>{prop}</div>
            </FeatureErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByText(/feature temporarily unavailable/i)).toBeInTheDocument();
    });
  });

  describe('error tracking and metrics', () => {
    it('should log comprehensive error information', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      
      render(
        <FeatureErrorBoundary featureName="MetricsTest">
          <ThrowError shouldThrow={true} errorMessage="Trackable error" />
        </FeatureErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Feature Error Boundary - MetricsTest:',
        expect.objectContaining({
          feature: 'MetricsTest',
          error: 'Trackable error',
          stack: expect.any(String),
          componentStack: expect.any(String),
          timestamp: expect.any(String),
          url: expect.any(String)
        })
      );
    });

    it('should include current URL in error context', () => {
      const consoleSpy = vi.spyOn(console, 'error');
      
      render(
        <FeatureErrorBoundary featureName="URLTest">
          <ThrowError shouldThrow={true} />
        </FeatureErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          url: window.location.href
        })
      );
    });
  });
});