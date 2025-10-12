import { http, HttpResponse } from 'msw';
import { AnalysisResponse, BatchAnalysisResponse } from '../../lib/api';
import { GoogleDriveFile } from '../../lib/googleDrive';

// Mock data generators
const generateMockAnalysisResponse = (content: string): AnalysisResponse => {
  const suspiciousPatterns = [
    { pattern: /exactly \d+\.\d+%/gi, type: 'False Precision' },
    { pattern: /perfect 100%/gi, type: 'Impossible Metric' },
    { pattern: /zero complaints/gi, type: 'Unverifiable Claim' },
    { pattern: /unprecedented/gi, type: 'Exaggerated Language' },
    { pattern: /revolutionary leap/gi, type: 'Exaggerated Language' },
    { pattern: /\d+,?\d{0,3},?\d{0,3} times faster/gi, type: 'Performance Exaggeration' },
    { pattern: /99\.\d+% accuracy/gi, type: 'Unrealistic Accuracy' },
    { pattern: /according to (?:recent )?stud(?:y|ies)/gi, type: 'Unverifiable Attribution' },
    { pattern: /research (?:shows|indicates|demonstrates)/gi, type: 'Unverifiable Attribution' },
    { pattern: /\b(?:all|every|100%) (?:users?|customers?|clients?)/gi, type: 'Absolute Claim' }
  ];

  let accuracy = 85 + Math.random() * 10;
  const hallucinations = [];

  suspiciousPatterns.forEach((patternObj) => {
    const matches = content.match(patternObj.pattern);
    if (matches) {
      accuracy -= matches.length * (5 + Math.random() * 10);
      matches.forEach(match => {
        const startIndex = content.indexOf(match);
        hallucinations.push({
          text: match,
          type: patternObj.type,
          confidence: 0.7 + Math.random() * 0.25,
          explanation: `Potentially problematic claim: "${match}"`,
          startIndex,
          endIndex: startIndex + match.length
        });
      });
    }
  });

  accuracy = Math.max(0, accuracy);
  const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';

  return {
    id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    accuracy: parseFloat(accuracy.toFixed(1)),
    riskLevel: riskLevel as 'low' | 'medium' | 'high' | 'critical',
    processingTime: Math.floor(Math.random() * 1000) + 500,
    verificationSources: Math.floor(Math.random() * 15) + 5,
    hallucinations,
    metadata: {
      contentLength: content.length,
      timestamp: new Date().toISOString(),
      modelVersion: '1.0.0'
    }
  };
};

const generateMockGoogleDriveFiles = (): GoogleDriveFile[] => [
  {
    id: 'file1',
    name: 'Test Document.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: '15432',
    modifiedTime: new Date(Date.now() - 86400000).toISOString(),
    webViewLink: 'https://docs.google.com/document/d/file1/view',
    parents: ['root']
  },
  {
    id: 'file2',
    name: 'Analysis Report.pdf',
    mimeType: 'application/pdf',
    size: '234567',
    modifiedTime: new Date(Date.now() - 172800000).toISOString(),
    webViewLink: 'https://drive.google.com/file/d/file2/view',
    parents: ['root']
  },
  {
    id: 'file3',
    name: 'Marketing Content.txt',
    mimeType: 'text/plain',
    size: '8765',
    modifiedTime: new Date(Date.now() - 259200000).toISOString(),
    webViewLink: 'https://drive.google.com/file/d/file3/view',
    parents: ['root']
  }
];

// API Handlers
export const handlers = [
  // HalluciFix API - Single Analysis
  http.post('https://api.hallucifix.com/api/v1/analyze', async ({ request }) => {
    const body = await request.json() as { content: string; options?: any };
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = generateMockAnalysisResponse(body.content);
    return HttpResponse.json(response);
  }),

  // HalluciFix API - Batch Analysis
  http.post('https://api.hallucifix.com/api/v1/batch/analyze', async ({ request }) => {
    const body = await request.json() as { documents: Array<{ id: string; content: string; filename?: string }> };
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const results = body.documents.map(doc => generateMockAnalysisResponse(doc.content));
    
    const response: BatchAnalysisResponse = {
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'completed',
      totalDocuments: body.documents.length,
      completedDocuments: body.documents.length,
      results
    };
    
    return HttpResponse.json(response);
  }),

  // HalluciFix API - Batch Status
  http.get('https://api.hallucifix.com/api/v1/batch/:batchId', ({ params }) => {
    const response: BatchAnalysisResponse = {
      batchId: params.batchId as string,
      status: 'completed',
      totalDocuments: 3,
      completedDocuments: 3,
      results: []
    };
    
    return HttpResponse.json(response);
  }),

  // HalluciFix API - Analysis History
  http.get('https://api.hallucifix.com/api/v1/history', ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    const mockAnalyses = Array.from({ length: limit }, (_, i) => 
      generateMockAnalysisResponse(`Mock content ${offset + i + 1}`)
    );
    
    return HttpResponse.json({
      analyses: mockAnalyses,
      total: 50,
      hasMore: offset + limit < 50
    });
  }),

  // HalluciFix API - Usage Stats
  http.get('https://api.hallucifix.com/api/v1/usage', () => {
    return HttpResponse.json({
      requestsToday: 45,
      requestsThisMonth: 1250,
      remainingQuota: 8750,
      quotaResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }),

  // HalluciFix API - Validate API Key
  http.get('https://api.hallucifix.com/api/v1/auth/validate', () => {
    return HttpResponse.json({
      valid: true,
      accountId: 'test-account-123',
      plan: 'professional',
      permissions: ['analyze', 'batch', 'history', 'usage']
    });
  }),

  // Google Drive API - List Files
  http.get('https://www.googleapis.com/drive/v3/files', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    
    let files = generateMockGoogleDriveFiles();
    
    // Filter based on query
    if (query.includes('mimeType=')) {
      const mimeTypeMatch = query.match(/mimeType='([^']+)'/);
      if (mimeTypeMatch) {
        files = files.filter(file => file.mimeType === mimeTypeMatch[1]);
      }
    }
    
    if (query.includes('name contains')) {
      const nameMatch = query.match(/name contains '([^']+)'/);
      if (nameMatch) {
        files = files.filter(file => 
          file.name.toLowerCase().includes(nameMatch[1].toLowerCase())
        );
      }
    }
    
    return HttpResponse.json({ files });
  }),

  // Google Drive API - Get File Metadata
  http.get('https://www.googleapis.com/drive/v3/files/:fileId', ({ params }) => {
    const fileId = params.fileId as string;
    const files = generateMockGoogleDriveFiles();
    const file = files.find(f => f.id === fileId);
    
    if (!file) {
      return new HttpResponse(null, { status: 404 });
    }
    
    return HttpResponse.json({
      mimeType: file.mimeType,
      name: file.name
    });
  }),

  // Google Drive API - Download File
  http.get('https://www.googleapis.com/drive/v3/files/:fileId', ({ request, params }) => {
    const url = new URL(request.url);
    const alt = url.searchParams.get('alt');
    
    if (alt === 'media') {
      const fileId = params.fileId as string;
      
      // Return mock file content based on file ID
      const mockContent = {
        'file1': 'This is a test document with some content that might contain hallucinations. Our system achieves exactly 99.7% accuracy with zero false positives.',
        'file2': 'PDF content: Revolutionary AI breakthrough shows unprecedented results in all test cases.',
        'file3': 'Marketing content: According to recent studies, our product is 1000 times faster than competitors.'
      };
      
      return HttpResponse.text(mockContent[fileId as keyof typeof mockContent] || 'Default file content');
    }
    
    return new HttpResponse(null, { status: 400 });
  }),

  // Google Drive API - Export File
  http.get('https://www.googleapis.com/drive/v3/files/:fileId/export', ({ params, request }) => {
    const url = new URL(request.url);
    const mimeType = url.searchParams.get('mimeType');
    const fileId = params.fileId as string;
    
    if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      const mockContent = `Exported content from Google Docs file ${fileId}. This content may contain some claims that need verification.`;
      return HttpResponse.text(mockContent);
    }
    
    return new HttpResponse(null, { status: 400 });
  }),

  // OpenAI API - Chat Completions (for RAG analysis)
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as any;
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Mock response based on the request
    const mockResponse = {
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            claims: [
              {
                claim: 'exactly 99.7% accuracy',
                verification_status: 'contradicted',
                confidence: 0.85,
                explanation: 'This level of precision is typically not achievable in real-world AI systems'
              },
              {
                claim: 'zero false positives',
                verification_status: 'contradicted',
                confidence: 0.90,
                explanation: 'Absolute claims like "zero" are statistically improbable in AI systems'
              }
            ],
            overall_accuracy: 65.5,
            risk_assessment: 'high'
          })
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 150,
        total_tokens: 250
      }
    };
    
    return HttpResponse.json(mockResponse);
  }),

  // Stripe API - Create Payment Intent
  http.post('https://api.stripe.com/v1/payment_intents', async ({ request }) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return HttpResponse.json({
      id: 'pi_mock_payment_intent',
      object: 'payment_intent',
      amount: 2000,
      currency: 'usd',
      status: 'requires_payment_method',
      client_secret: 'pi_mock_payment_intent_secret_mock'
    });
  }),

  // Stripe API - Retrieve Payment Intent
  http.get('https://api.stripe.com/v1/payment_intents/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      object: 'payment_intent',
      amount: 2000,
      currency: 'usd',
      status: 'succeeded',
      client_secret: `${params.id}_secret_mock`
    });
  }),

  // Supabase API - Mock responses for database operations
  http.post('https://test.supabase.co/rest/v1/analysis_results', async ({ request }) => {
    const body = await request.json() as any;
    
    return HttpResponse.json([{
      ...body,
      id: `analysis_${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);
  }),

  http.get('https://test.supabase.co/rest/v1/analysis_results', ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    
    const mockResults = Array.from({ length: 5 }, (_, i) => ({
      id: `analysis_${i + 1}`,
      user_id: userId || 'test-user',
      content: `Mock analysis content ${i + 1}`,
      accuracy: 80 + Math.random() * 20,
      risk_level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
      hallucinations: [],
      verification_sources: Math.floor(Math.random() * 10) + 5,
      processing_time: Math.floor(Math.random() * 1000) + 500,
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      updated_at: new Date(Date.now() - i * 86400000).toISOString()
    }));
    
    return HttpResponse.json(mockResults);
  }),

  // Error scenarios for testing
  http.post('https://api.hallucifix.com/api/v1/analyze-error', () => {
    return new HttpResponse(null, { 
      status: 500,
      statusText: 'Internal Server Error'
    });
  }),

  http.get('https://www.googleapis.com/drive/v3/files-error', () => {
    return new HttpResponse(null, { 
      status: 401,
      statusText: 'Unauthorized'
    });
  })
];

// Utility functions for tests
export const createMockAnalysisResponse = generateMockAnalysisResponse;
export const createMockGoogleDriveFiles = generateMockGoogleDriveFiles;

// Request/response utilities for different test scenarios
export const mockApiResponses = {
  // High accuracy analysis
  highAccuracy: (content: string): AnalysisResponse => ({
    ...generateMockAnalysisResponse(content),
    accuracy: 95.5,
    riskLevel: 'low',
    hallucinations: []
  }),
  
  // Low accuracy analysis with many hallucinations
  lowAccuracy: (content: string): AnalysisResponse => ({
    ...generateMockAnalysisResponse(content),
    accuracy: 45.2,
    riskLevel: 'critical',
    hallucinations: [
      {
        text: 'exactly 99.7% accuracy',
        type: 'False Precision',
        confidence: 0.95,
        explanation: 'Suspiciously specific statistic without verifiable source',
        startIndex: 0,
        endIndex: 20
      },
      {
        text: 'zero false positives',
        type: 'Impossible Metric',
        confidence: 0.90,
        explanation: 'Absolute claims are statistically improbable',
        startIndex: 25,
        endIndex: 43
      }
    ]
  }),
  
  // Processing error
  processingError: () => new HttpResponse(
    JSON.stringify({
      code: 'PROCESSING_ERROR',
      message: 'Failed to process content'
    }),
    { 
      status: 422,
      headers: { 'Content-Type': 'application/json' }
    }
  ),
  
  // Rate limit error
  rateLimitError: () => new HttpResponse(
    JSON.stringify({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests'
    }),
    { 
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    }
  )
};