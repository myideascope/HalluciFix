/**
 * Log Correlation Service
 * Provides request flow tracing and cross-service correlation capabilities
 */

import { LogEntry, LogContext } from './types';
import { LogSearchService, LogCorrelation } from './logSearchService';

export interface RequestFlow {
  requestId: string;
  userId?: string;
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  services: string[];
  steps: RequestStep[];
  errors: LogEntry[];
  warnings: LogEntry[];
  performance: PerformanceMetrics;
}

export interface RequestStep {
  service: string;
  operation: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'started' | 'completed' | 'failed';
  logs: LogEntry[];
  context: Record<string, any>;
}

export interface PerformanceMetrics {
  totalDuration: number;
  serviceBreakdown: Record<string, number>;
  slowestOperation: {
    service: string;
    operation: string;
    duration: number;
  };
  databaseTime?: number;
  externalApiTime?: number;
  processingTime?: number;
}

export interface UserSession {
  userId: string;
  sessionId?: string;
  startTime: Date;
  endTime?: Date;
  requests: string[];
  totalRequests: number;
  errorCount: number;
  averageResponseTime: number;
  activities: UserActivity[];
}

export interface UserActivity {
  timestamp: Date;
  action: string;
  context: Record<string, any>;
  duration?: number;
  success: boolean;
}

export interface ServiceInteraction {
  fromService: string;
  toService: string;
  requestCount: number;
  averageLatency: number;
  errorRate: number;
  lastInteraction: Date;
}

/**
 * Log Correlation Service Implementation
 */
export class LogCorrelationService {
  private searchService: LogSearchService;
  private correlationCache: Map<string, RequestFlow> = new Map();
  private sessionCache: Map<string, UserSession> = new Map();

  constructor(searchService: LogSearchService) {
    this.searchService = searchService;
  }

  /**
   * Trace complete request flow across services
   */
  async traceRequestFlow(requestId: string): Promise<RequestFlow | null> {
    // Check cache first
    if (this.correlationCache.has(requestId)) {
      return this.correlationCache.get(requestId)!;
    }

    const correlation = await this.searchService.correlateLogsByRequest(requestId);
    if (!correlation) {
      return null;
    }

    const flow = await this.buildRequestFlow(correlation);
    
    // Cache for 10 minutes
    this.correlationCache.set(requestId, flow);
    setTimeout(() => this.correlationCache.delete(requestId), 10 * 60 * 1000);

    return flow;
  }

  /**
   * Build detailed request flow from correlation data
   */
  private async buildRequestFlow(correlation: LogCorrelation): Promise<RequestFlow> {
    const entries = correlation.entries;
    const services = [...new Set(entries.map(e => e.service))];
    
    // Group entries by service and operation
    const serviceOperations = this.groupByServiceOperation(entries);
    
    // Build request steps
    const steps = this.buildRequestSteps(serviceOperations);
    
    // Extract errors and warnings
    const errors = entries.filter(e => e.level === 'error');
    const warnings = entries.filter(e => e.level === 'warn');
    
    // Calculate performance metrics
    const performance = this.calculatePerformanceMetrics(entries, steps);
    
    const startTime = new Date(entries[0].timestamp);
    const endTime = new Date(entries[entries.length - 1].timestamp);
    
    return {
      requestId: correlation.requestId,
      userId: entries.find(e => e.context.userId)?.context.userId,
      startTime,
      endTime,
      totalDuration: correlation.duration,
      services,
      steps,
      errors,
      warnings,
      performance,
    };
  }

  /**
   * Group log entries by service and operation
   */
  private groupByServiceOperation(entries: LogEntry[]): Map<string, Map<string, LogEntry[]>> {
    const serviceOperations = new Map<string, Map<string, LogEntry[]>>();
    
    entries.forEach(entry => {
      const service = entry.service;
      const operation = this.extractOperation(entry);
      
      if (!serviceOperations.has(service)) {
        serviceOperations.set(service, new Map());
      }
      
      const serviceMap = serviceOperations.get(service)!;
      if (!serviceMap.has(operation)) {
        serviceMap.set(operation, []);
      }
      
      serviceMap.get(operation)!.push(entry);
    });
    
    return serviceOperations;
  }

  /**
   * Extract operation name from log entry
   */
  private extractOperation(entry: LogEntry): string {
    // Try to extract from context
    if (entry.context.operation) {
      return entry.context.operation;
    }
    
    if (entry.context.endpoint) {
      return entry.context.endpoint;
    }
    
    if (entry.context.method && entry.context.endpoint) {
      return `${entry.context.method} ${entry.context.endpoint}`;
    }
    
    // Extract from message
    const message = entry.message.toLowerCase();
    
    if (message.includes('api call') || message.includes('request')) {
      return 'API Request';
    }
    
    if (message.includes('database') || message.includes('query')) {
      return 'Database Operation';
    }
    
    if (message.includes('auth')) {
      return 'Authentication';
    }
    
    if (message.includes('analysis') || message.includes('process')) {
      return 'Processing';
    }
    
    return 'Unknown Operation';
  }

  /**
   * Build request steps from grouped operations
   */
  private buildRequestSteps(
    serviceOperations: Map<string, Map<string, LogEntry[]>>
  ): RequestStep[] {
    const steps: RequestStep[] = [];
    
    serviceOperations.forEach((operations, service) => {
      operations.forEach((logs, operation) => {
        const sortedLogs = logs.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const startTime = new Date(sortedLogs[0].timestamp);
        const endTime = new Date(sortedLogs[sortedLogs.length - 1].timestamp);
        const duration = endTime.getTime() - startTime.getTime();
        
        // Determine status
        let status: 'started' | 'completed' | 'failed' = 'completed';
        if (logs.some(l => l.level === 'error')) {
          status = 'failed';
        } else if (logs.length === 1 && !logs[0].message.includes('completed')) {
          status = 'started';
        }
        
        // Merge context from all logs
        const context = logs.reduce((acc, log) => ({ ...acc, ...log.context }), {});
        
        steps.push({
          service,
          operation,
          startTime,
          endTime,
          duration,
          status,
          logs: sortedLogs,
          context,
        });
      });
    });
    
    return steps.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  /**
   * Calculate performance metrics for request flow
   */
  private calculatePerformanceMetrics(
    entries: LogEntry[],
    steps: RequestStep[]
  ): PerformanceMetrics {
    const serviceBreakdown: Record<string, number> = {};
    let slowestOperation = { service: '', operation: '', duration: 0 };
    
    steps.forEach(step => {
      if (step.duration) {
        serviceBreakdown[step.service] = (serviceBreakdown[step.service] || 0) + step.duration;
        
        if (step.duration > slowestOperation.duration) {
          slowestOperation = {
            service: step.service,
            operation: step.operation,
            duration: step.duration,
          };
        }
      }
    });
    
    // Extract specific timing metrics
    const databaseEntries = entries.filter(e => 
      e.message.toLowerCase().includes('database') || 
      e.message.toLowerCase().includes('query')
    );
    const databaseTime = databaseEntries.reduce((sum, e) => 
      sum + (typeof e.context.duration === 'number' ? e.context.duration : 0), 0
    );
    
    const apiEntries = entries.filter(e => 
      e.message.toLowerCase().includes('api') || 
      e.context.endpoint
    );
    const externalApiTime = apiEntries.reduce((sum, e) => 
      sum + (typeof e.context.duration === 'number' ? e.context.duration : 0), 0
    );
    
    const totalDuration = Math.max(
      ...steps.map(s => s.duration || 0),
      entries.length > 0 ? 
        new Date(entries[entries.length - 1].timestamp).getTime() - 
        new Date(entries[0].timestamp).getTime() : 0
    );
    
    const processingTime = totalDuration - databaseTime - externalApiTime;
    
    return {
      totalDuration,
      serviceBreakdown,
      slowestOperation,
      databaseTime: databaseTime > 0 ? databaseTime : undefined,
      externalApiTime: externalApiTime > 0 ? externalApiTime : undefined,
      processingTime: processingTime > 0 ? processingTime : undefined,
    };
  }

  /**
   * Trace user session across multiple requests
   */
  async traceUserSession(
    userId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<UserSession | null> {
    const cacheKey = `${userId}-${timeRange?.start?.getTime()}-${timeRange?.end?.getTime()}`;
    
    if (this.sessionCache.has(cacheKey)) {
      return this.sessionCache.get(cacheKey)!;
    }

    const searchResult = await this.searchService.searchLogs({
      userId: [userId],
      startTime: timeRange?.start,
      endTime: timeRange?.end,
      limit: 1000,
      sortBy: 'timestamp',
      sortOrder: 'asc',
    });

    if (searchResult.entries.length === 0) {
      return null;
    }

    const session = await this.buildUserSession(userId, searchResult.entries);
    
    // Cache for 5 minutes
    this.sessionCache.set(cacheKey, session);
    setTimeout(() => this.sessionCache.delete(cacheKey), 5 * 60 * 1000);

    return session;
  }

  /**
   * Build user session from log entries
   */
  private async buildUserSession(userId: string, entries: LogEntry[]): Promise<UserSession> {
    const requestIds = [...new Set(entries.map(e => e.context.requestId).filter(Boolean))];
    const sessionIds = [...new Set(entries.map(e => e.context.sessionId).filter(Boolean))];
    
    const startTime = new Date(entries[0].timestamp);
    const endTime = new Date(entries[entries.length - 1].timestamp);
    
    const errorCount = entries.filter(e => e.level === 'error').length;
    
    // Calculate average response time from API calls
    const apiCalls = entries.filter(e => 
      e.context.duration && typeof e.context.duration === 'number'
    );
    const averageResponseTime = apiCalls.length > 0 
      ? apiCalls.reduce((sum, e) => sum + (e.context.duration as number), 0) / apiCalls.length
      : 0;
    
    // Extract user activities
    const activities = this.extractUserActivities(entries);
    
    return {
      userId,
      sessionId: sessionIds[0],
      startTime,
      endTime,
      requests: requestIds,
      totalRequests: requestIds.length,
      errorCount,
      averageResponseTime,
      activities,
    };
  }

  /**
   * Extract user activities from log entries
   */
  private extractUserActivities(entries: LogEntry[]): UserActivity[] {
    const activities: UserActivity[] = [];
    
    entries.forEach(entry => {
      // Look for user action indicators
      const message = entry.message.toLowerCase();
      
      if (message.includes('user action') || 
          message.includes('login') || 
          message.includes('logout') ||
          message.includes('analysis') ||
          message.includes('upload') ||
          message.includes('download')) {
        
        const action = this.extractActionFromMessage(entry.message);
        const success = entry.level !== 'error';
        const duration = typeof entry.context.duration === 'number' 
          ? entry.context.duration 
          : undefined;
        
        activities.push({
          timestamp: new Date(entry.timestamp),
          action,
          context: entry.context,
          duration,
          success,
        });
      }
    });
    
    return activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Extract action name from log message
   */
  private extractActionFromMessage(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('login')) return 'Login';
    if (lowerMessage.includes('logout')) return 'Logout';
    if (lowerMessage.includes('analysis')) return 'Analysis';
    if (lowerMessage.includes('upload')) return 'File Upload';
    if (lowerMessage.includes('download')) return 'File Download';
    if (lowerMessage.includes('search')) return 'Search';
    if (lowerMessage.includes('create')) return 'Create';
    if (lowerMessage.includes('update')) return 'Update';
    if (lowerMessage.includes('delete')) return 'Delete';
    
    // Extract from "User action: {action}" pattern
    const actionMatch = message.match(/user action:\s*([^,\n]+)/i);
    if (actionMatch) {
      return actionMatch[1].trim();
    }
    
    return 'Unknown Action';
  }

  /**
   * Analyze service interactions
   */
  async analyzeServiceInteractions(
    timeRange: { start: Date; end: Date }
  ): Promise<ServiceInteraction[]> {
    const searchResult = await this.searchService.searchLogs({
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: 5000,
    });

    const interactions = new Map<string, ServiceInteraction>();
    
    // Group by request ID to track service flows
    const requestGroups = new Map<string, LogEntry[]>();
    
    searchResult.entries.forEach(entry => {
      const requestId = entry.context.requestId;
      if (requestId) {
        if (!requestGroups.has(requestId)) {
          requestGroups.set(requestId, []);
        }
        requestGroups.get(requestId)!.push(entry);
      }
    });
    
    // Analyze interactions within each request
    requestGroups.forEach(entries => {
      const services = [...new Set(entries.map(e => e.service))];
      const sortedEntries = entries.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Track service-to-service calls
      for (let i = 0; i < sortedEntries.length - 1; i++) {
        const current = sortedEntries[i];
        const next = sortedEntries[i + 1];
        
        if (current.service !== next.service) {
          const interactionKey = `${current.service}->${next.service}`;
          
          if (!interactions.has(interactionKey)) {
            interactions.set(interactionKey, {
              fromService: current.service,
              toService: next.service,
              requestCount: 0,
              averageLatency: 0,
              errorRate: 0,
              lastInteraction: new Date(current.timestamp),
            });
          }
          
          const interaction = interactions.get(interactionKey)!;
          interaction.requestCount++;
          
          const latency = new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime();
          interaction.averageLatency = (interaction.averageLatency + latency) / 2;
          
          if (next.level === 'error') {
            interaction.errorRate = (interaction.errorRate + 1) / interaction.requestCount;
          }
          
          interaction.lastInteraction = new Date(Math.max(
            interaction.lastInteraction.getTime(),
            new Date(current.timestamp).getTime()
          ));
        }
      }
    });
    
    return Array.from(interactions.values())
      .sort((a, b) => b.requestCount - a.requestCount);
  }

  /**
   * Find related requests by user or session
   */
  async findRelatedRequests(
    requestId: string,
    relationshipType: 'user' | 'session' | 'timeframe' = 'user'
  ): Promise<string[]> {
    const correlation = await this.searchService.correlateLogsByRequest(requestId);
    if (!correlation) {
      return [];
    }
    
    const baseEntry = correlation.entries[0];
    if (!baseEntry) {
      return [];
    }
    
    let searchQuery;
    
    switch (relationshipType) {
      case 'user':
        if (!baseEntry.context.userId) return [];
        searchQuery = {
          userId: [baseEntry.context.userId],
          startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          limit: 100,
        };
        break;
        
      case 'session':
        if (!baseEntry.context.sessionId) return [];
        searchQuery = {
          contextFilters: { sessionId: baseEntry.context.sessionId },
          limit: 100,
        };
        break;
        
      case 'timeframe':
        const baseTime = new Date(baseEntry.timestamp);
        searchQuery = {
          startTime: new Date(baseTime.getTime() - 30 * 60 * 1000), // 30 minutes before
          endTime: new Date(baseTime.getTime() + 30 * 60 * 1000),   // 30 minutes after
          limit: 100,
        };
        break;
    }
    
    const searchResult = await this.searchService.searchLogs(searchQuery);
    
    const relatedRequestIds = [...new Set(
      searchResult.entries
        .map(e => e.context.requestId)
        .filter(id => id && id !== requestId)
    )];
    
    return relatedRequestIds;
  }

  /**
   * Clear correlation cache
   */
  clearCache(): void {
    this.correlationCache.clear();
    this.sessionCache.clear();
  }
}

// Export singleton instance (will be properly initialized with dependencies)
export const logCorrelationService = new LogCorrelationService(
  {} as LogSearchService
);