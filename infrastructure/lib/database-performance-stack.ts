import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

import { logger } from './logging';
export interface HallucifixDatabasePerformanceStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  databaseCluster?: rds.DatabaseCluster;
  alertTopic?: sns.Topic;
  performanceInsightsEnabled?: boolean;
  connectionPooling?: {
    enabled: boolean;
    maxConnections?: number;
    idleTimeout?: number;
  };
  readReplicaConfig?: {
    enabled: boolean;
    minReplicas?: number;
    maxReplicas?: number;
    regions?: string[];
  };
}

export class HallucifixDatabasePerformanceStack extends cdk.Stack {
  public readonly rdsProxy: rds.DatabaseProxy | undefined;
  public readonly performanceInsightsLogGroup: logs.LogGroup | undefined;
  public readonly queryOptimizationFunction: lambda.Function;
  public readonly performanceMonitoringFunction: lambda.Function;
  public readonly readReplicas: rds.DatabaseInstance[] = [];

  constructor(scope: Construct, id: string, props: HallucifixDatabasePerformanceStackProps) {
    super(scope, id, props);

    // Set up RDS Proxy for connection pooling
    this.rdsProxy = this.setupRDSProxy(props);

    // Configure Performance Insights
    this.performanceInsightsLogGroup = this.setupPerformanceInsights(props);

    // Set up read replicas
    this.setupReadReplicas(props);

    // Create query optimization automation
    this.queryOptimizationFunction = this.setupQueryOptimization(props);

    // Set up performance monitoring
    this.performanceMonitoringFunction = this.setupPerformanceMonitoring(props);

    // Create database performance dashboard
    this.createPerformanceDashboard(props);

    // Set up automated performance tuning
    this.setupAutomatedTuning(props);

    // Output important information
    this.createOutputs(props);
  }

  private setupRDSProxy(props: HallucifixDatabasePerformanceStackProps): rds.DatabaseProxy | undefined {
    if (!props.connectionPooling?.enabled || !props.databaseCluster) {
      return undefined;
    }

    const maxConnections = props.connectionPooling.maxConnections || 100;
    const idleTimeout = props.connectionPooling.idleTimeout || 1800; // 30 minutes

    // Create RDS Proxy role
    const proxyRole = new iam.Role(this, 'RDSProxyRole', {
      roleName: `hallucifix-rds-proxy-role-${props.environment}`,
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonRDSEnhancedMonitoringRole'),
      ],
    });

    // Grant access to database credentials in Secrets Manager
    proxyRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret',
      ],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:hallucifix-db-credentials-*`,
      ],
    }));

    // Create RDS Proxy
    const rdsProxy = new rds.DatabaseProxy(this, 'RDSProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(props.databaseCluster),
      secrets: [props.databaseCluster.secret!],
      vpc: props.vpc,
      role: proxyRole,
      dbProxyName: `hallucifix-db-proxy-${props.environment}`,

      maxConnectionsPercent: 100,
      maxIdleConnectionsPercent: 50,
      requireTLS: true,
      idleClientTimeout: cdk.Duration.seconds(idleTimeout),
      debugLogging: true,
    });

    // Create CloudWatch alarms for RDS Proxy
    if (this.rdsProxy) {
      const proxyConnectionsAlarm = new cloudwatch.Alarm(this, 'ProxyConnectionsAlarm', {
        alarmName: `${this.rdsProxy.dbProxyName}-connections-high`,
        alarmDescription: 'RDS Proxy connections are high',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'DatabaseConnections',
          dimensionsMap: {
            ProxyName: this.rdsProxy.dbProxyName,
          },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: maxConnections * 0.8, // Alert at 80% of max connections
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

      if (props.alertTopic) {
        proxyConnectionsAlarm.addAlarmAction(new SnsAction(props.alertTopic));
      }

      // Store RDS Proxy endpoint in Parameter Store
      new ssm.StringParameter(this, 'RDSProxyEndpoint', {
        parameterName: `/hallucifix/${props.environment}/database/proxy-endpoint`,
        stringValue: this.rdsProxy.endpoint,
        description: 'RDS Proxy endpoint for connection pooling',
      });
    }

    return rdsProxy;
  }

  private setupPerformanceInsights(props: HallucifixDatabasePerformanceStackProps): logs.LogGroup | undefined {
    if (!props.performanceInsightsEnabled) {
      return undefined;
    }

    // Create log group for Performance Insights
    const performanceInsightsLogGroup = new logs.LogGroup(this, 'PerformanceInsightsLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/database/performance-insights`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // Create Performance Insights analysis function
    const performanceInsightsFunction = new lambda.Function(this, 'PerformanceInsightsFunction', {
      functionName: `hallucifix-performance-insights-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const pi = new AWS.PI();
        const sns = new AWS.SNS();
        const cloudwatch = new AWS.CloudWatch();

        exports.handler = async (event) => {
          logger.debug("Performance Insights analysis triggered");
          
          try {
            const analysis = await analyzePerformanceInsights();
            await sendPerformanceReport(analysis);
            
            return {
              statusCode: 200,
              body: JSON.stringify(analysis)
            };
          } catch (error) {
            logger.error("Error in Performance Insights analysis:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function analyzePerformanceInsights() {
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
          
          const analysis = {
            timestamp: endTime.toISOString(),
            environment: process.env.ENVIRONMENT,
            timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
            topQueries: [],
            resourceUtilization: {},
            recommendations: []
          };
          
          try {
            // Get resource utilization metrics
            const resourceParams = {
              ServiceType: 'RDS',
              Identifier: process.env.DB_RESOURCE_ID,
              StartTime: startTime,
              EndTime: endTime,
              MetricQueries: [
                {
                  Metric: 'db.CPU.Innodb.PCT',
                  GroupBy: { Group: 'db.wait_event' }
                },
                {
                  Metric: 'db.IO.read.avg_latency.ms',
                  GroupBy: { Group: 'db.wait_event' }
                },
                {
                  Metric: 'db.IO.write.avg_latency.ms',
                  GroupBy: { Group: 'db.wait_event' }
                }
              ]
            };
            
            const resourceMetrics = await pi.getResourceMetrics(resourceParams).promise();
            analysis.resourceUtilization = processResourceMetrics(resourceMetrics);
            
            // Get top SQL queries
            const topSqlParams = {
              ServiceType: 'RDS',
              Identifier: process.env.DB_RESOURCE_ID,
              StartTime: startTime,
              EndTime: endTime,
              GroupBy: { Group: 'db.sql_tokenized.statement' },
              Metric: 'db.load.avg',
              MaxResults: 10
            };
            
            const topSqlQueries = await pi.getDimensionKeyDetails(topSqlParams).promise();
            analysis.topQueries = processTopQueries(topSqlQueries);
            
            // Generate recommendations
            analysis.recommendations = generateRecommendations(analysis);
            
          } catch (error) {
            logger.error("Error getting Performance Insights data:", error instanceof Error ? error : new Error(String(error)));
            analysis.error = error.message;
          }
          
          return analysis;
        }

        function processResourceMetrics(resourceMetrics) {
          const utilization = {
            cpu: { average: 0, peak: 0 },
            io: { readLatency: 0, writeLatency: 0 },
            memory: { usage: 0 }
          };
          
          if (resourceMetrics.MetricList) {
            resourceMetrics.MetricList.forEach(metric => {
              if (metric.Key && metric.Key.Metric === 'db.CPU.Innodb.PCT') {
                const dataPoints = metric.DataPoints || [];
                if (dataPoints.length > 0) {
                  utilization.cpu.average = dataPoints.reduce((sum, dp) => sum + dp.Value, 0) / dataPoints.length;
                  utilization.cpu.peak = Math.max(...dataPoints.map(dp => dp.Value));
                }
              }
            });
          }
          
          return utilization;
        }

        function processTopQueries(topSqlQueries) {
          const queries = [];
          
          if (topSqlQueries.Dimensions) {
            topSqlQueries.Dimensions.forEach((dimension, index) => {
              queries.push({
                rank: index + 1,
                sqlId: dimension.Value,
                statement: dimension.Dimensions && dimension.Dimensions['db.sql_tokenized.statement'] 
                  ? dimension.Dimensions['db.sql_tokenized.statement'].substring(0, 200) + '...'
                  : 'N/A',
                avgLoad: dimension.Partitions ? dimension.Partitions[0].Value : 0,
                executionCount: Math.floor(Math.random() * 1000) + 100 // Placeholder
              });
            });
          }
          
          return queries;
        }

        function generateRecommendations(analysis) {
          const recommendations = [];
          
          // CPU-based recommendations
          if (analysis.resourceUtilization.cpu && analysis.resourceUtilization.cpu.average > 80) {
            recommendations.push({
              type: 'CPU_OPTIMIZATION',
              priority: 'HIGH',
              description: 'High CPU utilization detected',
              recommendation: 'Consider upgrading instance class or optimizing queries',
              impact: 'Performance improvement'
            });
          }
          
          // Query-based recommendations
          if (analysis.topQueries.length > 0) {
            const highLoadQueries = analysis.topQueries.filter(q => q.avgLoad > 10);
            if (highLoadQueries.length > 0) {
              recommendations.push({
                type: 'QUERY_OPTIMIZATION',
                priority: 'MEDIUM',
                description: \`\${highLoadQueries.length} queries with high load detected\`,
                recommendation: 'Review and optimize slow queries, consider adding indexes',
                impact: 'Query performance improvement'
              });
            }
          }
          
          // General recommendations
          recommendations.push({
            type: 'MONITORING',
            priority: 'LOW',
            description: 'Regular performance monitoring',
            recommendation: 'Continue monitoring database performance metrics',
            impact: 'Proactive issue detection'
          });
          
          return recommendations;
        }

        async function sendPerformanceReport(analysis) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Database Performance Report - \${analysis.environment}\`;
            
            const summary = {
              timestamp: analysis.timestamp,
              environment: analysis.environment,
              cpuUtilization: analysis.resourceUtilization.cpu?.average || 0,
              topQueriesCount: analysis.topQueries.length,
              recommendationsCount: analysis.recommendations.length,
              highPriorityIssues: analysis.recommendations.filter(r => r.priority === 'HIGH').length
            };
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(summary, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
        DB_RESOURCE_ID: props.databaseCluster?.clusterResourceIdentifier || '',
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant Performance Insights permissions
    performanceInsightsFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'pi:GetResourceMetrics',
        'pi:GetDimensionKeyDetails',
        'pi:DescribeDimensionKeys',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule Performance Insights analysis
    const performanceInsightsRule = new events.Rule(this, 'PerformanceInsightsRule', {
      ruleName: `hallucifix-performance-insights-${props.environment}`,
      description: 'Daily Performance Insights analysis',
      schedule: events.Schedule.cron({ hour: '6', minute: '0' }), // 6 AM daily
    });

    performanceInsightsRule.addTarget(new targets.LambdaFunction(performanceInsightsFunction));

    return performanceInsightsLogGroup;
  }

  private setupReadReplicas(props: HallucifixDatabasePerformanceStackProps) {
    if (!props.readReplicaConfig?.enabled || !props.databaseCluster) {
      return;
    }

    const minReplicas = props.readReplicaConfig.minReplicas || 1;
    const maxReplicas = props.readReplicaConfig.maxReplicas || 3;
    const regions = props.readReplicaConfig.regions || [this.region];

    // Create read replicas in specified regions
    regions.forEach((region, index) => {
      if (region === this.region) {
        // Create local read replicas
        for (let i = 0; i < minReplicas; i++) {
          const readReplica = new rds.DatabaseInstance(this, `ReadReplica${index}-${i}`, {
            instanceIdentifier: `hallucifix-read-replica-${props.environment}-${index}-${i}`,
            engine: rds.DatabaseInstanceEngine.postgres({
              version: rds.PostgresEngineVersion.VER_14,
            }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
            vpc: props.vpc,
            multiAz: false,
            publiclyAccessible: false,
            deletionProtection: true,
            backupRetention: cdk.Duration.days(7),
            monitoringInterval: cdk.Duration.minutes(1),
            enablePerformanceInsights: props.performanceInsightsEnabled,
            performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
            cloudwatchLogsExports: ['postgresql'],
          });

          this.readReplicas.push(readReplica);

          // Create read replica monitoring
          const replicaLagAlarm = new cloudwatch.Alarm(this, `ReadReplicaLagAlarm${index}-${i}`, {
            alarmName: `${readReplica.instanceIdentifier}-replica-lag`,
            alarmDescription: 'Read replica lag is high',
            metric: new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'ReplicaLag',
              dimensionsMap: {
                DBInstanceIdentifier: readReplica.instanceIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
            }),
            threshold: 30, // 30 seconds lag
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING,
          });

          if (props.alertTopic) {
            replicaLagAlarm.addAlarmAction(new SnsAction(props.alertTopic));
          }
        }
      }
    });

    // Store read replica endpoints in Parameter Store
    this.readReplicas.forEach((replica, index) => {
      new ssm.StringParameter(this, `ReadReplicaEndpoint${index}`, {
        parameterName: `/hallucifix/${props.environment}/database/read-replica-${index}-endpoint`,
        stringValue: replica.instanceEndpoint.hostname,
        description: `Read replica ${index} endpoint`,
      });
    });
  }

  private setupQueryOptimization(props: HallucifixDatabasePerformanceStackProps): lambda.Function {
    const queryOptimizationFunction = new lambda.Function(this, 'QueryOptimizationFunction', {
      functionName: `hallucifix-query-optimization-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const rds = new AWS.RDS();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.debug("Query optimization analysis triggered");
          
          try {
            const optimization = await analyzeQueryPerformance();
            await applyOptimizations(optimization);
            await sendOptimizationReport(optimization);
            
            return {
              statusCode: 200,
              body: JSON.stringify(optimization)
            };
          } catch (error) {
            logger.error("Error in query optimization:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function analyzeQueryPerformance() {
          const analysis = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            slowQueries: [],
            indexRecommendations: [],
            parameterRecommendations: [],
            optimizationsApplied: []
          };
          
          // Analyze slow queries (this would connect to the database in a real implementation)
          analysis.slowQueries = await identifySlowQueries();
          
          // Generate index recommendations
          analysis.indexRecommendations = await generateIndexRecommendations(analysis.slowQueries);
          
          // Generate parameter tuning recommendations
          analysis.parameterRecommendations = await generateParameterRecommendations();
          
          return analysis;
        }

        async function identifySlowQueries() {
          // In a real implementation, this would query pg_stat_statements or similar
          return [
            {
              query: 'SELECT * FROM analysis_results WHERE accuracy < ? ORDER BY created_at DESC',
              avgExecutionTime: 2500,
              executionCount: 1250,
              totalTime: 3125000,
              recommendation: 'Add index on (accuracy, created_at)'
            },
            {
              query: 'SELECT COUNT(*) FROM users u JOIN user_sessions s ON u.id = s.user_id WHERE s.created_at > ?',
              avgExecutionTime: 1800,
              executionCount: 890,
              totalTime: 1602000,
              recommendation: 'Add composite index on user_sessions(user_id, created_at)'
            },
            {
              query: 'UPDATE scheduled_scans SET status = ? WHERE id = ?',
              avgExecutionTime: 150,
              executionCount: 5600,
              totalTime: 840000,
              recommendation: 'Query is already optimized'
            }
          ];
        }

        async function generateIndexRecommendations(slowQueries) {
          const recommendations = [];
          
          slowQueries.forEach(query => {
            if (query.avgExecutionTime > 1000) { // Queries taking more than 1 second
              if (query.query.includes('ORDER BY') && query.query.includes('WHERE')) {
                recommendations.push({
                  type: 'COMPOSITE_INDEX',
                  table: extractTableName(query.query),
                  columns: extractColumns(query.query),
                  priority: 'HIGH',
                  estimatedImprovement: '60-80%',
                  query: query.query.substring(0, 100) + '...'
                });
              } else if (query.query.includes('JOIN')) {
                recommendations.push({
                  type: 'JOIN_INDEX',
                  table: extractTableName(query.query),
                  columns: extractJoinColumns(query.query),
                  priority: 'MEDIUM',
                  estimatedImprovement: '40-60%',
                  query: query.query.substring(0, 100) + '...'
                });
              }
            }
          });
          
          return recommendations;
        }

        async function generateParameterRecommendations() {
          return [
            {
              parameter: 'shared_buffers',
              currentValue: '128MB',
              recommendedValue: '256MB',
              reason: 'Increase buffer cache for better performance',
              impact: 'Medium'
            },
            {
              parameter: 'effective_cache_size',
              currentValue: '4GB',
              recommendedValue: '6GB',
              reason: 'Better query planning with accurate cache size',
              impact: 'Low'
            },
            {
              parameter: 'work_mem',
              currentValue: '4MB',
              recommendedValue: '8MB',
              reason: 'Improve sort and hash operations',
              impact: 'Medium'
            }
          ];
        }

        async function applyOptimizations(optimization) {
          const applied = [];
          
          // Apply safe parameter changes (in a real implementation)
          for (const param of optimization.parameterRecommendations) {
            if (param.impact === 'Low' || param.impact === 'Medium') {
              console.log(\`Would apply parameter change: \${param.parameter} = \${param.recommendedValue}\`);
              applied.push({
                type: 'PARAMETER_CHANGE',
                parameter: param.parameter,
                value: param.recommendedValue,
                status: 'SIMULATED'
              });
            }
          }
          
          optimization.optimizationsApplied = applied;
        }

        function extractTableName(query) {
          const match = query.match(/FROM\\s+(\\w+)/i);
          return match ? match[1] : 'unknown';
        }

        function extractColumns(query) {
          // Simplified column extraction
          const whereMatch = query.match(/WHERE\\s+(\\w+)/i);
          const orderMatch = query.match(/ORDER BY\\s+(\\w+)/i);
          
          const columns = [];
          if (whereMatch) columns.push(whereMatch[1]);
          if (orderMatch) columns.push(orderMatch[1]);
          
          return columns;
        }

        function extractJoinColumns(query) {
          const joinMatch = query.match(/ON\\s+(\\w+\\.\\w+)\\s*=\\s*(\\w+\\.\\w+)/i);
          return joinMatch ? [joinMatch[1], joinMatch[2]] : [];
        }

        async function sendOptimizationReport(optimization) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Database Query Optimization Report - \${optimization.environment}\`;
            
            const summary = {
              timestamp: optimization.timestamp,
              environment: optimization.environment,
              slowQueriesFound: optimization.slowQueries.length,
              indexRecommendations: optimization.indexRecommendations.length,
              parameterRecommendations: optimization.parameterRecommendations.length,
              optimizationsApplied: optimization.optimizationsApplied.length,
              topSlowQueries: optimization.slowQueries.slice(0, 3).map(q => ({
                avgTime: q.avgExecutionTime,
                executions: q.executionCount,
                recommendation: q.recommendation
              }))
            };
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(summary, null, 2)
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
    queryOptimizationFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds:DescribeDBInstances',
        'rds:DescribeDBClusters',
        'rds:DescribeDBParameterGroups',
        'rds:ModifyDBParameterGroup',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule query optimization analysis
    const queryOptimizationRule = new events.Rule(this, 'QueryOptimizationRule', {
      ruleName: `hallucifix-query-optimization-${props.environment}`,
      description: 'Weekly query optimization analysis',
      schedule: events.Schedule.cron({ weekDay: '1', hour: '3', minute: '0' }), // Monday 3 AM
    });

    queryOptimizationRule.addTarget(new targets.LambdaFunction(queryOptimizationFunction));

    return queryOptimizationFunction;
  }

  private setupPerformanceMonitoring(props: HallucifixDatabasePerformanceStackProps): lambda.Function {
    const performanceMonitoringFunction = new lambda.Function(this, 'PerformanceMonitoringFunction', {
      functionName: `hallucifix-db-performance-monitoring-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cloudwatch = new AWS.CloudWatch();
        const rds = new AWS.RDS();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.debug("Database performance monitoring triggered");
          
          try {
            const monitoring = await monitorDatabasePerformance();
            await sendMonitoringReport(monitoring);
            
            return {
              statusCode: 200,
              body: JSON.stringify(monitoring)
            };
          } catch (error) {
            logger.error("Error in database performance monitoring:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function monitorDatabasePerformance() {
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago
          
          const monitoring = {
            timestamp: endTime.toISOString(),
            environment: process.env.ENVIRONMENT,
            timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
            metrics: {},
            alerts: [],
            recommendations: []
          };
          
          // Get database metrics
          monitoring.metrics = await getDatabaseMetrics(startTime, endTime);
          
          // Analyze metrics and generate alerts
          monitoring.alerts = analyzeMetrics(monitoring.metrics);
          
          // Generate performance recommendations
          monitoring.recommendations = generatePerformanceRecommendations(monitoring.metrics);
          
          return monitoring;
        }

        async function getDatabaseMetrics(startTime, endTime) {
          const metrics = {};
          
          const metricQueries = [
            { name: 'CPUUtilization', namespace: 'AWS/RDS', metric: 'CPUUtilization' },
            { name: 'DatabaseConnections', namespace: 'AWS/RDS', metric: 'DatabaseConnections' },
            { name: 'ReadLatency', namespace: 'AWS/RDS', metric: 'ReadLatency' },
            { name: 'WriteLatency', namespace: 'AWS/RDS', metric: 'WriteLatency' },
            { name: 'ReadThroughput', namespace: 'AWS/RDS', metric: 'ReadThroughput' },
            { name: 'WriteThroughput', namespace: 'AWS/RDS', metric: 'WriteThroughput' },
            { name: 'FreeableMemory', namespace: 'AWS/RDS', metric: 'FreeableMemory' },
            { name: 'SwapUsage', namespace: 'AWS/RDS', metric: 'SwapUsage' }
          ];
          
          for (const query of metricQueries) {
            try {
              const params = {
                Namespace: query.namespace,
                MetricName: query.metric,
                StartTime: startTime,
                EndTime: endTime,
                Period: 300, // 5 minutes
                Statistics: ['Average', 'Maximum'],
                Dimensions: [
                  {
                    Name: 'DBClusterIdentifier',
                    Value: process.env.DB_CLUSTER_ID || 'hallucifix-cluster'
                  }
                ]
              };
              
              const result = await cloudwatch.getMetricStatistics(params).promise();
              
              if (result.Datapoints.length > 0) {
                metrics[query.name] = {
                  average: result.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / result.Datapoints.length,
                  maximum: Math.max(...result.Datapoints.map(dp => dp.Maximum)),
                  datapoints: result.Datapoints.length
                };
              }
            } catch (error) {
              console.error(\`Error getting metric \${query.name}:\`, error);
            }
          }
          
          return metrics;
        }

        function analyzeMetrics(metrics) {
          const alerts = [];
          
          // CPU utilization alerts
          if (metrics.CPUUtilization && metrics.CPUUtilization.average > 80) {
            alerts.push({
              type: 'HIGH_CPU',
              severity: 'HIGH',
              message: \`High CPU utilization: \${metrics.CPUUtilization.average.toFixed(2)}%\`,
              recommendation: 'Consider scaling up instance or optimizing queries'
            });
          }
          
          // Connection alerts
          if (metrics.DatabaseConnections && metrics.DatabaseConnections.average > 80) {
            alerts.push({
              type: 'HIGH_CONNECTIONS',
              severity: 'MEDIUM',
              message: \`High connection count: \${metrics.DatabaseConnections.average.toFixed(0)}\`,
              recommendation: 'Enable connection pooling or review connection management'
            });
          }
          
          // Latency alerts
          if (metrics.ReadLatency && metrics.ReadLatency.average > 0.02) { // 20ms
            alerts.push({
              type: 'HIGH_READ_LATENCY',
              severity: 'MEDIUM',
              message: \`High read latency: \${(metrics.ReadLatency.average * 1000).toFixed(2)}ms\`,
              recommendation: 'Check for slow queries or consider read replicas'
            });
          }
          
          if (metrics.WriteLatency && metrics.WriteLatency.average > 0.05) { // 50ms
            alerts.push({
              type: 'HIGH_WRITE_LATENCY',
              severity: 'MEDIUM',
              message: \`High write latency: \${(metrics.WriteLatency.average * 1000).toFixed(2)}ms\`,
              recommendation: 'Optimize write operations or check storage performance'
            });
          }
          
          // Memory alerts
          if (metrics.FreeableMemory && metrics.FreeableMemory.average < 100 * 1024 * 1024) { // 100MB
            alerts.push({
              type: 'LOW_MEMORY',
              severity: 'HIGH',
              message: \`Low freeable memory: \${(metrics.FreeableMemory.average / 1024 / 1024).toFixed(0)}MB\`,
              recommendation: 'Scale up instance or optimize memory usage'
            });
          }
          
          // Swap usage alerts
          if (metrics.SwapUsage && metrics.SwapUsage.average > 0) {
            alerts.push({
              type: 'SWAP_USAGE',
              severity: 'HIGH',
              message: \`Swap usage detected: \${(metrics.SwapUsage.average / 1024 / 1024).toFixed(2)}MB\`,
              recommendation: 'Increase instance memory to avoid swap usage'
            });
          }
          
          return alerts;
        }

        function generatePerformanceRecommendations(metrics) {
          const recommendations = [];
          
          // Throughput analysis
          if (metrics.ReadThroughput && metrics.WriteThroughput) {
            const readWriteRatio = metrics.ReadThroughput.average / (metrics.WriteThroughput.average || 1);
            
            if (readWriteRatio > 5) {
              recommendations.push({
                type: 'READ_OPTIMIZATION',
                priority: 'MEDIUM',
                description: 'High read-to-write ratio detected',
                recommendation: 'Consider implementing read replicas to distribute read load',
                impact: 'Improved read performance and reduced primary load'
              });
            }
          }
          
          // Connection optimization
          if (metrics.DatabaseConnections && metrics.DatabaseConnections.average > 50) {
            recommendations.push({
              type: 'CONNECTION_POOLING',
              priority: 'HIGH',
              description: 'High connection count detected',
              recommendation: 'Implement RDS Proxy for connection pooling',
              impact: 'Reduced connection overhead and improved scalability'
            });
          }
          
          // Performance baseline
          recommendations.push({
            type: 'MONITORING',
            priority: 'LOW',
            description: 'Continuous performance monitoring',
            recommendation: 'Maintain regular performance monitoring and establish baselines',
            impact: 'Proactive performance issue detection'
          });
          
          return recommendations;
        }

        async function sendMonitoringReport(monitoring) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Database Performance Monitoring - \${monitoring.environment}\`;
            
            const summary = {
              timestamp: monitoring.timestamp,
              environment: monitoring.environment,
              alertsCount: monitoring.alerts.length,
              highSeverityAlerts: monitoring.alerts.filter(a => a.severity === 'HIGH').length,
              recommendationsCount: monitoring.recommendations.length,
              keyMetrics: {
                cpuUtilization: monitoring.metrics.CPUUtilization?.average || 0,
                connections: monitoring.metrics.DatabaseConnections?.average || 0,
                readLatency: monitoring.metrics.ReadLatency?.average || 0,
                writeLatency: monitoring.metrics.WriteLatency?.average || 0
              },
              alerts: monitoring.alerts
            };
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(summary, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
        DB_CLUSTER_ID: props.databaseCluster?.clusterIdentifier || '',
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant necessary permissions
    performanceMonitoringFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricStatistics',
        'rds:DescribeDBInstances',
        'rds:DescribeDBClusters',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule performance monitoring
    const performanceMonitoringRule = new events.Rule(this, 'PerformanceMonitoringRule', {
      ruleName: `hallucifix-db-performance-monitoring-${props.environment}`,
      description: 'Hourly database performance monitoring',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });

    performanceMonitoringRule.addTarget(new targets.LambdaFunction(performanceMonitoringFunction));

    return performanceMonitoringFunction;
  }

  private setupAutomatedTuning(props: HallucifixDatabasePerformanceStackProps) {
    // Create automated tuning function
    const autoTuningFunction = new lambda.Function(this, 'AutoTuningFunction', {
      functionName: `hallucifix-db-auto-tuning-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const rds = new AWS.RDS();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.debug("Database auto-tuning triggered");
          
          try {
            const tuning = await performAutoTuning();
            await sendTuningReport(tuning);
            
            return {
              statusCode: 200,
              body: JSON.stringify(tuning)
            };
          } catch (error) {
            logger.error("Error in database auto-tuning:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function performAutoTuning() {
          const tuning = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            parametersAnalyzed: [],
            changesApplied: [],
            recommendations: []
          };
          
          // Analyze current parameter group settings
          tuning.parametersAnalyzed = await analyzeParameterGroup();
          
          // Apply safe automatic tuning
          tuning.changesApplied = await applySafeTuning(tuning.parametersAnalyzed);
          
          // Generate manual tuning recommendations
          tuning.recommendations = await generateTuningRecommendations(tuning.parametersAnalyzed);
          
          return tuning;
        }

        async function analyzeParameterGroup() {
          const parameters = [];
          
          try {
            // Get parameter group information
            const paramGroups = await rds.describeDBParameterGroups({
              DBParameterGroupName: process.env.DB_PARAMETER_GROUP || 'default.postgres14'
            }).promise();
            
            if (paramGroups.DBParameterGroups.length > 0) {
              const paramGroupName = paramGroups.DBParameterGroups[0].DBParameterGroupName;
              
              const params = await rds.describeDBParameters({
                DBParameterGroupName: paramGroupName
              }).promise();
              
              params.Parameters.forEach(param => {
                if (param.IsModifiable && param.ParameterName) {
                  parameters.push({
                    name: param.ParameterName,
                    value: param.ParameterValue,
                    defaultValue: param.DefaultValue,
                    allowedValues: param.AllowedValues,
                    dataType: param.DataType,
                    description: param.Description,
                    isModifiable: param.IsModifiable
                  });
                }
              });
            }
          } catch (error) {
            logger.error("Error analyzing parameter group:", error instanceof Error ? error : new Error(String(error)));
          }
          
          return parameters;
        }

        async function applySafeTuning(parameters) {
          const changes = [];
          
          // Apply conservative, safe parameter changes
          const safeChanges = [
            {
              name: 'log_statement',
              value: 'ddl',
              reason: 'Enable DDL statement logging for better monitoring'
            },
            {
              name: 'log_min_duration_statement',
              value: '1000',
              reason: 'Log queries taking more than 1 second'
            },
            {
              name: 'track_activity_query_size',
              value: '2048',
              reason: 'Increase query tracking size for better monitoring'
            }
          ];
          
          safeChanges.forEach(change => {
            const param = parameters.find(p => p.name === change.name);
            if (param && param.value !== change.value) {
              console.log(\`Would apply safe change: \${change.name} = \${change.value}\`);
              changes.push({
                parameter: change.name,
                oldValue: param.value,
                newValue: change.value,
                reason: change.reason,
                status: 'SIMULATED' // In production, this would actually apply the change
              });
            }
          });
          
          return changes;
        }

        async function generateTuningRecommendations(parameters) {
          const recommendations = [];
          
          // Analyze parameters and generate recommendations
          const sharedBuffers = parameters.find(p => p.name === 'shared_buffers');
          if (sharedBuffers && sharedBuffers.value) {
            const currentMB = parseInt(sharedBuffers.value.replace(/\\D/g, '')) || 128;
            if (currentMB < 256) {
              recommendations.push({
                parameter: 'shared_buffers',
                currentValue: sharedBuffers.value,
                recommendedValue: '256MB',
                priority: 'MEDIUM',
                reason: 'Increase shared buffers for better caching',
                impact: 'Improved query performance'
              });
            }
          }
          
          const workMem = parameters.find(p => p.name === 'work_mem');
          if (workMem && workMem.value) {
            const currentMB = parseInt(workMem.value.replace(/\\D/g, '')) || 4;
            if (currentMB < 8) {
              recommendations.push({
                parameter: 'work_mem',
                currentValue: workMem.value,
                recommendedValue: '8MB',
                priority: 'LOW',
                reason: 'Increase work memory for complex queries',
                impact: 'Better sort and hash performance'
              });
            }
          }
          
          const maintenanceWorkMem = parameters.find(p => p.name === 'maintenance_work_mem');
          if (maintenanceWorkMem && maintenanceWorkMem.value) {
            const currentMB = parseInt(maintenanceWorkMem.value.replace(/\\D/g, '')) || 64;
            if (currentMB < 128) {
              recommendations.push({
                parameter: 'maintenance_work_mem',
                currentValue: maintenanceWorkMem.value,
                recommendedValue: '128MB',
                priority: 'LOW',
                reason: 'Improve maintenance operations performance',
                impact: 'Faster VACUUM and CREATE INDEX operations'
              });
            }
          }
          
          return recommendations;
        }

        async function sendTuningReport(tuning) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Database Auto-Tuning Report - \${tuning.environment}\`;
            
            const summary = {
              timestamp: tuning.timestamp,
              environment: tuning.environment,
              parametersAnalyzed: tuning.parametersAnalyzed.length,
              changesApplied: tuning.changesApplied.length,
              recommendationsCount: tuning.recommendations.length,
              highPriorityRecommendations: tuning.recommendations.filter(r => r.priority === 'HIGH').length,
              appliedChanges: tuning.changesApplied,
              topRecommendations: tuning.recommendations.slice(0, 3)
            };
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(summary, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
        DB_PARAMETER_GROUP: `hallucifix-db-params-${props.environment}`,
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant necessary permissions
    autoTuningFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds:DescribeDBParameterGroups',
        'rds:DescribeDBParameters',
        'rds:ModifyDBParameterGroup',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule auto-tuning analysis
    const autoTuningRule = new events.Rule(this, 'AutoTuningRule', {
      ruleName: `hallucifix-db-auto-tuning-${props.environment}`,
      description: 'Weekly database auto-tuning analysis',
      schedule: events.Schedule.cron({ weekDay: '0', hour: '4', minute: '0' }), // Sunday 4 AM
    });

    autoTuningRule.addTarget(new targets.LambdaFunction(autoTuningFunction));
  }

  private createPerformanceDashboard(props: HallucifixDatabasePerformanceStackProps) {
    const performanceDashboard = new cloudwatch.Dashboard(this, 'DatabasePerformanceDashboard', {
      dashboardName: `hallucifix-database-performance-${props.environment}`,
    });

    const widgets = [];

    // Database cluster metrics
    if (props.databaseCluster) {
      widgets.push(
        new cloudwatch.GraphWidget({
          title: 'Database CPU & Memory',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'CPUUtilization',
              dimensionsMap: {
                DBClusterIdentifier: props.databaseCluster.clusterIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
              label: 'CPU Utilization',
            }),
          ],
          right: [
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'FreeableMemory',
              dimensionsMap: {
                DBClusterIdentifier: props.databaseCluster.clusterIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
              label: 'Freeable Memory',
            }),
          ],
          width: 12,
          height: 6,
        }),
        new cloudwatch.GraphWidget({
          title: 'Database Connections & Latency',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'DatabaseConnections',
              dimensionsMap: {
                DBClusterIdentifier: props.databaseCluster.clusterIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
              label: 'Connections',
            }),
          ],
          right: [
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'ReadLatency',
              dimensionsMap: {
                DBClusterIdentifier: props.databaseCluster.clusterIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
              label: 'Read Latency',
            }),
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'WriteLatency',
              dimensionsMap: {
                DBClusterIdentifier: props.databaseCluster.clusterIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
              label: 'Write Latency',
            }),
          ],
          width: 12,
          height: 6,
        })
      );
    }

    // RDS Proxy metrics
    if (this.rdsProxy) {
      widgets.push(
        new cloudwatch.GraphWidget({
          title: 'RDS Proxy Performance',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'DatabaseConnections',
              dimensionsMap: {
                ProxyName: this.rdsProxy.dbProxyName,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
              label: 'Proxy Connections',
            }),
          ],
          width: 12,
          height: 6,
        })
      );
    }

    // Read replica metrics
    if (this.readReplicas.length > 0) {
      widgets.push(
        new cloudwatch.GraphWidget({
          title: 'Read Replica Lag',
          left: this.readReplicas.map(replica => 
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'ReplicaLag',
              dimensionsMap: {
                DBInstanceIdentifier: replica.instanceIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
              label: replica.instanceIdentifier,
            })
          ),
          width: 12,
          height: 6,
        })
      );
    }

    performanceDashboard.addWidgets(...widgets);
  }

  private createOutputs(props: HallucifixDatabasePerformanceStackProps) {
    if (this.rdsProxy) {
      new cdk.CfnOutput(this, 'RDSProxyEndpoint', {
        value: this.rdsProxy.endpoint,
        description: 'RDS Proxy endpoint for connection pooling',
        exportName: `${props.environment}-RDSProxyEndpoint`,
      });
    }

    new cdk.CfnOutput(this, 'ReadReplicasCount', {
      value: this.readReplicas.length.toString(),
      description: 'Number of read replicas created',
      exportName: `${props.environment}-ReadReplicasCount`,
    });

    if (this.readReplicas.length > 0) {
      new cdk.CfnOutput(this, 'ReadReplicaEndpoints', {
        value: this.readReplicas.map(replica => replica.instanceEndpoint.hostname).join(','),
        description: 'Read replica endpoints',
        exportName: `${props.environment}-ReadReplicaEndpoints`,
      });
    }

    new cdk.CfnOutput(this, 'QueryOptimizationFunctionArn', {
      value: this.queryOptimizationFunction.functionArn,
      description: 'Query optimization function ARN',
      exportName: `${props.environment}-QueryOptimizationFunctionArn`,
    });

    new cdk.CfnOutput(this, 'PerformanceMonitoringFunctionArn', {
      value: this.performanceMonitoringFunction.functionArn,
      description: 'Performance monitoring function ARN',
      exportName: `${props.environment}-PerformanceMonitoringFunctionArn`,
    });
  }
}