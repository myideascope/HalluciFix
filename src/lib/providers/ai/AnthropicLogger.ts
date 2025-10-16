/**
 * Anthropic Logger
 * Comprehensive logging and monitoring for Anthropic API interactions
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: string;
  data?: any;
  requestId?: string;
  userId?: string;
  duration?: number;
}

export interface APICallLog {
  requestId: string;
  timestamp: string;
  method: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  duration: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  retryCount: number;
  userId?: string;
}

export class AnthropicLogger {
  private logs: LogEntry[] = [];
  private apiCalls: APICallLog[] = [];
  private maxLogEntries = 1000;
  private maxApiCallLogs = 500;

  /**
   * Log a general message
   */
  log(level: LogLevel, message: string, context: string, data?: any, requestId?: string, userId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
      requestId,
      userId
    };

    this.logs.push(entry);
    this.trimLogs();

    // Also log to console based on level
    this.logToConsole(entry);
  }

  /**
   * Log an API call
   */
  logApiCall(callLog: Omit<APICallLog, 'timestamp'>): void {
    const entry: APICallLog = {
      ...callLog,
      timestamp: new Date().toISOString()
    };

    this.apiCalls.push(entry);
    this.trimApiCallLogs();

    // Log summary to general logs
    const message = entry.success 
      ? `API call successful: ${entry.method} (${entry.duration}ms, ${entry.inputTokens + entry.outputTokens} tokens, $${entry.cost.toFixed(4)})`
      : `API call failed: ${entry.method} - ${entry.errorType}: ${entry.errorMessage}`;

    this.log(
      entry.success ? LogLevel.INFO : LogLevel.ERROR,
      message,
      'api_call',
      {
        requestId: entry.requestId,
        model: entry.model,
        tokens: entry.inputTokens + entry.outputTokens,
        cost: entry.cost,
        retryCount: entry.retryCount
      },
      entry.requestId,
      entry.userId
    );
  }

  /**
   * Log debug information
   */
  debug(message: string, context: string, data?: any, requestId?: string, userId?: string): void {
    this.log(LogLevel.DEBUG, message, context, data, requestId, userId);
  }

  /**
   * Log informational message
   */
  info(message: string, context: string, data?: any, requestId?: string, userId?: string): void {
    this.log(LogLevel.INFO, message, context, data, requestId, userId);
  }

  /**
   * Log warning message
   */
  warn(message: string, context: string, data?: any, requestId?: string, userId?: string): void {
    this.log(LogLevel.WARN, message, context, data, requestId, userId);
  }

  /**
   * Log error message
   */
  error(message: string, context: string, data?: any, requestId?: string, userId?: string): void {
    this.log(LogLevel.ERROR, message, context, data, requestId, userId);
  }

  /**
   * Get recent logs
   */
  getLogs(options: {
    level?: LogLevel;
    context?: string;
    limit?: number;
    since?: Date;
    requestId?: string;
    userId?: string;
  } = {}): LogEntry[] {
    let filteredLogs = [...this.logs];

    if (options.level) {
      const levelPriority = this.getLevelPriority(options.level);
      filteredLogs = filteredLogs.filter(log => 
        this.getLevelPriority(log.level) >= levelPriority
      );
    }

    if (options.context) {
      filteredLogs = filteredLogs.filter(log => log.context === options.context);
    }

    if (options.requestId) {
      filteredLogs = filteredLogs.filter(log => log.requestId === options.requestId);
    }

    if (options.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === options.userId);
    }

    if (options.since) {
      const sinceTime = options.since.getTime();
      filteredLogs = filteredLogs.filter(log => 
        new Date(log.timestamp).getTime() >= sinceTime
      );
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (options.limit) {
      filteredLogs = filteredLogs.slice(0, options.limit);
    }

    return filteredLogs;
  }

  /**
   * Get API call logs
   */
  getApiCallLogs(options: {
    success?: boolean;
    model?: string;
    limit?: number;
    since?: Date;
    userId?: string;
  } = {}): APICallLog[] {
    let filteredLogs = [...this.apiCalls];

    if (options.success !== undefined) {
      filteredLogs = filteredLogs.filter(log => log.success === options.success);
    }

    if (options.model) {
      filteredLogs = filteredLogs.filter(log => log.model === options.model);
    }

    if (options.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === options.userId);
    }

    if (options.since) {
      const sinceTime = options.since.getTime();
      filteredLogs = filteredLogs.filter(log => 
        new Date(log.timestamp).getTime() >= sinceTime
      );
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (options.limit) {
      filteredLogs = filteredLogs.slice(0, options.limit);
    }

    return filteredLogs;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(timeWindow: number = 3600000): { // Default 1 hour
    averageResponseTime: number;
    successRate: number;
    errorRate: number;
    totalCalls: number;
    totalCost: number;
    tokenUsage: { input: number; output: number; total: number };
    errorBreakdown: Record<string, number>;
  } {
    const since = new Date(Date.now() - timeWindow);
    const recentCalls = this.getApiCallLogs({ since });

    if (recentCalls.length === 0) {
      return {
        averageResponseTime: 0,
        successRate: 0,
        errorRate: 0,
        totalCalls: 0,
        totalCost: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
        errorBreakdown: {}
      };
    }

    const successfulCalls = recentCalls.filter(call => call.success);
    const failedCalls = recentCalls.filter(call => !call.success);

    const averageResponseTime = recentCalls.reduce((sum, call) => sum + call.duration, 0) / recentCalls.length;
    const successRate = (successfulCalls.length / recentCalls.length) * 100;
    const errorRate = (failedCalls.length / recentCalls.length) * 100;
    const totalCost = recentCalls.reduce((sum, call) => sum + call.cost, 0);

    const tokenUsage = recentCalls.reduce(
      (acc, call) => ({
        input: acc.input + call.inputTokens,
        output: acc.output + call.outputTokens,
        total: acc.total + call.inputTokens + call.outputTokens
      }),
      { input: 0, output: 0, total: 0 }
    );

    const errorBreakdown: Record<string, number> = {};
    failedCalls.forEach(call => {
      const errorType = call.errorType || 'unknown';
      errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
    });

    return {
      averageResponseTime,
      successRate,
      errorRate,
      totalCalls: recentCalls.length,
      totalCost,
      tokenUsage,
      errorBreakdown
    };
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
    this.apiCalls = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): { logs: LogEntry[]; apiCalls: APICallLog[] } {
    return {
      logs: [...this.logs],
      apiCalls: [...this.apiCalls]
    };
  }

  private logToConsole(entry: LogEntry): void {
    const message = `[${entry.timestamp}] ${entry.level.toUpperCase()} [${entry.context}] ${entry.message}`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.data);
        break;
      case LogLevel.INFO:
        console.info(message, entry.data);
        break;
      case LogLevel.WARN:
        console.warn(message, entry.data);
        break;
      case LogLevel.ERROR:
        console.error(message, entry.data);
        break;
    }
  }

  private getLevelPriority(level: LogLevel): number {
    switch (level) {
      case LogLevel.DEBUG: return 0;
      case LogLevel.INFO: return 1;
      case LogLevel.WARN: return 2;
      case LogLevel.ERROR: return 3;
      default: return 0;
    }
  }

  private trimLogs(): void {
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }
  }

  private trimApiCallLogs(): void {
    if (this.apiCalls.length > this.maxApiCallLogs) {
      this.apiCalls = this.apiCalls.slice(-this.maxApiCallLogs);
    }
  }
}