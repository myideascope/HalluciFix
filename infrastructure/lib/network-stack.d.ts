import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
export interface HallucifixNetworkStackProps extends cdk.StackProps {
    environment: string;
}
export declare class HallucifixNetworkStack extends cdk.Stack {
    readonly vpc: ec2.Vpc;
    readonly lambdaSecurityGroup: ec2.SecurityGroup;
    readonly databaseSecurityGroup: ec2.SecurityGroup;
    readonly cacheSecurityGroup: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props: HallucifixNetworkStackProps);
}
