# HalluciFix API Reference

## Overview

The HalluciFix API provides programmatic access to our AI content verification and hallucination detection services. This RESTful API allows you to integrate content verification directly into your applications, workflows, and content management systems.

## Base URL
```
https://api.hallucifix.com
```

## Authentication

All API requests require authentication using your API key in the Authorization header:

```http
Authorization: Bearer YOUR_API_KEY
```

### Getting Your API Key
1. Sign in to your HalluciFix dashboard
2. Navigate to Settings → API Configuration
3. Copy your API key (keep it secure!)

## Rate Limits

| Plan | Requests/Hour | Requests/Month |
|------|---------------|----------------|
| Starter | 100 | 1,000 |
| Professional | 1,000 | 50,000 |
| Enterprise | Custom | Unlimited |

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400
```

## Content Analysis

### Analyze Single Content

Analyze a single piece of content for potential hallucinations.

```http
POST /api/v1/analyze
```

#### Request Body
```json
{
  "content": "string (required)",
  "options": {
    "sensitivity": "low" | "medium" | "high",
    "includeSourceVerification": boolean,
    "maxHallucinations": number,
    "enableRAG": boolean
  }
}
```

#### Parameters
- `content` (required): The text content to analyze (max 50,000 characters)
- `sensitivity`: Detection sensitivity level (default: "medium")
- `includeSourceVerification`: Enable cross-referencing with external sources (default: true)
- `maxHallucinations`: Maximum number of hallucinations to detect (default: 10)
- `enableRAG`: Enable Retrieval Augmented Generation enhancement (default: true)

#### Response
```json
{
  "id": "analysis_abc123",
  "accuracy": 87.5,
  "riskLevel": "medium",
  "processingTime": 1250,
  "verificationSources": 12,
  "hallucinations": [
    {
      "text": "exactly 73.4% of users",
      "type": "False Precision",
      "confidence": 0.89,
      "explanation": "Suspiciously specific statistic without verifiable source",
      "startIndex": 45,
      "endIndex": 67
    }
  ],
  "ragAnalysis": {
    "original_accuracy": 85.2,
    "rag_enhanced_accuracy": 87.5,
    "improvement_score": 2.3,
    "verified_claims": [
      {
        "claim": "Users prefer mobile interfaces",
        "verification_status": "verified",
        "confidence": 0.92,
        "supporting_documents": [...],
        "contradicting_documents": [],
        "explanation": "This claim is supported by 3 reliable sources"
      }
    ],
    "source_coverage": 85.0,
    "processing_time": 850
  },
  "metadata": {
    "contentLength": 1024,
    "timestamp": "2025-01-17T14:30:00Z",
    "modelVersion": "v2.1.3"
  }
}
```

#### Example Request
```javascript
const response = await fetch('https://api.hallucifix.com/api/v1/analyze', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    content: "According to recent studies, 99.7% of users prefer our new interface design.",
    options: {
      sensitivity: "high",
      enableRAG: true
    }
  })
});

const result = await response.json();
console.log(`Accuracy: ${result.accuracy}%`);
```

## Batch Analysis

### Submit Batch Analysis

Process multiple documents simultaneously for efficient bulk verification.

```http
POST /api/v1/batch/analyze
```

#### Request Body
```json
{
  "documents": [
    {
      "id": "doc_1",
      "content": "string",
      "filename": "string (optional)"
    }
  ],
  "options": {
    "sensitivity": "medium",
    "enableRAG": true,
    "priority": "normal" | "high"
  }
}
```

#### Response
```json
{
  "batchId": "batch_xyz789",
  "status": "processing",
  "totalDocuments": 5,
  "completedDocuments": 0,
  "results": [],
  "estimatedTimeRemaining": 45000,
  "createdAt": "2025-01-17T14:30:00Z"
}
```

### Get Batch Status

Check the progress and results of a batch analysis job.

```http
GET /api/v1/batch/{batchId}
```

#### Response
```json
{
  "batchId": "batch_xyz789",
  "status": "completed",
  "totalDocuments": 5,
  "completedDocuments": 5,
  "results": [
    {
      "documentId": "doc_1",
      "accuracy": 92.1,
      "riskLevel": "low",
      "hallucinations": [],
      "processingTime": 890
    }
  ],
  "summary": {
    "averageAccuracy": 89.4,
    "totalHallucinations": 7,
    "highRiskDocuments": 1,
    "processingTime": 4250
  }
}
```

## Analysis History

### Get Analysis History

Retrieve historical analysis results for your account.

```http
GET /api/v1/history
```

#### Query Parameters
- `limit`: Number of results to return (default: 50, max: 200)
- `offset`: Number of results to skip for pagination
- `startDate`: Filter results after this date (ISO 8601)
- `endDate`: Filter results before this date (ISO 8601)
- `riskLevel`: Filter by risk level ("low", "medium", "high", "critical")
- `analysisType`: Filter by type ("single", "batch", "scheduled")

#### Example
```http
GET /api/v1/history?limit=20&riskLevel=high&startDate=2025-01-01T00:00:00Z
```

#### Response
```json
{
  "analyses": [
    {
      "id": "analysis_abc123",
      "accuracy": 67.8,
      "riskLevel": "high",
      "timestamp": "2025-01-17T14:30:00Z",
      "hallucinations": 3,
      "analysisType": "single"
    }
  ],
  "total": 156,
  "hasMore": true,
  "pagination": {
    "limit": 20,
    "offset": 0,
    "nextOffset": 20
  }
}
```

## Account Management

### Get Usage Statistics

Monitor your API usage and remaining quota.

```http
GET /api/v1/usage
```

#### Response
```json
{
  "requestsToday": 45,
  "requestsThisMonth": 1250,
  "remainingQuota": 48750,
  "quotaResetDate": "2025-02-01T00:00:00Z",
  "plan": "professional",
  "usage": {
    "analyses": 1250,
    "batchJobs": 23,
    "scheduledScans": 156
  }
}
```

### Validate API Key

Verify your API key and get account information.

```http
GET /api/v1/auth/validate
```

#### Response
```json
{
  "valid": true,
  "accountId": "acc_123456",
  "plan": "professional",
  "permissions": [
    "analyze:content",
    "batch:process",
    "history:read",
    "usage:read"
  ],
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

## Webhooks

### Configure Webhooks

Set up webhooks to receive real-time notifications about analysis results.

```http
POST /api/v1/webhooks
```

#### Request Body
```json
{
  "url": "https://your-app.com/webhook/hallucifix",
  "events": [
    "analysis.completed",
    "batch.completed",
    "scan.completed",
    "analysis.high_risk"
  ],
  "secret": "your_webhook_secret"
}
```

### Webhook Events

#### analysis.completed
Triggered when a single content analysis is completed.

```json
{
  "event": "analysis.completed",
  "data": {
    "analysisId": "analysis_abc123",
    "accuracy": 87.5,
    "riskLevel": "medium",
    "hallucinations": 2,
    "timestamp": "2025-01-17T14:30:00Z"
  }
}
```

#### analysis.high_risk
Triggered when high or critical risk content is detected.

```json
{
  "event": "analysis.high_risk",
  "data": {
    "analysisId": "analysis_def456",
    "riskLevel": "critical",
    "accuracy": 45.2,
    "hallucinations": 8,
    "urgentReview": true
  }
}
```

## SDKs and Libraries

### JavaScript/TypeScript

#### Installation
```bash
npm install @hallucifix/api-client
```

#### Usage
```typescript
import { createApiClient } from '@hallucifix/api-client';

const client = createApiClient('your-api-key');

// Analyze content
const result = await client.analyzeContent({
  content: "Your content here...",
  options: {
    sensitivity: 'high',
    enableRAG: true
  }
});

// Batch analysis
const batchResult = await client.submitBatchAnalysis({
  documents: [
    { id: 'doc1', content: 'Content 1...' },
    { id: 'doc2', content: 'Content 2...' }
  ]
});

// Check batch status
const status = await client.getBatchStatus(batchResult.batchId);
```

### Python

#### Installation
```bash
pip install hallucifix-python
```

#### Usage
```python
from hallucifix import HalluciFixClient

client = HalluciFixClient(api_key='your-api-key')

# Analyze content
result = client.analyze_content(
    content="Your content here...",
    sensitivity='high',
    enable_rag=True
)

print(f"Accuracy: {result.accuracy}%")
print(f"Risk Level: {result.risk_level}")

# Batch analysis
batch_result = client.submit_batch_analysis([
    {"id": "doc1", "content": "Content 1..."},
    {"id": "doc2", "content": "Content 2..."}
])

# Monitor batch progress
status = client.get_batch_status(batch_result.batch_id)
```

### cURL Examples

#### Basic Analysis
```bash
curl -X POST https://api.hallucifix.com/api/v1/analyze \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "According to recent studies, 99.7% of users prefer our interface.",
    "options": {
      "sensitivity": "high",
      "enableRAG": true
    }
  }'
```

#### Batch Analysis
```bash
curl -X POST https://api.hallucifix.com/api/v1/batch/analyze \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "id": "doc1",
        "content": "First document content...",
        "filename": "document1.txt"
      }
    ],
    "options": {
      "sensitivity": "medium"
    }
  }'
```

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "timestamp": "2025-01-17T14:30:00Z",
      "requestId": "req_123456789",
      "field": "content"
    }
  }
}
```

### Error Codes

| Code | Status | Description | Solution |
|------|--------|-------------|----------|
| `INVALID_API_KEY` | 401 | API key is missing or invalid | Check your API key |
| `CONTENT_TOO_LARGE` | 413 | Content exceeds size limit | Reduce content size |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry |
| `INSUFFICIENT_QUOTA` | 402 | Account quota exceeded | Upgrade plan |
| `INVALID_CONTENT` | 400 | Content format is invalid | Check content format |
| `SERVICE_UNAVAILABLE` | 503 | Temporary service issue | Retry with backoff |

### Retry Logic Example
```javascript
async function analyzeWithRetry(content, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.analyzeContent({ content });
    } catch (error) {
      if (error.code === 'RATE_LIMIT_EXCEEDED' && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

## Advanced Features

### RAG Configuration

Configure Retrieval Augmented Generation settings for enhanced verification.

```http
POST /api/v1/rag/configure
```

#### Request Body
```json
{
  "knowledgeSources": [
    {
      "type": "wikipedia",
      "enabled": true,
      "reliability": 0.85
    },
    {
      "type": "academic",
      "enabled": true,
      "reliability": 0.95
    }
  ],
  "verificationThreshold": 0.7,
  "maxSourceAge": 365
}
```

### Custom Knowledge Sources

Add your own knowledge sources for domain-specific verification.

```http
POST /api/v1/knowledge-sources
```

#### Request Body
```json
{
  "name": "Company Knowledge Base",
  "description": "Internal documentation and policies",
  "url": "https://internal.company.com/api/search",
  "type": "custom",
  "reliability": 0.9,
  "authentication": {
    "type": "bearer",
    "token": "internal_api_token"
  }
}
```

## Integration Examples

### WordPress Plugin
```php
<?php
function verify_ai_content($content) {
    $api_key = get_option('hallucifix_api_key');
    
    $response = wp_remote_post('https://api.hallucifix.com/api/v1/analyze', [
        'headers' => [
            'Authorization' => 'Bearer ' . $api_key,
            'Content-Type' => 'application/json'
        ],
        'body' => json_encode([
            'content' => $content,
            'options' => [
                'sensitivity' => 'medium',
                'enableRAG' => true
            ]
        ])
    ]);
    
    $result = json_decode(wp_remote_retrieve_body($response), true);
    
    if ($result['riskLevel'] === 'high' || $result['riskLevel'] === 'critical') {
        // Flag for manual review
        flag_content_for_review($content, $result);
    }
    
    return $result;
}
?>
```

### Slack Bot Integration
```javascript
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

app.message(/analyze:(.+)/, async ({ message, say }) => {
  const content = message.text.replace('analyze:', '').trim();
  
  try {
    const result = await hallucifixClient.analyzeContent({ content });
    
    await say({
      text: `Analysis Results:`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Accuracy:* ${result.accuracy}%\n*Risk Level:* ${result.riskLevel}\n*Issues Found:* ${result.hallucinations.length}`
          }
        }
      ]
    });
  } catch (error) {
    await say(`Error analyzing content: ${error.message}`);
  }
});
```

### Google Docs Add-on
```javascript
function analyzeDocument() {
  const doc = DocumentApp.getActiveDocument();
  const content = doc.getBody().getText();
  
  const response = UrlFetchApp.fetch('https://api.hallucifix.com/api/v1/analyze', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + getApiKey(),
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      content: content,
      options: { enableRAG: true }
    })
  });
  
  const result = JSON.parse(response.getContentText());
  
  // Highlight hallucinations in document
  result.hallucinations.forEach(hallucination => {
    highlightText(doc, hallucination.text, hallucination.explanation);
  });
}
```

## Monitoring and Analytics

### Health Check
```http
GET /api/v1/health
```

#### Response
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 99.99,
  "responseTime": 45,
  "services": {
    "database": "healthy",
    "rag": "healthy",
    "analysis": "healthy"
  }
}
```

### System Metrics
```http
GET /api/v1/metrics
```

#### Response
```json
{
  "totalAnalyses": 1250000,
  "averageAccuracy": 89.2,
  "totalHallucinations": 45000,
  "averageProcessingTime": 1200,
  "ragEnhancementRate": 15.3,
  "systemLoad": {
    "cpu": 45,
    "memory": 67,
    "storage": 23
  }
}
```

## Best Practices

### Content Preparation
1. **Clean Text**: Remove formatting artifacts before analysis
2. **Reasonable Length**: Keep content under 10,000 characters for optimal performance
3. **Context**: Include sufficient context for accurate analysis
4. **Language**: Currently optimized for English content

### API Usage
1. **Batch When Possible**: Use batch analysis for multiple documents
2. **Cache Results**: Store results to avoid re-analyzing identical content
3. **Handle Errors**: Implement proper error handling and retry logic
4. **Monitor Usage**: Track API usage to avoid quota limits

### Performance Optimization
1. **Async Processing**: Use asynchronous requests for better performance
2. **Connection Pooling**: Reuse HTTP connections when possible
3. **Compression**: Enable gzip compression for large requests
4. **Timeout Handling**: Set appropriate timeouts for your use case

## Security Considerations

### API Key Security
- Store API keys securely (environment variables, key management systems)
- Rotate keys regularly
- Use different keys for different environments
- Monitor key usage for suspicious activity

### Data Privacy
- Content is not stored after analysis (unless explicitly configured)
- All data transmission is encrypted (TLS 1.3)
- Compliance with GDPR, CCPA, and other privacy regulations
- Data residency options available for enterprise customers

### Network Security
- IP whitelisting available for enterprise plans
- VPN and private network access options
- DDoS protection and rate limiting
- Security headers and CORS configuration

## Troubleshooting

### Common Issues

#### High Latency
**Symptoms**: API requests taking longer than expected
**Solutions**:
- Check network connectivity
- Reduce content size
- Use batch processing for multiple documents
- Consider geographic proximity to API servers

#### False Positives
**Symptoms**: Content flagged incorrectly as hallucinations
**Solutions**:
- Adjust sensitivity level to "low"
- Review flagged content manually
- Add custom knowledge sources for domain-specific content
- Contact support for model fine-tuning

#### Rate Limit Issues
**Symptoms**: 429 errors during high-volume usage
**Solutions**:
- Implement exponential backoff retry logic
- Distribute requests over time
- Consider upgrading to higher tier plan
- Use batch processing to reduce request count

### Debug Mode

Enable debug mode for detailed logging:

```javascript
const client = createApiClient('your-api-key', {
  debug: true,
  baseUrl: 'https://api.hallucifix.com'
});
```

### Support Channels

- **Technical Support**: tech-support@hallucifix.com
- **Documentation**: https://docs.hallucifix.com
- **Status Page**: https://status.hallucifix.com
- **Community Forum**: https://community.hallucifix.com

## Changelog

### v1.0.0 (Current)
- Initial API release
- Single content analysis
- Batch processing
- RAG enhancement
- Webhook support

### Upcoming Features
- Real-time streaming analysis
- Custom model training
- Advanced analytics API
- Multi-language support
- Video content analysis

## Legal

### Terms of Service
By using the HalluciFix API, you agree to our Terms of Service and Privacy Policy.

### Data Processing Agreement
Enterprise customers can request a Data Processing Agreement (DPA) for GDPR compliance.

### SLA
Enterprise plans include Service Level Agreements with guaranteed uptime and response times.

---

For additional support or questions, contact our technical team at tech-support@hallucifix.com