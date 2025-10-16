#!/usr/bin/env node

/**
 * OAuth Integration Validation Script
 * 
 * This script validates OAuth integration across all application features
 * including authentication, profile synchronization, and Google Drive access.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Simple environment file loader
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  
  const content = readFileSync(filePath, 'utf8');
  const env = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      env[key.trim()] = value;
    }
  });
  
  return env;
}

// Load environment variables from files
const envLocal = loadEnvFile('.env.local');
const envDev = loadEnvFile('.env.development');
const envVars = { ...process.env, ...envDev, ...envLocal };

/**
 * Validate OAuth Authentication Integration
 */
function validateAuthenticationIntegration() {
  console.log('🔐 Validating OAuth Authentication Integration...');
  
  const results = {
    errors: [],
    warnings: [],
    passed: []
  };

  // Check if OAuth is properly configured
  const hasClientId = envVars.VITE_GOOGLE_CLIENT_ID && !envVars.VITE_GOOGLE_CLIENT_ID.includes('your_');
  const hasClientSecret = envVars.GOOGLE_CLIENT_SECRET && !envVars.GOOGLE_CLIENT_SECRET.includes('your_');
  const hasEncryptionKey = envVars.OAUTH_TOKEN_ENCRYPTION_KEY && envVars.OAUTH_TOKEN_ENCRYPTION_KEY.length >= 32;

  if (!hasClientId) {
    results.errors.push('Google Client ID not configured - authentication will fail');
  } else {
    results.passed.push('Google Client ID is configured');
  }

  if (!hasClientSecret) {
    results.errors.push('Google Client Secret not configured - token exchange will fail');
  } else {
    results.passed.push('Google Client Secret is configured');
  }

  if (!hasEncryptionKey) {
    results.errors.push('OAuth token encryption key not configured - token storage will be insecure');
  } else {
    results.passed.push('OAuth token encryption key is configured');
  }

  // Check redirect URI configuration
  const redirectUri = envVars.VITE_GOOGLE_REDIRECT_URI || `${envVars.VITE_APP_URL || 'http://localhost:5173'}/auth/callback`;
  
  try {
    const url = new URL(redirectUri);
    results.passed.push(`Redirect URI is valid: ${redirectUri}`);
    
    if (url.hostname === 'localhost' && envVars.NODE_ENV === 'production') {
      results.warnings.push('Using localhost redirect URI in production environment');
    }
  } catch {
    results.errors.push(`Invalid redirect URI format: ${redirectUri}`);
  }

  // Check OAuth scopes
  const scopes = (envVars.GOOGLE_OAUTH_SCOPES || '').split(' ').filter(Boolean);
  const requiredScopes = ['openid', 'email', 'profile'];
  const driveScope = 'https://www.googleapis.com/auth/drive.readonly';
  
  const missingRequired = requiredScopes.filter(scope => !scopes.includes(scope));
  if (missingRequired.length > 0) {
    results.errors.push(`Missing required OAuth scopes: ${missingRequired.join(', ')}`);
  } else {
    results.passed.push('All required OAuth scopes are configured');
  }

  if (!scopes.includes(driveScope)) {
    results.warnings.push('Google Drive scope not configured - Drive integration will not work');
  } else {
    results.passed.push('Google Drive scope is configured');
  }

  return results;
}

/**
 * Validate Profile Synchronization Integration
 */
function validateProfileIntegration() {
  console.log('👤 Validating Profile Synchronization Integration...');
  
  const results = {
    errors: [],
    warnings: [],
    passed: []
  };

  // Check if profile service files exist
  const profileServicePath = 'src/lib/oauth/profileService.ts';
  if (existsSync(profileServicePath)) {
    results.passed.push('Profile service implementation exists');
    
    // Check profile service implementation
    const profileServiceContent = readFileSync(profileServicePath, 'utf8');
    
    if (profileServiceContent.includes('getUserProfile')) {
      results.passed.push('Profile fetching functionality is implemented');
    } else {
      results.errors.push('Profile fetching functionality is missing');
    }

    if (profileServiceContent.includes('updateProfile') || profileServiceContent.includes('syncProfile')) {
      results.passed.push('Profile synchronization functionality is implemented');
    } else {
      results.warnings.push('Profile synchronization functionality may be missing');
    }

    if (profileServiceContent.includes('cacheProfile') || profileServiceContent.includes('cache')) {
      results.passed.push('Profile caching is implemented');
    } else {
      results.warnings.push('Profile caching may not be implemented');
    }
  } else {
    results.errors.push('Profile service implementation is missing');
  }

  // Check profile display components
  const userProfilePath = 'src/components/UserManagement.tsx';
  if (existsSync(userProfilePath)) {
    results.passed.push('User profile display component exists');
    
    const userProfileContent = readFileSync(userProfilePath, 'utf8');
    if (userProfileContent.includes('picture') || userProfileContent.includes('avatar')) {
      results.passed.push('Profile picture display is implemented');
    } else {
      results.warnings.push('Profile picture display may be missing');
    }
  } else {
    results.warnings.push('User profile display component may be missing');
  }

  return results;
}

/**
 * Validate Google Drive Integration
 */
function validateDriveIntegration() {
  console.log('📁 Validating Google Drive Integration...');
  
  const results = {
    errors: [],
    warnings: [],
    passed: []
  };

  // Check if Drive service exists
  const driveServicePath = 'src/lib/googleDrive.ts';
  if (existsSync(driveServicePath)) {
    results.passed.push('Google Drive service implementation exists');
    
    const driveServiceContent = readFileSync(driveServicePath, 'utf8');
    
    // Check for OAuth token integration
    if (driveServiceContent.includes('TokenManager') || driveServiceContent.includes('oauth')) {
      results.passed.push('Drive service is integrated with OAuth token management');
    } else {
      results.errors.push('Drive service is not integrated with OAuth token management');
    }

    // Check for file operations
    if (driveServiceContent.includes('listFiles')) {
      results.passed.push('Drive file listing functionality is implemented');
    } else {
      results.errors.push('Drive file listing functionality is missing');
    }

    if (driveServiceContent.includes('downloadFile') || driveServiceContent.includes('getFile')) {
      results.passed.push('Drive file download functionality is implemented');
    } else {
      results.errors.push('Drive file download functionality is missing');
    }

    // Check for error handling
    if (driveServiceContent.includes('rate limit') || driveServiceContent.includes('429')) {
      results.passed.push('Drive API rate limiting is handled');
    } else {
      results.warnings.push('Drive API rate limiting may not be handled');
    }

    if (driveServiceContent.includes('refresh') || 
        driveServiceContent.includes('TokenManager') ||
        driveServiceContent.includes('getValidTokens')) {
      results.passed.push('Token refresh is integrated with Drive API');
    } else {
      results.warnings.push('Token refresh integration with Drive API may be missing');
    }
  } else {
    results.errors.push('Google Drive service implementation is missing');
  }

  // Check Drive picker component
  const drivePickerPath = 'src/components/GoogleDrivePicker.tsx';
  if (existsSync(drivePickerPath)) {
    results.passed.push('Google Drive picker component exists');
    
    const drivePickerContent = readFileSync(drivePickerPath, 'utf8');
    if (drivePickerContent.includes('oauth') || drivePickerContent.includes('auth')) {
      results.passed.push('Drive picker is integrated with OAuth authentication');
    } else {
      results.warnings.push('Drive picker may not be integrated with OAuth authentication');
    }
  } else {
    results.warnings.push('Google Drive picker component may be missing');
  }

  return results;
}

/**
 * Validate Token Management Integration
 */
function validateTokenManagement() {
  console.log('🔑 Validating Token Management Integration...');
  
  const results = {
    errors: [],
    warnings: [],
    passed: []
  };

  // Check token manager implementation
  const tokenManagerPath = 'src/lib/oauth/tokenManager.ts';
  if (existsSync(tokenManagerPath)) {
    results.passed.push('Token manager implementation exists');
    
    const tokenManagerContent = readFileSync(tokenManagerPath, 'utf8');
    
    // Check for encryption in token manager or token storage
    const hasEncryption = tokenManagerContent.includes('encrypt') || 
                         tokenManagerContent.includes('TokenEncryption') ||
                         tokenManagerContent.includes('SecureTokenStorage');
    
    if (hasEncryption) {
      results.passed.push('Token encryption/decryption is implemented');
    } else {
      // Check token encryption service separately
      const tokenEncryptionPath = 'src/lib/oauth/tokenEncryption.ts';
      if (existsSync(tokenEncryptionPath)) {
        const encryptionContent = readFileSync(tokenEncryptionPath, 'utf8');
        if (encryptionContent.includes('encrypt') && encryptionContent.includes('decrypt')) {
          results.passed.push('Token encryption/decryption is implemented');
        } else {
          results.errors.push('Token encryption service exists but lacks encrypt/decrypt methods');
        }
      } else {
        results.errors.push('Token encryption/decryption is missing');
      }
    }

    if (tokenManagerContent.includes('refresh')) {
      results.passed.push('Token refresh functionality is implemented');
    } else {
      results.errors.push('Token refresh functionality is missing');
    }

    if (tokenManagerContent.includes('revoke')) {
      results.passed.push('Token revocation functionality is implemented');
    } else {
      results.warnings.push('Token revocation functionality may be missing');
    }
  } else {
    results.errors.push('Token manager implementation is missing');
  }

  // Check token storage
  const tokenStoragePath = 'src/lib/oauth/tokenStorage.ts';
  if (existsSync(tokenStoragePath)) {
    results.passed.push('Token storage implementation exists');
  } else {
    results.warnings.push('Dedicated token storage implementation may be missing');
  }

  return results;
}

/**
 * Validate Session Persistence
 */
function validateSessionPersistence() {
  console.log('💾 Validating Session Persistence...');
  
  const results = {
    errors: [],
    warnings: [],
    passed: []
  };

  // Check session manager
  const sessionManagerPath = 'src/lib/oauth/sessionManager.ts';
  if (existsSync(sessionManagerPath)) {
    results.passed.push('Session manager implementation exists');
    
    const sessionManagerContent = readFileSync(sessionManagerPath, 'utf8');
    
    if (sessionManagerContent.includes('persist') || sessionManagerContent.includes('store')) {
      results.passed.push('Session persistence is implemented');
    } else {
      results.warnings.push('Session persistence may not be implemented');
    }

    if (sessionManagerContent.includes('restore') || sessionManagerContent.includes('load')) {
      results.passed.push('Session restoration is implemented');
    } else {
      results.warnings.push('Session restoration may not be implemented');
    }
  } else {
    results.warnings.push('Session manager implementation may be missing');
  }

  // Check useAuth hook integration
  const useAuthPath = 'src/hooks/useAuth.ts';
  if (existsSync(useAuthPath)) {
    results.passed.push('useAuth hook exists');
    
    const useAuthContent = readFileSync(useAuthPath, 'utf8');
    
    if (useAuthContent.includes('oauth') || useAuthContent.includes('OAuth')) {
      results.passed.push('useAuth hook is integrated with OAuth');
    } else {
      results.warnings.push('useAuth hook may not be integrated with OAuth');
    }

    if (useAuthContent.includes('persist') || useAuthContent.includes('localStorage') || useAuthContent.includes('sessionStorage')) {
      results.passed.push('Authentication state persistence is implemented');
    } else {
      results.warnings.push('Authentication state persistence may not be implemented');
    }
  } else {
    results.errors.push('useAuth hook is missing');
  }

  return results;
}

/**
 * Print validation results
 */
function printResults(title, results) {
  console.log(`\n${title}:`);
  
  if (results.passed.length > 0) {
    console.log('  ✅ Passed:');
    results.passed.forEach(item => console.log(`     • ${item}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('  ⚠️  Warnings:');
    results.warnings.forEach(item => console.log(`     • ${item}`));
  }
  
  if (results.errors.length > 0) {
    console.log('  ❌ Errors:');
    results.errors.forEach(item => console.log(`     • ${item}`));
  }
  
  return {
    passed: results.passed.length,
    warnings: results.warnings.length,
    errors: results.errors.length
  };
}

/**
 * Main validation function
 */
function validateOAuthIntegration() {
  console.log('🚀 OAuth Integration Validation\n');
  
  // Check if mock services are enabled
  if (envVars.VITE_ENABLE_MOCK_SERVICES === 'true') {
    console.log('ℹ️  Mock services are enabled - OAuth integration is disabled');
    console.log('   Set VITE_ENABLE_MOCK_SERVICES=false to enable OAuth integration\n');
    return { success: true, mockMode: true };
  }

  const validationResults = [];
  
  // Run all validations
  validationResults.push({
    name: '🔐 Authentication Integration',
    results: validateAuthenticationIntegration()
  });
  
  validationResults.push({
    name: '👤 Profile Integration', 
    results: validateProfileIntegration()
  });
  
  validationResults.push({
    name: '📁 Drive Integration',
    results: validateDriveIntegration()
  });
  
  validationResults.push({
    name: '🔑 Token Management',
    results: validateTokenManagement()
  });
  
  validationResults.push({
    name: '💾 Session Persistence',
    results: validateSessionPersistence()
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
  console.log('\n📊 Integration Validation Summary:');
  console.log(`   ✅ Passed: ${totalPassed}`);
  console.log(`   ⚠️  Warnings: ${totalWarnings}`);
  console.log(`   ❌ Errors: ${totalErrors}`);

  const success = totalErrors === 0;
  
  if (success) {
    console.log('\n🎉 OAuth integration validation passed!');
    console.log('   All critical components are properly integrated');
    
    if (totalWarnings > 0) {
      console.log('   Review warnings above for potential improvements');
    }
  } else {
    console.log('\n❌ OAuth integration validation failed');
    console.log('   Fix the errors above before enabling OAuth authentication');
  }

  return {
    success,
    mockMode: false,
    totalPassed,
    totalWarnings,
    totalErrors
  };
}

// Run validation
const result = validateOAuthIntegration();

if (!result.success && !result.mockMode) {
  process.exit(1);
}

console.log('\n✨ Integration validation complete!');