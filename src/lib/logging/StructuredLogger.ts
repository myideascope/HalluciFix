/**
 * Structured Logger Implementation
 * Provides JSON-formatted logging with contextual information and configurable levels
 */

import { LogLevel, LogEntry, LogContext, LoggerConfig, ExternalLogService } from './types';

class StructuredLogger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private externalService?: ExternalLogService;

  constructor(loggerConfig?: Partial<LoggerConfig>) {
    this.config = {
      serviceName: 'HalluciFix',
      version: '1.0.0',
      environment: import.meta.env.MODE || 'development',
      logLevel: (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'info',
      enableConsole: true,
      enableExternalService: false,
      sanitizeFields: ['password', 'token', 'apiKey', 'secret', 'authorization'],
      ...loggerConfig,
    };

    // Start flush interval for external service
    if (this.config.enableExternalService) {
      this.flushInterval = setInterval(() => {
        this.flushLogs();
      }, 30000); // Flush every 30 seconds
    }
  }

  /**
   * Create a log entry with consistent structure
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context: LogContext = {},
    error?: Error
  ): LogEntry {
    const sanitizedContext = this.sanitizeContext(context);

    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.serviceName,
      version: this.config.version,
      environment: this.config.environment,
      context: sanitizedContext,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack || '',
      } : undefined,
    };
  }

  /**
   * Remove sensitive information from context
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized = { ...context };
    
    this.config.sanitizeFields.forEach(key => {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Output log entry to console and/or external service
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    // Console output
    if (this.config.enableConsole) {
      if (this.config.environment === 'development') {
        // Pretty format for development
        console.log(JSON.stringify(entry, null, 2));
      } else {
        // Single line JSON for production
        console.log(JSON.stringify(entry));
      }
    }

    // Buffer for external service
    if (this.config.enableExternalService) {
      this.logBuffer.push(entry);
    }
  }

  /**
   * Send buffered logs to external service
   */
  private async sendToExternalService(entries: LogEntry[]): Promise<void> {
    if (!this.config.externalService?.endpoint) {
      return;
    }

    try {
      await fetch(this.config.externalService.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.externalService.apiKey}`,
        },
        body: JSON.stringify({ entries }),
      });
    } catch (error) {
      // Fallback to console if external service fails
      console.error('Failed to send logs to external service:', error);
      entries.forEach(entry => {
        console.log(JSON.stringify(entry));
      });
    }
  }

  /**
   * Flush buffered logs to external service
   */
  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      if (this.externalService) {
        await this.externalService.sendLogs(logsToFlush);
      } else {
        await this.sendToExternalService(logsToFlush);
      }
    } catch (error) {
      // Re-add logs to buffer for retry
      this.logBuffer.unshift(...logsToFlush);
      console.error('Failed to flush logs:', error);
    }
  }

  /**
   * Set external log service
   */
  setExternalService(service: ExternalLogService): void {
    this.externalService = service;
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext): void {
    const entry = this.createLogEntry('debug', message, context);
    this.output(entry);
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext): void {
    const entry = this.createLogEntry('info', message, context);
    this.output(entry);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext): void {
    const entry = this.createLogEntry('warn', message, context);
    this.output(entry);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error, context?: LogContext): void {
    const entry = this.createLogEntry('error', message, context, error);
    this.output(entry);
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger(this.config);
    
    // Override output method to include additional context
    const originalOutput = childLogger.output.bind(childLogger);
    childLogger.output = (entry: LogEntry) => {
      entry.context = { ...additionalContext, ...entry.context };
      originalOutput(entry);
    };

    return childLogger;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Flush remaining logs
    if (this.logBuffer.length > 0) {
      this.flushLogs();
    }
  }
}

// Export singleton instance
export const logger = new StructuredLogger();

// Export class for custom instances
export { StructuredLogger };