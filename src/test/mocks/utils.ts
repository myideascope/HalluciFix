import { http, HttpResponse } from 'msw';
import { server } from './server';
import { mockApiResponses } from './handlers';

/**
 * Utility functions for configuring MSW in tests
 */

// Mock API response scenarios
export const mockAnalysisScenarios = {
  /**
   * Mock a successful analysis with high accuracy
   */
  highAccuracy: (content: string = 'Test content') => {
    server.use(
      http.post('https://api.hallucifix.com/api/v1/analyze', () => {
        return HttpResponse.json(mockApiResponses.highAccuracy(content));
      })
    );
  },

  /**
   * Mock a successful analysis with low accuracy and many hallucinations
   */
  lowAccuracy: (content: string = 'Test content with exactly 99.7% accuracy and zero false positives') => {
    server.use(
      http.post('https://api.hallucifix.com/api/v1/analyze', () => {
        return HttpResponse.json(mockApiResponses.lowAccuracy(content));
      })
    );
  },

  /**
   * Mock an API error response
   */
  apiError: (status: number = 500, message: string = 'Internal Server Error') => {
    server.use(
      http.post('https://api.hallucifix.com/api/v1/analyze', () => {
        return new HttpResponse(
          JSON.stringify({
            code: 'API_ERROR',
            message
          }),
          { 
            status,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
  },

  /**
   * Mock a rate limit error
   */
  rateLimitError: () => {
    server.use(
      http.post('https://api.hallucifix.com/api/v1/analyze', () => {
        return mockApiResponses.rateLimitError();
      })
    );
  },

  /**
   * Mock a processing timeout
   */
  timeout: () => {
    server.use(
      http.post('https://api.hallucifix.com/api/v1/analyze', async () => {
        // Simulate a long delay that would cause timeout
        await new Promise(resolve => setTimeout(resolve, 35000));
        return HttpResponse.json(mockApiResponses.highAccuracy('Test content'));
      })
    );
  }
};

// Mock Google Drive scenarios
export const mockGoogleDriveScenarios = {
  /**
   * Mock successful file listing
   */
  successfulListing: (files?: any[]) => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', () => {
        return HttpResponse.json({ 
          files: files || [
            {
              id: 'test-file-1',
              name: 'Test Document.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              size: '15432',
              modifiedTime: new Date().toISOString(),
              webViewLink: 'https://docs.google.com/document/d/test-file-1/view'
            }
          ]
        });
      })
    );
  },

  /**
   * Mock authentication error
   */
  authError: () => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', () => {
        return new HttpResponse(null, { 
          status: 401,
          statusText: 'Unauthorized'
        });
      })
    );
  },

  /**
   * Mock successful file download
   */
  successfulDownload: (fileId: string, content: string) => {
    server.use(
      http.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('alt') === 'media') {
          return HttpResponse.text(content);
        }
        return HttpResponse.json({
          mimeType: 'text/plain',
          name: 'Test File.txt'
        });
      })
    );
  },

  /**
   * Mock empty file listing
   */
  emptyListing: () => {
    server.use(
      http.get('https://www.googleapis.com/drive/v3/files', () => {
        return HttpResponse.json({ files: [] });
      })
    );
  }
};

// Mock Supabase scenarios
export const mockSupabaseScenarios = {
  /**
   * Mock successful database operations
   */
  successfulOperations: () => {
    server.use(
      http.post('https://test.supabase.co/rest/v1/analysis_results', async ({ request }) => {
        const body = await request.json() as any;
        return HttpResponse.json([{
          ...body,
          id: `analysis_${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);
      }),
      
      http.get('https://test.supabase.co/rest/v1/analysis_results', () => {
        return HttpResponse.json([
          {
            id: 'test-analysis-1',
            user_id: 'test-user',
            content: 'Test analysis content',
            accuracy: 85.5,
            risk_level: 'medium',
            hallucinations: [],
            verification_sources: 5,
            processing_time: 1250,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      })
    );
  },

  /**
   * Mock database connection error
   */
  connectionError: () => {
    server.use(
      http.post('https://test.supabase.co/rest/v1/analysis_results', () => {
        return new HttpResponse(null, { 
          status: 503,
          statusText: 'Service Unavailable'
        });
      }),
      
      http.get('https://test.supabase.co/rest/v1/analysis_results', () => {
        return new HttpResponse(null, { 
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
  }
};

// Mock OpenAI scenarios (for RAG analysis)
export const mockOpenAIScenarios = {
  /**
   * Mock successful RAG analysis
   */
  successfulRAG: (claims: any[] = []) => {
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', () => {
        return HttpResponse.json({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                claims: claims.length > 0 ? claims : [
                  {
                    claim: 'test claim',
                    verification_status: 'verified',
                    confidence: 0.85,
                    explanation: 'This claim has been verified against reliable sources'
                  }
                ],
                overall_accuracy: 85.5,
                risk_assessment: 'medium'
              })
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 150,
            total_tokens: 250
          }
        });
      })
    );
  },

  /**
   * Mock OpenAI API error
   */
  apiError: (status: number = 500) => {
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', () => {
        return new HttpResponse(null, { 
          status,
          statusText: 'Internal Server Error'
        });
      })
    );
  }
};

// Utility to reset all mocks to default state
export const resetAllMocks = () => {
  server.resetHandlers();
};

// Utility to wait for async operations in tests
export const waitForMockResponse = (delay: number = 100) => {
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Utility to create custom mock responses
export const createCustomMockResponse = (endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', response: any, status: number = 200) => {
  const httpMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
  
  server.use(
    http[httpMethod](endpoint, () => {
      if (status >= 400) {
        return new HttpResponse(
          JSON.stringify(response),
          { 
            status,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      return HttpResponse.json(response);
    })
  );
};

// Export server for direct access in tests
export { server };