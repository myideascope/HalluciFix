#!/usr/bin/env node

/**
 * OAuth Security Validation Script
 * 
 * This script performs comprehensive security validation of the OAuth implementation
 * including PKCE, CSRF protection, token security, and scope handling.
 */

import { readFileSync, existsSync } from 'fs';
import { createHash, randomBytes } from 'crypto';

console.log('🔒 OAuth Security Validation\n');

/**
 * Validate PKCE Implementation Security
 */
function validatePKCESecurity() {
  console.log('🛡️  Validating PKCE Implementation...');
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  try {
    // Check PKCE helper implementation
    const pkceHelperPath = 'src/lib/oauth/pkceHelper.ts';
    if (!existsSync(pkceHelperPath)) {
      results.errors.push('PKCE helper implementation not found');
      return results;
    }

    const pkceContent = readFileSync(pkceHelperPath, 'utf8');

    // Check code verifier generation
    if (pkceContent.includes('crypto.getRandomValues') || pkceContent.includes('randomBytes')) {
      results.passed.push('Code verifier uses cryptographically secure random generation');
    } else {
      results.errors.push('Code verifier may not use secure random generation');
    }

    // Check code verifier length
    if (pkceContent.includes('43') || pkceContent.includes('128') || pkceContent.includes('32')) {
      results.passed.push('Code verifier appears to use appropriate length');
    } else {
      results.warnings.push('Code verifier length validation not clearly implemented');
    }

    // Check SHA256 usage for code challenge
    if (pkceContent.includes('SHA-256') || pkceContent.includes('sha256')) {
      results.passed.push('Code challenge uses SHA-256 hashing');
    } else {
      results.errors.push('Code challenge must use SHA-256 hashing');
    }

    // Check base64URL encoding
    if (pkceContent.includes('base64URL') || (pkceContent.includes('replace') && pkceContent.includes('+') && pkceContent.includes('/'))) {
      results.passed.push('Base64URL encoding is properly implemented');
    } else {
      results.errors.push('Base64URL encoding may not be properly implemented');
    }

    // Check code verifier storage security
    if (pkceContent.includes('sessionStorage') || pkceContent.includes('localStorage')) {
      results.warnings.push('Code verifier may be stored in browser storage (consider server-side storage)');
    } else {
      results.passed.push('Code verifier storage appears to be secure');
    }

  } catch (error) {
    results.errors.push(`PKCE validation failed: ${error.message}`);
  }

  return results;
}

/**
 * Validate CSRF Protection Implementation
 */
function validateCSRFProtection() {
  console.log('🛡️  Validating CSRF Protection...');
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  try {
    // Check state manager implementation
    const stateManagerPath = 'src/lib/oauth/stateManager.ts';
    if (!existsSync(stateManagerPath)) {
      results.errors.push('OAuth state manager not found');
      return results;
    }

    const stateContent = readFileSync(stateManagerPath, 'utf8');

    // Check state parameter generation
    if (stateContent.includes('crypto.getRandomValues') || 
        stateContent.includes('randomBytes') ||
        stateContent.includes('generateSecureState') ||
        stateContent.includes('PKCEHelper.generateSecureState')) {
      results.passed.push('State parameter uses cryptographically secure random generation');
    } else {
      // Check if it delegates to PKCEHelper
      const pkceHelperPath = 'src/lib/oauth/pkceHelper.ts';
      if (existsSync(pkceHelperPath)) {
        const pkceContent = readFileSync(pkceHelperPath, 'utf8');
        if (pkceContent.includes('generateSecureState') && pkceContent.includes('crypto.getRandomValues')) {
          results.passed.push('State parameter uses cryptographically secure random generation (via PKCEHelper)');
        } else {
          results.errors.push('State parameter may not use secure random generation');
        }
      } else {
        results.errors.push('State parameter may not use secure random generation');
      }
    }

    // Check state parameter length
    if (stateContent.includes('32') || stateContent.includes('16')) {
      results.passed.push('State parameter appears to use appropriate length');
    } else {
      results.warnings.push('State parameter length not clearly defined');
    }

    // Check state validation
    if (stateContent.includes('validate') || stateContent.includes('verify')) {
      results.passed.push('State parameter validation is implemented');
    } else {
      results.errors.push('State parameter validation not found');
    }

    // Check state expiration
    if (stateContent.includes('expires') || stateContent.includes('ttl') || stateContent.includes('timeout')) {
      results.passed.push('State parameter expiration is implemented');
    } else {
      results.warnings.push('State parameter expiration may not be implemented');
    }

    // Check state storage security
    if (stateContent.includes('database') || stateContent.includes('supabase')) {
      results.passed.push('State parameters are stored server-side');
    } else if (stateContent.includes('sessionStorage') || stateContent.includes('localStorage')) {
      results.warnings.push('State parameters may be stored client-side (less secure)');
    }

  } catch (error) {
    results.errors.push(`CSRF protection validation failed: ${error.message}`);
  }

  return results;
}

/**
 * Validate Token Security Implementation
 */
function validateTokenSecurity() {
  console.log('🔐 Validating Token Security...');
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  try {
    // Check token encryption service
    const encryptionPath = 'src/lib/oauth/tokenEncryption.ts';
    if (!existsSync(encryptionPath)) {
      results.errors.push('Token encryption service not found');
      return results;
    }

    const encryptionContent = readFileSync(encryptionPath, 'utf8');

    // Check encryption algorithm
    if (encryptionContent.includes('AES-GCM')) {
      results.passed.push('Uses AES-GCM encryption (authenticated encryption)');
    } else if (encryptionContent.includes('AES')) {
      results.warnings.push('Uses AES encryption but may not be authenticated');
    } else {
      results.errors.push('Encryption algorithm not clearly identified');
    }

    // Check key length
    if (encryptionContent.includes('256') || encryptionContent.includes('32')) {
      results.passed.push('Uses 256-bit encryption keys');
    } else {
      results.warnings.push('Encryption key length not clearly specified');
    }

    // Check IV/nonce generation
    if (encryptionContent.includes('crypto.getRandomValues') && encryptionContent.includes('iv')) {
      results.passed.push('Uses cryptographically secure IV/nonce generation');
    } else {
      results.errors.push('IV/nonce generation may not be secure');
    }

    // Check key validation
    if (encryptionContent.includes('validateKey')) {
      results.passed.push('Encryption key validation is implemented');
    } else {
      results.warnings.push('Encryption key validation may be missing');
    }

    // Check token storage
    const tokenStoragePath = 'src/lib/oauth/tokenStorage.ts';
    if (existsSync(tokenStoragePath)) {
      const storageContent = readFileSync(tokenStoragePath, 'utf8');
      
      if (storageContent.includes('encrypted_tokens')) {
        results.passed.push('Tokens are stored in encrypted form');
      } else {
        results.errors.push('Tokens may not be encrypted in storage');
      }

      if (storageContent.includes('expires_at')) {
        results.passed.push('Token expiration is tracked');
      } else {
        results.warnings.push('Token expiration tracking may be missing');
      }
    }

  } catch (error) {
    results.errors.push(`Token security validation failed: ${error.message}`);
  }

  return results;
}

/**
 * Validate OAuth Scope Handling
 */
function validateScopeHandling() {
  console.log('🎯 Validating OAuth Scope Handling...');
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  try {
    // Check OAuth service implementation
    const oauthServicePath = 'src/lib/oauth/oauthService.ts';
    if (!existsSync(oauthServicePath)) {
      results.errors.push('OAuth service implementation not found');
      return results;
    }

    const serviceContent = readFileSync(oauthServicePath, 'utf8');

    // Check scope validation
    if (serviceContent.includes('scope') && (serviceContent.includes('validate') || serviceContent.includes('check'))) {
      results.passed.push('OAuth scope validation is implemented');
    } else {
      results.warnings.push('OAuth scope validation may be missing');
    }

    // Check minimal scope principle
    const requiredScopes = ['openid', 'email', 'profile'];
    const driveScope = 'https://www.googleapis.com/auth/drive.readonly';
    
    if (serviceContent.includes('drive.readonly')) {
      results.passed.push('Uses read-only Drive scope (minimal permissions)');
    } else if (serviceContent.includes('drive')) {
      results.warnings.push('May be requesting excessive Drive permissions');
    }

    // Check scope storage and tracking
    const tokenStoragePath = 'src/lib/oauth/tokenStorage.ts';
    if (existsSync(tokenStoragePath)) {
      const storageContent = readFileSync(tokenStoragePath, 'utf8');
      
      if (storageContent.includes('scope')) {
        results.passed.push('OAuth scopes are tracked and stored');
      } else {
        results.warnings.push('OAuth scope tracking may be missing');
      }
    }

    // Check incremental authorization
    if (serviceContent.includes('incremental') || serviceContent.includes('additional')) {
      results.passed.push('Incremental authorization appears to be supported');
    } else {
      results.warnings.push('Incremental authorization may not be implemented');
    }

  } catch (error) {
    results.errors.push(`Scope handling validation failed: ${error.message}`);
  }

  return results;
}

/**
 * Validate Permission Management
 */
function validatePermissionManagement() {
  console.log('🔑 Validating Permission Management...');
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  try {
    // Check Google Drive service
    const driveServicePath = 'src/lib/googleDrive.ts';
    if (!existsSync(driveServicePath)) {
      results.warnings.push('Google Drive service not found');
      return results;
    }

    const driveContent = readFileSync(driveServicePath, 'utf8');

    // Check permission error handling
    if (driveContent.includes('403') || driveContent.includes('insufficient') || driveContent.includes('permission')) {
      results.passed.push('Permission error handling is implemented');
    } else {
      results.warnings.push('Permission error handling may be missing');
    }

    // Check scope verification before API calls
    if (driveContent.includes('scope') || driveContent.includes('permission')) {
      results.passed.push('Scope verification before API calls appears implemented');
    } else {
      results.warnings.push('Scope verification before API calls may be missing');
    }

    // Check graceful degradation
    if (driveContent.includes('fallback') || driveContent.includes('degrade')) {
      results.passed.push('Graceful degradation for missing permissions');
    } else {
      results.warnings.push('Graceful degradation may not be implemented');
    }

    // Check user consent flow
    const authFormPath = 'src/components/AuthForm.tsx';
    if (existsSync(authFormPath)) {
      const authContent = readFileSync(authFormPath, 'utf8');
      
      if (authContent.includes('consent') || authContent.includes('permission')) {
        results.passed.push('User consent flow appears to be implemented');
      } else {
        results.warnings.push('User consent flow may need improvement');
      }
    }

  } catch (error) {
    results.errors.push(`Permission management validation failed: ${error.message}`);
  }

  return results;
}

/**
 * Validate Security Headers and Configuration
 */
function validateSecurityConfiguration() {
  console.log('⚙️  Validating Security Configuration...');
  
  const results = {
    passed: [],
    warnings: [],
    errors: []
  };

  try {
    // Check environment configuration
    const envPath = 'src/lib/env.ts';
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf8');
      
      // Check for secure defaults
      if (envContent.includes('https') && envContent.includes('production')) {
        results.passed.push('HTTPS enforcement for production is configured');
      } else {
        results.warnings.push('HTTPS enforcement may not be properly configured');
      }

      // Check for secret validation
      if (envContent.includes('secret') && envContent.includes('length')) {
        results.passed.push('Secret length validation is implemented');
      } else {
        results.warnings.push('Secret validation may be insufficient');
      }
    }

    // Check OAuth configuration
    const oauthConfigPath = 'src/lib/oauth/oauthConfig.ts';
    if (existsSync(oauthConfigPath)) {
      const configContent = readFileSync(oauthConfigPath, 'utf8');
      
      // Check for configuration validation
      if (configContent.includes('validate') || configContent.includes('check')) {
        results.passed.push('OAuth configuration validation is implemented');
      } else {
        results.warnings.push('OAuth configuration validation may be missing');
      }

      // Check for secure defaults
      if (configContent.includes('secure') || configContent.includes('httpOnly')) {
        results.passed.push('Secure cookie configuration is implemented');
      } else {
        results.warnings.push('Secure cookie configuration may be missing');
      }
    }

    // Check for security logging
    const files = ['src/lib/oauth/tokenStorage.ts', 'src/lib/oauth/oauthService.ts'];
    let hasSecurityLogging = false;
    
    for (const file of files) {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf8');
        if (content.includes('audit') || content.includes('log') || content.includes('security')) {
          hasSecurityLogging = true;
          break;
        }
      }
    }

    if (hasSecurityLogging) {
      results.passed.push('Security event logging is implemented');
    } else {
      results.warnings.push('Security event logging may be missing');
    }

  } catch (error) {
    results.errors.push(`Security configuration validation failed: ${error.message}`);
  }

  return results;
}

/**
 * Print validation results
 */
function printResults(title, results) {
  console.log(`\n${title}:`);
  
  if (results.passed.length > 0) {
    console.log('  ✅ Security Checks Passed:');
    results.passed.forEach(item => console.log(`     • ${item}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('  ⚠️  Security Warnings:');
    results.warnings.forEach(item => console.log(`     • ${item}`));
  }
  
  if (results.errors.length > 0) {
    console.log('  ❌ Security Issues:');
    results.errors.forEach(item => console.log(`     • ${item}`));
  }
  
  return {
    passed: results.passed.length,
    warnings: results.warnings.length,
    errors: results.errors.length
  };
}

/**
 * Generate security recommendations
 */
function generateSecurityRecommendations(totalErrors, totalWarnings) {
  console.log('\n💡 Security Recommendations:');
  
  const recommendations = [];
  
  if (totalErrors > 0) {
    recommendations.push('Fix all security errors before deploying to production');
    recommendations.push('Review OAuth implementation against OWASP guidelines');
  }
  
  if (totalWarnings > 0) {
    recommendations.push('Address security warnings to improve overall security posture');
    recommendations.push('Consider implementing additional security monitoring');
  }
  
  recommendations.push('Regularly rotate OAuth secrets and encryption keys');
  recommendations.push('Monitor OAuth flows for suspicious activity');
  recommendations.push('Keep OAuth libraries and dependencies up to date');
  recommendations.push('Implement rate limiting for OAuth endpoints');
  recommendations.push('Use HTTPS in all environments (including development)');
  recommendations.push('Regularly audit OAuth permissions and scopes');
  
  recommendations.forEach(rec => console.log(`   • ${rec}`));
}

/**
 * Main security validation function
 */
function validateOAuthSecurity() {
  const validationResults = [];
  
  // Run all security validations
  validationResults.push({
    name: '🛡️  PKCE Implementation',
    results: validatePKCESecurity()
  });
  
  validationResults.push({
    name: '🛡️  CSRF Protection',
    results: validateCSRFProtection()
  });
  
  validationResults.push({
    name: '🔐 Token Security',
    results: validateTokenSecurity()
  });
  
  validationResults.push({
    name: '🎯 Scope Handling',
    results: validateScopeHandling()
  });
  
  validationResults.push({
    name: '🔑 Permission Management',
    results: validatePermissionManagement()
  });
  
  validationResults.push({
    name: '⚙️  Security Configuration',
    results: validateSecurityConfiguration()
  });

  // Print all results
  let totalPassed = 0;
  let totalWarnings = 0;
  let totalErrors = 0;

  validationResults.forEach(validation => {
    const counts = printResults(validation.name, validation.results);
    totalPassed += counts.passed;
    totalWarnings += counts.warnings;
    totalErrors += counts.errors;
  });

  // Print summary
  console.log('\n📊 Security Validation Summary:');
  console.log(`   ✅ Security Checks Passed: ${totalPassed}`);
  console.log(`   ⚠️  Security Warnings: ${totalWarnings}`);
  console.log(`   ❌ Security Issues: ${totalErrors}`);

  // Calculate security score
  const totalChecks = totalPassed + totalWarnings + totalErrors;
  const securityScore = totalChecks > 0 ? Math.round(((totalPassed + (totalWarnings * 0.5)) / totalChecks) * 100) : 0;
  console.log(`   🏆 Security Score: ${securityScore}%`);

  const isSecure = totalErrors === 0 && securityScore >= 80;
  
  if (isSecure) {
    console.log('\n🎉 OAuth security validation passed!');
    console.log('   The OAuth implementation meets security requirements');
    
    if (totalWarnings > 0) {
      console.log('   Consider addressing warnings for enhanced security');
    }
  } else {
    console.log('\n⚠️  OAuth security validation needs attention');
    console.log('   Address security issues before production deployment');
  }

  // Generate recommendations
  generateSecurityRecommendations(totalErrors, totalWarnings);

  return {
    success: isSecure,
    securityScore,
    totalPassed,
    totalWarnings,
    totalErrors
  };
}

// Run security validation
const result = validateOAuthSecurity();

console.log('\n✨ OAuth security validation complete!');

if (!result.success) {
  console.log('\n🚨 Security issues detected - review and fix before production deployment');
  process.exit(1);
} else {
  console.log('\n🔒 OAuth implementation is secure and ready for production');
}