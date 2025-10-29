# HalluciFix AWS Infrastructure

This directory contains the AWS CDK infrastructure code for HalluciFix, an AI accuracy verification platform.

## Architecture Overview

The infrastructure is organized into four main stacks:

1. **Network Stack** - VPC, subnets, security groups, and VPC endpoints
2. **Storage Stack** - S3 buckets for documents and static hosting, CloudFront CDN
3. **Database Stack** - RDS PostgreSQL, ElastiCache Redis, and secrets management
4. **Compute Stack** - Lambda functions, API Gateway, and Cognito authentication

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm
- AWS CDK CLI (`npm install -g aws-cdk`)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Deploy to development environment:**
   ```bash
   ./deploy.sh --environment dev --profile hallucifix
   ```

## Environment Configuration

The infrastructure supports multiple environments (dev, staging, prod) with different configurations:

- **Development**: Smaller instance sizes, shorter retention periods
- **Production**: Multi-AZ deployments, larger instances, longer retention

## Stack Dependencies

The stacks have the following dependencies and must be deployed in order:

```
Network Stack
├── Storage Stack
├── Database Stack
└── Compute Stack
```

## Useful Commands

* `npm run build` - Compile TypeScript to JavaScript
* `npm run watch` - Watch for changes and compile
* `npm run test` - Run Jest unit tests
* `./deploy.sh` - Deploy all stacks with proper ordering
* `npx cdk synth --context environment=dev` - Generate CloudFormation templates
* `npx cdk diff --context environment=dev` - Compare deployed stack with current state
* `npx cdk destroy --context environment=dev` - Destroy all stacks

## Configuration

Environment-specific configuration is handled through CDK context. Set the environment using:

```bash
--context environment=dev|staging|prod
```

## Security

- All resources are deployed in private subnets where possible
- Security groups follow least-privilege principles
- Secrets are managed through AWS Secrets Manager
- All data is encrypted at rest and in transit

## Cost Optimization

- Lifecycle policies for S3 storage classes
- Auto-scaling for compute resources
- Reserved capacity recommendations for production
- CloudWatch cost monitoring and budgets
