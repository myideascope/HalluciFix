# Configuration Hot Reload System

The configuration hot reload system provides automatic configuration reloading during development, making it easy to test configuration changes without restarting the application.

## Features

- **Automatic File Watching**: Monitors environment files and configuration modules for changes
- **Debounced Reloading**: Prevents excessive reloads during rapid file changes
- **Change Detection**: Only triggers updates when configuration actually changes
- **Error Handling**: Graceful error handling with detailed error messages
- **Development Only**: Automatically disabled in production environments
- **React Integration**: Hooks and components for React applications
- **Visual Notifications**: Browser notifications and debug panels

## Quick Start

### 1. Basic Setup

The hot reload system is automatically initialized when the configuration service starts in development mode:

```typescript
import { config } from '../lib/config/index.js';

// Initialize configuration (hot reload starts automatically in development)
await config.initialize();

// Check if hot reload is active
console.log('Hot reload active:', config.isHotReloadActive());
```

### 2. React Integration

Use the provided hooks to monitor configuration changes in React components:

```tsx
import { useConfigHotReload, useConfigValue } from '../hooks/useConfigHotReload.js';

function MyComponent() {
  const { isHotReloadActive, currentConfig, reloadConfig } = useConfigHotReload();
  
  // Monitor specific configuration values
  const appName = useConfigValue(config => config.app.name, 'Default App');
  const hasOpenAI = useConfigValue(config => !!config.ai.openai?.apiKey, false);

  return (
    <div>
      <h1>{appName.value}</h1>
      {appName.hasChanged && <span>Configuration updated!</span>}
      <button onClick={reloadConfig}>Reload Config</button>
    </div>
  );
}
```

### 3. Visual Notifications

Add the notification component to see configuration changes:

```tsx
import { ConfigHotReloadNotification } from '../components/ConfigHotReloadNotification.js';

function App() {
  return (
    <div>
      {/* Your app content */}
      <ConfigHotReloadNotification position="top-right" showDebugPanel={true} />
    </div>
  );
}
```

## Configuration

### Watched Files

By default, the system watches these files:

- `.env`
- `.env.local`
- `.env.development`
- `.env.staging`
- `.env.production`
- `src/lib/config/**/*.ts`

### Custom Configuration

You can customize the hot reload behavior:

```typescript
import { ConfigurationHotReload } from '../lib/config/index.js';

const hotReload = new ConfigurationHotReload(loader, {
  enabled: true,
  watchPaths: [
    '.env*',
    'config/**/*.json',
    'src/lib/config/**/*.ts'
  ],
  debounceMs: 1000, // Wait 1 second before reloading
  onConfigChange: (event) => {
    console.log('Config changed:', event);
  },
  onError: (error) => {
    console.error('Hot reload error:', error);
  }
});
```

## API Reference

### ConfigurationHotReload Class

#### Methods

- `start()`: Start watching for configuration changes
- `stop()`: Stop watching and clean up resources
- `reload()`: Manually trigger configuration reload
- `getCurrentConfig()`: Get the current configuration
- `isRunning()`: Check if hot reload is active

#### Events

- `started`: Emitted when hot reload starts
- `stopped`: Emitted when hot reload stops
- `config-change`: Emitted when configuration changes
- `reloaded`: Emitted when configuration is successfully reloaded
- `error`: Emitted when an error occurs

### React Hooks

#### useConfigHotReload()

Returns an object with:

- `isHotReloadActive`: Boolean indicating if hot reload is running
- `currentConfig`: Current configuration object
- `lastChangeEvent`: Last configuration change event
- `reloadConfig`: Function to manually reload configuration
- `isReloading`: Boolean indicating if reload is in progress
- `error`: Last error that occurred

#### useConfigValue(selector, defaultValue)

Monitor specific configuration values:

- `selector`: Function to extract value from configuration
- `defaultValue`: Default value if configuration is not available

Returns:

- `value`: Current value
- `hasChanged`: Boolean indicating if value has changed
- `lastUpdated`: Date when value was last updated

#### useConfigChangeNotifications()

Get configuration change notifications:

- `lastChange`: Last configuration change event
- `changeCount`: Total number of changes detected

## Development Workflow

### 1. Testing Configuration Changes

1. Start your development server: `npm run dev`
2. Open your application in the browser
3. Edit any environment file (e.g., `.env.local`)
4. Watch the configuration update automatically
5. Check browser console for change notifications

### 2. Debugging Configuration Issues

1. Enable the debug panel in `ConfigHotReloadNotification`
2. Use the "Config Debug" button to inspect current configuration
3. Check the browser console for detailed logs
4. Use the manual reload button to test configuration loading

### 3. Testing Different Environments

```bash
# Test staging configuration
NODE_ENV=staging npm run dev

# Test production configuration (hot reload disabled)
NODE_ENV=production npm run dev
```

## Best Practices

### 1. Environment File Organization

```
.env.example          # Template with all variables
.env.local           # Local development overrides (gitignored)
.env.development     # Development defaults
.env.staging         # Staging configuration
.env.production      # Production configuration
```

### 2. Configuration Structure

Keep configuration changes atomic and test them individually:

```bash
# Good: Change one service at a time
VITE_OPENAI_API_KEY=sk-new-key

# Avoid: Changing multiple services simultaneously
VITE_OPENAI_API_KEY=sk-new-key
VITE_STRIPE_SECRET_KEY=sk_test_new
VITE_ENABLE_PAYMENTS=true
```

### 3. Error Handling

Always handle configuration errors gracefully:

```typescript
const { error, reloadConfig } = useConfigHotReload();

if (error) {
  return (
    <div className="error">
      Configuration error: {error.message}
      <button onClick={reloadConfig}>Retry</button>
    </div>
  );
}
```

## Troubleshooting

### Hot Reload Not Working

1. **Check Environment**: Hot reload only works in development mode
   ```typescript
   console.log('NODE_ENV:', process.env.NODE_ENV);
   ```

2. **Check File Permissions**: Ensure configuration files are readable
   ```bash
   ls -la .env*
   ```

3. **Check File Paths**: Verify watched paths exist
   ```typescript
   const hotReload = config.getHotReload();
   console.log('Watching:', hotReload?.options.watchPaths);
   ```

### Configuration Not Updating

1. **Check File Format**: Ensure environment variables follow the correct format
   ```bash
   # Correct
   VITE_APP_NAME=MyApp
   
   # Incorrect (spaces around =)
   VITE_APP_NAME = MyApp
   ```

2. **Check Variable Names**: Ensure variables are properly mapped
   ```typescript
   // Check mapping in src/lib/config/mapping.ts
   console.log('Mapped variables:', ENV_VAR_MAPPINGS);
   ```

3. **Check Validation**: Ensure new values pass validation
   ```typescript
   // Check validation errors in browser console
   ```

### Performance Issues

1. **Reduce Watch Paths**: Limit watched files to necessary ones only
2. **Increase Debounce**: Increase debounce time for slower systems
3. **Disable in Production**: Ensure hot reload is disabled in production

## Security Considerations

- Hot reload is automatically disabled in production
- Sensitive configuration is not logged to console
- File watching is limited to configuration files only
- No external network access for file watching

## Integration Examples

### With Feature Flags

```typescript
const enableBetaFeatures = useConfigValue(
  config => config.features.enableBetaFeatures,
  false
);

if (enableBetaFeatures.value) {
  return <BetaFeatureComponent />;
}
```

### With Service Configuration

```typescript
const { hasOpenAI, hasStripe } = useConfigHotReload();

return (
  <div>
    {hasOpenAI && <AIAnalysisComponent />}
    {hasStripe && <PaymentComponent />}
  </div>
);
```

### With Environment Detection

```typescript
const environment = useConfigValue(config => config.app.environment, 'development');

return (
  <div className={`app app--${environment.value}`}>
    {environment.value === 'development' && <DeveloperTools />}
  </div>
);
```