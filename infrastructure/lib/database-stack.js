"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HallucifixDatabaseStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const elasticache = __importStar(require("aws-cdk-lib/aws-elasticache"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
class HallucifixDatabaseStack extends cdk.Stack {
    database;
    cache;
    databaseSecret;
    constructor(scope, id, props) {
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
                version: rds.PostgresEngineVersion.VER_15_4,
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
                version: rds.PostgresEngineVersion.VER_15_4,
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
        // ElastiCache Parameter Group
        const cacheParameterGroup = new elasticache.CfnParameterGroup(this, 'CacheParameterGroup', {
            cacheParameterGroupFamily: 'redis7.x',
            description: 'Parameter group for HalluciFix Redis cache',
            properties: {
                'maxmemory-policy': 'allkeys-lru',
                'timeout': '300',
            },
        });
        // ElastiCache Redis Cluster
        this.cache = new elasticache.CfnCacheCluster(this, 'HallucifixCache', {
            cacheNodeType: props.environment === 'prod' ? 'cache.t3.medium' : 'cache.t3.micro',
            engine: 'redis',
            engineVersion: '7.0',
            numCacheNodes: 1,
            clusterName: `hallucifix-cache-${props.environment}`,
            cacheSubnetGroupName: cacheSubnetGroup.ref,
            cacheParameterGroupName: cacheParameterGroup.ref,
            vpcSecurityGroupIds: [props.databaseSecurityGroup.securityGroupId],
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
exports.HallucifixDatabaseStack = HallucifixDatabaseStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2Utc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRhYmFzZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx5REFBMkM7QUFDM0MseUVBQTJEO0FBQzNELHlEQUEyQztBQUMzQywrRUFBaUU7QUFTakUsTUFBYSx1QkFBd0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNwQyxRQUFRLENBQXVCO0lBQy9CLEtBQUssQ0FBOEI7SUFDbkMsY0FBYyxDQUF3QjtJQUV0RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQW1DO1FBQzNFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDdEUsVUFBVSxFQUFFLDZCQUE2QixLQUFLLENBQUMsV0FBVyxFQUFFO1lBQzVELFdBQVcsRUFBRSxpQ0FBaUM7WUFDOUMsb0JBQW9CLEVBQUU7Z0JBQ3BCLG9CQUFvQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxRQUFRLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQztnQkFDdEUsaUJBQWlCLEVBQUUsVUFBVTtnQkFDN0IsaUJBQWlCLEVBQUUsU0FBUztnQkFDNUIsY0FBYyxFQUFFLEVBQUU7YUFDbkI7U0FDRixDQUFDLENBQUM7UUFFSCxtQkFBbUI7UUFDbkIsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNyRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsMENBQTBDO1lBQ3ZELFVBQVUsRUFBRTtnQkFDVixVQUFVLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxnQkFB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RyxLQUFLLENBQUMsV0FBVyxvQkFBb0I7U0FDckQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCO1lBQzFDLFdBQVcsRUFBRSw0QkFBNEI7WUFDekMsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFdBQVcsZ0JBQWdCO1NBQ2pELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTlJRCwwREE4SUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgcmRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yZHMnO1xuaW1wb3J0ICogYXMgZWxhc3RpY2FjaGUgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNhY2hlJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBIYWxsdWNpZml4RGF0YWJhc2VTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICB2cGM6IGVjMi5WcGM7XG4gIGRhdGFiYXNlU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG59XG5cbmV4cG9ydCBjbGFzcyBIYWxsdWNpZml4RGF0YWJhc2VTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBkYXRhYmFzZTogcmRzLkRhdGFiYXNlSW5zdGFuY2U7XG4gIHB1YmxpYyByZWFkb25seSBjYWNoZTogZWxhc3RpY2FjaGUuQ2ZuQ2FjaGVDbHVzdGVyO1xuICBwdWJsaWMgcmVhZG9ubHkgZGF0YWJhc2VTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSGFsbHVjaWZpeERhdGFiYXNlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gRGF0YWJhc2UgY3JlZGVudGlhbHMgc2VjcmV0XG4gICAgdGhpcy5kYXRhYmFzZVNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0RhdGFiYXNlU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYGhhbGx1Y2lmaXgtZGItY3JlZGVudGlhbHMtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdIYWxsdWNpRml4IERhdGFiYXNlIENyZWRlbnRpYWxzJyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IHVzZXJuYW1lOiAnaGFsbHVjaWZpeF9hZG1pbicgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAncGFzc3dvcmQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1wiQC9cXFxcXFwnJyxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDMyLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJEUyBTdWJuZXQgR3JvdXBcbiAgICBjb25zdCBkYlN1Ym5ldEdyb3VwID0gbmV3IHJkcy5TdWJuZXRHcm91cCh0aGlzLCAnRGF0YWJhc2VTdWJuZXRHcm91cCcsIHtcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTdWJuZXQgZ3JvdXAgZm9yIEhhbGx1Y2lGaXggUkRTIGRhdGFiYXNlJyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSRFMgUGFyYW1ldGVyIEdyb3VwIGZvciBQb3N0Z3JlU1FMIG9wdGltaXphdGlvblxuICAgIGNvbnN0IHBhcmFtZXRlckdyb3VwID0gbmV3IHJkcy5QYXJhbWV0ZXJHcm91cCh0aGlzLCAnRGF0YWJhc2VQYXJhbWV0ZXJHcm91cCcsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlSW5zdGFuY2VFbmdpbmUucG9zdGdyZXMoe1xuICAgICAgICB2ZXJzaW9uOiByZHMuUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xNV80LFxuICAgICAgfSksXG4gICAgICBkZXNjcmlwdGlvbjogJ1BhcmFtZXRlciBncm91cCBmb3IgSGFsbHVjaUZpeCBQb3N0Z3JlU1FMIGRhdGFiYXNlJyxcbiAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ3NoYXJlZF9wcmVsb2FkX2xpYnJhcmllcyc6ICdwZ19zdGF0X3N0YXRlbWVudHMnLFxuICAgICAgICAnbG9nX3N0YXRlbWVudCc6ICdhbGwnLFxuICAgICAgICAnbG9nX21pbl9kdXJhdGlvbl9zdGF0ZW1lbnQnOiAnMTAwMCcsIC8vIExvZyBxdWVyaWVzIHRha2luZyBtb3JlIHRoYW4gMSBzZWNvbmRcbiAgICAgICAgJ21heF9jb25uZWN0aW9ucyc6ICcyMDAnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFJEUyBEYXRhYmFzZSBJbnN0YW5jZVxuICAgIHRoaXMuZGF0YWJhc2UgPSBuZXcgcmRzLkRhdGFiYXNlSW5zdGFuY2UodGhpcywgJ0hhbGx1Y2lmaXhEYXRhYmFzZScsIHtcbiAgICAgIGluc3RhbmNlSWRlbnRpZmllcjogYGhhbGx1Y2lmaXgtZGItJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZW5naW5lOiByZHMuRGF0YWJhc2VJbnN0YW5jZUVuZ2luZS5wb3N0Z3Jlcyh7XG4gICAgICAgIHZlcnNpb246IHJkcy5Qb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE1XzQsXG4gICAgICB9KSxcbiAgICAgIGluc3RhbmNlVHlwZTogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcbiAgICAgICAgPyBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk1FRElVTSlcbiAgICAgICAgOiBlYzIuSW5zdGFuY2VUeXBlLm9mKGVjMi5JbnN0YW5jZUNsYXNzLlQzLCBlYzIuSW5zdGFuY2VTaXplLk1JQ1JPKSxcbiAgICAgIGNyZWRlbnRpYWxzOiByZHMuQ3JlZGVudGlhbHMuZnJvbVNlY3JldCh0aGlzLmRhdGFiYXNlU2VjcmV0KSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMuZGF0YWJhc2VTZWN1cml0eUdyb3VwXSxcbiAgICAgIHN1Ym5ldEdyb3VwOiBkYlN1Ym5ldEdyb3VwLFxuICAgICAgcGFyYW1ldGVyR3JvdXAsXG4gICAgICBhbGxvY2F0ZWRTdG9yYWdlOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAwIDogMjAsXG4gICAgICBtYXhBbGxvY2F0ZWRTdG9yYWdlOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAwMCA6IDEwMCxcbiAgICAgIHN0b3JhZ2VUeXBlOiByZHMuU3RvcmFnZVR5cGUuR1AyLFxuICAgICAgbXVsdGlBejogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICAgIGJhY2t1cFJldGVudGlvbjogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcbiAgICAgICAgPyBjZGsuRHVyYXRpb24uZGF5cygzMCkgXG4gICAgICAgIDogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICBkYXRhYmFzZU5hbWU6ICdoYWxsdWNpZml4JyxcbiAgICAgIGVuYWJsZVBlcmZvcm1hbmNlSW5zaWdodHM6IHRydWUsXG4gICAgICBwZXJmb3JtYW5jZUluc2lnaHRSZXRlbnRpb246IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgXG4gICAgICAgID8gcmRzLlBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbi5MT05HX1RFUk0gXG4gICAgICAgIDogcmRzLlBlcmZvcm1hbmNlSW5zaWdodFJldGVudGlvbi5ERUZBVUxULFxuICAgICAgbW9uaXRvcmluZ0ludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxuICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiBcbiAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gRWxhc3RpQ2FjaGUgU3VibmV0IEdyb3VwXG4gICAgY29uc3QgY2FjaGVTdWJuZXRHcm91cCA9IG5ldyBlbGFzdGljYWNoZS5DZm5TdWJuZXRHcm91cCh0aGlzLCAnQ2FjaGVTdWJuZXRHcm91cCcsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3VibmV0IGdyb3VwIGZvciBIYWxsdWNpRml4IEVsYXN0aUNhY2hlJyxcbiAgICAgIHN1Ym5ldElkczogcHJvcHMudnBjLnByaXZhdGVTdWJuZXRzLm1hcChzdWJuZXQgPT4gc3VibmV0LnN1Ym5ldElkKSxcbiAgICB9KTtcblxuICAgIC8vIEVsYXN0aUNhY2hlIFBhcmFtZXRlciBHcm91cFxuICAgIGNvbnN0IGNhY2hlUGFyYW1ldGVyR3JvdXAgPSBuZXcgZWxhc3RpY2FjaGUuQ2ZuUGFyYW1ldGVyR3JvdXAodGhpcywgJ0NhY2hlUGFyYW1ldGVyR3JvdXAnLCB7XG4gICAgICBjYWNoZVBhcmFtZXRlckdyb3VwRmFtaWx5OiAncmVkaXM3LngnLFxuICAgICAgZGVzY3JpcHRpb246ICdQYXJhbWV0ZXIgZ3JvdXAgZm9yIEhhbGx1Y2lGaXggUmVkaXMgY2FjaGUnLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAnbWF4bWVtb3J5LXBvbGljeSc6ICdhbGxrZXlzLWxydScsXG4gICAgICAgICd0aW1lb3V0JzogJzMwMCcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRWxhc3RpQ2FjaGUgUmVkaXMgQ2x1c3RlclxuICAgIHRoaXMuY2FjaGUgPSBuZXcgZWxhc3RpY2FjaGUuQ2ZuQ2FjaGVDbHVzdGVyKHRoaXMsICdIYWxsdWNpZml4Q2FjaGUnLCB7XG4gICAgICBjYWNoZU5vZGVUeXBlOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ2NhY2hlLnQzLm1lZGl1bScgOiAnY2FjaGUudDMubWljcm8nLFxuICAgICAgZW5naW5lOiAncmVkaXMnLFxuICAgICAgZW5naW5lVmVyc2lvbjogJzcuMCcsXG4gICAgICBudW1DYWNoZU5vZGVzOiAxLFxuICAgICAgY2x1c3Rlck5hbWU6IGBoYWxsdWNpZml4LWNhY2hlLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGNhY2hlU3VibmV0R3JvdXBOYW1lOiBjYWNoZVN1Ym5ldEdyb3VwLnJlZixcbiAgICAgIGNhY2hlUGFyYW1ldGVyR3JvdXBOYW1lOiBjYWNoZVBhcmFtZXRlckdyb3VwLnJlZixcbiAgICAgIHZwY1NlY3VyaXR5R3JvdXBJZHM6IFtwcm9wcy5kYXRhYmFzZVNlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkXSxcbiAgICAgIHBvcnQ6IDYzNzksXG4gICAgfSk7XG5cbiAgICAvLyBSZWFkIFJlcGxpY2EgZm9yIHByb2R1Y3Rpb25cbiAgICBpZiAocHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJykge1xuICAgICAgbmV3IHJkcy5EYXRhYmFzZUluc3RhbmNlUmVhZFJlcGxpY2EodGhpcywgJ0RhdGFiYXNlUmVhZFJlcGxpY2EnLCB7XG4gICAgICAgIHNvdXJjZURhdGFiYXNlSW5zdGFuY2U6IHRoaXMuZGF0YWJhc2UsXG4gICAgICAgIGluc3RhbmNlVHlwZTogZWMyLkluc3RhbmNlVHlwZS5vZihlYzIuSW5zdGFuY2VDbGFzcy5UMywgZWMyLkluc3RhbmNlU2l6ZS5TTUFMTCksXG4gICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9JU09MQVRFRCxcbiAgICAgICAgfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5kYXRhYmFzZVNlY3VyaXR5R3JvdXBdLFxuICAgICAgICBlbmFibGVQZXJmb3JtYW5jZUluc2lnaHRzOiB0cnVlLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kYXRhYmFzZS5pbnN0YW5jZUVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdSRFMgRGF0YWJhc2UgRW5kcG9pbnQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LURhdGFiYXNlRW5kcG9pbnRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFiYXNlU2VjcmV0QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGF0YWJhc2VTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdEYXRhYmFzZSBDcmVkZW50aWFscyBTZWNyZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1EYXRhYmFzZVNlY3JldEFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2FjaGVFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNhY2hlLmF0dHJSZWRpc0VuZHBvaW50QWRkcmVzcyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRWxhc3RpQ2FjaGUgUmVkaXMgRW5kcG9pbnQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUNhY2hlRW5kcG9pbnRgLFxuICAgIH0pO1xuICB9XG59Il19