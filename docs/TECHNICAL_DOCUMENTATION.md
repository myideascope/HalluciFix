# HalluciFix Technical Documentation

## Table of Contents
1. [System Architecture](#system-architecture)
2. [API Reference](#api-reference)
3. [Database Schema](#database-schema)
4. [RAG Implementation](#rag-implementation)
5. [Authentication & Security](#authentication--security)
6. [Deployment Guide](#deployment-guide)
7. [Development Setup](#development-setup)
8. [Performance Optimization](#performance-optimization)
9. [Monitoring & Logging](#monitoring--logging)
10. [Troubleshooting](#troubleshooting)

## System Architecture

### Overview
HalluciFix is a modern web application built with React, TypeScript, and Supabase that provides enterprise-grade AI content verification and hallucination detection capabilities.

### Technology Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Build Tool**: Vite
- **Deployment**: Bolt Hosting / Netlify
- **AI Integration**: OpenAI API, Custom RAG System

### Core Components

#### 1. Frontend Architecture
```
src/
├── components/           # React components
│   ├── HallucinationAnalyzer.tsx
│   ├── Dashboard.tsx
│   ├── BatchAnalysis.tsx
│   ├── ScheduledScans.tsx
│   ├── ReviewSystem.tsx
│   ├── Analytics.tsx
│   ├── Settings.tsx
│   └── UserManagement.tsx
├── hooks/               # Custom React hooks
│   ├── useAuth.ts
│   ├── useDarkMode.ts
│   └── useToast.ts
├── lib/                 # Core services
│   ├── supabase.ts
│   ├── analysisService.ts
│   ├── ragService.ts
│   ├── api.ts
│   └── pdfParser.ts
└── types/              # TypeScript definitions
    ├── analysis.ts
    ├── user.ts
    ├── review.ts
    └── scheduledScan.ts
```

#### 2. Backend Architecture
```
supabase/
├── functions/          # Edge Functions
│   └── scan-executor/ # Scheduled scan processor
└── migrations/        # Database migrations
```

### Data Flow

1. **Content Input** → User submits content via UI
2. **Analysis Pipeline** → Content processed through detection algorithms
3. **RAG Enhancement** → Claims verified against knowledge sources
4. **Result Storage** → Analysis results saved to database
5. **Visualization** → Results displayed in dashboard and reports

## API Reference

### Base URL
```
https://api.hallucifix.com
```

### Authentication
All API requests require authentication using Bearer token:
```http
Authorization: Bearer YOUR_API_KEY
```

### Endpoints

#### Analyze Content
```http
POST /api/v1/analyze
```

**Request Body:**
```json
{
  "content": "string",
  "options": {
    "sensitivity": "low" | "medium" | "high",
    "includeSourceVerification": boolean,
    "maxHallucinations": number,
    "enableRAG": boolean
  }
}
```

**Response:**
```json
{
  "id": "string",
  "accuracy": number,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "processingTime": number,
  "verificationSources": number,
  "hallucinations": [
    {
      "text": "string",
      "type": "string",
      "confidence": number,
      "explanation": "string",
      "startIndex": number,
      "endIndex": number
    }
  ],
  "ragAnalysis": {
    "original_accuracy": number,
    "rag_enhanced_accuracy": number,
    "improvement_score": number,
    "verified_claims": [...],
    "source_coverage": number
  }
}
```

#### Batch Analysis
```http
POST /api/v1/batch/analyze
```

**Request Body:**
```json
{
  "documents": [
    {
      "id": "string",
      "content": "string",
      "filename": "string"
    }
  ],
  "options": {
    "sensitivity": "medium",
    "enableRAG": true
  }
}
```

#### Get Analysis History
```http
GET /api/v1/history?limit=50&offset=0
```

### Error Handling

All errors follow this format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "timestamp": "2025-01-17T14:30:00Z",
      "requestId": "req_123456789"
    }
  }
}
```

**Common Error Codes:**
- `INVALID_API_KEY` (401) - API key is missing or invalid
- `CONTENT_TOO_LARGE` (413) - Content exceeds size limits
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INSUFFICIENT_QUOTA` (402) - Account quota exceeded

## Database Schema

### Core Tables

#### users
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  role_id text DEFAULT 'viewer' NOT NULL,
  department text DEFAULT 'General' NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### analysis_results
```sql
CREATE TABLE analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  accuracy real NOT NULL,
  risk_level text NOT NULL,
  hallucinations jsonb DEFAULT '[]'::jsonb NOT NULL,
  verification_sources integer DEFAULT 0 NOT NULL,
  processing_time integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now(),
  analysis_type text DEFAULT 'single',
  batch_id text,
  scan_id text,
  filename text,
  full_content text
);
```

#### scheduled_scans
```sql
CREATE TABLE scheduled_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  frequency text NOT NULL,
  time text NOT NULL,
  sources jsonb DEFAULT '[]'::jsonb,
  google_drive_files jsonb DEFAULT '[]'::jsonb,
  enabled boolean DEFAULT true,
  last_run timestamptz,
  next_run timestamptz NOT NULL,
  status text DEFAULT 'active',
  results jsonb,
  created_at timestamptz DEFAULT now()
);
```

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- Users can only access their own data
- Admins can access all data where appropriate
- Proper authentication checks for all operations

## RAG Implementation

### Architecture
The RAG system enhances hallucination detection by:

1. **Claim Extraction**: Identifies verifiable statements in content
2. **Source Retrieval**: Searches reliable knowledge bases
3. **Verification**: Cross-references claims against sources
4. **Enhancement**: Adjusts accuracy scores based on verification

### Knowledge Sources
```typescript
interface KnowledgeSource {
  id: string;
  name: string;
  type: 'wikipedia' | 'academic' | 'news' | 'government' | 'custom';
  reliability_score: number; // 0.0 - 1.0
  enabled: boolean;
  metadata: {
    domain?: string;
    language?: string;
    category?: string;
  };
}
```

### Verification Process
```typescript
interface RAGAnalysisResult {
  claim: string;
  verification_status: 'verified' | 'contradicted' | 'unsupported' | 'partial';
  confidence: number;
  supporting_documents: RetrievedDocument[];
  contradicting_documents: RetrievedDocument[];
  explanation: string;
  reliability_assessment: {
    source_quality: number;
    consensus_level: number;
    recency: number;
    overall_score: number;
  };
}
```

## Authentication & Security

### Supabase Auth Integration
- Email/password authentication
- Google OAuth (configurable)
- JWT token management
- Automatic session handling

### Security Features
- Row Level Security (RLS) on all tables
- API key authentication for external access
- CORS configuration for web security
- Input validation and sanitization
- Rate limiting on API endpoints

### User Roles & Permissions
```typescript
enum UserRole {
  ADMIN = 1,     // Full system access
  MANAGER = 2,   // Department oversight
  EDITOR = 3,    // Content analysis
  VIEWER = 4     // Read-only access
}
```

## Deployment Guide

### Environment Variables
```bash
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI API (optional)
VITE_OPENAI_API_KEY=your_openai_api_key

# HalluciFix API (production)
VITE_HALLUCIFIX_API_KEY=your_hallucifix_api_key
```

### Build Process
```bash
# Install dependencies
npm install

# Build for production
npm run build

# Preview build locally
npm run preview
```

### Deployment Platforms
- **Bolt Hosting**: Automatic deployment from repository
- **Netlify**: Static site hosting with edge functions
- **Vercel**: Serverless deployment with API routes

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- Git

### Local Development
```bash
# Clone repository
git clone <repository-url>
cd hallucifix

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

### Database Setup
1. Create Supabase project
2. Run migrations from `supabase/migrations/`
3. Configure RLS policies
4. Set up authentication providers

## Performance Optimization

### Frontend Optimizations
- **Code Splitting**: Lazy loading of components
- **Bundle Optimization**: Tree shaking and minification
- **Image Optimization**: WebP format and lazy loading
- **Caching**: Service worker for offline functionality

### Backend Optimizations
- **Database Indexing**: Optimized queries with proper indexes
- **Connection Pooling**: Efficient database connections
- **Edge Functions**: Serverless processing for scalability
- **CDN**: Global content delivery network

### RAG Performance
- **Vector Caching**: Cache embeddings for faster retrieval
- **Source Prioritization**: Query high-reliability sources first
- **Parallel Processing**: Concurrent source verification
- **Result Caching**: Cache verification results for common claims

## Monitoring & Logging

### Application Monitoring
- **Error Tracking**: Comprehensive error logging
- **Performance Metrics**: Response times and throughput
- **User Analytics**: Usage patterns and feature adoption
- **Health Checks**: System status monitoring

### Database Monitoring
- **Query Performance**: Slow query identification
- **Connection Monitoring**: Database connection health
- **Storage Usage**: Table size and growth tracking
- **Backup Status**: Automated backup verification

### RAG System Monitoring
- **Source Availability**: Knowledge source health checks
- **Verification Accuracy**: RAG enhancement effectiveness
- **Processing Times**: Performance optimization tracking
- **Cache Hit Rates**: Optimization opportunity identification

## Troubleshooting

### Common Issues

#### Authentication Problems
```typescript
// Check Supabase configuration
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  console.error('No active session');
}
```

#### Database Connection Issues
```sql
-- Test database connectivity
SELECT version();
SELECT current_user;
```

#### RAG Performance Issues
```typescript
// Check knowledge source status
const metrics = ragService.getKnowledgeBaseMetrics();
console.log('RAG Metrics:', metrics);
```

### Debug Mode
Enable debug logging by setting:
```bash
VITE_DEBUG_MODE=true
```

### Performance Profiling
Use browser dev tools to profile:
- Component render times
- API request latency
- Memory usage patterns
- Bundle size analysis

## API Client Libraries

### JavaScript/TypeScript
```bash
npm install @hallucifix/api-client
```

```typescript
import { createApiClient } from '@hallucifix/api-client';

const client = createApiClient('your-api-key');
const result = await client.analyzeContent({
  content: "Content to analyze...",
  options: { enableRAG: true }
});
```

### Python
```bash
pip install hallucifix-python
```

```python
from hallucifix import HalluciFixClient

client = HalluciFixClient(api_key='your-api-key')
result = client.analyze_content(
    content="Content to analyze...",
    enable_rag=True
)
```

## Edge Functions

### Scan Executor
Located at `supabase/functions/scan-executor/index.ts`

**Purpose**: Processes scheduled scans automatically
**Trigger**: Cron job or manual invocation
**Features**:
- Batch processing of due scans
- Google Drive integration
- Error handling and retry logic
- Performance monitoring

### Deployment
Edge functions are automatically deployed to Supabase when migrations run.

## Security Considerations

### Data Protection
- All data encrypted in transit (TLS 1.3)
- Database encryption at rest
- API key rotation capabilities
- Audit logging for compliance

### Privacy Compliance
- GDPR compliant data handling
- User data deletion capabilities
- Consent management
- Data retention policies

### Access Control
- Role-based access control (RBAC)
- Multi-factor authentication support
- Session management
- API rate limiting

## Scaling Considerations

### Horizontal Scaling
- Stateless application design
- Database read replicas
- CDN for static assets
- Load balancing capabilities

### Vertical Scaling
- Database connection pooling
- Memory optimization
- CPU-intensive task offloading
- Caching strategies

## Integration Examples

### Webhook Integration
```typescript
// Set up webhook endpoint
app.post('/webhook/hallucifix', (req, res) => {
  const { analysisId, accuracy, riskLevel } = req.body;
  
  if (riskLevel === 'critical') {
    // Trigger immediate review workflow
    notifyReviewTeam(analysisId);
  }
  
  res.status(200).json({ received: true });
});
```

### Batch Processing Integration
```typescript
// Process documents from external system
const documents = await fetchDocumentsFromCMS();
const results = await client.submitBatchAnalysis({
  documents: documents.map(doc => ({
    id: doc.id,
    content: doc.content,
    filename: doc.filename
  }))
});
```

## Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

### Performance Tests
```bash
npm run test:performance
```

## Maintenance

### Regular Tasks
- Database maintenance and optimization
- Security updates and patches
- Performance monitoring and tuning
- Backup verification
- Log rotation and cleanup

### Monitoring Checklist
- [ ] Application uptime
- [ ] Database performance
- [ ] API response times
- [ ] Error rates
- [ ] User activity
- [ ] Storage usage
- [ ] Security alerts

## Support

### Documentation
- API Reference: `/api-docs`
- User Guide: `/docs/user-guide`
- FAQ: `/docs/faq`

### Contact
- Technical Support: tech-support@hallucifix.com
- Sales: sales@hallucifix.com
- Security: security@hallucifix.com