# Spec: Add Error Boundaries and Better Error Handling

**Priority:** High (P2)  
**Estimated Effort:** 1-2 weeks  
**Dependencies:** Logging infrastructure, monitoring setup

## Overview

Implement comprehensive error handling throughout the application including React error boundaries, API error handling, user-friendly error messages, and robust error recovery mechanisms.

## Current State

- No React error boundaries implemented
- Inconsistent error handling patterns across components
- Basic try-catch blocks without proper error recovery
- Limited user feedback for error states
- No centralized error logging or monitoring

## Requirements

### 1. React Error Boundaries

**Acceptance Criteria:**
- [ ] Global error boundary for the entire application
- [ ] Feature-specific error boundaries for major components
- [ ] Graceful error recovery with fallback UI
- [ ] Error reporting and logging integration
- [ ] Development vs production error display

**Technical Details:**
- Implement class-based error boundaries
- Create error fallback components
- Add error boundary hooks for functional components
- Integrate with error monitoring service
- Provide error recovery actions

### 2. API Error Handling

**Acceptance Criteria:**
- [ ] Centralized API error handling
- [ ] Retry mechanisms for transient failures
- [ ] User-friendly error messages
- [ ] Network error detection and handling
- [ ] Rate limiting and quota error handling

**Technical Details:**
- Create API error interceptors
- Implement exponential backoff for retries
- Add network status detection
- Handle different HTTP status codes appropriately
- Provide contextual error messages

### 3. Form Validation and Error Display

**Acceptance Criteria:**
- [ ] Real-time form validation
- [ ] Clear error message display
- [ ] Field-level error highlighting
- [ ] Accessibility-compliant error announcements
- [ ] Error prevention through input constraints

**Technical Details:**
- Implement form validation library integration
- Add ARIA labels for screen readers
- Create reusable error message components
- Implement input sanitization and validation
- Add progressive enhancement for validation

### 4. Global Error Management

**Acceptance Criteria:**
- [ ] Centralized error state management
- [ ] Error categorization and prioritization
- [ ] User notification system for errors
- [ ] Error recovery suggestions
- [ ] Error analytics and reporting

**Technical Details:**
- Create error context and hooks
- Implement error classification system
- Add toast notifications for errors
- Provide actionable error recovery options
- Integrate with analytics and monitoring

## Implementation Plan

### Phase 1: Error Boundaries (Days 1-3)
1. Implement global and feature error boundaries
2. Create error fallback UI components
3. Add error logging and reporting
4. Test error boundary functionality

### Phase 2: API Error Handling (Days 4-6)
1. Create centralized API error handling
2. Implement retry mechanisms
3. Add network error detection
4. Create user-friendly error messages

### Phase 3: Form Validation (Days 7-9)
1. Implement form validation framework
2. Add real-time validation feedback
3. Create accessible error displays
4. Test validation across all forms

### Phase 4: Global Error Management (Days 10-14)
1. Create error management system
2. Implement error notifications
3. Add error recovery mechanisms
4. Integrate monitoring and analytics

## Error Boundary Implementation

### Global Error Boundary
```typescript
// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error to monitoring service
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Report to error tracking service
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            
            <h1 className="text-xl font-semibold text-slate-900 mb-2">
              Something went wrong
            </h1>
            
            <p className="text-slate-600 mb-6">
              We're sorry, but something unexpected happened. Please try refreshing the page or contact support if the problem persists.
            </p>
            
            <div className="flex space-x-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
              
              <button
                onClick={() => window.location.href = '/'}
                className="flex items-center space-x-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Go Home</span>
              </button>
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 text-xs bg-slate-100 p-3 rounded overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Feature-Specific Error Boundaries
```typescript
// src/components/AnalysisErrorBoundary.tsx
export const AnalysisErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-800 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-medium">Analysis Error</h3>
          </div>
          <p className="text-red-700 text-sm mb-3">
            There was an error processing your analysis. Please try again or contact support.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
          >
            Retry Analysis
          </button>
        </div>
      }
      onError={(error, errorInfo) => {
        // Log analysis-specific errors
        console.error('Analysis error:', error);
      }}
    >
      {children}
    </ErrorBoundary>
  );
};
```

## API Error Handling

### Centralized API Error Handler
```typescript
// src/lib/apiErrorHandler.ts
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN'
}

export interface ApiError {
  type: ErrorType;
  message: string;
  statusCode?: number;
  details?: any;
  retryable: boolean;
}

export class ApiErrorHandler {
  static handleError(error: any): ApiError {
    // Network errors
    if (!navigator.onLine) {
      return {
        type: ErrorType.NETWORK,
        message: 'No internet connection. Please check your network and try again.',
        retryable: true
      };
    }

    // HTTP errors
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          return {
            type: ErrorType.AUTHENTICATION,
            message: 'Your session has expired. Please sign in again.',
            statusCode: status,
            retryable: false
          };
          
        case 403:
          return {
            type: ErrorType.AUTHORIZATION,
            message: 'You don\'t have permission to perform this action.',
            statusCode: status,
            retryable: false
          };
          
        case 422:
          return {
            type: ErrorType.VALIDATION,
            message: data.message || 'Please check your input and try again.',
            statusCode: status,
            details: data.errors,
            retryable: false
          };
          
        case 429:
          return {
            type: ErrorType.RATE_LIMIT,
            message: 'Too many requests. Please wait a moment and try again.',
            statusCode: status,
            retryable: true
          };
          
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            type: ErrorType.SERVER,
            message: 'Server error. Please try again in a few moments.',
            statusCode: status,
            retryable: true
          };
          
        default:
          return {
            type: ErrorType.UNKNOWN,
            message: data.message || 'An unexpected error occurred.',
            statusCode: status,
            retryable: false
          };
      }
    }

    // Request timeout or network error
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        type: ErrorType.NETWORK,
        message: 'Request timed out. Please try again.',
        retryable: true
      };
    }

    return {
      type: ErrorType.UNKNOWN,
      message: error.message || 'An unexpected error occurred.',
      retryable: false
    };
  }
}
```

### Retry Mechanism
```typescript
// src/lib/apiRetry.ts
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export class ApiRetry {
  private static defaultConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  };

  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const { maxRetries, baseDelay, maxDelay, backoffFactor } = {
      ...this.defaultConfig,
      ...config
    };

    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        const apiError = ApiErrorHandler.handleError(error);
        
        // Don't retry if error is not retryable or max retries reached
        if (!apiError.retryable || attempt === maxRetries) {
          throw apiError;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt),
          maxDelay
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}
```

## Error Management Hook

### useError Hook
```typescript
// src/hooks/useError.ts
import { useState, useCallback } from 'react';
import { ApiError } from '../lib/apiErrorHandler';

interface ErrorState {
  error: ApiError | null;
  isError: boolean;
}

export const useError = () => {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false
  });

  const setError = useCallback((error: ApiError | Error | string) => {
    let apiError: ApiError;
    
    if (typeof error === 'string') {
      apiError = {
        type: 'UNKNOWN' as any,
        message: error,
        retryable: false
      };
    } else if (error instanceof Error) {
      apiError = ApiErrorHandler.handleError(error);
    } else {
      apiError = error;
    }
    
    setErrorState({ error: apiError, isError: true });
  }, []);

  const clearError = useCallback(() => {
    setErrorState({ error: null, isError: false });
  }, []);

  const retry = useCallback(async (operation: () => Promise<void>) => {
    if (errorState.error?.retryable) {
      clearError();
      try {
        await operation();
      } catch (error) {
        setError(error as Error);
      }
    }
  }, [errorState.error, clearError, setError]);

  return {
    error: errorState.error,
    isError: errorState.isError,
    setError,
    clearError,
    retry
  };
};
```

## Form Validation Framework

### Validation Schema
```typescript
// src/lib/validation.ts
import { z } from 'zod';

export const analysisSchema = z.object({
  content: z.string()
    .min(10, 'Content must be at least 10 characters long')
    .max(10000, 'Content must be less than 10,000 characters'),
  
  analysisType: z.enum(['single', 'batch'], {
    errorMap: () => ({ message: 'Please select a valid analysis type' })
  })
});

export const userSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
    
  name: z.string()
    .min(2, 'Name must be at least 2 characters long')
    .max(50, 'Name must be less than 50 characters'),
    
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 
      'Password must contain at least one uppercase letter, one lowercase letter, and one number')
});
```

### Form Error Component
```typescript
// src/components/FormError.tsx
interface FormErrorProps {
  error?: string;
  fieldId?: string;
}

export const FormError: React.FC<FormErrorProps> = ({ error, fieldId }) => {
  if (!error) return null;

  return (
    <div
      id={fieldId ? `${fieldId}-error` : undefined}
      role="alert"
      aria-live="polite"
      className="mt-1 text-sm text-red-600 flex items-center space-x-1"
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{error}</span>
    </div>
  );
};
```

## Error Notification System

### Toast Notifications for Errors
```typescript
// src/hooks/useErrorToast.ts
import { useToast } from './useToast';
import { ApiError } from '../lib/apiErrorHandler';

export const useErrorToast = () => {
  const { showError, showWarning } = useToast();

  const showApiError = (error: ApiError) => {
    switch (error.type) {
      case 'NETWORK':
        showWarning(error.message, {
          action: {
            label: 'Retry',
            onClick: () => window.location.reload()
          }
        });
        break;
        
      case 'AUTHENTICATION':
        showError(error.message, {
          action: {
            label: 'Sign In',
            onClick: () => window.location.href = '/auth'
          }
        });
        break;
        
      default:
        showError(error.message);
    }
  };

  return { showApiError };
};
```

## Testing Strategy

### Error Boundary Tests
```typescript
// src/components/__tests__/ErrorBoundary.test.tsx
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  it('should catch and display error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });
});
```

### API Error Handling Tests
```typescript
// src/lib/__tests__/apiErrorHandler.test.ts
import { ApiErrorHandler, ErrorType } from '../apiErrorHandler';

describe('ApiErrorHandler', () => {
  it('should handle network errors', () => {
    const error = { code: 'ECONNABORTED' };
    const result = ApiErrorHandler.handleError(error);
    
    expect(result.type).toBe(ErrorType.NETWORK);
    expect(result.retryable).toBe(true);
  });

  it('should handle authentication errors', () => {
    const error = { response: { status: 401, data: {} } };
    const result = ApiErrorHandler.handleError(error);
    
    expect(result.type).toBe(ErrorType.AUTHENTICATION);
    expect(result.retryable).toBe(false);
  });
});
```

## Success Metrics

- [ ] Zero unhandled JavaScript errors in production
- [ ] 100% of API calls have proper error handling
- [ ] All forms have validation and error display
- [ ] Error recovery success rate > 80%
- [ ] User satisfaction with error messages > 4.0/5

## Monitoring Integration

### Error Tracking Setup
```typescript
// src/lib/errorTracking.ts
import * as Sentry from '@sentry/react';

export const initErrorTracking = () => {
  if (process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: process.env.VITE_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      beforeSend(event) {
        // Filter out known non-critical errors
        if (event.exception) {
          const error = event.exception.values?.[0];
          if (error?.value?.includes('ResizeObserver loop limit exceeded')) {
            return null;
          }
        }
        return event;
      }
    });
  }
};

export const reportError = (error: Error, context?: any) => {
  console.error('Error reported:', error, context);
  
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, { extra: context });
  }
};
```

## Documentation Requirements

- [ ] Error handling best practices guide
- [ ] Error boundary implementation guide
- [ ] API error handling documentation
- [ ] Form validation patterns
- [ ] Error monitoring and alerting setup