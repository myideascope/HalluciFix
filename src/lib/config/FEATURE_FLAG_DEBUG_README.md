# Feature Flag Debugging and Visibility Tools

This document provides comprehensive information about the feature flag debugging and visibility tools implemented for the HalluciFix application.

## Overview

The feature flag debugging system provides comprehensive tools for:
- **Real-time debugging** with visual interface
- **Usage tracking and analytics** for optimization
- **Comprehensive documentation** for all flags
- **Console utilities** for developer productivity
- **Logging and monitoring** for troubleshooting

## Components

### 1. Feature Flag Debugger Component (`FeatureFlagDebugger.tsx`)

A comprehensive React component that provides a visual debugging interface for feature flags.

#### Features:
- **Real-time flag status** with source information
- **Override management** with temporary and persistent options
- **Event logging** with filtering and search
- **Documentation viewer** with usage examples
- **Export functionality** for debugging data

#### Usage:
```tsx
import FeatureFlagDebugger from './components/FeatureFlagDebugger';

function App() {
  return (
    <div>
      {/* Your app content */}
      <FeatureFlagDebugger />
    </div>
  );
}
```

#### Configuration:
```tsx
<FeatureFlagDebugger 
  visible={true}                    // Show/hide debugger
  position="bottom-right"           // Position on screen
  minimized={true}                  // Start minimized
/>
```

### 2. React Hooks (`useFeatureFlag.ts`)

Provides React integration with debugging support.

#### `useFeatureFlag` Hook:
```typescript
import { useFeatureFlag } from '../hooks/useFeatureFlag';

function MyComponent() {
  const { 
    isEnabled, 
    flagInfo, 
    setOverride, 
    removeOverride, 
    refresh 
  } = useFeatureFlag('enableAnalytics', {
    debug: true,  // Enable debug logging
    context: {
      userId: user.id,
      customProperties: { plan: 'premium' }
    }
  });

  if (isEnabled) {
    return <AnalyticsComponent />;
  }
  
  return <PlaceholderComponent />;
}
```

#### `useAllFeatureFlags` Hook:
```typescript
import { useAllFeatureFlags } from '../hooks/useFeatureFlag';

function DebugPanel() {
  const { 
    flags, 
    debugInfo, 
    setOverride, 
    removeOverride, 
    clearAllOverrides 
  } = useAllFeatureFlags({ debug: true });

  return (
    <div>
      {Object.entries(flags).map(([key, enabled]) => (
        <div key={key}>
          {key}: {enabled ? 'ON' : 'OFF'}
          <button onClick={() => setOverride(key, !enabled)}>
            Toggle
          </button>
        </div>
      ))}
    </div>
  );
}
```

#### `useFeatureFlagDebug` Hook:
```typescript
import { useFeatureFlagDebug } from '../hooks/useFeatureFlag';

function DebugUtilities() {
  const { debugInfo, logDebugInfo, exportDebugInfo } = useFeatureFlagDebug();

  return (
    <div>
      <button onClick={logDebugInfo}>Log Debug Info</button>
      <button onClick={exportDebugInfo}>Export Debug Data</button>
      <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
    </div>
  );
}
```

### 3. Logging System (`featureFlagLogger.ts`)

Comprehensive logging and analytics for feature flag usage.

#### Features:
- **Evaluation tracking** with source and context
- **Override logging** with metadata
- **Usage statistics** and analytics
- **Error tracking** and reporting
- **Session-based analytics** with summaries

#### Usage:
```typescript
import { featureFlagLogger } from '../lib/config/featureFlagLogger';

// Get usage analytics
const analytics = featureFlagLogger.getAnalytics();
console.log('Total evaluations:', analytics.totalEvaluations);

// Get flag-specific statistics
const stats = featureFlagLogger.getFlagStats('enableAnalytics');
console.log('Analytics flag usage:', stats);

// Generate summary report
const report = featureFlagLogger.generateSummaryReport();
console.log(report);

// Export analytics data
const exportData = featureFlagLogger.exportAnalytics();
```

### 4. Documentation System (`featureFlagDocs.ts`)

Automatic documentation generation for all feature flags.

#### Features:
- **Comprehensive flag documentation** with examples
- **Multiple export formats** (Markdown, HTML, JSON)
- **Usage examples** for components and hooks
- **Environment-specific information**
- **Dependency and conflict tracking**

#### Usage:
```typescript
import { featureFlagDocs } from '../lib/config/featureFlagDocs';

// Get documentation for a specific flag
const doc = featureFlagDocs.getDocumentation('enableAnalytics');
console.log(doc.description, doc.examples);

// Get all documentation
const allDocs = featureFlagDocs.getAllDocumentation();

// Generate markdown documentation
const markdown = featureFlagDocs.generateMarkdownDocs();

// Generate HTML documentation
const html = featureFlagDocs.generateHtmlDocs();

// Export as JSON
const json = featureFlagDocs.exportAsJson();
```

### 5. Console Utilities (`featureFlagConsole.ts`)

Global console commands for debugging feature flags.

#### Available Commands:

##### Basic Commands:
```javascript
// Check if flag is enabled
featureFlags.isEnabled('enableAnalytics')

// Get detailed flag information
featureFlags.get('enableAnalytics')

// Get all flags and their values
featureFlags.getAll()
```

##### Override Commands:
```javascript
// Enable a flag
featureFlags.set('enablePayments', true)

// Disable a flag
featureFlags.set('enablePayments', false)

// Set temporary override (expires in 60 seconds)
featureFlags.set('enableBetaFeatures', true, { expiresIn: 60000 })

// Set persistent override (saved to localStorage)
featureFlags.set('enableAnalytics', false, { persistToLocalStorage: true })

// Remove override for a flag
featureFlags.remove('enablePayments')

// Clear all overrides
featureFlags.clear()
```

##### Debug Commands:
```javascript
// Show debug information
featureFlags.debug()

// Show system information
featureFlags.info()

// Show usage statistics
featureFlags.stats()

// Show recent events
featureFlags.logs()
```

##### Documentation Commands:
```javascript
// List all documented flags
featureFlags.docs()

// Show flag documentation
featureFlags.docs('enableAnalytics')

// Show help
featureFlags.help()
```

##### Export Commands:
```javascript
// Export debug data
featureFlags.export()
```

##### Advanced Access:
```javascript
// Direct manager access
featureFlags.manager
featureFlagManager

// Example: Subscribe to flag changes
featureFlagManager.subscribe('enableAnalytics', (value) => {
  console.log('Analytics flag changed:', value);
});
```

## URL Parameter Overrides

Override feature flags via URL parameters:

```
# Enable analytics
?ff_enableAnalytics=true

# Disable payments
?ff_enablePayments=false

# Multiple overrides
?ff_enableAnalytics=true&ff_enablePayments=false&ff_enableBetaFeatures=true
```

## Environment Variables

Configure feature flags via environment variables:

```bash
# .env file
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=false
VITE_ENABLE_BETA_FEATURES=false
VITE_ENABLE_RAG_ANALYSIS=true
VITE_ENABLE_BATCH_PROCESSING=true
VITE_ENABLE_MOCK_SERVICES=true
```

## Precedence Rules

Feature flag values are resolved in the following order (highest to lowest precedence):

1. **Runtime overrides** - Set via console or debugger
2. **URL parameters** - `?ff_flagName=true`
3. **Local storage** - Persistent browser storage
4. **Environment configuration** - Environment variables
5. **Default values** - Hardcoded defaults

## Debugging Workflows

### 1. Visual Debugging
1. Open the application in development mode
2. Look for the "🚩 FF Debug" button in the bottom-right corner
3. Click to expand the debugger interface
4. Use the tabs to explore flags, overrides, logs, and documentation

### 2. Console Debugging
1. Open browser developer tools
2. Type `featureFlags.help()` to see available commands
3. Use commands like `featureFlags.get('flagName')` for detailed info
4. Set overrides with `featureFlags.set('flagName', true)`

### 3. URL Testing
1. Add URL parameters: `?ff_enablePayments=true`
2. Refresh the page to see changes
3. Use multiple parameters for complex testing scenarios

### 4. Analytics Review
1. Use `featureFlags.stats()` to see usage statistics
2. Export data with `featureFlags.export()` for analysis
3. Review logs with `featureFlags.logs()` for troubleshooting

## Integration Examples

### Component Integration
```tsx
import { useFeatureFlag } from '../hooks/useFeatureFlag';

function PaymentSection() {
  const { isEnabled, flagInfo } = useFeatureFlag('enablePayments', {
    debug: true,
    context: { userId: user.id }
  });

  if (!isEnabled) {
    return <ComingSoonMessage />;
  }

  return (
    <div>
      <PaymentForm />
      {flagInfo.source === 'runtime' && (
        <div className="debug-info">
          ⚠️ Payments enabled via override
        </div>
      )}
    </div>
  );
}
```

### Service Integration
```typescript
import { featureFlagManager } from '../lib/config';

class AnalyticsService {
  track(event: string, properties: any) {
    if (featureFlagManager.isEnabled('enableAnalytics')) {
      // Send analytics event
      this.sendEvent(event, properties);
    }
  }
}
```

### Conditional Rendering
```tsx
import { useFeatureFlag } from '../hooks/useFeatureFlag';

function Navigation() {
  const { isEnabled: showBeta } = useFeatureFlag('enableBetaFeatures');
  const { isEnabled: showPayments } = useFeatureFlag('enablePayments');

  return (
    <nav>
      <NavItem to="/dashboard">Dashboard</NavItem>
      <NavItem to="/analysis">Analysis</NavItem>
      {showPayments && <NavItem to="/billing">Billing</NavItem>}
      {showBeta && (
        <NavItem to="/beta" badge="Beta">
          Beta Features
        </NavItem>
      )}
    </nav>
  );
}
```

## Best Practices

### 1. Development
- Always use the debugger component in development
- Enable debug logging for hooks during development
- Use URL parameters for quick testing scenarios
- Regularly review analytics to understand flag usage

### 2. Testing
- Test both enabled and disabled states for each flag
- Use overrides to test edge cases and error conditions
- Verify flag precedence rules work correctly
- Test flag changes don't break existing functionality

### 3. Production
- Monitor flag usage through analytics
- Use gradual rollouts for new features
- Document flag purposes and dependencies
- Plan flag retirement and cleanup

### 4. Documentation
- Keep flag documentation up to date
- Include usage examples for complex flags
- Document dependencies between flags
- Provide troubleshooting guides for common issues

## Troubleshooting

### Common Issues

#### Flag not updating
1. Check precedence rules - higher precedence sources override lower ones
2. Clear browser cache and localStorage
3. Verify environment variables are set correctly
4. Check for JavaScript errors in console

#### Debugger not showing
1. Ensure you're in development environment
2. Check that the component is included in your app
3. Verify no CSS conflicts are hiding the debugger
4. Check browser console for initialization errors

#### Console commands not working
1. Ensure you're in development environment
2. Check that console utilities are initialized
3. Verify no conflicts with other global variables
4. Try refreshing the page and waiting for initialization

#### Analytics not tracking
1. Check that analytics are enabled in configuration
2. Verify logger is initialized properly
3. Check for JavaScript errors preventing logging
4. Ensure sufficient permissions for localStorage access

### Debug Steps
1. Open browser developer tools
2. Check console for error messages
3. Use `featureFlags.debug()` to inspect system state
4. Use `featureFlags.info()` to verify initialization
5. Export debug data with `featureFlags.export()` for analysis

## Performance Considerations

### Caching
- Flag evaluations are cached for 5 minutes by default
- Cache is automatically invalidated when overrides change
- Use `refresh()` method to force re-evaluation

### Memory Usage
- Event logs are limited to 1000 entries
- Analytics data is session-based and cleared on refresh
- Overrides are cleaned up automatically when expired

### Network Impact
- No network requests for flag evaluation (all local)
- Documentation and analytics are generated client-side
- Export functionality uses browser download APIs

## Security Notes

### Development Only
- Console utilities are only available in development
- Debugger component respects environment settings
- Production builds exclude debugging overhead

### Data Privacy
- No sensitive data is logged or exported
- User context is optional and controlled by implementation
- All data stays in browser (no external transmission)

### Access Control
- Override capabilities are limited to development environment
- URL parameter overrides can be disabled if needed
- localStorage overrides respect browser security policies