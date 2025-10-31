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
const cognito_stack_1 = require("../lib/cognito-stack");
const cache_monitoring_stack_1 = require("../lib/cache-monitoring-stack");
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
    cacheSecurityGroup: networkStack.cacheSecurityGroup,
    description: `HalluciFix Database Infrastructure - ${environment}`
});
// Cognito Stack - User Pool, Identity Pool, OAuth (separate from compute for easier management)
const cognitoStack = new cognito_stack_1.HallucifixCognitoStack(app, `Hallucifix-Cognito-${environment}`, {
    env,
    environment,
    useRealGoogleCredentials: app.node.tryGetContext('useRealGoogleCredentials') === 'true',
    description: `HalluciFix Cognito Authentication - ${environment}`
});
// Compute Stack - Lambda, API Gateway
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
// Cache Monitoring Stack - CloudWatch monitoring for ElastiCache
const cacheMonitoringStack = new cache_monitoring_stack_1.HallucifixCacheMonitoringStack(app, `Hallucifix-CacheMonitoring-${environment}`, {
    env,
    environment,
    cacheCluster: databaseStack.cache,
    alertEmail: app.node.tryGetContext('alertEmail'),
    description: `HalluciFix Cache Monitoring - ${environment}`
});
// Add dependencies
cacheMonitoringStack.addDependency(databaseStack);
// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'HalluciFix');
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyx3REFBOEQ7QUFDOUQsMERBQWdFO0FBQ2hFLHdEQUE4RDtBQUM5RCx3REFBOEQ7QUFDOUQsd0RBQThEO0FBQzlELDBFQUErRTtBQUUvRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiw0QkFBNEI7QUFDNUIsTUFBTSxHQUFHLEdBQUc7SUFDVixPQUFPLEVBQUUsY0FBYztJQUN2QixNQUFNLEVBQUUsV0FBVztDQUNwQixDQUFDO0FBRUYsbURBQW1EO0FBQ25ELE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUVuRSxnREFBZ0Q7QUFDaEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxzQ0FBc0IsQ0FBQyxHQUFHLEVBQUUsc0JBQXNCLFdBQVcsRUFBRSxFQUFFO0lBQ3hGLEdBQUc7SUFDSCxXQUFXO0lBQ1gsV0FBVyxFQUFFLHVDQUF1QyxXQUFXLEVBQUU7Q0FDbEUsQ0FBQyxDQUFDO0FBRUgsa0ZBQWtGO0FBQ2xGLE1BQU0sWUFBWSxHQUFHLElBQUksc0NBQXNCLENBQUMsR0FBRyxFQUFFLHNCQUFzQixXQUFXLEVBQUUsRUFBRTtJQUN4RixHQUFHO0lBQ0gsV0FBVztJQUNYLEdBQUcsRUFBRSxZQUFZLENBQUMsR0FBRztJQUNyQixnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsd0NBQXdDO0lBQ2pFLFdBQVcsRUFBRSx1Q0FBdUMsV0FBVyxFQUFFO0NBQ2xFLENBQUMsQ0FBQztBQUVILG9DQUFvQztBQUNwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLHdDQUF1QixDQUFDLEdBQUcsRUFBRSx1QkFBdUIsV0FBVyxFQUFFLEVBQUU7SUFDM0YsR0FBRztJQUNILFdBQVc7SUFDWCxHQUFHLEVBQUUsWUFBWSxDQUFDLEdBQUc7SUFDckIscUJBQXFCLEVBQUUsWUFBWSxDQUFDLHFCQUFxQjtJQUN6RCxrQkFBa0IsRUFBRSxZQUFZLENBQUMsa0JBQWtCO0lBQ25ELFdBQVcsRUFBRSx3Q0FBd0MsV0FBVyxFQUFFO0NBQ25FLENBQUMsQ0FBQztBQUVILGdHQUFnRztBQUNoRyxNQUFNLFlBQVksR0FBRyxJQUFJLHNDQUFzQixDQUFDLEdBQUcsRUFBRSxzQkFBc0IsV0FBVyxFQUFFLEVBQUU7SUFDeEYsR0FBRztJQUNILFdBQVc7SUFDWCx3QkFBd0IsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLE1BQU07SUFDdkYsV0FBVyxFQUFFLHVDQUF1QyxXQUFXLEVBQUU7Q0FDbEUsQ0FBQyxDQUFDO0FBRUgsc0NBQXNDO0FBQ3RDLE1BQU0sWUFBWSxHQUFHLElBQUksc0NBQXNCLENBQUMsR0FBRyxFQUFFLHNCQUFzQixXQUFXLEVBQUUsRUFBRTtJQUN4RixHQUFHO0lBQ0gsV0FBVztJQUNYLEdBQUcsRUFBRSxZQUFZLENBQUMsR0FBRztJQUNyQixtQkFBbUIsRUFBRSxZQUFZLENBQUMsbUJBQW1CO0lBQ3JELFFBQVEsRUFBRSxhQUFhLENBQUMsUUFBUTtJQUNoQyxLQUFLLEVBQUUsYUFBYSxDQUFDLEtBQUs7SUFDMUIsTUFBTSxFQUFFLFlBQVksQ0FBQyxNQUFNO0lBQzNCLFlBQVksRUFBRSxZQUFZLENBQUMsWUFBWTtJQUN2QyxXQUFXLEVBQUUsdUNBQXVDLFdBQVcsRUFBRTtDQUNsRSxDQUFDLENBQUM7QUFFSCxpRUFBaUU7QUFDakUsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLHVEQUE4QixDQUFDLEdBQUcsRUFBRSw4QkFBOEIsV0FBVyxFQUFFLEVBQUU7SUFDaEgsR0FBRztJQUNILFdBQVc7SUFDWCxZQUFZLEVBQUUsYUFBYSxDQUFDLEtBQUs7SUFDakMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQztJQUNoRCxXQUFXLEVBQUUsaUNBQWlDLFdBQVcsRUFBRTtDQUM1RCxDQUFDLENBQUM7QUFFSCxtQkFBbUI7QUFDbkIsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRWxELHlCQUF5QjtBQUN6QixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQzlDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDakQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBIYWxsdWNpZml4TmV0d29ya1N0YWNrIH0gZnJvbSAnLi4vbGliL25ldHdvcmstc3RhY2snO1xuaW1wb3J0IHsgSGFsbHVjaWZpeERhdGFiYXNlU3RhY2sgfSBmcm9tICcuLi9saWIvZGF0YWJhc2Utc3RhY2snO1xuaW1wb3J0IHsgSGFsbHVjaWZpeENvbXB1dGVTdGFjayB9IGZyb20gJy4uL2xpYi9jb21wdXRlLXN0YWNrJztcbmltcG9ydCB7IEhhbGx1Y2lmaXhTdG9yYWdlU3RhY2sgfSBmcm9tICcuLi9saWIvc3RvcmFnZS1zdGFjayc7XG5pbXBvcnQgeyBIYWxsdWNpZml4Q29nbml0b1N0YWNrIH0gZnJvbSAnLi4vbGliL2NvZ25pdG8tc3RhY2snO1xuaW1wb3J0IHsgSGFsbHVjaWZpeENhY2hlTW9uaXRvcmluZ1N0YWNrIH0gZnJvbSAnLi4vbGliL2NhY2hlLW1vbml0b3Jpbmctc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG5jb25zdCBlbnYgPSB7XG4gIGFjY291bnQ6ICcxMzUxNjc3MTAwNDInLFxuICByZWdpb246ICd1cy1lYXN0LTEnXG59O1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0IG9yIGRlZmF1bHQgdG8gJ2RldidcbmNvbnN0IGVudmlyb25tZW50ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52aXJvbm1lbnQnKSB8fCAnZGV2JztcblxuLy8gTmV0d29yayBTdGFjayAtIFZQQywgc3VibmV0cywgc2VjdXJpdHkgZ3JvdXBzXG5jb25zdCBuZXR3b3JrU3RhY2sgPSBuZXcgSGFsbHVjaWZpeE5ldHdvcmtTdGFjayhhcHAsIGBIYWxsdWNpZml4LU5ldHdvcmstJHtlbnZpcm9ubWVudH1gLCB7XG4gIGVudixcbiAgZW52aXJvbm1lbnQsXG4gIGRlc2NyaXB0aW9uOiBgSGFsbHVjaUZpeCBOZXR3b3JrIEluZnJhc3RydWN0dXJlIC0gJHtlbnZpcm9ubWVudH1gXG59KTtcblxuLy8gU3RvcmFnZSBTdGFjayAtIFMzLCBDbG91ZEZyb250IChDbG91ZEZyb250IGRpc2FibGVkIHVudGlsIGFjY291bnQgdmVyaWZpY2F0aW9uKVxuY29uc3Qgc3RvcmFnZVN0YWNrID0gbmV3IEhhbGx1Y2lmaXhTdG9yYWdlU3RhY2soYXBwLCBgSGFsbHVjaWZpeC1TdG9yYWdlLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnYsXG4gIGVudmlyb25tZW50LFxuICB2cGM6IG5ldHdvcmtTdGFjay52cGMsXG4gIGVuYWJsZUNsb3VkRnJvbnQ6IGZhbHNlLCAvLyBEaXNhYmxlIHVudGlsIEFXUyBhY2NvdW50IGlzIHZlcmlmaWVkXG4gIGRlc2NyaXB0aW9uOiBgSGFsbHVjaUZpeCBTdG9yYWdlIEluZnJhc3RydWN0dXJlIC0gJHtlbnZpcm9ubWVudH1gXG59KTtcblxuLy8gRGF0YWJhc2UgU3RhY2sgLSBSRFMsIEVsYXN0aUNhY2hlXG5jb25zdCBkYXRhYmFzZVN0YWNrID0gbmV3IEhhbGx1Y2lmaXhEYXRhYmFzZVN0YWNrKGFwcCwgYEhhbGx1Y2lmaXgtRGF0YWJhc2UtJHtlbnZpcm9ubWVudH1gLCB7XG4gIGVudixcbiAgZW52aXJvbm1lbnQsXG4gIHZwYzogbmV0d29ya1N0YWNrLnZwYyxcbiAgZGF0YWJhc2VTZWN1cml0eUdyb3VwOiBuZXR3b3JrU3RhY2suZGF0YWJhc2VTZWN1cml0eUdyb3VwLFxuICBjYWNoZVNlY3VyaXR5R3JvdXA6IG5ldHdvcmtTdGFjay5jYWNoZVNlY3VyaXR5R3JvdXAsXG4gIGRlc2NyaXB0aW9uOiBgSGFsbHVjaUZpeCBEYXRhYmFzZSBJbmZyYXN0cnVjdHVyZSAtICR7ZW52aXJvbm1lbnR9YFxufSk7XG5cbi8vIENvZ25pdG8gU3RhY2sgLSBVc2VyIFBvb2wsIElkZW50aXR5IFBvb2wsIE9BdXRoIChzZXBhcmF0ZSBmcm9tIGNvbXB1dGUgZm9yIGVhc2llciBtYW5hZ2VtZW50KVxuY29uc3QgY29nbml0b1N0YWNrID0gbmV3IEhhbGx1Y2lmaXhDb2duaXRvU3RhY2soYXBwLCBgSGFsbHVjaWZpeC1Db2duaXRvLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnYsXG4gIGVudmlyb25tZW50LFxuICB1c2VSZWFsR29vZ2xlQ3JlZGVudGlhbHM6IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ3VzZVJlYWxHb29nbGVDcmVkZW50aWFscycpID09PSAndHJ1ZScsXG4gIGRlc2NyaXB0aW9uOiBgSGFsbHVjaUZpeCBDb2duaXRvIEF1dGhlbnRpY2F0aW9uIC0gJHtlbnZpcm9ubWVudH1gXG59KTtcblxuLy8gQ29tcHV0ZSBTdGFjayAtIExhbWJkYSwgQVBJIEdhdGV3YXlcbmNvbnN0IGNvbXB1dGVTdGFjayA9IG5ldyBIYWxsdWNpZml4Q29tcHV0ZVN0YWNrKGFwcCwgYEhhbGx1Y2lmaXgtQ29tcHV0ZS0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52LFxuICBlbnZpcm9ubWVudCxcbiAgdnBjOiBuZXR3b3JrU3RhY2sudnBjLFxuICBsYW1iZGFTZWN1cml0eUdyb3VwOiBuZXR3b3JrU3RhY2subGFtYmRhU2VjdXJpdHlHcm91cCxcbiAgZGF0YWJhc2U6IGRhdGFiYXNlU3RhY2suZGF0YWJhc2UsXG4gIGNhY2hlOiBkYXRhYmFzZVN0YWNrLmNhY2hlLFxuICBidWNrZXQ6IHN0b3JhZ2VTdGFjay5idWNrZXQsXG4gIGRpc3RyaWJ1dGlvbjogc3RvcmFnZVN0YWNrLmRpc3RyaWJ1dGlvbixcbiAgZGVzY3JpcHRpb246IGBIYWxsdWNpRml4IENvbXB1dGUgSW5mcmFzdHJ1Y3R1cmUgLSAke2Vudmlyb25tZW50fWBcbn0pO1xuXG4vLyBDYWNoZSBNb25pdG9yaW5nIFN0YWNrIC0gQ2xvdWRXYXRjaCBtb25pdG9yaW5nIGZvciBFbGFzdGlDYWNoZVxuY29uc3QgY2FjaGVNb25pdG9yaW5nU3RhY2sgPSBuZXcgSGFsbHVjaWZpeENhY2hlTW9uaXRvcmluZ1N0YWNrKGFwcCwgYEhhbGx1Y2lmaXgtQ2FjaGVNb25pdG9yaW5nLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnYsXG4gIGVudmlyb25tZW50LFxuICBjYWNoZUNsdXN0ZXI6IGRhdGFiYXNlU3RhY2suY2FjaGUsXG4gIGFsZXJ0RW1haWw6IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2FsZXJ0RW1haWwnKSxcbiAgZGVzY3JpcHRpb246IGBIYWxsdWNpRml4IENhY2hlIE1vbml0b3JpbmcgLSAke2Vudmlyb25tZW50fWBcbn0pO1xuXG4vLyBBZGQgZGVwZW5kZW5jaWVzXG5jYWNoZU1vbml0b3JpbmdTdGFjay5hZGREZXBlbmRlbmN5KGRhdGFiYXNlU3RhY2spO1xuXG4vLyBBZGQgdGFncyB0byBhbGwgc3RhY2tzXG5jZGsuVGFncy5vZihhcHApLmFkZCgnUHJvamVjdCcsICdIYWxsdWNpRml4Jyk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnTWFuYWdlZEJ5JywgJ0NESycpOyJdfQ==