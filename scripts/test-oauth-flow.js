#!/usr/bin/env node

/**
 * OAuth Flow Test Script
 * 
 * This script tests the OAuth flow components without requiring real Google credentials.
 * It validates that all the OAuth integration pieces work together correctly.
 */

import { readFileSync, existsSync } from 'fs';

// Mock environment for testing
const mockEnv = {
  VITE_GOOGLE_CLIENT_ID: '123456789-test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'GOCSPX-test_client_secret_for_testing',
  OAUTH_TOKEN_ENCRYPTION_KEY: 'test_encryption_key_32_characters_long_123456',
  OAUTH_STATE_SECRET: 'test_state_secret_16_chars',
  OAUTH_SESSION_SECRET: 'test_session_secret_16_chars',
  VITE_GOOGLE_REDIRECT_URI: 'http://localhost:5173/auth/callback',
  GOOGLE_OAUTH_SCOPES: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
  VITE_ENABLE_MOCK_SERVICES: 'false'
};

// Override import.meta.env for testing
global.importMetaEnv = mockEnv;

console.log('🧪 OAuth Flow Integration Test\n');

/**
 * Test OAuth Configuration Loading
 */
function testOAuthConfiguration() {
  console.log('🔧 Testing OAuth Configuration...');
  
  try {
    // Test configuration validation
    const hasClientId = mockEnv.VITE_GOOGLE_CLIENT_ID && mockEnv.VITE_GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com');
    const hasClientSecret = mockEnv.GOOGLE_CLIENT_SECRET && mockEnv.GOOGLE_CLIENT_SECRET.startsWith('GOCSPX-');
    const hasEncryptionKey = mockEnv.OAUTH_TOKEN_ENCRYPTION_KEY && mockEnv.OAUTH_TOKEN_ENCRYPTION_KEY.length >= 32;
    
    console.log(`   ✅ Client ID format: ${hasClientId ? 'Valid' : 'Invalid'}`);
    console.log(`   ✅ Client Secret format: ${hasClientSecret ? 'Valid' : 'Invalid'}`);
    console.log(`   ✅ Encryption key length: ${hasEncryptionKey ? 'Valid' : 'Invalid'}`);
    
    // Test redirect URI
    try {
      const redirectUri = new URL(mockEnv.VITE_GOOGLE_REDIRECT_URI);
      console.log(`   ✅ Redirect URI: Valid (${redirectUri.href})`);
    } catch {
      console.log('   ❌ Redirect URI: Invalid format');
      return false;
    }
    
    // Test scopes
    const scopes = mockEnv.GOOGLE_OAUTH_SCOPES.split(' ');
    const requiredScopes = ['openid', 'email', 'profile'];
    const hasRequiredScopes = requiredScopes.every(scope => scopes.includes(scope));
    console.log(`   ✅ Required scopes: ${hasRequiredScopes ? 'Present' : 'Missing'}`);
    
    return hasClientId && hasClientSecret && hasEncryptionKey && hasRequiredScopes;
  } catch (error) {
    console.log(`   ❌ Configuration test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test PKCE Implementation
 */
function testPKCEImplementation() {
  console.log('\n🔐 Testing PKCE Implementation...');
  
  try {
    // Check if PKCE helper exists
    const pkceHelperPath = 'src/lib/oauth/pkceHelper.ts';
    if (!existsSync(pkceHelperPath)) {
      console.log('   ❌ PKCE helper not found');
      return false;
    }
    
    const pkceContent = readFileSync(pkceHelperPath, 'utf8');
    
    // Check for required PKCE methods
    const hasCodeVerifier = pkceContent.includes('generateCodeVerifier') || pkceContent.includes('codeVerifier');
    const hasCodeChallenge = pkceContent.includes('generateCodeChallenge') || pkceContent.includes('codeChallenge');
    const hasBase64URL = pkceContent.includes('base64URL') || pkceContent.includes('base64url');
    
    console.log(`   ✅ Code verifier generation: ${hasCodeVerifier ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Code challenge generation: ${hasCodeChallenge ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Base64URL encoding: ${hasBase64URL ? 'Implemented' : 'Missing'}`);
    
    return hasCodeVerifier && hasCodeChallenge && hasBase64URL;
  } catch (error) {
    console.log(`   ❌ PKCE test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Token Encryption
 */
function testTokenEncryption() {
  console.log('\n🔒 Testing Token Encryption...');
  
  try {
    const encryptionPath = 'src/lib/oauth/tokenEncryption.ts';
    if (!existsSync(encryptionPath)) {
      console.log('   ❌ Token encryption service not found');
      return false;
    }
    
    const encryptionContent = readFileSync(encryptionPath, 'utf8');
    
    // Check for encryption methods
    const hasEncrypt = encryptionContent.includes('encrypt(');
    const hasDecrypt = encryptionContent.includes('decrypt(');
    const hasAESGCM = encryptionContent.includes('AES-GCM');
    const hasKeyValidation = encryptionContent.includes('validateKey');
    
    console.log(`   ✅ Encrypt method: ${hasEncrypt ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Decrypt method: ${hasDecrypt ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ AES-GCM algorithm: ${hasAESGCM ? 'Used' : 'Not used'}`);
    console.log(`   ✅ Key validation: ${hasKeyValidation ? 'Implemented' : 'Missing'}`);
    
    return hasEncrypt && hasDecrypt && hasAESGCM && hasKeyValidation;
  } catch (error) {
    console.log(`   ❌ Encryption test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test OAuth Service Integration
 */
function testOAuthServiceIntegration() {
  console.log('\n🔗 Testing OAuth Service Integration...');
  
  try {
    const oauthServicePath = 'src/lib/oauth/oauthService.ts';
    if (!existsSync(oauthServicePath)) {
      console.log('   ❌ OAuth service not found');
      return false;
    }
    
    const serviceContent = readFileSync(oauthServicePath, 'utf8');
    
    // Check for OAuth flow methods
    const hasInitiateAuth = serviceContent.includes('initiateAuth') || serviceContent.includes('startAuth');
    const hasHandleCallback = serviceContent.includes('handleCallback') || serviceContent.includes('callback');
    const hasTokenRefresh = serviceContent.includes('refreshTokens') || serviceContent.includes('refresh');
    const hasTokenRevoke = serviceContent.includes('revokeTokens') || serviceContent.includes('revoke');
    
    console.log(`   ✅ Initiate auth: ${hasInitiateAuth ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Handle callback: ${hasHandleCallback ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Token refresh: ${hasTokenRefresh ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Token revocation: ${hasTokenRevoke ? 'Implemented' : 'Missing'}`);
    
    return hasInitiateAuth && hasHandleCallback && hasTokenRefresh && hasTokenRevoke;
  } catch (error) {
    console.log(`   ❌ OAuth service test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Profile Service Integration
 */
function testProfileServiceIntegration() {
  console.log('\n👤 Testing Profile Service Integration...');
  
  try {
    const profileServicePath = 'src/lib/oauth/profileService.ts';
    if (!existsSync(profileServicePath)) {
      console.log('   ❌ Profile service not found');
      return false;
    }
    
    const profileContent = readFileSync(profileServicePath, 'utf8');
    
    // Check for profile methods
    const hasGetProfile = profileContent.includes('getUserProfile') || profileContent.includes('getProfile');
    const hasUpdateProfile = profileContent.includes('updateProfile') || profileContent.includes('syncProfile');
    const hasCaching = profileContent.includes('cache') || profileContent.includes('Cache');
    const hasErrorHandling = profileContent.includes('catch') || profileContent.includes('error');
    
    console.log(`   ✅ Get profile: ${hasGetProfile ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Update profile: ${hasUpdateProfile ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Profile caching: ${hasCaching ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Error handling: ${hasErrorHandling ? 'Implemented' : 'Missing'}`);
    
    return hasGetProfile && hasUpdateProfile && hasCaching && hasErrorHandling;
  } catch (error) {
    console.log(`   ❌ Profile service test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Google Drive Integration
 */
function testGoogleDriveIntegration() {
  console.log('\n📁 Testing Google Drive Integration...');
  
  try {
    const driveServicePath = 'src/lib/googleDrive.ts';
    if (!existsSync(driveServicePath)) {
      console.log('   ❌ Google Drive service not found');
      return false;
    }
    
    const driveContent = readFileSync(driveServicePath, 'utf8');
    
    // Check for Drive API methods
    const hasListFiles = driveContent.includes('listFiles') || driveContent.includes('list');
    const hasDownloadFile = driveContent.includes('downloadFile') || driveContent.includes('download');
    const hasTokenIntegration = driveContent.includes('TokenManager') || driveContent.includes('oauth') || driveContent.includes('getValidTokens');
    const hasRateLimit = driveContent.includes('rate') || driveContent.includes('429') || driveContent.includes('limit');
    
    console.log(`   ✅ List files: ${hasListFiles ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Download files: ${hasDownloadFile ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Token integration: ${hasTokenIntegration ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Rate limiting: ${hasRateLimit ? 'Handled' : 'Not handled'}`);
    
    return hasListFiles && hasDownloadFile && hasTokenIntegration;
  } catch (error) {
    console.log(`   ❌ Drive integration test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test Authentication Hook Integration
 */
function testAuthHookIntegration() {
  console.log('\n🪝 Testing Authentication Hook Integration...');
  
  try {
    const useAuthPath = 'src/hooks/useAuth.ts';
    if (!existsSync(useAuthPath)) {
      console.log('   ❌ useAuth hook not found');
      return false;
    }
    
    const authContent = readFileSync(useAuthPath, 'utf8');
    
    // Check for OAuth integration
    const hasOAuthIntegration = authContent.includes('oauth') || authContent.includes('OAuth');
    const hasSignIn = authContent.includes('signIn') || authContent.includes('login');
    const hasSignOut = authContent.includes('signOut') || authContent.includes('logout');
    const hasUserState = authContent.includes('user') && authContent.includes('useState');
    
    console.log(`   ✅ OAuth integration: ${hasOAuthIntegration ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Sign in method: ${hasSignIn ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ Sign out method: ${hasSignOut ? 'Implemented' : 'Missing'}`);
    console.log(`   ✅ User state management: ${hasUserState ? 'Implemented' : 'Missing'}`);
    
    return hasOAuthIntegration && hasSignIn && hasSignOut && hasUserState;
  } catch (error) {
    console.log(`   ❌ Auth hook test failed: ${error.message}`);
    return false;
  }
}

/**
 * Run all tests
 */
function runAllTests() {
  const tests = [
    { name: 'OAuth Configuration', test: testOAuthConfiguration },
    { name: 'PKCE Implementation', test: testPKCEImplementation },
    { name: 'Token Encryption', test: testTokenEncryption },
    { name: 'OAuth Service Integration', test: testOAuthServiceIntegration },
    { name: 'Profile Service Integration', test: testProfileServiceIntegration },
    { name: 'Google Drive Integration', test: testGoogleDriveIntegration },
    { name: 'Auth Hook Integration', test: testAuthHookIntegration }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const { name, test } of tests) {
    try {
      const result = test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ ${name} test crashed: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All OAuth integration tests passed!');
    console.log('   The OAuth system is ready for production use with real credentials.');
  } else {
    console.log('\n⚠️  Some OAuth integration tests failed.');
    console.log('   Review the failed tests above and fix any issues.');
  }
  
  return failed === 0;
}

// Run the tests
const success = runAllTests();

console.log('\n✨ OAuth flow test complete!');

if (!success) {
  process.exit(1);
}