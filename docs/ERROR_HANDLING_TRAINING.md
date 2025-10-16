# Error Handling Training and Examples

## Overview

This comprehensive training guide provides practical examples, code patterns, and hands-on exercises for implementing robust error handling in the HalluciFix application. It covers React error boundaries, API error handling, form validation, and accessibility best practices.

## Table of Contents

1. [React Error Boundaries](#react-error-boundaries)
2. [API Error Handling](#api-error-handling)
3. [Form Validation and Accessibility](#form-validation-and-accessibility)
4. [Error Recovery Patterns](#error-recovery-patterns)
5. [Testing Error Scenarios](#testing-error-scenarios)
6. [Hands-on Exercises](#hands-on-exercises)
7. [Accessibility Guidelines](#accessibility-guidelines)

## React Error Boundaries

### Basic Error Boundary Implementation

#### Example 1: Simple Error Boundary

```typescript
import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class SimpleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[200px] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-600 mb-4">
              We encountered an unexpected error. Please try again.
            </p>
            <button
              onClick={this.handleRetry}
              className="flex items-center space-x-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage Example
const App = () => (
  <SimpleErrorBoundary>
    <Dashboard />
  </SimpleErrorBoundary>
);
```
#### 
Example 2: Advanced Error Boundary with Context

```typescript
import React, { Component, ReactNode, ErrorInfo, createContext, useContext } from 'react';

interface ErrorBoundaryContextType {
  reportError: (error: Error, context?: any) => void;
  clearError: () => void;
}

const ErrorBoundaryContext = createContext<ErrorBoundaryContextType | null>(null);

export const useErrorBoundary = () => {
  const context = useContext(ErrorBoundaryContext);
  if (!context) {
    throw new Error('useErrorBoundary must be used within an ErrorBoundary');
  }
  return context;
};

interface Props {
  children: ReactNode;
  level?: 'global' | 'feature' | 'component';
  resetKeys?: Array<string | number>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

class AdvancedErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Report to error tracking service
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error with context
    console.group(`🚨 Error Boundary (${this.props.level || 'component'})`);
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetKeys?.some((key, idx) => prevProps.resetKeys?.[idx] !== key)) {
        this.resetErrorBoundary();
      }
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    });
  };

  reportError = (error: Error, context?: any) => {
    // Allow manual error reporting from child components
    this.componentDidCatch(error, { componentStack: '' } as ErrorInfo);
  };

  render() {
    const contextValue: ErrorBoundaryContextType = {
      reportError: this.reportError,
      clearError: this.resetErrorBoundary
    };

    if (this.state.hasError) {
      return (
        <ErrorBoundaryContext.Provider value={contextValue}>
          <ErrorFallbackUI
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            errorId={this.state.errorId}
            level={this.props.level}
            onRetry={this.resetErrorBoundary}
          />
        </ErrorBoundaryContext.Provider>
      );
    }

    return (
      <ErrorBoundaryContext.Provider value={contextValue}>
        {this.props.children}
      </ErrorBoundaryContext.Provider>
    );
  }
}
```

### Error Boundary Hooks Pattern

```typescript
// Custom hook for triggering error boundaries
export const useErrorHandler = () => {
  const { reportError } = useErrorBoundary();

  return useCallback((error: Error, context?: any) => {
    reportError(error, context);
  }, [reportError]);
};

// Usage in components
const AnalysisComponent = () => {
  const handleError = useErrorHandler();

  const processAnalysis = async () => {
    try {
      const result = await api.analyzeContent(content);
      setResult(result);
    } catch (error) {
      handleError(error, { 
        operation: 'analysis',
        contentType: content.type 
      });
    }
  };

  return (
    <div>
      <button onClick={processAnalysis}>
        Analyze Content
      </button>
    </div>
  );
};
```

## API Error Handling

### Centralized API Error Handler

```typescript
// types/errors.ts
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ApiError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  statusCode?: number;
  details?: any;
  retryable: boolean;
  retryAfter?: number;
  timestamp: string;
  errorId: string;
}
```##
# API Error Classification

```typescript
// lib/apiErrorHandler.ts
class ApiErrorHandler {
  static handleError(error: any, context?: any): ApiError {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();

    // Network connectivity check
    if (!navigator.onLine) {
      return {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'No internet connection',
        userMessage: 'Please check your internet connection and try again.',
        retryable: true,
        timestamp,
        errorId
      };
    }

    // HTTP response errors
    if (error.response) {
      return this.handleHttpError(error.response, errorId, timestamp);
    }

    // Request timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return {
        type: ErrorType.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Request timeout',
        userMessage: 'The request took too long. Please try again.',
        retryable: true,
        timestamp,
        errorId
      };
    }

    // Network errors
    if (error.code === 'NETWORK_ERROR' || !error.response) {
      return {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'Network error',
        userMessage: 'Unable to connect. Please check your connection and try again.',
        retryable: true,
        timestamp,
        errorId
      };
    }

    // Unknown errors
    return {
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      message: error.message || 'Unknown error',
      userMessage: 'An unexpected error occurred. Please try again.',
      retryable: false,
      timestamp,
      errorId
    };
  }

  private static handleHttpError(response: any, errorId: string, timestamp: string): ApiError {
    const { status, data } = response;

    switch (status) {
      case 401:
        return {
          type: ErrorType.AUTHENTICATION,
          severity: ErrorSeverity.HIGH,
          message: 'Authentication failed',
          userMessage: 'Your session has expired. Please sign in again.',
          statusCode: status,
          retryable: false,
          timestamp,
          errorId
        };

      case 403:
        return {
          type: ErrorType.AUTHORIZATION,
          severity: ErrorSeverity.MEDIUM,
          message: 'Access forbidden',
          userMessage: 'You don\'t have permission to perform this action.',
          statusCode: status,
          retryable: false,
          timestamp,
          errorId
        };

      case 422:
        return {
          type: ErrorType.VALIDATION,
          severity: ErrorSeverity.LOW,
          message: 'Validation failed',
          userMessage: data.message || 'Please check your input and try again.',
          statusCode: status,
          details: data.errors,
          retryable: false,
          timestamp,
          errorId
        };

      case 429:
        const retryAfter = parseInt(response.headers['retry-after']) || 60;
        return {
          type: ErrorType.RATE_LIMIT,
          severity: ErrorSeverity.MEDIUM,
          message: 'Rate limit exceeded',
          userMessage: `Too many requests. Please wait ${retryAfter} seconds and try again.`,
          statusCode: status,
          retryable: true,
          retryAfter: retryAfter * 1000,
          timestamp,
          errorId
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          type: ErrorType.SERVER,
          severity: ErrorSeverity.HIGH,
          message: `Server error: ${status}`,
          userMessage: 'We\'re experiencing technical difficulties. Please try again in a few moments.',
          statusCode: status,
          retryable: true,
          timestamp,
          errorId
        };

      default:
        return {
          type: ErrorType.UNKNOWN,
          severity: ErrorSeverity.MEDIUM,
          message: `HTTP ${status}: ${data.message || response.statusText}`,
          userMessage: 'An unexpected error occurred. Please try again.',
          statusCode: status,
          retryable: false,
          timestamp,
          errorId
        };
    }
  }

  private static generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default ApiErrorHandler;
```

### Retry Manager with Exponential Backoff

```typescript
// lib/retryManager.ts
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
}

class RetryManager {
  private static defaultConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    jitter: true
  };

  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError: any;

    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        const apiError = ApiErrorHandler.handleError(error);

        // Don't retry if error is not retryable or max retries reached
        if (!apiError.retryable || attempt === finalConfig.maxRetries) {
          throw apiError;
        }

        // Calculate delay with exponential backoff and jitter
        let delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffFactor, attempt),
          finalConfig.maxDelay
        );

        if (finalConfig.jitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }

        // Use retry-after header if available
        if (apiError.retryAfter) {
          delay = Math.max(delay, apiError.retryAfter);
        }

        console.log(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${finalConfig.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

// Usage Examples
const fetchUserData = async (userId: string) => {
  return RetryManager.withRetry(
    () => api.getUser(userId),
    {
      maxRetries: 3,
      baseDelay: 1000,
      backoffFactor: 2
    }
  );
};
```## Form
 Validation and Accessibility

### Accessible Form Components

```typescript
// components/forms/FormField.tsx
import React, { useId } from 'react';
import { AlertTriangle } from 'lucide-react';

interface FormError {
  message: string;
  type: 'required' | 'format' | 'length' | 'custom';
}

interface FormFieldProps {
  label: string;
  error?: FormError | null;
  required?: boolean;
  helpText?: string;
  children: React.ReactElement;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  helpText,
  children
}) => {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const hasError = !!error;

  return (
    <div className="space-y-1">
      <label
        htmlFor={fieldId}
        className={`block text-sm font-medium ${
          hasError ? 'text-red-700' : 'text-gray-700'
        }`}
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>

      {React.cloneElement(children, {
        id: fieldId,
        'aria-invalid': hasError,
        'aria-describedby': [
          error ? errorId : null,
          helpText ? helpId : null
        ].filter(Boolean).join(' ') || undefined,
        className: `${children.props.className || ''} ${
          hasError 
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
        }`.trim()
      })}

      {helpText && !hasError && (
        <p id={helpId} className="text-sm text-gray-500">
          {helpText}
        </p>
      )}

      {error && (
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className="flex items-start space-x-1 text-sm text-red-600"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
};
```

### Form Validation Hook

```typescript
// hooks/useFormValidation.ts
interface ValidationRule<T> {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: T) => string | null;
}

interface ValidationSchema {
  [key: string]: ValidationRule<any>;
}

export const useFormValidation = <T extends Record<string, any>>(
  initialValues: T,
  schema: ValidationSchema
) => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Record<keyof T, FormError | null>>({} as any);
  const [touched, setTouched] = useState<Record<keyof T, boolean>>({} as any);

  const validateField = useCallback((name: keyof T, value: any): FormError | null => {
    const rules = schema[name as string];
    if (!rules) return null;

    // Required validation
    if (rules.required && (!value || (typeof value === 'string' && !value.trim()))) {
      return {
        message: `${String(name)} is required`,
        type: 'required'
      };
    }

    // Skip other validations if field is empty and not required
    if (!value && !rules.required) return null;

    // Length validations
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        return {
          message: `${String(name)} must be at least ${rules.minLength} characters`,
          type: 'length'
        };
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        return {
          message: `${String(name)} must be no more than ${rules.maxLength} characters`,
          type: 'length'
        };
      }

      // Pattern validation
      if (rules.pattern && !rules.pattern.test(value)) {
        return {
          message: `${String(name)} format is invalid`,
          type: 'format'
        };
      }
    }

    // Custom validation
    if (rules.custom) {
      const customError = rules.custom(value);
      if (customError) {
        return {
          message: customError,
          type: 'custom'
        };
      }
    }

    return null;
  }, [schema]);

  const setValue = useCallback((name: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));

    // Validate field if it has been touched
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  }, [touched, validateField]);

  const setFieldTouched = useCallback((name: keyof T, isTouched: boolean = true) => {
    setTouched(prev => ({ ...prev, [name]: isTouched }));

    // Validate field when it becomes touched
    if (isTouched) {
      const error = validateField(name, values[name]);
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  }, [values, validateField]);

  const validateAll = useCallback((): boolean => {
    const newErrors: Record<keyof T, FormError | null> = {} as any;
    let isValid = true;

    Object.keys(schema).forEach(fieldName => {
      const error = validateField(fieldName as keyof T, values[fieldName as keyof T]);
      newErrors[fieldName as keyof T] = error;
      if (error) isValid = false;
    });

    setErrors(newErrors);
    setTouched(Object.keys(schema).reduce((acc, key) => ({ ...acc, [key]: true }), {} as any));

    return isValid;
  }, [schema, values, validateField]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({} as any);
    setTouched({} as any);
  }, [initialValues]);

  const isValid = Object.values(errors).every(error => !error);

  return {
    values,
    errors,
    touched,
    isValid,
    setValue,
    setFieldTouched,
    validateAll,
    reset
  };
};
```## Tes
ting Error Scenarios

### Error Boundary Testing

```typescript
// __tests__/ErrorBoundary.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for cleaner test output
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should catch and display error fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('should reset error state when retry is clicked', () => {
    let shouldThrow = true;

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Simulate fixing the error
    shouldThrow = false;
    
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });
});
```

### API Error Handling Testing

```typescript
// __tests__/apiErrorHandler.test.ts
import ApiErrorHandler, { ErrorType, ErrorSeverity } from '../lib/apiErrorHandler';

describe('ApiErrorHandler', () => {
  beforeEach(() => {
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true
    });
  });

  it('should handle network errors when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false });

    const error = { code: 'NETWORK_ERROR' };
    const result = ApiErrorHandler.handleError(error);

    expect(result.type).toBe(ErrorType.NETWORK);
    expect(result.severity).toBe(ErrorSeverity.MEDIUM);
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain('internet connection');
  });

  it('should handle 401 authentication errors', () => {
    const error = {
      response: {
        status: 401,
        data: { message: 'Unauthorized' }
      }
    };

    const result = ApiErrorHandler.handleError(error);

    expect(result.type).toBe(ErrorType.AUTHENTICATION);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain('sign in');
  });

  it('should handle 429 rate limit errors with retry-after', () => {
    const error = {
      response: {
        status: 429,
        data: { message: 'Too many requests' },
        headers: { 'retry-after': '120' }
      }
    };

    const result = ApiErrorHandler.handleError(error);

    expect(result.type).toBe(ErrorType.RATE_LIMIT);
    expect(result.retryable).toBe(true);
    expect(result.retryAfter).toBe(120000);
    expect(result.userMessage).toContain('120 seconds');
  });
});
```

## Hands-on Exercises

### Exercise 1: Implement a Feature Error Boundary

**Objective**: Create an error boundary for the Analysis feature that handles component crashes gracefully.

**Requirements**:
1. Wrap the HallucinationAnalyzer component with an error boundary
2. Display a user-friendly error message when the component crashes
3. Provide a retry mechanism that resets the component state
4. Log errors to the console with relevant context

**Solution**:
```typescript
// components/AnalysisErrorBoundary.tsx
import React, { Component } from 'react';
import { AlertTriangle, RefreshCw, FileText } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

class AnalysisErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `analysis_err_${Date.now()}`
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.group('🔍 Analysis Error Boundary');
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error ID:', this.state.errorId);
    console.groupEnd();

    // Report to error tracking service
    if (window.gtag) {
      window.gtag('event', 'analysis_error', {
        error_message: error.message,
        error_id: this.state.errorId
      });
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
              <FileText className="w-8 h-8 text-orange-600" />
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Analysis Temporarily Unavailable
            </h2>
            
            <p className="text-gray-600 mb-6">
              The analysis feature encountered an issue. Please try again or upload a different file.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
              
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Back to Dashboard
              </button>
            </div>
            
            {this.state.errorId && (
              <p className="mt-4 text-xs text-gray-500">
                Error ID: {this.state.errorId}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AnalysisErrorBoundary;
```## Acc
essibility Guidelines

### Screen Reader Support

#### ARIA Labels and Descriptions
```typescript
// ✅ Good: Comprehensive ARIA support
const AccessibleErrorMessage = ({ fieldId, error }) => (
  <div
    id={`${fieldId}-error`}
    role="alert"
    aria-live="polite"
    aria-atomic="true"
    className="error-message"
  >
    <span className="sr-only">Error: </span>
    {error.message}
  </div>
);

// ✅ Good: Proper field association
const AccessibleInput = ({ id, label, error, ...props }) => (
  <div>
    <label htmlFor={id}>
      {label}
      {props.required && <span aria-label="required">*</span>}
    </label>
    <input
      id={id}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
    {error && <AccessibleErrorMessage fieldId={id} error={error} />}
  </div>
);
```

#### Live Regions for Dynamic Content
```typescript
// Status announcements for screen readers
const StatusAnnouncer = ({ message, type = 'polite' }) => (
  <div
    aria-live={type}
    aria-atomic="true"
    className="sr-only"
  >
    {message}
  </div>
);

// Usage in error scenarios
const FormWithAnnouncements = () => {
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (formData) => {
    setStatusMessage('Submitting form...');
    
    try {
      await submitForm(formData);
      setStatusMessage('Form submitted successfully!');
    } catch (error) {
      setStatusMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <StatusAnnouncer message={statusMessage} />
      {/* Form content */}
    </div>
  );
};
```

### Keyboard Navigation

#### Focus Management
```typescript
// Focus management for error scenarios
const ErrorDialog = ({ isOpen, onClose, error }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store previous focus
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Focus dialog
      dialogRef.current?.focus();
    } else {
      // Restore previous focus
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-title"
      aria-describedby="error-description"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="error-dialog"
    >
      <h2 id="error-title">Error Occurred</h2>
      <p id="error-description">{error.message}</p>
      <button onClick={onClose} autoFocus>
        Close
      </button>
    </div>
  );
};
```

### Color and Contrast

#### Error State Indicators
```css
/* Ensure sufficient color contrast for error states */
.error-field {
  border-color: #dc2626; /* Red with sufficient contrast */
  box-shadow: 0 0 0 1px #dc2626;
}

.error-message {
  color: #991b1b; /* Darker red for better contrast */
  background-color: #fef2f2; /* Light red background */
}

/* Don't rely solely on color - use icons and patterns */
.error-indicator::before {
  content: "⚠️";
  margin-right: 0.5rem;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .error-field {
    border-width: 2px;
    border-style: solid;
  }
}
```

### Testing Accessibility

#### Automated Testing
```typescript
// __tests__/accessibility.test.tsx
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('Accessibility Tests', () => {
  it('should not have accessibility violations', async () => {
    const { container } = render(<ContactForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have proper ARIA labels', () => {
    render(<FormField label="Email" error={{ message: 'Required', type: 'required' }}>
      <input type="email" />
    </FormField>);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby');
  });
});
```

## Best Practices Summary

### Error Boundary Guidelines
1. **Strategic Placement**: Use error boundaries at feature and component levels, not for every small component
2. **Reset Mechanisms**: Provide clear retry and reset options for users
3. **Context Collection**: Gather relevant error context for debugging
4. **User-Friendly Messages**: Show helpful, actionable error messages

### API Error Handling
1. **Consistent Classification**: Use standardized error types and severity levels
2. **Retry Logic**: Implement exponential backoff for retryable errors
3. **User Communication**: Provide clear, specific error messages
4. **Recovery Strategies**: Build automatic recovery for common error scenarios

### Form Validation
1. **Progressive Validation**: Validate fields after user interaction, not immediately
2. **Accessibility First**: Ensure all error messages are accessible to screen readers
3. **Clear Messaging**: Provide specific, actionable validation messages
4. **Visual Indicators**: Use color, icons, and text to indicate errors

### Testing
1. **Error Scenarios**: Test various error conditions and recovery paths
2. **Accessibility**: Validate error handling accessibility with automated tools
3. **User Experience**: Test error flows from a user perspective
4. **Edge Cases**: Consider network failures, timeouts, and unexpected errors

## Conclusion

Effective error handling is crucial for providing excellent user experience in the HalluciFix application. By following these patterns and examples:

- Users receive clear, actionable feedback when errors occur
- The application remains stable and usable even during failures
- Developers can quickly identify and resolve issues
- All users, including those using assistive technologies, can navigate error scenarios successfully

Remember: Good error handling is not just about catching errors—it's about providing users with a clear path forward when things go wrong, while maintaining accessibility and usability standards.