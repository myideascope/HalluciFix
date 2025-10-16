# Error Troubleshooting and Debugging Guide

## Overview

This guide provides systematic approaches for troubleshooting, debugging, and resolving errors in the HalluciFix application. It includes common error scenarios, debugging procedures, and resolution playbooks for both developers and support teams.

## Quick Reference

### Error Severity Levels
- **Critical**: Application crashes, data loss, security breaches
- **High**: Major features unavailable, authentication failures
- **Medium**: Feature degradation, performance issues, validation errors
- **Low**: Minor UI issues, non-blocking warnings

### Common Error Types
- **Network**: Connectivity issues, timeouts, DNS problems
- **Authentication**: Login failures, token expiration, permission issues
- **Validation**: Form errors, input constraints, data format issues
- **Server**: API failures, database errors, service unavailability
- **Client**: JavaScript errors, component crashes, browser issues

## Debugging Procedures

### 1. Initial Error Assessment

When an error occurs, follow this systematic approach:

#### Step 1: Identify Error Context
```bash
# Check error logs in browser console
# Look for error ID and timestamp
# Note user actions that led to the error
# Identify affected features/components
```

#### Step 2: Gather Error Information
```typescript
// Error information to collect:
{
  errorId: "err_abc123",
  timestamp: "2024-01-15T10:30:00Z",
  errorType: "AUTHENTICATION",
  severity: "HIGH",
  userMessage: "Your session has expired",
  technicalMessage: "JWT token validation failed",
  statusCode: 401,
  url: "/dashboard/analysis",
  userId: "user_xyz789",
  sessionId: "sess_def456",
  userAgent: "Chrome/120.0.0.0",
  stackTrace: "Error at AuthService.validateToken..."
}
```

#### Step 3: Check Error Monitoring Dashboard
1. Open Sentry dashboard or error monitoring tool
2. Search for error ID or similar patterns
3. Check error frequency and affected users
4. Review error trends and patterns

### 2. Network Error Debugging

#### Symptoms
- "Unable to connect" messages
- Timeouts during API calls
- Intermittent loading failures
- Offline indicators

#### Debugging Steps

```bash
# 1. Check network connectivity
ping api.hallucifix.com
nslookup api.hallucifix.com

# 2. Test API endpoints directly
curl -X GET "https://api.hallucifix.com/health" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Check browser network tab
# - Look for failed requests (red status)
# - Check response times
# - Verify request headers and payloads
```

#### Browser Console Debugging
```javascript
// Check network status
console.log('Online:', navigator.onLine);

// Test API connectivity
fetch('/api/health')
  .then(response => console.log('API Status:', response.status))
  .catch(error => console.error('API Error:', error));

// Monitor network events
window.addEventListener('online', () => console.log('Back online'));
window.addEventListener('offline', () => console.log('Gone offline'));
```

#### Resolution Steps
1. **Immediate**: Show offline message, queue operations
2. **Short-term**: Implement retry with exponential backoff
3. **Long-term**: Add network resilience patterns

### 3. Authentication Error Debugging

#### Symptoms
- Unexpected login prompts
- "Access denied" messages
- Token-related errors
- Session expiration issues

#### Debugging Steps

```javascript
// 1. Check token status
const token = localStorage.getItem('supabase.auth.token');
console.log('Token exists:', !!token);

// 2. Decode JWT token (if exists)
if (token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('Token payload:', payload);
  console.log('Token expires:', new Date(payload.exp * 1000));
  console.log('Token expired:', Date.now() > payload.exp * 1000);
}

// 3. Test authentication endpoint
supabase.auth.getUser()
  .then(({ data, error }) => {
    console.log('User data:', data);
    console.log('Auth error:', error);
  });
```

#### Common Authentication Issues

##### Issue: Token Expired
```typescript
// Symptoms: 401 errors, automatic logouts
// Debug: Check token expiration time
// Resolution: Implement automatic token refresh

const handleTokenExpiry = async () => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    console.log('Token refreshed successfully');
  } catch (error) {
    console.error('Token refresh failed:', error);
    // Redirect to login
    window.location.href = '/auth/login';
  }
};
```

##### Issue: Invalid Permissions
```typescript
// Symptoms: 403 errors, feature access denied
// Debug: Check user roles and permissions
// Resolution: Update user permissions or show appropriate message

const debugPermissions = async () => {
  const { data: user } = await supabase.auth.getUser();
  console.log('User roles:', user?.user_metadata?.roles);
  console.log('User permissions:', user?.user_metadata?.permissions);
};
```

### 4. Form Validation Error Debugging

#### Symptoms
- Fields showing incorrect error states
- Validation not triggering
- Accessibility issues with error messages

#### Debugging Steps

```javascript
// 1. Check form state
console.log('Form errors:', formErrors);
console.log('Touched fields:', touchedFields);
console.log('Form validity:', isFormValid);

// 2. Test validation rules
const testValidation = (fieldName, value) => {
  const error = validateField(fieldName, value);
  console.log(`Validation for ${fieldName}:`, error);
};

// 3. Check accessibility
const checkA11y = (fieldId) => {
  const field = document.getElementById(fieldId);
  const errorId = field?.getAttribute('aria-describedby');
  const errorElement = errorId ? document.getElementById(errorId) : null;
  
  console.log('Field ARIA attributes:', {
    'aria-invalid': field?.getAttribute('aria-invalid'),
    'aria-describedby': field?.getAttribute('aria-describedby'),
    'error element exists': !!errorElement
  });
};
```

#### Common Validation Issues

##### Issue: Validation Not Triggering
```typescript
// Check if validation is properly debounced
const debouncedValidation = useCallback(
  debounce((fieldName: string, value: any) => {
    console.log(`Validating ${fieldName}:`, value);
    const error = schema.validateField(fieldName, value);
    setFieldError(fieldName, error);
  }, 300),
  [schema]
);
```

##### Issue: Accessibility Problems
```typescript
// Ensure proper ARIA attributes
const AccessibleField = ({ fieldId, error }) => (
  <div>
    <input
      id={fieldId}
      aria-invalid={!!error}
      aria-describedby={error ? `${fieldId}-error` : undefined}
    />
    {error && (
      <div
        id={`${fieldId}-error`}
        role="alert"
        aria-live="polite"
      >
        {error.message}
      </div>
    )}
  </div>
);
```

### 5. Component Error Debugging

#### Symptoms
- White screen of death
- Component not rendering
- Error boundary fallbacks showing

#### Debugging Steps

```javascript
// 1. Check React DevTools
// - Look for components in error state
// - Check props and state values
// - Verify component hierarchy

// 2. Add error logging to components
const DebugComponent = ({ children }) => {
  useEffect(() => {
    console.log('Component mounted');
    return () => console.log('Component unmounted');
  }, []);

  try {
    return children;
  } catch (error) {
    console.error('Component render error:', error);
    throw error;
  }
};

// 3. Test component isolation
const TestComponent = () => {
  const [hasError, setHasError] = useState(false);
  
  if (hasError) {
    throw new Error('Test error');
  }
  
  return (
    <div>
      <button onClick={() => setHasError(true)}>
        Trigger Error
      </button>
    </div>
  );
};
```

#### Error Boundary Debugging

```typescript
// Enhanced error boundary with debugging
class DebugErrorBoundary extends Component {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.group('Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();
    
    // Send to error tracking
    errorManager.handleError(error, {
      componentStack: errorInfo.componentStack,
      level: 'component'
    });
  }
}
```

## Common Error Scenarios and Solutions

### Scenario 1: Analysis Upload Failures

#### Symptoms
- File upload progress stops
- "Upload failed" messages
- Large files timing out

#### Debugging Checklist
- [ ] Check file size limits (max 10MB)
- [ ] Verify file type is supported (PDF, TXT, DOCX)
- [ ] Test network connectivity
- [ ] Check server logs for processing errors
- [ ] Verify authentication token validity

#### Resolution Steps
```typescript
// 1. Implement chunked upload for large files
const uploadLargeFile = async (file: File) => {
  const chunkSize = 1024 * 1024; // 1MB chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    
    await uploadChunk(chunk, i, totalChunks);
  }
};

// 2. Add retry logic for failed uploads
const uploadWithRetry = async (file: File) => {
  return RetryManager.withRetry(
    () => uploadFile(file),
    {
      maxRetries: 3,
      baseDelay: 2000,
      backoffFactor: 2
    }
  );
};
```

### Scenario 2: Dashboard Loading Issues

#### Symptoms
- Blank dashboard
- Infinite loading states
- Partial data display

#### Debugging Checklist
- [ ] Check API response times
- [ ] Verify data fetching logic
- [ ] Test with different user accounts
- [ ] Check for JavaScript errors
- [ ] Verify database connectivity

#### Resolution Steps
```typescript
// 1. Add loading state debugging
const useDashboardData = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching dashboard data...');
        const result = await api.getDashboardData();
        console.log('Dashboard data received:', result);
        setData(result);
      } catch (error) {
        console.error('Dashboard fetch error:', error);
        setError(error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  return { loading, error, data };
};

// 2. Implement graceful degradation
const Dashboard = () => {
  const { loading, error, data } = useDashboardData();
  
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} />;
  if (!data) return <EmptyDashboard />;
  
  return <DashboardContent data={data} />;
};
```

### Scenario 3: Real-time Updates Not Working

#### Symptoms
- Stale data in UI
- Missing notifications
- Websocket connection issues

#### Debugging Checklist
- [ ] Check websocket connection status
- [ ] Verify subscription setup
- [ ] Test with browser network tab
- [ ] Check for connection drops
- [ ] Verify server-side events

#### Resolution Steps
```typescript
// 1. Add connection monitoring
const useRealtimeConnection = () => {
  const [connected, setConnected] = useState(false);
  
  useEffect(() => {
    const channel = supabase
      .channel('connection-status')
      .on('system', { event: '*' }, (payload) => {
        console.log('Realtime event:', payload);
        setConnected(payload.type === 'connected');
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  return connected;
};

// 2. Implement reconnection logic
const useRealtimeWithReconnect = () => {
  const [retryCount, setRetryCount] = useState(0);
  
  useEffect(() => {
    const setupConnection = () => {
      const channel = supabase
        .channel('app-updates')
        .on('*', { event: '*' }, handleRealtimeEvent)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setRetryCount(0);
          } else if (status === 'CLOSED' && retryCount < 3) {
            setTimeout(() => {
              setRetryCount(prev => prev + 1);
              setupConnection();
            }, Math.pow(2, retryCount) * 1000);
          }
        });
    };
    
    setupConnection();
  }, [retryCount]);
};
```

## Error Resolution Playbooks

### Playbook 1: Critical System Error

**When to Use**: Application crashes, data corruption, security incidents

#### Immediate Response (0-5 minutes)
1. **Assess Impact**
   - Check error monitoring dashboard
   - Identify affected users and features
   - Determine if data is at risk

2. **Contain the Issue**
   - Enable maintenance mode if necessary
   - Rollback recent deployments if suspected
   - Isolate affected components

3. **Communicate**
   - Notify development team
   - Update status page
   - Prepare user communication

#### Short-term Resolution (5-30 minutes)
1. **Investigate Root Cause**
   - Review error logs and stack traces
   - Check recent code changes
   - Analyze system metrics

2. **Implement Fix**
   - Apply hotfix if available
   - Restore from backup if needed
   - Deploy emergency patch

3. **Verify Resolution**
   - Test critical user flows
   - Monitor error rates
   - Confirm system stability

#### Long-term Follow-up (1-24 hours)
1. **Post-Incident Review**
   - Document timeline and actions
   - Identify prevention measures
   - Update monitoring and alerts

2. **Preventive Measures**
   - Add additional error handling
   - Improve monitoring coverage
   - Update deployment procedures

### Playbook 2: Authentication Service Outage

**When to Use**: Users cannot log in, token validation failures

#### Immediate Response
1. **Check Service Status**
   ```bash
   # Test authentication endpoints
   curl -X POST "https://api.hallucifix.com/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test"}'
   ```

2. **Enable Fallback Authentication**
   - Switch to backup authentication provider
   - Enable guest mode for critical features
   - Implement offline authentication cache

3. **User Communication**
   - Display service status banner
   - Provide alternative access methods
   - Set expectations for resolution time

#### Resolution Steps
1. **Service Recovery**
   - Restart authentication services
   - Clear authentication caches
   - Verify database connectivity

2. **Token Management**
   - Refresh expired tokens
   - Clear invalid sessions
   - Reset authentication state

3. **Validation**
   - Test login flows
   - Verify token generation
   - Check permission systems

### Playbook 3: Database Performance Issues

**When to Use**: Slow queries, timeouts, high database load

#### Immediate Response
1. **Identify Slow Queries**
   ```sql
   -- Check for long-running queries
   SELECT query, state, query_start, now() - query_start AS duration
   FROM pg_stat_activity
   WHERE state = 'active'
   ORDER BY duration DESC;
   ```

2. **Optimize Critical Queries**
   - Add missing indexes
   - Rewrite inefficient queries
   - Enable query caching

3. **Scale Resources**
   - Increase database connections
   - Add read replicas
   - Enable connection pooling

#### Performance Monitoring
```typescript
// Add query performance tracking
const monitorQuery = async (queryName: string, queryFn: () => Promise<any>) => {
  const startTime = performance.now();
  
  try {
    const result = await queryFn();
    const duration = performance.now() - startTime;
    
    // Log slow queries
    if (duration > 1000) {
      console.warn(`Slow query detected: ${queryName} took ${duration}ms`);
      
      // Send to monitoring
      analytics.timing('database.query.duration', duration, {
        queryName,
        slow: 'true'
      });
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Query failed: ${queryName} after ${duration}ms`, error);
    throw error;
  }
};
```

## Support Team Guidelines

### Tier 1 Support: User-Facing Issues

#### Common User Issues
1. **Login Problems**
   - Check user account status
   - Verify email/password combination
   - Test password reset flow
   - Check for account lockouts

2. **Upload Failures**
   - Verify file size and format
   - Test with different browsers
   - Check network connectivity
   - Validate file content

3. **Analysis Not Working**
   - Check analysis queue status
   - Verify user permissions
   - Test with sample content
   - Review recent system changes

#### Escalation Criteria
- Multiple users reporting same issue
- Security-related concerns
- Data loss or corruption
- System-wide performance problems

### Tier 2 Support: Technical Issues

#### Advanced Troubleshooting
1. **Log Analysis**
   - Search error logs by user ID
   - Correlate errors across services
   - Identify error patterns
   - Check system metrics

2. **Database Investigation**
   - Query user data directly
   - Check data integrity
   - Analyze query performance
   - Review recent migrations

3. **API Testing**
   - Test endpoints directly
   - Verify authentication flows
   - Check rate limiting
   - Validate request/response data

#### Resolution Documentation
- Document all troubleshooting steps
- Record resolution methods
- Update knowledge base
- Share learnings with team

### Emergency Contacts

#### Development Team
- **Primary**: dev-team@hallucifix.com
- **On-call**: +1-555-DEV-TEAM
- **Slack**: #dev-alerts

#### Infrastructure Team
- **Primary**: ops-team@hallucifix.com
- **On-call**: +1-555-OPS-TEAM
- **Slack**: #ops-alerts

#### Management
- **CTO**: cto@hallucifix.com
- **VP Engineering**: vp-eng@hallucifix.com

## Tools and Resources

### Debugging Tools
- **Browser DevTools**: Network, Console, React DevTools
- **Sentry**: Error tracking and performance monitoring
- **Supabase Dashboard**: Database queries and logs
- **Postman**: API testing and debugging

### Monitoring Dashboards
- **Application Performance**: `/admin/performance`
- **Error Rates**: `/admin/errors`
- **User Analytics**: `/admin/analytics`
- **System Health**: `/admin/health`

### Documentation Links
- [API Reference](./API_REFERENCE.md)
- [Error Handling Best Practices](./ERROR_HANDLING_BEST_PRACTICES.md)
- [Database Schema](./DATABASE_DOCUMENTATION_INDEX.md)
- [Deployment Guide](./TECHNICAL_DOCUMENTATION.md)

## Conclusion

Effective error troubleshooting requires:
- Systematic debugging approaches
- Comprehensive error information collection
- Clear escalation procedures
- Proactive monitoring and alerting
- Regular review and improvement of processes

Remember: The goal is not just to fix errors, but to prevent them from happening again and improve the overall user experience.