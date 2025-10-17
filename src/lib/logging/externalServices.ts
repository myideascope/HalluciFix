/**
 * External Logging Services Integration
 * Supports DataDog, CloudWatch, and other log aggregation services
 */

import { LogEntry, ExternalLogService } from './types';

/**
 * DataDog Logs Service
 */
export class DataDogLogsService implements ExternalLogService {
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, site: string = 'datadoghq.com') {
    this.apiKey = apiKey;
    this.endpoint = `https://http-intake.logs.${site}/v1/input/${apiKey}`;
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    const payload = entries.map(entry => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      service: entry.service,
      version: entry.version,
      env: entry.environment,
      ...entry.context,
      error: entry.error,
    }));

    await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': this.apiKey,
      },
      body: JSON.stringify(payload),
    });
  }
}

/**
 * Generic HTTP Logs Service
 */
export class HttpLogsService implements ExternalLogService {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(endpoint: string, headers: Record<string, string> = {}) {
    this.endpoint = endpoint;
    this.headers = {
      'Content-Type': 'application/json',
      ...headers,
    };
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ logs: entries }),
    });
  }
}

/**
 * Console Logs Service (for development/testing)
 */
export class ConsoleLogsService implements ExternalLogService {
  async sendLogs(entries: LogEntry[]): Promise<void> {
    entries.forEach(entry => {
      console.log(`[EXTERNAL] ${JSON.stringify(entry)}`);
    });
  }
}

/**
 * Batch Logs Service (buffers and sends in batches)
 */
export class BatchLogsService implements ExternalLogService {
  private service: ExternalLogService;
  private batchSize: number;
  private buffer: LogEntry[] = [];

  constructor(service: ExternalLogService, batchSize: number = 100) {
    this.service = service;
    this.batchSize = batchSize;
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    this.buffer.push(...entries);

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const logsToSend = this.buffer.splice(0, this.batchSize);
    await this.service.sendLogs(logsToSend);
  }
}

/**
 * Multi-Service Logs (sends to multiple services)
 */
export class MultiServiceLogs implements ExternalLogService {
  private services: ExternalLogService[];

  constructor(services: ExternalLogService[]) {
    this.services = services;
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    await Promise.allSettled(
      this.services.map(service => service.sendLogs(entries))
    );
  }
}