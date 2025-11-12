import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface HallucifixDatabaseStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  databaseSecurityGroup: ec2.SecurityGroup;
  cacheSecurityGroup: ec2.SecurityGroup;
}

export class HallucifixDatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  public readonly cache: elasticache.CfnCacheCluster;
  public readonly databaseSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: HallucifixDatabaseStackProps) {
    super(scope, id, props);

    // Database credentials secret
    this.databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `hallucifix-db-credentials-${props.environment}`,
      description: 'HalluciFix Database Credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'hallucifix_admin' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\\'',
        passwordLength: 32,
      },
    });

    // RDS Subnet Group
    const dbSubnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      vpc: props.vpc,
      description: 'Subnet group for HalluciFix RDS database',
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    // RDS Parameter Group for PostgreSQL optimization
    const parameterGroup = new rds.ParameterGroup(this, 'DatabaseParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      description: 'Parameter group for HalluciFix PostgreSQL database',
      parameters: {
        'shared_preload_libraries': 'pg_stat_statements',
        'log_statement': 'all',
        'log_min_duration_statement': '1000', // Log queries taking more than 1 second
        'max_connections': '200',
      },
    });

    // RDS Database Instance
    this.database = new rds.DatabaseInstance(this, 'HallucifixDatabase', {
      instanceIdentifier: `hallucifix-db-${props.environment}`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: props.environment === 'prod' 
        ? ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [props.databaseSecurityGroup],
      subnetGroup: dbSubnetGroup,
      parameterGroup,
      allocatedStorage: props.environment === 'prod' ? 100 : 20,
      maxAllocatedStorage: props.environment === 'prod' ? 1000 : 100,
      storageType: rds.StorageType.GP2,
      multiAz: props.environment === 'prod',
      backupRetention: props.environment === 'prod' 
        ? cdk.Duration.days(30) 
        : cdk.Duration.days(7),
      deletionProtection: props.environment === 'prod',
      databaseName: 'hallucifix',
      enablePerformanceInsights: true,
      performanceInsightRetention: props.environment === 'prod' 
        ? rds.PerformanceInsightRetention.LONG_TERM 
        : rds.PerformanceInsightRetention.DEFAULT,
      monitoringInterval: cdk.Duration.seconds(60),
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // ElastiCache Subnet Group
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, 'CacheSubnetGroup', {
      description: 'Subnet group for HalluciFix ElastiCache',
      subnetIds: props.vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    // ElastiCache Redis Cluster
    this.cache = new elasticache.CfnCacheCluster(this, 'HallucifixCache', {
      cacheNodeType: props.environment === 'prod' ? 'cache.t3.medium' : 'cache.t3.micro',
      engine: 'redis',
      engineVersion: '6.2',
      numCacheNodes: 1,
      clusterName: `hallucifix-cache-${props.environment}`,
      cacheSubnetGroupName: cacheSubnetGroup.ref,
      vpcSecurityGroupIds: [props.cacheSecurityGroup.securityGroupId],
      port: 6379,
    });

    // Read Replica for production
    if (props.environment === 'prod') {
      new rds.DatabaseInstanceReadReplica(this, 'DatabaseReadReplica', {
        sourceDatabaseInstance: this.database,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [props.databaseSecurityGroup],
        enablePerformanceInsights: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'RDS Database Endpoint',
      exportName: `${props.environment}-DatabaseEndpoint`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'Database Credentials Secret ARN',
      exportName: `${props.environment}-DatabaseSecretArn`,
    });

    new cdk.CfnOutput(this, 'CacheEndpoint', {
      value: this.cache.attrRedisEndpointAddress,
      description: 'ElastiCache Redis Endpoint',
      exportName: `${props.environment}-CacheEndpoint`,
    });
  }
}