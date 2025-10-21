/**
 * Escalation Matrix Configuration
 * Defines escalation rules and timing for different types of test failures
 */

export interface EscalationRule {
  trigger: EscalationTrigger;
  actions: EscalationAction[];
  conditions: EscalationCondition[];
}

export interface EscalationTrigger {
  type: 'test_failure' | 'coverage_regression' | 'performance_regression' | 'security_vulnerability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  duration_threshold?: number; // minutes
  failure_count_threshold?: number;
  consecutive_failures?: number;
}

export interface EscalationAction {
  type: 'slack_notification' | 'github_issue' | 'email_alert' | 'pager_duty' | 'block_deployment';
  delay: number; // minutes
  recipients?: string[];
  channels?: string[];
  template?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface EscalationCondition {
  type: 'time_of_day' | 'day_of_week' | 'branch_type' | 'file_changes' | 'team_availability';
  value: string | string[];
  operator: 'equals' | 'contains' | 'not_equals' | 'in' | 'not_in';
}

export interface EscalationState {
  trigger_id: string;
  escalation_level: number;
  started_at: Date;
  last_action_at: Date;
  actions_taken: EscalationActionResult[];
  resolved: boolean;
  resolved_at?: Date;
}

export interface EscalationActionResult {
  action: EscalationAction;
  executed_at: Date;
  success: boolean;
  error_message?: string;
  notification_id?: string;
}

export class EscalationMatrix {
  private rules: EscalationRule[];
  private activeEscalations: Map<string, EscalationState>;
  private timers: Map<string, NodeJS.Timeout>;

  constructor() {
    this.rules = [];
    this.activeEscalations = new Map();
    this.timers = new Map();
    this.initializeDefaultRules();
  }

  /**
   * Process a test failure and trigger appropriate escalations
   */
  async processFailure(
    failureId: string,
    trigger: EscalationTrigger,
    context: Record<string, any>
  ): Promise<void> {
    const matchingRules = this.findMatchingRules(trigger, context);
    
    for (const rule of matchingRules) {
      await this.startEscalation(failureId, rule, trigger, context);
    }
  }

  /**
   * Resolve an escalation (e.g., when tests pass again)
   */
  async resolveEscalation(failureId: string): Promise<void> {
    const escalation = this.activeEscalations.get(failureId);
    if (!escalation || escalation.resolved) return;

    escalation.resolved = true;
    escalation.resolved_at = new Date();

    // Clear any pending timers
    const timer = this.timers.get(failureId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(failureId);
    }

    // Send resolution notification
    await this.sendResolutionNotification(escalation);

    console.log(`Escalation resolved for ${failureId}`);
  }

  /**
   * Start escalation process for a rule
   */
  private async startEscalation(
    failureId: string,
    rule: EscalationRule,
    trigger: EscalationTrigger,
    context: Record<string, any>
  ): Promise<void> {
    const escalationId = `${failureId}_${rule.trigger.type}_${rule.trigger.severity}`;
    
    // Check if escalation already exists
    if (this.activeEscalations.has(escalationId)) {
      await this.continueEscalation(escalationId, rule);
      return;
    }

    // Create new escalation state
    const escalation: EscalationState = {
      trigger_id: escalationId,
      escalation_level: 0,
      started_at: new Date(),
      last_action_at: new Date(),
      actions_taken: [],
      resolved: false,
    };

    this.activeEscalations.set(escalationId, escalation);

    // Execute immediate actions (delay = 0)
    const immediateActions = rule.actions.filter(action => action.delay === 0);
    for (const action of immediateActions) {
      await this.executeAction(escalationId, action, context);
    }

    // Schedule delayed actions
    const delayedActions = rule.actions.filter(action => action.delay > 0);
    for (const action of delayedActions) {
      this.scheduleAction(escalationId, action, context);
    }
  }

  /**
   * Continue existing escalation (e.g., for repeated failures)
   */
  private async continueEscalation(escalationId: string, rule: EscalationRule): Promise<void> {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation || escalation.resolved) return;

    escalation.escalation_level++;
    escalation.last_action_at = new Date();

    // Execute escalation-level specific actions
    const levelActions = rule.actions.filter(
      action => action.delay === escalation.escalation_level * 15 // 15 min intervals
    );

    for (const action of levelActions) {
      await this.executeAction(escalationId, action, {});
    }
  }

  /**
   * Execute an escalation action
   */
  private async executeAction(
    escalationId: string,
    action: EscalationAction,
    context: Record<string, any>
  ): Promise<void> {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation || escalation.resolved) return;

    const actionResult: EscalationActionResult = {
      action,
      executed_at: new Date(),
      success: false,
    };

    try {
      switch (action.type) {
        case 'slack_notification':
          await this.sendSlackEscalation(action, context);
          break;
        case 'github_issue':
          await this.createGitHubIssue(action, context);
          break;
        case 'email_alert':
          await this.sendEmailAlert(action, context);
          break;
        case 'pager_duty':
          await this.triggerPagerDuty(action, context);
          break;
        case 'block_deployment':
          await this.blockDeployment(action, context);
          break;
      }

      actionResult.success = true;
      console.log(`Escalation action executed: ${action.type} for ${escalationId}`);
    } catch (error) {
      actionResult.error_message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Escalation action failed: ${action.type} for ${escalationId}:`, error);
    }

    escalation.actions_taken.push(actionResult);
  }

  /**
   * Schedule a delayed action
   */
  private scheduleAction(
    escalationId: string,
    action: EscalationAction,
    context: Record<string, any>
  ): void {
    const timer = setTimeout(async () => {
      await this.executeAction(escalationId, action, context);
      this.timers.delete(escalationId);
    }, action.delay * 60 * 1000); // Convert minutes to milliseconds

    this.timers.set(escalationId, timer);
  }

  /**
   * Find rules that match the trigger and context
   */
  private findMatchingRules(
    trigger: EscalationTrigger,
    context: Record<string, any>
  ): EscalationRule[] {
    return this.rules.filter(rule => {
      // Check trigger match
      if (rule.trigger.type !== trigger.type || rule.trigger.severity !== trigger.severity) {
        return false;
      }

      // Check conditions
      return rule.conditions.every(condition => this.evaluateCondition(condition, context));
    });
  }

  /**
   * Evaluate a condition against context
   */
  private evaluateCondition(condition: EscalationCondition, context: Record<string, any>): boolean {
    const contextValue = context[condition.type];
    
    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'contains':
        return typeof contextValue === 'string' && contextValue.includes(condition.value as string);
      case 'not_equals':
        return contextValue !== condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue);
      default:
        return false;
    }
  }

  /**
   * Action implementations
   */
  private async sendSlackEscalation(action: EscalationAction, context: Record<string, any>): Promise<void> {
    // Implementation would integrate with Slack API
    console.log('Sending Slack escalation notification');
  }

  private async createGitHubIssue(action: EscalationAction, context: Record<string, any>): Promise<void> {
    // Implementation would integrate with GitHub API
    console.log('Creating GitHub issue for escalation');
  }

  private async sendEmailAlert(action: EscalationAction, context: Record<string, any>): Promise<void> {
    // Implementation would integrate with email service
    console.log('Sending email alert');
  }

  private async triggerPagerDuty(action: EscalationAction, context: Record<string, any>): Promise<void> {
    // Implementation would integrate with PagerDuty API
    console.log('Triggering PagerDuty alert');
  }

  private async blockDeployment(action: EscalationAction, context: Record<string, any>): Promise<void> {
    // Implementation would set deployment gates
    console.log('Blocking deployment due to critical failure');
  }

  private async sendResolutionNotification(escalation: EscalationState): Promise<void> {
    // Send notification that the issue has been resolved
    console.log(`Sending resolution notification for ${escalation.trigger_id}`);
  }

  /**
   * Initialize default escalation rules
   */
  private initializeDefaultRules(): void {
    // Critical test failures
    this.rules.push({
      trigger: {
        type: 'test_failure',
        severity: 'critical',
      },
      actions: [
        {
          type: 'slack_notification',
          delay: 0,
          channels: ['#test-failures', '#dev-alerts'],
          priority: 'critical',
        },
        {
          type: 'github_issue',
          delay: 0,
          priority: 'critical',
        },
        {
          type: 'email_alert',
          delay: 5,
          recipients: ['dev-team@company.com'],
          priority: 'high',
        },
        {
          type: 'pager_duty',
          delay: 15,
          priority: 'critical',
        },
        {
          type: 'block_deployment',
          delay: 0,
          priority: 'critical',
        },
      ],
      conditions: [],
    });

    // High severity test failures
    this.rules.push({
      trigger: {
        type: 'test_failure',
        severity: 'high',
      },
      actions: [
        {
          type: 'slack_notification',
          delay: 0,
          channels: ['#test-failures'],
          priority: 'high',
        },
        {
          type: 'github_issue',
          delay: 10,
          priority: 'high',
        },
        {
          type: 'email_alert',
          delay: 30,
          recipients: ['dev-team@company.com'],
          priority: 'medium',
        },
      ],
      conditions: [
        {
          type: 'branch_type',
          value: ['main', 'develop', 'release/*'],
          operator: 'in',
        },
      ],
    });

    // Coverage regression
    this.rules.push({
      trigger: {
        type: 'coverage_regression',
        severity: 'high',
      },
      actions: [
        {
          type: 'slack_notification',
          delay: 0,
          channels: ['#code-quality'],
          priority: 'medium',
        },
        {
          type: 'github_issue',
          delay: 60,
          priority: 'medium',
        },
      ],
      conditions: [],
    });

    // Performance regression
    this.rules.push({
      trigger: {
        type: 'performance_regression',
        severity: 'critical',
      },
      actions: [
        {
          type: 'slack_notification',
          delay: 0,
          channels: ['#performance-alerts'],
          priority: 'high',
        },
        {
          type: 'email_alert',
          delay: 15,
          recipients: ['performance-team@company.com'],
          priority: 'high',
        },
      ],
      conditions: [],
    });

    // Security vulnerabilities
    this.rules.push({
      trigger: {
        type: 'security_vulnerability',
        severity: 'critical',
      },
      actions: [
        {
          type: 'slack_notification',
          delay: 0,
          channels: ['#security-alerts'],
          priority: 'critical',
        },
        {
          type: 'email_alert',
          delay: 0,
          recipients: ['security-team@company.com'],
          priority: 'critical',
        },
        {
          type: 'pager_duty',
          delay: 5,
          priority: 'critical',
        },
        {
          type: 'block_deployment',
          delay: 0,
          priority: 'critical',
        },
      ],
      conditions: [],
    });
  }

  /**
   * Get active escalations for monitoring
   */
  getActiveEscalations(): EscalationState[] {
    return Array.from(this.activeEscalations.values()).filter(e => !e.resolved);
  }

  /**
   * Get escalation history
   */
  getEscalationHistory(limit: number = 50): EscalationState[] {
    return Array.from(this.activeEscalations.values())
      .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())
      .slice(0, limit);
  }

  /**
   * Update escalation rules
   */
  updateRules(rules: EscalationRule[]): void {
    this.rules = rules;
  }

  /**
   * Add a new escalation rule
   */
  addRule(rule: EscalationRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove an escalation rule
   */
  removeRule(index: number): void {
    if (index >= 0 && index < this.rules.length) {
      this.rules.splice(index, 1);
    }
  }
}

// Export singleton instance
export const escalationMatrix = new EscalationMatrix();