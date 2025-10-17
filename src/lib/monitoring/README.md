# API Monitoring and Alerting System

This monitoring system provides comprehensive tracking of API performance, costs, and usage quotas with real-time alerting capabilities.

## Features

- **Response Time Monitoring**: Track API response times and alert on slow responses
- **Error Rate Tracking**: Monitor error rates and trigger alerts when thresholds are exceeded
- **Cost Tracking**: Calculate and monitor API costs with budget alerts
- **Usage Quota Monitoring**: Track API usage against quotas with warning and critical alerts
- **Real-time Alerts**: Configurable alerting system with webhook support
- **Dashboard Integration**: React component for visualizing metrics

## Quick Start

### 1. Initialize Monitoring

```typescript
import { initializeMonitoring } from './lib/monitoring';

// Initialize with default configuration
const monitoring = initializeMonitoring();

// Or with custom configuration
const monitoring = initializeMonitoring({
  enabled: true,
  apiMonitor: {
    responseTimeThreshold: 3000, // 3 seconds
    errorRateThreshold: 5, // 5%
    costThreshold: 10, // $10 per hour
    quotaWarningEnabled: true,
    quotaCriticalEnabled: true,
    webhookUrl: 'https://your-webhook-url.com/alerts'
  },
  costTracking: {
    enabled: true,
    budgets: {
      openai: {
        amount: 100, // $100 per day
        period: 'day',
        alertThreshold: 0.8 // Alert at 80%
      }
    }
  }
});
```

### 2. Wrap API Calls

```typescript
import { withOpenAIMonitoring, withGoogleDriveMonitoring } from './lib/monitoring';

// Wrap OpenAI API calls
const analyzeContent = withOpenAIMonitoring('analyze_content', async (content: string) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content }]
  });
  return response;
});

// Wrap Google Drive API calls
const listFiles = withGoogleDriveMonitoring('list_files', async () => {
  const response = await drive.files.list();
  return response.data;
});
```

### 3. Add Monitoring Dashboard

```tsx
import { MonitoringDashboard } from './lib/monitoring';

function App() {
  return (
    <div>
      <MonitoringDashboard 
        providers={['openai', 'anthropic', 'google_drive']}
        refreshInterval={30000} // 30 seconds
      />
    </div>
  );
}
```

## API Reference

### Core Services

#### APIMonitor

Tracks API metrics and triggers alerts based on configurable thresholds.

```typescript
import { getAPIMonitor } from './lib/monitoring';

const monitor = getAPIMonitor({
  responseTimeThreshold: 5000,
  errorRateThreshold: 10,
  costThreshold: 10,
  quotaWarningEnabled: true,
  quotaCriticalEnabled: true
});

// Record a metric
monitor.recordMetric({
  provider: 'openai',
  endpoint: 'chat/completions',
  responseTime: 1500,
  statusCode: 200,
  timestamp: new Date(),
  tokenUsage: { prompt: 100, completion: 50, total: 150 },
  cost: 0.003
});

// Get provider metrics
const metrics = monitor.getProviderMetrics('openai');
console.log(metrics.avgResponseTime, metrics.errorRate);
```

#### CostTracker

Calculates and tracks API costs with budget monitoring.

```typescript
import { getCostTracker } from './lib/monitoring';

const costTracker = getCostTracker();

// Set a budget
costTracker.setBudget('openai', 100, 'day', 0.8); // $100/day, alert at 80%

// Calculate cost
const cost = costTracker.calculateCost('openai', {
  inputTokens: 1000,
  outputTokens: 500,
  requests: 1
});

// Get cost summary
const summary = costTracker.getCostSummary('openai', 'day');
console.log(summary.totalCost, summary.budgetUsage);
```

#### MonitoringService

High-level service that integrates API monitoring and cost tracking.

```typescript
import { getMonitoringService } from './lib/monitoring';

const service = getMonitoringService({
  enabled: true,
  apiMonitor: { /* config */ },
  costTracking: { /* config */ }
});

// Wrap API calls for automatic monitoring
const wrappedCall = service.wrapAPICall('openai', 'endpoint', apiFunction);

// Get status
const status = service.getStatus();
console.log(status.enabled, status.initialized);
```

### Integration Helpers

#### Monitoring Decorators

```typescript
import { 
  withOpenAIMonitoring,
  withAnthropicMonitoring,
  withGoogleDriveMonitoring,
  withAPIMonitoring
} from './lib/monitoring';

// Provider-specific decorators
const openaiCall = withOpenAIMonitoring('endpoint', apiFunction);
const anthropicCall = withAnthropicMonitoring('endpoint', apiFunction);
const driveCall = withGoogleDriveMonitoring('endpoint', apiFunction);

// Generic decorator
const customCall = withAPIMonitoring('provider', 'endpoint', apiFunction);
```

#### Batch Monitoring

```typescript
import { monitorBatchAPICalls } from './lib/monitoring';

const results = await monitorBatchAPICalls('openai', 'batch_analysis', [
  () => analyzeContent('content1'),
  () => analyzeContent('content2'),
  () => analyzeContent('content3')
]);
```

### Alert Handling

```typescript
import { getAPIMonitor, getCostTracker } from './lib/monitoring';

const monitor = getAPIMonitor();
const costTracker = getCostTracker();

// Register alert handlers
monitor.onAlert((alert) => {
  console.log(`API Alert: ${alert.message}`);
  // Send to logging service, Slack, etc.
});

costTracker.onCostAlert((alert) => {
  console.log(`Cost Alert: ${alert.message}`);
  // Send budget notifications
});
```

## Configuration

### Default Configuration

```typescript
const defaultConfig = {
  enabled: true,
  apiMonitor: {
    responseTimeThreshold: 5000, // 5 seconds
    errorRateThreshold: 10, // 10%
    costThreshold: 10, // $10 per hour
    quotaWarningEnabled: true,
    quotaCriticalEnabled: true
  },
  costTracking: {
    enabled: true,
    budgets: {
      openai: { amount: 100, period: 'day', alertThreshold: 0.8 },
      anthropic: { amount: 50, period: 'day', alertThreshold: 0.8 },
      google_drive: { amount: 10, period: 'day', alertThreshold: 0.8 }
    }
  }
};
```

### Environment-Specific Setup

```typescript
import { setupEnvironmentSpecificMonitoring } from './lib/monitoring/example-integration';

// Development
const devMonitoring = setupEnvironmentSpecificMonitoring('development');

// Production
const prodMonitoring = setupEnvironmentSpecificMonitoring('production');
```

## Cost Models

The system includes built-in cost models for major providers:

- **OpenAI**: $0.03/1K input tokens, $0.06/1K output tokens
- **Anthropic**: $0.015/1K input tokens, $0.075/1K output tokens
- **Google Drive**: $0.0004/request, $0.02/GB storage, $0.12/GB bandwidth

### Custom Cost Models

```typescript
import { getCostTracker } from './lib/monitoring';

const costTracker = getCostTracker();

costTracker.setCostModel({
  provider: 'custom_api',
  pricing: {
    input: 0.01, // $0.01 per 1K input tokens
    output: 0.02, // $0.02 per 1K output tokens
    request: 0.001 // $0.001 per request
  },
  currency: 'USD'
});
```

## Dashboard Component

The `MonitoringDashboard` component provides a comprehensive view of API metrics:

```tsx
<MonitoringDashboard 
  providers={['openai', 'anthropic', 'google_drive']}
  refreshInterval={30000}
/>
```

Features:
- Real-time metrics display
- Cost tracking and budget usage
- Error rate and response time charts
- Quota status indicators
- Alert notifications

## Best Practices

1. **Initialize Early**: Set up monitoring during application startup
2. **Wrap All API Calls**: Use monitoring decorators for all external API calls
3. **Set Appropriate Thresholds**: Configure thresholds based on your SLAs
4. **Monitor Costs**: Set budgets and alerts to prevent unexpected charges
5. **Handle Alerts**: Implement proper alert handling for production systems
6. **Regular Review**: Regularly review metrics and adjust thresholds

## Troubleshooting

### Common Issues

1. **Monitoring Not Working**: Ensure monitoring is initialized before making API calls
2. **Missing Metrics**: Check that API calls are properly wrapped with monitoring decorators
3. **Incorrect Costs**: Verify cost models are up to date with provider pricing
4. **Alert Spam**: Adjust thresholds to reduce false positives

### Debug Mode

```typescript
// Enable debug logging
const monitoring = initializeMonitoring({
  enabled: true,
  // ... other config
});

// Check status
const status = monitoring.monitoringService.getStatus();
console.log('Monitoring Status:', status);

// Get metrics summary
const summary = monitoring.monitoringService.getMetricsSummary();
console.log('Metrics Summary:', summary);
```

## Examples

See `example-integration.ts` for complete examples of:
- Service integration
- Custom monitoring functions
- Environment-specific configurations
- Alert handling patterns