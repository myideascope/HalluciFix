import * as cdk from 'aws-cdk-lib';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as config from 'aws-cdk-lib/aws-config';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface HallucifixComplianceMonitoringStackProps extends cdk.StackProps {
  environment: string;
  alertEmail?: string;
  alertTopic?: sns.Topic;
  enableGuardDuty?: boolean;
  enableConfig?: boolean;
  complianceFrameworks?: string[];
  dataRetentionDays?: number;
}

export class HallucifixComplianceMonitoringStack extends cdk.Stack {
  public readonly cloudTrail: cloudtrail.Trail;
  public readonly configDeliveryChannel: config.CfnDeliveryChannel;
  public readonly guardDutyDetector: guardduty.CfnDetector;
  public readonly complianceBucket: s3.Bucket;
  public readonly auditLogGroup: logs.LogGroup;
  public readonly complianceFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: HallucifixComplianceMonitoringStackProps) {
    super(scope, id, props);

    // Create KMS key for encryption
    const auditKey = this.createAuditEncryptionKey(props);

    // Create S3 bucket for audit logs
    this.complianceBucket = this.createComplianceBucket(props, auditKey);

    // Set up CloudTrail
    const { cloudTrail, auditLogGroup } = this.setupCloudTrail(props, auditKey);
    this.cloudTrail = cloudTrail;
    this.auditLogGroup = auditLogGroup;

    // Set up AWS Config
    this.configDeliveryChannel = this.setupAWSConfig(props);

    // Set up GuardDuty
    this.guardDutyDetector = this.setupGuardDuty(props);

    // Create compliance monitoring and reporting
    this.complianceFunction = this.setupComplianceMonitoring(props);

    // Set up audit log analysis
    this.setupAuditLogAnalysis(props);

    // Create compliance dashboard
    this.createComplianceDashboard(props);

    // Output important information
    this.createOutputs(props);
  }

  private createAuditEncryptionKey(props: HallucifixComplianceMonitoringStackProps): kms.Key {
    return new kms.Key(this, 'AuditEncryptionKey', {
      alias: `hallucifix-audit-key-${props.environment}`,
      description: 'KMS key for encrypting audit and compliance logs',
      enableKeyRotation: true,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'Enable IAM User Permissions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'Allow CloudTrail to encrypt logs',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
            actions: [
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
              'kms:Encrypt',
              'kms:ReEncrypt*',
              'kms:Decrypt',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'Allow Config to encrypt logs',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('config.amazonaws.com')],
            actions: [
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
              'kms:Encrypt',
              'kms:ReEncrypt*',
              'kms:Decrypt',
            ],
            resources: ['*'],
          }),
        ],
      }),
    });
  }

  private createComplianceBucket(props: HallucifixComplianceMonitoringStackProps, auditKey: kms.Key): s3.Bucket {
    const complianceBucket = new s3.Bucket(this, 'ComplianceBucket', {
      bucketName: `hallucifix-compliance-${props.environment}-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: auditKey,
      versioned: true,
      lifecycleRules: [
        {
          id: 'audit-log-lifecycle',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
          expiration: cdk.Duration.days(props.dataRetentionDays || 2555), // 7 years default
        },
      ],
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      eventBridgeEnabled: true,
    });

    // Add bucket policy for compliance
    complianceBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureConnections',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        complianceBucket.bucketArn,
        `${complianceBucket.bucketArn}/*`,
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false',
        },
      },
    }));

    return complianceBucket;
  }

  private setupCloudTrail(props: HallucifixComplianceMonitoringStackProps, auditKey: kms.Key) {
    // Create CloudWatch log group for CloudTrail
    const auditLogGroup = new logs.LogGroup(this, 'CloudTrailLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/cloudtrail`,
      retention: logs.RetentionDays.ONE_YEAR,
      encryptionKey: auditKey,
    });

    // Create CloudTrail
    const cloudTrail = new cloudtrail.Trail(this, 'CloudTrail', {
      trailName: `hallucifix-cloudtrail-${props.environment}`,
      bucket: this.complianceBucket,
      s3KeyPrefix: 'cloudtrail-logs/',
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableFileValidation: true,
      encryptionKey: auditKey,
      cloudWatchLogGroup: auditLogGroup,
      sendToCloudWatchLogs: true,
      managementEvents: cloudtrail.ReadWriteType.ALL,
    });

    // Add data events for S3 buckets
    cloudTrail.addS3EventSelector([
      {
        bucket: this.complianceBucket,
        objectPrefix: '',
      },
    ]);

    // Add Lambda data events
    cloudTrail.addLambdaEventSelector([{
      functionArn: 'arn:aws:lambda:*:*:function:hallucifix-*',
    }]);

    // Create CloudTrail log analysis
    this.setupCloudTrailAnalysis(props, auditLogGroup);

    return { cloudTrail, auditLogGroup };
  }

  private setupCloudTrailAnalysis(props: HallucifixComplianceMonitoringStackProps, auditLogGroup: logs.LogGroup) {
    // Create metric filters for security events
    const rootAccountUsageFilter = new logs.MetricFilter(this, 'RootAccountUsageFilter', {
      logGroup: auditLogGroup,
      metricNamespace: 'HalluciFix/Security',
      metricName: 'RootAccountUsage',
      filterPattern: logs.FilterPattern.literal('{ ($.userIdentity.type = "Root") && ($.userIdentity.invokedBy NOT EXISTS) && ($.eventType != "AwsServiceEvent") }'),
      metricValue: '1',
      defaultValue: 0,
    });

    const unauthorizedApiCallsFilter = new logs.MetricFilter(this, 'UnauthorizedApiCallsFilter', {
      logGroup: auditLogGroup,
      metricNamespace: 'HalluciFix/Security',
      metricName: 'UnauthorizedApiCalls',
      filterPattern: logs.FilterPattern.literal('{ ($.errorCode = "*UnauthorizedOperation") || ($.errorCode = "AccessDenied*") }'),
      metricValue: '1',
      defaultValue: 0,
    });

    const consoleSignInWithoutMfaFilter = new logs.MetricFilter(this, 'ConsoleSignInWithoutMfaFilter', {
      logGroup: auditLogGroup,
      metricNamespace: 'HalluciFix/Security',
      metricName: 'ConsoleSignInWithoutMfa',
      filterPattern: logs.FilterPattern.literal('{ ($.eventName = "ConsoleLogin") && ($.additionalEventData.MFAUsed != "Yes") }'),
      metricValue: '1',
      defaultValue: 0,
    });

    const iamPolicyChangesFilter = new logs.MetricFilter(this, 'IamPolicyChangesFilter', {
      logGroup: auditLogGroup,
      metricNamespace: 'HalluciFix/Security',
      metricName: 'IamPolicyChanges',
      filterPattern: logs.FilterPattern.literal('{ ($.eventName=DeleteGroupPolicy) || ($.eventName=DeleteRolePolicy) || ($.eventName=DeleteUserPolicy) || ($.eventName=PutGroupPolicy) || ($.eventName=PutRolePolicy) || ($.eventName=PutUserPolicy) || ($.eventName=CreatePolicy) || ($.eventName=DeletePolicy) || ($.eventName=CreatePolicyVersion) || ($.eventName=DeletePolicyVersion) || ($.eventName=AttachRolePolicy) || ($.eventName=DetachRolePolicy) || ($.eventName=AttachUserPolicy) || ($.eventName=DetachUserPolicy) || ($.eventName=AttachGroupPolicy) || ($.eventName=DetachGroupPolicy) }'),
      metricValue: '1',
      defaultValue: 0,
    });

    // Create alarms for security events
    const rootAccountUsageAlarm = new cloudwatch.Alarm(this, 'RootAccountUsageAlarm', {
      alarmName: `hallucifix-root-account-usage-${props.environment}`,
      alarmDescription: 'Root account usage detected',
      metric: rootAccountUsageFilter.metric({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const unauthorizedApiCallsAlarm = new cloudwatch.Alarm(this, 'UnauthorizedApiCallsAlarm', {
      alarmName: `hallucifix-unauthorized-api-calls-${props.environment}`,
      alarmDescription: 'Unauthorized API calls detected',
      metric: unauthorizedApiCallsFilter.metric({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const iamPolicyChangesAlarm = new cloudwatch.Alarm(this, 'IamPolicyChangesAlarm', {
      alarmName: `hallucifix-iam-policy-changes-${props.environment}`,
      alarmDescription: 'IAM policy changes detected',
      metric: iamPolicyChangesFilter.metric({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add alarm actions
    if (props.alertTopic) {
      rootAccountUsageAlarm.addAlarmAction(new SnsAction(props.alertTopic));
      unauthorizedApiCallsAlarm.addAlarmAction(new SnsAction(props.alertTopic));
      iamPolicyChangesAlarm.addAlarmAction(new SnsAction(props.alertTopic));
    }
  }

  private setupAWSConfig(props: HallucifixComplianceMonitoringStackProps): config.CfnDeliveryChannel | undefined {
    if (!props.enableConfig) {
      return undefined;
    }

    // Create Config service role
    const configRole = new iam.Role(this, 'ConfigRole', {
      roleName: `hallucifix-config-role-${props.environment}`,
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole'),
      ],
    });

    // Grant Config access to the compliance bucket
    this.complianceBucket.grantReadWrite(configRole);

    // Create Config configuration recorder
    const configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
      name: `hallucifix-config-recorder-${props.environment}`,
      roleArn: configRole.roleArn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: true,
        resourceTypes: [],
      },
    });

    // Create Config delivery channel
    const configDeliveryChannel = new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
      name: `hallucifix-config-delivery-${props.environment}`,
      s3BucketName: this.complianceBucket.bucketName,
      s3KeyPrefix: 'config-logs/',
      configSnapshotDeliveryProperties: {
        deliveryFrequency: 'TwentyFour_Hours',
      },
    });

    // Ensure delivery channel depends on recorder
    configDeliveryChannel.addDependency(configRecorder);

    // Create Config rules for compliance
    this.createConfigRules(props, configDeliveryChannel);

    return configDeliveryChannel;
  }

  private createConfigRules(props: HallucifixComplianceMonitoringStackProps, configDeliveryChannel: config.CfnDeliveryChannel) {
    // S3 bucket encryption rule
    const s3Rule = new config.CfnConfigRule(this, 'S3BucketEncryptionRule', {
      configRuleName: `hallucifix-s3-bucket-encryption-${props.environment}`,
      description: 'Checks whether S3 buckets have encryption enabled',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED',
      },
    });
    s3Rule.addDependency(configDeliveryChannel);

    // RDS encryption rule
    const rdsRule = new config.CfnConfigRule(this, 'RdsEncryptionRule', {
      configRuleName: `hallucifix-rds-encryption-${props.environment}`,
      description: 'Checks whether RDS instances have encryption enabled',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'RDS_STORAGE_ENCRYPTED',
      },
    });
    rdsRule.addDependency(configDeliveryChannel);

    // IAM password policy rule
    const iamRule = new config.CfnConfigRule(this, 'IamPasswordPolicyRule', {
      configRuleName: `hallucifix-iam-password-policy-${props.environment}`,
      description: 'Checks whether IAM password policy meets requirements',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'IAM_PASSWORD_POLICY',
      },
      inputParameters: JSON.stringify({
        RequireUppercaseCharacters: 'true',
        RequireLowercaseCharacters: 'true',
        RequireSymbols: 'true',
        RequireNumbers: 'true',
        MinimumPasswordLength: '12',
        PasswordReusePrevention: '12',
        MaxPasswordAge: '90',
      }),
    });
    iamRule.addDependency(configDeliveryChannel);

    // CloudTrail enabled rule
    const cloudTrailRule = new config.CfnConfigRule(this, 'CloudTrailEnabledRule', {
      configRuleName: `hallucifix-cloudtrail-enabled-${props.environment}`,
      description: 'Checks whether CloudTrail is enabled',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'CLOUD_TRAIL_ENABLED',
      },
    });
    cloudTrailRule.addDependency(configDeliveryChannel);

    // MFA enabled for root rule
    const mfaRule = new config.CfnConfigRule(this, 'MfaEnabledForRootRule', {
      configRuleName: `hallucifix-mfa-enabled-for-root-${props.environment}`,
      description: 'Checks whether MFA is enabled for root account',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'MFA_ENABLED_FOR_IAM_CONSOLE_ACCESS',
      },
    });
    mfaRule.addDependency(configDeliveryChannel);

    // Security group SSH rule
    const sshRule = new config.CfnConfigRule(this, 'SecurityGroupSshRule', {
      configRuleName: `hallucifix-security-group-ssh-${props.environment}`,
      description: 'Checks whether security groups allow unrestricted SSH access',
      source: {
        owner: 'AWS',
        sourceIdentifier: 'INCOMING_SSH_DISABLED',
      },
    });
    sshRule.addDependency(configDeliveryChannel);
  }

  private setupGuardDuty(props: HallucifixComplianceMonitoringStackProps): guardduty.CfnDetector | undefined {
    if (!props.enableGuardDuty) {
      return undefined;
    }

    // Create GuardDuty detector
    const guardDutyDetector = new guardduty.CfnDetector(this, 'GuardDutyDetector', {
      enable: true,
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      dataSources: {
        s3Logs: { enable: true },
        kubernetes: { auditLogs: { enable: true } },
        malwareProtection: { scanEc2InstanceWithFindings: { ebsVolumes: true } },
      },
    });

    // Create GuardDuty findings processor
    this.createGuardDutyProcessor(props);

    return guardDutyDetector;
  }

  private createGuardDutyProcessor(props: HallucifixComplianceMonitoringStackProps) {
    const guardDutyProcessor = new lambda.Function(this, 'GuardDutyProcessor', {
      functionName: `hallucifix-guardduty-processor-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('GuardDuty finding received:', JSON.stringify(event, null, 2));
          
          try {
            const finding = event.detail;
            await processFinding(finding);
            
            return { statusCode: 200, body: 'Finding processed successfully' };
          } catch (error) {
            console.error('Error processing GuardDuty finding:', error);
            throw error;
          }
        };

        async function processFinding(finding) {
          const severity = finding.severity;
          const type = finding.type;
          const title = finding.title;
          const description = finding.description;
          
          // Determine alert priority based on severity
          let priority = 'LOW';
          if (severity >= 7.0) {
            priority = 'HIGH';
          } else if (severity >= 4.0) {
            priority = 'MEDIUM';
          }
          
          // Create alert message
          const alertMessage = {
            alertType: 'GUARDDUTY_FINDING',
            priority,
            severity,
            type,
            title,
            description,
            accountId: finding.accountId,
            region: finding.region,
            createdAt: finding.createdAt,
            updatedAt: finding.updatedAt,
            resource: finding.resource,
            service: finding.service,
            environment: process.env.ENVIRONMENT
          };
          
          // Send alert for medium and high severity findings
          if (priority !== 'LOW') {
            await sendSecurityAlert(alertMessage);
          }
          
          // Log all findings for audit purposes
          console.log('GuardDuty finding processed:', JSON.stringify(alertMessage, null, 2));
        }

        async function sendSecurityAlert(alert) {
          if (process.env.ALERT_TOPIC_ARN) {
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: \`GuardDuty Alert: \${alert.title}\`,
              Message: JSON.stringify(alert, null, 2)
            };
            
            await sns.publish(params).promise();
            console.log('Security alert sent for GuardDuty finding');
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(5),
    });

    // Grant SNS publish permissions
    guardDutyProcessor.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sns:Publish'],
      resources: [props.alertTopic?.topicArn || '*'],
    }));

    // Create EventBridge rule for GuardDuty findings
    const guardDutyRule = new events.Rule(this, 'GuardDutyRule', {
      ruleName: `hallucifix-guardduty-findings-${props.environment}`,
      description: 'Process GuardDuty findings',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding'],
      },
    });

    guardDutyRule.addTarget(new targets.LambdaFunction(guardDutyProcessor));
  }

  private setupComplianceMonitoring(props: HallucifixComplianceMonitoringStackProps): lambda.Function {
    // Create compliance monitoring function
    const complianceFunction = new lambda.Function(this, 'ComplianceFunction', {
      functionName: `hallucifix-compliance-monitor-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const config = new AWS.ConfigService();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('Compliance monitoring triggered');
          
          try {
            const complianceReport = await generateComplianceReport();
            await sendComplianceReport(complianceReport);
            
            return {
              statusCode: 200,
              body: JSON.stringify({ 
                message: 'Compliance report generated',
                report: complianceReport 
              })
            };
          } catch (error) {
            console.error('Error in compliance monitoring:', error);
            throw error;
          }
        };

        async function generateComplianceReport() {
          const report = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            complianceStatus: 'COMPLIANT',
            rules: [],
            summary: {
              total: 0,
              compliant: 0,
              nonCompliant: 0,
              notApplicable: 0
            }
          };
          
          try {
            // Get Config rules compliance
            const rulesResponse = await config.describeConfigRules().promise();
            
            for (const rule of rulesResponse.ConfigRules) {
              const complianceResponse = await config.getComplianceDetailsByConfigRule({
                ConfigRuleName: rule.ConfigRuleName
              }).promise();
              
              const ruleCompliance = {
                ruleName: rule.ConfigRuleName,
                description: rule.Description,
                compliantResources: 0,
                nonCompliantResources: 0,
                notApplicableResources: 0,
                status: 'COMPLIANT'
              };
              
              if (complianceResponse.EvaluationResults) {
                for (const result of complianceResponse.EvaluationResults) {
                  switch (result.ComplianceType) {
                    case 'COMPLIANT':
                      ruleCompliance.compliantResources++;
                      break;
                    case 'NON_COMPLIANT':
                      ruleCompliance.nonCompliantResources++;
                      ruleCompliance.status = 'NON_COMPLIANT';
                      break;
                    case 'NOT_APPLICABLE':
                      ruleCompliance.notApplicableResources++;
                      break;
                  }
                }
              }
              
              report.rules.push(ruleCompliance);
              report.summary.total++;
              
              if (ruleCompliance.status === 'COMPLIANT') {
                report.summary.compliant++;
              } else {
                report.summary.nonCompliant++;
                report.complianceStatus = 'NON_COMPLIANT';
              }
            }
          } catch (error) {
            console.error('Error getting Config rules compliance:', error);
            report.error = error.message;
          }
          
          return report;
        }

        async function sendComplianceReport(report) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Compliance Report - \${report.environment} - \${report.complianceStatus}\`;
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(report, null, 2)
            };
            
            await sns.publish(params).promise();
            console.log('Compliance report sent');
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant necessary permissions
    complianceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'config:DescribeConfigRules',
        'config:GetComplianceDetailsByConfigRule',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule daily compliance reports
    const complianceRule = new events.Rule(this, 'ComplianceRule', {
      ruleName: `hallucifix-compliance-report-${props.environment}`,
      description: 'Generate daily compliance reports',
      schedule: events.Schedule.cron({ hour: '8', minute: '0' }), // 8 AM daily
    });

    complianceRule.addTarget(new targets.LambdaFunction(complianceFunction));

    return complianceFunction;
  }

  private setupAuditLogAnalysis(props: HallucifixComplianceMonitoringStackProps) {
    // Create audit log analysis function
    const auditAnalysisFunction = new lambda.Function(this, 'AuditAnalysisFunction', {
      functionName: `hallucifix-audit-analysis-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('Audit log analysis triggered:', JSON.stringify(event, null, 2));
          
          try {
            // Process CloudTrail logs from CloudWatch Logs
            if (event.awslogs && event.awslogs.data) {
              const logData = JSON.parse(Buffer.from(event.awslogs.data, 'base64').toString('utf8'));
              await analyzeCloudTrailLogs(logData.logEvents);
            }
            
            return { statusCode: 200, body: 'Audit analysis completed' };
          } catch (error) {
            console.error('Error in audit log analysis:', error);
            throw error;
          }
        };

        async function analyzeCloudTrailLogs(logEvents) {
          const suspiciousActivities = [];
          
          for (const logEvent of logEvents) {
            try {
              const event = JSON.parse(logEvent.message);
              
              // Analyze for suspicious patterns
              const suspiciousActivity = analyzeSuspiciousActivity(event);
              if (suspiciousActivity) {
                suspiciousActivities.push(suspiciousActivity);
              }
            } catch (error) {
              console.error('Error parsing log event:', error);
            }
          }
          
          // Send alerts for suspicious activities
          for (const activity of suspiciousActivities) {
            await sendSuspiciousActivityAlert(activity);
          }
        }

        function analyzeSuspiciousActivity(event) {
          const suspiciousPatterns = [
            // Multiple failed login attempts
            {
              condition: event.eventName === 'ConsoleLogin' && event.errorMessage,
              type: 'FAILED_LOGIN',
              severity: 'MEDIUM'
            },
            // Root account usage
            {
              condition: event.userIdentity && event.userIdentity.type === 'Root',
              type: 'ROOT_ACCOUNT_USAGE',
              severity: 'HIGH'
            },
            // Privilege escalation attempts
            {
              condition: event.eventName && event.eventName.includes('Attach') && event.eventName.includes('Policy'),
              type: 'PRIVILEGE_ESCALATION',
              severity: 'HIGH'
            },
            // Unusual API calls from new locations
            {
              condition: event.sourceIPAddress && !isKnownIP(event.sourceIPAddress),
              type: 'UNUSUAL_LOCATION',
              severity: 'MEDIUM'
            },
            // Data exfiltration patterns
            {
              condition: event.eventName === 'GetObject' && event.resources && event.resources.length > 10,
              type: 'POTENTIAL_DATA_EXFILTRATION',
              severity: 'HIGH'
            }
          ];
          
          for (const pattern of suspiciousPatterns) {
            if (pattern.condition) {
              return {
                type: pattern.type,
                severity: pattern.severity,
                event: {
                  eventTime: event.eventTime,
                  eventName: event.eventName,
                  sourceIPAddress: event.sourceIPAddress,
                  userIdentity: event.userIdentity,
                  awsRegion: event.awsRegion
                },
                timestamp: new Date().toISOString()
              };
            }
          }
          
          return null;
        }

        function isKnownIP(ipAddress) {
          // In a real implementation, this would check against a whitelist of known IPs
          // For now, we'll consider all IPs as potentially suspicious
          return false;
        }

        async function sendSuspiciousActivityAlert(activity) {
          if (process.env.ALERT_TOPIC_ARN) {
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: \`Suspicious Activity Detected: \${activity.type}\`,
              Message: JSON.stringify({
                alertType: 'SUSPICIOUS_ACTIVITY',
                ...activity,
                environment: process.env.ENVIRONMENT
              }, null, 2)
            };
            
            await sns.publish(params).promise();
            console.log(\`Suspicious activity alert sent: \${activity.type}\`);
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(5),
    });

    // Grant SNS permissions
    auditAnalysisFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sns:Publish'],
      resources: [props.alertTopic?.topicArn || '*'],
    }));

    // Subscribe to CloudTrail logs
    new logs.SubscriptionFilter(this, 'AuditLogSubscription', {
      logGroup: this.auditLogGroup,
      destination: new destinations.LambdaDestination(auditAnalysisFunction),
      filterPattern: logs.FilterPattern.allEvents(),
    });
  }

  private createComplianceDashboard(props: HallucifixComplianceMonitoringStackProps) {
    const complianceDashboard = new cloudwatch.Dashboard(this, 'ComplianceDashboard', {
      dashboardName: `hallucifix-compliance-${props.environment}`,
    });

    // Add compliance widgets
    complianceDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Root Account Usage (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Security',
            metricName: 'RootAccountUsage',
            period: cdk.Duration.hours(24),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Unauthorized API Calls (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Security',
            metricName: 'UnauthorizedApiCalls',
            period: cdk.Duration.hours(24),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'IAM Policy Changes (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Security',
            metricName: 'IamPolicyChanges',
            period: cdk.Duration.hours(24),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Security Events Trend',
        left: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Security',
            metricName: 'RootAccountUsage',
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
            label: 'Root Usage',
          }),
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Security',
            metricName: 'UnauthorizedApiCalls',
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
            label: 'Unauthorized Calls',
          }),
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Security',
            metricName: 'IamPolicyChanges',
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
            label: 'IAM Changes',
          }),
        ],
        width: 18,
        height: 6,
      })
    );
  }

  private createOutputs(props: HallucifixComplianceMonitoringStackProps) {
    new cdk.CfnOutput(this, 'CloudTrailArn', {
      value: this.cloudTrail.trailArn,
      description: 'CloudTrail ARN',
      exportName: `${props.environment}-CloudTrailArn`,
    });

    new cdk.CfnOutput(this, 'ComplianceBucketName', {
      value: this.complianceBucket.bucketName,
      description: 'Compliance bucket name',
      exportName: `${props.environment}-ComplianceBucketName`,
    });

    new cdk.CfnOutput(this, 'AuditLogGroupName', {
      value: this.auditLogGroup.logGroupName,
      description: 'Audit log group name',
      exportName: `${props.environment}-AuditLogGroupName`,
    });

    if (this.guardDutyDetector) {
      new cdk.CfnOutput(this, 'GuardDutyDetectorId', {
        value: this.guardDutyDetector.ref,
        description: 'GuardDuty detector ID',
        exportName: `${props.environment}-GuardDutyDetectorId`,
      });
    }

    new cdk.CfnOutput(this, 'ComplianceFunctionArn', {
      value: this.complianceFunction.functionArn,
      description: 'Compliance monitoring function ARN',
      exportName: `${props.environment}-ComplianceFunctionArn`,
    });
  }
}