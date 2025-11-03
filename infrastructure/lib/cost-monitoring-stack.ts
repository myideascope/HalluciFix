import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface HallucifixCostMonitoringStackProps extends cdk.StackProps {
  environment: string;
  monthlyBudgetLimit: number;
  alertEmail?: string;
  costAllocationTags?: Record<string, string>;
  serviceSpecificBudgets?: {
    lambda?: number;
    rds?: number;
    s3?: number;
    cloudfront?: number;
    elasticache?: number;
    bedrock?: number;
  };
  costOptimizationEnabled?: boolean;
}

export class HallucifixCostMonitoringStack extends cdk.Stack {
  public readonly costAlertTopic: sns.Topic;
  public readonly costDashboard: cloudwatch.Dashboard;
  public readonly costOptimizationFunction: lambda.Function | undefined;

  constructor(scope: Construct, id: string, props: HallucifixCostMonitoringStackProps) {
    super(scope, id, props);

    // Create SNS topic for cost alerts
    this.costAlertTopic = this.createCostAlertTopic(props);

    // Create AWS Budgets
    this.createBudgets(props);

    // Set up cost monitoring alarms
    this.setupCostAlarms(props);

    // Create cost optimization function
    this.costOptimizationFunction = this.createCostOptimizationFunction(props);

    // Create cost monitoring dashboard
    this.costDashboard = this.createCostDashboard(props);

    // Set up cost anomaly detection
    this.setupCostAnomalyDetection(props);

    // Create cost reporting
    this.setupCostReporting(props);

    // Output important information
    this.createOutputs(props);
  }

  private createCostAlertTopic(props: HallucifixCostMonitoringStackProps): sns.Topic {
    const costAlertTopic = new sns.Topic(this, 'CostAlertTopic', {
      topicName: `hallucifix-cost-alerts-${props.environment}`,
      displayName: `HalluciFix Cost Alerts (${props.environment})`,
    });

    if (props.alertEmail) {
      costAlertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    return costAlertTopic;
  }

  private createBudgets(props: HallucifixCostMonitoringStackProps) {
    // Main monthly budget
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `hallucifix-monthly-budget-${props.environment}`,
        budgetLimit: {
          amount: props.monthlyBudgetLimit,
          unit: 'USD',
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
        costFilters: {
          TagKey: ['Environment'],
          TagValue: [props.environment],
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: props.alertEmail ? [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
          ] : [],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: props.alertEmail ? [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
            {
              subscriptionType: 'SNS',
              address: this.costAlertTopic.topicArn,
            },
          ] : [],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: props.alertEmail ? [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
            {
              subscriptionType: 'SNS',
              address: this.costAlertTopic.topicArn,
            },
          ] : [],
        },
      ],
    });

    // Daily budget for cost control
    const dailyBudgetLimit = props.monthlyBudgetLimit / 30;
    new budgets.CfnBudget(this, 'DailyBudget', {
      budget: {
        budgetName: `hallucifix-daily-budget-${props.environment}`,
        budgetLimit: {
          amount: dailyBudgetLimit,
          unit: 'USD',
        },
        timeUnit: 'DAILY',
        budgetType: 'COST',
        costFilters: {
          TagKey: ['Environment'],
          TagValue: [props.environment],
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 150, // Alert if daily spend exceeds 150% of expected
            thresholdType: 'PERCENTAGE',
          },
          subscribers: props.alertEmail ? [
            {
              subscriptionType: 'SNS',
              address: this.costAlertTopic.topicArn,
            },
          ] : [],
        },
      ],
    });

    // Service-specific budgets
    if (props.serviceSpecificBudgets) {
      Object.entries(props.serviceSpecificBudgets).forEach(([service, budget]) => {
        if (budget && budget > 0) {
          new budgets.CfnBudget(this, `${service}Budget`, {
            budget: {
              budgetName: `hallucifix-${service}-budget-${props.environment}`,
              budgetLimit: {
                amount: budget,
                unit: 'USD',
              },
              timeUnit: 'MONTHLY',
              budgetType: 'COST',
              costFilters: {
                Service: [this.getServiceName(service)],
                TagKey: ['Environment'],
                TagValue: [props.environment],
              },
            },
            notificationsWithSubscribers: [
              {
                notification: {
                  notificationType: 'ACTUAL',
                  comparisonOperator: 'GREATER_THAN',
                  threshold: 80,
                  thresholdType: 'PERCENTAGE',
                },
                subscribers: props.alertEmail ? [
                  {
                    subscriptionType: 'SNS',
                    address: this.costAlertTopic.topicArn,
                  },
                ] : [],
              },
            ],
          });
        }
      });
    }
  }

  private getServiceName(service: string): string {
    const serviceMap: Record<string, string> = {
      lambda: 'AWS Lambda',
      rds: 'Amazon Relational Database Service',
      s3: 'Amazon Simple Storage Service',
      cloudfront: 'Amazon CloudFront',
      elasticache: 'Amazon ElastiCache',
      bedrock: 'Amazon Bedrock',
    };
    return serviceMap[service] || service;
  }

  private setupCostAlarms(props: HallucifixCostMonitoringStackProps) {
    // Total estimated charges alarm
    const totalCostAlarm = new cloudwatch.Alarm(this, 'TotalCostAlarm', {
      alarmName: `hallucifix-total-cost-${props.environment}`,
      alarmDescription: 'Total AWS costs are approaching budget limit',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: {
          Currency: 'USD',
        },
        period: cdk.Duration.hours(6),
        statistic: 'Maximum',
      }),
      threshold: props.monthlyBudgetLimit * 0.8, // Alert at 80% of budget
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    totalCostAlarm.addAlarmAction(new SnsAction(this.costAlertTopic));

    // Service-specific cost alarms
    const services = ['AWSLambda', 'AmazonRDS', 'AmazonS3', 'AmazonCloudFront', 'AmazonElastiCache'];
    
    services.forEach(service => {
      const serviceThreshold = this.getServiceThreshold(service, props);
      if (serviceThreshold > 0) {
        const serviceCostAlarm = new cloudwatch.Alarm(this, `${service}CostAlarm`, {
          alarmName: `hallucifix-${service.toLowerCase()}-cost-${props.environment}`,
          alarmDescription: `${service} costs are high`,
          metric: new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: {
              Currency: 'USD',
              ServiceName: service,
            },
            period: cdk.Duration.hours(6),
            statistic: 'Maximum',
          }),
          threshold: serviceThreshold,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });

        serviceCostAlarm.addAlarmAction(new SnsAction(this.costAlertTopic));
      }
    });

    // Cost rate of change alarm
    const costRateAlarm = new cloudwatch.Alarm(this, 'CostRateAlarm', {
      alarmName: `hallucifix-cost-rate-${props.environment}`,
      alarmDescription: 'Cost increase rate is unusually high',
      metric: new cloudwatch.MathExpression({
        expression: 'RATE(m1)',
        usingMetrics: {
          m1: new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: {
              Currency: 'USD',
            },
            period: cdk.Duration.hours(1),
            statistic: 'Maximum',
          }),
        },
        period: cdk.Duration.hours(1),
      }),
      threshold: props.monthlyBudgetLimit / (30 * 24) * 2, // Alert if hourly rate exceeds 2x expected
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    costRateAlarm.addAlarmAction(new SnsAction(this.costAlertTopic));
  }

  private getServiceThreshold(service: string, props: HallucifixCostMonitoringStackProps): number {
    const serviceMap: Record<string, keyof NonNullable<typeof props.serviceSpecificBudgets>> = {
      'AWSLambda': 'lambda',
      'AmazonRDS': 'rds',
      'AmazonS3': 's3',
      'AmazonCloudFront': 'cloudfront',
      'AmazonElastiCache': 'elasticache',
      'AmazonBedrock': 'bedrock',
    };

    const serviceKey = serviceMap[service];
    if (serviceKey && props.serviceSpecificBudgets?.[serviceKey]) {
      return props.serviceSpecificBudgets[serviceKey]! * 0.8; // 80% of service budget
    }

    // Default thresholds as percentage of total budget
    const defaultThresholds: Record<string, number> = {
      'AWSLambda': 0.15, // 15% of total budget
      'AmazonRDS': 0.25, // 25% of total budget
      'AmazonS3': 0.10, // 10% of total budget
      'AmazonCloudFront': 0.05, // 5% of total budget
      'AmazonElastiCache': 0.15, // 15% of total budget
      'AmazonBedrock': 0.30, // 30% of total budget (AI services can be expensive)
    };

    return (defaultThresholds[service] || 0.1) * props.monthlyBudgetLimit;
  }

  private createCostOptimizationFunction(props: HallucifixCostMonitoringStackProps): lambda.Function | undefined {
    if (!props.costOptimizationEnabled) {
      return undefined;
    }

    const costOptimizationFunction = new lambda.Function(this, 'CostOptimizationFunction', {
      functionName: `hallucifix-cost-optimization-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cloudwatch = new AWS.CloudWatch();
        const lambda = new AWS.Lambda();
        const rds = new AWS.RDS();
        const ec2 = new AWS.EC2();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('Running cost optimization analysis...');
          
          const recommendations = [];
          
          try {
            // Analyze Lambda functions
            const lambdaRecommendations = await analyzeLambdaFunctions();
            recommendations.push(...lambdaRecommendations);
            
            // Analyze RDS instances
            const rdsRecommendations = await analyzeRDSInstances();
            recommendations.push(...rdsRecommendations);
            
            // Analyze EC2 instances
            const ec2Recommendations = await analyzeEC2Instances();
            recommendations.push(...ec2Recommendations);
            
            // Send recommendations if any found
            if (recommendations.length > 0) {
              await sendRecommendations(recommendations);
            }
            
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: 'Cost optimization analysis completed',
                recommendationsCount: recommendations.length,
                recommendations
              })
            };
          } catch (error) {
            console.error('Error in cost optimization:', error);
            throw error;
          }
        };

        async function analyzeLambdaFunctions() {
          const recommendations = [];
          
          try {
            const functions = await lambda.listFunctions().promise();
            
            for (const func of functions.Functions) {
              // Get function metrics
              const params = {
                Namespace: 'AWS/Lambda',
                MetricName: 'Duration',
                Dimensions: [
                  {
                    Name: 'FunctionName',
                    Value: func.FunctionName
                  }
                ],
                StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                EndTime: new Date(),
                Period: 3600,
                Statistics: ['Average', 'Maximum']
              };
              
              const metrics = await cloudwatch.getMetricStatistics(params).promise();
              
              if (metrics.Datapoints.length > 0) {
                const avgDuration = metrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / metrics.Datapoints.length;
                const maxDuration = Math.max(...metrics.Datapoints.map(dp => dp.Maximum));
                
                // Check if function is over-provisioned
                if (func.MemorySize > 512 && avgDuration < func.Timeout * 0.1) {
                  recommendations.push({
                    type: 'lambda_memory_optimization',
                    resource: func.FunctionName,
                    currentMemory: func.MemorySize,
                    recommendedMemory: Math.max(128, Math.ceil(func.MemorySize * 0.7)),
                    estimatedSavings: calculateLambdaSavings(func.MemorySize, Math.ceil(func.MemorySize * 0.7)),
                    reason: 'Function appears to be over-provisioned based on execution patterns'
                  });
                }
                
                // Check for unused functions
                if (metrics.Datapoints.length === 0) {
                  recommendations.push({
                    type: 'lambda_unused',
                    resource: func.FunctionName,
                    reason: 'Function has not been invoked in the past 7 days',
                    action: 'Consider removing if no longer needed'
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error analyzing Lambda functions:', error);
          }
          
          return recommendations;
        }

        async function analyzeRDSInstances() {
          const recommendations = [];
          
          try {
            const instances = await rds.describeDBInstances().promise();
            
            for (const instance of instances.DBInstances) {
              // Get CPU utilization metrics
              const params = {
                Namespace: 'AWS/RDS',
                MetricName: 'CPUUtilization',
                Dimensions: [
                  {
                    Name: 'DBInstanceIdentifier',
                    Value: instance.DBInstanceIdentifier
                  }
                ],
                StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                EndTime: new Date(),
                Period: 3600,
                Statistics: ['Average', 'Maximum']
              };
              
              const metrics = await cloudwatch.getMetricStatistics(params).promise();
              
              if (metrics.Datapoints.length > 0) {
                const avgCPU = metrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / metrics.Datapoints.length;
                
                // Check for under-utilized instances
                if (avgCPU < 20) {
                  recommendations.push({
                    type: 'rds_downsize',
                    resource: instance.DBInstanceIdentifier,
                    currentInstanceClass: instance.DBInstanceClass,
                    avgCPUUtilization: avgCPU,
                    reason: 'RDS instance appears to be under-utilized',
                    action: 'Consider downsizing to a smaller instance class'
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error analyzing RDS instances:', error);
          }
          
          return recommendations;
        }

        async function analyzeEC2Instances() {
          const recommendations = [];
          
          try {
            const instances = await ec2.describeInstances().promise();
            
            for (const reservation of instances.Reservations) {
              for (const instance of reservation.Instances) {
                if (instance.State.Name === 'running') {
                  // Get CPU utilization metrics
                  const params = {
                    Namespace: 'AWS/EC2',
                    MetricName: 'CPUUtilization',
                    Dimensions: [
                      {
                        Name: 'InstanceId',
                        Value: instance.InstanceId
                      }
                    ],
                    StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    EndTime: new Date(),
                    Period: 3600,
                    Statistics: ['Average']
                  };
                  
                  const metrics = await cloudwatch.getMetricStatistics(params).promise();
                  
                  if (metrics.Datapoints.length > 0) {
                    const avgCPU = metrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / metrics.Datapoints.length;
                    
                    // Check for under-utilized instances
                    if (avgCPU < 10) {
                      recommendations.push({
                        type: 'ec2_underutilized',
                        resource: instance.InstanceId,
                        instanceType: instance.InstanceType,
                        avgCPUUtilization: avgCPU,
                        reason: 'EC2 instance appears to be under-utilized',
                        action: 'Consider stopping, downsizing, or consolidating workloads'
                      });
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error analyzing EC2 instances:', error);
          }
          
          return recommendations;
        }

        function calculateLambdaSavings(currentMemory, recommendedMemory) {
          // Simplified calculation - actual savings depend on invocation frequency
          const currentCost = currentMemory * 0.0000166667; // Per GB-second
          const recommendedCost = recommendedMemory * 0.0000166667;
          return ((currentCost - recommendedCost) / currentCost * 100).toFixed(2);
        }

        async function sendRecommendations(recommendations) {
          const message = {
            subject: 'AWS Cost Optimization Recommendations',
            recommendations,
            generatedAt: new Date().toISOString(),
            environment: process.env.ENVIRONMENT
          };
          
          const params = {
            TopicArn: process.env.COST_ALERT_TOPIC_ARN,
            Subject: 'Cost Optimization Recommendations Available',
            Message: JSON.stringify(message, null, 2)
          };
          
          await sns.publish(params).promise();
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        COST_ALERT_TOPIC_ARN: this.costAlertTopic.topicArn,
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
    });

    // Grant necessary permissions
    costOptimizationFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricStatistics',
        'lambda:ListFunctions',
        'rds:DescribeDBInstances',
        'ec2:DescribeInstances',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule the function to run weekly
    const optimizationRule = new events.Rule(this, 'CostOptimizationRule', {
      ruleName: `hallucifix-cost-optimization-${props.environment}`,
      description: 'Run cost optimization analysis weekly',
      schedule: events.Schedule.rate(cdk.Duration.days(7)),
    });

    optimizationRule.addTarget(new targets.LambdaFunction(costOptimizationFunction));

    return costOptimizationFunction;
  }

  private createCostDashboard(props: HallucifixCostMonitoringStackProps): cloudwatch.Dashboard {
    const costDashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: `hallucifix-cost-monitoring-${props.environment}`,
    });

    // Total cost widget
    const totalCostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: {
        Currency: 'USD',
      },
      period: cdk.Duration.hours(6),
      statistic: 'Maximum',
    });

    // Service breakdown widgets
    const services = ['AWSLambda', 'AmazonRDS', 'AmazonS3', 'AmazonCloudFront', 'AmazonElastiCache'];
    const serviceMetrics = services.map(service => new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: {
        Currency: 'USD',
        ServiceName: service,
      },
      period: cdk.Duration.hours(6),
      statistic: 'Maximum',
      label: service.replace('Amazon', '').replace('AWS', ''),
    }));

    costDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Total Monthly Cost (USD)',
        metrics: [totalCostMetric],
        width: 8,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Budget Utilization (%)',
        metrics: [
          new cloudwatch.MathExpression({
            expression: `m1 / ${props.monthlyBudgetLimit} * 100`,
            usingMetrics: {
              m1: totalCostMetric,
            },
            period: cdk.Duration.hours(6),
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Days Remaining in Month',
        metrics: [
          new cloudwatch.MathExpression({
            expression: `${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()} - ${new Date().getDate()}`,
            usingMetrics: {},
            period: cdk.Duration.hours(24),
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Cost Trend (Last 30 Days)',
        left: [totalCostMetric],
        width: 24,
        height: 6,
        leftYAxis: {
          label: 'Cost (USD)',
          min: 0,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'Cost by Service',
        left: serviceMetrics,
        width: 24,
        height: 6,
        leftYAxis: {
          label: 'Cost (USD)',
          min: 0,
        },
        stacked: true,
      })
    );

    return costDashboard;
  }

  private setupCostAnomalyDetection(props: HallucifixCostMonitoringStackProps) {
    // Create cost anomaly detection using CloudWatch Anomaly Detection
    const costAnomalyDetector = new cloudwatch.CfnAnomalyDetector(this, 'CostAnomalyDetector', {
      metricName: 'EstimatedCharges',
      namespace: 'AWS/Billing',
      stat: 'Maximum',
      dimensions: [
        {
          name: 'Currency',
          value: 'USD',
        },
      ],
    });

    const costAnomalyAlarm = new cloudwatch.CfnAlarm(this, 'CostAnomalyAlarm', {
      alarmName: `hallucifix-cost-anomaly-${props.environment}`,
      alarmDescription: 'Unusual cost patterns detected',
      comparisonOperator: 'LessThanLowerOrGreaterThanUpperThreshold',
      evaluationPeriods: 1,
      metrics: [
        {
          id: 'm1',
          metricStat: {
            metric: {
              metricName: 'EstimatedCharges',
              namespace: 'AWS/Billing',
              dimensions: [
                {
                  name: 'Currency',
                  value: 'USD',
                },
              ],
            },
            period: 21600, // 6 hours
            stat: 'Maximum',
          },
        },
        {
          id: 'ad1',
          metricStat: {
            metric: {
              metricName: 'EstimatedCharges',
              namespace: 'AWS/Billing',
              dimensions: [
                {
                  name: 'Currency',
                  value: 'USD',
                },
              ],
            },
            period: 21600,
            stat: 'Maximum',
          },
        },
      ],
      thresholdMetricId: 'ad1',
      treatMissingData: 'notBreaching',
      alarmActions: [this.costAlertTopic.topicArn],
    });
  }

  private setupCostReporting(props: HallucifixCostMonitoringStackProps) {
    // Create a function for weekly cost reports
    const costReportFunction = new lambda.Function(this, 'CostReportFunction', {
      functionName: `hallucifix-cost-report-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cloudwatch = new AWS.CloudWatch();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('Generating weekly cost report...');
          
          try {
            const report = await generateCostReport();
            await sendCostReport(report);
            
            return {
              statusCode: 200,
              body: JSON.stringify({ message: 'Cost report sent successfully' })
            };
          } catch (error) {
            console.error('Error generating cost report:', error);
            throw error;
          }
        };

        async function generateCostReport() {
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
          
          // Get total cost for the week
          const totalCostParams = {
            Namespace: 'AWS/Billing',
            MetricName: 'EstimatedCharges',
            Dimensions: [{ Name: 'Currency', Value: 'USD' }],
            StartTime: startTime,
            EndTime: endTime,
            Period: 86400, // Daily
            Statistics: ['Maximum']
          };
          
          const totalCostData = await cloudwatch.getMetricStatistics(totalCostParams).promise();
          
          // Get service breakdown
          const services = ['AWSLambda', 'AmazonRDS', 'AmazonS3', 'AmazonCloudFront', 'AmazonElastiCache'];
          const serviceData = {};
          
          for (const service of services) {
            const serviceParams = {
              ...totalCostParams,
              Dimensions: [
                { Name: 'Currency', Value: 'USD' },
                { Name: 'ServiceName', Value: service }
              ]
            };
            
            const data = await cloudwatch.getMetricStatistics(serviceParams).promise();
            serviceData[service] = data.Datapoints;
          }
          
          return {
            period: { start: startTime, end: endTime },
            totalCost: totalCostData.Datapoints,
            serviceBreakdown: serviceData,
            budget: ${props.monthlyBudgetLimit},
            environment: process.env.ENVIRONMENT
          };
        }

        async function sendCostReport(report) {
          const currentCost = report.totalCost.length > 0 
            ? Math.max(...report.totalCost.map(dp => dp.Maximum))
            : 0;
          
          const budgetUtilization = (currentCost / report.budget * 100).toFixed(2);
          
          const message = {
            subject: 'Weekly AWS Cost Report',
            period: report.period,
            currentMonthCost: currentCost,
            monthlyBudget: report.budget,
            budgetUtilization: budgetUtilization + '%',
            serviceBreakdown: Object.keys(report.serviceBreakdown).map(service => ({
              service,
              cost: report.serviceBreakdown[service].length > 0 
                ? Math.max(...report.serviceBreakdown[service].map(dp => dp.Maximum))
                : 0
            })),
            environment: report.environment,
            generatedAt: new Date().toISOString()
          };
          
          const params = {
            TopicArn: process.env.COST_ALERT_TOPIC_ARN,
            Subject: \`Weekly Cost Report - \${report.environment}\`,
            Message: JSON.stringify(message, null, 2)
          };
          
          await sns.publish(params).promise();
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        COST_ALERT_TOPIC_ARN: this.costAlertTopic.topicArn,
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant permissions
    costReportFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricStatistics',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule weekly reports
    const reportRule = new events.Rule(this, 'CostReportRule', {
      ruleName: `hallucifix-cost-report-${props.environment}`,
      description: 'Generate weekly cost reports',
      schedule: events.Schedule.cron({ weekDay: '1', hour: '9', minute: '0' }), // Monday 9 AM
    });

    reportRule.addTarget(new targets.LambdaFunction(costReportFunction));
  }

  private createOutputs(props: HallucifixCostMonitoringStackProps) {
    new cdk.CfnOutput(this, 'CostAlertTopicArn', {
      value: this.costAlertTopic.topicArn,
      description: 'Cost alerts SNS topic ARN',
      exportName: `${props.environment}-CostAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'CostDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.costDashboard.dashboardName}`,
      description: 'Cost monitoring dashboard URL',
      exportName: `${props.environment}-CostDashboardUrl`,
    });

    new cdk.CfnOutput(this, 'MonthlyBudgetLimit', {
      value: props.monthlyBudgetLimit.toString(),
      description: 'Monthly budget limit in USD',
      exportName: `${props.environment}-MonthlyBudgetLimit`,
    });

    if (this.costOptimizationFunction) {
      new cdk.CfnOutput(this, 'CostOptimizationFunctionArn', {
        value: this.costOptimizationFunction.functionArn,
        description: 'Cost optimization function ARN',
        exportName: `${props.environment}-CostOptimizationFunctionArn`,
      });
    }
  }
}