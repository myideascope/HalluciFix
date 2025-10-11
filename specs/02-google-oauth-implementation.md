# Spec: Complete Google OAuth Implementation

**Priority:** Critical (P1)  
**Estimated Effort:** 1-2 weeks  
**Dependencies:** Google Cloud Console setup, domain verification

## Overview

Implement a complete Google OAuth 2.0 authentication flow to replace the current mock authentication system, enabling secure user authentication and Google Drive integration.

## Current State

- Mock authentication in `GoogleDrivePicker.tsx`
- Placeholder OAuth configuration
- No real token management or refresh handling
- Missing proper consent flow and scope management

## Requirements

### 1. OAuth 2.0 Flow Implementation

**Acceptance Criteria:**
- [ ] Implement authorization code flow with PKCE
- [ ] Handle consent screen and user approval
- [ ] Support proper scope management
- [ ] Implement state parameter for CSRF protection
- [ ] Handle OAuth errors and edge cases

**Technical Details:**
- Use `google-auth-library` for OAuth implementation
- Implement proper redirect handling
- Add state validation for security
- Support incremental authorization

### 2. Token Management

**Acceptance Criteria:**
- [ ] Secure storage of access and refresh tokens
- [ ] Automatic token refresh before expiration
- [ ] Proper token revocation on logout
- [ ] Handle token expiration gracefully
- [ ] Implement token validation

**Technical Details:**
- Store tokens securely (httpOnly cookies or secure storage)
- Implement refresh token rotation
- Add token expiration monitoring
- Handle concurrent refresh requests

### 3. User Profile Integration

**Acceptance Criteria:**
- [ ] Fetch user profile information
- [ ] Display user avatar and basic info
- [ ] Handle profile updates and changes
- [ ] Support multiple Google accounts
- [ ] Implement account switching

**Technical Details:**
- Use Google People API for profile data
- Cache profile information appropriately
- Handle profile picture loading and fallbacks
- Support account selection UI

### 4. Drive API Integration

**Acceptance Criteria:**
- [ ] Request appropriate Drive API scopes
- [ ] Implement file listing and search
- [ ] Support folder navigation
- [ ] Handle file permissions and sharing
- [ ] Implement file download and preview

**Technical Details:**
- Request minimal required scopes
- Implement pagination for large file lists
- Add file type filtering and search
- Handle Drive API rate limits

## Implementation Plan

### Phase 1: OAuth Setup (Days 1-2)
1. Configure Google Cloud Console project
2. Set up OAuth 2.0 credentials
3. Configure authorized redirect URIs
4. Set up domain verification

### Phase 2: Authentication Flow (Days 3-5)
1. Implement authorization code flow
2. Add PKCE for security
3. Handle redirect and callback processing
4. Implement error handling

### Phase 3: Token Management (Days 6-7)
1. Implement secure token storage
2. Add automatic refresh logic
3. Handle token expiration scenarios
4. Implement logout and revocation

### Phase 4: Integration Testing (Days 8-10)
1. Test complete authentication flow
2. Test token refresh scenarios
3. Test error handling and edge cases
4. Performance and security testing

## Configuration Requirements

### Google Cloud Console Setup
```yaml
OAuth 2.0 Client Configuration:
  Application Type: Web application
  Authorized JavaScript origins:
    - http://localhost:5173 (development)
    - https://your-domain.com (production)
  Authorized redirect URIs:
    - http://localhost:5173/auth/callback
    - https://your-domain.com/auth/callback
```

### Environment Variables
```env
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback

# OAuth Scopes
VITE_GOOGLE_SCOPES=openid,email,profile,https://www.googleapis.com/auth/drive.readonly
```

### Required Scopes
- `openid` - OpenID Connect authentication
- `email` - User email address
- `profile` - Basic profile information
- `https://www.googleapis.com/auth/drive.readonly` - Read-only Drive access
- `https://www.googleapis.com/auth/drive.file` - File-specific access (if needed)

## Security Considerations

### PKCE Implementation
```typescript
// Generate code verifier and challenge
const codeVerifier = generateCodeVerifier();
const codeChallenge = await generateCodeChallenge(codeVerifier);

// Store verifier securely for callback
sessionStorage.setItem('code_verifier', codeVerifier);
```

### State Parameter
```typescript
// Generate and store state for CSRF protection
const state = generateRandomString(32);
sessionStorage.setItem('oauth_state', state);
```

### Token Security
- Use httpOnly cookies for refresh tokens
- Implement secure token storage
- Add token encryption for sensitive data
- Implement proper CORS configuration

## API Integration

### Authentication Hook Updates
```typescript
// src/hooks/useAuth.ts
interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<void>;
  isAuthenticated: boolean;
}
```

### Google API Client Setup
```typescript
// src/lib/googleAuth.ts
export class GoogleAuthService {
  private oauth2Client: OAuth2Client;
  
  async initializeAuth(): Promise<void>;
  async signIn(): Promise<User>;
  async refreshTokens(): Promise<void>;
  async signOut(): Promise<void>;
  async getUserProfile(): Promise<UserProfile>;
}
```

## Testing Strategy

### Unit Tests
- [ ] Test OAuth flow components
- [ ] Test token management functions
- [ ] Test error handling scenarios
- [ ] Test security validations

### Integration Tests
- [ ] Test complete authentication flow
- [ ] Test token refresh scenarios
- [ ] Test Google API integration
- [ ] Test error recovery

### Security Tests
- [ ] Test CSRF protection
- [ ] Test token security
- [ ] Test scope validation
- [ ] Test unauthorized access prevention

## Error Handling

### OAuth Errors
```typescript
enum OAuthError {
  ACCESS_DENIED = 'access_denied',
  INVALID_REQUEST = 'invalid_request',
  INVALID_SCOPE = 'invalid_scope',
  SERVER_ERROR = 'server_error',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable'
}
```

### User-Friendly Messages
- "Please allow access to continue"
- "Authentication failed. Please try again."
- "Your session has expired. Please sign in again."
- "Unable to connect to Google. Please check your connection."

## Performance Considerations

### Token Refresh Strategy
- Refresh tokens 5 minutes before expiration
- Implement background refresh for active users
- Cache user profile data appropriately
- Minimize API calls through efficient caching

### Loading States
- Show loading indicators during OAuth flow
- Implement skeleton screens for profile loading
- Add progress indicators for file operations
- Handle slow network conditions gracefully

## Success Metrics

- [ ] Authentication success rate > 99%
- [ ] Token refresh success rate > 99.5%
- [ ] OAuth flow completion time < 10 seconds
- [ ] Zero security vulnerabilities
- [ ] User satisfaction with auth experience > 4.5/5

## Rollback Plan

- Maintain mock authentication as fallback
- Feature flag for OAuth vs mock authentication
- Database backup before user migration
- Monitoring alerts for authentication failures

## Documentation Requirements

- [ ] OAuth setup guide for developers
- [ ] User authentication flow documentation
- [ ] Troubleshooting guide for common issues
- [ ] Security best practices documentation