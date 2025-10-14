# Configuration Health Checks and Monitoring

This document provides comprehensive guidance on using the configuration health checks, monitoring, and diagnostics system.

## Overview

The configuration health and monitoring system provides:

- **Health Checks**: Validate connectivity and configuration for all external services
- **Configuration Monitoring**: Track configuration changes, metrics, and performance
- **Diagnostics**: Comprehensive analysis and troubleshooting guidance
- **Alerting**: Automated alerts for configuration issues and drift detection

## Health Checks

### Available Health Checks

1. **Supabase Connectivity** - Validates database connection
2. **OpenAI API** - Checks API key and connectivity
3. **Anthropic API** - Validates API key format
4. **Google OAuth** - Validates OAuth configuration
5. **Stripe API** - Checks payment service configuration
6. **Sentry DSN** - Validates error tracking setup
7. **Configuration Validation** - Overall configuration integrity

### Running Health Checks

```typescript
import { ConfigurationHealthChecker, config } from '@/lib/config';

// Initialize configuration
await config.initialize();

// Create health checker
const healthChecker = new ConfigurationHealthChecker(config);

// Run all health checks
const healthStatus = await healthChecker.runHealthChecks();

console.log('Overall status:', healthStatus.overall);
console.log('Health checks:', healthStatus.checks);
```

### Health Check Results

Each health check returns:

```typescript
interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'warning';
  message: string;
  responseTime?: number;
  lastChecked: Date;
  metadata?: Record<string, any>;
}
```

### Health Check Endpoints

The system provides HTTP endpoints for health monitoring:

```typescript
import { createHealthCheckMiddleware } from '@/lib/config';

const healthMiddleware = createHealthCheckMiddleware(config);

// Basic health check
app.get('/health', healthMiddleware.health);

// Detailed health check
app.get('/health/detailed', healthMiddleware.healthDetailed);

// Service connectivity
app.get('/health/connectivity', healthMiddleware.connectivity);

// Configuration readiness
app.get('/health/readiness', healthMiddleware.readiness);

// Configuration drift detection
app.get('/health/drift', healthMiddleware.drift);
```

## Configuration Monitoring

### Audit Logging

Track all configuration changes and events:

```typescript
import { ConfigurationMonitoringService } from '@/lib/config';

const monitoring = new ConfigurationMonitoringService(config);
await monitoring.initialize();

// Monitoring automatically logs:
// - Configuration loads and reloads
// - Validation events
// - Configuration errors
// - Health check results
```

### Metrics Collection

Monitor configuration performance and usage:

```typescript
const metricsCollector = monitoring.getMetricsCollector();

// Get current metrics
const metrics = metricsCollector.getMetrics();
console.log('Load time:', metrics.loadTime);
console.log('Error count:', metrics.errorCount);
console.log('Active features:', metrics.activeFeatureFlags);

// Get performance metrics
const performance = metricsCollector.getPerformanceMetrics();
console.log('Average load time:', performance.averageLoadTime);
console.log('Error rate:', performance.errorRate);
```

### Configuration Drift Detection

Detect changes from baseline configuration:

```typescript
import { ConfigurationDriftDetector } from '@/lib/config';

const driftDetector = new ConfigurationDriftDetector(config);

// Set baseline configuration
driftDetector.setBaseline(currentConfig);

// Later, detect drift
const driftResult = await driftDetector.detectDrift();

if (driftResult.hasDrift) {
  console.log('Configuration drift detected!');
  console.log('Changes:', driftResult.driftItems);
}
```

### Alerting System

Automated alerts for configuration issues:

```typescript
const alertManager = monitoring.getAlertManager();

// Add custom alert handler
alertManager.addAlertHandler((alert) => {
  console.log(`Alert: ${alert.severity} - ${alert.message}`);
  
  // Send to external monitoring system
  if (alert.severity === 'critical') {
    sendToSlack(alert);
  }
});

// Get active alerts
const activeAlerts = alertManager.getActiveAlerts();
console.log('Active alerts:', activeAlerts.length);
```

## Configuration Diagnostics

### Running Diagnostics

Comprehensive configuration analysis:

```typescript
import { ConfigurationDiagnosticService } from '@/lib/config';

const diagnostics = new ConfigurationDiagnosticService(config, monitoring);

// Run full diagnostic report
const report = await diagnostics.runDiagnostics();

console.log('Overall status:', report.overallStatus);
console.log('Issues found:', report.summary.failed + report.summary.warnings);
console.log('Recommendations:', report.recommendations);
```

### Validation Guidance

Get specific guidance for configuration issues:

```typescript
// Generate validation guidance
const guidance = await diagnostics.generateValidationGuidance();

// Check for missing variables
if (guidance.missingVariables.length > 0) {
  console.log('Missing variables:');
  guidance.missingVariables.forEach(variable => {
    console.log(`- ${variable.variable}: ${variable.description}`);
    console.log(`  Example: ${variable.example}`);
  });
}

// Check for security issues
if (guidance.securityIssues.length > 0) {
  console.log('Security issues:');
  guidance.securityIssues.forEach(issue => {
    console.log(`- ${issue.issue} (${issue.severity})`);
    console.log(`  ${issue.recommendation}`);
  });
}
```

### Troubleshooting Guide

Get step-by-step troubleshooting instructions:

```typescript
// Get troubleshooting steps for specific issues
const steps = diagnostics.getTroubleshootingGuide('supabase-connection');

steps.forEach(step => {
  console.log(`Step: ${step.title}`);
  console.log(`Description: ${step.description}`);
  
  if (step.commands) {
    console.log('Commands to run:');
    step.commands.forEach(cmd => console.log(`  $ ${cmd}`));
  }
});
```

## CLI Tools

### Configuration Diagnostics CLI

Run diagnostics from the command line:

```bash
# Run basic diagnostics
npm run config:check

# Run health checks
npm run config:health

# Generate validation guidance
npm run config:validate

# Show troubleshooting guide
npm run config:troubleshoot

# Generate comprehensive report
npm run config:report --format markdown --output report.md
```

### CLI Options

```bash
# Available commands
config-diagnostics check        # Run configuration diagnostics
config-diagnostics health       # Run health checks
config-diagnostics validate     # Generate validation guidance
config-diagnostics troubleshoot # Show troubleshooting guide
config-diagnostics report       # Generate comprehensive report

# Options
--verbose                       # Show detailed information
--format text|json|markdown     # Output format
--output <file>                 # Output file path
--category <category>           # Filter by category
--severity all|fail|warning|pass # Filter by severity
```

## Integration Examples

### Express.js Integration

```typescript
import express from 'express';
import { createHealthCheckMiddleware, config } from '@/lib/config';

const app = express();

// Initialize configuration
await config.initialize();

// Add health check endpoints
const healthMiddleware = createHealthCheckMiddleware(config);

app.get('/health', healthMiddleware.health);
app.get('/health/detailed', healthMiddleware.healthDetailed);
app.get('/health/connectivity', healthMiddleware.connectivity);
app.get('/health/readiness', healthMiddleware.readiness);
app.get('/health/drift', healthMiddleware.drift);
app.get('/health/validation', healthMiddleware.validation);

app.listen(3000);
```

### React Component Integration

```typescript
import { useEffect, useState } from 'react';
import { runConfigurationHealthCheck } from '@/lib/config';

function HealthStatus() {
  const [healthStatus, setHealthStatus] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      const result = await runConfigurationHealthCheck(config);
      setHealthStatus(result);
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  if (!healthStatus) return <div>Loading...</div>;

  return (
    <div>
      <h3>System Health: {healthStatus.data.overall}</h3>
      {healthStatus.data.checks.map(check => (
        <div key={check.name}>
          {check.status === 'healthy' ? '✅' : '❌'} {check.name}: {check.message}
        </div>
      ))}
    </div>
  );
}
```

### CI/CD Integration

```yaml
# .github/workflows/config-validation.yml
name: Configuration Validation

on: [push, pull_request]

jobs:
  validate-config:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Validate configuration
        run: |
          npm run config:check -- --format json > config-report.json
          npm run config:validate -- --format json > validation-report.json
          
      - name: Upload reports
        uses: actions/upload-artifact@v2
        with:
          name: config-reports
          path: |
            config-report.json
            validation-report.json
```

## Best Practices

### 1. Regular Health Checks

- Run health checks on application startup
- Schedule periodic health checks (every 5-15 minutes)
- Monitor health check response times
- Set up alerts for failed health checks

### 2. Configuration Monitoring

- Enable audit logging in all environments
- Monitor configuration drift in production
- Set up alerts for critical configuration changes
- Track configuration performance metrics

### 3. Diagnostics and Troubleshooting

- Run diagnostics before deployments
- Include diagnostic reports in incident response
- Use validation guidance for onboarding new developers
- Keep troubleshooting documentation up to date

### 4. Alerting Strategy

- Configure different alert severities appropriately
- Set up escalation paths for critical alerts
- Integrate with existing monitoring systems
- Test alert handlers regularly

### 5. Security Considerations

- Never expose sensitive configuration in health check responses
- Sanitize configuration values in diagnostic reports
- Limit access to detailed configuration information
- Audit configuration access and changes

## Troubleshooting Common Issues

### Health Check Failures

1. **Supabase Connection Failed**
   - Verify VITE_SUPABASE_URL is correct
   - Check VITE_SUPABASE_ANON_KEY is valid
   - Ensure network connectivity to Supabase

2. **OpenAI API Issues**
   - Verify API key format (starts with 'sk-')
   - Check API key has proper permissions
   - Verify network access to OpenAI API

3. **Configuration Validation Errors**
   - Check all required environment variables are set
   - Verify environment variable formats
   - Ensure configuration schema is up to date

### Performance Issues

1. **Slow Health Checks**
   - Check network connectivity
   - Verify external service availability
   - Consider increasing timeout values

2. **High Configuration Load Times**
   - Review configuration complexity
   - Check for unnecessary validation
   - Consider caching strategies

### Monitoring Issues

1. **Missing Audit Logs**
   - Verify monitoring service is initialized
   - Check log output configuration
   - Ensure proper permissions for log files

2. **Alert Fatigue**
   - Review alert thresholds
   - Implement alert grouping
   - Add alert resolution tracking

## API Reference

### Health Check Classes

- `ConfigurationHealthChecker` - Main health check service
- `ConfigurationDriftDetector` - Configuration drift detection
- `ConfigurationHealthEndpoints` - HTTP endpoint handlers

### Monitoring Classes

- `ConfigurationMonitoringService` - Integrated monitoring service
- `ConfigurationAuditLogger` - Audit logging functionality
- `ConfigurationMetricsCollector` - Metrics collection and analysis
- `ConfigurationAlertManager` - Alert management and handling

### Diagnostic Classes

- `ConfigurationDiagnosticService` - Diagnostic analysis service
- `ConfigurationDiagnosticsCli` - Command-line interface

### Utility Functions

- `runConfigurationHealthCheck()` - Standalone health check
- `runConfigurationDriftCheck()` - Standalone drift check
- `createHealthCheckMiddleware()` - Express middleware factory

For detailed API documentation, see the TypeScript interfaces and JSDoc comments in the source code.