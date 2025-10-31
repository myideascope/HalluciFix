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
export declare class HallucifixDatabaseStack extends cdk.Stack {
    readonly database: rds.DatabaseInstance;
    readonly cache: elasticache.CfnCacheCluster;
    readonly databaseSecret: secretsmanager.Secret;
    constructor(scope: Construct, id: string, props: HallucifixDatabaseStackProps);
}
