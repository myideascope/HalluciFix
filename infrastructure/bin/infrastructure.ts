#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HallucifixNetworkStack } from '../lib/network-stack';
import { HallucifixDatabaseStack } from '../lib/database-stack';
import { HallucifixComputeStack } from '../lib/compute-stack';
import { HallucifixStorageStack } from '../lib/storage-stack';
import { HallucifixCognitoStack } from '../lib/cognito-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: '135167710042',
  region: 'us-east-1'
};

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';

// Network Stack - VPC, subnets, security groups
const networkStack = new HallucifixNetworkStack(app, `Hallucifix-Network-${environment}`, {
  env,
  environment,
  description: `HalluciFix Network Infrastructure - ${environment}`
});

// Storage Stack - S3, CloudFront (CloudFront disabled until account verification)
const storageStack = new HallucifixStorageStack(app, `Hallucifix-Storage-${environment}`, {
  env,
  environment,
  vpc: networkStack.vpc,
  enableCloudFront: false, // Disable until AWS account is verified
  description: `HalluciFix Storage Infrastructure - ${environment}`
});

// Database Stack - RDS, ElastiCache
const databaseStack = new HallucifixDatabaseStack(app, `Hallucifix-Database-${environment}`, {
  env,
  environment,
  vpc: networkStack.vpc,
  databaseSecurityGroup: networkStack.databaseSecurityGroup,
  description: `HalluciFix Database Infrastructure - ${environment}`
});

// Cognito Stack - User Pool, Identity Pool, OAuth (separate from compute for easier management)
const cognitoStack = new HallucifixCognitoStack(app, `Hallucifix-Cognito-${environment}`, {
  env,
  environment,
  useRealGoogleCredentials: app.node.tryGetContext('useRealGoogleCredentials') === 'true',
  description: `HalluciFix Cognito Authentication - ${environment}`
});

// Compute Stack - Lambda, API Gateway
const computeStack = new HallucifixComputeStack(app, `Hallucifix-Compute-${environment}`, {
  env,
  environment,
  vpc: networkStack.vpc,
  lambdaSecurityGroup: networkStack.lambdaSecurityGroup,
  database: databaseStack.database,
  cache: databaseStack.cache,
  bucket: storageStack.bucket,
  distribution: storageStack.distribution,
  description: `HalluciFix Compute Infrastructure - ${environment}`
});

// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'HalluciFix');
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');