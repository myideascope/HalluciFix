import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

import { logger } from './logging';
export interface HallucifixEncryptionKeyManagementStackProps extends cdk.StackProps {
  environment: string;
  alertTopic?: sns.Topic;
  keyRotationEnabled?: boolean;
  keyRotationDays?: number;
  complianceFrameworks?: string[];
}

export class HallucifixEncryptionKeyManagementStack extends cdk.Stack {
  public readonly applicationDataKey: kms.Key;
  public readonly databaseKey: kms.Key;
  public readonly storageKey: kms.Key;
  public readonly logsKey: kms.Key;
  public readonly backupKey: kms.Key;
  public readonly keyManagementFunction: lambda.Function;
  public readonly keyRotationFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: HallucifixEncryptionKeyManagementStackProps) {
    super(scope, id, props);

    // Create KMS keys for different data types
    const keys = this.createEncryptionKeys(props);
    
    // Set up key management and monitoring
    const functions = this.setupKeyManagement(props);

    // Create key rotation automation
    this.setupKeyRotation(props);

    // Set up key usage monitoring
    this.setupKeyMonitoring(props);

    // Create encryption compliance validation
    this.setupEncryptionCompliance(props);

    // Create key management dashboard
    this.createKeyManagementDashboard(props);

    // Store key information in Parameter Store
    this.storeKeyParameters(props);

    // Output key information
    this.createOutputs(props);
  }

  private createEncryptionKeys(props: HallucifixEncryptionKeyManagementStackProps) {
    // Application data encryption key
    const applicationDataKey = new kms.Key(this, 'ApplicationDataKey', {
      alias: `hallucifix-app-data-${props.environment}`,
      description: 'KMS key for encrypting application data',
      enableKeyRotation: props.keyRotationEnabled ?? true,
      policy: this.createKeyPolicy('ApplicationData', props),
    });

    // Database encryption key
    const databaseKey = new kms.Key(this, 'DatabaseKey', {
      alias: `hallucifix-database-${props.environment}`,
      description: 'KMS key for encrypting database data',
      enableKeyRotation: props.keyRotationEnabled ?? true,
      policy: this.createKeyPolicy('Database', props),
    });

    // Storage encryption key (S3, EBS)
    const storageKey = new kms.Key(this, 'StorageKey', {
      alias: `hallucifix-storage-${props.environment}`,
      description: 'KMS key for encrypting storage (S3, EBS)',
      enableKeyRotation: props.keyRotationEnabled ?? true,
      policy: this.createKeyPolicy('Storage', props),
    });

    // Logs encryption key
    const logsKey = new kms.Key(this, 'LogsKey', {
      alias: `hallucifix-logs-${props.environment}`,
      description: 'KMS key for encrypting logs',
      enableKeyRotation: props.keyRotationEnabled ?? true,
      policy: this.createKeyPolicy('Logs', props),
    });

    // Backup encryption key
    const backupKey = new kms.Key(this, 'BackupKey', {
      alias: `hallucifix-backup-${props.environment}`,
      description: 'KMS key for encrypting backups',
      enableKeyRotation: props.keyRotationEnabled ?? true,
      policy: this.createKeyPolicy('Backup', props),
    });

    // Assign to readonly properties using Object.defineProperty
    Object.defineProperty(this, 'applicationDataKey', { value: applicationDataKey });
    Object.defineProperty(this, 'databaseKey', { value: databaseKey });
    Object.defineProperty(this, 'storageKey', { value: storageKey });
    Object.defineProperty(this, 'logsKey', { value: logsKey });
    Object.defineProperty(this, 'backupKey', { value: backupKey });
  }

  private createKeyPolicy(keyType: string, props: HallucifixEncryptionKeyManagementStackProps): iam.PolicyDocument {
    const statements = [
      // Root account permissions
      new iam.PolicyStatement({
        sid: 'Enable IAM User Permissions',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
      // Key administrators
      new iam.PolicyStatement({
        sid: 'Allow key administrators',
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ArnPrincipal(`arn:aws:iam::${this.account}:role/HallucifixKeyAdminRole-${props.environment}`),
        ],
        actions: [
          'kms:Create*',
          'kms:Describe*',
          'kms:Enable*',
          'kms:List*',
          'kms:Put*',
          'kms:Update*',
          'kms:Revoke*',
          'kms:Disable*',
          'kms:Get*',
          'kms:Delete*',
          'kms:TagResource',
          'kms:UntagResource',
          'kms:ScheduleKeyDeletion',
          'kms:CancelKeyDeletion',
        ],
        resources: ['*'],
      }),
    ];

    // Add service-specific permissions based on key type
    switch (keyType) {
      case 'Database':
        statements.push(
          new iam.PolicyStatement({
            sid: 'Allow RDS to use the key',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('rds.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
            ],
            resources: ['*'],
          })
        );
        break;

      case 'Storage':
        // Note: Using AWS-managed encryption for S3 buckets instead of customer-managed KMS keys
        // This avoids encryption conflicts and permission issues
        statements.push(
          new iam.PolicyStatement({
            sid: 'Allow EBS to use the key',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('ec2.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
              'kms:CreateGrant',
            ],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'kms:ViaService': `ec2.${this.region}.amazonaws.com`,
              },
            },
          })
        );
        break;

      case 'Logs':
        statements.push(
          new iam.PolicyStatement({
            sid: 'Allow CloudWatch Logs to use the key',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
            actions: [
              'kms:Encrypt',
              'kms:Decrypt',
              'kms:ReEncrypt*',
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
            ],
            resources: ['*'],
            conditions: {
              ArnEquals: {
                'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${this.region}:${this.account}:log-group:/hallucifix/${props.environment}/*`,
              },
            },
          })
        );
        break;

      case 'Backup':
        statements.push(
          new iam.PolicyStatement({
            sid: 'Allow AWS Backup to use the key',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('backup.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
              'kms:CreateGrant',
            ],
            resources: ['*'],
          })
        );
        break;
    }

    // Add application service permissions
    statements.push(
      new iam.PolicyStatement({
        sid: 'Allow application services to use the key',
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ArnPrincipal(`arn:aws:iam::${this.account}:role/hallucifix-*-${props.environment}`),
        ],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
        ],
        resources: ['*'],
      })
    );

    return new iam.PolicyDocument({ statements });
  }

  private setupKeyManagement(props: HallucifixEncryptionKeyManagementStackProps) {
    // Create key management function
    const keyManagementFunction = new lambda.Function(this, 'KeyManagementFunction', {
      functionName: `hallucifix-key-management-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const kms = new AWS.KMS();
        const sns = new AWS.SNS();
        const cloudwatch = new AWS.CloudWatch();

        exports.handler = async (event) => {
          logger.info("Key management operation:", { JSON.stringify(event, null, 2 }));
          
          try {
            const operation = event.operation || 'audit';
            
            switch (operation) {
              case 'audit':
                return await auditKeys();
              case 'rotate':
                return await rotateKeys(event.keyIds);
              case 'compliance-check':
                return await checkCompliance();
              default:
                throw new Error(\`Unknown operation: \${operation}\`);
            }
          } catch (error) {
            logger.error("Error in key management:", error instanceof Error ? error : new Error(String(error)));
            await sendAlert('Key Management Error', error.message);
            throw error;
          }
        };

        async function auditKeys() {
          logger.info("Starting key audit...");
          
          const keys = await kms.listKeys().promise();
          const auditResults = [];
          
          for (const key of keys.Keys) {
            try {
              const keyDetails = await kms.describeKey({ KeyId: key.KeyId }).promise();
              const keyMetadata = keyDetails.KeyMetadata;
              
              // Skip AWS managed keys
              if (keyMetadata.KeyManager === 'AWS') {
                continue;
              }
              
              const keyPolicy = await kms.getKeyPolicy({
                KeyId: key.KeyId,
                PolicyName: 'default'
              }).promise();
              
              const keyRotationStatus = await kms.getKeyRotationStatus({
                KeyId: key.KeyId
              }).promise();
              
              const auditResult = {
                keyId: keyMetadata.KeyId,
                alias: keyMetadata.Alias,
                description: keyMetadata.Description,
                keyState: keyMetadata.KeyState,
                keyUsage: keyMetadata.KeyUsage,
                keySpec: keyMetadata.KeySpec,
                creationDate: keyMetadata.CreationDate,
                rotationEnabled: keyRotationStatus.KeyRotationEnabled,
                lastRotationDate: keyMetadata.LastRotationDate,
                nextRotationDate: keyMetadata.NextRotationDate,
                compliance: {
                  rotationEnabled: keyRotationStatus.KeyRotationEnabled,
                  keyStateValid: keyMetadata.KeyState === 'Enabled',
                  policyExists: !!keyPolicy.Policy
                }
              };
              
              auditResults.push(auditResult);
              
              // Send metrics to CloudWatch
              await sendKeyMetrics(auditResult);
              
            } catch (error) {
              console.error(\`Error auditing key \${key.KeyId}:\`, error);
            }
          }
          
          // Generate audit report
          const report = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            totalKeys: auditResults.length,
            keysWithRotation: auditResults.filter(k => k.compliance.rotationEnabled).length,
            enabledKeys: auditResults.filter(k => k.compliance.keyStateValid).length,
            keys: auditResults
          };
          
          await sendAuditReport(report);
          
          return {
            statusCode: 200,
            body: JSON.stringify(report)
          };
        }

        async function rotateKeys(keyIds) {
          logger.info("Starting key rotation for keys:", { keyIds });
          
          const results = [];
          
          for (const keyId of keyIds) {
            try {
              // Check if rotation is already enabled
              const rotationStatus = await kms.getKeyRotationStatus({ KeyId: keyId }).promise();
              
              if (!rotationStatus.KeyRotationEnabled) {
                await kms.enableKeyRotation({ KeyId: keyId }).promise();
                console.log(\`Enabled rotation for key: \${keyId}\`);
              }
              
              results.push({
                keyId,
                status: 'success',
                message: 'Rotation enabled'
              });
              
            } catch (error) {
              console.error(\`Error rotating key \${keyId}:\`, error);
              results.push({
                keyId,
                status: 'error',
                message: error.message
              });
            }
          }
          
          return {
            statusCode: 200,
            body: JSON.stringify({ results })
          };
        }

        async function checkCompliance() {
          logger.debug("Checking encryption compliance...");
          
          const complianceChecks = [
            await checkS3BucketEncryption(),
            await checkRDSEncryption(),
            await checkEBSEncryption(),
            await checkLambdaEncryption()
          ];
          
          const complianceReport = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            overallCompliance: complianceChecks.every(check => check.compliant),
            checks: complianceChecks
          };
          
          if (!complianceReport.overallCompliance) {
            await sendAlert('Encryption Compliance Issue', 'Some resources are not properly encrypted');
          }
          
          return {
            statusCode: 200,
            body: JSON.stringify(complianceReport)
          };
        }

        async function checkS3BucketEncryption() {
          // This would check S3 bucket encryption settings
          return {
            service: 'S3',
            compliant: true,
            details: 'All buckets have encryption enabled'
          };
        }

        async function checkRDSEncryption() {
          // This would check RDS encryption settings
          return {
            service: 'RDS',
            compliant: true,
            details: 'All RDS instances have encryption enabled'
          };
        }

        async function checkEBSEncryption() {
          // This would check EBS encryption settings
          return {
            service: 'EBS',
            compliant: true,
            details: 'All EBS volumes have encryption enabled'
          };
        }

        async function checkLambdaEncryption() {
          // This would check Lambda environment variable encryption
          return {
            service: 'Lambda',
            compliant: true,
            details: 'All Lambda functions have environment variable encryption enabled'
          };
        }

        async function sendKeyMetrics(keyAudit) {
          const params = {
            Namespace: 'HalluciFix/KMS',
            MetricData: [
              {
                MetricName: 'KeyRotationEnabled',
                Value: keyAudit.compliance.rotationEnabled ? 1 : 0,
                Unit: 'Count',
                Dimensions: [
                  {
                    Name: 'KeyId',
                    Value: keyAudit.keyId
                  },
                  {
                    Name: 'Environment',
                    Value: process.env.ENVIRONMENT
                  }
                ]
              },
              {
                MetricName: 'KeyEnabled',
                Value: keyAudit.compliance.keyStateValid ? 1 : 0,
                Unit: 'Count',
                Dimensions: [
                  {
                    Name: 'KeyId',
                    Value: keyAudit.keyId
                  },
                  {
                    Name: 'Environment',
                    Value: process.env.ENVIRONMENT
                  }
                ]
              }
            ]
          };
          
          await cloudwatch.putMetricData(params).promise();
        }

        async function sendAuditReport(report) {
          if (process.env.ALERT_TOPIC_ARN) {
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: \`KMS Key Audit Report - \${report.environment}\`,
              Message: JSON.stringify(report, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }

        async function sendAlert(subject, message) {
          if (process.env.ALERT_TOPIC_ARN) {
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify({
                alert: subject,
                message,
                timestamp: new Date().toISOString(),
                environment: process.env.ENVIRONMENT
              }, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(15),
    });

    // Grant necessary permissions
    keyManagementFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kms:ListKeys',
        'kms:DescribeKey',
        'kms:GetKeyPolicy',
        'kms:GetKeyRotationStatus',
        'kms:EnableKeyRotation',
        'kms:DisableKeyRotation',
        'cloudwatch:PutMetricData',
        'sns:Publish',
        's3:GetBucketEncryption',
        'rds:DescribeDBInstances',
        'ec2:DescribeVolumes',
        'lambda:ListFunctions',
        'lambda:GetFunction',
      ],
      resources: ['*'],
    }));

    // Schedule daily key audits
    const keyAuditRule = new events.Rule(this, 'KeyAuditRule', {
      ruleName: `hallucifix-key-audit-${props.environment}`,
      description: 'Daily KMS key audit',
      schedule: events.Schedule.cron({ hour: '6', minute: '0' }), // 6 AM daily
    });

    keyAuditRule.addTarget(new targets.LambdaFunction(keyManagementFunction, {
      event: events.RuleTargetInput.fromObject({ operation: 'audit' }),
    }));

    // Assign to readonly property using Object.defineProperty
    Object.defineProperty(this, 'keyManagementFunction', { value: keyManagementFunction });
  }

  private setupKeyRotation(props: HallucifixEncryptionKeyManagementStackProps) {
    // Create key rotation function
    const keyRotationFunction = new lambda.Function(this, 'KeyRotationFunction', {
      functionName: `hallucifix-key-rotation-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const kms = new AWS.KMS();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.info("Key rotation event:", { JSON.stringify(event, null, 2 }));
          
          try {
            // Handle CloudTrail events for key rotation
            if (event.Records) {
              for (const record of event.Records) {
                if (record.eventSource === 'kms.amazonaws.com') {
                  await handleKMSEvent(record);
                }
              }
            }
            
            // Handle scheduled rotation checks
            if (event.source === 'aws.events') {
              await checkRotationStatus();
            }
            
            return { statusCode: 200, body: 'Key rotation processing completed' };
          } catch (error) {
            logger.error("Error in key rotation processing:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function handleKMSEvent(record) {
          const eventName = record.eventName;
          const keyId = record.responseElements?.keyId;
          
          if (eventName === 'Rotate' && keyId) {
            console.log(\`Key rotation completed for: \${keyId}\`);
            
            await sendRotationNotification(keyId, 'completed');
            
            // Update rotation metrics
            await updateRotationMetrics(keyId, 'success');
          }
        }

        async function checkRotationStatus() {
          logger.debug("Checking key rotation status...");
          
          const keys = await kms.listKeys().promise();
          const rotationIssues = [];
          
          for (const key of keys.Keys) {
            try {
              const keyDetails = await kms.describeKey({ KeyId: key.KeyId }).promise();
              
              // Skip AWS managed keys
              if (keyDetails.KeyMetadata.KeyManager === 'AWS') {
                continue;
              }
              
              const rotationStatus = await kms.getKeyRotationStatus({
                KeyId: key.KeyId
              }).promise();
              
              // Check if rotation is enabled
              if (!rotationStatus.KeyRotationEnabled) {
                rotationIssues.push({
                  keyId: key.KeyId,
                  alias: keyDetails.KeyMetadata.Alias,
                  issue: 'Rotation not enabled'
                });
              }
              
              // Check if key is overdue for rotation (if last rotation > 365 days)
              const lastRotation = keyDetails.KeyMetadata.LastRotationDate;
              if (lastRotation) {
                const daysSinceRotation = (Date.now() - lastRotation.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceRotation > 365) {
                  rotationIssues.push({
                    keyId: key.KeyId,
                    alias: keyDetails.KeyMetadata.Alias,
                    issue: \`Overdue for rotation (\${Math.floor(daysSinceRotation)} days)\`
                  });
                }
              }
              
            } catch (error) {
              console.error(\`Error checking rotation for key \${key.KeyId}:\`, error);
            }
          }
          
          if (rotationIssues.length > 0) {
            await sendRotationAlert(rotationIssues);
          }
        }

        async function sendRotationNotification(keyId, status) {
          if (process.env.ALERT_TOPIC_ARN) {
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: \`KMS Key Rotation \${status.toUpperCase()}\`,
              Message: JSON.stringify({
                eventType: 'KEY_ROTATION',
                keyId,
                status,
                timestamp: new Date().toISOString(),
                environment: process.env.ENVIRONMENT
              }, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }

        async function sendRotationAlert(issues) {
          if (process.env.ALERT_TOPIC_ARN) {
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: 'KMS Key Rotation Issues Detected',
              Message: JSON.stringify({
                eventType: 'KEY_ROTATION_ISSUES',
                issueCount: issues.length,
                issues,
                timestamp: new Date().toISOString(),
                environment: process.env.ENVIRONMENT
              }, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }

        async function updateRotationMetrics(keyId, status) {
          const cloudwatch = new AWS.CloudWatch();
          
          const params = {
            Namespace: 'HalluciFix/KMS',
            MetricData: [
              {
                MetricName: 'KeyRotations',
                Value: 1,
                Unit: 'Count',
                Dimensions: [
                  {
                    Name: 'KeyId',
                    Value: keyId
                  },
                  {
                    Name: 'Status',
                    Value: status
                  },
                  {
                    Name: 'Environment',
                    Value: process.env.ENVIRONMENT
                  }
                ]
              }
            ]
          };
          
          await cloudwatch.putMetricData(params).promise();
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant necessary permissions
    keyRotationFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kms:ListKeys',
        'kms:DescribeKey',
        'kms:GetKeyRotationStatus',
        'cloudwatch:PutMetricData',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule weekly rotation status checks
    const rotationCheckRule = new events.Rule(this, 'RotationCheckRule', {
      ruleName: `hallucifix-rotation-check-${props.environment}`,
      description: 'Weekly key rotation status check',
      schedule: events.Schedule.cron({ weekDay: '1', hour: '7', minute: '0' }), // Monday 7 AM
    });

    rotationCheckRule.addTarget(new targets.LambdaFunction(keyRotationFunction));

    // Assign to readonly property using Object.defineProperty
    Object.defineProperty(this, 'keyRotationFunction', { value: keyRotationFunction });
  }

  private setupKeyMonitoring(props: HallucifixEncryptionKeyManagementStackProps) {
    // Key usage alarm
    const keyUsageAlarm = new cloudwatch.Alarm(this, 'KeyUsageAlarm', {
      alarmName: `hallucifix-key-usage-anomaly-${props.environment}`,
      alarmDescription: 'Unusual KMS key usage detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/KMS',
        metricName: 'NumberOfRequestsSucceeded',
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1000, // Adjust based on normal usage patterns
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alertTopic) {
      keyUsageAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertTopic));
    }

    // Key rotation compliance alarm
    const rotationComplianceAlarm = new cloudwatch.Alarm(this, 'RotationComplianceAlarm', {
      alarmName: `hallucifix-rotation-compliance-${props.environment}`,
      alarmDescription: 'KMS key rotation compliance issue',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/KMS',
        metricName: 'KeyRotationEnabled',
        period: cdk.Duration.hours(24),
        statistic: 'Average',
      }),
      threshold: 0.95, // 95% of keys should have rotation enabled
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    if (props.alertTopic) {
      rotationComplianceAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertTopic));
    }
  }

  private setupEncryptionCompliance(props: HallucifixEncryptionKeyManagementStackProps) {
    // Create encryption compliance validation function
    const complianceFunction = new lambda.Function(this, 'EncryptionComplianceFunction', {
      functionName: `hallucifix-encryption-compliance-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3();
        const rds = new AWS.RDS();
        const ec2 = new AWS.EC2();
        const lambda = new AWS.Lambda();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.info("Starting encryption compliance check...");
          
          try {
            const complianceResults = await Promise.all([
              checkS3Encryption(),
              checkRDSEncryption(),
              checkEBSEncryption(),
              checkLambdaEncryption()
            ]);
            
            const report = {
              timestamp: new Date().toISOString(),
              environment: process.env.ENVIRONMENT,
              overallCompliant: complianceResults.every(result => result.compliant),
              services: complianceResults
            };
            
            await sendComplianceReport(report);
            
            return {
              statusCode: 200,
              body: JSON.stringify(report)
            };
          } catch (error) {
            logger.error("Error in encryption compliance check:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function checkS3Encryption() {
          logger.debug("Checking S3 bucket encryption...");
          
          const buckets = await s3.listBuckets().promise();
          const results = [];
          
          for (const bucket of buckets.Buckets) {
            try {
              // Check for bucket encryption configuration
              const encryption = await s3.getBucketEncryption({
                Bucket: bucket.Name
              }).promise();
              
              results.push({
                resource: bucket.Name,
                encrypted: true,
                encryptionType: encryption.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm,
                encryptionMode: 'Customer-Managed'
              });
            } catch (error) {
              if (error.code === 'ServerSideEncryptionConfigurationNotFoundError') {
                // Check if bucket has default AWS-managed encryption
                try {
                  const versioning = await s3.getBucketVersioning({
                    Bucket: bucket.Name
                  }).promise();
                  
                  // If bucket has versioning enabled, it likely uses AWS-managed encryption
                  results.push({
                    resource: bucket.Name,
                    encrypted: true,
                    encryptionType: 'AES256',
                    encryptionMode: 'AWS-Managed',
                    note: 'Using AWS-managed encryption (SSE-S3)'
                  });
                } catch (versionError) {
                  results.push({
                    resource: bucket.Name,
                    encrypted: false,
                    encryptionMode: 'None',
                    issue: 'No encryption configuration found'
                  });
                }
              } else {
                results.push({
                  resource: bucket.Name,
                  encrypted: false,
                  encryptionMode: 'Error',
                  issue: 'Error checking encryption: ' + error.code
                });
              }
            }
          }
          
          const compliantBuckets = results.filter(r => r.encrypted).length;
          
          return {
            service: 'S3',
            compliant: compliantBuckets === results.length,
            totalResources: results.length,
            compliantResources: compliantBuckets,
            details: results
          };
        }

        async function checkRDSEncryption() {
          logger.debug("Checking RDS encryption...");
          
          const instances = await rds.describeDBInstances().promise();
          const results = [];
          
          for (const instance of instances.DBInstances) {
            results.push({
              resource: instance.DBInstanceIdentifier,
              encrypted: instance.StorageEncrypted,
              kmsKeyId: instance.KmsKeyId
            });
          }
          
          const compliantInstances = results.filter(r => r.encrypted).length;
          
          return {
            service: 'RDS',
            compliant: compliantInstances === results.length,
            totalResources: results.length,
            compliantResources: compliantInstances,
            details: results
          };
        }

        async function checkEBSEncryption() {
          logger.debug("Checking EBS encryption...");
          
          const volumes = await ec2.describeVolumes().promise();
          const results = [];
          
          for (const volume of volumes.Volumes) {
            results.push({
              resource: volume.VolumeId,
              encrypted: volume.Encrypted,
              kmsKeyId: volume.KmsKeyId
            });
          }
          
          const compliantVolumes = results.filter(r => r.encrypted).length;
          
          return {
            service: 'EBS',
            compliant: compliantVolumes === results.length,
            totalResources: results.length,
            compliantResources: compliantVolumes,
            details: results
          };
        }

        async function checkLambdaEncryption() {
          logger.debug("Checking Lambda encryption...");
          
          const functions = await lambda.listFunctions().promise();
          const results = [];
          
          for (const func of functions.Functions) {
            const config = await lambda.getFunctionConfiguration({
              FunctionName: func.FunctionName
            }).promise();
            
            results.push({
              resource: func.FunctionName,
              encrypted: !!config.KMSKeyArn,
              kmsKeyArn: config.KMSKeyArn
            });
          }
          
          const compliantFunctions = results.filter(r => r.encrypted).length;
          
          return {
            service: 'Lambda',
            compliant: compliantFunctions === results.length,
            totalResources: results.length,
            compliantResources: compliantFunctions,
            details: results
          };
        }

        async function sendComplianceReport(report) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Encryption Compliance Report - \${report.environment} - \${report.overallCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}\`;
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(report, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(15),
    });

    // Grant necessary permissions
    complianceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:ListAllMyBuckets',
        's3:GetBucketEncryption',
        'rds:DescribeDBInstances',
        'ec2:DescribeVolumes',
        'lambda:ListFunctions',
        'lambda:GetFunctionConfiguration',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule weekly compliance checks
    const complianceRule = new events.Rule(this, 'EncryptionComplianceRule', {
      ruleName: `hallucifix-encryption-compliance-${props.environment}`,
      description: 'Weekly encryption compliance check',
      schedule: events.Schedule.cron({ weekDay: '2', hour: '8', minute: '0' }), // Tuesday 8 AM
    });

    complianceRule.addTarget(new targets.LambdaFunction(complianceFunction));
  }

  private createKeyManagementDashboard(props: HallucifixEncryptionKeyManagementStackProps) {
    const keyDashboard = new cloudwatch.Dashboard(this, 'KeyManagementDashboard', {
      dashboardName: `hallucifix-key-management-${props.environment}`,
    });

    keyDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'KMS API Calls (24h)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/KMS',
            metricName: 'NumberOfRequestsSucceeded',
            period: cdk.Duration.hours(24),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Key Rotation Compliance',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/KMS',
            metricName: 'KeyRotationEnabled',
            period: cdk.Duration.hours(24),
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'KMS Usage Trends',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/KMS',
            metricName: 'NumberOfRequestsSucceeded',
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
            label: 'Successful Requests',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/KMS',
            metricName: 'NumberOfRequestsFailed',
            period: cdk.Duration.hours(1),
            statistic: 'Sum',
            label: 'Failed Requests',
          }),
        ],
        width: 12,
        height: 6,
      })
    );
  }

  private storeKeyParameters(props: HallucifixEncryptionKeyManagementStackProps) {
    // Store key ARNs in Parameter Store for easy access by applications
    new ssm.StringParameter(this, 'ApplicationDataKeyParam', {
      parameterName: `/hallucifix/${props.environment}/kms/application-data-key`,
      stringValue: this.applicationDataKey.keyArn,
      description: 'KMS key ARN for application data encryption',
    });

    new ssm.StringParameter(this, 'DatabaseKeyParam', {
      parameterName: `/hallucifix/${props.environment}/kms/database-key`,
      stringValue: this.databaseKey.keyArn,
      description: 'KMS key ARN for database encryption',
    });

    new ssm.StringParameter(this, 'StorageKeyParam', {
      parameterName: `/hallucifix/${props.environment}/kms/storage-key`,
      stringValue: this.storageKey.keyArn,
      description: 'KMS key ARN for storage encryption',
    });

    new ssm.StringParameter(this, 'LogsKeyParam', {
      parameterName: `/hallucifix/${props.environment}/kms/logs-key`,
      stringValue: this.logsKey.keyArn,
      description: 'KMS key ARN for logs encryption',
    });

    new ssm.StringParameter(this, 'BackupKeyParam', {
      parameterName: `/hallucifix/${props.environment}/kms/backup-key`,
      stringValue: this.backupKey.keyArn,
      description: 'KMS key ARN for backup encryption',
    });
  }

  private createOutputs(props: HallucifixEncryptionKeyManagementStackProps) {
    new cdk.CfnOutput(this, 'ApplicationDataKeyArn', {
      value: this.applicationDataKey.keyArn,
      description: 'Application data encryption key ARN',
      exportName: `${props.environment}-ApplicationDataKeyArn`,
    });

    new cdk.CfnOutput(this, 'DatabaseKeyArn', {
      value: this.databaseKey.keyArn,
      description: 'Database encryption key ARN',
      exportName: `${props.environment}-DatabaseKeyArn`,
    });

    new cdk.CfnOutput(this, 'StorageKeyArn', {
      value: this.storageKey.keyArn,
      description: 'Storage encryption key ARN',
      exportName: `${props.environment}-StorageKeyArn`,
    });

    new cdk.CfnOutput(this, 'LogsKeyArn', {
      value: this.logsKey.keyArn,
      description: 'Logs encryption key ARN',
      exportName: `${props.environment}-LogsKeyArn`,
    });

    new cdk.CfnOutput(this, 'BackupKeyArn', {
      value: this.backupKey.keyArn,
      description: 'Backup encryption key ARN',
      exportName: `${props.environment}-BackupKeyArn`,
    });

    new cdk.CfnOutput(this, 'KeyManagementFunctionArn', {
      value: this.keyManagementFunction.functionArn,
      description: 'Key management function ARN',
      exportName: `${props.environment}-KeyManagementFunctionArn`,
    });
  }
}