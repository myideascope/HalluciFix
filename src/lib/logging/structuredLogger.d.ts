export declare enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR",
    FATAL = "FATAL"
}
export declare enum LogCategory {
    APPLICATION = "APPLICATION",
    BUSINESS = "BUSINESS",
    SECURITY = "SECURITY",
    PERFORMANCE = "PERFORMANCE",
    AUDIT = "AUDIT"
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
export declare class StructuredLogger {
    private context;
    private logGroupName;
    constructor(context?: Partial<LogContext>);
    /**
     * Create a child logger with additional context
     */
    child(additionalContext: Partial<LogContext>): StructuredLogger;
    /**
     * Set correlation ID for request tracing
     */
    withCorrelationId(correlationId: string): StructuredLogger;
    /**
     * Set request ID for request tracking
     */
    withRequestId(requestId: string): StructuredLogger;
    /**
     * Set user context
     */
    withUser(userId: string, sessionId?: string): StructuredLogger;
    /**
     * Debug level logging
     */
    debug(message: string, metadata?: Record<string, any>): void;
    /**
     * Info level logging
     */
    info(message: string, metadata?: Record<string, any>): void;
    /**
     * Warning level logging
     */
    warn(message: string, metadata?: Record<string, any>): void;
    /**
     * Error level logging
     */
    error(message: string, error?: Error, metadata?: Record<string, any>): void;
    /**
     * Fatal level logging
     */
    fatal(message: string, error?: Error, metadata?: Record<string, any>): void;
    /**
     * Business event logging
     */
    business(eventType: string, message: string, businessData: {
        entityId?: string;
        entityType?: string;
        action?: string;
        result?: string;
        metrics?: Record<string, number>;
    }, metadata?: Record<string, any>): void;
    /**
     * Security event logging
     */
    security(eventType: string, message: string, securityData: {
        action?: string;
        result?: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
        riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        ipAddress?: string;
        userAgent?: string;
    }, metadata?: Record<string, any>): void;
    /**
     * Performance logging
     */
    performance(message: string, performanceData: {
        duration?: number;
        memoryUsage?: number;
        cpuUsage?: number;
    }, metadata?: Record<string, any>): void;
    /**
     * Audit logging
     */
    audit(action: string, message: string, auditData: {
        entityId?: string;
        entityType?: string;
        oldValue?: any;
        newValue?: any;
        result?: 'SUCCESS' | 'FAILURE';
    }, metadata?: Record<string, any>): void;
    /**
     * Generic log method
     */
    private log;
    /**
     * Write log entry to appropriate destination
     */
    private writeLog;
    /**
     * Get appropriate console method for log level
     */
    private getConsoleMethod;
    /**
     * Send log to CloudWatch Logs (placeholder for AWS SDK implementation)
     */
    private sendToCloudWatch;
    /**
     * Send log to external logging service
     */
    private sendToExternalService;
    /**
     * Create a timer for performance logging
     */
    timer(label: string): {
        end: (metadata?: Record<string, any>) => void;
    };
    /**
     * Log HTTP request/response
     */
    httpRequest(method: string, url: string, statusCode: number, duration: number, metadata?: Record<string, any>): void;
    /**
     * Log database query
     */
    dbQuery(query: string, duration: number, rowCount?: number, metadata?: Record<string, any>): void;
}
export declare const logger: StructuredLogger;
export declare function createLogger(context: Partial<LogContext>): StructuredLogger;
export declare function loggingMiddleware(): (req: any, res: any, next: any) => void;
