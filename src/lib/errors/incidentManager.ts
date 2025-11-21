/**
 * Incident Response and Notification System
 * Automated incident creation, escalation, and team notifications
 */

import { ApiError, ErrorSeverity, ErrorType } from './types';
import { AlertEvent } from './errorMonitor';

import { logger } from './logging';
/**
 * Incident severity levels
 */
export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Incident status
 */
export enum IncidentStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  IDENTIFIED = 'identified',
  MONITORING = 'monitoring',
  RESOLVED = 'resolved',
  CLOSED = 'closed'
}

/**
 * Incident priority
 */
export enum IncidentPriority {
  P1 = 'P1', // Critical - immediate response required
  P2 = 'P2', // High - response within 1 hour
  P3 = 'P3', // Medium - response within 4 hours
  P4 = 'P4'  // Low - response within 24 hours
}

/**
 * Incident record
 */
export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  
  // Source information
  sourceType: 'error' | 'alert' | 'manual';
  sourceId: string;
  
  // Error details
  errorType?: ErrorType;
  errorCount: number;
  affectedUsers: number;
  
  // Assignment and escalation
  assignedTo?: string;
  escalatedTo?: string[];
  escalationLevel: number;
  
  // Timeline and updates
  timeline: IncidentTimelineEntry[];
  
  // Impact assessment
  impact: IncidentImpact;
  
  // Resolution information
  resolution?: string;
  rootCause?: string;
  preventionMeasures?: string[];
}

/**
 * Incident timeline entry
 */
export interface IncidentTimelineEntry {
  id: string;
  timestamp: string;
  type: 'created' | 'updated' | 'escalated' | 'assigned' | 'resolved' | 'closed' | 'comment';
  author: string;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Incident impact assessment
 */
export interface IncidentImpact {
  userImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
  systemImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
  businessImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
  estimatedAffectedUsers: number;
  affectedFeatures: string[];
}

/**
 * Escalation rule
 */
export interface EscalationRule {
  id: string;
  name: string;
  conditions: EscalationCondition[];
  actions: EscalationAction[];
  enabled: boolean;
}

/**
 * Escalation condition
 */
export interface EscalationCondition {
  type: 'time_elapsed' | 'error_count' | 'severity' | 'no_response' | 'status_unchanged';
  value: any;
  operator: 'greater_than' | 'equal' | 'less_than';
}

/**
 * Escalation action
 */
export interface EscalationAction {
  type: 'notify' | 'assign' | 'escalate' | 'create_ticket' | 'webhook';
  config: Record<string, any>;
}

/**
 * Notification channel
 */
export interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'sms' | 'push';
  config: Record<string, any>;
  enabled: boolean;
  conditions?: NotificationCondition[];
}

/**
 * Notification condition
 */
export interface NotificationCondition {
  severity?: IncidentSeverity[];
  priority?: IncidentPriority[];
  errorType?: ErrorType[];
  timeOfDay?: { start: string; end: string };
  daysOfWeek?: number[]; // 0-6, Sunday = 0
}

/**
 * Notification message
 */
export interface NotificationMessage {
  id: string;
  channelId: string;
  incidentId: string;
  timestamp: string;
  subject: string;
  message: string;
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  retryCount: number;
  error?: string;
}

/**
 * Incident Manager
 * Handles incident creation, escalation, and notifications
 */
export class IncidentManager {
  private static instance: IncidentManager;
  private incidents: Map<string, Incident> = new Map();
  private escalationRules: Map<string, EscalationRule> = new Map();
  private notificationChannels: Map<string, NotificationChannel> = new Map();
  private notificationQueue: NotificationMessage[] = [];
  private escalationTimer?: NodeJS.Timeout;
  private notificationTimer?: NodeJS.Timeout;

  private constructor() {
    this.setupDefaultEscalationRules();
    this.setupDefaultNotificationChannels();
    this.startEscalationMonitoring();
    this.startNotificationProcessing();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): IncidentManager {
    if (!IncidentManager.instance) {
      IncidentManager.instance = new IncidentManager();
    }
    return IncidentManager.instance;
  }

  /**
   * Create incident from error
   */
  public createIncidentFromError(error: ApiError, context?: Record<string, any>): Incident {
    const incident: Incident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateIncidentTitle(error),
      description: this.generateIncidentDescription(error, context),
      severity: this.mapErrorSeverityToIncidentSeverity(error.severity),
      priority: this.determinePriority(error),
      status: IncidentStatus.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      sourceType: 'error',
      sourceId: error.errorId,
      
      errorType: error.type,
      errorCount: 1,
      affectedUsers: context?.affectedUsers || 1,
      
      escalationLevel: 0,
      timeline: [],
      
      impact: this.assessImpact(error, context)
    };

    // Add creation timeline entry
    this.addTimelineEntry(incident, {
      type: 'created',
      author: 'system',
      message: `Incident created from ${error.type} error: ${error.message}`
    });

    this.incidents.set(incident.id, incident);

    // Send initial notifications
    this.sendIncidentNotifications(incident, 'created');

    console.log(`[IncidentManager] Created incident ${incident.id} for error ${error.errorId}`);

    return incident;
  }

  /**
   * Create incident from alert
   */
  public createIncidentFromAlert(alert: AlertEvent): Incident {
    const incident: Incident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: `Alert: ${alert.thresholdName}`,
      description: alert.message,
      severity: this.mapAlertSeverityToIncidentSeverity(alert.severity),
      priority: this.determineAlertPriority(alert),
      status: IncidentStatus.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      sourceType: 'alert',
      sourceId: alert.id,
      
      errorCount: alert.actualValue,
      affectedUsers: 0, // Will be updated based on monitoring
      
      escalationLevel: 0,
      timeline: [],
      
      impact: this.assessAlertImpact(alert)
    };

    // Add creation timeline entry
    this.addTimelineEntry(incident, {
      type: 'created',
      author: 'system',
      message: `Incident created from alert: ${alert.thresholdName}`
    });

    this.incidents.set(incident.id, incident);

    // Send initial notifications
    this.sendIncidentNotifications(incident, 'created');

    console.log(`[IncidentManager] Created incident ${incident.id} from alert ${alert.id}`);

    return incident;
  }

  /**
   * Update incident
   */
  public updateIncident(
    incidentId: string, 
    updates: Partial<Incident>, 
    author: string = 'system'
  ): Incident | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    const previousStatus = incident.status;
    const updatedIncident = {
      ...incident,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Handle status changes
    if (updates.status && updates.status !== previousStatus) {
      if (updates.status === IncidentStatus.RESOLVED) {
        updatedIncident.resolvedAt = new Date().toISOString();
      } else if (updates.status === IncidentStatus.CLOSED) {
        updatedIncident.closedAt = new Date().toISOString();
      }

      this.addTimelineEntry(updatedIncident, {
        type: 'updated',
        author,
        message: `Status changed from ${previousStatus} to ${updates.status}`
      });

      // Send status change notifications
      this.sendIncidentNotifications(updatedIncident, 'status_changed');
    }

    this.incidents.set(incidentId, updatedIncident);
    return updatedIncident;
  }

  /**
   * Escalate incident
   */
  public escalateIncident(incidentId: string, reason: string, author: string = 'system'): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.escalationLevel++;
    incident.updatedAt = new Date().toISOString();

    // Determine escalation target based on level
    const escalationTarget = this.getEscalationTarget(incident.escalationLevel);
    if (escalationTarget) {
      incident.escalatedTo = incident.escalatedTo || [];
      incident.escalatedTo.push(escalationTarget);
    }

    this.addTimelineEntry(incident, {
      type: 'escalated',
      author,
      message: `Incident escalated to level ${incident.escalationLevel}: ${reason}`
    });

    // Send escalation notifications
    this.sendIncidentNotifications(incident, 'escalated');

    console.log(`[IncidentManager] Escalated incident ${incidentId} to level ${incident.escalationLevel}`);

    return true;
  }

  /**
   * Add comment to incident
   */
  public addIncidentComment(
    incidentId: string, 
    comment: string, 
    author: string
  ): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    this.addTimelineEntry(incident, {
      type: 'comment',
      author,
      message: comment
    });

    incident.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get incident by ID
   */
  public getIncident(incidentId: string): Incident | null {
    return this.incidents.get(incidentId) || null;
  }

  /**
   * Get all incidents
   */
  public getIncidents(filters?: {
    status?: IncidentStatus[];
    severity?: IncidentSeverity[];
    priority?: IncidentPriority[];
    limit?: number;
  }): Incident[] {
    let incidents = Array.from(this.incidents.values());

    if (filters) {
      if (filters.status) {
        incidents = incidents.filter(i => filters.status!.includes(i.status));
      }
      if (filters.severity) {
        incidents = incidents.filter(i => filters.severity!.includes(i.severity));
      }
      if (filters.priority) {
        incidents = incidents.filter(i => filters.priority!.includes(i.priority));
      }
      if (filters.limit) {
        incidents = incidents.slice(0, filters.limit);
      }
    }

    return incidents.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Setup default escalation rules
   */
  private setupDefaultEscalationRules(): void {
    const defaultRules: EscalationRule[] = [
      {
        id: 'critical_immediate',
        name: 'Critical Incident Immediate Escalation',
        conditions: [
          { type: 'severity', value: IncidentSeverity.CRITICAL, operator: 'equal' }
        ],
        actions: [
          { type: 'notify', config: { channels: ['critical_alerts'], immediate: true } },
          { type: 'escalate', config: { level: 1 } }
        ],
        enabled: true
      },
      {
        id: 'no_response_15min',
        name: '15 Minute No Response Escalation',
        conditions: [
          { type: 'time_elapsed', value: 900000, operator: 'greater_than' }, // 15 minutes
          { type: 'no_response', value: true, operator: 'equal' }
        ],
        actions: [
          { type: 'escalate', config: { level: 1 } },
          { type: 'notify', config: { channels: ['escalation_alerts'] } }
        ],
        enabled: true
      },
      {
        id: 'high_priority_1hour',
        name: 'High Priority 1 Hour Escalation',
        conditions: [
          { type: 'time_elapsed', value: 3600000, operator: 'greater_than' }, // 1 hour
          { type: 'severity', value: IncidentSeverity.HIGH, operator: 'equal' },
          { type: 'status_unchanged', value: IncidentStatus.OPEN, operator: 'equal' }
        ],
        actions: [
          { type: 'escalate', config: { level: 1 } },
          { type: 'notify', config: { channels: ['management_alerts'] } }
        ],
        enabled: true
      }
    ];

    defaultRules.forEach(rule => {
      this.escalationRules.set(rule.id, rule);
    });
  }

  /**
   * Setup default notification channels
   */
  private setupDefaultNotificationChannels(): void {
    const defaultChannels: NotificationChannel[] = [
      {
        id: 'console_alerts',
        name: 'Console Alerts',
        type: 'push',
        config: {},
        enabled: true
      },
      {
        id: 'critical_alerts',
        name: 'Critical Incident Alerts',
        type: 'email',
        config: {
          recipients: ['dev-team@company.com', 'on-call@company.com']
        },
        enabled: true,
        conditions: [
          { severity: [IncidentSeverity.CRITICAL] }
        ]
      },
      {
        id: 'escalation_alerts',
        name: 'Escalation Notifications',
        type: 'slack',
        config: {
          webhook: import.meta.env.VITE_SLACK_WEBHOOK_URL,
          channel: '#incidents'
        },
        enabled: !!import.meta.env.VITE_SLACK_WEBHOOK_URL
      },
      {
        id: 'management_alerts',
        name: 'Management Notifications',
        type: 'email',
        config: {
          recipients: ['management@company.com']
        },
        enabled: true,
        conditions: [
          { severity: [IncidentSeverity.CRITICAL, IncidentSeverity.HIGH] }
        ]
      }
    ];

    defaultChannels.forEach(channel => {
      this.notificationChannels.set(channel.id, channel);
    });
  }

  /**
   * Start escalation monitoring
   */
  private startEscalationMonitoring(): void {
    this.escalationTimer = setInterval(() => {
      this.checkEscalationRules();
    }, 60000); // Check every minute
  }

  /**
   * Start notification processing
   */
  private startNotificationProcessing(): void {
    this.notificationTimer = setInterval(() => {
      this.processNotificationQueue();
    }, 5000); // Process every 5 seconds
  }

  /**
   * Check escalation rules
   */
  private checkEscalationRules(): void {
    const openIncidents = this.getIncidents({ 
      status: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] 
    });

    for (const incident of openIncidents) {
      for (const rule of this.escalationRules.values()) {
        if (!rule.enabled) continue;

        if (this.evaluateEscalationConditions(incident, rule.conditions)) {
          this.executeEscalationActions(incident, rule.actions);
        }
      }
    }
  }

  /**
   * Evaluate escalation conditions
   */
  private evaluateEscalationConditions(
    incident: Incident, 
    conditions: EscalationCondition[]
  ): boolean {
    return conditions.every(condition => {
      const now = new Date();
      const createdAt = new Date(incident.createdAt);
      const timeElapsed = now.getTime() - createdAt.getTime();

      switch (condition.type) {
        case 'time_elapsed':
          return this.compareValues(timeElapsed, condition.value, condition.operator);
        
        case 'severity':
          return condition.operator === 'equal' && incident.severity === condition.value;
        
        case 'no_response':
          // Check if there are any non-system timeline entries
          const hasResponse = incident.timeline.some(entry => 
            entry.author !== 'system' && entry.type !== 'created'
          );
          return condition.value === !hasResponse;
        
        case 'status_unchanged':
          return condition.operator === 'equal' && incident.status === condition.value;
        
        case 'error_count':
          return this.compareValues(incident.errorCount, condition.value, condition.operator);
        
        default:
          return false;
      }
    });
  }

  /**
   * Execute escalation actions
   */
  private executeEscalationActions(incident: Incident, actions: EscalationAction[]): void {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'escalate':
            this.escalateIncident(incident.id, 'Automatic escalation rule triggered');
            break;
          
          case 'notify':
            this.sendIncidentNotifications(incident, 'escalation', action.config.channels);
            break;
          
          case 'assign':
            this.updateIncident(incident.id, { 
              assignedTo: action.config.assignee 
            }, 'system');
            break;
          
          // Additional action types can be implemented
        }
      } catch (error) {
        logger.error("Failed to execute escalation action:", error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Send incident notifications
   */
  private sendIncidentNotifications(
    incident: Incident, 
    eventType: string, 
    specificChannels?: string[]
  ): void {
    const channels = specificChannels 
      ? Array.from(this.notificationChannels.values()).filter(c => 
          specificChannels.includes(c.id)
        )
      : Array.from(this.notificationChannels.values());

    for (const channel of channels) {
      if (!channel.enabled) continue;

      // Check notification conditions
      if (channel.conditions && !this.evaluateNotificationConditions(incident, channel.conditions)) {
        continue;
      }

      const message = this.createNotificationMessage(incident, channel, eventType);
      this.notificationQueue.push(message);
    }
  }

  /**
   * Evaluate notification conditions
   */
  private evaluateNotificationConditions(
    incident: Incident, 
    conditions: NotificationCondition[]
  ): boolean {
    return conditions.every(condition => {
      if (condition.severity && !condition.severity.includes(incident.severity)) {
        return false;
      }
      if (condition.priority && !condition.priority.includes(incident.priority)) {
        return false;
      }
      if (condition.errorType && incident.errorType && 
          !condition.errorType.includes(incident.errorType)) {
        return false;
      }
      
      // Time and day conditions can be implemented as needed
      
      return true;
    });
  }

  /**
   * Create notification message
   */
  private createNotificationMessage(
    incident: Incident, 
    channel: NotificationChannel, 
    eventType: string
  ): NotificationMessage {
    const subject = this.generateNotificationSubject(incident, eventType);
    const message = this.generateNotificationMessage(incident, eventType);

    return {
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      channelId: channel.id,
      incidentId: incident.id,
      timestamp: new Date().toISOString(),
      subject,
      message,
      status: 'pending',
      retryCount: 0
    };
  }

  /**
   * Process notification queue
   */
  private async processNotificationQueue(): Promise<void> {
    const pendingNotifications = this.notificationQueue.filter(n => n.status === 'pending');
    
    for (const notification of pendingNotifications) {
      try {
        await this.sendNotification(notification);
        notification.status = 'sent';
      } catch (error) {
        notification.status = 'failed';
        notification.error = error instanceof Error ? error.message : 'Unknown error';
        notification.retryCount++;
        
        // Retry up to 3 times
        if (notification.retryCount < 3) {
          notification.status = 'pending';
        }
        
        logger.error("Failed to send notification:", error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Clean up old notifications
    this.notificationQueue = this.notificationQueue.filter(n => 
      n.status === 'pending' || 
      new Date().getTime() - new Date(n.timestamp).getTime() < 86400000 // Keep for 24 hours
    );
  }

  /**
   * Send notification
   */
  private async sendNotification(notification: NotificationMessage): Promise<void> {
    const channel = this.notificationChannels.get(notification.channelId);
    if (!channel) throw new Error('Channel not found');

    switch (channel.type) {
      case 'push':
        this.sendPushNotification(notification, channel);
        break;
      
      case 'email':
        await this.sendEmailNotification(notification, channel);
        break;
      
      case 'slack':
        await this.sendSlackNotification(notification, channel);
        break;
      
      case 'webhook':
        await this.sendWebhookNotification(notification, channel);
        break;
      
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }
  }

  /**
   * Send push notification
   */
  private sendPushNotification(notification: NotificationMessage, channel: NotificationChannel): void {
    console.log(`[IncidentManager] ${notification.subject}: ${notification.message}`);
    
    // Browser notification if available
    if (typeof window !== 'undefined' && 'Notification' in window && 
        Notification.permission === 'granted') {
      new Notification(notification.subject, {
        body: notification.message,
        icon: '/favicon.ico'
      });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    notification: NotificationMessage, 
    channel: NotificationChannel
  ): Promise<void> {
    // This would integrate with an email service like SendGrid, AWS SES, etc.
    console.log(`[IncidentManager] Email notification would be sent to:`, channel.config.recipients);
    console.log(`Subject: ${notification.subject}`);
    console.log(`Message: ${notification.message}`);
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    notification: NotificationMessage, 
    channel: NotificationChannel
  ): Promise<void> {
    if (!channel.config.webhook) {
      throw new Error('Slack webhook URL not configured');
    }

    const payload = {
      text: notification.subject,
      attachments: [{
        color: this.getSlackColor(notification),
        text: notification.message,
        ts: Math.floor(new Date(notification.timestamp).getTime() / 1000)
      }]
    };

    const response = await fetch(channel.config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    notification: NotificationMessage, 
    channel: NotificationChannel
  ): Promise<void> {
    const incident = this.incidents.get(notification.incidentId);
    
    const payload = {
      notification,
      incident,
      timestamp: notification.timestamp
    };

    const response = await fetch(channel.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...channel.config.headers
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }
  }

  // Helper methods
  private generateIncidentTitle(error: ApiError): string {
    return `${error.type} Error: ${error.message}`;
  }

  private generateIncidentDescription(error: ApiError, context?: Record<string, any>): string {
    let description = `Error Type: ${error.type}\n`;
    description += `Severity: ${error.severity}\n`;
    description += `Message: ${error.message}\n`;
    description += `User Message: ${error.userMessage}\n`;
    
    if (error.statusCode) {
      description += `Status Code: ${error.statusCode}\n`;
    }
    
    if (context) {
      description += `\nAdditional Context:\n${JSON.stringify(context, null, 2)}`;
    }
    
    return description;
  }

  private mapErrorSeverityToIncidentSeverity(severity: ErrorSeverity): IncidentSeverity {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return IncidentSeverity.CRITICAL;
      case ErrorSeverity.HIGH:
        return IncidentSeverity.HIGH;
      case ErrorSeverity.MEDIUM:
        return IncidentSeverity.MEDIUM;
      case ErrorSeverity.LOW:
        return IncidentSeverity.LOW;
      default:
        return IncidentSeverity.MEDIUM;
    }
  }

  private mapAlertSeverityToIncidentSeverity(severity: string): IncidentSeverity {
    switch (severity) {
      case 'critical':
        return IncidentSeverity.CRITICAL;
      case 'high':
        return IncidentSeverity.HIGH;
      case 'medium':
        return IncidentSeverity.MEDIUM;
      case 'low':
        return IncidentSeverity.LOW;
      default:
        return IncidentSeverity.MEDIUM;
    }
  }

  private determinePriority(error: ApiError): IncidentPriority {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        return IncidentPriority.P1;
      case ErrorSeverity.HIGH:
        return IncidentPriority.P2;
      case ErrorSeverity.MEDIUM:
        return IncidentPriority.P3;
      case ErrorSeverity.LOW:
        return IncidentPriority.P4;
      default:
        return IncidentPriority.P3;
    }
  }

  private determineAlertPriority(alert: AlertEvent): IncidentPriority {
    switch (alert.severity) {
      case 'critical':
        return IncidentPriority.P1;
      case 'high':
        return IncidentPriority.P2;
      case 'medium':
        return IncidentPriority.P3;
      case 'low':
        return IncidentPriority.P4;
      default:
        return IncidentPriority.P3;
    }
  }

  private assessImpact(error: ApiError, context?: Record<string, any>): IncidentImpact {
    const baseImpact: IncidentImpact = {
      userImpact: 'minimal',
      systemImpact: 'minimal',
      businessImpact: 'minimal',
      estimatedAffectedUsers: context?.affectedUsers || 1,
      affectedFeatures: context?.affectedFeatures || []
    };

    // Adjust impact based on error severity and type
    if (error.severity === ErrorSeverity.CRITICAL) {
      baseImpact.userImpact = 'severe';
      baseImpact.systemImpact = 'significant';
      baseImpact.businessImpact = 'significant';
    } else if (error.severity === ErrorSeverity.HIGH) {
      baseImpact.userImpact = 'significant';
      baseImpact.systemImpact = 'moderate';
      baseImpact.businessImpact = 'moderate';
    }

    return baseImpact;
  }

  private assessAlertImpact(alert: AlertEvent): IncidentImpact {
    return {
      userImpact: alert.severity === 'critical' ? 'severe' : 'moderate',
      systemImpact: alert.severity === 'critical' ? 'significant' : 'moderate',
      businessImpact: 'minimal',
      estimatedAffectedUsers: 0,
      affectedFeatures: []
    };
  }

  private addTimelineEntry(incident: Incident, entry: Omit<IncidentTimelineEntry, 'id' | 'timestamp'>): void {
    const timelineEntry: IncidentTimelineEntry = {
      id: `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    incident.timeline.push(timelineEntry);
  }

  private getEscalationTarget(level: number): string | null {
    // This would typically integrate with an on-call system
    const escalationTargets = [
      'on-call-engineer',
      'senior-engineer',
      'team-lead',
      'engineering-manager',
      'director'
    ];

    return escalationTargets[Math.min(level - 1, escalationTargets.length - 1)] || null;
  }

  private compareValues(actual: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'greater_than':
        return actual > threshold;
      case 'greater_equal':
        return actual >= threshold;
      case 'less_than':
        return actual < threshold;
      case 'less_equal':
        return actual <= threshold;
      case 'equal':
        return actual === threshold;
      default:
        return false;
    }
  }

  private generateNotificationSubject(incident: Incident, eventType: string): string {
    const eventLabels = {
      created: 'New Incident',
      status_changed: 'Incident Status Update',
      escalated: 'Incident Escalated',
      resolved: 'Incident Resolved'
    };

    const label = eventLabels[eventType as keyof typeof eventLabels] || 'Incident Update';
    return `[${incident.priority}] ${label}: ${incident.title}`;
  }

  private generateNotificationMessage(incident: Incident, eventType: string): string {
    let message = `Incident ID: ${incident.id}\n`;
    message += `Title: ${incident.title}\n`;
    message += `Severity: ${incident.severity}\n`;
    message += `Priority: ${incident.priority}\n`;
    message += `Status: ${incident.status}\n`;
    message += `Created: ${new Date(incident.createdAt).toLocaleString()}\n`;
    
    if (incident.assignedTo) {
      message += `Assigned to: ${incident.assignedTo}\n`;
    }
    
    if (eventType === 'escalated') {
      message += `Escalation Level: ${incident.escalationLevel}\n`;
    }
    
    message += `\nDescription: ${incident.description}`;
    
    return message;
  }

  private getSlackColor(notification: NotificationMessage): string {
    const incident = this.incidents.get(notification.incidentId);
    if (!incident) return '#808080';

    switch (incident.severity) {
      case IncidentSeverity.CRITICAL:
        return '#ff0000';
      case IncidentSeverity.HIGH:
        return '#ff8800';
      case IncidentSeverity.MEDIUM:
        return '#ffaa00';
      case IncidentSeverity.LOW:
        return '#0088ff';
      default:
        return '#808080';
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.escalationTimer) {
      clearInterval(this.escalationTimer);
      this.escalationTimer = undefined;
    }
    
    if (this.notificationTimer) {
      clearInterval(this.notificationTimer);
      this.notificationTimer = undefined;
    }
  }
}

// Export singleton instance
export const incidentManager = IncidentManager.getInstance();