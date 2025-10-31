# File Storage Migration Guide: Supabase Storage to AWS S3

This guide provides step-by-step instructions for migrating file storage from Supabase Storage to AWS S3 with CloudFront CDN.

## Prerequisites

1. **AWS S3 bucket** - Created and configured
2. **CloudFront distribution** - Set up for CDN (optional but recommended)
3. **AWS credentials** - Configured with appropriate permissions
4. **Node.js dependencies** - AWS SDK packages installed

## Migration Overview

The migration involves:
1. Setting up S3 and CloudFront infrastructure
2. Creating new file upload services
3. Migrating existing files from Supabase Storage
4. Updating application components
5. Testing and validation

## Step 1: Infrastructure Setup

### S3 Bucket Configuration

1. **Create S3 bucket** (if not already done):
   ```bash
   aws s3 mb s3://hallucifix-documents --region us-east-1
   ```

2. **Configure bucket policy** for secure access:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AllowCloudFrontAccess",
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
         },
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::hallucifix-documents/*"
       }
     ]
   }
   ```

3. **Enable versioning and encryption**:
   ```bash
   aws s3api put-bucket-versioning --bucket hallucifix-documents --versioning-configuration Status=Enabled
   aws s3api put-bucket-encryption --bucket hallucifix-documents --server-side-encryption-configuration '{
     "Rules": [
       {
         "ApplyServerSideEncryptionByDefault": {
           "SSEAlgorithm": "AES256"
         }
       }
     ]
   }'
   ```

### CloudFront Distribution

1. **Create CloudFront distribution** for CDN:
   ```bash
   aws cloudfront create-distribution --distribution-config file://cloudfront-config.json
   ```

2. **CloudFront configuration** (`cloudfront-config.json`):
   ```json
   {
     "CallerReference": "hallucifix-cdn-2024",
     "Comment": "HalluciFix Document CDN",
     "DefaultRootObject": "",
     "Origins": {
       "Quantity": 1,
       "Items": [
         {
           "Id": "S3-hallucifix-documents",
           "DomainName": "hallucifix-documents.s3.amazonaws.com",
           "S3OriginConfig": {
             "OriginAccessIdentity": "origin-access-identity/cloudfront/YOUR_OAI_ID"
           }
         }
       ]
     },
     "DefaultCacheBehavior": {
       "TargetOriginId": "S3-hallucifix-documents",
       "ViewerProtocolPolicy": "redirect-to-https",
       "TrustedSigners": {
         "Enabled": false,
         "Quantity": 0
       },
       "ForwardedValues": {
         "QueryString": false,
         "Cookies": {
           "Forward": "none"
         }
       },
       "MinTTL": 0,
       "DefaultTTL": 86400,
       "MaxTTL": 31536000
     },
     "Enabled": true,
     "PriceClass": "PriceClass_100"
   }
   ```

## Step 2: Environment Configuration

1. **Copy S3 environment template**:
   ```bash
   cp .env.s3.example .env.local
   ```

2. **Update environment variables**:
   ```bash
   # AWS Configuration
   AWS_ACCESS_KEY_ID=your-access-key-id
   AWS_SECRET_ACCESS_KEY=your-secret-access-key
   AWS_REGION=us-east-1
   
   # S3 Configuration
   S3_BUCKET_NAME=hallucifix-documents
   
   # CloudFront Configuration
   CLOUDFRONT_DOMAIN=your-distribution.cloudfront.net
   
   # File Upload Settings
   MAX_FILE_SIZE=52428800  # 50MB
   ```

## Step 3: Install Dependencies

Add AWS SDK packages to your project:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Step 4: Migrate Existing Files

### Run File Migration Script

1. **Set environment variables** for migration:
   ```bash
   export SUPABASE_URL=your-supabase-url
   export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   export SUPABASE_BUCKET_NAME=documents
   export S3_BUCKET_NAME=hallucifix-documents
   ```

2. **Execute migration script**:
   ```bash
   cd infrastructure/scripts
   ts-node migrate-files-to-s3.ts
   ```

3. **Review migration results**:
   - Check `infrastructure/migration-data/file-migration-summary.json`
   - Verify files in S3 console
   - Test file access through CloudFront

## Step 5: Update Application Code

### Component Updates

The following components have been updated to use S3:

1. **BatchAnalysis.tsx** - Uses `useFileUpload` hook for S3 uploads
2. **HallucinationAnalyzer.tsx** - Integrated with S3 file upload service
3. **New hook: useFileUpload.ts** - Provides file upload functionality

### Service Layer

New services created:
- `src/lib/storage/s3Service.ts` - Core S3 operations
- `src/lib/storage/fileUploadService.ts` - High-level file upload service
- `src/hooks/useFileUpload.ts` - React hook for file uploads

## Step 6: Testing

### File Upload Testing

1. **Test single file upload**:
   ```typescript
   // In HallucinationAnalyzer
   // Upload a PDF or text file
   // Verify content extraction works
   ```

2. **Test batch file upload**:
   ```typescript
   // In BatchAnalysis
   // Upload multiple files
   // Verify all files are processed
   ```

3. **Test file download**:
   ```typescript
   import { fileUploadService } from './lib/storage/fileUploadService';
   
   const downloadUrl = await fileUploadService.getDownloadUrl(fileKey, userId);
   // Test URL works and file downloads correctly
   ```

### Performance Testing

1. **Upload performance**:
   - Test with various file sizes (1MB, 10MB, 50MB)
   - Measure upload times
   - Test concurrent uploads

2. **Download performance**:
   - Test CloudFront CDN performance
   - Verify caching behavior
   - Test from different geographic locations

## Step 7: Monitoring and Optimization

### CloudWatch Metrics

Set up monitoring for:
- S3 request metrics
- CloudFront cache hit ratio
- File upload success/failure rates
- Storage costs

### Cost Optimization

1. **S3 Lifecycle policies**:
   ```json
   {
     "Rules": [
       {
         "ID": "ArchiveOldFiles",
         "Status": "Enabled",
         "Filter": {
           "Prefix": "uploads/"
         },
         "Transitions": [
           {
             "Days": 30,
             "StorageClass": "STANDARD_IA"
           },
           {
             "Days": 90,
             "StorageClass": "GLACIER"
           }
         ]
       }
     ]
   }
   ```

2. **CloudFront optimization**:
   - Configure appropriate cache behaviors
   - Set up compression
   - Monitor cache hit ratios

## Step 8: Security Hardening

### S3 Security

1. **Block public access**:
   ```bash
   aws s3api put-public-access-block --bucket hallucifix-documents --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
   ```

2. **Enable access logging**:
   ```bash
   aws s3api put-bucket-logging --bucket hallucifix-documents --bucket-logging-status file://logging-config.json
   ```

3. **Configure CORS** for web uploads:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
       "AllowedOrigins": ["https://your-domain.com"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

### IAM Permissions

Create minimal IAM policy for application:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::hallucifix-documents/uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::hallucifix-documents",
      "Condition": {
        "StringLike": {
          "s3:prefix": "uploads/*"
        }
      }
    }
  ]
}
```

## Step 9: Rollback Plan

If issues occur, you can rollback:

1. **Revert environment variables**:
   ```bash
   # Remove S3 variables
   unset S3_BUCKET_NAME AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
   
   # Restore Supabase variables
   export VITE_SUPABASE_URL=your-supabase-url
   export VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

2. **Revert code changes**:
   ```bash
   git checkout HEAD~1 -- src/components/BatchAnalysis.tsx
   git checkout HEAD~1 -- src/components/HallucinationAnalyzer.tsx
   git checkout HEAD~1 -- src/hooks/useFileUpload.ts
   ```

3. **Restart application** with Supabase configuration

## Troubleshooting

### Common Issues

1. **CORS errors**:
   - Verify S3 bucket CORS configuration
   - Check CloudFront CORS headers
   - Ensure origin matches exactly

2. **Upload failures**:
   - Check AWS credentials and permissions
   - Verify file size limits
   - Check network connectivity

3. **File not found errors**:
   - Verify S3 key generation logic
   - Check bucket and object permissions
   - Ensure CloudFront distribution is deployed

4. **Performance issues**:
   - Monitor CloudFront cache hit ratio
   - Check S3 request patterns
   - Optimize file upload chunk sizes

### Debug Commands

```bash
# Test S3 access
aws s3 ls s3://hallucifix-documents/

# Test file upload
aws s3 cp test-file.txt s3://hallucifix-documents/test/

# Check CloudFront distribution
aws cloudfront get-distribution --id YOUR_DISTRIBUTION_ID

# Monitor S3 metrics
aws cloudwatch get-metric-statistics --namespace AWS/S3 --metric-name NumberOfObjects --dimensions Name=BucketName,Value=hallucifix-documents --start-time 2024-01-01T00:00:00Z --end-time 2024-01-02T00:00:00Z --period 3600 --statistics Average
```

## Migration Checklist

- [ ] S3 bucket created and configured
- [ ] CloudFront distribution set up
- [ ] Environment variables updated
- [ ] AWS SDK dependencies installed
- [ ] File migration script executed
- [ ] Application components updated
- [ ] File upload functionality tested
- [ ] File download functionality tested
- [ ] Performance testing completed
- [ ] Security hardening applied
- [ ] Monitoring configured
- [ ] Documentation updated
- [ ] Team trained on new file storage

## Post-Migration Tasks

1. **Monitor costs** - Set up billing alerts for S3 and CloudFront
2. **Optimize performance** - Analyze usage patterns and adjust caching
3. **Regular backups** - Implement cross-region replication if needed
4. **Clean up Supabase** - Remove old files after validation period
5. **Update CI/CD** - Modify deployment scripts for S3 integration

This completes the file storage migration from Supabase to AWS S3 with CloudFront CDN.