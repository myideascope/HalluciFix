import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL'
}

export enum LogCategory {
  APPLICATION = 'APPLICATION',
  BUSINESS = 'BUSINESS',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  AUDIT = 'AUDIT'
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  service?: string;
  version?: string;
  environment?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context: LogContext;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    duration?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  business?: {
    eventType?: string;
    entityId?: string;
    entityType?: string;
    action?: string;
    result?: string;
    metrics?: Record<string, number>;
  };
}

export class StructuredLogger {
  private context: LogContext;
  private logGroupName: string;

  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      service: 'hallucifix',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      ...context
    };

    // Determine log group based on environment
    const env = process.env.NODE_ENV || 'development';
    this.logGroupName = `/hallucifix/${env}/application`;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext
    });
  }

  /**
   * Set correlation ID for request tracing
   */
  withCorrelationId(correlationId: string): StructuredLogger {
    return this.child({ correlationId });
  }

  /**
   * Set request ID for request tracking
   */
  withRequestId(requestId: string): StructuredLogger {
    return this.child({ requestId });
  }

  /**
   * Set user context
   */
  withUser(userId: string, sessionId?: string): StructuredLogger {
    return this.child({ userId, sessionId });
  }

  /**
   * Debug level logging
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, LogCategory.APPLICATION, message, metadata);
  }

  /**
   * Info level logging
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, LogCategory.APPLICATION, message, metadata);
  }

  /**
   * Warning level logging
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, LogCategory.APPLICATION, message, metadata);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : undefined;

    this.log(LogLevel.ERROR, LogCategory.APPLICATION, message, metadata, errorInfo);
  }

  /**
   * Fatal level logging
   */
  fatal(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : undefined;

    this.log(LogLevel.FATAL, LogCategory.APPLICATION, message, metadata, errorInfo);
  }

  /**
   * Business event logging
   */
  business(
    eventType: string,
    message: string,
    businessData: {
      entityId?: string;
      entityType?: string;
      action?: string;
      result?: string;
      metrics?: Record<string, number>;
    },
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category: LogCategory.BUSINESS,
      message,
      context: this.context,
      metadata,
      business: {
        eventType,
        ...businessData
      }
    };

    this.writeLog(logEntry, '/hallucifix/' + (process.env.NODE_ENV || 'development') + '/business');
  }

  /**
   * Security event logging
   */
  security(
    eventType: string,
    message: string,
    securityData: {
      action?: string;
      result?: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
      riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      ipAddress?: string;
      userAgent?: string;
    },
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category: LogCategory.SECURITY,
      message,
      context: this.context,
      metadata: {
        ...metadata,
        ...securityData,
        eventType
      }
    };

    this.writeLog(logEntry, '/hallucifix/' + (process.env.NODE_ENV || 'development') + '/security');
  }

  /**
   * Performance logging
   */
  performance(
    message: string,
    performanceData: {
      duration?: number;
      memoryUsage?: number;
      cpuUsage?: number;
    },
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category: LogCategory.PERFORMANCE,
      message,
      context: this.context,
      metadata,
      performance: performanceData
    };

    this.writeLog(logEntry);
  }

  /**
   * Audit logging
   */
  audit(
    action: string,
    message: string,
    auditData: {
      entityId?: string;
      entityType?: string;
      oldValue?: any;
      newValue?: any;
      result?: 'SUCCESS' | 'FAILURE';
    },
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category: LogCategory.AUDIT,
      message,
      context: this.context,
      metadata: {
        ...metadata,
        action,
        ...auditData
      }
    };

    this.writeLog(logEntry);
  }

  /**
   * Generic log method
   */
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    metadata?: Record<string, any>,
    error?: LogEntry['error']
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      context: this.context,
      metadata,
      error
    };

    this.writeLog(logEntry);
  }

  /**
   * Write log entry to appropriate destination
   */
  private writeLog(logEntry: LogEntry, customLogGroup?: string): void {
    const logString = JSON.stringify(logEntry);

    // In development, also log to console for debugging
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = this.getConsoleMethod(logEntry.level);
      consoleMethod(logString);
    }

    // In production, send to CloudWatch Logs
    if (process.env.NODE_ENV === 'production') {
      this.sendToCloudWatch(logEntry, customLogGroup || this.logGroupName);
    }

    // Send to external logging service if configured
    if (process.env.EXTERNAL_LOG_ENDPOINT) {
      this.sendToExternalService(logEntry);
    }
  }

  /**
   * Get appropriate console method for log level
   */
  private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * Send log to CloudWatch Logs (placeholder for AWS SDK implementation)
   */
  private async sendToCloudWatch(logEntry: LogEntry, logGroupName: string): Promise<void> {
    try {
      // This would be implemented with AWS CloudWatch Logs SDK
      // For now, we'll use console.log as a placeholder
      if (typeof window === 'undefined') {
        // Server-side logging
        console.log(`[CloudWatch:${logGroupName}]`, JSON.stringify(logEntry));
      }
    } catch (error) {
      console.error('Failed to send log to CloudWatch:', error);
    }
  }

  /**
   * Send log to external logging service
   */
  private async sendToExternalService(logEntry: LogEntry): Promise<void> {
    try {
      if (process.env.EXTERNAL_LOG_ENDPOINT) {
        // Implementation for external logging service (e.g., Datadog, New Relic)
        await fetch(process.env.EXTERNAL_LOG_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXTERNAL_LOG_API_KEY}`
          },
          body: JSON.stringify(logEntry)
        });
      }
    } catch (error) {
      console.error('Failed to send log to external service:', error);
    }
  }

  /**
   * Create a timer for performance logging
   */
  timer(label: string): {
    end: (metadata?: Record<string, any>) => void;
  } {
    const startTime = Date.now();
    const startMemory = process.memoryUsage?.()?.heapUsed || 0;

    return {
      end: (metadata?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        const endMemory = process.memoryUsage?.()?.heapUsed || 0;
        const memoryDelta = endMemory - startMemory;

        this.performance(`Timer: ${label}`, {
          duration,
          memoryUsage: memoryDelta
        }, metadata);
      }
    };
  }

  /**
   * Log HTTP request/response
   */
  httpRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : 
                 statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;

    this.log(level, LogCategory.APPLICATION, `HTTP ${method} ${url}`, {
      ...metadata,
      httpMethod: method,
      httpUrl: url,
      httpStatusCode: statusCode,
      httpDuration: duration
    });
  }

  /**
   * Log database query
   */
  dbQuery(
    query: string,
    duration: number,
    rowCount?: number,
    metadata?: Record<string, any>
  ): void {
    this.performance('Database Query', {
      duration
    }, {
      ...metadata,
      query: query.substring(0, 1000), // Truncate long queries
      rowCount
    });
  }
}

// Export singleton instance
export const logger = new StructuredLogger();

// Export factory function for creating loggers with context
export function createLogger(context: Partial<LogContext>): StructuredLogger {
  return new StructuredLogger(context);
}

// Export middleware for Express.js
export function loggingMiddleware() {
  return (req: any, res: any, next: any) => {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // Add logger to request object
    req.logger = logger.withRequestId(requestId);
    
    // Log incoming request
    req.logger.info('Incoming HTTP request', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - startTime;
      req.logger.httpRequest(req.method, req.url, res.statusCode, duration);
      originalEnd.apply(res, args);
    };

    next();
  };
}