#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HallucifixCognitoStack } from '../lib/cognito-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: '135167710042',
  region: 'us-east-1'
};

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';

// Cognito Stack - User Pool, Identity Pool, OAuth
const cognitoStack = new HallucifixCognitoStack(app, `Hallucifix-Cognito-${environment}`, {
  env,
  environment,
  description: `HalluciFix Cognito Authentication - ${environment}`
});

// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'HalluciFix');
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Component', 'Authentication');