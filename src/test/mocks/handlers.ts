import { http, HttpResponse } from 'msw';

// Mock API handlers for testing
export const handlers = [
  // Supabase Auth handlers
  http.post('https://test.supabase.co/auth/v1/token', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'mock-user-id',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
  }),

  // Supabase Database handlers
  http.get('https://test.supabase.co/rest/v1/analyses', () => {
    return HttpResponse.json([
      {
        id: 'mock-analysis-1',
        content: 'Test content for analysis',
        accuracy_score: 85.5,
        risk_level: 'medium',
        created_at: new Date().toISOString(),
        user_id: 'mock-user-id'
      }
    ]);
  }),

  http.post('https://test.supabase.co/rest/v1/analyses', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      id: 'mock-analysis-new',
      content: body.content,
      accuracy_score: 92.3,
      risk_level: 'low',
      created_at: new Date().toISOString(),
      user_id: 'mock-user-id'
    });
  }),

  // Google Drive API handlers
  http.get('https://www.googleapis.com/drive/v3/files', () => {
    return HttpResponse.json({
      files: [
        {
          id: 'mock-file-1',
          name: 'test-document.pdf',
          mimeType: 'application/pdf',
          size: '1024'
        }
      ]
    });
  }),

  http.get('https://www.googleapis.com/drive/v3/files/:fileId', ({ params }) => {
    return HttpResponse.json({
      id: params.fileId,
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      size: '1024',
      webViewLink: 'https://drive.google.com/file/d/mock-file-1/view'
    });
  }),

  // Stripe API handlers
  http.post('https://api.stripe.com/v1/payment_intents', () => {
    return HttpResponse.json({
      id: 'pi_mock_payment_intent',
      client_secret: 'pi_mock_payment_intent_secret',
      status: 'requires_payment_method',
      amount: 2000,
      currency: 'usd'
    });
  }),

  http.get('https://api.stripe.com/v1/customers/:customerId', ({ params }) => {
    return HttpResponse.json({
      id: params.customerId,
      email: 'test@example.com',
      created: Math.floor(Date.now() / 1000),
      subscriptions: {
        data: []
      }
    });
  }),

  // OpenAI API handlers
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response for testing purposes.'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25
      }
    });
  }),

  // Analysis service handlers
  http.post('/api/analyze', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      accuracy_score: 88.7,
      risk_level: 'medium',
      analysis_details: {
        content_length: body.content?.length || 0,
        sources_checked: 3,
        confidence_score: 0.887
      },
      recommendations: [
        'Verify claims with additional sources',
        'Check for recent updates to information'
      ]
    });
  }),

  // Error simulation handlers for testing error handling
  http.get('/api/error/500', () => {
    return new HttpResponse(null, { status: 500 });
  }),

  http.get('/api/error/404', () => {
    return new HttpResponse(null, { status: 404 });
  }),

  http.get('/api/error/network', () => {
    return HttpResponse.error();
  })
];