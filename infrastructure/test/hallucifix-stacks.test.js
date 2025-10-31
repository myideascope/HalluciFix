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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const network_stack_1 = require("../lib/network-stack");
const storage_stack_1 = require("../lib/storage-stack");
describe('HalluciFix Infrastructure Stacks', () => {
    test('Network Stack creates VPC with correct configuration', () => {
        const app = new cdk.App();
        const stack = new network_stack_1.HallucifixNetworkStack(app, 'TestNetworkStack', {
            environment: 'test',
            env: { account: '123456789012', region: 'us-east-1' },
        });
        const template = assertions_1.Template.fromStack(stack);
        // Verify VPC is created
        template.hasResourceProperties('AWS::EC2::VPC', {
            CidrBlock: '10.0.0.0/16',
        });
        // Verify security groups are created
        template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
    });
    test('Storage Stack creates S3 buckets and CloudFront distribution', () => {
        const app = new cdk.App();
        const networkStack = new network_stack_1.HallucifixNetworkStack(app, 'TestNetworkStack', {
            environment: 'test',
            env: { account: '123456789012', region: 'us-east-1' },
        });
        const storageStack = new storage_stack_1.HallucifixStorageStack(app, 'TestStorageStack', {
            environment: 'test',
            vpc: networkStack.vpc,
            env: { account: '123456789012', region: 'us-east-1' },
        });
        const template = assertions_1.Template.fromStack(storageStack);
        // Verify S3 buckets are created
        template.resourceCountIs('AWS::S3::Bucket', 2);
        // Verify CloudFront distribution is created
        template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFsbHVjaWZpeC1zdGFja3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImhhbGx1Y2lmaXgtc3RhY2tzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx1REFBa0Q7QUFDbEQsd0RBQThEO0FBQzlELHdEQUE4RDtBQUU5RCxRQUFRLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO0lBQ2hELElBQUksQ0FBQyxzREFBc0QsRUFBRSxHQUFHLEVBQUU7UUFDaEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxzQ0FBc0IsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEVBQUU7WUFDaEUsV0FBVyxFQUFFLE1BQU07WUFDbkIsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTNDLHdCQUF3QjtRQUN4QixRQUFRLENBQUMscUJBQXFCLENBQUMsZUFBZSxFQUFFO1lBQzlDLFNBQVMsRUFBRSxhQUFhO1NBQ3pCLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxRQUFRLENBQUMsZUFBZSxDQUFDLHlCQUF5QixFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3pELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhEQUE4RCxFQUFFLEdBQUcsRUFBRTtRQUN4RSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMxQixNQUFNLFlBQVksR0FBRyxJQUFJLHNDQUFzQixDQUFDLEdBQUcsRUFBRSxrQkFBa0IsRUFBRTtZQUN2RSxXQUFXLEVBQUUsTUFBTTtZQUNuQixHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUU7U0FDdEQsQ0FBQyxDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcsSUFBSSxzQ0FBc0IsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEVBQUU7WUFDdkUsV0FBVyxFQUFFLE1BQU07WUFDbkIsR0FBRyxFQUFFLFlBQVksQ0FBQyxHQUFHO1lBQ3JCLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUN0RCxDQUFDLENBQUM7UUFFSCxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVsRCxnQ0FBZ0M7UUFDaEMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUvQyw0Q0FBNEM7UUFDNUMsUUFBUSxDQUFDLGVBQWUsQ0FBQywrQkFBK0IsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMvRCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgeyBIYWxsdWNpZml4TmV0d29ya1N0YWNrIH0gZnJvbSAnLi4vbGliL25ldHdvcmstc3RhY2snO1xuaW1wb3J0IHsgSGFsbHVjaWZpeFN0b3JhZ2VTdGFjayB9IGZyb20gJy4uL2xpYi9zdG9yYWdlLXN0YWNrJztcblxuZGVzY3JpYmUoJ0hhbGx1Y2lGaXggSW5mcmFzdHJ1Y3R1cmUgU3RhY2tzJywgKCkgPT4ge1xuICB0ZXN0KCdOZXR3b3JrIFN0YWNrIGNyZWF0ZXMgVlBDIHdpdGggY29ycmVjdCBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgSGFsbHVjaWZpeE5ldHdvcmtTdGFjayhhcHAsICdUZXN0TmV0d29ya1N0YWNrJywge1xuICAgICAgZW52aXJvbm1lbnQ6ICd0ZXN0JyxcbiAgICAgIGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXG4gICAgLy8gVmVyaWZ5IFZQQyBpcyBjcmVhdGVkXG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkVDMjo6VlBDJywge1xuICAgICAgQ2lkckJsb2NrOiAnMTAuMC4wLjAvMTYnLFxuICAgIH0pO1xuXG4gICAgLy8gVmVyaWZ5IHNlY3VyaXR5IGdyb3VwcyBhcmUgY3JlYXRlZFxuICAgIHRlbXBsYXRlLnJlc291cmNlQ291bnRJcygnQVdTOjpFQzI6OlNlY3VyaXR5R3JvdXAnLCAzKTtcbiAgfSk7XG5cbiAgdGVzdCgnU3RvcmFnZSBTdGFjayBjcmVhdGVzIFMzIGJ1Y2tldHMgYW5kIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uJywgKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3QgbmV0d29ya1N0YWNrID0gbmV3IEhhbGx1Y2lmaXhOZXR3b3JrU3RhY2soYXBwLCAnVGVzdE5ldHdvcmtTdGFjaycsIHtcbiAgICAgIGVudmlyb25tZW50OiAndGVzdCcsXG4gICAgICBlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN0b3JhZ2VTdGFjayA9IG5ldyBIYWxsdWNpZml4U3RvcmFnZVN0YWNrKGFwcCwgJ1Rlc3RTdG9yYWdlU3RhY2snLCB7XG4gICAgICBlbnZpcm9ubWVudDogJ3Rlc3QnLFxuICAgICAgdnBjOiBuZXR3b3JrU3RhY2sudnBjLFxuICAgICAgZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdG9yYWdlU3RhY2spO1xuXG4gICAgLy8gVmVyaWZ5IFMzIGJ1Y2tldHMgYXJlIGNyZWF0ZWRcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIDIpO1xuXG4gICAgLy8gVmVyaWZ5IENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGlzIGNyZWF0ZWRcbiAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywgMSk7XG4gIH0pO1xufSk7Il19