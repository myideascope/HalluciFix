import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface HallucifixStorageStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  enableCloudFront?: boolean;
}

export class HallucifixStorageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly staticBucket: s3.Bucket;
  public readonly distribution?: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: HallucifixStorageStackProps) {
    super(scope, id, props);

    // S3 Bucket for document uploads and processing
    this.bucket = new s3.Bucket(this, 'HallucifixDocumentsBucket', {
      bucketName: `hallucifix-documents-${props.environment}-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // S3 Bucket for static website hosting (React app)
    this.staticBucket = new s3.Bucket(this, 'HallucifixStaticBucket', {
      bucketName: `hallucifix-static-${props.environment}-${this.account}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      // Public access configured manually via CLI
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block all public access (policy set manually)
      encryption: s3.BucketEncryption.S3_MANAGED, // Use AWS-managed encryption for consistency
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // CloudFront Distribution (optional - requires account verification)
    if (props.enableCloudFront !== false) {
      try {
        // Origin Access Identity for CloudFront to access S3
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
          comment: `OAI for HalluciFix ${props.environment}`,
        });

        // Grant CloudFront access to the static bucket
        this.staticBucket.grantRead(originAccessIdentity);

        // CloudFront Distribution
        this.distribution = new cloudfront.Distribution(this, 'HallucifixDistribution', {
          defaultBehavior: {
            origin: new origins.S3Origin(this.staticBucket, {
              originAccessIdentity,
            }),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            compress: true,
          },
          additionalBehaviors: {
            '/api/*': {
              origin: new origins.HttpOrigin('api.placeholder.com'), // Will be updated with API Gateway
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
            },
          },
          defaultRootObject: 'index.html',
          errorResponses: [
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              responsePagePath: '/index.html', // SPA routing
            },
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: '/index.html', // SPA routing
            },
          ],
          priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe
          enabled: true,
          comment: `HalluciFix CDN - ${props.environment}`,
        });
      } catch (error) {
        console.warn('CloudFront distribution creation skipped - account verification may be required');
      }
    }

    // Outputs
    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.bucket.bucketName,
      description: 'Documents S3 Bucket Name',
      exportName: `${props.environment}-DocumentsBucketName`,
    });

    new cdk.CfnOutput(this, 'StaticBucketName', {
      value: this.staticBucket.bucketName,
      description: 'Static Assets S3 Bucket Name',
      exportName: `${props.environment}-StaticBucketName`,
    });

    // Add bucket ARNs for easier reference by other services
    new cdk.CfnOutput(this, 'DocumentsBucketArn', {
      value: this.bucket.bucketArn,
      description: 'Documents S3 Bucket ARN',
      exportName: `${props.environment}-DocumentsBucketArn`,
    });

    new cdk.CfnOutput(this, 'StaticBucketArn', {
      value: this.staticBucket.bucketArn,
      description: 'Static Assets S3 Bucket ARN',
      exportName: `${props.environment}-StaticBucketArn`,
    });

    if (this.distribution) {
      new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
        value: this.distribution.distributionId,
        description: 'CloudFront Distribution ID',
        exportName: `${props.environment}-CloudFrontDistributionId`,
      });

      new cdk.CfnOutput(this, 'CloudFrontDomainName', {
        value: this.distribution.distributionDomainName,
        description: 'CloudFront Distribution Domain Name',
        exportName: `${props.environment}-CloudFrontDomainName`,
      });
    } else {
      new cdk.CfnOutput(this, 'StaticWebsiteUrl', {
        value: this.staticBucket.bucketWebsiteUrl,
        description: 'S3 Static Website URL (CloudFront disabled)',
        exportName: `${props.environment}-StaticWebsiteUrl`,
      });
    }
  }
}