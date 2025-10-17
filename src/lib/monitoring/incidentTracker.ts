/**
 * Enhanced Incident Tracking and Management System
 * Integrates with health monitoring and infrastructure metrics
 */

import { healthCheckSystem, HealthStatus, SystemHealthResult } from './healthCheckSystem';
import { infrastructureMetrics, MetricAlert, ResourceMetrics } from './infrastructureMetrics';
import { incidentManager, Incident, IncidentSeverity, IncidentStatus } from '../errors/incidentManager';

export interface SystemIncident extends Omit<Incident, 'sourceType' | 'sourceId'> {
  sourceType: 'health_check' | 'infrastructure_metric' | 'service_outage' | 'manual';
  sourceId: string;
  healthData?: SystemHealthResult;
  metricsData?: ResourceMetrics;
  alertData?: MetricAlert;
  autoResolved?: boolean;
  resolutionSteps?: string[];
}

export interface IncidentPattern {
  id: string;
  name: string;
  description: string;
  conditions: PatternCondition[];
  severity: IncidentSeverity;
  autoCreateIncident: boolean;
  escalationRules?: EscalationRule[];
}

export interface PatternCondition {
  type: 'health_status' | 'metric_threshold' | 'service_down' | 'error_rate' | 'time_based';
  metric?: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains';
  value: any;
  duration?: number; // milliseconds
}

export interface EscalationRule {
  level: number;
  timeThreshold: number; // minutes
  actions: EscalationAction[];
}

export interface EscalationAction {
  type: 'notify' | 'assign' | 'escalate' | 'auto_resolve' | 'run_script';
  config: Record<string, any>;
}

export interface PostMortemTemplate {
  id: string;
  name: string;
  sections: PostMortemSection[];
}

export interface PostMortemSection {
  title: string;
  content: string;
  required: boolean;
  type: 'text' | 'timeline' | 'metrics' | 'actions';
}

export interface PostMortem {
  id: string;
  incidentId: string;
  title: string;
  summary: string;
  timeline: PostMortemTimelineEntry[];
  rootCause: string;
  impactAssessment: string;
  lessonsLearned: string[];
  actionItems: ActionItem[];
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'review' | 'published';
}

export interface PostMortemTimelineEntry {
  timestamp: string;
  event: string;
  impact: string;
  actions: string;
}

export interface ActionItem {
  id: string;
  description: string;
  assignee: string;
  dueDate: string;
  status: 'open' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Enhanced Incident Tracker
 * Provides comprehensive incident tracking with health and metrics integration
 */
export class IncidentTracker {
  private incidents: Map<string, SystemIncident> = new Map();
  private patterns: Map<string, IncidentPattern> = new Map();
  private postMortems: Map<string, PostMortem> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private incidentCallbacks: Array<(incident: SystemIncident) => void> = [];

  constructor() {
    this.setupDefaultPatterns();
    this.startMonitoring();
  }

  /**
   * Start monitoring for incident patterns
   */
  startMonitoring(intervalMs = 30000): void {
    this.monitoringInterval = setInterval(() => {
      this.checkIncidentPatterns();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Create incident from health check failure
   */
  createIncidentFromHealthCheck(healthResult: SystemHealthResult): SystemIncident | null {
    if (healthResult.status === HealthStatus.HEALTHY) return null;

    const failedChecks = Object.entries(healthResult.checks)
      .filter(([_, result]) => result.status !== HealthStatus.HEALTHY)
      .map(([name, result]) => `${name}: ${result.message}`)
      .join(', ');

    const incident: SystemIncident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: `System Health Check Failed: ${healthResult.status}`,
      description: `Health check failures detected: ${failedChecks}`,
      severity: this.mapHealthStatusToSeverity(healthResult.status),
      priority: this.determinePriorityFromHealth(healthResult),
      status: IncidentStatus.OPEN,
      createdAt: healthResult.timestamp,
      updatedAt: healthResult.timestamp,
      
      sourceType: 'health_check',
      sourceId: `health_${healthResult.timestamp}`,
      
      errorCount: healthResult.summary.critical + healthResult.summary.unhealthy,
      affectedUsers: 0, // Will be estimated based on impact
      
      escalationLevel: 0,
      timeline: [],
      
      impact: {
        userImpact: healthResult.status === HealthStatus.CRITICAL ? 'severe' : 'moderate',
        systemImpact: healthResult.status === HealthStatus.CRITICAL ? 'significant' : 'moderate',
        businessImpact: 'minimal',
        estimatedAffectedUsers: 0,
        affectedFeatures: []
      },
      
      healthData: healthResult
    };

    this.addTimelineEntry(incident, {
      type: 'created',
      author: 'system',
      message: `Incident created from health check failure: ${healthResult.status}`
    });

    this.incidents.set(incident.id, incident);
    this.notifyIncidentCallbacks(incident);

    console.log(`[IncidentTracker] Created incident ${incident.id} from health check`);
    return incident;
  }

  /**
   * Create incident from infrastructure metric alert
   */
  createIncidentFromMetricAlert(alert: MetricAlert, metrics: ResourceMetrics): SystemIncident {
    const incident: SystemIncident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: `Infrastructure Alert: ${alert.threshold.metric}`,
      description: alert.message,
      severity: this.mapAlertSeverityToIncidentSeverity(alert.threshold.severity),
      priority: this.determinePriorityFromAlert(alert),
      status: IncidentStatus.OPEN,
      createdAt: alert.timestamp,
      updatedAt: alert.timestamp,
      
      sourceType: 'infrastructure_metric',
      sourceId: alert.id,
      
      errorCount: 1,
      affectedUsers: 0,
      
      escalationLevel: 0,
      timeline: [],
      
      impact: {
        userImpact: alert.threshold.severity === 'critical' ? 'significant' : 'moderate',
        systemImpact: alert.threshold.severity === 'critical' ? 'significant' : 'moderate',
        businessImpact: 'minimal',
        estimatedAffectedUsers: 0,
        affectedFeatures: []
      },
      
      alertData: alert,
      metricsData: metrics
    };

    this.addTimelineEntry(incident, {
      type: 'created',
      author: 'system',
      message: `Incident created from infrastructure metric alert: ${alert.threshold.metric}`
    });

    this.incidents.set(incident.id, incident);
    this.notifyIncidentCallbacks(incident);

    console.log(`[IncidentTracker] Created incident ${incident.id} from metric alert`);
    return incident;
  }

  /**
   * Create manual incident
   */
  createManualIncident(
    title: string,
    description: string,
    severity: IncidentSeverity,
    author: string = 'user'
  ): SystemIncident {
    const incident: SystemIncident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      description,
      severity,
      priority: this.mapSeverityToPriority(severity),
      status: IncidentStatus.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      sourceType: 'manual',
      sourceId: `manual_${Date.now()}`,
      
      errorCount: 0,
      affectedUsers: 0,
      
      escalationLevel: 0,
      timeline: [],
      
      impact: {
        userImpact: 'minimal',
        systemImpact: 'minimal',
        businessImpact: 'minimal',
        estimatedAffectedUsers: 0,
        affectedFeatures: []
      }
    };

    this.addTimelineEntry(incident, {
      type: 'created',
      author,
      message: `Manual incident created: ${title}`
    });

    this.incidents.set(incident.id, incident);
    this.notifyIncidentCallbacks(incident);

    return incident;
  }

  /**
   * Update incident
   */
  updateIncident(
    incidentId: string,
    updates: Partial<SystemIncident>,
    author: string = 'system'
  ): SystemIncident | null {
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
        
        // Check if this was auto-resolved
        if (author === 'system') {
          updatedIncident.autoResolved = true;
        }
      } else if (updates.status === IncidentStatus.CLOSED) {
        updatedIncident.closedAt = new Date().toISOString();
      }

      this.addTimelineEntry(updatedIncident, {
        type: 'updated',
        author,
        message: `Status changed from ${previousStatus} to ${updates.status}`
      });
    }

    this.incidents.set(incidentId, updatedIncident);
    return updatedIncident;
  }

  /**
   * Auto-resolve incident based on conditions
   */
  attemptAutoResolution(incidentId: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.status === IncidentStatus.RESOLVED) return false;

    let canResolve = false;
    let resolutionReason = '';

    // Check if health-based incident can be resolved
    if (incident.sourceType === 'health_check') {
      const currentHealth = healthCheckSystem.executeAllChecks();
      currentHealth.then(health => {
        if (health.status === HealthStatus.HEALTHY) {
          canResolve = true;
          resolutionReason = 'Health checks are now passing';
        }
      });
    }

    // Check if metric-based incident can be resolved
    if (incident.sourceType === 'infrastructure_metric' && incident.alertData) {
      const currentMetrics = infrastructureMetrics.getRecentMetrics(1)[0];
      if (currentMetrics) {
        const currentValue = this.extractMetricValue(currentMetrics, incident.alertData.threshold.metric);
        if (currentValue !== undefined) {
          const stillAlerting = this.evaluateThreshold(currentValue, incident.alertData.threshold);
          if (!stillAlerting) {
            canResolve = true;
            resolutionReason = `Metric ${incident.alertData.threshold.metric} is now within normal range`;
          }
        }
      }
    }

    if (canResolve) {
      this.updateIncident(incidentId, {
        status: IncidentStatus.RESOLVED,
        resolution: resolutionReason,
        resolutionSteps: [`Auto-resolved: ${resolutionReason}`]
      }, 'system');

      return true;
    }

    return false;
  }

  /**
   * Get incident by ID
   */
  getIncident(incidentId: string): SystemIncident | null {
    return this.incidents.get(incidentId) || null;
  }

  /**
   * Get all incidents with filters
   */
  getIncidents(filters?: {
    status?: IncidentStatus[];
    severity?: IncidentSeverity[];
    sourceType?: SystemIncident['sourceType'][];
    limit?: number;
  }): SystemIncident[] {
    let incidents = Array.from(this.incidents.values());

    if (filters) {
      if (filters.status) {
        incidents = incidents.filter(i => filters.status!.includes(i.status));
      }
      if (filters.severity) {
        incidents = incidents.filter(i => filters.severity!.includes(i.severity));
      }
      if (filters.sourceType) {
        incidents = incidents.filter(i => filters.sourceType!.includes(i.sourceType));
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
   * Create post-mortem for incident
   */
  createPostMortem(
    incidentId: string,
    title: string,
    summary: string,
    author: string
  ): PostMortem {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error('Incident not found');
    }

    const postMortem: PostMortem = {
      id: `postmortem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      incidentId,
      title,
      summary,
      timeline: this.generatePostMortemTimeline(incident),
      rootCause: '',
      impactAssessment: this.generateImpactAssessment(incident),
      lessonsLearned: [],
      actionItems: [],
      createdAt: new Date().toISOString(),
      createdBy: author,
      status: 'draft'
    };

    this.postMortems.set(postMortem.id, postMortem);
    return postMortem;
  }

  /**
   * Get post-mortem by ID
   */
  getPostMortem(postMortemId: string): PostMortem | null {
    return this.postMortems.get(postMortemId) || null;
  }

  /**
   * Get all post-mortems
   */
  getPostMortems(): PostMortem[] {
    return Array.from(this.postMortems.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Subscribe to incident notifications
   */
  onIncident(callback: (incident: SystemIncident) => void): () => void {
    this.incidentCallbacks.push(callback);
    return () => {
      const index = this.incidentCallbacks.indexOf(callback);
      if (index > -1) {
        this.incidentCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Check for incident patterns
   */
  private async checkIncidentPatterns(): Promise<void> {
    for (const pattern of this.patterns.values()) {
      if (!pattern.autoCreateIncident) continue;

      const matches = await this.evaluatePattern(pattern);
      if (matches) {
        // Check if we already have an open incident for this pattern
        const existingIncident = Array.from(this.incidents.values()).find(i => 
          i.sourceId === pattern.id && 
          (i.status === IncidentStatus.OPEN || i.status === IncidentStatus.INVESTIGATING)
        );

        if (!existingIncident) {
          this.createIncidentFromPattern(pattern);
        }
      }
    }

    // Check for auto-resolution opportunities
    const openIncidents = this.getIncidents({ 
      status: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] 
    });

    for (const incident of openIncidents) {
      this.attemptAutoResolution(incident.id);
    }
  }

  /**
   * Evaluate incident pattern
   */
  private async evaluatePattern(pattern: IncidentPattern): Promise<boolean> {
    for (const condition of pattern.conditions) {
      const matches = await this.evaluateCondition(condition);
      if (!matches) return false;
    }
    return true;
  }

  /**
   * Evaluate individual condition
   */
  private async evaluateCondition(condition: PatternCondition): Promise<boolean> {
    switch (condition.type) {
      case 'health_status':
        const health = await healthCheckSystem.executeAllChecks();
        return this.compareValues(health.status, condition.value, condition.operator);
      
      case 'metric_threshold':
        const metrics = infrastructureMetrics.getRecentMetrics(1)[0];
        if (!metrics || !condition.metric) return false;
        const value = this.extractMetricValue(metrics, condition.metric);
        return value !== undefined && this.compareValues(value, condition.value, condition.operator);
      
      case 'service_down':
        const services = infrastructureMetrics.getServiceAvailability();
        const downServices = services.filter(s => s.status === 'down').length;
        return this.compareValues(downServices, condition.value, condition.operator);
      
      default:
        return false;
    }
  }

  /**
   * Create incident from pattern match
   */
  private createIncidentFromPattern(pattern: IncidentPattern): SystemIncident {
    const incident: SystemIncident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: `Pattern Detected: ${pattern.name}`,
      description: pattern.description,
      severity: pattern.severity,
      priority: this.mapSeverityToPriority(pattern.severity),
      status: IncidentStatus.OPEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      sourceType: 'manual', // Pattern-based
      sourceId: pattern.id,
      
      errorCount: 0,
      affectedUsers: 0,
      
      escalationLevel: 0,
      timeline: [],
      
      impact: {
        userImpact: 'minimal',
        systemImpact: 'minimal',
        businessImpact: 'minimal',
        estimatedAffectedUsers: 0,
        affectedFeatures: []
      }
    };

    this.addTimelineEntry(incident, {
      type: 'created',
      author: 'system',
      message: `Incident created from pattern: ${pattern.name}`
    });

    this.incidents.set(incident.id, incident);
    this.notifyIncidentCallbacks(incident);

    return incident;
  }

  /**
   * Setup default incident patterns
   */
  private setupDefaultPatterns(): void {
    const defaultPatterns: IncidentPattern[] = [
      {
        id: 'critical_health_failure',
        name: 'Critical Health Check Failure',
        description: 'Multiple critical health checks are failing',
        conditions: [
          {
            type: 'health_status',
            operator: 'equals',
            value: HealthStatus.CRITICAL
          }
        ],
        severity: IncidentSeverity.CRITICAL,
        autoCreateIncident: true
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        description: 'Memory usage is consistently high',
        conditions: [
          {
            type: 'metric_threshold',
            metric: 'memory.percentage',
            operator: 'greater_than',
            value: 90
          }
        ],
        severity: IncidentSeverity.HIGH,
        autoCreateIncident: true
      },
      {
        id: 'multiple_services_down',
        name: 'Multiple Services Down',
        description: 'Multiple services are unavailable',
        conditions: [
          {
            type: 'service_down',
            operator: 'greater_than',
            value: 2
          }
        ],
        severity: IncidentSeverity.HIGH,
        autoCreateIncident: true
      }
    ];

    defaultPatterns.forEach(pattern => {
      this.patterns.set(pattern.id, pattern);
    });
  }

  // Helper methods
  private mapHealthStatusToSeverity(status: HealthStatus): IncidentSeverity {
    switch (status) {
      case HealthStatus.CRITICAL:
        return IncidentSeverity.CRITICAL;
      case HealthStatus.UNHEALTHY:
        return IncidentSeverity.HIGH;
      case HealthStatus.DEGRADED:
        return IncidentSeverity.MEDIUM;
      default:
        return IncidentSeverity.LOW;
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

  private mapSeverityToPriority(severity: IncidentSeverity): any {
    // This would map to the IncidentPriority enum from the incident manager
    switch (severity) {
      case IncidentSeverity.CRITICAL:
        return 'P1';
      case IncidentSeverity.HIGH:
        return 'P2';
      case IncidentSeverity.MEDIUM:
        return 'P3';
      case IncidentSeverity.LOW:
        return 'P4';
      default:
        return 'P3';
    }
  }

  private determinePriorityFromHealth(health: SystemHealthResult): any {
    return this.mapSeverityToPriority(this.mapHealthStatusToSeverity(health.status));
  }

  private determinePriorityFromAlert(alert: MetricAlert): any {
    return this.mapSeverityToPriority(this.mapAlertSeverityToIncidentSeverity(alert.threshold.severity));
  }

  private addTimelineEntry(incident: SystemIncident, entry: any): void {
    const timelineEntry = {
      id: `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    incident.timeline.push(timelineEntry);
  }

  private notifyIncidentCallbacks(incident: SystemIncident): void {
    this.incidentCallbacks.forEach(callback => {
      try {
        callback(incident);
      } catch (error) {
        console.error('Incident callback failed:', error);
      }
    });
  }

  private extractMetricValue(metrics: ResourceMetrics, metricPath: string): number | undefined {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return typeof value === 'number' ? value : undefined;
  }

  private evaluateThreshold(value: number, threshold: any): boolean {
    switch (threshold.operator) {
      case 'greater_than':
        return value > threshold.value;
      case 'less_than':
        return value < threshold.value;
      case 'equal':
        return value === threshold.value;
      case 'not_equal':
        return value !== threshold.value;
      default:
        return false;
    }
  }

  private compareValues(actual: any, expected: any, operator: string): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'greater_than':
        return actual > expected;
      case 'less_than':
        return actual < expected;
      case 'contains':
        return String(actual).includes(String(expected));
      default:
        return false;
    }
  }

  private generatePostMortemTimeline(incident: SystemIncident): PostMortemTimelineEntry[] {
    return incident.timeline.map(entry => ({
      timestamp: entry.timestamp,
      event: entry.message,
      impact: 'System impact assessment needed',
      actions: 'Actions taken need to be documented'
    }));
  }

  private generateImpactAssessment(incident: SystemIncident): string {
    let assessment = `Incident Severity: ${incident.severity}\n`;
    assessment += `User Impact: ${incident.impact.userImpact}\n`;
    assessment += `System Impact: ${incident.impact.systemImpact}\n`;
    assessment += `Business Impact: ${incident.impact.businessImpact}\n`;
    
    if (incident.healthData) {
      assessment += `\nHealth Check Results:\n`;
      assessment += `- Overall Status: ${incident.healthData.status}\n`;
      assessment += `- Failed Checks: ${incident.healthData.summary.critical + incident.healthData.summary.unhealthy}\n`;
    }
    
    if (incident.metricsData) {
      assessment += `\nInfrastructure Metrics:\n`;
      if (incident.metricsData.memory) {
        assessment += `- Memory Usage: ${incident.metricsData.memory.percentage.toFixed(1)}%\n`;
      }
      if (incident.metricsData.cpu) {
        assessment += `- CPU Usage: ${incident.metricsData.cpu.usage.toFixed(1)}%\n`;
      }
    }
    
    return assessment;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.incidents.clear();
    this.patterns.clear();
    this.postMortems.clear();
    this.incidentCallbacks = [];
  }
}

// Export singleton instance
export const incidentTracker = new IncidentTracker();
export default incidentTracker;