# Spec: Replace Mock Services with Real API Integrations

**Priority:** Critical (P1)  
**Estimated Effort:** 2-3 weeks  
**Dependencies:** Environment configuration, API keys setup

## Overview

Replace all mock service implementations with real API integrations to enable production-ready functionality for AI analysis, Google Drive integration, and authentication services.

## Current State

- `analysisService.ts` falls back to mock analysis when API keys are missing
- `googleDrive.ts` uses hardcoded mock files and folders
- Authentication uses mock Google OAuth flow
- RAG service generates mock documents instead of real knowledge base queries

## Requirements

### 1. Real AI Analysis Integration

**Acceptance Criteria:**
- [ ] Integrate with OpenAI API for content analysis
- [ ] Implement proper error handling for API failures
- [ ] Add rate limiting and quota management
- [ ] Support multiple AI model providers (OpenAI, Anthropic, etc.)
- [ ] Maintain backward compatibility with existing analysis result format

**Technical Details:**
- Replace `mockAnalyzeContent()` in `analysisService.ts`
- Implement proper API client with retry logic
- Add model selection configuration
- Handle API rate limits gracefully

### 2. Google Drive API Integration

**Acceptance Criteria:**
- [ ] Implement real Google OAuth 2.0 flow
- [ ] Connect to actual Google Drive API
- [ ] Support file listing, searching, and downloading
- [ ] Handle folder navigation and permissions
- [ ] Implement proper error handling for API failures

**Technical Details:**
- Replace mock functions in `GoogleDrivePicker.tsx`
- Implement OAuth consent flow
- Add proper scope management
- Handle refresh token rotation

### 3. Authentication Service

**Acceptance Criteria:**
- [ ] Implement real Google OAuth integration
- [ ] Add JWT token validation
- [ ] Support session management and refresh
- [ ] Implement proper logout flow
- [ ] Add multi-provider authentication support

**Technical Details:**
- Update `useAuth.ts` hook
- Implement server-side token validation
- Add refresh token handling
- Support multiple OAuth providers

### 4. RAG Knowledge Base Integration

**Acceptance Criteria:**
- [ ] Connect to real knowledge base APIs
- [ ] Implement document indexing and search
- [ ] Support multiple knowledge sources
- [ ] Add relevance scoring and ranking
- [ ] Implement caching for performance

**Technical Details:**
- Replace mock functions in `ragService.ts`
- Implement vector search integration
- Add document preprocessing pipeline
- Support multiple knowledge base providers

## Implementation Plan

### Phase 1: AI Analysis Service (Week 1)
1. Set up OpenAI API client configuration
2. Implement real content analysis endpoints
3. Add error handling and fallback mechanisms
4. Test with various content types

### Phase 2: Google Drive Integration (Week 1-2)
1. Set up Google OAuth 2.0 configuration
2. Implement Drive API client
3. Replace mock file operations
4. Add proper error handling and permissions

### Phase 3: Authentication System (Week 2)
1. Implement real OAuth flows
2. Add JWT token management
3. Set up session handling
4. Test authentication edge cases

### Phase 4: RAG Integration (Week 2-3)
1. Set up knowledge base connections
2. Implement document search and retrieval
3. Add caching and performance optimization
4. Test with real knowledge sources

## Configuration Requirements

### Environment Variables
```env
# OpenAI Configuration
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4
VITE_OPENAI_MAX_TOKENS=4000

# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
VITE_GOOGLE_REDIRECT_URI=...

# Knowledge Base Configuration
VITE_KNOWLEDGE_BASE_URL=...
VITE_KNOWLEDGE_BASE_API_KEY=...
```

### API Rate Limits
- OpenAI: 3,500 requests/minute
- Google Drive: 1,000 requests/100 seconds
- Knowledge Base: Configure based on provider

## Testing Strategy

### Unit Tests
- [ ] Test API client configurations
- [ ] Test error handling scenarios
- [ ] Test rate limiting logic
- [ ] Test authentication flows

### Integration Tests
- [ ] Test end-to-end analysis workflow
- [ ] Test Google Drive file operations
- [ ] Test authentication with real providers
- [ ] Test knowledge base queries

### Performance Tests
- [ ] Test API response times
- [ ] Test concurrent request handling
- [ ] Test rate limit compliance
- [ ] Test caching effectiveness

## Risk Mitigation

### API Failures
- Implement circuit breaker pattern
- Add graceful degradation to mock services
- Implement retry logic with exponential backoff
- Add comprehensive error logging

### Rate Limiting
- Implement request queuing
- Add usage monitoring and alerts
- Implement user-based rate limiting
- Add cost monitoring for paid APIs

### Security
- Secure API key storage
- Implement proper OAuth scopes
- Add request validation and sanitization
- Implement audit logging

## Success Metrics

- [ ] 100% replacement of mock services
- [ ] API response time < 2 seconds (95th percentile)
- [ ] Error rate < 1% for API calls
- [ ] Authentication success rate > 99%
- [ ] Zero security vulnerabilities in implementation

## Dependencies

- Valid API keys for all services
- OAuth application registration
- Knowledge base setup and configuration
- Monitoring and logging infrastructure

## Rollback Plan

- Maintain mock service implementations as fallback
- Feature flags to switch between real and mock services
- Database rollback scripts if schema changes needed
- Monitoring alerts for service degradation