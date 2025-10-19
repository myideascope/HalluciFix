/**
 * Structured Error Logging System
 * Provides comprehensive structured logging with multiple output formats and destinations
 */

import { ApiError, ErrorContext, ErrorSeverity, ErrorType } from './types';

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Structured log entry
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  errorId?: string;
  errorType?: ErrorType;
  severity?: ErrorSeverity;
  component?: string;
  feature?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  statusCode?: number;
  duration?: number;
  stackTrace?: string;
  context: Record<string, any>;
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * Log output destination
 */
export interface LogDestination {
  name: string;
  enabled: boolean;
  minLevel: LogLevel;
  format: 'json' | 'text' | 'structured';
  write: (entry: StructuredLogEntry) => Promise<void> | void;
}

/**
 * Structured logger configuration
 */
export interface StructuredLoggerConfig {
  enableConsoleLogging: boolean;
  enableLocalStorage: boolean;
  enableRemoteLogging: boolean;
  maxLocalEntries: number;
  batchSize: number;
  flushInterval: number;
  defaultTags: string[];
  sensitiveFields: string[];
  remoteEndpoint?: string;
  apiKey?: string;
}

/**
 * Log formatter interface
 */
export interface LogFormatter {
  format(entry: StructuredLogEntry): string;
}

/**
 * JSON log formatter
 */
export class JsonLogFormatter implements LogFormatter {
  format(entry: StructuredLogEntry): string {
    return JSON.stringify(entry, null, 0);
  }
}

/**
 * Text log formatter
 */
export class TextLogFormatter implements LogFormatter {
  format(entry: StructuredLogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const component = entry.component ? `[${entry.component}]` : '';
    const errorId = entry.errorId ? `(${entry.errorId})` : '';
    
    return `${timestamp} ${level} ${component}${errorId} ${entry.message}`;
  }
}

/**
 * Structured log formatter with key-value pairs
 */
export class StructuredTextFormatter implements LogFormatter {
  format(entry: StructuredLogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase();
    
    const fields: string[] = [
      `timestamp="${timestamp}"`,
      `level="${level}"`,
      `message="${entry.message}"`
    ];

    if (entry.errorId) fields.push(`errorId="${entry.errorId}"`);
    if (entry.errorType) fields.push(`errorType="${entry.errorType}"`);
    if (entry.severity) fields.push(`severity="${entry.severity}"`);
    if (entry.component) fields.push(`component="${entry.component}"`);
    if (entry.feature) fields.push(`feature="${entry.feature}"`);
    if (entry.userId) fields.push(`userId="${entry.userId}"`);
    if (entry.statusCode) fields.push(`statusCode="${entry.statusCode}"`);
    if (entry.duration) fields.push(`duration="${entry.duration}ms"`);
    if (entry.tags.length > 0) fields.push(`tags="${entry.tags.join(',')}"`);

    return fields.join(' ');
  }
}

/**
 * Console log destination
 */
export class ConsoleLogDestination implements LogDestination {
  name = 'console';
  enabled = true;
  minLevel = LogLevel.INFO;
  format: 'json' | 'text' | 'structured' = 'text';
  private formatter: LogFormatter;

  constructor(format: 'json' | 'text' | 'structured' = 'text') {
    this.format = format;
    this.formatter = this.createFormatter(format);
  }

  write(entry: StructuredLogEntry): void {
    const formatted = this.formatter.format(entry);
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formatted);
        break;
    }
  }

  private createFormatter(format: string): LogFormatter {
    switch (format) {
      case 'json':
        return new JsonLogFormatter();
      case 'structured':
        return new StructuredTextFormatter();
      default:
        return new TextLogFormatter();
    }
  }
}

/**
 * Local storage log destination
 */
export class LocalStorageLogDestination implements LogDestination {
  name = 'localStorage';
  enabled = true;
  minLevel = LogLevel.WARN;
  format: 'json' | 'text' | 'structured' = 'json';
  private storageKey: string;
  private maxEntries: number;

  constructor(storageKey = 'hallucifix_error_logs', maxEntries = 100) {
    this.storageKey = storageKey;
    this.maxEntries = maxEntries;
  }

  write(entry: StructuredLogEntry): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const existing = this.getExistingLogs();
      existing.push(entry);

      // Keep only the most recent entries
      const trimmed = existing.slice(-this.maxEntries);
      
      localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to write to localStorage:', error);
    }
  }

  private getExistingLogs(): StructuredLogEntry[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to read from localStorage:', error);
      return [];
    }
  }

  getLogs(): StructuredLogEntry[] {
    return this.getExistingLogs();
  }

  clearLogs(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKey);
    }
  }
}

/**
 * Remote log destination
 */
export class RemoteLogDestination implements LogDestination {
  name = 'remote';
  enabled = false;
  minLevel = LogLevel.ERROR;
  format: 'json' | 'text' | 'structured' = 'json';
  private endpoint: string;
  private apiKey?: string;
  private batchBuffer: StructuredLogEntry[] = [];
  private batchSize: number;
  private flushTimer?: NodeJS.Timeout;

  constructor(endpoint: string, apiKey?: string, batchSize = 10) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.batchSize = batchSize;
  }

  write(entry: StructuredLogEntry): void {
    this.batchBuffer.push(entry);

    if (this.batchBuffer.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      // Flush after 30 seconds if batch isn't full
      this.flushTimer = setTimeout(() => this.flush(), 30000);
    }
  }

  private async flush(): Promise<void> {
    if (this.batchBuffer.length === 0) return;

    const batch = [...this.batchBuffer];
    this.batchBuffer = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({ logs: batch })
      });

      if (!response.ok) {
        throw new Error(`Remote logging failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send logs to remote destination:', error);
      // Re-add to buffer for retry (with limit to prevent memory issues)
      if (this.batchBuffer.length < 1000) {
        this.batchBuffer.unshift(...batch);
      }
    }
  }
}

/**
 * Structured Logger
 * Main logging class that coordinates multiple destinations and formats
 */
export class StructuredLogger {
  private destinations: Map<string, LogDestination> = new Map();
  private config: StructuredLoggerConfig;
  private logBuffer: StructuredLogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<StructuredLoggerConfig> = {}) {
    this.config = {
      enableConsoleLogging: import.meta.env.MODE === 'development',
      enableLocalStorage: true,
      enableRemoteLogging: false,
      maxLocalEntries: 100,
      batchSize: 10,
      flushInterval: 30000,
      defaultTags: ['hallucifix'],
      sensitiveFields: ['password', 'token', 'apiKey', 'secret'],
      ...config
    };

    this.initializeDefaultDestinations();
    this.startFlushTimer();
  }

  /**
   * Add a log destination
   */
  addDestination(destination: LogDestination): void {
    this.destinations.set(destination.name, destination);
  }

  /**
   * Remove a log destination
   */
  removeDestination(name: string): void {
    this.destinations.delete(name);
  }

  /**
   * Log an error with full context
   */
  logError(error: ApiError, context: ErrorContext = {}): void {
    const entry = this.createLogEntry(
      LogLevel.ERROR,
      error.message,
      {
        errorId: error.errorId,
        errorType: error.type,
        severity: error.severity,
        statusCode: error.statusCode,
        stackTrace: context.stackTrace,
        ...context
      },
      ['error', error.type ? error.type.toLowerCase() : 'unknown']
    );

    this.writeToDestinations(entry);
  }

  /**
   * Log a warning
   */
  logWarning(message: string, context: Record<string, any> = {}, tags: string[] = []): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, context, ['warning', ...tags]);
    this.writeToDestinations(entry);
  }

  /**
   * Log information
   */
  logInfo(message: string, context: Record<string, any> = {}, tags: string[] = []): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, context, ['info', ...tags]);
    this.writeToDestinations(entry);
  }

  /**
   * Log debug information
   */
  logDebug(message: string, context: Record<string, any> = {}, tags: string[] = []): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, context, ['debug', ...tags]);
    this.writeToDestinations(entry);
  }

  /**
   * Log a fatal error
   */
  logFatal(message: string, context: Record<string, any> = {}, tags: string[] = []): void {
    const entry = this.createLogEntry(LogLevel.FATAL, message, context, ['fatal', ...tags]);
    this.writeToDestinations(entry);
  }

  /**
   * Create a structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context: Record<string, any> = {},
    tags: string[] = []
  ): StructuredLogEntry {
    // Sanitize sensitive fields
    const sanitizedContext = this.sanitizeContext(context);

    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      errorId: context.errorId,
      errorType: context.errorType,
      severity: context.severity,
      component: context.component,
      feature: context.feature,
      userId: context.userId,
      sessionId: context.sessionId,
      url: context.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      statusCode: context.statusCode,
      duration: context.duration,
      stackTrace: context.stackTrace,
      context: sanitizedContext,
      tags: [...this.config.defaultTags, ...tags],
      metadata: {
        timestamp: Date.now(),
        environment: import.meta.env.MODE || 'unknown',
        version: import.meta.env.VITE_APP_VERSION || 'unknown'
      }
    };
  }

  /**
   * Sanitize context to remove sensitive information
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized = { ...context };

    for (const field of this.config.sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Remove circular references and functions
    return JSON.parse(JSON.stringify(sanitized, (key, value) => {
      if (typeof value === 'function') return '[Function]';
      if (value instanceof Error) return value.message;
      return value;
    }));
  }

  /**
   * Write log entry to all applicable destinations
   */
  private writeToDestinations(entry: StructuredLogEntry): void {
    for (const destination of this.destinations.values()) {
      if (!destination.enabled) continue;

      // Check if entry level meets destination's minimum level
      if (!this.shouldWriteToDestination(entry.level, destination.minLevel)) {
        continue;
      }

      try {
        destination.write(entry);
      } catch (error) {
        console.error(`Failed to write to destination ${destination.name}:`, error);
      }
    }
  }

  /**
   * Check if log level meets minimum threshold
   */
  private shouldWriteToDestination(entryLevel: LogLevel, minLevel: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    const entryIndex = levels.indexOf(entryLevel);
    const minIndex = levels.indexOf(minLevel);
    return entryIndex >= minIndex;
  }

  /**
   * Initialize default log destinations
   */
  private initializeDefaultDestinations(): void {
    // Console destination
    if (this.config.enableConsoleLogging) {
      this.addDestination(new ConsoleLogDestination('text'));
    }

    // Local storage destination
    if (this.config.enableLocalStorage) {
      this.addDestination(new LocalStorageLogDestination('hallucifix_error_logs', this.config.maxLocalEntries));
    }

    // Remote destination (if configured)
    if (this.config.enableRemoteLogging && this.config.remoteEndpoint) {
      const remoteDestination = new RemoteLogDestination(
        this.config.remoteEndpoint,
        this.config.apiKey,
        this.config.batchSize
      );
      remoteDestination.enabled = true;
      this.addDestination(remoteDestination);
    }
  }

  /**
   * Start flush timer for batched operations
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      // Flush any batched operations in destinations
      for (const destination of this.destinations.values()) {
        if (destination instanceof RemoteLogDestination) {
          (destination as any).flush?.();
        }
      }
    }, this.config.flushInterval);
  }

  /**
   * Get logs from local storage destination
   */
  getLocalLogs(): StructuredLogEntry[] {
    const localStorage = this.destinations.get('localStorage') as LocalStorageLogDestination;
    return localStorage?.getLogs() || [];
  }

  /**
   * Clear local logs
   */
  clearLocalLogs(): void {
    const localStorage = this.destinations.get('localStorage') as LocalStorageLogDestination;
    localStorage?.clearLogs();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<StructuredLoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): StructuredLoggerConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush any remaining logs
    for (const destination of this.destinations.values()) {
      if (destination instanceof RemoteLogDestination) {
        (destination as any).flush?.();
      }
    }
  }
}

// Singleton instance
export const structuredLogger = new StructuredLogger();

// Export factory function
export const createStructuredLogger = (config?: Partial<StructuredLoggerConfig>) =>
  new StructuredLogger(config);