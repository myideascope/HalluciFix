import { supabase } from './supabase';
import { dbPerformanceMonitor } from './databasePerformanceMonitor';

import { logger } from './logging';
export interface SecurityEvent {
  id: string;
  type: 'login_attempt' | 'failed_login' | 'suspicious_query' | 'unauthorized_access' | 'data_breach_attempt' | 'privilege_escalation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AuditLogEntry {
  id: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP' | 'ALTER';
  tableName: string;
  userId?: string;
  ipAddress?: string;
  timestamp: Date;
  rowsAffected?: number;
  queryHash?: string;
  metadata?: Record<string, any>;
}

export interface SecurityMetrics {
  failedLoginAttempts: number;
  suspiciousQueries: number;
  unauthorizedAccess: number;
  dataBreachAttempts: number;
  totalSecurityEvents: number;
  riskScore: number; // 0-100
}

export interface ComplianceReport {
  period: { start: Date; end: Date };
  totalOperations: number;
  auditedOperations: number;
  complianceScore: number; // 0-100
  violations: Array<{
    type: string;
    count: number;
    severity: string;
  }>;
  recommendations: string[];
}

/**
 * Database Security Monitor with audit logging and threat detection
 */
class DatabaseSecurityMonitor {
  private securityEvents: SecurityEvent[] = [];
  private auditLog: AuditLogEntry[] = [];
  private maxHistorySize: number = 50000;
  private securityCallbacks: Array<(event: SecurityEvent) => void> = [];
  private suspiciousPatterns: RegExp[] = [
    /union\s+select/i,
    /drop\s+table/i,
    /delete\s+from.*where\s+1\s*=\s*1/i,
    /insert\s+into.*values.*\(/i,
    /update.*set.*where\s+1\s*=\s*1/i,
    /exec\s*\(/i,
    /script\s*>/i
  ];

  constructor() {
    this.initializeSecurityMonitoring();
  }

  /**
   * Initialize security monitoring and audit logging
   */
  private async initializeSecurityMonitoring(): Promise<void> {
    // Set up periodic security scans
    this.startPeriodicSecurityScans();
    
    // Initialize audit logging tables if they don't exist
    await this.ensureAuditTables();
    
    logger.debug("✅ Database security monitoring initialized");
  }

  /**
   * Ensure audit logging tables exist
   */
  private async ensureAuditTables(): Promise<void> {
    try {
      // Check if audit tables exist, create if needed
      const { error } = await supabase
        .from('security_audit_log')
        .select('id')
        .limit(1);
      
      if (error && error.message.includes('does not exist')) {
        logger.debug("Creating security audit tables...");
        await this.createAuditTables();
      }
    } catch (error) {
      logger.warn("Could not verify audit tables:", { error });
    }
  }

  /**
   * Create audit logging tables
   */
  private async createAuditTables(): Promise<void> {
    const createTablesSQL = `
      -- Security audit log table
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operation VARCHAR(20) NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        user_id UUID,
        ip_address INET,
        user_agent TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        rows_affected INTEGER,
        query_hash VARCHAR(64),
        metadata JSONB,
        
        -- Indexes for performance
        INDEX idx_security_audit_log_timestamp (timestamp),
        INDEX idx_security_audit_log_user_id (user_id),
        INDEX idx_security_audit_log_operation (operation),
        INDEX idx_security_audit_log_table_name (table_name)
      );

      -- Security events table
      CREATE TABLE IF NOT EXISTS security_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        user_id UUID,
        ip_address INET,
        user_agent TEXT,
        description TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        metadata JSONB,
        resolved BOOLEAN DEFAULT FALSE,
        
        -- Indexes for performance
        INDEX idx_security_events_timestamp (timestamp),
        INDEX idx_security_events_severity (severity),
        INDEX idx_security_events_type (event_type),
        INDEX idx_security_events_user_id (user_id),
        INDEX idx_security_events_resolved (resolved)
      );

      -- Failed login attempts tracking
      CREATE TABLE IF NOT EXISTS failed_login_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255),
        ip_address INET NOT NULL,
        user_agent TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        attempt_count INTEGER DEFAULT 1,
        
        -- Indexes for performance
        INDEX idx_failed_login_attempts_ip (ip_address),
        INDEX idx_failed_login_attempts_email (email),
        INDEX idx_failed_login_attempts_timestamp (timestamp)
      );

      -- Data access log for sensitive operations
      CREATE TABLE IF NOT EXISTS data_access_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id VARCHAR(100),
        action VARCHAR(20) NOT NULL,
        ip_address INET,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        success BOOLEAN DEFAULT TRUE,
        metadata JSONB,
        
        -- Indexes for performance
        INDEX idx_data_access_log_user_id (user_id),
        INDEX idx_data_access_log_timestamp (timestamp),
        INDEX idx_data_access_log_resource (resource_type, resource_id),
        INDEX idx_data_access_log_action (action)
      );
    `;

    // Note: In a real implementation, these tables would be created via migrations
    logger.info("Audit tables SQL prepared:", { createTablesSQL });
  }

  /**
   * Log database operation for audit trail
   */
  async logDatabaseOperation(
    operation: AuditLogEntry['operation'],
    tableName: string,
    context?: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      rowsAffected?: number;
      queryHash?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const auditEntry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation,
      tableName,
      timestamp: new Date(),
      ...context
    };

    // Store in memory for quick access
    this.auditLog.push(auditEntry);
    
    // Keep memory usage under control
    if (this.auditLog.length > this.maxHistorySize) {
      this.auditLog = this.auditLog.slice(-this.maxHistorySize);
    }

    // Store in database for persistence
    try {
      await supabase.from('security_audit_log').insert({
        operation: auditEntry.operation,
        table_name: auditEntry.tableName,
        user_id: auditEntry.userId,
        ip_address: auditEntry.ipAddress,
        timestamp: auditEntry.timestamp.toISOString(),
        rows_affected: auditEntry.rowsAffected,
        query_hash: auditEntry.queryHash,
        metadata: auditEntry.metadata
      });
    } catch (error) {
      logger.error("Failed to store audit log:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Monitor and analyze query for suspicious patterns
   */
  async analyzeQuerySecurity(
    query: string,
    context?: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{ isSuspicious: boolean; threats: string[] }> {
    const threats: string[] = [];
    
    // Check for SQL injection patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(query)) {
        threats.push(`Potential SQL injection: ${pattern.source}`);
      }
    }

    // Check for unusual query patterns
    if (query.length > 10000) {
      threats.push('Unusually long query detected');
    }

    if (query.split(';').length > 5) {
      threats.push('Multiple statements in single query');
    }

    if (/\b(password|secret|key|token)\b/i.test(query)) {
      threats.push('Query contains sensitive keywords');
    }

    const isSuspicious = threats.length > 0;

    if (isSuspicious) {
      await this.logSecurityEvent({
        type: 'suspicious_query',
        severity: threats.length > 2 ? 'high' : 'medium',
        description: `Suspicious query detected: ${threats.join(', ')}`,
        metadata: {
          query: query.substring(0, 500), // Truncate for storage
          threats,
          ...context
        },
        ...context
      });
    }

    return { isSuspicious, threats };
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: `security_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...event
    };

    // Store in memory
    this.securityEvents.push(securityEvent);
    
    // Keep memory usage under control
    if (this.securityEvents.length > this.maxHistorySize) {
      this.securityEvents = this.securityEvents.slice(-this.maxHistorySize);
    }

    // Notify callbacks
    this.securityCallbacks.forEach(callback => {
      try {
        callback(securityEvent);
      } catch (error) {
        logger.error("Security callback failed:", error instanceof Error ? error : new Error(String(error)));
      }
    });

    // Store in database
    try {
      await supabase.from('security_events').insert({
        event_type: securityEvent.type,
        severity: securityEvent.severity,
        user_id: securityEvent.userId,
        ip_address: securityEvent.ipAddress,
        user_agent: securityEvent.userAgent,
        description: securityEvent.description,
        timestamp: securityEvent.timestamp.toISOString(),
        metadata: securityEvent.metadata
      });
    } catch (error) {
      logger.error("Failed to store security event:", error instanceof Error ? error : new Error(String(error)));
    }

    // Trigger immediate response for critical events
    if (securityEvent.severity === 'critical') {
      await this.handleCriticalSecurityEvent(securityEvent);
    }
  }

  /**
   * Track failed login attempt
   */
  async trackFailedLogin(
    email: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<void> {
    try {
      // Check existing failed attempts from this IP
      const { data: existingAttempts } = await supabase
        .from('failed_login_attempts')
        .select('*')
        .eq('ip_address', ipAddress)
        .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
        .order('timestamp', { ascending: false });

      const attemptCount = (existingAttempts?.length || 0) + 1;

      // Store failed attempt
      await supabase.from('failed_login_attempts').insert({
        email,
        ip_address: ipAddress,
        user_agent: userAgent,
        attempt_count: attemptCount
      });

      // Check if this constitutes a brute force attack
      if (attemptCount >= 5) {
        await this.logSecurityEvent({
          type: 'failed_login',
          severity: attemptCount >= 10 ? 'critical' : 'high',
          description: `Potential brute force attack: ${attemptCount} failed login attempts from ${ipAddress}`,
          ipAddress,
          userAgent,
          metadata: {
            email,
            attemptCount,
            timeWindow: '1 hour'
          }
        });
      }
    } catch (error) {
      logger.error("Failed to track login attempt:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Log data access for sensitive operations
   */
  async logDataAccess(
    userId: string,
    resourceType: string,
    action: string,
    context?: {
      resourceId?: string;
      ipAddress?: string;
      success?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      await supabase.from('data_access_log').insert({
        user_id: userId,
        resource_type: resourceType,
        resource_id: context?.resourceId,
        action,
        ip_address: context?.ipAddress,
        success: context?.success ?? true,
        metadata: context?.metadata
      });

      // Check for suspicious data access patterns
      await this.analyzeDataAccessPattern(userId, resourceType, action);
    } catch (error) {
      logger.error("Failed to log data access:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze data access patterns for anomalies
   */
  private async analyzeDataAccessPattern(
    userId: string,
    resourceType: string,
    action: string
  ): Promise<void> {
    try {
      // Check for unusual access patterns in the last hour
      const { data: recentAccess } = await supabase
        .from('data_access_log')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false });

      if (!recentAccess || recentAccess.length === 0) return;

      // Check for excessive access
      if (recentAccess.length > 100) {
        await this.logSecurityEvent({
          type: 'suspicious_query',
          severity: 'medium',
          userId,
          description: `Excessive data access: ${recentAccess.length} operations in the last hour`,
          metadata: {
            accessCount: recentAccess.length,
            resourceType,
            action
          }
        });
      }

      // Check for unusual resource access
      const uniqueResources = new Set(recentAccess.map(a => a.resource_id));
      if (uniqueResources.size > 50) {
        await this.logSecurityEvent({
          type: 'suspicious_query',
          severity: 'medium',
          userId,
          description: `Accessing unusually high number of resources: ${uniqueResources.size}`,
          metadata: {
            uniqueResourceCount: uniqueResources.size,
            resourceType,
            action
          }
        });
      }
    } catch (error) {
      logger.error("Failed to analyze data access pattern:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle critical security events
   */
  private async handleCriticalSecurityEvent(event: SecurityEvent): Promise<void> {
    logger.error("🚨 CRITICAL SECURITY EVENT:", event instanceof Error ? event : new Error(String(event)));

    // In a production environment, this would:
    // 1. Send immediate alerts to security team
    // 2. Potentially block the IP address
    // 3. Escalate to incident response team
    // 4. Create security incident ticket

    // For now, we'll log it prominently
    try {
      await supabase.from('security_events').update({
        metadata: {
          ...event.metadata,
          escalated: true,
          escalation_timestamp: new Date().toISOString()
        }
      }).eq('id', event.id);
    } catch (error) {
      logger.error("Failed to escalate security event:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate security metrics
   */
  async getSecurityMetrics(timeWindow: number = 24 * 60 * 60 * 1000): Promise<SecurityMetrics> {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentEvents = this.securityEvents.filter(e => e.timestamp >= cutoff);

    const failedLoginAttempts = recentEvents.filter(e => e.type === 'failed_login').length;
    const suspiciousQueries = recentEvents.filter(e => e.type === 'suspicious_query').length;
    const unauthorizedAccess = recentEvents.filter(e => e.type === 'unauthorized_access').length;
    const dataBreachAttempts = recentEvents.filter(e => e.type === 'data_breach_attempt').length;

    // Calculate risk score based on events and severity
    let riskScore = 0;
    recentEvents.forEach(event => {
      switch (event.severity) {
        case 'low': riskScore += 1; break;
        case 'medium': riskScore += 5; break;
        case 'high': riskScore += 15; break;
        case 'critical': riskScore += 50; break;
      }
    });

    // Normalize risk score to 0-100
    riskScore = Math.min(100, riskScore);

    return {
      failedLoginAttempts,
      suspiciousQueries,
      unauthorizedAccess,
      dataBreachAttempts,
      totalSecurityEvents: recentEvents.length,
      riskScore
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    try {
      // Get audit log entries for the period
      const { data: auditEntries } = await supabase
        .from('security_audit_log')
        .select('*')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString());

      // Get security events for the period
      const { data: securityEvents } = await supabase
        .from('security_events')
        .select('*')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString());

      const totalOperations = auditEntries?.length || 0;
      const auditedOperations = totalOperations; // All operations are audited

      // Calculate compliance score
      const violations = this.analyzeComplianceViolations(securityEvents || []);
      const complianceScore = Math.max(0, 100 - violations.reduce((sum, v) => sum + v.count * 2, 0));

      const recommendations = this.generateComplianceRecommendations(violations);

      return {
        period: { start: startDate, end: endDate },
        totalOperations,
        auditedOperations,
        complianceScore,
        violations,
        recommendations
      };
    } catch (error) {
      logger.error("Failed to generate compliance report:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Analyze compliance violations
   */
  private analyzeComplianceViolations(events: any[]): Array<{ type: string; count: number; severity: string }> {
    const violations = new Map<string, { count: number; severity: string }>();

    events.forEach(event => {
      const key = event.event_type;
      const existing = violations.get(key) || { count: 0, severity: 'low' };
      
      violations.set(key, {
        count: existing.count + 1,
        severity: this.getHigherSeverity(existing.severity, event.severity)
      });
    });

    return Array.from(violations.entries()).map(([type, data]) => ({
      type,
      ...data
    }));
  }

  /**
   * Get higher severity between two severities
   */
  private getHigherSeverity(a: string, b: string): string {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const indexA = severityOrder.indexOf(a);
    const indexB = severityOrder.indexOf(b);
    return severityOrder[Math.max(indexA, indexB)];
  }

  /**
   * Generate compliance recommendations
   */
  private generateComplianceRecommendations(violations: Array<{ type: string; count: number; severity: string }>): string[] {
    const recommendations: string[] = [];

    violations.forEach(violation => {
      switch (violation.type) {
        case 'failed_login':
          recommendations.push('Implement stronger authentication measures and account lockout policies');
          break;
        case 'suspicious_query':
          recommendations.push('Review and strengthen input validation and query sanitization');
          break;
        case 'unauthorized_access':
          recommendations.push('Review access controls and implement principle of least privilege');
          break;
        case 'data_breach_attempt':
          recommendations.push('Enhance data protection measures and access monitoring');
          break;
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Security posture is good. Continue monitoring and regular security reviews.');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Start periodic security scans
   */
  private startPeriodicSecurityScans(): void {
    // Perform security scan every 15 minutes
    setInterval(async () => {
      try {
        await this.performSecurityScan();
      } catch (error) {
        logger.error("Periodic security scan failed:", error instanceof Error ? error : new Error(String(error)));
      }
    }, 15 * 60 * 1000); // 15 minutes
  }

  /**
   * Perform comprehensive security scan
   */
  private async performSecurityScan(): Promise<void> {
    // Check for suspicious login patterns
    await this.scanForSuspiciousLogins();
    
    // Check for unusual data access patterns
    await this.scanForUnusualDataAccess();
    
    // Check for potential privilege escalation
    await this.scanForPrivilegeEscalation();
  }

  /**
   * Scan for suspicious login patterns
   */
  private async scanForSuspiciousLogins(): Promise<void> {
    try {
      const { data: recentFailures } = await supabase
        .from('failed_login_attempts')
        .select('ip_address, COUNT(*) as attempt_count')
        .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .group('ip_address')
        .having('COUNT(*) > 10');

      if (recentFailures && recentFailures.length > 0) {
        for (const failure of recentFailures) {
          await this.logSecurityEvent({
            type: 'failed_login',
            severity: 'high',
            ipAddress: failure.ip_address,
            description: `Potential brute force attack: ${failure.attempt_count} failed attempts from ${failure.ip_address}`,
            metadata: { attemptCount: failure.attempt_count }
          });
        }
      }
    } catch (error) {
      logger.error("Failed to scan for suspicious logins:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Scan for unusual data access patterns
   */
  private async scanForUnusualDataAccess(): Promise<void> {
    try {
      const { data: heavyUsers } = await supabase
        .from('data_access_log')
        .select('user_id, COUNT(*) as access_count')
        .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .group('user_id')
        .having('COUNT(*) > 500');

      if (heavyUsers && heavyUsers.length > 0) {
        for (const user of heavyUsers) {
          await this.logSecurityEvent({
            type: 'suspicious_query',
            severity: 'medium',
            userId: user.user_id,
            description: `Unusual data access pattern: ${user.access_count} operations in the last hour`,
            metadata: { accessCount: user.access_count }
          });
        }
      }
    } catch (error) {
      logger.error("Failed to scan for unusual data access:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Scan for potential privilege escalation
   */
  private async scanForPrivilegeEscalation(): Promise<void> {
    // This would check for users accessing resources above their privilege level
    // Implementation would depend on the specific authorization model
    logger.debug("Privilege escalation scan completed (placeholder)");
  }

  /**
   * Subscribe to security events
   */
  onSecurityEvent(callback: (event: SecurityEvent) => void): () => void {
    this.securityCallbacks.push(callback);
    
    return () => {
      const index = this.securityCallbacks.indexOf(callback);
      if (index > -1) {
        this.securityCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get recent security events
   */
  getRecentSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get audit log entries
   */
  getAuditLog(limit: number = 100): AuditLogEntry[] {
    return this.auditLog
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Clear security history
   */
  clearSecurityHistory(): void {
    this.securityEvents = [];
    this.auditLog = [];
  }
}

// Export singleton instance
export const dbSecurityMonitor = new DatabaseSecurityMonitor();
export default dbSecurityMonitor;