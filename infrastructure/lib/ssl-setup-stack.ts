import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as acm from 'aws-cdk-lib/aws-acm';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface SSLSetupStackProps extends cdk.StackProps {
  environment: string;
  bucket: s3.IBucket;
  hostedZoneId: string;
  certificateArn: string;
}

export class SSLSetupStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly securityHeadersFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: SSLSetupStackProps) {
    super(scope, id, props);

    const { environment, bucket, hostedZoneId, certificateArn } = props;

    // Create security headers Lambda@Edge function
    this.securityHeadersFunction = new lambda.Function(this, 'SecurityHeadersFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromInline(`
        exports.handler = (event) => {
          const response = event.Records[0].cf.response;
          const headers = response.headers;
          
          // Strict Transport Security
          headers['strict-transport-security'] = [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          }];
          
          // Prevent clickjacking
          headers['x-frame-options'] = [{
            key: 'X-Frame-Options',
            value: 'DENY'
          }];
          
          // Prevent MIME type sniffing
          headers['x-content-type-options'] = [{
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          }];
          
          // XSS Protection
          headers['x-xss-protection'] = [{
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          }];
          
          // Referrer Policy
          headers['referrer-policy'] = [{
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }];
          
          return response;
        };
      `),
      handler: 'index.handler',
      currentVersionOptions: {
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }
    });

    // Import the SSL certificate
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'SSLCertificate',
      certificateArn
    );

    // Import the hosted zone
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId,
      zoneName: 'ideascope.cloud'
    });

    // Create CloudFront origin access identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'HalluciFixOAI',
      {
        comment: \`OAI for HalluciFix \${environment} S3 bucket\`
      }
    );

    // Grant OAI access to S3 bucket
    bucket.grantRead(originAccessIdentity);

    // Create CloudFront distribution with SSL
    this.distribution = new cloudfront.Distribution(this, 'HalluciFixDistribution', {
      certificate: certificate,
      domainNames: ['app.ideascope.cloud'],
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responsePagePath: '/index.html'
        }
      ],
      defaultBehavior: {
        origin: new cloudfront.S3Origin(bucket, {
          originAccessIdentity: originAccessIdentity
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new cloudfront.CachePolicy(this, \`HalluciFixCachePolicy-\${environment}\`, {
          cachePolicyName: \`hallucifix-cache-policy-\${environment}\`,
          minTtl: cdk.Duration.seconds(0),
          maxTtl: cdk.Duration.days(1),
          defaultTtl: cdk.Duration.hours(1),
          enableAcceptEncodingBrotli: true,
          enableAcceptEncodingGzip: true,
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
          cookieBehavior: cloudfront.CacheCookieBehavior.none()
        }),
        originRequestPolicy: new cloudfront.OriginRequestPolicy(this, \`HalluciFixOriginRequestPolicy-\${environment}\`, {
          originRequestPolicyName: \`hallucifix-origin-request-policy-\${environment}\`,
          queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
          headerBehavior: cloudfront.OriginRequestHeaderBehavior.none(),
          cookieBehavior: cloudfront.OriginRequestCookieBehavior.none()
        }),
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
            functionVersion: this.securityHeadersFunction.currentVersion
          }
        ]
      },
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100
    });

    // Create Route 53 alias record
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: 'app',
      target: route53.RecordTarget.fromAlias({
        // CloudFront distribution alias
        bind: () => ({
          hostedZoneId: 'Z2FDTNDATAQYW2', // CloudFront hosted zone ID
          dnsName: this.distribution.distributionDomainName
        })
      })
    });

    // Outputs
    new cdk.CfnOutput(this, 'CloudFrontDistributionDomain', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name'
    });

    new cdk.CfnOutput(this, 'CustomDomain', {
      value: 'app.ideascope.cloud',
      description: 'Custom Domain Name'
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID'
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: certificateArn,
      description: 'SSL Certificate ARN'
    });
  }
}