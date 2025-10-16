# Error Handling Best Practices

## Overview

This document provides comprehensive guidelines for implementing robust error handling throughout the HalluciFix application. Following these practices ensures consistent user experience, maintainable code, and effective error recovery.

## Error Boundary Guidelines

### When to Use Error Boundaries

Error boundaries should be strategically placed to isolate failures and maintain application stability:

```typescript
// ✅ Good: Wrap major application sections
<ErrorBoundary level="feature" fallback={<FeatureErrorFallback />}>
  <AnalysisSection />
</ErrorBoundary>

// ✅ Good: Protect critical user flows
<ErrorBoundary level="component" resetKeys={[userId, analysisId]}>
  <HallucinationAnalyzer />
</ErrorBoundary>

// ❌ Avoid: Over-wrapping simple components
<ErrorBoundary>
  <Button>Click me</Button>
</ErrorBoundary>
```

### Error Boundary Hierarchy

Implement a three-tier error boundary system:

1. **Global Error Boundary**: Catches unhandled errors at the application root
2. **Feature Error Boundaries**: Isolate major application sections (Dashboard, Analytics, etc.)
3. **Component Error Boundaries**: Protect specific complex components

```typescript
// Global level - catches all unhandled errors
<GlobalErrorBoundary>
  <App>
    {/* Feature level - isolates major sections */}
    <FeatureErrorBoundary name="dashboard">
      <Dashboard>
        {/* Component level - protects complex components */}
        <ComponentErrorBoundary resetKeys={[dataId]}>
          <ComplexDataVisualization />
        </ComponentErrorBoundary>
      </Dashboard>
    </FeatureErrorBoundary>
  </App>
</GlobalErrorBoundary>
```

### Error Boundary Reset Strategies

Implement appropriate reset mechanisms based on error context:

```typescript
// Reset on prop changes
<ErrorBoundary resetKeys={[userId, analysisId]} resetOnPropsChange>
  <UserAnalysis />
</ErrorBoundary>

// Manual reset with retry button
<ErrorBoundary
  fallback={({ error, retry, reset }) => (
    <ErrorFallback 
      error={error} 
      onRetry={retry} 
      onReset={reset}
    />
  )}
>
  <DataProcessor />
</ErrorBoundary>
```

## API Error Handling Patterns

### Consistent Error Classification

Always classify API errors using the standardized error types:

```typescript
// ✅ Good: Use error classification
try {
  const result = await api.analyzeContent(content);
  return result;
} catch (error) {
  const apiError = ApiErrorHandler.handleError(error);
  
  switch (apiError.type) {
    case ErrorType.AUTHENTICATION:
      // Handle auth errors
      await handleAuthError(apiError);
      break;
    case ErrorType.NETWORK:
      // Handle network errors
      showNetworkErrorMessage(apiError.userMessage);
      break;
    default:
      // Handle other errors
      showGenericError(apiError.userMessage);
  }
}

// ❌ Avoid: Direct error handling without classification
try {
  const result = await api.analyzeContent(content);
} catch (error) {
  alert('Something went wrong'); // Too generic, not helpful
}
```

### Retry Logic Implementation

Implement retry logic for appropriate error types:

```typescript
// ✅ Good: Use RetryManager for retryable operations
const analyzeWithRetry = async (content: string) => {
  return RetryManager.withRetry(
    () => api.analyzeContent(content),
    {
      maxRetries: 3,
      baseDelay: 1000,
      backoffFactor: 2
    }
  );
};

// ✅ Good: Custom retry logic for specific cases
const uploadWithRetry = async (file: File) => {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      return await api.uploadFile(file);
    } catch (error) {
      const apiError = ApiErrorHandler.handleError(error);
      
      if (!apiError.retryable || attempts === maxAttempts - 1) {
        throw apiError;
      }
      
      attempts++;
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempts) * 1000)
      );
    }
  }
};
```

### Error Context Collection

Always collect relevant context for error debugging:

```typescript
// ✅ Good: Collect comprehensive error context
const handleAnalysisError = (error: Error, context: {
  userId: string;
  analysisId: string;
  contentType: string;
  fileSize?: number;
}) => {
  errorManager.handleError(error, {
    ...context,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    sessionId: getSessionId()
  });
};

// ❌ Avoid: Minimal error context
const handleError = (error: Error) => {
  console.error(error); // Not enough information for debugging
};
```

## User Experience Guidelines

### Error Message Principles

1. **Be Human and Empathetic**: Use conversational language that acknowledges user frustration
2. **Be Specific**: Explain what went wrong and why
3. **Be Actionable**: Always provide next steps or alternatives
4. **Be Concise**: Keep messages brief but informative

```typescript
// ✅ Good: Human, specific, actionable
const errorMessages = {
  networkError: "We're having trouble connecting to our servers. Please check your internet connection and try again.",
  authExpired: "Your session has expired for security reasons. Please sign in again to continue.",
  fileTooBig: "This file is too large to process (max 10MB). Please try a smaller file or contact support for help with larger files.",
  rateLimited: "You've made too many requests. Please wait 60 seconds before trying again."
};

// ❌ Avoid: Technical, vague, unhelpful
const badErrorMessages = {
  networkError: "HTTP 500 Internal Server Error",
  authExpired: "Token invalid",
  fileTooBig: "Request entity too large",
  rateLimited: "429 Too Many Requests"
};
```

### Error Severity Visual Design

Use consistent visual hierarchy for different error severities:

```typescript
const ErrorSeverityStyles = {
  critical: {
    backgroundColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-800',
    iconColor: 'text-red-600',
    icon: AlertTriangle
  },
  high: {
    backgroundColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-800',
    iconColor: 'text-orange-600',
    icon: AlertCircle
  },
  medium: {
    backgroundColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    textColor: 'text-yellow-800',
    iconColor: 'text-yellow-600',
    icon: AlertTriangle
  },
  low: {
    backgroundColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-600',
    icon: Info
  }
};
```

### Recovery Action Guidelines

Always provide appropriate recovery actions based on error type:

```typescript
const getRecoveryActions = (error: ApiError): ErrorAction[] => {
  const actions: ErrorAction[] = [];
  
  // Always provide retry for retryable errors
  if (error.retryable) {
    actions.push({
      label: 'Try Again',
      action: () => retryOperation(),
      type: 'primary'
    });
  }
  
  // Provide alternative actions based on error type
  switch (error.type) {
    case ErrorType.AUTHENTICATION:
      actions.push({
        label: 'Sign In',
        action: () => redirectToLogin(),
        type: 'primary'
      });
      break;
      
    case ErrorType.NETWORK:
      actions.push({
        label: 'Check Connection',
        action: () => window.open('https://www.google.com', '_blank'),
        type: 'secondary'
      });
      break;
      
    case ErrorType.VALIDATION:
      actions.push({
        label: 'Review Input',
        action: () => focusFirstErrorField(),
        type: 'secondary'
      });
      break;
  }
  
  // Always provide support contact for persistent issues
  actions.push({
    label: 'Contact Support',
    action: () => openSupportChat(),
    type: 'secondary'
  });
  
  return actions;
};
```

## Form Validation Best Practices

### Real-time Validation Strategy

Implement progressive validation that balances user experience with feedback:

```typescript
// ✅ Good: Progressive validation strategy
const useFormValidation = (schema: ValidationSchema) => {
  const [errors, setErrors] = useState<Record<string, FormError>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  
  const validateField = useCallback(
    debounce((fieldName: string, value: any) => {
      // Only validate after field has been touched
      if (!touched[fieldName]) return;
      
      const fieldError = schema.validateField(fieldName, value);
      setErrors(prev => ({
        ...prev,
        [fieldName]: fieldError
      }));
    }, 300),
    [schema, touched]
  );
  
  const handleFieldBlur = (fieldName: string) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
  };
  
  return { errors, validateField, handleFieldBlur };
};

// ❌ Avoid: Immediate validation on every keystroke
const badValidation = (value: string) => {
  // This creates poor UX by showing errors immediately
  if (value.length < 3) {
    showError('Too short');
  }
};
```

### Accessible Error Display

Ensure error messages are accessible to all users:

```typescript
// ✅ Good: Accessible error display
const AccessibleFormField = ({ 
  label, 
  error, 
  children, 
  required 
}: FormFieldProps) => {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  
  return (
    <div className="form-field">
      <label htmlFor={fieldId} className="form-label">
        {label}
        {required && <span aria-label="required">*</span>}
      </label>
      
      {React.cloneElement(children, {
        id: fieldId,
        'aria-invalid': !!error,
        'aria-describedby': error ? errorId : helpId
      })}
      
      {error && (
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className="form-error"
        >
          <AlertTriangle className="error-icon" />
          {error.message}
        </div>
      )}
    </div>
  );
};
```

## Error Logging and Monitoring

### Structured Error Logging

Use consistent structure for error logs:

```typescript
// ✅ Good: Structured error logging
const logError = (error: ApiError, context: ErrorContext) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: mapSeverityToLogLevel(error.severity),
    errorId: error.errorId,
    errorType: error.type,
    message: error.message,
    userMessage: error.userMessage,
    context: {
      userId: context.userId,
      sessionId: context.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...context
    },
    stackTrace: error.stack,
    retryable: error.retryable
  };
  
  // Send to logging service
  logger.log(logEntry);
  
  // Send to error tracking
  if (error.severity === ErrorSeverity.CRITICAL) {
    Sentry.captureException(error, { extra: logEntry });
  }
};
```

### Error Metrics Collection

Track key error metrics for monitoring:

```typescript
// ✅ Good: Comprehensive error metrics
const trackErrorMetrics = (error: ApiError, context: ErrorContext) => {
  // Track error frequency by type
  analytics.increment('error.count', {
    errorType: error.type,
    severity: error.severity,
    retryable: error.retryable.toString()
  });
  
  // Track error impact on user flows
  analytics.increment('error.user_impact', {
    userId: context.userId,
    feature: context.feature,
    errorType: error.type
  });
  
  // Track recovery success rates
  if (context.recoveryAttempt) {
    analytics.increment('error.recovery_attempt', {
      errorType: error.type,
      success: context.recoverySuccess?.toString()
    });
  }
};
```

## Testing Error Handling

### Error Boundary Testing

Test error boundaries thoroughly:

```typescript
// ✅ Good: Comprehensive error boundary testing
describe('ErrorBoundary', () => {
  it('should catch and display component errors', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };
    
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
  
  it('should reset when resetKeys change', () => {
    let resetKey = 'initial';
    const { rerender } = render(
      <ErrorBoundary resetKeys={[resetKey]}>
        <div>Content</div>
      </ErrorBoundary>
    );
    
    // Simulate error
    resetKey = 'changed';
    rerender(
      <ErrorBoundary resetKeys={[resetKey]}>
        <div>New Content</div>
      </ErrorBoundary>
    );
    
    expect(screen.getByText('New Content')).toBeInTheDocument();
  });
});
```

### API Error Testing

Mock and test different error scenarios:

```typescript
// ✅ Good: Test various error scenarios
describe('API Error Handling', () => {
  it('should handle network errors with retry', async () => {
    const mockApi = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: 'success' });
    
    const result = await RetryManager.withRetry(mockApi, {
      maxRetries: 1,
      baseDelay: 10
    });
    
    expect(mockApi).toHaveBeenCalledTimes(2);
    expect(result.data).toBe('success');
  });
  
  it('should classify authentication errors correctly', () => {
    const authError = { response: { status: 401 } };
    const result = ApiErrorHandler.handleError(authError);
    
    expect(result.type).toBe(ErrorType.AUTHENTICATION);
    expect(result.userMessage).toContain('sign in');
  });
});
```

## Common Anti-Patterns to Avoid

### 1. Silent Failures
```typescript
// ❌ Avoid: Silently catching and ignoring errors
try {
  await riskyOperation();
} catch (error) {
  // Silent failure - user has no idea what happened
}

// ✅ Good: Always handle errors appropriately
try {
  await riskyOperation();
} catch (error) {
  const apiError = ApiErrorHandler.handleError(error);
  showUserFriendlyError(apiError.userMessage);
  errorManager.reportError(error, context);
}
```

### 2. Generic Error Messages
```typescript
// ❌ Avoid: Generic, unhelpful messages
const showError = () => {
  toast.error('An error occurred');
};

// ✅ Good: Specific, actionable messages
const showError = (error: ApiError) => {
  toast.error(error.userMessage, {
    actions: getRecoveryActions(error)
  });
};
```

### 3. Blocking Error Boundaries
```typescript
// ❌ Avoid: Error boundaries that block entire features
<ErrorBoundary>
  <EntireApplication />
</ErrorBoundary>

// ✅ Good: Granular error boundaries
<ErrorBoundary level="global">
  <App>
    <ErrorBoundary level="feature">
      <Dashboard />
    </ErrorBoundary>
    <ErrorBoundary level="feature">
      <Analytics />
    </ErrorBoundary>
  </App>
</ErrorBoundary>
```

### 4. Missing Error Context
```typescript
// ❌ Avoid: Logging errors without context
console.error(error);

// ✅ Good: Rich error context
errorManager.handleError(error, {
  userId,
  feature: 'analysis',
  operation: 'file-upload',
  fileSize: file.size,
  fileType: file.type
});
```

## Performance Considerations

### Error Handling Performance

- **Debounce validation**: Avoid excessive validation calls
- **Batch error reporting**: Queue errors and send in batches
- **Lazy load error components**: Code-split error fallback components
- **Memoize error handlers**: Prevent unnecessary re-renders

```typescript
// ✅ Good: Performance-optimized error handling
const ErrorBoundaryWithPerformance = React.memo(({ children }) => {
  const handleError = useCallback((error: Error, errorInfo: ErrorInfo) => {
    // Debounced error reporting
    debouncedErrorReporting(error, errorInfo);
  }, []);
  
  return (
    <ErrorBoundary onError={handleError}>
      {children}
    </ErrorBoundary>
  );
});
```

## Conclusion

Following these best practices ensures:
- Consistent error handling across the application
- Excellent user experience during error scenarios
- Maintainable and debuggable error handling code
- Comprehensive error monitoring and analytics
- Accessible error messages for all users

Remember: Good error handling is not just about catching errors—it's about providing users with a path forward when things go wrong.