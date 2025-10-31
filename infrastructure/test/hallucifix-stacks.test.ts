import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { HallucifixNetworkStack } from '../lib/network-stack';
import { HallucifixStorageStack } from '../lib/storage-stack';

describe('HalluciFix Infrastructure Stacks', () => {
  test('Network Stack creates VPC with correct configuration', () => {
    const app = new cdk.App();
    const stack = new HallucifixNetworkStack(app, 'TestNetworkStack', {
      environment: 'test',
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const template = Template.fromStack(stack);

    // Verify VPC is created
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
    });

    // Verify security groups are created
    template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
  });

  test('Storage Stack creates S3 buckets and CloudFront distribution', () => {
    const app = new cdk.App();
    const networkStack = new HallucifixNetworkStack(app, 'TestNetworkStack', {
      environment: 'test',
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const storageStack = new HallucifixStorageStack(app, 'TestStorageStack', {
      environment: 'test',
      vpc: networkStack.vpc,
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const template = Template.fromStack(storageStack);

    // Verify S3 buckets are created
    template.resourceCountIs('AWS::S3::Bucket', 2);

    // Verify CloudFront distribution is created
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });
});