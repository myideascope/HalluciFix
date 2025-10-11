# Spec: Comprehensive Logging and Monitoring

**Priority:** High (P1)  
**Estimated Effort:** 1-2 weeks  
**Dependencies:** Error handling implementation, environment configuration

## Overview

Implement comprehensive logging, monitoring, and alerting infrastructure to ensure system reliability, performance tracking, and proactive issue detection in production environments.

## Current State

- Basic console logging in development
- No structured logging or log aggregation
- No application performance monitoring (APM)
- No alerting or notification system
- Limited error tracking and reporting

## Requirements

### 1. Structured Logging System

**Acceptance Criteria:**
- [ ] Structured JSON logging with consistent format
- [ ] Multiple log levels (error, warn, info, debug)
- [ ] Contextual logging with request IDs and user context
- [ ] Log aggregation and centralized storage
- [ ] Log retention and rotation policies

**Technical Details:**
- Implement Winston or Pino for structured logging
- Add request correlation IDs for tracing
- Include user context and session information
- Set up log shipping to external service
- Configure appropriate log levels per environment

### 2. Application Performance Monitoring

**Acceptance Criteria:**
- [ ] Real-time performance metrics collection
- [ ] API endpoint response time tracking
- [ ] Database query performance monitoring
- [ ] Frontend performance metrics (Core Web Vitals)
- [ ] Custom business metrics tracking

**Technical Details:**
- Integrate APM solution (New Relic, DataDog, or similar)
- Track key performance indicators (KPIs)
- Monitor user journey and conversion funnels
- Set up performance budgets and alerts
- Implement custom metrics for business logic

### 3. Error Tracking and Alerting

**Acceptance Criteria:**
- [ ] Automatic error capture and reporting
- [ ] Error grouping and deduplication
- [ ] Real-time alerts for critical errors
- [ ] Error trend analysis and reporting
- [ ] Integration with incident management

**Technical Details:**
- Integrate Sentry or similar error tracking service
- Configure error sampling and filtering
- Set up alert rules for different error types
- Implement error recovery and retry mechanisms
- Add error context and user impact tracking

### 4. System Health Monitoring

**Acceptance Criteria:**
- [ ] Infrastructure monitoring (CPU, memory, disk)
- [ ] Application health checks and heartbeats
- [ ] Service dependency monitoring
- [ ] Uptime monitoring and SLA tracking
- [ ] Automated incident response

**Technical Details:**
- Set up infrastructure monitoring dashboards
- Implement health check endpoints
- Monitor external service dependencies
- Configure uptime monitoring and alerts
- Create runbooks for common incidents

## Implementation Plan

### Phase 1: Logging Infrastructure (Days 1-3)
1. Set up structured logging framework
2. Implement log correlation and context
3. Configure log aggregation and storage
4. Set up log retention policies

### Phase 2: Performance Monitoring (Days 4-6)
1. Integrate APM solution
2. Set up performance metrics collection
3. Create performance dashboards
4. Configure performance alerts

### Phase 3: Error Tracking (Days 7-9)
1. Implement error tracking service
2. Configure error grouping and alerts
3. Set up error reporting workflows
4. Test error recovery mechanisms

### Phase 4: System Monitoring (Days 10-14)
1. Set up infrastructure monitoring
2. Implement health checks
3. Configure uptime monitoring
4. Create incident response procedures

## Logging Implementation

### Structured Logger Setup
```typescript
// src/lib/logger.ts
import winston from 'winston';
import { config } from './env';

interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
  [key: string]: any;
}

class Logger {
  private winston: winston.Logger;

  constructor() {
    this.winston = winston.createLogger({
      level: config.isDevelopment ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta
          });
        })
      ),
      defaultMeta: {
        service: 'hallucifix',
        version: config.appVersion,
        environment: config.isDevelopment ? 'development' : 'production'
      },
      transports: [
        new winston.transports.Console({
          format: config.isDevelopment 
            ? winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
              )
            : winston.format.json()
        })
      ]
    });

    // Add external log shipping in production
    if (!config.isDevelopment) {
      this.winston.add(new winston.transports.Http({
        host: process.env.LOG_ENDPOINT_HOST,
        port: process.env.LOG_ENDPOINT_PORT,
        path: '/logs'
      }));
    }
  }

  private formatMessage(message: string, context?: LogContext) {
    return {
      message,
      ...context,
      timestamp: new Date().toISOString()
    };
  }

  error(message: string, error?: Error, context?: LogContext) {
    this.winston.error(this.formatMessage(message, {
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    }));
  }

  warn(message: string, context?: LogContext) {
    this.winston.warn(this.formatMessage(message, context));
  }

  info(message: string, context?: LogContext) {
    this.winston.info(this.formatMessage(message, context));
  }

  debug(message: string, context?: LogContext) {
    this.winston.debug(this.formatMessage(message, context));
  }

  // Business event logging
  logBusinessEvent(event: string, data: any, context?: LogContext) {
    this.info(`Business Event: ${event}`, {
      ...context,
      eventType: 'business',
      eventName: event,
      eventData: data
    });
  }

  // Performance logging
  logPerformance(operation: string, duration: number, context?: LogContext) {
    this.info(`Performance: ${operation}`, {
      ...context,
      eventType: 'performance',
      operation,
      duration,
      slow: duration > 1000
    });
  }

  // Security event logging
  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: LogContext) {
    this.warn(`Security Event: ${event}`, {
      ...context,
      eventType: 'security',
      securityEvent: event,
      severity
    });
  }
}

export const logger = new Logger();
```

### Request Context Middleware
```typescript
// src/lib/requestContext.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  ip: string;
  startTime: number;
}

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  const startTime = Date.now();

  req.context = {
    requestId,
    userId: req.user?.id,
    sessionId: req.sessionID,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    startTime
  };

  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  logger.info('Request started', {
    method: req.method,
    url: req.url,
    ...req.context
  });

  // Log request completion
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ...req.context
    });
  });

  next();
};
```

## Performance Monitoring

### Custom Metrics Collection
```typescript
// src/lib/metrics.ts
interface MetricData {
  name: string;
  value: number;
  unit: 'ms' | 'count' | 'bytes' | 'percent';
  tags?: Record<string, string>;
  timestamp?: Date;
}

class MetricsCollector {
  private metrics: MetricData[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor() {
    // Flush metrics every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 30000);
  }

  record(metric: MetricData) {
    this.metrics.push({
      ...metric,
      timestamp: metric.timestamp || new Date()
    });
  }

  // Time a function execution
  async time<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.record({
        name: `${name}.duration`,
        value: Date.now() - start,
        unit: 'ms',
        tags: { ...tags, status: 'success' }
      });
      return result;
    } catch (error) {
      this.record({
        name: `${name}.duration`,
        value: Date.now() - start,
        unit: 'ms',
        tags: { ...tags, status: 'error' }
      });
      throw error;
    }
  }

  // Count occurrences
  increment(name: string, value: number = 1, tags?: Record<string, string>) {
    this.record({
      name,
      value,
      unit: 'count',
      tags
    });
  }

  // Record gauge values
  gauge(name: string, value: number, unit: MetricData['unit'] = 'count', tags?: Record<string, string>) {
    this.record({
      name,
      value,
      unit,
      tags
    });
  }

  private async flush() {
    if (this.metrics.length === 0) return;

    const metricsToFlush = [...this.metrics];
    this.metrics = [];

    try {
      // Send metrics to monitoring service
      await this.sendMetrics(metricsToFlush);
    } catch (error) {
      logger.error('Failed to flush metrics', error);
      // Re-add metrics for retry
      this.metrics.unshift(...metricsToFlush);
    }
  }

  private async sendMetrics(metrics: MetricData[]) {
    // Send to monitoring service (DataDog, New Relic, etc.)
    if (process.env.DATADOG_API_KEY) {
      await this.sendToDataDog(metrics);
    }
    
    // Also log for local development
    if (config.isDevelopment) {
      metrics.forEach(metric => {
        logger.debug('Metric recorded', metric);
      });
    }
  }

  private async sendToDataDog(metrics: MetricData[]) {
    const payload = {
      series: metrics.map(metric => ({
        metric: `hallucifix.${metric.name}`,
        points: [[Math.floor(metric.timestamp!.getTime() / 1000), metric.value]],
        tags: metric.tags ? Object.entries(metric.tags).map(([k, v]) => `${k}:${v}`) : [],
        type: metric.unit === 'count' ? 'count' : 'gauge'
      }))
    };

    const response = await fetch('https://api.datadoghq.com/api/v1/series', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': process.env.DATADOG_API_KEY!
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`DataDog API error: ${response.statusText}`);
    }
  }
}

export const metrics = new MetricsCollector();
```

### Business Metrics Tracking
```typescript
// src/lib/businessMetrics.ts
import { metrics } from './metrics';
import { logger } from './logger';

export class BusinessMetrics {
  // User engagement metrics
  static trackUserAction(action: string, userId: string, metadata?: any) {
    metrics.increment('user.action', 1, {
      action,
      userId: userId.substring(0, 8) // Partial ID for privacy
    });

    logger.logBusinessEvent('user_action', {
      action,
      userId,
      ...metadata
    });
  }

  // Analysis metrics
  static trackAnalysis(type: 'single' | 'batch', accuracy: number, riskLevel: string, userId: string) {
    metrics.increment('analysis.completed', 1, {
      type,
      riskLevel,
      accuracyBucket: this.getAccuracyBucket(accuracy)
    });

    metrics.gauge('analysis.accuracy', accuracy, 'percent', {
      type,
      riskLevel
    });

    logger.logBusinessEvent('analysis_completed', {
      type,
      accuracy,
      riskLevel,
      userId
    });
  }

  // Performance metrics
  static trackApiCall(endpoint: string, method: string, statusCode: number, duration: number) {
    metrics.increment('api.requests', 1, {
      endpoint: endpoint.replace(/\/\d+/g, '/:id'), // Normalize IDs
      method,
      status: statusCode.toString()
    });

    metrics.record({
      name: 'api.response_time',
      value: duration,
      unit: 'ms',
      tags: {
        endpoint: endpoint.replace(/\/\d+/g, '/:id'),
        method,
        status: statusCode.toString()
      }
    });
  }

  // Error metrics
  static trackError(error: Error, context: any) {
    metrics.increment('errors.count', 1, {
      errorType: error.name,
      errorMessage: error.message.substring(0, 100)
    });

    logger.error('Application error', error, context);
  }

  // Conversion metrics
  static trackConversion(event: string, userId: string, value?: number) {
    metrics.increment('conversion.events', 1, {
      event,
      hasValue: value !== undefined ? 'true' : 'false'
    });

    if (value !== undefined) {
      metrics.gauge('conversion.value', value, 'count', { event });
    }

    logger.logBusinessEvent('conversion', {
      event,
      userId,
      value
    });
  }

  private static getAccuracyBucket(accuracy: number): string {
    if (accuracy >= 90) return '90-100';
    if (accuracy >= 80) return '80-89';
    if (accuracy >= 70) return '70-79';
    return '0-69';
  }
}
```

## Error Tracking Integration

### Sentry Configuration
```typescript
// src/lib/errorTracking.ts
import * as Sentry from '@sentry/react';
import { Integrations } from '@sentry/tracing';
import { config } from './env';

export const initErrorTracking = () => {
  if (!config.hasSentry) {
    console.warn('Sentry DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.VITE_SENTRY_DSN,
    environment: config.isDevelopment ? 'development' : 'production',
    integrations: [
      new Integrations.BrowserTracing({
        // Capture interactions and navigation
        routingInstrumentation: Sentry.reactRouterV6Instrumentation(
          React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes
        ),
      }),
    ],
    tracesSampleRate: config.isDevelopment ? 1.0 : 0.1,
    beforeSend(event, hint) {
      // Filter out non-critical errors in production
      if (!config.isDevelopment) {
        const error = hint.originalException;
        
        // Skip network errors that are likely user-related
        if (error instanceof Error && error.message.includes('NetworkError')) {
          return null;
        }
        
        // Skip cancelled requests
        if (error instanceof Error && error.name === 'AbortError') {
          return null;
        }
      }
      
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Filter sensitive data from breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
        return null; // Skip console.log breadcrumbs
      }
      
      return breadcrumb;
    }
  });

  // Set user context when available
  Sentry.setUser({
    id: 'user-id', // Will be set dynamically
    email: 'user-email' // Will be set dynamically
  });
};

export const reportError = (error: Error, context?: any) => {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('additional', context);
    }
    Sentry.captureException(error);
  });
};

export const reportMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  Sentry.captureMessage(message, level);
};
```

## Health Monitoring

### Health Check Endpoints
```typescript
// src/lib/healthCheck.ts
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
      duration?: number;
    };
  };
  timestamp: string;
  version: string;
}

export class HealthChecker {
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    
    // Database connectivity check
    checks.database = await this.checkDatabase();
    
    // External services check
    checks.openai = await this.checkOpenAI();
    checks.supabase = await this.checkSupabase();
    
    // Memory usage check
    checks.memory = await this.checkMemoryUsage();
    
    // Disk space check (if applicable)
    checks.disk = await this.checkDiskSpace();

    const overallStatus = this.determineOverallStatus(checks);

    return {
      status: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      version: config.appVersion
    };
  }

  private async checkDatabase(): Promise<HealthCheckResult['checks']['database']> {
    const start = Date.now();
    try {
      const { error } = await supabase
        .from('users')
        .select('count')
        .limit(1);
        
      if (error) throw error;
      
      return {
        status: 'pass',
        duration: Date.now() - start
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Database check failed',
        duration: Date.now() - start
      };
    }
  }

  private async checkOpenAI(): Promise<HealthCheckResult['checks']['openai']> {
    if (!config.hasOpenAI) {
      return { status: 'pass', message: 'OpenAI not configured (using mocks)' };
    }

    const start = Date.now();
    try {
      // Simple API call to check connectivity
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
      });

      if (!response.ok) throw new Error(`OpenAI API returned ${response.status}`);

      return {
        status: 'pass',
        duration: Date.now() - start
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'OpenAI check failed',
        duration: Date.now() - start
      };
    }
  }

  private async checkSupabase(): Promise<HealthCheckResult['checks']['supabase']> {
    const start = Date.now();
    try {
      const { error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      return {
        status: 'pass',
        duration: Date.now() - start
      };
    } catch (error) {
      return {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Supabase check failed',
        duration: Date.now() - start
      };
    }
  }

  private async checkMemoryUsage(): Promise<HealthCheckResult['checks']['memory']> {
    if (typeof process === 'undefined') {
      return { status: 'pass', message: 'Memory check not available in browser' };
    }

    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;

    if (usagePercent > 90) {
      return {
        status: 'fail',
        message: `High memory usage: ${usagePercent.toFixed(1)}%`
      };
    }

    return {
      status: 'pass',
      message: `Memory usage: ${usagePercent.toFixed(1)}%`
    };
  }

  private async checkDiskSpace(): Promise<HealthCheckResult['checks']['disk']> {
    // This would typically check disk space on the server
    // For now, we'll just return a pass
    return { status: 'pass', message: 'Disk space check not implemented' };
  }

  private determineOverallStatus(checks: HealthCheckResult['checks']): HealthCheckResult['status'] {
    const statuses = Object.values(checks).map(check => check.status);
    
    if (statuses.every(status => status === 'pass')) {
      return 'healthy';
    }
    
    if (statuses.some(status => status === 'fail')) {
      // Check if critical services are failing
      const criticalServices = ['database', 'supabase'];
      const criticalFailures = criticalServices.some(service => 
        checks[service]?.status === 'fail'
      );
      
      return criticalFailures ? 'unhealthy' : 'degraded';
    }
    
    return 'degraded';
  }
}

export const healthChecker = new HealthChecker();
```

## Alerting Configuration

### Alert Rules
```typescript
// src/lib/alerting.ts
interface AlertRule {
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: ('email' | 'slack' | 'pagerduty')[];
  cooldown: number; // minutes
}

const alertRules: AlertRule[] = [
  {
    name: 'High Error Rate',
    condition: (metrics) => metrics.errorRate > 0.05, // 5% error rate
    severity: 'high',
    channels: ['email', 'slack'],
    cooldown: 15
  },
  {
    name: 'Slow Response Time',
    condition: (metrics) => metrics.avgResponseTime > 2000, // 2 seconds
    severity: 'medium',
    channels: ['slack'],
    cooldown: 30
  },
  {
    name: 'Database Connection Failure',
    condition: (metrics) => metrics.dbConnectionFailures > 0,
    severity: 'critical',
    channels: ['email', 'slack', 'pagerduty'],
    cooldown: 5
  },
  {
    name: 'High Memory Usage',
    condition: (metrics) => metrics.memoryUsage > 0.9, // 90%
    severity: 'medium',
    channels: ['slack'],
    cooldown: 60
  }
];

export class AlertManager {
  private lastAlertTimes = new Map<string, number>();

  async checkAlerts(metrics: any) {
    for (const rule of alertRules) {
      if (rule.condition(metrics)) {
        await this.triggerAlert(rule, metrics);
      }
    }
  }

  private async triggerAlert(rule: AlertRule, metrics: any) {
    const now = Date.now();
    const lastAlert = this.lastAlertTimes.get(rule.name) || 0;
    const cooldownMs = rule.cooldown * 60 * 1000;

    // Check cooldown period
    if (now - lastAlert < cooldownMs) {
      return;
    }

    this.lastAlertTimes.set(rule.name, now);

    const alert = {
      rule: rule.name,
      severity: rule.severity,
      timestamp: new Date().toISOString(),
      metrics,
      message: this.generateAlertMessage(rule, metrics)
    };

    // Send to configured channels
    for (const channel of rule.channels) {
      await this.sendAlert(channel, alert);
    }

    // Log the alert
    logger.warn('Alert triggered', alert);
  }

  private generateAlertMessage(rule: AlertRule, metrics: any): string {
    switch (rule.name) {
      case 'High Error Rate':
        return `Error rate is ${(metrics.errorRate * 100).toFixed(2)}% (threshold: 5%)`;
      case 'Slow Response Time':
        return `Average response time is ${metrics.avgResponseTime}ms (threshold: 2000ms)`;
      case 'Database Connection Failure':
        return `Database connection failures detected: ${metrics.dbConnectionFailures}`;
      case 'High Memory Usage':
        return `Memory usage is ${(metrics.memoryUsage * 100).toFixed(1)}% (threshold: 90%)`;
      default:
        return `Alert condition met for ${rule.name}`;
    }
  }

  private async sendAlert(channel: string, alert: any) {
    switch (channel) {
      case 'email':
        await this.sendEmailAlert(alert);
        break;
      case 'slack':
        await this.sendSlackAlert(alert);
        break;
      case 'pagerduty':
        await this.sendPagerDutyAlert(alert);
        break;
    }
  }

  private async sendEmailAlert(alert: any) {
    // Implement email alerting
    logger.info('Email alert sent', alert);
  }

  private async sendSlackAlert(alert: any) {
    if (!process.env.SLACK_WEBHOOK_URL) return;

    const payload = {
      text: `🚨 ${alert.severity.toUpperCase()} Alert: ${alert.rule}`,
      attachments: [
        {
          color: this.getSeverityColor(alert.severity),
          fields: [
            {
              title: 'Message',
              value: alert.message,
              short: false
            },
            {
              title: 'Timestamp',
              value: alert.timestamp,
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true
            }
          ]
        }
      ]
    };

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  private async sendPagerDutyAlert(alert: any) {
    // Implement PagerDuty integration
    logger.info('PagerDuty alert sent', alert);
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return '#ffeb3b';
      case 'low': return 'good';
      default: return '#2196f3';
    }
  }
}

export const alertManager = new AlertManager();
```

## Testing Strategy

### Logging Tests
```typescript
// src/lib/__tests__/logger.test.ts
import { logger } from '../logger';

describe('Logger', () => {
  it('should log structured messages', () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    logger.info('Test message', { userId: 'test-user' });
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Test message"')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"userId":"test-user"')
    );
  });

  it('should include error stack traces', () => {
    const consoleSpy = jest.spyOn(console, 'error');
    const error = new Error('Test error');
    
    logger.error('Error occurred', error);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"stack"')
    );
  });
});
```

### Metrics Tests
```typescript
// src/lib/__tests__/metrics.test.ts
import { metrics } from '../metrics';

describe('Metrics', () => {
  it('should record metrics with correct format', () => {
    const metric = {
      name: 'test.metric',
      value: 100,
      unit: 'ms' as const,
      tags: { test: 'true' }
    };
    
    metrics.record(metric);
    
    // Verify metric was recorded (implementation depends on storage)
    expect(metrics['metrics']).toContainEqual(
      expect.objectContaining(metric)
    );
  });

  it('should time function execution', async () => {
    const result = await metrics.time('test.operation', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'success';
    });
    
    expect(result).toBe('success');
    // Verify timing metric was recorded
  });
});
```

## Success Metrics

### Observability Targets
- [ ] 100% error capture and reporting
- [ ] < 1 second log ingestion latency
- [ ] 99.9% monitoring system uptime
- [ ] < 5 minute alert response time
- [ ] 100% critical system coverage

### Performance Targets
- [ ] Log processing < 10ms overhead
- [ ] Metrics collection < 5ms overhead
- [ ] Health check response < 100ms
- [ ] Alert delivery < 30 seconds
- [ ] Dashboard load time < 2 seconds

### Quality Targets
- [ ] Zero false positive alerts
- [ ] 100% alert acknowledgment
- [ ] < 1% log data loss
- [ ] 99% metric accuracy
- [ ] Complete audit trail coverage

## Documentation Requirements

- [ ] Logging standards and guidelines
- [ ] Monitoring runbook and procedures
- [ ] Alert response playbooks
- [ ] Troubleshooting guides
- [ ] Performance baseline documentation