import { Context } from 'aws-lambda';

// Import types and interfaces for Lambda logging
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

/**
 * Simple structured logger for Lambda functions
 */
class SimpleStructuredLogger {
  private context: LogContext;

  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      service: 'hallucifix-lambda',
      version: process.env.AWS_LAMBDA_FUNCTION_VERSION || '$LATEST',
      environment: process.env.NODE_ENV || 'production',
      ...context
    };
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, LogCategory.APPLICATION, message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, LogCategory.APPLICATION, message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, LogCategory.APPLICATION, message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : undefined;

    this.log(LogLevel.ERROR, LogCategory.APPLICATION, message, metadata, errorInfo);
  }

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

    console.log(JSON.stringify(logEntry));
  }

  security(
    eventType: string,
    message: string,
    securityData: {
      action?: string;
      result?: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
      riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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

    console.log(JSON.stringify(logEntry));
  }

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

    console.log(JSON.stringify(logEntry));
  }

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

    console.log(JSON.stringify(logEntry));
  }
}

function createLogger(context: Partial<LogContext>): SimpleStructuredLogger {
  return new SimpleStructuredLogger(context);
}

/**
 * Lambda-specific structured logger
 */
export class LambdaLogger {
  private logger;
  private context: Context;

  constructor(context: Context, functionName?: string) {
    this.context = context;
    this.logger = createLogger({
      service: functionName || context.functionName,
      requestId: context.awsRequestId,
      environment: process.env.NODE_ENV || 'production',
      version: process.env.AWS_LAMBDA_FUNCTION_VERSION || '$LATEST',
      correlationId: context.awsRequestId
    });
  }

  /**
   * Log function start
   */
  logStart(event: any): void {
    this.logger.info('Lambda function started', {
      functionName: this.context.functionName,
      functionVersion: this.context.functionVersion,
      memoryLimitInMB: this.context.memoryLimitInMB,
      remainingTimeInMillis: this.context.getRemainingTimeInMillis(),
      eventSourceType: typeof event,
      hasEvent: !!event
    });
  }

  /**
   * Log function completion
   */
  logComplete(result: any, duration: number): void {
    this.logger.info('Lambda function completed', {
      functionName: this.context.functionName,
      duration,
      remainingTimeInMillis: this.context.getRemainingTimeInMillis(),
      resultType: typeof result,
      hasResult: !!result
    });
  }

  /**
   * Log function error
   */
  logError(error: Error, duration: number): void {
    this.logger.error('Lambda function failed', error, {
      functionName: this.context.functionName,
      duration,
      remainingTimeInMillis: this.context.getRemainingTimeInMillis(),
      errorType: error.constructor.name
    });
  }

  /**
   * Log cold start
   */
  logColdStart(): void {
    this.logger.performance('Lambda cold start detected', {
      duration: 0 // Will be measured by caller
    }, {
      functionName: this.context.functionName,
      functionVersion: this.context.functionVersion,
      memoryLimitInMB: this.context.memoryLimitInMB
    });
  }

  /**
   * Log business event
   */
  logBusinessEvent(eventType: string, details: Record<string, any>): void {
    this.logger.business(eventType, `Business event: ${eventType}`, {
      eventType,
      action: details.action,
      result: details.result,
      entityId: details.entityId,
      entityType: details.entityType
    }, details);
  }

  /**
   * Log security event
   */
  logSecurityEvent(eventType: string, riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', details: Record<string, any>): void {
    this.logger.security(eventType, `Security event: ${eventType}`, {
      action: eventType,
      result: details.result || 'DETECTED',
      riskLevel
    }, details);
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation: string, duration: number, metrics?: Record<string, any>): void {
    this.logger.performance(`Performance: ${operation}`, {
      duration,
      memoryUsage: process.memoryUsage().heapUsed
    }, {
      ...metrics,
      functionName: this.context.functionName,
      remainingTimeInMillis: this.context.getRemainingTimeInMillis()
    });
  }

  /**
   * Get underlying logger for direct access
   */
  getLogger() {
    return this.logger;
  }

  // Delegate basic logging methods
  debug(message: string, metadata?: Record<string, any>): void {
    this.logger.debug(message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.logger.info(message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.logger.warn(message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.logger.error(message, error, metadata);
  }
}

/**
 * Lambda wrapper with automatic logging
 */
export function withLogging<TEvent = any, TResult = any>(
  handler: (event: TEvent, context: Context, logger: LambdaLogger) => Promise<TResult>
) {
  return async (event: TEvent, context: Context): Promise<TResult> => {
    const logger = new LambdaLogger(context);
    const startTime = Date.now();
    
    // Check for cold start
    if (!global.lambdaInitialized) {
      logger.logColdStart();
      global.lambdaInitialized = true;
    }
    
    logger.logStart(event);
    
    try {
      const result = await handler(event, context, logger);
      const duration = Date.now() - startTime;
      logger.logComplete(result, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logError(error as Error, duration);
      throw error;
    }
  };
}

/**
 * Create a timer for Lambda performance logging
 */
export function createLambdaTimer(logger: LambdaLogger, operation: string) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  
  return {
    end: (metadata?: Record<string, any>) => {
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = endMemory - startMemory;
      
      logger.logPerformance(operation, duration, {
        ...metadata,
        memoryDelta
      });
    }
  };
}

// Global flag for cold start detection
declare global {
  var lambdaInitialized: boolean | undefined;
}