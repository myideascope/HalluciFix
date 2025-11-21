import { CloudWatchLogsClient, PutLogEventsCommand, CreateLogGroupCommand, CreateLogStreamCommand, DescribeLogGroupsCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { LogEntry } from './structuredLogger';

import { logger } from './logging';
export class CloudWatchLogger {
  private client: CloudWatchLogsClient;
  private logGroupName: string;
  private logStreamName: string;
  private sequenceToken?: string;
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  constructor(
    logGroupName: string,
    logStreamName?: string,
    region: string = process.env.AWS_REGION || 'us-east-1'
  ) {
    this.client = new CloudWatchLogsClient({ region });
    this.logGroupName = logGroupName;
    this.logStreamName = logStreamName || `${new Date().toISOString().split('T')[0]}-${Date.now()}`;
    
    this.initialize();
    this.startFlushInterval();
  }

  /**
   * Initialize log group and stream
   */
  private async initialize(): Promise<void> {
    try {
      await this.ensureLogGroupExists();
      await this.ensureLogStreamExists();
    } catch (error) {
      logger.error("Failed to initialize CloudWatch logger:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Ensure log group exists
   */
  private async ensureLogGroupExists(): Promise<void> {
    try {
      const command = new DescribeLogGroupsCommand({
        logGroupNamePrefix: this.logGroupName,
        limit: 1
      });
      
      const response = await this.client.send(command);
      const logGroupExists = response.logGroups?.some(
        group => group.logGroupName === this.logGroupName
      );

      if (!logGroupExists) {
        await this.client.send(new CreateLogGroupCommand({
          logGroupName: this.logGroupName
        }));
      }
    } catch (error) {
      logger.error("Error ensuring log group exists:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Ensure log stream exists
   */
  private async ensureLogStreamExists(): Promise<void> {
    try {
      const command = new DescribeLogStreamsCommand({
        logGroupName: this.logGroupName,
        logStreamNamePrefix: this.logStreamName,
        limit: 1
      });
      
      const response = await this.client.send(command);
      const logStreamExists = response.logStreams?.some(
        stream => stream.logStreamName === this.logStreamName
      );

      if (!logStreamExists) {
        await this.client.send(new CreateLogStreamCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName
        }));
      } else {
        // Get the sequence token for existing stream
        const existingStream = response.logStreams?.find(
          stream => stream.logStreamName === this.logStreamName
        );
        this.sequenceToken = existingStream?.uploadSequenceToken;
      }
    } catch (error) {
      logger.error("Error ensuring log stream exists:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Add log entry to buffer
   */
  public log(logEntry: LogEntry): void {
    this.logBuffer.push(logEntry);
    
    if (this.logBuffer.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  /**
   * Flush log buffer to CloudWatch
   */
  public async flush(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const logEvents = logsToSend.map(entry => ({
        timestamp: new Date(entry.timestamp).getTime(),
        message: JSON.stringify(entry)
      }));

      // Sort by timestamp (required by CloudWatch)
      logEvents.sort((a, b) => a.timestamp - b.timestamp);

      const command = new PutLogEventsCommand({
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
        logEvents,
        sequenceToken: this.sequenceToken
      });

      const response = await this.client.send(command);
      this.sequenceToken = response.nextSequenceToken;
    } catch (error) {
      logger.error("Failed to send logs to CloudWatch:", error instanceof Error ? error : new Error(String(error)));
      // Put logs back in buffer for retry
      this.logBuffer.unshift(...logsToSend);
    }
  }

  /**
   * Start automatic flush interval
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Stop automatic flush and flush remaining logs
   */
  public async close(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    await this.flush();
  }
}

// Singleton instances for different log types
let applicationLogger: CloudWatchLogger | null = null;
let businessLogger: CloudWatchLogger | null = null;
let securityLogger: CloudWatchLogger | null = null;

/**
 * Get CloudWatch logger for application logs
 */
export function getApplicationLogger(): CloudWatchLogger {
  if (!applicationLogger) {
    const env = process.env.NODE_ENV || 'development';
    applicationLogger = new CloudWatchLogger(`/hallucifix/${env}/application`);
  }
  return applicationLogger;
}

/**
 * Get CloudWatch logger for business logs
 */
export function getBusinessLogger(): CloudWatchLogger {
  if (!businessLogger) {
    const env = process.env.NODE_ENV || 'development';
    businessLogger = new CloudWatchLogger(`/hallucifix/${env}/business`);
  }
  return businessLogger;
}

/**
 * Get CloudWatch logger for security logs
 */
export function getSecurityLogger(): CloudWatchLogger {
  if (!securityLogger) {
    const env = process.env.NODE_ENV || 'development';
    securityLogger = new CloudWatchLogger(`/hallucifix/${env}/security`);
  }
  return securityLogger;
}

/**
 * Cleanup all loggers
 */
export async function closeAllLoggers(): Promise<void> {
  const promises: Promise<void>[] = [];
  
  if (applicationLogger) {
    promises.push(applicationLogger.close());
  }
  
  if (businessLogger) {
    promises.push(businessLogger.close());
  }
  
  if (securityLogger) {
    promises.push(securityLogger.close());
  }
  
  await Promise.all(promises);
}