# TypeScript Compilation Troubleshooting Guide

**Purpose:** Quick reference for resolving TypeScript compilation issues in AWS CDK infrastructure  
**Audience:** Developers, DevOps Engineers, Infrastructure Team  
**Last Updated:** November 1, 2025

## Quick Diagnosis

### Step 1: Run Compilation Check
```bash
cd infrastructure
npx tsc --noEmit
```

### Step 2: Identify Error Category
Look for these common error patterns:

| Error Code | Category | Quick Fix |
|------------|----------|-----------|
| TS2307 | Import Resolution | Check import paths |
| TS2339 | Property Missing | Update to current API |
| TS2540 | Readonly Property | Use constructor initialization |
| TS2353 | Unknown Property | Remove deprecated properties |
| TS7006 | Implicit Any | Add type annotations |

## Common Error Patterns and Solutions

### Import Resolution Errors (TS2307)

#### Error: Cannot find module 'aws-events-targets'
```typescript
// ❌ Error
import { SnsAction } from 'aws-cloudwatch';

// ✅ Solution
import { SnsAction } from 'aws-events-targets';
```

#### Error: Cannot find module '../common/elastiCacheService'
```typescript
// ❌ Error
import { elastiCacheService } from '../common/elastiCacheService';

// ✅ Solution - Check if file exists or update path
import { elastiCacheService } from './elastiCacheService';
```

### AWS CDK API Compatibility (TS2339)

#### Error: Property 'SnsAction' does not exist
```typescript
// ❌ Error
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
// Using: cloudwatch.SnsAction

// ✅ Solution
import { SnsAction } from 'aws-cdk-lib/aws-events-targets';
```

#### Error: Property 'ScalingPolicy' does not exist
```typescript
// ❌ Error
import { ScalingPolicy } from 'aws-cdk-lib/aws-applicationautoscaling';

// ✅ Solution
import { CfnScalingPolicy } from 'aws-cdk-lib/aws-applicationautoscaling';
```

#### Error: Property 'metricConcurrentExecutions' does not exist
```typescript
// ❌ Error
lambdaFunction.metricConcurrentExecutions()

// ✅ Solution
lambdaFunction.metric('ConcurrentExecutions')
```

### Readonly Property Violations (TS2540)

#### Error: Cannot assign to readonly property
```typescript
// ❌ Error
export class MyStack extends Stack {
  public readonly myTopic: sns.Topic;
  
  constructor() {
    this.myTopic = new sns.Topic(this, 'Topic'); // Error here
  }
}

// ✅ Solution 1: Constructor initialization
export class MyStack extends Stack {
  public readonly myTopic: sns.Topic;
  
  constructor() {
    this.myTopic = new sns.Topic(this, 'Topic');
  }
}

// ✅ Solution 2: Declare and initialize
export class MyStack extends Stack {
  public readonly myTopic = new sns.Topic(this, 'Topic');
}
```

### Configuration Property Errors (TS2353)

#### Error: 'messageRetentionPeriod' does not exist
```typescript
// ❌ Error
new sqs.Queue(this, 'Queue', {
  messageRetentionPeriod: Duration.days(14)
});

// ✅ Solution
new sqs.Queue(this, 'Queue', {
  retentionPeriod: Duration.days(14)
});
```

#### Error: 'keyRotation' does not exist
```typescript
// ❌ Error
new kms.Key(this, 'Key', {
  keyRotation: kms.KeyRotation.ENABLED
});

// ✅ Solution - Remove deprecated property
new kms.Key(this, 'Key', {
  // Key rotation is managed by AWS by default
});
```

#### Error: 'publicWriteAccess' does not exist
```typescript
// ❌ Error
new s3.Bucket(this, 'Bucket', {
  publicWriteAccess: false
});

// ✅ Solution
new s3.Bucket(this, 'Bucket', {
  publicReadAccess: false
});
```

### Type Definition Errors (TS7006)

#### Error: Parameter implicitly has 'any' type
```typescript
// ❌ Error
array.forEach((item, index) => {
  // Error on 'item' and 'index'
});

// ✅ Solution
array.forEach((item: any, index: number) => {
  // Explicitly typed parameters
});
```

### AWS SDK Integration Errors

#### Error: AWS SDK v3 import issues
```typescript
// ❌ Error
import { CreateDBProxyTargetGroupCommand } from '@aws-sdk/client-rds';

// ✅ Solution - Check AWS SDK v3 documentation
import { DescribeDBProxyTargetGroupsCommand } from '@aws-sdk/client-rds';
```

## Systematic Debugging Process

### 1. Environment Check
```bash
# Check Node.js version
node --version  # Should be 18.x or later

# Check CDK version
npx cdk --version  # Should be 2.x

# Check TypeScript version
npx tsc --version

# Check dependencies
npm list aws-cdk-lib
```

### 2. Incremental Validation
```bash
# Test single file
npx tsc --noEmit --skipLibCheck "lib/specific-stack.ts"

# Test without library checks (faster)
npx tsc --noEmit --skipLibCheck

# Full compilation
npx tsc --noEmit
```

### 3. CDK Validation
```bash
# List stacks (requires successful compilation)
npx cdk list

# Synthesize (generates CloudFormation)
npx cdk synth

# Check for changes
npx cdk diff
```

## IDE-Specific Solutions

### Visual Studio Code
1. **Install Extensions:**
   - TypeScript and JavaScript Language Features
   - AWS CDK Snippets
   - ESLint

2. **Settings:**
   ```json
   {
     "typescript.preferences.includePackageJsonAutoImports": "on",
     "typescript.suggest.autoImports": true,
     "typescript.updateImportsOnFileMove.enabled": "always"
   }
   ```

3. **Reload TypeScript Service:**
   - Cmd/Ctrl + Shift + P
   - "TypeScript: Reload Projects"

### IntelliJ IDEA / WebStorm
1. **Enable TypeScript Service**
2. **Configure Node.js Interpreter**
3. **Enable ESLint Integration**
4. **Invalidate Caches and Restart** if needed

## Performance Optimization

### Compilation Speed
```bash
# Skip library type checking for development
npx tsc --noEmit --skipLibCheck

# Increase memory for large projects
export NODE_OPTIONS="--max-old-space-size=4096"
npx tsc --noEmit
```

### Watch Mode
```bash
# Continuous compilation checking
npx tsc --noEmit --watch --skipLibCheck
```

## Emergency Fixes

### Quick Bypass (Development Only)
```typescript
// Temporary fix for urgent deployments
// @ts-ignore
problematicCode();

// Better: Use type assertion
(problematicCode as any)();
```

**⚠️ Warning:** Never commit @ts-ignore to production code.

### Rollback Strategy
```bash
# If fixes break functionality
git checkout HEAD~1 -- lib/problematic-file.ts

# Or revert specific commit
git revert <commit-hash>
```

## Prevention Strategies

### Pre-commit Hooks
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npx tsc --noEmit"
    }
  }
}
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: TypeScript Check
  run: |
    cd infrastructure
    npx tsc --noEmit
```

### Regular Maintenance
1. **Weekly:** Check for CDK updates
2. **Monthly:** Update dependencies
3. **Quarterly:** Review deprecated APIs

## Getting Help

### Resources
1. **AWS CDK Documentation:** https://docs.aws.amazon.com/cdk/
2. **TypeScript Handbook:** https://www.typescriptlang.org/docs/
3. **AWS CDK GitHub Issues:** https://github.com/aws/aws-cdk/issues

### Internal Escalation
1. Check this troubleshooting guide
2. Search internal documentation
3. Consult with infrastructure team
4. Create detailed issue with error logs

### Issue Template
```
**Error Type:** [Compilation/CDK/Runtime]
**File:** [path/to/file.ts]
**Error Message:** [Full error message]
**CDK Version:** [Output of npx cdk --version]
**Node Version:** [Output of node --version]
**Steps to Reproduce:** [Detailed steps]
**Expected Behavior:** [What should happen]
**Actual Behavior:** [What actually happens]
```

## Appendix: Common Import Mappings

### CDK v1 to v2 Migration
```typescript
// Old CDK v1 imports
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';

// New CDK v2 imports
import { Stack, StackProps } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
```

### Frequently Updated Imports
```typescript
// CloudWatch Actions
import { SnsAction } from 'aws-cdk-lib/aws-events-targets';

// Application Auto Scaling
import { CfnScalingPolicy } from 'aws-cdk-lib/aws-applicationautoscaling';

// Lambda Destinations
import { LambdaDestination } from 'aws-cdk-lib/aws-logs-destinations';
```

---

**Remember:** Always test fixes in a development environment before applying to production infrastructure.