# HalluciFix Production Deployment Guide

## Overview

This guide covers the production deployment of HalluciFix, including infrastructure setup, configuration, and operational procedures.

## Prerequisites

- AWS Account with appropriate permissions
- Docker and Docker Compose
- Node.js 18+ and npm
- PostgreSQL 15+
- Redis 7+
- Domain name and SSL certificates

## Infrastructure Architecture

### AWS Services Used

- **RDS PostgreSQL**: Primary database
- **ElastiCache Redis**: Caching and session storage
- **S3**: File storage and static assets
- **CloudFront**: CDN for global content delivery
- **Lambda**: Serverless functions for background processing
- **API Gateway**: API management and routing
- **Cognito**: User authentication and authorization
- **Bedrock**: AI model integration

### Local Development Setup

For local development with AWS service simulation:

```bash
# Start all services
docker-compose up -d

# Or use development environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Deployment Steps

### 1. Environment Configuration

Create production environment variables:

```bash
# Database
DATABASE_URL=postgresql://user:password@rds-host:5432/hallucifix_prod
DB_HOST=your-rds-host
DB_USER=hallucifix_prod
DB_PASSWORD=secure-password
DB_NAME=hallucifix_prod

# Redis
REDIS_URL=redis://your-elasticache-host:6379

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# S3 Configuration
VITE_S3_BUCKET_NAME=hallucifix-prod-assets
S3_BUCKET_NAME=hallucifix-prod-assets

# CloudFront
VITE_CLOUDFRONT_DOMAIN=https://your-distribution.cloudfront.net

# Supabase (if using)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application
NODE_ENV=production
VITE_APP_ENV=production
VITE_API_BASE_URL=https://api.hallucifix.com

# Security
JWT_SECRET=your-256-bit-secret
ENCRYPTION_KEY=your-32-byte-key

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

### 2. Database Setup

#### RDS PostgreSQL Setup

```sql
-- Create production database
CREATE DATABASE hallucifix_prod;
GRANT ALL PRIVILEGES ON DATABASE hallucifix_prod TO hallucifix_prod;

-- Run migrations
npm run db:migrate

-- Seed initial data
npm run db:seed
```

#### Redis Setup

```bash
# Configure ElastiCache Redis cluster
# Use AWS Console or CLI to create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id hallucifix-prod-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1
```

### 3. S3 Bucket Configuration

```bash
# Create S3 bucket
aws s3 mb s3://hallucifix-prod-assets

# Configure bucket policy for public read access (if needed)
aws s3api put-bucket-policy --bucket hallucifix-prod-assets --policy file://bucket-policy.json

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket hallucifix-prod-assets \
  --versioning-configuration Status=Enabled

# Configure CORS
aws s3api put-bucket-cors --bucket hallucifix-prod-assets --cors-configuration file://cors-config.json
```

### 4. CloudFront Distribution

```bash
# Create CloudFront distribution
aws cloudfront create-distribution --distribution-config file://cloudfront-config.json

# Invalidate cache after deployment
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

### 5. Application Deployment

#### Build Process

```bash
# Install dependencies
npm ci

# Build for production
npm run build

# Run tests
npm run test

# Build Docker image
docker build -t hallucifix:latest .

# Tag for deployment
docker tag hallucifix:latest your-registry/hallucifix:v1.0.0
```

#### Container Deployment

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  hallucifix:
    image: your-registry/hallucifix:v1.0.0
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=hallucifix_prod
      - POSTGRES_USER=hallucifix_prod
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hallucifix_prod"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
```

### 6. SSL/TLS Configuration

```bash
# Using AWS Certificate Manager
aws acm request-certificate \
  --domain-name hallucifix.com \
  --validation-method DNS \
  --subject-alternative-names *.hallucifix.com

# Or using Let's Encrypt with Certbot
certbot certonly --standalone -d hallucifix.com -d www.hallucifix.com
```

### 7. Monitoring and Logging

#### Application Monitoring

```bash
# Set up CloudWatch alarms
aws cloudwatch put-metric-alarm \
  --alarm-name "Hallucifix-HighCPU" \
  --alarm-description "CPU utilization is high" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

#### Error Tracking

```typescript
// Sentry configuration
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: "production",
  tracesSampleRate: 1.0,
});
```

### 8. Backup and Recovery

#### Database Backups

```bash
# Automated RDS backups
aws rds create-db-instance \
  --db-instance-identifier hallucifix-prod \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00"

# Manual backup
aws rds create-db-snapshot \
  --db-instance-identifier hallucifix-prod \
  --db-snapshot-identifier manual-backup-$(date +%Y%m%d)
```

#### File Backups

```bash
# S3 backup script
aws s3 sync s3://hallucifix-prod-assets s3://hallucifix-prod-backups/$(date +%Y%m%d)/
```

## Operational Procedures

### Health Checks

```bash
# Application health check
curl https://api.hallucifix.com/health

# Database connectivity
psql ${DATABASE_URL} -c "SELECT 1;"

# Redis connectivity
redis-cli -u ${REDIS_URL} ping
```

### Scaling

#### Horizontal Scaling

```bash
# Add more application instances
docker-compose up -d --scale hallucifix=3
```

#### Database Scaling

```bash
# Increase RDS instance size
aws rds modify-db-instance \
  --db-instance-identifier hallucifix-prod \
  --db-instance-class db.t3.large \
  --apply-immediately
```

### Rollback Procedures

```bash
# Quick rollback to previous version
docker tag hallucifix:v1.0.0 hallucifix:v1.0.1-rollback
docker-compose up -d hallucifix

# Database rollback (if needed)
pg_restore -d ${DATABASE_URL} backup.sql
```

## Security Considerations

### Network Security

- Use VPC with private subnets for database and Redis
- Configure security groups to restrict access
- Enable encryption in transit and at rest
- Use AWS WAF for application protection

### Data Protection

- Enable RDS encryption
- Use encrypted S3 buckets
- Implement proper access controls
- Regular security audits and penetration testing

### Compliance

- GDPR compliance for EU users
- SOC 2 Type II certification
- Regular security assessments
- Data retention policies

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   ```bash
   # Check RDS connectivity
   telnet your-rds-host 5432

   # Verify security groups
   aws ec2 describe-security-groups --group-ids your-sg-id
   ```

2. **Application Performance**
   ```bash
   # Check CloudWatch metrics
   aws cloudwatch get-metric-statistics \
     --namespace AWS/EC2 \
     --metric-name CPUUtilization \
     --start-time 2024-01-01T00:00:00Z \
     --end-time 2024-01-02T00:00:00Z \
     --period 3600 \
     --statistics Average
   ```

3. **CDN Issues**
   ```bash
   # Check CloudFront distribution
   aws cloudfront get-distribution --id YOUR_DISTRIBUTION_ID

   # Invalidate cache
   aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
   ```

## Maintenance

### Regular Tasks

- **Weekly**: Review logs and error rates
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Performance optimization and scaling review
- **Annually**: Security audit and compliance review

### Monitoring Dashboards

- Application metrics: Response times, error rates, throughput
- Infrastructure metrics: CPU, memory, disk usage
- Business metrics: User engagement, conversion rates
- Security metrics: Failed login attempts, suspicious activity

## Support and Contact

For production issues:
- **Emergency**: security@hallucifix.com
- **Technical Support**: support@hallucifix.com
- **Monitoring Alerts**: alerts@hallucifix.com

## Version History

- **v1.0.0**: Initial production deployment
- **v1.1.0**: Performance optimizations and monitoring enhancements
- **v1.2.0**: Security improvements and compliance updates