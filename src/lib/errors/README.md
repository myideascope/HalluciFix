# Centralized Error Management System

This directory contains a comprehensive error management system for the HalluciFix application, providing error classification, analytics, external tracking, and automated recovery mechanisms.

## Features

- **Centralized Error Manager**: Handles error collection, processing, logging, and reporting
- **Error Analytics**: Provides trend analysis, pattern detection, and alerting
- **External Error Tracking**: Integrates with Sentry and custom error tracking services
- **Error Classification**: Standardized error types and severity levels
- **Retry Management**: Automatic retry with exponential backoff
- **Network Monitoring**: Handles connectivity issues and offline scenarios

## Quick Start

### 1. Initialize Error Tracking

```typescript
import { initializeErrorTracking } from '@/lib/errors';

// Initialize with default configuration
await initializeErrorTracking();
```

### 2. Handle Errors

```typescript
import { errorManager } from '@/lib/errors';

try {
  // Your code here
  await someAsyncOperation();
} catch (error) {
  // Report error with context
  const apiError = errorManager.handleError(error, {
    component: 'MyComponent',
    feature: 'data-processing',
    userId: user.id
  });
  
  // Handle the error based on its classification
  if (apiError.retryable) {
    // Show retry option to user
  } else {
    // Show error message to user
  }
}
```

### 3. Get Error Analytics

```typescript
import { errorManager } from '@/lib/errors';

const analytics = errorManager.getAnalytics();

// Get error trends
const trends = analytics.getErrorTrends('last_day');

// Analyze error impact
const impact = analytics.analyzeErrorImpact();

// Detect error patterns
const patterns = analytics.detectErrorPatterns();

// Get comprehensive report
const report = analytics.getAnalyticsReport();
```

### 4. Configure Alerts

```typescript
import { errorManager } from '@/lib/errors';

const analytics = errorManager.getAnalytics();

// Add custom alert
analytics.addAlert({
  name: 'High Error Rate Alert',
  enabled: true,
  conditions: [{
    type: 'error_rate',
    operator: 'greater_than',
    value: 5, // errors per minute
    timeWindow: 10 // minutes
  }],
  actions: [{
    type: 'console',
    target: 'console',
    message: 'High error rate detected!'
  }],
  cooldownPeriod: 30 // minutes
});
```

### 5. Update User Context

```typescript
import { updateUserContext } from '@/lib/errors';

// Update user context for error tracking
updateUserContext({
  id: user.id,
  email: user.email,
  username: user.username
});
```

## Configuration

### Environment Variables

```bash
# Sentry configuration
VITE_SENTRY_DSN=your_sentry_dsn_here
VITE_APP_VERSION=1.0.0

# Custom error tracking endpoint (optional)
VITE_ERROR_TRACKING_ENDPOINT=https://your-endpoint.com/errors
VITE_ERROR_TRACKING_API_KEY=your_api_key_here
```

### Custom Configuration

```typescript
import { setupErrorTracking } from '@/lib/errors';

await setupErrorTracking({
  sentry: {
    dsn: 'your_sentry_dsn',
    environment: 'production',
    sampleRate: 0.1,
    enableUserFeedback: true
  },
  enableCommonFilters: true,
  enableCommonEnrichers: true
});
```

## Error Types

- `NETWORK` - Network connectivity issues
- `TIMEOUT` - Request timeouts
- `AUTHENTICATION` - Authentication failures
- `AUTHORIZATION` - Permission denied
- `VALIDATION` - Input validation errors
- `SERVER` - Server-side errors
- `ANALYSIS_ERROR` - AI analysis failures
- `FILE_PROCESSING_ERROR` - File processing issues
- `GOOGLE_DRIVE_ERROR` - Google Drive integration errors

## Error Severity Levels

- `LOW` - Minor issues, user can continue
- `MEDIUM` - Moderate issues, some functionality affected
- `HIGH` - Significant issues, major functionality affected
- `CRITICAL` - Severe issues, application may be unusable

## Best Practices

1. **Always provide context** when reporting errors
2. **Use appropriate error types** for better classification
3. **Handle retryable errors** with user-friendly retry options
4. **Monitor error trends** to identify systemic issues
5. **Set up alerts** for critical error conditions
6. **Test error scenarios** to ensure proper handling

## Integration with React Components

```typescript
import { errorManager } from '@/lib/errors';
import { useEffect } from 'react';

function MyComponent() {
  useEffect(() => {
    // Add error listener for component-specific handling
    const handleError = (error, context) => {
      if (context.component === 'MyComponent') {
        // Handle component-specific errors
        setErrorState(error);
      }
    };

    errorManager.addErrorListener(handleError);
    
    return () => {
      errorManager.removeErrorListener(handleError);
    };
  }, []);

  // Component implementation
}
```

## Monitoring and Debugging

The error management system provides comprehensive monitoring capabilities:

- **Real-time error tracking** with external services (Sentry)
- **Error analytics dashboard** with trends and patterns
- **Automated alerting** for critical conditions
- **Performance impact analysis** 
- **User impact assessment**
- **Error pattern detection** for proactive issue resolution

For more detailed information, see the individual module documentation in the source files.