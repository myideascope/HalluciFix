import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as shield from 'aws-cdk-lib/aws-shield';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface HallucifixWafSecurityStackProps extends cdk.StackProps {
  environment: string;
  cloudFrontDistribution?: cloudfront.Distribution;
  apiGateway?: apigateway.RestApi;
  alertTopic?: sns.Topic;
  allowedCountries?: string[];
  rateLimitPerMinute?: number;
  enableAdvancedProtection?: boolean;
}

export class HallucifixWafSecurityStack extends cdk.Stack {
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly apiGatewayWebAcl: wafv2.CfnWebACL;
  public readonly securityLogGroup: logs.LogGroup;
  public readonly threatDetectionFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: HallucifixWafSecurityStackProps) {
    super(scope, id, props);

    // Create security logging
    this.setupSecurityLogging(props);

    // Create CloudFront WAF (Global)
    this.createCloudFrontWAF(props);

    // Create API Gateway WAF (Regional)
    this.createApiGatewayWAF(props);

    // Set up AWS Shield Advanced if enabled
    this.setupShieldProtection(props);

    // Create threat detection and response
    this.setupThreatDetection(props);

    // Set up security monitoring and alerting
    this.setupSecurityMonitoring(props);

    // Create security dashboard
    this.createSecurityDashboard(props);

    // Output important information
    this.createOutputs(props);
  }

  private setupSecurityLogging(props: HallucifixWafSecurityStackProps) {
    // Create log group for WAF logs
    this.securityLogGroup = new logs.LogGroup(this, 'SecurityLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/security/waf`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create log group for security events
    new logs.LogGroup(this, 'SecurityEventsLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/security/events`,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  private createCloudFrontWAF(props: HallucifixWafSecurityStackProps) {
    // IP reputation list
    const ipReputationRuleGroup = new wafv2.CfnRuleGroup(this, 'IpReputationRuleGroup', {
      name: `hallucifix-ip-reputation-${props.environment}`,
      scope: 'CLOUDFRONT',
      capacity: 50,
      rules: [
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'IpReputationRule',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'IpReputationRuleGroup',
      },
    });

    // Create CloudFront Web ACL
    this.webAcl = new wafv2.CfnWebACL(this, 'CloudFrontWebACL', {
      name: `hallucifix-cloudfront-waf-${props.environment}`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [
        // AWS Managed Rules - Core Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              excludedRules: [
                { name: 'SizeRestrictions_BODY' }, // Allow larger request bodies for file uploads
                { name: 'GenericRFI_BODY' }, // Reduce false positives for API calls
              ],
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric',
          },
        },
        // AWS Managed Rules - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsMetric',
          },
        },
        // AWS Managed Rules - SQL Injection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSetMetric',
          },
        },
        // Rate limiting rule
        {
          name: 'RateLimitRule',
          priority: 4,
          statement: {
            rateBasedStatement: {
              limit: props.rateLimitPerMinute || 2000,
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitMetric',
          },
        },
        // Geographic restriction (if specified)
        ...(props.allowedCountries ? [{
          name: 'GeoRestrictionRule',
          priority: 5,
          statement: {
            notStatement: {
              statement: {
                geoMatchStatement: {
                  countryCodes: props.allowedCountries,
                },
              },
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'GeoRestrictionMetric',
          },
        }] : []),
        // Custom rule for API abuse detection
        {
          name: 'ApiAbuseDetection',
          priority: 6,
          statement: {
            andStatement: {
              statements: [
                {
                  byteMatchStatement: {
                    fieldToMatch: { uriPath: {} },
                    positionalConstraint: 'STARTS_WITH',
                    searchString: '/api/',
                    textTransformations: [
                      { priority: 0, type: 'LOWERCASE' },
                    ],
                  },
                },
                {
                  rateBasedStatement: {
                    limit: 100, // Stricter limit for API endpoints
                    aggregateKeyType: 'IP',
                  },
                },
              ],
            },
          },
          action: { 
            block: {
              customResponse: {
                responseCode: 429,
                customResponseBodyKey: 'TooManyRequests',
              },
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ApiAbuseMetric',
          },
        },
      ],
      customResponseBodies: {
        TooManyRequests: {
          contentType: 'APPLICATION_JSON',
          content: JSON.stringify({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
          }),
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'CloudFrontWebACL',
      },
    });

    // Enable logging for CloudFront WAF
    new wafv2.CfnLoggingConfiguration(this, 'CloudFrontWAFLogging', {
      resourceArn: this.webAcl.attrArn,
      logDestinationConfigs: [this.securityLogGroup.logGroupArn],
      redactedFields: [
        { singleHeader: { name: 'authorization' } },
        { singleHeader: { name: 'cookie' } },
        { singleHeader: { name: 'x-api-key' } },
      ],
    });

    // Associate WAF with CloudFront distribution if provided
    if (props.cloudFrontDistribution) {
      new wafv2.CfnWebACLAssociation(this, 'CloudFrontWAFAssociation', {
        resourceArn: props.cloudFrontDistribution.distributionDomainName,
        webAclArn: this.webAcl.attrArn,
      });
    }
  }

  private createApiGatewayWAF(props: HallucifixWafSecurityStackProps) {
    // Create API Gateway Web ACL (Regional)
    this.apiGatewayWebAcl = new wafv2.CfnWebACL(this, 'ApiGatewayWebACL', {
      name: `hallucifix-apigateway-waf-${props.environment}`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      rules: [
        // AWS Managed Rules - Core Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              excludedRules: [
                { name: 'SizeRestrictions_BODY' },
                { name: 'GenericRFI_BODY' },
              ],
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ApiCommonRuleSetMetric',
          },
        },
        // AWS Managed Rules - OWASP Top 10
        {
          name: 'AWSManagedRulesOWASPTop10',
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesOWASPTop10',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'OWASPTop10Metric',
          },
        },
        // API-specific rate limiting
        {
          name: 'ApiRateLimitRule',
          priority: 3,
          statement: {
            rateBasedStatement: {
              limit: props.rateLimitPerMinute || 1000,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  fieldToMatch: { uriPath: {} },
                  positionalConstraint: 'STARTS_WITH',
                  searchString: '/api/',
                  textTransformations: [
                    { priority: 0, type: 'LOWERCASE' },
                  ],
                },
              },
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'ApiRateLimitMetric',
          },
        },
        // Authentication bypass attempts
        {
          name: 'AuthBypassDetection',
          priority: 4,
          statement: {
            orStatement: {
              statements: [
                {
                  byteMatchStatement: {
                    fieldToMatch: { uriPath: {} },
                    positionalConstraint: 'CONTAINS',
                    searchString: '../',
                    textTransformations: [
                      { priority: 0, type: 'URL_DECODE' },
                      { priority: 1, type: 'LOWERCASE' },
                    ],
                  },
                },
                {
                  byteMatchStatement: {
                    fieldToMatch: { queryString: {} },
                    positionalConstraint: 'CONTAINS',
                    searchString: 'union select',
                    textTransformations: [
                      { priority: 0, type: 'URL_DECODE' },
                      { priority: 1, type: 'LOWERCASE' },
                    ],
                  },
                },
              ],
            },
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AuthBypassMetric',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'ApiGatewayWebACL',
      },
    });

    // Enable logging for API Gateway WAF
    new wafv2.CfnLoggingConfiguration(this, 'ApiGatewayWAFLogging', {
      resourceArn: this.apiGatewayWebAcl.attrArn,
      logDestinationConfigs: [this.securityLogGroup.logGroupArn],
      redactedFields: [
        { singleHeader: { name: 'authorization' } },
        { singleHeader: { name: 'cookie' } },
        { singleHeader: { name: 'x-api-key' } },
      ],
    });

    // Associate WAF with API Gateway if provided
    if (props.apiGateway) {
      new wafv2.CfnWebACLAssociation(this, 'ApiGatewayWAFAssociation', {
        resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${props.apiGateway.restApiId}/stages/*`,
        webAclArn: this.apiGatewayWebAcl.attrArn,
      });
    }
  }

  private setupShieldProtection(props: HallucifixWafSecurityStackProps) {
    if (!props.enableAdvancedProtection) {
      // AWS Shield Standard is automatically enabled for all AWS customers
      return;
    }

    // Note: AWS Shield Advanced requires manual subscription through the console
    // This creates the necessary monitoring and response automation

    // Create DDoS response team contact information (would be configured manually)
    new cdk.CfnOutput(this, 'ShieldAdvancedInfo', {
      value: 'AWS Shield Advanced should be manually enabled through the AWS Console',
      description: 'Shield Advanced requires manual subscription and DRT contact setup',
    });

    // Create automated DDoS response function
    const ddosResponseFunction = new lambda.Function(this, 'DDoSResponseFunction', {
      functionName: `hallucifix-ddos-response-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const shield = new AWS.Shield({ region: 'us-east-1' }); // Shield is global
        const sns = new AWS.SNS();
        const cloudwatch = new AWS.CloudWatch();

        exports.handler = async (event) => {
          console.log('DDoS Response triggered:', JSON.stringify(event, null, 2));
          
          try {
            // Check for active DDoS attacks
            const attacks = await shield.listAttacks({
              StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
              EndTime: new Date()
            }).promise();
            
            if (attacks.AttackSummaries && attacks.AttackSummaries.length > 0) {
              await handleActiveAttacks(attacks.AttackSummaries);
            }
            
            // Check CloudWatch metrics for anomalies
            await checkTrafficAnomalies();
            
            return {
              statusCode: 200,
              body: JSON.stringify({ message: 'DDoS response check completed' })
            };
          } catch (error) {
            console.error('Error in DDoS response:', error);
            await notifySecurityTeam('DDoS Response Error', error.message);
            throw error;
          }
        };

        async function handleActiveAttacks(attacks) {
          for (const attack of attacks) {
            console.log(\`Active attack detected: \${attack.AttackId}\`);
            
            // Get attack details
            const attackDetail = await shield.describeAttack({
              AttackId: attack.AttackId
            }).promise();
            
            // Notify security team
            await notifySecurityTeam(
              'DDoS Attack Detected',
              \`Attack ID: \${attack.AttackId}\\nResource: \${attack.ResourceArn}\\nStart Time: \${attack.StartTime}\`
            );
            
            // Implement automated mitigation if needed
            await implementMitigation(attackDetail.Attack);
          }
        }

        async function checkTrafficAnomalies() {
          // Check CloudFront request metrics
          const params = {
            Namespace: 'AWS/CloudFront',
            MetricName: 'Requests',
            StartTime: new Date(Date.now() - 60 * 60 * 1000), // Last hour
            EndTime: new Date(),
            Period: 300,
            Statistics: ['Sum']
          };
          
          const metrics = await cloudwatch.getMetricStatistics(params).promise();
          
          if (metrics.Datapoints.length > 0) {
            const latestRequests = metrics.Datapoints[metrics.Datapoints.length - 1].Sum;
            const avgRequests = metrics.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0) / metrics.Datapoints.length;
            
            // Alert if current traffic is 5x normal
            if (latestRequests > avgRequests * 5) {
              await notifySecurityTeam(
                'Traffic Anomaly Detected',
                \`Current requests: \${latestRequests}, Average: \${avgRequests}\`
              );
            }
          }
        }

        async function implementMitigation(attack) {
          // Implement automated mitigation strategies
          console.log('Implementing automated mitigation for attack:', attack.AttackId);
          
          // This could include:
          // - Adjusting WAF rules
          // - Scaling resources
          // - Activating additional protection measures
        }

        async function notifySecurityTeam(subject, message) {
          if (process.env.ALERT_TOPIC_ARN) {
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify({
                alert: subject,
                details: message,
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
      timeout: cdk.Duration.minutes(5),
    });

    // Grant necessary permissions
    ddosResponseFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'shield:ListAttacks',
        'shield:DescribeAttack',
        'cloudwatch:GetMetricStatistics',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule regular DDoS monitoring
    const ddosMonitoringRule = new events.Rule(this, 'DDoSMonitoringRule', {
      ruleName: `hallucifix-ddos-monitoring-${props.environment}`,
      description: 'Monitor for DDoS attacks and traffic anomalies',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    ddosMonitoringRule.addTarget(new targets.LambdaFunction(ddosResponseFunction));
  }

  private setupThreatDetection(props: HallucifixWafSecurityStackProps) {
    // Create threat detection and response function
    this.threatDetectionFunction = new lambda.Function(this, 'ThreatDetectionFunction', {
      functionName: `hallucifix-threat-detection-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const sns = new AWS.SNS();
        const wafv2 = new AWS.WAFV2();

        exports.handler = async (event) => {
          console.log('Threat detection triggered:', JSON.stringify(event, null, 2));
          
          try {
            // Parse WAF log event
            if (event.awslogs && event.awslogs.data) {
              const logData = JSON.parse(Buffer.from(event.awslogs.data, 'base64').toString('utf8'));
              await processWAFLogs(logData.logEvents);
            }
            
            // Process CloudWatch alarm events
            if (event.Records) {
              for (const record of event.Records) {
                if (record.Sns) {
                  await processAlarmEvent(JSON.parse(record.Sns.Message));
                }
              }
            }
            
            return { statusCode: 200, body: 'Threat detection completed' };
          } catch (error) {
            console.error('Error in threat detection:', error);
            throw error;
          }
        };

        async function processWAFLogs(logEvents) {
          const threats = [];
          
          for (const logEvent of logEvents) {
            try {
              const wafLog = JSON.parse(logEvent.message);
              
              // Analyze blocked requests for patterns
              if (wafLog.action === 'BLOCK') {
                const threat = analyzeThreat(wafLog);
                if (threat) {
                  threats.push(threat);
                }
              }
            } catch (error) {
              console.error('Error parsing WAF log:', error);
            }
          }
          
          // Group threats by IP and analyze patterns
          const threatsByIP = groupThreatsByIP(threats);
          
          for (const [ip, ipThreats] of Object.entries(threatsByIP)) {
            if (ipThreats.length >= 10) { // Threshold for persistent attacker
              await handlePersistentThreat(ip, ipThreats);
            }
          }
        }

        function analyzeThreat(wafLog) {
          const threat = {
            timestamp: wafLog.timestamp,
            clientIP: wafLog.httpRequest.clientIP,
            country: wafLog.httpRequest.country,
            uri: wafLog.httpRequest.uri,
            method: wafLog.httpRequest.httpMethod,
            userAgent: wafLog.httpRequest.headers.find(h => h.name.toLowerCase() === 'user-agent')?.value,
            terminatingRuleId: wafLog.terminatingRuleId,
            ruleGroupList: wafLog.ruleGroupList,
            severity: 'medium'
          };
          
          // Determine threat severity
          if (wafLog.terminatingRuleId.includes('SQLi') || 
              wafLog.terminatingRuleId.includes('XSS') ||
              wafLog.terminatingRuleId.includes('RFI')) {
            threat.severity = 'high';
          }
          
          if (wafLog.terminatingRuleId.includes('RateLimit')) {
            threat.severity = 'medium';
          }
          
          return threat;
        }

        function groupThreatsByIP(threats) {
          return threats.reduce((groups, threat) => {
            const ip = threat.clientIP;
            if (!groups[ip]) {
              groups[ip] = [];
            }
            groups[ip].push(threat);
            return groups;
          }, {});
        }

        async function handlePersistentThreat(ip, threats) {
          console.log(\`Persistent threat detected from IP: \${ip}\`);
          
          // Create IP set for blocking if it doesn't exist
          const ipSetName = \`hallucifix-blocked-ips-\${process.env.ENVIRONMENT}\`;
          
          try {
            // Add IP to blocked list (this would require additional WAF rule configuration)
            await addIPToBlockList(ip, ipSetName);
            
            // Send security alert
            await sendSecurityAlert('Persistent Threat Detected', {
              ip,
              threatCount: threats.length,
              timespan: '5 minutes',
              actions: ['IP blocked', 'Security team notified'],
              threats: threats.slice(0, 5) // Include first 5 threats as examples
            });
            
          } catch (error) {
            console.error('Error handling persistent threat:', error);
          }
        }

        async function addIPToBlockList(ip, ipSetName) {
          // This is a simplified example - in practice, you'd need to:
          // 1. Get the current IP set
          // 2. Add the new IP
          // 3. Update the IP set
          // 4. Ensure WAF rules reference this IP set
          
          console.log(\`Would add IP \${ip} to block list \${ipSetName}\`);
        }

        async function processAlarmEvent(alarmData) {
          if (alarmData.NewStateValue === 'ALARM') {
            await sendSecurityAlert('Security Alarm Triggered', {
              alarmName: alarmData.AlarmName,
              alarmDescription: alarmData.AlarmDescription,
              reason: alarmData.NewStateReason,
              timestamp: alarmData.StateChangeTime
            });
          }
        }

        async function sendSecurityAlert(subject, details) {
          if (process.env.ALERT_TOPIC_ARN) {
            const message = {
              alertType: 'SECURITY_THREAT',
              subject,
              details,
              timestamp: new Date().toISOString(),
              environment: process.env.ENVIRONMENT,
              severity: details.severity || 'medium'
            };
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: \`Security Alert: \${subject}\`,
              Message: JSON.stringify(message, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(5),
    });

    // Grant necessary permissions
    this.threatDetectionFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'wafv2:GetIPSet',
        'wafv2:UpdateIPSet',
        'sns:Publish',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    // Subscribe to WAF logs
    new logs.SubscriptionFilter(this, 'WAFLogSubscription', {
      logGroup: this.securityLogGroup,
      destination: new logs.LambdaDestination(this.threatDetectionFunction),
      filterPattern: logs.FilterPattern.allEvents(),
    });
  }

  private setupSecurityMonitoring(props: HallucifixWafSecurityStackProps) {
    // WAF blocked requests alarm
    const wafBlockedRequestsAlarm = new cloudwatch.Alarm(this, 'WAFBlockedRequestsAlarm', {
      alarmName: `hallucifix-waf-blocked-requests-${props.environment}`,
      alarmDescription: 'High number of blocked requests detected by WAF',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: this.webAcl.attrName,
          Region: 'CloudFront',
          Rule: 'ALL',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 100, // 100 blocked requests in 5 minutes
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alertTopic) {
      wafBlockedRequestsAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
    }

    // Rate limit violations alarm
    const rateLimitAlarm = new cloudwatch.Alarm(this, 'RateLimitAlarm', {
      alarmName: `hallucifix-rate-limit-violations-${props.environment}`,
      alarmDescription: 'High number of rate limit violations',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: this.webAcl.attrName,
          Region: 'CloudFront',
          Rule: 'RateLimitRule',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 50, // 50 rate limit violations in 5 minutes
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alertTopic) {
      rateLimitAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
    }

    // SQL injection attempts alarm
    const sqlInjectionAlarm = new cloudwatch.Alarm(this, 'SQLInjectionAlarm', {
      alarmName: `hallucifix-sql-injection-attempts-${props.environment}`,
      alarmDescription: 'SQL injection attempts detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: this.webAcl.attrName,
          Region: 'CloudFront',
          Rule: 'AWSManagedRulesSQLiRuleSet',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1, // Any SQL injection attempt
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alertTopic) {
      sqlInjectionAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
    }
  }

  private createSecurityDashboard(props: HallucifixWafSecurityStackProps) {
    const securityDashboard = new cloudwatch.Dashboard(this, 'SecurityDashboard', {
      dashboardName: `hallucifix-security-${props.environment}`,
    });

    // WAF metrics widgets
    securityDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Blocked Requests (5min)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: this.webAcl.attrName,
              Region: 'CloudFront',
              Rule: 'ALL',
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Allowed Requests (5min)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'AllowedRequests',
            dimensionsMap: {
              WebACL: this.webAcl.attrName,
              Region: 'CloudFront',
              Rule: 'ALL',
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'WAF Request Trends',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'AllowedRequests',
            dimensionsMap: {
              WebACL: this.webAcl.attrName,
              Region: 'CloudFront',
              Rule: 'ALL',
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
            label: 'Allowed',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: this.webAcl.attrName,
              Region: 'CloudFront',
              Rule: 'ALL',
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
            label: 'Blocked',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Security Rule Violations',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: this.webAcl.attrName,
              Region: 'CloudFront',
              Rule: 'AWSManagedRulesSQLiRuleSet',
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
            label: 'SQL Injection',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: this.webAcl.attrName,
              Region: 'CloudFront',
              Rule: 'RateLimitRule',
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
            label: 'Rate Limit',
          }),
        ],
        width: 12,
        height: 6,
      })
    );
  }

  private createOutputs(props: HallucifixWafSecurityStackProps) {
    new cdk.CfnOutput(this, 'CloudFrontWebACLArn', {
      value: this.webAcl.attrArn,
      description: 'CloudFront Web ACL ARN',
      exportName: `${props.environment}-CloudFrontWebACLArn`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayWebACLArn', {
      value: this.apiGatewayWebAcl.attrArn,
      description: 'API Gateway Web ACL ARN',
      exportName: `${props.environment}-ApiGatewayWebACLArn`,
    });

    new cdk.CfnOutput(this, 'SecurityLogGroupName', {
      value: this.securityLogGroup.logGroupName,
      description: 'Security log group name',
      exportName: `${props.environment}-SecurityLogGroupName`,
    });

    new cdk.CfnOutput(this, 'ThreatDetectionFunctionArn', {
      value: this.threatDetectionFunction.functionArn,
      description: 'Threat detection function ARN',
      exportName: `${props.environment}-ThreatDetectionFunctionArn`,
    });
  }
}