#!/usr/bin/env node

/**
 * OAuth Configuration Validation Script
 * 
 * This script validates the OAuth configuration and provides guidance
 * on setting up Google OAuth credentials properly.
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

// Merge environment variables (local takes precedence)
const envVars = { ...process.env, ...envDev, ...envLocal };

const REQUIRED_OAUTH_VARS = [
  'VITE_GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'OAUTH_TOKEN_ENCRYPTION_KEY',
  'OAUTH_STATE_SECRET', 
  'OAUTH_SESSION_SECRET'
];

const OPTIONAL_OAUTH_VARS = [
  'VITE_GOOGLE_REDIRECT_URI',
  'GOOGLE_OAUTH_SCOPES'
];

function validateOAuthConfiguration() {
  console.log('🔍 Validating OAuth Configuration...\n');

  const results = {
    errors: [],
    warnings: [],
    recommendations: []
  };

  // Check if mock services are enabled
  const mockServicesEnabled = envVars.VITE_ENABLE_MOCK_SERVICES === 'true';
  
  if (mockServicesEnabled) {
    console.log('ℹ️  Mock services are enabled - OAuth authentication is disabled');
    console.log('   Set VITE_ENABLE_MOCK_SERVICES=false to enable real OAuth\n');
    return { success: true, mockMode: true };
  }

  // Check required variables
  console.log('📋 Checking required OAuth variables:');
  REQUIRED_OAUTH_VARS.forEach(varName => {
    const value = envVars[varName];
    const isSet = value && value !== `your_${varName.toLowerCase().replace(/^(vite_|oauth_)/, '').replace(/_/g, '_')}_here` && !value.includes('your_') && !value.includes('_here');
    
    if (!isSet) {
      results.errors.push(`${varName} is not properly configured`);
      console.log(`   ❌ ${varName}: Not configured`);
    } else {
      console.log(`   ✅ ${varName}: Configured`);
      
      // Additional validation for specific variables
      if (varName === 'VITE_GOOGLE_CLIENT_ID' && !value.includes('.apps.googleusercontent.com')) {
        results.warnings.push('Google Client ID format appears invalid (should end with .apps.googleusercontent.com)');
      }
      
      if (varName === 'GOOGLE_CLIENT_SECRET' && !value.startsWith('GOCSPX-')) {
        results.warnings.push('Google Client Secret format appears invalid (should start with GOCSPX-)');
      }
      
      if (varName.includes('KEY') || varName.includes('SECRET')) {
        if (value.length < 16) {
          results.errors.push(`${varName} is too short (minimum 16 characters)`);
        } else if (varName === 'OAUTH_TOKEN_ENCRYPTION_KEY' && value.length < 32) {
          results.errors.push(`${varName} is too short (minimum 32 characters for encryption key)`);
        }
      }
    }
  });

  // Check optional variables
  console.log('\n📋 Checking optional OAuth variables:');
  OPTIONAL_OAUTH_VARS.forEach(varName => {
    const value = envVars[varName];
    const isSet = value && value.trim() !== '';
    
    if (isSet) {
      console.log(`   ✅ ${varName}: ${value}`);
      
      // Validate redirect URI format
      if (varName === 'VITE_GOOGLE_REDIRECT_URI') {
        try {
          const url = new URL(value);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            results.warnings.push('Redirect URI should use http:// or https://');
          }
          if (envVars.NODE_ENV === 'production' && url.protocol !== 'https:') {
            results.warnings.push('Redirect URI should use https:// in production');
          }
        } catch {
          results.errors.push('VITE_GOOGLE_REDIRECT_URI is not a valid URL');
        }
      }
    } else {
      console.log(`   ⚠️  ${varName}: Using default value`);
      if (varName === 'VITE_GOOGLE_REDIRECT_URI') {
        const appUrl = envVars.VITE_APP_URL || 'http://localhost:5173';
        console.log(`      Default: ${appUrl}/auth/callback`);
      }
    }
  });

  // Generate recommendations
  if (results.errors.length > 0) {
    results.recommendations.push('Follow the setup guide in .env.local to configure Google OAuth credentials');
    results.recommendations.push('Visit https://console.cloud.google.com/apis/credentials to create OAuth 2.0 credentials');
  }

  if (results.warnings.length > 0) {
    results.recommendations.push('Review the warnings above to ensure optimal security configuration');
  }

  // Print results
  console.log('\n📊 Validation Results:');
  
  if (results.errors.length === 0) {
    console.log('✅ OAuth configuration is valid and ready for use');
    console.log('   You can now set VITE_ENABLE_MOCK_SERVICES=false to enable real OAuth');
  } else {
    console.log('❌ OAuth configuration has errors that must be fixed:');
    results.errors.forEach(error => console.log(`   • ${error}`));
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  Configuration warnings:');
    results.warnings.forEach(warning => console.log(`   • ${warning}`));
  }

  if (results.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    results.recommendations.forEach(rec => console.log(`   • ${rec}`));
  }

  return {
    success: results.errors.length === 0,
    mockMode: false,
    errors: results.errors,
    warnings: results.warnings,
    recommendations: results.recommendations
  };
}

function printSetupGuide() {
  console.log('\n📖 Google OAuth Setup Guide:');
  console.log('');
  console.log('1. Go to Google Cloud Console:');
  console.log('   https://console.cloud.google.com/apis/credentials');
  console.log('');
  console.log('2. Create or select a project');
  console.log('');
  console.log('3. Enable the Google+ API and Google Drive API');
  console.log('');
  console.log('4. Create OAuth 2.0 Client IDs:');
  console.log('   - Application type: Web application');
  console.log('   - Name: HalluciFix (or your preferred name)');
  console.log('');
  console.log('5. Add authorized redirect URIs:');
  console.log('   - Development: http://localhost:5173/auth/callback');
  console.log('   - Production: https://yourdomain.com/auth/callback');
  console.log('');
  console.log('6. Copy the Client ID and Client Secret to .env.local');
  console.log('');
  console.log('7. Generate secure secrets for OAuth security:');
  console.log('   - OAUTH_TOKEN_ENCRYPTION_KEY (32+ characters)');
  console.log('   - OAUTH_STATE_SECRET (16+ characters)');
  console.log('   - OAUTH_SESSION_SECRET (16+ characters)');
  console.log('');
  console.log('8. Set VITE_ENABLE_MOCK_SERVICES=false to enable OAuth');
}

// Main execution
console.log('🚀 HalluciFix OAuth Configuration Validator\n');

const result = validateOAuthConfiguration();

if (!result.success && !result.mockMode) {
  printSetupGuide();
  process.exit(1);
}

if (result.mockMode) {
  console.log('💡 To enable OAuth authentication, follow these steps:');
  printSetupGuide();
}

console.log('\n✨ Configuration validation complete!');