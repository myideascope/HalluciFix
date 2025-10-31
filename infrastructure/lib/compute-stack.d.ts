import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
export interface HallucifixComputeStackProps extends cdk.StackProps {
    environment: string;
    vpc: ec2.Vpc;
    lambdaSecurityGroup: ec2.SecurityGroup;
    database: rds.DatabaseInstance;
    cache: elasticache.CfnCacheCluster;
    bucket: s3.Bucket;
    distribution?: cloudfront.Distribution;
    batchAnalysisStateMachine?: stepfunctions.StateMachine;
}
export declare class HallucifixComputeStack extends cdk.Stack {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly identityPool: cognito.CfnIdentityPool;
    readonly api: apigateway.RestApi;
    readonly lambdaFunctions: lambda.Function[];
    readonly alertTopic: sns.Topic;
    constructor(scope: Construct, id: string, props: HallucifixComputeStackProps);
    private setupLambdaMonitoring;
    private setupFunctionMonitoring;
    private createSystemAlarms;
}
