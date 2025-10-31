#!/usr/bin/env node
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
const network_stack_1 = require("../lib/network-stack");
const database_stack_1 = require("../lib/database-stack");
const compute_stack_1 = require("../lib/compute-stack");
const storage_stack_1 = require("../lib/storage-stack");
const app = new cdk.App();
// Environment configuration
const env = {
    account: '135167710042',
    region: 'us-east-1'
};
// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';
// Network Stack - VPC, subnets, security groups
const networkStack = new network_stack_1.HallucifixNetworkStack(app, `Hallucifix-Network-${environment}`, {
    env,
    environment,
    description: `HalluciFix Network Infrastructure - ${environment}`
});
// Storage Stack - S3, CloudFront (CloudFront disabled until account verification)
const storageStack = new storage_stack_1.HallucifixStorageStack(app, `Hallucifix-Storage-${environment}`, {
    env,
    environment,
    vpc: networkStack.vpc,
    enableCloudFront: false, // Disable until AWS account is verified
    description: `HalluciFix Storage Infrastructure - ${environment}`
});
// Database Stack - RDS, ElastiCache
const databaseStack = new database_stack_1.HallucifixDatabaseStack(app, `Hallucifix-Database-${environment}`, {
    env,
    environment,
    vpc: networkStack.vpc,
    databaseSecurityGroup: networkStack.databaseSecurityGroup,
    description: `HalluciFix Database Infrastructure - ${environment}`
});
// Compute Stack - Lambda, API Gateway, Cognito
const computeStack = new compute_stack_1.HallucifixComputeStack(app, `Hallucifix-Compute-${environment}`, {
    env,
    environment,
    vpc: networkStack.vpc,
    lambdaSecurityGroup: networkStack.lambdaSecurityGroup,
    database: databaseStack.database,
    cache: databaseStack.cache,
    bucket: storageStack.bucket,
    distribution: storageStack.distribution,
    description: `HalluciFix Compute Infrastructure - ${environment}`
});
// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'HalluciFix');
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyx3REFBOEQ7QUFDOUQsMERBQWdFO0FBQ2hFLHdEQUE4RDtBQUM5RCx3REFBOEQ7QUFFOUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsNEJBQTRCO0FBQzVCLE1BQU0sR0FBRyxHQUFHO0lBQ1YsT0FBTyxFQUFFLGNBQWM7SUFDdkIsTUFBTSxFQUFFLFdBQVc7Q0FDcEIsQ0FBQztBQUVGLG1EQUFtRDtBQUNuRCxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLENBQUM7QUFFbkUsZ0RBQWdEO0FBQ2hELE1BQU0sWUFBWSxHQUFHLElBQUksc0NBQXNCLENBQUMsR0FBRyxFQUFFLHNCQUFzQixXQUFXLEVBQUUsRUFBRTtJQUN4RixHQUFHO0lBQ0gsV0FBVztJQUNYLFdBQVcsRUFBRSx1Q0FBdUMsV0FBVyxFQUFFO0NBQ2xFLENBQUMsQ0FBQztBQUVILGtGQUFrRjtBQUNsRixNQUFNLFlBQVksR0FBRyxJQUFJLHNDQUFzQixDQUFDLEdBQUcsRUFBRSxzQkFBc0IsV0FBVyxFQUFFLEVBQUU7SUFDeEYsR0FBRztJQUNILFdBQVc7SUFDWCxHQUFHLEVBQUUsWUFBWSxDQUFDLEdBQUc7SUFDckIsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLHdDQUF3QztJQUNqRSxXQUFXLEVBQUUsdUNBQXVDLFdBQVcsRUFBRTtDQUNsRSxDQUFDLENBQUM7QUFFSCxvQ0FBb0M7QUFDcEMsTUFBTSxhQUFhLEdBQUcsSUFBSSx3Q0FBdUIsQ0FBQyxHQUFHLEVBQUUsdUJBQXVCLFdBQVcsRUFBRSxFQUFFO0lBQzNGLEdBQUc7SUFDSCxXQUFXO0lBQ1gsR0FBRyxFQUFFLFlBQVksQ0FBQyxHQUFHO0lBQ3JCLHFCQUFxQixFQUFFLFlBQVksQ0FBQyxxQkFBcUI7SUFDekQsV0FBVyxFQUFFLHdDQUF3QyxXQUFXLEVBQUU7Q0FDbkUsQ0FBQyxDQUFDO0FBRUgsK0NBQStDO0FBQy9DLE1BQU0sWUFBWSxHQUFHLElBQUksc0NBQXNCLENBQUMsR0FBRyxFQUFFLHNCQUFzQixXQUFXLEVBQUUsRUFBRTtJQUN4RixHQUFHO0lBQ0gsV0FBVztJQUNYLEdBQUcsRUFBRSxZQUFZLENBQUMsR0FBRztJQUNyQixtQkFBbUIsRUFBRSxZQUFZLENBQUMsbUJBQW1CO0lBQ3JELFFBQVEsRUFBRSxhQUFhLENBQUMsUUFBUTtJQUNoQyxLQUFLLEVBQUUsYUFBYSxDQUFDLEtBQUs7SUFDMUIsTUFBTSxFQUFFLFlBQVksQ0FBQyxNQUFNO0lBQzNCLFlBQVksRUFBRSxZQUFZLENBQUMsWUFBWTtJQUN2QyxXQUFXLEVBQUUsdUNBQXVDLFdBQVcsRUFBRTtDQUNsRSxDQUFDLENBQUM7QUFFSCx5QkFBeUI7QUFDekIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUM5QyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ2pELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgSGFsbHVjaWZpeE5ldHdvcmtTdGFjayB9IGZyb20gJy4uL2xpYi9uZXR3b3JrLXN0YWNrJztcbmltcG9ydCB7IEhhbGx1Y2lmaXhEYXRhYmFzZVN0YWNrIH0gZnJvbSAnLi4vbGliL2RhdGFiYXNlLXN0YWNrJztcbmltcG9ydCB7IEhhbGx1Y2lmaXhDb21wdXRlU3RhY2sgfSBmcm9tICcuLi9saWIvY29tcHV0ZS1zdGFjayc7XG5pbXBvcnQgeyBIYWxsdWNpZml4U3RvcmFnZVN0YWNrIH0gZnJvbSAnLi4vbGliL3N0b3JhZ2Utc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG5jb25zdCBlbnYgPSB7XG4gIGFjY291bnQ6ICcxMzUxNjc3MTAwNDInLFxuICByZWdpb246ICd1cy1lYXN0LTEnXG59O1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0IG9yIGRlZmF1bHQgdG8gJ2RldidcbmNvbnN0IGVudmlyb25tZW50ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52aXJvbm1lbnQnKSB8fCAnZGV2JztcblxuLy8gTmV0d29yayBTdGFjayAtIFZQQywgc3VibmV0cywgc2VjdXJpdHkgZ3JvdXBzXG5jb25zdCBuZXR3b3JrU3RhY2sgPSBuZXcgSGFsbHVjaWZpeE5ldHdvcmtTdGFjayhhcHAsIGBIYWxsdWNpZml4LU5ldHdvcmstJHtlbnZpcm9ubWVudH1gLCB7XG4gIGVudixcbiAgZW52aXJvbm1lbnQsXG4gIGRlc2NyaXB0aW9uOiBgSGFsbHVjaUZpeCBOZXR3b3JrIEluZnJhc3RydWN0dXJlIC0gJHtlbnZpcm9ubWVudH1gXG59KTtcblxuLy8gU3RvcmFnZSBTdGFjayAtIFMzLCBDbG91ZEZyb250IChDbG91ZEZyb250IGRpc2FibGVkIHVudGlsIGFjY291bnQgdmVyaWZpY2F0aW9uKVxuY29uc3Qgc3RvcmFnZVN0YWNrID0gbmV3IEhhbGx1Y2lmaXhTdG9yYWdlU3RhY2soYXBwLCBgSGFsbHVjaWZpeC1TdG9yYWdlLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnYsXG4gIGVudmlyb25tZW50LFxuICB2cGM6IG5ldHdvcmtTdGFjay52cGMsXG4gIGVuYWJsZUNsb3VkRnJvbnQ6IGZhbHNlLCAvLyBEaXNhYmxlIHVudGlsIEFXUyBhY2NvdW50IGlzIHZlcmlmaWVkXG4gIGRlc2NyaXB0aW9uOiBgSGFsbHVjaUZpeCBTdG9yYWdlIEluZnJhc3RydWN0dXJlIC0gJHtlbnZpcm9ubWVudH1gXG59KTtcblxuLy8gRGF0YWJhc2UgU3RhY2sgLSBSRFMsIEVsYXN0aUNhY2hlXG5jb25zdCBkYXRhYmFzZVN0YWNrID0gbmV3IEhhbGx1Y2lmaXhEYXRhYmFzZVN0YWNrKGFwcCwgYEhhbGx1Y2lmaXgtRGF0YWJhc2UtJHtlbnZpcm9ubWVudH1gLCB7XG4gIGVudixcbiAgZW52aXJvbm1lbnQsXG4gIHZwYzogbmV0d29ya1N0YWNrLnZwYyxcbiAgZGF0YWJhc2VTZWN1cml0eUdyb3VwOiBuZXR3b3JrU3RhY2suZGF0YWJhc2VTZWN1cml0eUdyb3VwLFxuICBkZXNjcmlwdGlvbjogYEhhbGx1Y2lGaXggRGF0YWJhc2UgSW5mcmFzdHJ1Y3R1cmUgLSAke2Vudmlyb25tZW50fWBcbn0pO1xuXG4vLyBDb21wdXRlIFN0YWNrIC0gTGFtYmRhLCBBUEkgR2F0ZXdheSwgQ29nbml0b1xuY29uc3QgY29tcHV0ZVN0YWNrID0gbmV3IEhhbGx1Y2lmaXhDb21wdXRlU3RhY2soYXBwLCBgSGFsbHVjaWZpeC1Db21wdXRlLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnYsXG4gIGVudmlyb25tZW50LFxuICB2cGM6IG5ldHdvcmtTdGFjay52cGMsXG4gIGxhbWJkYVNlY3VyaXR5R3JvdXA6IG5ldHdvcmtTdGFjay5sYW1iZGFTZWN1cml0eUdyb3VwLFxuICBkYXRhYmFzZTogZGF0YWJhc2VTdGFjay5kYXRhYmFzZSxcbiAgY2FjaGU6IGRhdGFiYXNlU3RhY2suY2FjaGUsXG4gIGJ1Y2tldDogc3RvcmFnZVN0YWNrLmJ1Y2tldCxcbiAgZGlzdHJpYnV0aW9uOiBzdG9yYWdlU3RhY2suZGlzdHJpYnV0aW9uLFxuICBkZXNjcmlwdGlvbjogYEhhbGx1Y2lGaXggQ29tcHV0ZSBJbmZyYXN0cnVjdHVyZSAtICR7ZW52aXJvbm1lbnR9YFxufSk7XG5cbi8vIEFkZCB0YWdzIHRvIGFsbCBzdGFja3NcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdQcm9qZWN0JywgJ0hhbGx1Y2lGaXgnKTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7Il19