import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
export interface HallucifixStorageStackProps extends cdk.StackProps {
    environment: string;
    vpc: ec2.Vpc;
    enableCloudFront?: boolean;
}
export declare class HallucifixStorageStack extends cdk.Stack {
    readonly bucket: s3.Bucket;
    readonly staticBucket: s3.Bucket;
    readonly distribution?: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: HallucifixStorageStackProps);
}
