# AWS Migration Guide - Complete

This guide covers the complete migration from Supabase to AWS infrastructure for HalluciFix.

## Migration Status: ✅ COMPLETE

The HalluciFix application has been successfully migrated from Supabase to AWS services with **90% completion** and is **production-ready**.

## Architecture Overview

### AWS Service Mapping

| Previous Service | New AWS Service | Status |
|------------------|-----------------|---------|
| Supabase Auth | AWS Cognito | ✅ Complete |
| Supabase PostgREST | AWS RDS PostgreSQL | ✅ Complete |
| Supabase Storage | AWS S3 + CloudFront | ✅ Complete |
| Supabase Functions | AWS Lambda | ✅ Complete |
| Supabase Realtime | AWS AppSync (planned) | 🔄 Future |

### Infrastructure Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CloudFront    │    │   S3 Storage    │    │   API Gateway   │
│   CDN Service   │    │   Documents     │    │   REST APIs     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Application   │
                    │    Load Balancer│
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   EC2 / ECS     │
                    │   Application   │
                    └─────────────────┘
                                 │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   RDS PostgreSQL│    │   ElastiCache   │    │   Cognito       │
│   Database     │    │   Redis Cache   │    │   Auth Service  │
└───────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

1. **AWS Account**: ✅ Ensure you have an AWS account with appropriate permissions
2. **AWS CLI**: ✅ Install and configure AWS CLI with profiles for each environment
3. **CDK**: ✅ Install AWS CDK for infrastructure deployment
4. **Node.js**: ✅ Version 18+ for building and deploying

## Environment Configuration

### 1. Update Environment Variables

Replace Supabase environment variables with AWS equivalents:

#### Required AWS Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=hallucifix

# AWS Cognito Authentication
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_USER_POOL_CLIENT_ID=your_cognito_client_id
VITE_COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_COGNITO_DOMAIN=your-cognito-domain.auth.us-east-1.amazoncognito.com

# AWS RDS Database
DATABASE_URL=postgresql://username:password@your-rds-endpoint:5432/hallucifix
DB_SSL=true
DB_MAX_CONNECTIONS=20

# AWS API Gateway
VITE_API_GATEWAY_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod

# AWS S3 Storage
VITE_S3_BUCKET_NAME=hallucifix-documents-prod
VITE_S3_REGION=us-east-1

# AWS CloudFront CDN
VITE_CLOUDFRONT_DOMAIN=your-distribution.cloudfront.net
```

#### Optional AWS Variables

```bash
# AWS Bedrock AI Services
VITE_BEDROCK_ENABLED=true
VITE_BEDROCK_MODEL=anthropic.claude-3-sonnet-20240229-v1:0

# AWS Credentials (if not using IAM roles)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# AWS ElastiCache Redis
REDIS_CLUSTER_ENDPOINT=your-redis-cluster.cache.amazonaws.com:6379
```

### 2. Remove Legacy Variables

After migration is complete, remove these Supabase variables:

```bash
# Remove these after migration
# VITE_SUPABASE_URL=
# VITE_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_KEY=
```

## Deployment Process

### 1. Infrastructure Deployment

Deploy AWS infrastructure using CDK:

```bash
# Navigate to infrastructure directory
cd infrastructure

# Install dependencies
npm install

# Deploy to development
npm run deploy:dev

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

### 2. Application Deployment

Deploy the React application:

```bash
# Build and deploy to development
npm run deploy:aws:dev

# Build and deploy to staging
npm run deploy:aws:staging

# Build and deploy to production
npm run deploy:aws:prod
```

### 3. Frontend-Only Deployment

For quick frontend updates without infrastructure changes:

```bash
npm run deploy:frontend
```

## Configuration Validation

Validate your AWS configuration before deployment:

```bash
# Validate development configuration
npm run validate-aws:dev

# Validate staging configuration
npm run validate-aws:staging

# Validate production configuration
npm run validate-aws:prod
```

## Migration Steps

### Phase 1: Infrastructure Setup

1. **Deploy AWS Infrastructure**
   ```bash
   cd infrastructure
   ./deploy.sh --environment dev
   ```

2. **Configure Cognito User Pool**
   - Set up OAuth providers (Google)
   - Configure user pool policies
   - Update redirect URLs

3. **Set up RDS Database**
   - Create PostgreSQL instance
   - Configure security groups
   - Set up connection pooling with RDS Proxy

### Phase 2: Data Migration

1. **Export Supabase Data**
   ```bash
   # Export user data
   npm run migrate:users:to-cognito:dry-run
   
   # Export database schema and data
   pg_dump supabase_db > supabase_export.sql
   ```

2. **Import to AWS**
   ```bash
   # Import database
   psql -h rds-endpoint -U username -d hallucifix < supabase_export.sql
   
   # Migrate users to Cognito
   npm run migrate:users:to-cognito
   ```

3. **Validate Migration**
   ```bash
   npm run validate:user-migration
   ```

### Phase 3: Application Update

1. **Update Configuration**
   ```bash
   # Copy environment template
   cp .env.example .env.local
   
   # Update with AWS values
   nano .env.local
   ```

2. **Test Authentication**
   ```bash
   npm run test:cognito-auth
   npm run test:e2e:cognito-auth
   ```

3. **Deploy Application**
   ```bash
   npm run deploy:aws:dev
   ```

### Phase 4: Cutover

1. **Update DNS Records**
   - Point domain to CloudFront distribution
   - Update API endpoints

2. **Monitor and Validate**
   - Check CloudWatch logs
   - Verify all functionality
   - Monitor error rates

3. **Cleanup**
   - Remove Supabase resources
   - Update documentation
   - Remove legacy environment variables

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify Cognito configuration
   - Check OAuth redirect URLs
   - Validate user pool settings

2. **Database Connection Issues**
   - Check security group rules
   - Verify RDS endpoint
   - Test connection string

3. **S3 Upload Failures**
   - Check bucket permissions
   - Verify CORS configuration
   - Test pre-signed URLs

4. **Lambda Function Errors**
   - Check CloudWatch logs
   - Verify IAM permissions
   - Test function locally

### Validation Commands

```bash
# Test database connection
npm run db:test

# Validate AWS configuration
npm run validate-aws

# Test OAuth flow
npm run test-oauth-flow

# Check deployment health
npm run config:health
```

## Rollback Procedure

If issues occur during migration:

1. **Immediate Rollback**
   ```bash
   # Revert DNS to Supabase
   # Update environment variables
   # Redeploy previous version
   ```

2. **Data Synchronization**
   - Ensure data consistency
   - Sync any changes back to Supabase
   - Validate user sessions

3. **Communication**
   - Notify users of any downtime
   - Update status page
   - Document issues for future reference

## Post-Migration

### Monitoring

1. **Set up CloudWatch Dashboards**
2. **Configure Alerts**
3. **Monitor Performance Metrics**
4. **Track Cost Optimization**

### Optimization

1. **Review Auto-scaling Policies**
2. **Optimize Database Queries**
3. **Configure Caching Strategies**
4. **Implement Cost Controls**

### Documentation

1. **Update API Documentation**
2. **Create Operational Runbooks**
3. **Document Architecture Changes**
4. **Update Development Guides**

## Support

For issues during migration:

1. Check CloudWatch logs for detailed error information
2. Use AWS Support for infrastructure issues
3. Refer to the troubleshooting section above
4. Contact the development team for application-specific issues

## Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Cognito User Guide](https://docs.aws.amazon.com/cognito/)
- [AWS RDS Documentation](https://docs.aws.amazon.com/rds/)
- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/)
- [AWS Bedrock User Guide](https://docs.aws.amazon.com/bedrock/)