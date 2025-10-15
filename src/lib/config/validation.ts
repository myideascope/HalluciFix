/**
 * OAuth Configuration Validation Utilities
 * Provides startup validation and health checks for OAuth configuration
 */

import { loadOAuthConfig, runOAuthDiagnostics, validateOAuthConfig } from './oauth';

// =============================================================================
// STARTUP VALIDATION
// =============================================================================

/**
 * Validate OAuth configuration on application startup
 * Throws an error if configuration is invalid and prevents app startup
 */
export function validateOAuthConfigOnStartup(): void {
  const validation = validateOAuthConfig();
  
  if (!validation.valid) {
    const errorMessage = [
      '🚨 OAuth Configuration Error',
      '',
      'The application cannot start due to invalid OAuth configuration.',
      'Please check your environment variables and fix the following issues:',
      '',
      ...validation.errors.map(error => `  ❌ ${error}`),
      '',
      'Required environment variables:',
      '  - VITE_GOOGLE_CLIENT_ID',
      '  - GOOGLE_CLIENT_SECRET', 
      '  - VITE_GOOGLE_REDIRECT_URI',
      '  - OAUTH_TOKEN_ENCRYPTION_KEY (min 32 chars)',
      '  - OAUTH_STATE_SECRET (min 16 chars)',
      '  - OAUTH_SESSION_SECRET (min 16 chars)',
      '',
      'See .env.example for configuration template.',
    ].join('\n');

    throw new Error(errorMessage);
  }
}

/**
 * Run OAuth configuration diagnostics and log results
 * Non-blocking - logs warnings but doesn't prevent startup
 */
export function runOAuthStartupDiagnostics(): void {
  try {
    const diagnostics = runOAuthDiagnostics();
    
    console.log('🔐 OAuth Configuration Diagnostics');
    console.log(`Overall Status: ${getStatusEmoji(diagnostics.status)} ${diagnostics.status.toUpperCase()}`);
    
    diagnostics.checks.forEach(check => {
      const emoji = getCheckEmoji(check.status);
      console.log(`  ${emoji} ${check.name}: ${check.message}`);
    });

    if (diagnostics.status === 'warning') {
      console.warn('⚠️  OAuth configuration has warnings. Some features may not work correctly.');
    } else if (diagnostics.status === 'error') {
      console.error('❌ OAuth configuration has errors. Authentication will not work.');
    } else {
      console.log('✅ OAuth configuration is healthy.');
    }
    
  } catch (error) {
    console.error('❌ Failed to run OAuth diagnostics:', error);
  }
}

/**
 * Get status emoji for diagnostics
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '✅';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    default: return '❓';
  }
}

/**
 * Get check emoji for individual checks
 */
function getCheckEmoji(status: string): string {
  switch (status) {
    case 'pass': return '✅';
    case 'warning': return '⚠️';
    case 'fail': return '❌';
    default: return '❓';
  }
}

// =============================================================================
// RUNTIME VALIDATION
// =============================================================================

/**
 * Validate OAuth configuration at runtime
 * Returns validation result without throwing
 */
export function validateOAuthConfigRuntime(): {
  valid: boolean;
  config?: ReturnType<typeof loadOAuthConfig>;
  errors: string[];
} {
  try {
    const config = loadOAuthConfig();
    return {
      valid: true,
      config,
      errors: [],
    };
  } catch (error) {
    return {
      valid: false,
      errors: error instanceof Error ? [error.message] : ['Unknown configuration error'],
    };
  }
}

/**
 * Check if OAuth is properly configured
 */
export function isOAuthConfigured(): boolean {
  const validation = validateOAuthConfig();
  return validation.valid;
}

/**
 * Get OAuth configuration status for health checks
 */
export function getOAuthConfigStatus(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  details?: any;
} {
  try {
    const diagnostics = runOAuthDiagnostics();
    
    switch (diagnostics.status) {
      case 'healthy':
        return {
          status: 'healthy',
          message: 'OAuth configuration is valid and healthy',
          details: diagnostics.checks,
        };
        
      case 'warning':
        return {
          status: 'degraded',
          message: 'OAuth configuration has warnings',
          details: diagnostics.checks,
        };
        
      case 'error':
        return {
          status: 'unhealthy',
          message: 'OAuth configuration has errors',
          details: diagnostics.checks,
        };
        
      default:
        return {
          status: 'unhealthy',
          message: 'Unknown OAuth configuration status',
        };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Failed to check OAuth configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// DEVELOPMENT HELPERS
// =============================================================================

/**
 * Generate example OAuth configuration for development
 */
export function generateExampleOAuthConfig(): Record<string, string> {
  return {
    VITE_GOOGLE_CLIENT_ID: '123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'GOCSPX-abcdefghijklmnopqrstuvwxyz123456',
    VITE_GOOGLE_REDIRECT_URI: 'http://localhost:5173/auth/callback',
    OAUTH_TOKEN_ENCRYPTION_KEY: generateSecureKey(32),
    OAUTH_STATE_SECRET: generateSecureKey(24),
    OAUTH_SESSION_SECRET: generateSecureKey(24),
    GOOGLE_OAUTH_SCOPES: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
  };
}

/**
 * Generate a secure random key
 */
function generateSecureKey(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

/**
 * Print OAuth configuration setup instructions
 */
export function printOAuthSetupInstructions(): void {
  console.log(`
🔐 OAuth Configuration Setup Instructions

1. Create a Google Cloud Console Project:
   - Go to https://console.cloud.google.com/
   - Create a new project or select an existing one
   - Enable the Google+ API and Google Drive API

2. Create OAuth 2.0 Credentials:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add authorized redirect URIs:
     * Development: http://localhost:5173/auth/callback
     * Production: https://yourdomain.com/auth/callback

3. Configure Environment Variables:
   Copy the following to your .env.local file:

${Object.entries(generateExampleOAuthConfig())
  .map(([key, value]) => `   ${key}=${value}`)
  .join('\n')}

4. Replace the example values with your actual credentials:
   - VITE_GOOGLE_CLIENT_ID: From Google Console
   - GOOGLE_CLIENT_SECRET: From Google Console  
   - VITE_GOOGLE_REDIRECT_URI: Your actual redirect URI
   - Generate secure random values for the encryption keys

5. Restart your development server after configuration.

For more details, see the OAuth implementation documentation.
`);
}

// =============================================================================
// EXPORT VALIDATION FUNCTIONS
// =============================================================================

export {
  validateOAuthConfig,
  loadOAuthConfig,
  runOAuthDiagnostics,
} from './oauth';