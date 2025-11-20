# HalluciFix AWS Development Environment Cleanup Guide

## Overview

This document provides a comprehensive overview of all AWS resources that are created for development environments in the HalluciFix project and need to be cleaned up when removing development configurations.

## Environment Naming Convention

All AWS resources follow a consistent naming pattern that includes the environment suffix:
- **Development**: `dev`
- **Staging**: `staging`
- **Production**: `prod`

Examples:
- `hallucifix-documents-dev-135167710042`
- `Hallucifix-Compute-dev`
- `hallucifix-scan-executor-dev`

## CloudFormation Stacks

### Main Infrastructure Stacks

1. **Hallucifix-Network-dev/staging**
   - VPC, subnets, security groups
   - Internet Gateway, NAT Gateway
   - Route tables and associations

2. **Hallucifix-Storage-dev/staging**
   - S3 buckets for documents and static assets
   - CloudFront distribution and associated resources
   - Origin Access Identity

3. **Hallucifix-Database-dev/staging**
   - RDS PostgreSQL instance
   - ElastiCache Redis cluster
   - Database subnet groups
   - Parameter groups and security groups
   - Database credentials in Secrets Manager

4. **Hallucifix-Cognito-dev/staging**
   - Cognito User Pool
   - Cognito User Pool Client
   - Cognito Identity Pool
   - OAuth configuration

5. **Hallucifix-Compute-dev/staging**
   - Lambda functions
   - API Gateway REST API
   - IAM roles and policies
   - SNS topics for alerts

6. **Hallucifix-CacheMonitoring-dev/staging**
   - CloudWatch monitoring for ElastiCache
   - Custom metrics and alarms

### Additional Monitoring Stacks

7. **Hallucifix-LambdaMonitoring-dev/staging**
   - Lambda function monitoring
   - Performance dashboards
   - Error tracking

8. **Hallucifix-ComprehensiveMonitoring-dev/staging**
   - Application performance monitoring
   - Custom CloudWatch dashboards
   - Multi-service monitoring

9. **Hallucifix-SecurityAudit-dev/staging**
   - Security scanning functions
   - Audit bucket for reports
   - Vulnerability assessment

10. **Hallucifix-PerformanceTesting-dev/staging**
    - ECS cluster for load testing
    - Performance testing Lambda functions
    - Test results S3 bucket

11. **Hallucifix-DatabasePerformance-dev/staging**
    - Database performance insights
    - Query optimization functions
    - Performance monitoring dashboards

12. **Hallucifix-AutoScaling-dev/staging**
    - Auto scaling configurations
    - Scaling policies
    - Monitoring functions

## AWS Resource Types to Clean Up

### 1. Compute Resources

#### Lambda Functions
- `hallucifix-scan-executor-dev/staging`
- `hallucifix-billing-api-dev/staging`
- `hallucifix-payment-methods-api-dev/staging`
- `hallucifix-stripe-webhook-dev/staging`
- `hallucifix-migration-dev/staging`
- `hallucifix-file-processor-dev/staging`
- `hallucifix-monitoring-agent-dev/staging`
- `hallucifix-key-management-dev/staging`
- `hallucifix-key-rotation-dev/staging`
- `hallucifix-encryption-compliance-dev/staging`
- Performance testing functions
- Database performance monitoring functions

#### API Gateway
- `hallucifix-api-dev/staging` (REST API)
- Associated stages, resources, and methods

### 2. Storage Resources

#### S3 Buckets
- `hallucifix-documents-dev/staging-135167710042`
- `hallucifix-static-dev/staging-135167710042`
- `hallucifix-performance-tests-dev/staging-135167710042` (performance testing)
- Audit and compliance buckets

#### CloudFront
- Distribution for static assets
- Associated CloudFront functions and policies

### 3. Database Resources

#### RDS PostgreSQL
- `hallucifix-database-dev/staging`
- Read replicas (if created)
- Database subnet groups
- Parameter groups
- Option groups

#### ElastiCache Redis
- `hallucifix-cache-dev/staging`
- Cache subnet groups
- Security groups

#### Secrets Manager
- `hallucifix-api-key-dev/staging`
- Database credentials
- Stripe credentials
- Other service secrets

### 4. Authentication & Authorization

#### Amazon Cognito
- User Pools: `hallucifix-users-dev/staging`
- User Pool Clients: `hallucifix-client-dev/staging`
- Identity Pools: `hallucifix_identity_pool_dev/staging`

### 5. Networking Resources

#### VPC Components
- VPC: `10.0.0.0/16`
- Public and private subnets
- Internet Gateway
- NAT Gateway
- Route tables
- Security groups for Lambda, database, cache

### 6. Security & Identity

#### IAM Resources
- Roles: `HallucifixLambdaExecutionRole-dev/staging`
- Policies: Custom policies for various services
- Instance profiles for EC2 (if any)

#### KMS Keys
- `hallucifix-app-data-dev/staging`
- `hallucifix-database-dev/staging`
- `hallucifix-storage-dev/staging`
- `hallucifix-logs-dev/staging`
- `hallucifix-backup-dev/staging`

### 7. Monitoring & Observability

#### CloudWatch
- Log groups for Lambda functions
- Custom metrics and dashboards
- Alarms and notifications
- Dashboard: `hallucifix-database-performance-dev/staging`

#### SNS Topics
- `hallucifix-lambda-alerts-dev/staging`
- Other notification topics

### 8. Application Integration

#### Step Functions
- State machines for workflows
- Associated IAM roles

#### SQS Queues
- Batch processing queues
- Dead-letter queues

#### EventBridge Rules
- Scheduled events for monitoring
- Event rules for automation

### 9. Development-Specific Resources

#### Performance Testing
- ECS cluster: `hallucifix-load-testing-dev/staging`
- Load testing containers
- Performance test results storage

#### Security Testing
- Penetration testing functions
- Vulnerability scanning resources
- Audit report storage

#### Backup & Recovery
- Automated snapshots
- Backup storage buckets
- Recovery testing resources

## Cleanup Script Usage

The provided cleanup script (`infrastructure/cleanup-dev-environments.sh`) can be used to systematically remove all development resources:

### Basic Usage
```bash
# Dry run to see what would be deleted
./infrastructure/cleanup-dev-environments.sh -e dev -d

# Actual cleanup with confirmation
./infrastructure/cleanup-dev-environments.sh -e dev

# Force cleanup without confirmation
./infrastructure/cleanup-dev-environments.sh -e dev -f
```

### Manual Cleanup Steps

If you prefer manual cleanup, follow this order:

1. **Application Resources** (in order):
   - Lambda functions and API Gateway
   - Cognito resources
   - S3 buckets and CloudFront

2. **Database Resources**:
   - Delete read replicas first
   - Delete main RDS instance
   - Delete ElastiCache cluster

3. **Infrastructure**:
   - Delete CloudFormation stacks
   - Delete VPC and networking components

4. **Security**:
   - Delete IAM roles and policies
   - Delete KMS keys
   - Delete Secrets Manager secrets

5. **Monitoring**:
   - Delete CloudWatch log groups
   - Delete dashboards and alarms
   - Delete SNS topics

## Environment-Specific Considerations

### Development Environment
- Shorter retention periods
- More frequent backups
- Performance testing resources
- Debug and logging enabled
- Less strict security policies

### Staging Environment
- Production-like configuration
- Full feature set enabled
- Integration testing resources
- Backup and recovery testing
- Security scanning enabled

## Safety Precautions

1. **Always backup important data before cleanup**
2. **Verify environment names to avoid accidental production deletion**
3. **Use dry-run mode first to preview changes**
4. **Check for dependencies between resources**
5. **Monitor deletion progress and handle any failures**
6. **Verify complete cleanup by checking resource lists**

## Post-Cleanup Verification

After running the cleanup script:

1. Verify all CloudFormation stacks are deleted
2. Check that S3 buckets are empty and removed
3. Confirm Lambda functions are deleted
4. Verify RDS instances are terminated
5. Check that IAM resources are removed
6. Validate that monitoring resources are cleaned up

## Troubleshooting

### Common Issues

1. **Stack deletion failures**: Check for circular dependencies or manual resource modifications
2. **S3 bucket not empty**: Force empty the bucket before deletion
3. **RDS deletion protection**: Disable deletion protection if enabled
4. **IAM role in use**: Remove dependencies before deleting roles
5. **KMS key deletion**: Schedule deletion as it cannot be immediate

### Getting Help

- Check AWS CloudFormation events for detailed error messages
- Use AWS CLI commands to investigate resource states
- Review AWS CloudTrail logs for API call details
- Consult AWS documentation for service-specific cleanup procedures