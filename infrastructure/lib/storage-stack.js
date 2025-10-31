"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HallucifixStorageStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
class HallucifixStorageStack extends cdk.Stack {
    bucket;
    staticBucket;
    distribution;
    constructor(scope, id, props) {
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
            publicReadAccess: props.enableCloudFront === false, // Enable public access only when CloudFront is disabled
            blockPublicAccess: props.enableCloudFront === false
                ? s3.BlockPublicAccess.BLOCK_ACLS
                : s3.BlockPublicAccess.BLOCK_ALL,
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
            }
            catch (error) {
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
        }
        else {
            new cdk.CfnOutput(this, 'StaticWebsiteUrl', {
                value: this.staticBucket.bucketWebsiteUrl,
                description: 'S3 Static Website URL (CloudFront disabled)',
                exportName: `${props.environment}-StaticWebsiteUrl`,
            });
        }
    }
}
exports.HallucifixStorageStack = HallucifixStorageStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0b3JhZ2Utc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLHVFQUF5RDtBQUN6RCw0RUFBOEQ7QUFXOUQsTUFBYSxzQkFBdUIsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNuQyxNQUFNLENBQVk7SUFDbEIsWUFBWSxDQUFZO0lBQ3hCLFlBQVksQ0FBMkI7SUFFdkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLDJCQUEyQixFQUFFO1lBQzdELFVBQVUsRUFBRSx3QkFBd0IsS0FBSyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ3ZFLFNBQVMsRUFBRSxJQUFJO1lBQ2YsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUsa0NBQWtDO29CQUN0QyxtQ0FBbUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7aUJBQzFEO2dCQUNEO29CQUNFLEVBQUUsRUFBRSxnQkFBZ0I7b0JBQ3BCLFdBQVcsRUFBRTt3QkFDWDs0QkFDRSxZQUFZLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxpQkFBaUI7NEJBQy9DLGVBQWUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7eUJBQ3ZDO3dCQUNEOzRCQUNF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LEVBQUUsc0JBQXNCLEVBQUU7Z0JBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLHNCQUFzQjtnQkFDL0MsV0FBVyxFQUFFLHFDQUFxQztnQkFDbEQsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLFdBQVcsdUJBQXVCO2FBQ3hELENBQUMsQ0FBQztRQUNMLENBQUM7YUFBTSxDQUFDO1lBQ04sSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtnQkFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsZ0JBQWdCO2dCQUN6QyxXQUFXLEVBQUUsNkNBQTZDO2dCQUMxRCxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsV0FBVyxtQkFBbUI7YUFDcEQsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNILENBQUM7Q0FDRjtBQXhJRCx3REF3SUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEhhbGx1Y2lmaXhTdG9yYWdlU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgdnBjOiBlYzIuVnBjO1xuICBlbmFibGVDbG91ZEZyb250PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEhhbGx1Y2lmaXhTdG9yYWdlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBzdGF0aWNCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbj86IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBIYWxsdWNpZml4U3RvcmFnZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgZG9jdW1lbnQgdXBsb2FkcyBhbmQgcHJvY2Vzc2luZ1xuICAgIHRoaXMuYnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnSGFsbHVjaWZpeERvY3VtZW50c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBoYWxsdWNpZml4LWRvY3VtZW50cy0ke3Byb3BzLmVudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZUluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRzJyxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ1RyYW5zaXRpb25Ub0lBJyxcbiAgICAgICAgICB0cmFuc2l0aW9uczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5JTkZSRVFVRU5UX0FDQ0VTUyxcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5HTEFDSUVSLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxuICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiBcbiAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdGF0aWMgd2Vic2l0ZSBob3N0aW5nIChSZWFjdCBhcHApXG4gICAgdGhpcy5zdGF0aWNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdIYWxsdWNpZml4U3RhdGljQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGhhbGx1Y2lmaXgtc3RhdGljLSR7cHJvcHMuZW52aXJvbm1lbnR9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6ICdlcnJvci5odG1sJyxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHByb3BzLmVuYWJsZUNsb3VkRnJvbnQgPT09IGZhbHNlLCAvLyBFbmFibGUgcHVibGljIGFjY2VzcyBvbmx5IHdoZW4gQ2xvdWRGcm9udCBpcyBkaXNhYmxlZFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHByb3BzLmVuYWJsZUNsb3VkRnJvbnQgPT09IGZhbHNlIFxuICAgICAgICA/IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FDTFMgXG4gICAgICAgIDogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcbiAgICAgICAgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gXG4gICAgICAgIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIChvcHRpb25hbCAtIHJlcXVpcmVzIGFjY291bnQgdmVyaWZpY2F0aW9uKVxuICAgIGlmIChwcm9wcy5lbmFibGVDbG91ZEZyb250ICE9PSBmYWxzZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gT3JpZ2luIEFjY2VzcyBJZGVudGl0eSBmb3IgQ2xvdWRGcm9udCB0byBhY2Nlc3MgUzNcbiAgICAgICAgY29uc3Qgb3JpZ2luQWNjZXNzSWRlbnRpdHkgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnT0FJJywge1xuICAgICAgICAgIGNvbW1lbnQ6IGBPQUkgZm9yIEhhbGx1Y2lGaXggJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBHcmFudCBDbG91ZEZyb250IGFjY2VzcyB0byB0aGUgc3RhdGljIGJ1Y2tldFxuICAgICAgICB0aGlzLnN0YXRpY0J1Y2tldC5ncmFudFJlYWQob3JpZ2luQWNjZXNzSWRlbnRpdHkpO1xuXG4gICAgICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uXG4gICAgICAgIHRoaXMuZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdIYWxsdWNpZml4RGlzdHJpYnV0aW9uJywge1xuICAgICAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbih0aGlzLnN0YXRpY0J1Y2tldCwge1xuICAgICAgICAgICAgICBvcmlnaW5BY2Nlc3NJZGVudGl0eSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xuICAgICAgICAgICAgJy9hcGkvKic6IHtcbiAgICAgICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5IdHRwT3JpZ2luKCdhcGkucGxhY2Vob2xkZXIuY29tJyksIC8vIFdpbGwgYmUgdXBkYXRlZCB3aXRoIEFQSSBHYXRld2F5XG4gICAgICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LkhUVFBTX09OTFksXG4gICAgICAgICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfRElTQUJMRUQsXG4gICAgICAgICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IGNsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFBvbGljeS5DT1JTX1MzX09SSUdJTixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsIC8vIFNQQSByb3V0aW5nXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLCAvLyBTUEEgcm91dGluZ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsIC8vIFVTLCBDYW5hZGEsIEV1cm9wZVxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY29tbWVudDogYEhhbGx1Y2lGaXggQ0ROIC0gJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gY3JlYXRpb24gc2tpcHBlZCAtIGFjY291bnQgdmVyaWZpY2F0aW9uIG1heSBiZSByZXF1aXJlZCcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRG9jdW1lbnRzQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEb2N1bWVudHMgUzMgQnVja2V0IE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LURvY3VtZW50c0J1Y2tldE5hbWVgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YXRpY0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zdGF0aWNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhdGljIEFzc2V0cyBTMyBCdWNrZXQgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tU3RhdGljQnVja2V0TmFtZWAsXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5kaXN0cmlidXRpb24pIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250RGlzdHJpYnV0aW9uSWQnLCB7XG4gICAgICAgIHZhbHVlOiB0aGlzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBJRCcsXG4gICAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1DbG91ZEZyb250RGlzdHJpYnV0aW9uSWRgLFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250RG9tYWluTmFtZScsIHtcbiAgICAgICAgdmFsdWU6IHRoaXMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gRG9tYWluIE5hbWUnLFxuICAgICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tQ2xvdWRGcm9udERvbWFpbk5hbWVgLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGF0aWNXZWJzaXRlVXJsJywge1xuICAgICAgICB2YWx1ZTogdGhpcy5zdGF0aWNCdWNrZXQuYnVja2V0V2Vic2l0ZVVybCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTMyBTdGF0aWMgV2Vic2l0ZSBVUkwgKENsb3VkRnJvbnQgZGlzYWJsZWQpJyxcbiAgICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LVN0YXRpY1dlYnNpdGVVcmxgLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG59Il19