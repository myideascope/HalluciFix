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
- TypeScript compiler (installed with CDK)

## TypeScript Compilation Requirements

This infrastructure codebase requires successful TypeScript compilation before deployment. All 189 compilation errors have been systematically resolved following AWS CDK best practices.

### Compilation Validation
```bash
# Verify TypeScript compilation
npx tsc --noEmit

# Quick check (skip library validation)
npx tsc --noEmit --skipLibCheck
```

### Common Issues and Solutions
- **Import Errors**: Check [Compilation Troubleshooting Guide](docs/compilation-troubleshooting-guide.md)
- **CDK API Changes**: Refer to [TypeScript Fixes Documentation](docs/typescript-fixes-documentation.md)
- **Property Errors**: See troubleshooting guide for deprecated property mappings

### Build Requirements
- **CDK Version**: 2.1031.0 or later
- **TypeScript**: Latest version (installed with CDK)
- **Node.js Memory**: Increase if needed: `export NODE_OPTIONS="--max-old-space-size=4096"`

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

### Development Commands
* `npm run build` - Compile TypeScript to JavaScript
* `npm run watch` - Watch for changes and compile
* `npm run test` - Run Jest unit tests
* `npx tsc --noEmit` - Validate TypeScript compilation without output
* `npx tsc --noEmit --watch` - Continuous TypeScript validation

### Deployment Commands
* `./deploy.sh` - Deploy all stacks with proper ordering
* `npx cdk synth --context environment=dev` - Generate CloudFormation templates
* `npx cdk diff --context environment=dev` - Compare deployed stack with current state
* `npx cdk destroy --context environment=dev` - Destroy all stacks

### Validation Commands
* `npx cdk list` - List all available stacks (requires successful compilation)
* `npx cdk doctor` - Check CDK environment and configuration
* `node scripts/incremental-validation.js` - Run incremental file validation

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

## Documentation

- **[TypeScript Fixes Documentation](docs/typescript-fixes-documentation.md)** - Comprehensive guide to all compilation fixes
- **[Compilation Troubleshooting Guide](docs/compilation-troubleshooting-guide.md)** - Quick reference for resolving TypeScript issues
- **[Validation Reports](scripts/)** - Compilation and synthesis validation reports

## Troubleshooting

If you encounter TypeScript compilation errors:

1. Check the [Compilation Troubleshooting Guide](docs/compilation-troubleshooting-guide.md)
2. Verify CDK and Node.js versions match requirements
3. Run `npx tsc --noEmit` to identify specific errors
4. Consult the [TypeScript Fixes Documentation](docs/typescript-fixes-documentation.md) for detailed solutions

For deployment issues:
1. Ensure TypeScript compilation succeeds first
2. Verify AWS credentials and permissions
3. Check CDK context and environment configuration
