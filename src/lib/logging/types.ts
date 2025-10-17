/**
 * Logging system types and interfaces
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
  endpoint?: string;
  method?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  version: string;
  environment: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  serviceName: string;
  version: string;
  environment: string;
  logLevel: LogLevel;
  enableConsole: boolean;
  enableExternalService: boolean;
  externalService?: {
    endpoint: string;
    apiKey: string;
  };
  sanitizeFields: string[];
}

export interface ExternalLogService {
  sendLogs(entries: LogEntry[]): Promise<void>;
}