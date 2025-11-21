import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { logger } from './logging';
export interface HallucifixAlertingNotificationStackProps extends cdk.StackProps {
  environment: string;
  alertEmail?: string;
  slackWebhookUrl?: string;
  pagerDutyIntegrationKey?: string;
  teamsWebhookUrl?: string;
  escalationContacts?: {
    level1: string[];
    level2: string[];
    level3: string[];
  };
}

export class HallucifixAlertingNotificationStack extends cdk.Stack {
  public readonly criticalAlertTopic: sns.Topic;
  public readonly warningAlertTopic: sns.Topic;
  public readonly infoAlertTopic: sns.Topic;
  public readonly escalationTopic: sns.Topic;
  public readonly alertProcessorFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: HallucifixAlertingNotificationStackProps) {
    super(scope, id, props);

    // Create SNS topics for different alert levels
    this.createAlertTopics(props);

    // Create alert processor Lambda function
    this.createAlertProcessor(props);

    // Set up CloudWatch alarms for system metrics
    this.setupSystemAlarms(props);

    // Create escalation policies
    this.setupEscalationPolicies(props);

    // Set up custom metric filters and alarms
    this.setupCustomAlarms(props);

    // Create alert dashboard
    this.createAlertDashboard(props);

    // Output important ARNs and URLs
    this.createOutputs(props);
  }

  private createAlertTopics(props: HallucifixAlertingNotificationStackProps) {
    // Critical alerts topic
    this.criticalAlertTopic = new sns.Topic(this, 'CriticalAlertTopic', {
      topicName: `hallucifix-critical-alerts-${props.environment}`,
      displayName: `HalluciFix Critical Alerts (${props.environment})`,
      fifo: false,
    });

    // Warning alerts topic
    this.warningAlertTopic = new sns.Topic(this, 'WarningAlertTopic', {
      topicName: `hallucifix-warning-alerts-${props.environment}`,
      displayName: `HalluciFix Warning Alerts (${props.environment})`,
      fifo: false,
    });

    // Info alerts topic
    this.infoAlertTopic = new sns.Topic(this, 'InfoAlertTopic', {
      topicName: `hallucifix-info-alerts-${props.environment}`,
      displayName: `HalluciFix Info Alerts (${props.environment})`,
      fifo: false,
    });

    // Escalation topic for critical issues
    this.escalationTopic = new sns.Topic(this, 'EscalationTopic', {
      topicName: `hallucifix-escalation-${props.environment}`,
      displayName: `HalluciFix Escalation Alerts (${props.environment})`,
      fifo: false,
    });

    // Add email subscriptions if provided
    if (props.alertEmail) {
      this.criticalAlertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
      this.warningAlertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
      this.escalationTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Add escalation contact subscriptions
    if (props.escalationContacts) {
      // Level 1 - Critical alerts
      props.escalationContacts.level1.forEach(email => {
        this.criticalAlertTopic.addSubscription(
          new snsSubscriptions.EmailSubscription(email)
        );
      });

      // Level 2 - Escalation alerts
      props.escalationContacts.level2.forEach(email => {
        this.escalationTopic.addSubscription(
          new snsSubscriptions.EmailSubscription(email)
        );
      });

      // Level 3 - All alerts for management
      props.escalationContacts.level3.forEach(email => {
        this.criticalAlertTopic.addSubscription(
          new snsSubscriptions.EmailSubscription(email)
        );
        this.warningAlertTopic.addSubscription(
          new snsSubscriptions.EmailSubscription(email)
        );
        this.escalationTopic.addSubscription(
          new snsSubscriptions.EmailSubscription(email)
        );
      });
    }
  }

  private createAlertProcessor(props: HallucifixAlertingNotificationStackProps) {
    // Create alert processor function
    this.alertProcessorFunction = new lambda.Function(this, 'AlertProcessorFunction', {
      functionName: `hallucifix-alert-processor-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const https = require('https');
        const url = require('url');

        exports.handler = async (event) => {
          logger.info("Processing alert:", { JSON.stringify(event, null, 2 }));
          
          for (const record of event.Records) {
            if (record.Sns) {
              await processAlert(record.Sns);
            }
          }
          
          return { statusCode: 200, body: 'Alerts processed' };
        };

        async function processAlert(snsMessage) {
          const message = JSON.parse(snsMessage.Message);
          const subject = snsMessage.Subject || 'HalluciFix Alert';
          
          // Determine alert severity
          const severity = determineSeverity(snsMessage.TopicArn, message);
          
          // Format alert for different channels
          const formattedAlert = formatAlert(message, subject, severity);
          
          // Send to external services
          const promises = [];
          
          if (process.env.SLACK_WEBHOOK_URL) {
            promises.push(sendToSlack(formattedAlert));
          }
          
          if (process.env.TEAMS_WEBHOOK_URL) {
            promises.push(sendToTeams(formattedAlert));
          }
          
          if (process.env.PAGERDUTY_INTEGRATION_KEY && severity === 'critical') {
            promises.push(sendToPagerDuty(formattedAlert));
          }
          
          await Promise.allSettled(promises);
        }

        function determineSeverity(topicArn, message) {
          if (topicArn.includes('critical') || topicArn.includes('escalation')) {
            return 'critical';
          } else if (topicArn.includes('warning')) {
            return 'warning';
          } else {
            return 'info';
          }
        }

        function formatAlert(message, subject, severity) {
          const timestamp = new Date().toISOString();
          const color = severity === 'critical' ? '#FF0000' : 
                       severity === 'warning' ? '#FFA500' : '#00FF00';
          
          return {
            severity,
            subject,
            message,
            timestamp,
            color,
            environment: process.env.ENVIRONMENT || 'unknown'
          };
        }

        async function sendToSlack(alert) {
          const payload = {
            text: alert.subject,
            attachments: [{
              color: alert.color,
              fields: [
                { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
                { title: 'Environment', value: alert.environment, short: true },
                { title: 'Time', value: alert.timestamp, short: true },
                { title: 'Details', value: JSON.stringify(alert.message, null, 2), short: false }
              ]
            }]
          };
          
          return sendWebhook(process.env.SLACK_WEBHOOK_URL, payload);
        }

        async function sendToTeams(alert) {
          const payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": alert.color,
            "summary": alert.subject,
            "sections": [{
              "activityTitle": alert.subject,
              "activitySubtitle": \`Severity: \${alert.severity.toUpperCase()}\`,
              "facts": [
                { "name": "Environment", "value": alert.environment },
                { "name": "Time", "value": alert.timestamp },
                { "name": "Details", "value": JSON.stringify(alert.message, null, 2) }
              ]
            }]
          };
          
          return sendWebhook(process.env.TEAMS_WEBHOOK_URL, payload);
        }

        async function sendToPagerDuty(alert) {
          const payload = {
            routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
            event_action: "trigger",
            payload: {
              summary: alert.subject,
              severity: alert.severity,
              source: "hallucifix-monitoring",
              component: alert.environment,
              custom_details: alert.message
            }
          };
          
          const options = {
            hostname: 'events.pagerduty.com',
            port: 443,
            path: '/v2/enqueue',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          };
          
          return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
              res.on('data', () => {});
              res.on('end', () => resolve());
            });
            
            req.on('error', reject);
            req.write(JSON.stringify(payload));
            req.end();
          });
        }

        async function sendWebhook(webhookUrl, payload) {
          const parsedUrl = url.parse(webhookUrl);
          
          const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          };
          
          return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
              res.on('data', () => {});
              res.on('end', () => resolve());
            });
            
            req.on('error', reject);
            req.write(JSON.stringify(payload));
            req.end();
          });
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        SLACK_WEBHOOK_URL: props.slackWebhookUrl || '',
        TEAMS_WEBHOOK_URL: props.teamsWebhookUrl || '',
        PAGERDUTY_INTEGRATION_KEY: props.pagerDutyIntegrationKey || '',
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });

    // Subscribe alert processor to all alert topics
    this.criticalAlertTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(this.alertProcessorFunction)
    );
    this.warningAlertTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(this.alertProcessorFunction)
    );
    this.infoAlertTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(this.alertProcessorFunction)
    );
    this.escalationTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(this.alertProcessorFunction)
    );
  }

  private setupSystemAlarms(props: HallucifixAlertingNotificationStackProps) {
    // System-wide error rate alarm
    const systemErrorRateAlarm = new cloudwatch.Alarm(this, 'SystemErrorRateAlarm', {
      alarmName: `hallucifix-system-error-rate-${props.environment}`,
      alarmDescription: 'System-wide error rate is too high',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/System',
        metricName: 'ErrorRate',
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 5, // 5% error rate
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    systemErrorRateAlarm.addAlarmAction(new cloudwatch.SnsAction(this.criticalAlertTopic));

    // Application availability alarm
    const availabilityAlarm = new cloudwatch.Alarm(this, 'ApplicationAvailabilityAlarm', {
      alarmName: `hallucifix-availability-${props.environment}`,
      alarmDescription: 'Application availability is below threshold',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Application',
        metricName: 'Availability',
        period: cdk.Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 99, // 99% availability
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    availabilityAlarm.addAlarmAction(new cloudwatch.SnsAction(this.criticalAlertTopic));

    // High latency alarm
    const latencyAlarm = new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
      alarmName: `hallucifix-high-latency-${props.environment}`,
      alarmDescription: 'Application latency is too high',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Application',
        metricName: 'ResponseTime',
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    latencyAlarm.addAlarmAction(new cloudwatch.SnsAction(this.warningAlertTopic));

    // Business metrics alarms
    const analysisAccuracyAlarm = new cloudwatch.Alarm(this, 'AnalysisAccuracyAlarm', {
      alarmName: `hallucifix-analysis-accuracy-low-${props.environment}`,
      alarmDescription: 'Analysis accuracy has dropped below acceptable threshold',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Business',
        metricName: 'AnalysisAccuracy',
        period: cdk.Duration.minutes(15),
        statistic: 'Average',
      }),
      threshold: 85, // 85% accuracy
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    analysisAccuracyAlarm.addAlarmAction(new cloudwatch.SnsAction(this.criticalAlertTopic));

    // Security event alarm
    const securityEventAlarm = new cloudwatch.Alarm(this, 'SecurityEventAlarm', {
      alarmName: `hallucifix-security-events-${props.environment}`,
      alarmDescription: 'High number of security events detected',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Security',
        metricName: 'SecurityEvents',
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 10, // 10 security events in 5 minutes
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    securityEventAlarm.addAlarmAction(new cloudwatch.SnsAction(this.criticalAlertTopic));
  }

  private setupEscalationPolicies(props: HallucifixAlertingNotificationStackProps) {
    // Create escalation rule using EventBridge
    const escalationRule = new events.Rule(this, 'EscalationRule', {
      ruleName: `hallucifix-escalation-rule-${props.environment}`,
      description: 'Escalate unresolved critical alerts',
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)), // Check every 15 minutes
    });

    // Create escalation processor function
    const escalationFunction = new lambda.Function(this, 'EscalationFunction', {
      functionName: `hallucifix-escalation-processor-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cloudwatch = new AWS.CloudWatch();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.debug("Checking for unresolved critical alerts...");
          
          try {
            // Get alarm states
            const params = {
              StateValue: 'ALARM',
              AlarmNamePrefix: 'hallucifix-'
            };
            
            const alarms = await cloudwatch.describeAlarms(params).promise();
            const criticalAlarms = alarms.MetricAlarms.filter(alarm => 
              alarm.AlarmName.includes('critical') || 
              alarm.AlarmName.includes('system-error-rate') ||
              alarm.AlarmName.includes('availability')
            );
            
            // Check if any critical alarms have been in ALARM state for > 30 minutes
            const now = new Date();
            const escalationThreshold = 30 * 60 * 1000; // 30 minutes in milliseconds
            
            for (const alarm of criticalAlarms) {
              const alarmDuration = now - alarm.StateUpdatedTimestamp;
              
              if (alarmDuration > escalationThreshold) {
                await escalateAlert(alarm);
              }
            }
            
            return { statusCode: 200, body: 'Escalation check completed' };
          } catch (error) {
            logger.error("Error in escalation processor:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function escalateAlert(alarm) {
          const message = {
            alertType: 'ESCALATION',
            alarmName: alarm.AlarmName,
            alarmDescription: alarm.AlarmDescription,
            stateReason: alarm.StateReason,
            stateUpdatedTimestamp: alarm.StateUpdatedTimestamp,
            escalationReason: 'Alert has been active for more than 30 minutes without resolution',
            severity: 'CRITICAL',
            environment: process.env.ENVIRONMENT
          };
          
          const params = {
            TopicArn: process.env.ESCALATION_TOPIC_ARN,
            Subject: \`ESCALATION: \${alarm.AlarmName}\`,
            Message: JSON.stringify(message, null, 2)
          };
          
          await sns.publish(params).promise();
          console.log(\`Escalated alert: \${alarm.AlarmName}\`);
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ESCALATION_TOPIC_ARN: this.escalationTopic.topicArn,
      },
      timeout: cdk.Duration.minutes(5),
    });

    // Grant permissions to escalation function
    escalationFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:DescribeAlarms',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Add escalation function as target for the rule
    escalationRule.addTarget(new targets.LambdaFunction(escalationFunction));
  }

  private setupCustomAlarms(props: HallucifixAlertingNotificationStackProps) {
    // Create log-based metric filters and alarms
    const applicationLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'ApplicationLogGroup',
      `/hallucifix/${props.environment}/application`
    );

    // Critical error metric filter
    const criticalErrorMetric = new logs.MetricFilter(this, 'CriticalErrorMetric', {
      logGroup: applicationLogGroup,
      metricNamespace: 'HalluciFix/Errors',
      metricName: 'CriticalErrors',
      filterPattern: logs.FilterPattern.literal('[timestamp, requestId, level="FATAL", ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    const criticalErrorAlarm = new cloudwatch.Alarm(this, 'CriticalErrorAlarm', {
      alarmName: `hallucifix-critical-errors-${props.environment}`,
      alarmDescription: 'Critical errors detected in application logs',
      metric: criticalErrorMetric.metric({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1, // Any critical error
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    criticalErrorAlarm.addAlarmAction(new cloudwatch.SnsAction(this.criticalAlertTopic));

    // Authentication failure metric filter
    const authFailureMetric = new logs.MetricFilter(this, 'AuthFailureMetric', {
      logGroup: applicationLogGroup,
      metricNamespace: 'HalluciFix/Security',
      metricName: 'AuthenticationFailures',
      filterPattern: logs.FilterPattern.literal('[timestamp, requestId, level, message="Authentication failed", ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    const authFailureAlarm = new cloudwatch.Alarm(this, 'AuthFailureAlarm', {
      alarmName: `hallucifix-auth-failures-${props.environment}`,
      alarmDescription: 'High number of authentication failures',
      metric: authFailureMetric.metric({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 20, // 20 failures in 5 minutes
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    authFailureAlarm.addAlarmAction(new cloudwatch.SnsAction(this.warningAlertTopic));
  }

  private createAlertDashboard(props: HallucifixAlertingNotificationStackProps) {
    const alertDashboard = new cloudwatch.Dashboard(this, 'AlertDashboard', {
      dashboardName: `hallucifix-alerts-${props.environment}`,
    });

    // Add alert status widgets
    alertDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Critical Alerts (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfMessagesPublished',
            dimensionsMap: {
              TopicName: this.criticalAlertTopic.topicName,
            },
            period: cdk.Duration.hours(24),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Warning Alerts (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfMessagesPublished',
            dimensionsMap: {
              TopicName: this.warningAlertTopic.topicName,
            },
            period: cdk.Duration.hours(24),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Escalations (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfMessagesPublished',
            dimensionsMap: {
              TopicName: this.escalationTopic.topicName,
            },
            period: cdk.Duration.hours(24),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Alert Trends',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfMessagesPublished',
            dimensionsMap: {
              TopicName: this.criticalAlertTopic.topicName,
            },
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
            label: 'Critical',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SNS',
            metricName: 'NumberOfMessagesPublished',
            dimensionsMap: {
              TopicName: this.warningAlertTopic.topicName,
            },
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
            label: 'Warning',
          }),
        ],
        width: 18,
        height: 6,
      })
    );
  }

  private createOutputs(props: HallucifixAlertingNotificationStackProps) {
    new cdk.CfnOutput(this, 'CriticalAlertTopicArn', {
      value: this.criticalAlertTopic.topicArn,
      description: 'Critical alerts SNS topic ARN',
      exportName: `${props.environment}-CriticalAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'WarningAlertTopicArn', {
      value: this.warningAlertTopic.topicArn,
      description: 'Warning alerts SNS topic ARN',
      exportName: `${props.environment}-WarningAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'InfoAlertTopicArn', {
      value: this.infoAlertTopic.topicArn,
      description: 'Info alerts SNS topic ARN',
      exportName: `${props.environment}-InfoAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'EscalationTopicArn', {
      value: this.escalationTopic.topicArn,
      description: 'Escalation alerts SNS topic ARN',
      exportName: `${props.environment}-EscalationTopicArn`,
    });

    new cdk.CfnOutput(this, 'AlertProcessorFunctionArn', {
      value: this.alertProcessorFunction.functionArn,
      description: 'Alert processor Lambda function ARN',
      exportName: `${props.environment}-AlertProcessorFunctionArn`,
    });
  }
}