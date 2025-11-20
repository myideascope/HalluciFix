#!/usr/bin/env node

/**
 * HalluciFix Environment Verification Script
 * 
 * This script verifies that all required environment variables are properly
 * configured for the production environment, especially for server-side components.
 */

const fs = require('fs');
const path = require('path');

// Required environment variables for different components
const REQUIRED_VARS = {
  // Core Application
  CORE: [
    'NODE_ENV',
    'AWS_REGION',
    'VITE_AWS_REGION'
  ],
  
  // Authentication
  AUTH: [
    'VITE_AWS_USER_POOL_ID',
    'VITE_AWS_USER_POOL_CLIENT_ID',
    'VITE_AWS_IDENTITY_POOL_ID',
    'VITE_AWS_USER_POOL_DOMAIN'
  ],
  
  // Database
  DATABASE: [
    'DATABASE_URL',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_SSL'
  ],
  
  // API Gateway
  API: [
    'VITE_AWS_API_GATEWAY_URL',
    'VITE_API_BASE_URL'
  ],
  
  // Storage
  STORAGE: [
    'VITE_AWS_S3_BUCKET',
    'VITE_CLOUDFRONT_DOMAIN'
  ],
  
  // Lambda Functions (Server-side)
  LAMBDA: [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USERNAME',
    'DB_PASSWORD',
    'AWS_REGION',
    'DB_SECRET_ARN'
  ]
};

// Environment variable patterns
const PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  AWS_REGION: /^(us|eu|ap|ca|sa|af)\-[a-z]+-\d+$/,
  URL: /^https?:\/\/.+/,
  S3_BUCKET: /^[a-z0-9.-]+$/,
  RDS_ENDPOINT: /^[a-z0-9.-]+\.rds\.amazonaws\.com$/,
  SECRET_ARN: /^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:.+/,
  IDENTITY_POOL: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
};

class EnvironmentVerifier {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: [],
      missing: [],
      invalid: []
    };
  }

  loadEnvironmentFile(filePath) {
    console.log(`🔍 Loading environment file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Environment file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const envVars = {};

    // Parse environment file
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim().replace(/["']/g, '');
        envVars[key.trim()] = value;
      }
    });

    return envVars;
  }

  validateCoreVariables(envVars) {
    console.log('\n🔧 Validating Core Application Variables...');
    
    REQUIRED_VARS.CORE.forEach(varName => {
      const value = envVars[varName];
      
      if (!value) {
        this.results.missing.push({ var: varName, category: 'CORE', reason: 'Missing' });
        return;
      }

      switch (varName) {
        case 'NODE_ENV':
          if (!['development', 'staging', 'production'].includes(value)) {
            this.results.invalid.push({ var: varName, value, category: 'CORE', reason: 'Invalid environment' });
          }
          break;
        case 'AWS_REGION':
        case 'VITE_AWS_REGION':
          if (!PATTERNS.AWS_REGION.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'CORE', reason: 'Invalid AWS region format' });
          }
          break;
      }

      if (this.results.missing.filter(r => r.var === varName).length === 0 && 
          this.results.invalid.filter(r => r.var === varName).length === 0) {
        this.results.passed.push({ var: varName, value: value.length > 10 ? value.substring(0, 10) + '...' : value, category: 'CORE' });
      }
    });
  }

  validateAuthVariables(envVars) {
    console.log('\n🔐 Validating Authentication Variables...');
    
    REQUIRED_VARS.AUTH.forEach(varName => {
      const value = envVars[varName];
      
      if (!value) {
        this.results.missing.push({ var: varName, category: 'AUTH', reason: 'Missing' });
        return;
      }

      switch (varName) {
        case 'VITE_AWS_USER_POOL_ID':
          if (!PATTERNS.UUID.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'AUTH', reason: 'Invalid UUID format' });
          }
          break;
        case 'VITE_AWS_USER_POOL_CLIENT_ID':
          // Client ID should be alphanumeric with dashes
          if (!/^[a-zA-Z0-9-]+$/.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'AUTH', reason: 'Invalid client ID format' });
          }
          break;
        case 'VITE_AWS_IDENTITY_POOL_ID':
          if (!PATTERNS.IDENTITY_POOL.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'AUTH', reason: 'Invalid identity pool format' });
          }
          break;
        case 'VITE_AWS_USER_POOL_DOMAIN':
          if (!value.includes('.auth.') || !value.endsWith('.amazoncognito.com')) {
            this.results.invalid.push({ var: varName, value, category: 'AUTH', reason: 'Invalid Cognito domain format' });
          }
          break;
      }

      if (this.results.missing.filter(r => r.var === varName).length === 0 && 
          this.results.invalid.filter(r => r.var === varName).length === 0) {
        this.results.passed.push({ var: varName, value: value.length > 20 ? value.substring(0, 20) + '...' : value, category: 'AUTH' });
      }
    });
  }

  validateDatabaseVariables(envVars) {
    console.log('\n🗄️ Validating Database Variables...');
    
    REQUIRED_VARS.DATABASE.forEach(varName => {
      const value = envVars[varName];
      
      if (!value) {
        this.results.missing.push({ var: varName, category: 'DATABASE', reason: 'Missing' });
        return;
      }

      switch (varName) {
        case 'DATABASE_URL':
          if (!value.includes('postgresql://')) {
            this.results.invalid.push({ var: varName, value, category: 'DATABASE', reason: 'Invalid PostgreSQL URL format' });
          }
          break;
        case 'DB_HOST':
          if (!PATTERNS.RDS_ENDPOINT.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'DATABASE', reason: 'Invalid RDS endpoint format' });
          }
          break;
        case 'DB_PORT':
          const port = parseInt(value);
          if (isNaN(port) || port < 1 || port > 65535) {
            this.results.invalid.push({ var: varName, value, category: 'DATABASE', reason: 'Invalid port number' });
          }
          break;
        case 'DB_NAME':
          if (value.length < 1) {
            this.results.invalid.push({ var: varName, value, category: 'DATABASE', reason: 'Database name cannot be empty' });
          }
          break;
        case 'DB_USERNAME':
          if (value.length < 1) {
            this.results.invalid.push({ var: varName, value, category: 'DATABASE', reason: 'Username cannot be empty' });
          }
          break;
        case 'DB_PASSWORD':
          if (value.length < 8) {
            this.results.warnings.push({ var: varName, value: '***', category: 'DATABASE', reason: 'Password should be at least 8 characters' });
          }
          // Always mask passwords in output
          this.results.passed.push({ var: varName, value: '***', category: 'DATABASE' });
          return;
        case 'DB_SSL':
          if (!['true', 'false'].includes(value)) {
            this.results.invalid.push({ var: varName, value, category: 'DATABASE', reason: 'SSL must be true or false' });
          }
          break;
      }

      if (this.results.missing.filter(r => r.var === varName).length === 0 && 
          this.results.invalid.filter(r => r.var === varName).length === 0) {
        this.results.passed.push({ var: varName, value: value.length > 15 ? value.substring(0, 15) + '...' : value, category: 'DATABASE' });
      }
    });
  }

  validateApiVariables(envVars) {
    console.log('\n🌐 Validating API Gateway Variables...');
    
    REQUIRED_VARS.API.forEach(varName => {
      const value = envVars[varName];
      
      if (!value) {
        this.results.missing.push({ var: varName, category: 'API', reason: 'Missing' });
        return;
      }

      if (!PATTERNS.URL.test(value)) {
        this.results.invalid.push({ var: varName, value, category: 'API', reason: 'Invalid URL format' });
      }

      if (this.results.missing.filter(r => r.var === varName).length === 0 && 
          this.results.invalid.filter(r => r.var === varName).length === 0) {
        this.results.passed.push({ var: varName, value: value.length > 30 ? value.substring(0, 30) + '...' : value, category: 'API' });
      }
    });
  }

  validateStorageVariables(envVars) {
    console.log('\n📦 Validating Storage Variables...');
    
    REQUIRED_VARS.STORAGE.forEach(varName => {
      const value = envVars[varName];
      
      if (!value) {
        this.results.missing.push({ var: varName, category: 'STORAGE', reason: 'Missing' });
        return;
      }

      switch (varName) {
        case 'VITE_AWS_S3_BUCKET':
          if (!PATTERNS.S3_BUCKET.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'STORAGE', reason: 'Invalid S3 bucket name format' });
          }
          break;
        case 'VITE_CLOUDFRONT_DOMAIN':
          if (!value.includes('.cloudfront.net')) {
            this.results.invalid.push({ var: varName, value, category: 'STORAGE', reason: 'Invalid CloudFront domain format' });
          }
          break;
      }

      if (this.results.missing.filter(r => r.var === varName).length === 0 && 
          this.results.invalid.filter(r => r.var === varName).length === 0) {
        this.results.passed.push({ var: varName, value: value.length > 25 ? value.substring(0, 25) + '...' : value, category: 'STORAGE' });
      }
    });
  }

  validateLambdaVariables(envVars) {
    console.log('\n⚡ Validating Lambda Function Variables...');
    
    REQUIRED_VARS.LAMBDA.forEach(varName => {
      const value = envVars[varName];
      
      if (!value) {
        this.results.missing.push({ var: varName, category: 'LAMBDA', reason: 'Missing for Lambda functions' });
        return;
      }

      switch (varName) {
        case 'DB_SECRET_ARN':
          if (!PATTERNS.SECRET_ARN.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'LAMBDA', reason: 'Invalid Secrets Manager ARN format' });
          }
          break;
        case 'AWS_REGION':
          if (!PATTERNS.AWS_REGION.test(value)) {
            this.results.invalid.push({ var: varName, value, category: 'LAMBDA', reason: 'Invalid AWS region format' });
          }
          break;
      }

      if (this.results.missing.filter(r => r.var === varName).length === 0 && 
          this.results.invalid.filter(r => r.var === varName).length === 0) {
        this.results.passed.push({ var: varName, value: value.length > 20 ? value.substring(0, 20) + '...' : value, category: 'LAMBDA' });
      }
    });
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 ENVIRONMENT VERIFICATION REPORT');
    console.log('='.repeat(80));
    
    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`   ✅ Passed: ${this.results.passed.length}`);
    console.log(`   ❌ Failed: ${this.results.failed.length}`);
    console.log(`   ⚠️  Warnings: ${this.results.warnings.length}`);
    console.log(`   ❓ Missing: ${this.results.missing.length}`);
    console.log(`   🚫 Invalid: ${this.results.invalid.length}`);
    
    const totalChecks = this.results.passed.length + this.results.missing.length + this.results.invalid.length;
    const successRate = totalChecks > 0 ? Math.round((this.results.passed.length / totalChecks) * 100) : 0;
    console.log(`   📈 Success Rate: ${successRate}%`);
    
    // Passed variables
    if (this.results.passed.length > 0) {
      console.log('\n✅ PASSED VARIABLES:');
      this.results.passed.forEach(result => {
        console.log(`   ${result.category.padEnd(10)} | ${result.var.padEnd(30)} | ${result.value}`);
      });
    }
    
    // Missing variables
    if (this.results.missing.length > 0) {
      console.log('\n❌ MISSING VARIABLES:');
      this.results.missing.forEach(result => {
        console.log(`   ${result.category.padEnd(10)} | ${result.var.padEnd(30)} | ${result.reason}`);
      });
    }
    
    // Invalid variables
    if (this.results.invalid.length > 0) {
      console.log('\n🚫 INVALID VARIABLES:');
      this.results.invalid.forEach(result => {
        console.log(`   ${result.category.padEnd(10)} | ${result.var.padEnd(30)} | ${result.reason} (got: "${result.value}")`);
      });
    }
    
    // Warnings
    if (this.results.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.results.warnings.forEach(result => {
        console.log(`   ${result.category.padEnd(10)} | ${result.var.padEnd(30)} | ${result.reason}`);
      });
    }
    
    // Overall assessment
    console.log('\n' + '='.repeat(80));
    console.log('🎯 OVERALL ASSESSMENT:');
    
    const hasCriticalIssues = this.results.missing.length > 0 || this.results.invalid.length > 0;
    
    if (!hasCriticalIssues && successRate >= 95) {
      console.log('   🎉 ENVIRONMENT IS PRODUCTION-READY!');
      console.log('   ✅ All critical variables are properly configured');
      console.log('   ✅ Server-side components will have access to required environment variables');
    } else if (!hasCriticalIssues && successRate >= 80) {
      console.log('   ✅ ENVIRONMENT IS MOSTLY READY');
      console.log('   ⚠️  Some minor issues should be addressed before production');
    } else {
      console.log('   ❌ ENVIRONMENT NEEDS ATTENTION');
      console.log('   🔧 Critical issues must be resolved before production deployment');
    }
    
    console.log('='.repeat(80));
    
    return !hasCriticalIssues;
  }

  async verifyEnvironment(filePath = '.env.production') {
    console.log('🚀 HalluciFix Environment Verification');
    console.log('='.repeat(50));
    
    try {
      const envVars = this.loadEnvironmentFile(filePath);
      
      // Run all validations
      this.validateCoreVariables(envVars);
      this.validateAuthVariables(envVars);
      this.validateDatabaseVariables(envVars);
      this.validateApiVariables(envVars);
      this.validateStorageVariables(envVars);
      this.validateLambdaVariables(envVars);
      
      // Generate report
      const isReady = this.generateReport();
      
      return {
        success: isReady,
        results: this.results,
        summary: {
          passed: this.results.passed.length,
          failed: this.results.failed.length,
          warnings: this.results.warnings.length,
          missing: this.results.missing.length,
          invalid: this.results.invalid.length,
          successRate: Math.round((this.results.passed.length / (this.results.passed.length + this.results.missing.length + this.results.invalid.length)) * 100)
        }
      };
      
    } catch (error) {
      console.error(`❌ Error verifying environment: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

// CLI interface
async function main() {
  const filePath = process.argv[2] || '.env.production';
  
  const verifier = new EnvironmentVerifier();
  const result = await verifier.verifyEnvironment(filePath);
  
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { EnvironmentVerifier };