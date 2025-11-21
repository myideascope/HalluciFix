# Google OAuth 2.0 Setup Guide

This guide walks you through setting up Google OAuth 2.0 authentication for HalluciFix, including Google Cloud Console configuration, environment variables, and security best practices.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Google Cloud Console Setup](#google-cloud-console-setup)
3. [Environment Configuration](#environment-configuration)
4. [Security Configuration](#security-configuration)
5. [Development Setup](#development-setup)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)
8. [Security Best Practices](#security-best-practices)

## Prerequisites

- Google Cloud Console account
- HalluciFix application repository access
- Node.js and npm installed
- Basic understanding of OAuth 2.0 flow

## Google Cloud Console Setup

### 1. Create or Select a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID for reference

### 2. Enable Required APIs

Enable the following APIs in your Google Cloud project:

```bash
# Navigate to APIs & Services > Library and enable:
- Google+ API (for user profile information)
- Google Drive API (for file access)
- Google People API (for enhanced profile data)
```

Or use the gcloud CLI:

```bash
gcloud services enable plus.googleapis.com
gcloud services enable drive.googleapis.com  
gcloud services enable people.googleapis.com
```

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services > Credentials**
2. Click **"Create Credentials" > "OAuth 2.0 Client IDs"**
3. Configure the OAuth consent screen first if prompted:
   - Choose **External** for public apps or **Internal** for G Suite domains
   - Fill in required fields:
     - App name: `HalluciFix`
     - User support email: Your email
     - Developer contact information: Your email
   - Add scopes:
     - `openid`
     - `email` 
     - `profile`
     - `https://www.googleapis.com/auth/drive.readonly`

4. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: `HalluciFix Web Client`
   - Authorized JavaScript origins:
     - Development: `http://localhost:5173`
     - Production: `https://yourdomain.com`
   - Authorized redirect URIs:
     - Development: `http://localhost:5173/auth/callback`
     - Production: `https://yourdomain.com/auth/callback`

5. Download the credentials JSON or copy the Client ID and Client Secret

## Environment Configuration

### 1. Copy Environment Template

```bash
cp .env.example .env.local
```

### 2. Configure OAuth Variables

Edit `.env.local` with your Google OAuth credentials:

```bash
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_google_client_secret_here
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback

# OAuth Security Configuration  
OAUTH_TOKEN_ENCRYPTION_KEY=your_32_character_encryption_key_here
OAUTH_STATE_SECRET=your_oauth_state_secret_key_here
OAUTH_SESSION_SECRET=your_session_secret_key_here

# OAuth Scopes
GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/drive.readonly
```

### 3. Generate Secure Keys

Use the built-in key generator or create your own:

```bash
# Generate secure keys (32+ characters each)
node -e "console.log('OAUTH_TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('OAUTH_STATE_SECRET=' + require('crypto').randomBytes(24).toString('base64url'))"  
node -e "console.log('OAUTH_SESSION_SECRET=' + require('crypto').randomBytes(24).toString('base64url'))"
```

## Security Configuration

### 1. Token Encryption

OAuth tokens are encrypted before storage using AES-GCM encryption:

- **Encryption Key**: Must be at least 32 characters
- **Algorithm**: AES-GCM with 96-bit IV
- **Storage**: Encrypted tokens stored in database
- **Key Rotation**: Supported through configuration updates

### 2. CSRF Protection

OAuth state parameters provide CSRF protection:

- **State Generation**: Cryptographically secure random values
- **State Storage**: Temporary storage with expiration
- **State Validation**: Verified on callback to prevent CSRF attacks

### 3. PKCE Implementation

Proof Key for Code Exchange (PKCE) adds security for public clients:

- **Code Verifier**: 128-character random string
- **Code Challenge**: SHA256 hash of verifier, base64url encoded
- **Challenge Method**: S256 (SHA256)

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Database Migrations

```bash
# Apply OAuth infrastructure migration
npx supabase db push
```

### 3. Validate Configuration

```bash
# Check OAuth configuration
npm run dev
# Look for OAuth configuration diagnostics in console
```

### 4. Test OAuth Flow

1. Start development server: `npm run dev`
2. Navigate to `http://localhost:5173`
3. Click "Sign in with Google"
4. Complete OAuth flow
5. Verify user profile and Drive access

## Production Deployment

### 1. Environment-Specific Configuration

**Staging Environment:**
```bash
VITE_GOOGLE_REDIRECT_URI=https://staging.yourdomain.com/auth/callback
NODE_ENV=staging
```

**Production Environment:**
```bash
VITE_GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/callback
NODE_ENV=production
```

### 2. Security Hardening

- Use HTTPS for all redirect URIs
- Set secure cookie flags in production
- Enable strict CORS policies
- Implement rate limiting
- Monitor OAuth audit logs

### 3. Google Console Production Setup

1. Update OAuth consent screen for production
2. Add production redirect URIs
3. Verify domain ownership
4. Submit for verification if using sensitive scopes

## Troubleshooting

### Common Issues

**1. "redirect_uri_mismatch" Error**
```
Solution: Ensure redirect URI in Google Console exactly matches VITE_GOOGLE_REDIRECT_URI
Check: Protocol (http/https), domain, port, and path must match exactly
```

**2. "invalid_client" Error**
```
Solution: Verify VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct
Check: No extra spaces, correct environment file loaded
```

**3. "access_denied" Error**
```
Solution: User denied consent or app not verified
Check: OAuth consent screen configuration, required scopes
```

**4. Token Encryption Errors**
```
Solution: Ensure OAUTH_TOKEN_ENCRYPTION_KEY is at least 32 characters
Check: Key format and character encoding
```

### Debug Mode

Enable OAuth debugging:

```bash
# Add to .env.local
LOG_LEVEL=debug
VITE_ENABLE_OAUTH_DEBUG=true
```

### Health Checks

Check OAuth system health:

```bash
# In browser console or API endpoint
fetch('/api/health/oauth')
  .then(r => r.json())
  .then(console.log)
```

## Security Best Practices

### 1. Credential Management

- **Never commit secrets**: Use `.env.local` (gitignored)
- **Rotate keys regularly**: Update encryption keys periodically
- **Use environment-specific credentials**: Different keys per environment
- **Secure key storage**: Use secret management systems in production

### 2. OAuth Configuration

- **Minimal scopes**: Request only necessary permissions
- **Secure redirect URIs**: Use HTTPS in production
- **State validation**: Always validate OAuth state parameters
- **Token expiration**: Set appropriate token lifetimes

### 3. Monitoring and Auditing

- **Audit logs**: Monitor OAuth events and failures
- **Rate limiting**: Implement OAuth request rate limits
- **Error tracking**: Log OAuth errors for analysis
- **Health monitoring**: Regular OAuth system health checks

### 4. User Privacy

- **Data minimization**: Store only necessary user data
- **Consent management**: Clear consent for data access
- **Data retention**: Implement token cleanup policies
- **User control**: Allow users to revoke access

## API Reference

### Configuration Functions

```typescript
// Load and validate OAuth configuration
import { loadOAuthConfig, validateOAuthConfig } from '@/lib/config/oauth';

// Check if OAuth is configured
import { isOAuthConfigured } from '@/lib/config/validation';

// Run health checks
import { runOAuthSystemHealthCheck } from '@/lib/config/healthCheck';
```

### Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth Client ID | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth Client Secret | `GOCSPX-abcdefghijklmnopqrstuvwxyz` |
| `VITE_GOOGLE_REDIRECT_URI` | Yes | OAuth redirect URI | `http://localhost:5173/auth/callback` |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | Yes | Token encryption key (32+ chars) | `abcdefghijklmnopqrstuvwxyz123456` |
| `OAUTH_STATE_SECRET` | Yes | OAuth state secret (16+ chars) | `your_state_secret_here` |
| `OAUTH_SESSION_SECRET` | Yes | Session secret (16+ chars) | `your_session_secret_here` |
| `GOOGLE_OAUTH_SCOPES` | No | OAuth scopes (space-separated) | `openid email profile` |

## Support

For additional help:

1. Check the [OAuth troubleshooting guide](./OAUTH_TROUBLESHOOTING.md)
2. Review [Google OAuth documentation](https://developers.google.com/identity/protocols/oauth2)
3. Check application logs for detailed error messages
4. Run OAuth diagnostics for configuration validation

## Next Steps

After completing OAuth setup:

1. [Implement OAuth service](../src/lib/oauth/) - Core OAuth functionality
2. [Set up token management](../src/lib/tokenManager/) - Secure token handling  
3. [Configure Drive integration](../src/lib/googleDrive/) - Google Drive API access
4. [Update authentication UI](../src/components/auth/) - User interface components