import { http, HttpResponse } from 'msw';
import { fixtures } from '../utils';

// Mock API handlers for testing
export const handlers = [
  // ===== SUPABASE AUTH HANDLERS =====
  
  // Token endpoint for authentication
  http.post('https://test.supabase.co/auth/v1/token', async ({ request }) => {
    const body = await request.json() as any;
    const grantType = body.grant_type;
    
    if (grantType === 'password') {
      return HttpResponse.json({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: fixtures.users.validUser
      });
    }
    
    if (grantType === 'refresh_token') {
      return HttpResponse.json({
        access_token: 'mock-refreshed-access-token',
        refresh_token: 'mock-new-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: fixtures.users.validUser
      });
    }
    
    return new HttpResponse(null, { status: 400 });
  }),

  // User session endpoint
  http.get('https://test.supabase.co/auth/v1/user', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.includes('Bearer')) {
      return new HttpResponse(null, { status: 401 });
    }
    
    return HttpResponse.json(fixtures.users.validUser);
  }),

  // Sign up endpoint
  http.post('https://test.supabase.co/auth/v1/signup', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      access_token: 'mock-signup-token',
      refresh_token: 'mock-signup-refresh-token',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        ...fixtures.users.validUser,
        email: body.email,
        email_confirmed_at: null
      }
    });
  }),

  // Sign out endpoint
  http.post('https://test.supabase.co/auth/v1/logout', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Password recovery
  http.post('https://test.supabase.co/auth/v1/recover', () => {
    return new HttpResponse(null, { status: 200 });
  }),

  // ===== SUPABASE DATABASE HANDLERS =====
  
  // Analyses table
  http.get('https://test.supabase.co/rest/v1/analyses', ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    let analyses = Object.values(fixtures.analyses);
    
    if (userId) {
      analyses = analyses.filter(analysis => analysis.user_id === userId);
    }
    
    const paginatedAnalyses = analyses.slice(offset, offset + limit);
    
    return HttpResponse.json(paginatedAnalyses, {
      headers: {
        'Content-Range': `${offset}-${offset + paginatedAnalyses.length - 1}/${analyses.length}`
      }
    });
  }),

  http.post('https://test.supabase.co/rest/v1/analyses', async ({ request }) => {
    const body = await request.json() as any;
    const newAnalysis = {
      id: `analysis-${Date.now()}`,
      content: body.content,
      accuracy_score: Math.floor(Math.random() * 100),
      risk_level: body.risk_level || 'medium',
      created_at: new Date().toISOString(),
      user_id: body.user_id || 'mock-user-id',
      analysis_details: {
        content_length: body.content?.length || 0,
        sources_checked: Math.floor(Math.random() * 5) + 1,
        confidence_score: Math.random(),
        processing_time_ms: Math.floor(Math.random() * 3000) + 500
      },
      recommendations: ['Mock recommendation']
    };
    
    return HttpResponse.json(newAnalysis, { status: 201 });
  }),

  http.get('https://test.supabase.co/rest/v1/analyses/:id', ({ params }) => {
    const analysis = Object.values(fixtures.analyses).find(a => a.id === params.id);
    if (!analysis) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(analysis);
  }),

  http.patch('https://test.supabase.co/rest/v1/analyses/:id', async ({ params, request }) => {
    const body = await request.json() as any;
    const analysis = Object.values(fixtures.analyses).find(a => a.id === params.id);
    if (!analysis) {
      return new HttpResponse(null, { status: 404 });
    }
    
    const updatedAnalysis = { ...analysis, ...body, updated_at: new Date().toISOString() };
    return HttpResponse.json(updatedAnalysis);
  }),

  http.delete('https://test.supabase.co/rest/v1/analyses/:id', ({ params }) => {
    const analysis = Object.values(fixtures.analyses).find(a => a.id === params.id);
    if (!analysis) {
      return new HttpResponse(null, { status: 404 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // Scheduled scans table
  http.get('https://test.supabase.co/rest/v1/scheduled_scans', ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const isActive = url.searchParams.get('is_active');
    
    let scans = Object.values(fixtures.scheduledScans);
    
    if (userId) {
      scans = scans.filter(scan => scan.user_id === userId);
    }
    
    if (isActive !== null) {
      scans = scans.filter(scan => scan.is_active === (isActive === 'true'));
    }
    
    return HttpResponse.json(scans);
  }),

  http.post('https://test.supabase.co/rest/v1/scheduled_scans', async ({ request }) => {
    const body = await request.json() as any;
    const newScan = {
      id: `scan-${Date.now()}`,
      name: body.name,
      frequency: body.frequency,
      source_type: body.source_type,
      source_config: body.source_config,
      is_active: body.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: body.user_id || 'mock-user-id',
      last_run: null,
      next_run: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    return HttpResponse.json(newScan, { status: 201 });
  }),

  http.get('https://test.supabase.co/rest/v1/scheduled_scans/:id', ({ params }) => {
    const scan = Object.values(fixtures.scheduledScans).find(s => s.id === params.id);
    if (!scan) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(scan);
  }),

  http.patch('https://test.supabase.co/rest/v1/scheduled_scans/:id', async ({ params, request }) => {
    const body = await request.json() as any;
    const scan = Object.values(fixtures.scheduledScans).find(s => s.id === params.id);
    if (!scan) {
      return new HttpResponse(null, { status: 404 });
    }
    
    const updatedScan = { ...scan, ...body, updated_at: new Date().toISOString() };
    return HttpResponse.json(updatedScan);
  }),

  http.delete('https://test.supabase.co/rest/v1/scheduled_scans/:id', ({ params }) => {
    const scan = Object.values(fixtures.scheduledScans).find(s => s.id === params.id);
    if (!scan) {
      return new HttpResponse(null, { status: 404 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // Users table (profiles)
  http.get('https://test.supabase.co/rest/v1/users', () => {
    return HttpResponse.json(Object.values(fixtures.users));
  }),

  http.get('https://test.supabase.co/rest/v1/users/:id', ({ params }) => {
    const user = Object.values(fixtures.users).find(u => u.id === params.id);
    if (!user) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(user);
  }),

  // ===== GOOGLE DRIVE API HANDLERS =====
  
  // List files
  http.get('https://www.googleapis.com/drive/v3/files', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const pageToken = url.searchParams.get('pageToken');
    
    // Mock file data
    const mockFiles = [
      {
        id: 'mock-file-1',
        name: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: '1024000',
        modifiedTime: new Date().toISOString(),
        webViewLink: 'https://drive.google.com/file/d/mock-file-1/view',
        parents: ['root']
      },
      {
        id: 'mock-file-2',
        name: 'presentation.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        size: '2048000',
        modifiedTime: new Date().toISOString(),
        webViewLink: 'https://drive.google.com/file/d/mock-file-2/view',
        parents: ['root']
      },
      {
        id: 'mock-file-3',
        name: 'spreadsheet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: '512000',
        modifiedTime: new Date().toISOString(),
        webViewLink: 'https://drive.google.com/file/d/mock-file-3/view',
        parents: ['root']
      },
      {
        id: 'mock-folder-1',
        name: 'Test Folder',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: new Date().toISOString(),
        webViewLink: 'https://drive.google.com/drive/folders/mock-folder-1',
        parents: ['root']
      }
    ];
    
    // Filter based on query
    let filteredFiles = mockFiles;
    if (query.includes('mimeType=')) {
      const mimeTypeMatch = query.match(/mimeType='([^']+)'/);
      if (mimeTypeMatch) {
        filteredFiles = mockFiles.filter(file => file.mimeType === mimeTypeMatch[1]);
      }
    }
    
    if (query.includes('name contains')) {
      const nameMatch = query.match(/name contains '([^']+)'/);
      if (nameMatch) {
        filteredFiles = mockFiles.filter(file => 
          file.name.toLowerCase().includes(nameMatch[1].toLowerCase())
        );
      }
    }
    
    // Simulate pagination
    const startIndex = pageToken ? parseInt(pageToken) : 0;
    const endIndex = Math.min(startIndex + pageSize, filteredFiles.length);
    const paginatedFiles = filteredFiles.slice(startIndex, endIndex);
    
    const response: any = {
      files: paginatedFiles
    };
    
    if (endIndex < filteredFiles.length) {
      response.nextPageToken = endIndex.toString();
    }
    
    return HttpResponse.json(response);
  }),

  // Get file metadata
  http.get('https://www.googleapis.com/drive/v3/files/:fileId', ({ params, request }) => {
    const url = new URL(request.url);
    const alt = url.searchParams.get('alt');
    
    // If alt=media, return file content
    if (alt === 'media') {
      return HttpResponse.text('Mock file content for testing purposes.');
    }
    
    // Return file metadata
    const mockFile = {
      id: params.fileId,
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      size: '1024000',
      modifiedTime: new Date().toISOString(),
      webViewLink: `https://drive.google.com/file/d/${params.fileId}/view`,
      parents: ['root'],
      capabilities: {
        canDownload: true,
        canEdit: true,
        canShare: true
      }
    };
    
    return HttpResponse.json(mockFile);
  }),

  // Export Google Workspace files
  http.get('https://www.googleapis.com/drive/v3/files/:fileId/export', ({ params, request }) => {
    const url = new URL(request.url);
    const mimeType = url.searchParams.get('mimeType');
    
    if (mimeType === 'text/plain') {
      return HttpResponse.text('Mock exported document content as plain text.');
    }
    
    if (mimeType === 'text/csv') {
      return HttpResponse.text('Column1,Column2,Column3\nValue1,Value2,Value3\nTest1,Test2,Test3');
    }
    
    return HttpResponse.text('Mock exported content');
  }),

  // ===== STRIPE API HANDLERS =====
  
  // Customers
  http.post('https://api.stripe.com/v1/customers', async ({ request }) => {
    try {
      const formData = await request.formData();
      const email = formData.get('email') as string;
      const name = formData.get('name') as string;
      
      return HttpResponse.json({
        id: `cus_${Math.random().toString(36).substr(2, 14)}`,
        email,
        name,
        created: Math.floor(Date.now() / 1000),
        subscriptions: { data: [] },
        default_source: null,
        sources: { data: [] }
      });
    } catch (error) {
      // Fallback for JSON body
      const body = await request.json() as any;
      return HttpResponse.json({
        id: `cus_${Math.random().toString(36).substr(2, 14)}`,
        email: body.email,
        name: body.name,
        created: Math.floor(Date.now() / 1000),
        subscriptions: { data: [] },
        default_source: null,
        sources: { data: [] }
      });
    }
  }),

  http.get('https://api.stripe.com/v1/customers/:customerId', ({ params }) => {
    return HttpResponse.json({
      id: params.customerId,
      email: 'test@example.com',
      name: 'Test User',
      created: Math.floor(Date.now() / 1000),
      subscriptions: { data: [] },
      default_source: null,
      sources: { data: [] }
    });
  }),

  // Subscriptions
  http.post('https://api.stripe.com/v1/subscriptions', async ({ request }) => {
    try {
      const formData = await request.formData();
      const customerId = formData.get('customer') as string;
      const priceId = formData.get('items[0][price]') as string;
      
      return HttpResponse.json({
        id: `sub_${Math.random().toString(36).substr(2, 14)}`,
        customer: customerId,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        items: {
          data: [{
            id: `si_${Math.random().toString(36).substr(2, 14)}`,
            price: {
              id: priceId,
              unit_amount: 2000,
              currency: 'usd',
              recurring: { interval: 'month' }
            }
          }]
        },
        latest_invoice: null,
        trial_end: null,
        cancel_at_period_end: false
      });
    } catch (error) {
      // Fallback for JSON body
      const body = await request.json() as any;
      return HttpResponse.json({
        id: `sub_${Math.random().toString(36).substr(2, 14)}`,
        customer: body.customer,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        items: {
          data: [{
            id: `si_${Math.random().toString(36).substr(2, 14)}`,
            price: {
              id: body.price_id || 'price_default',
              unit_amount: 2000,
              currency: 'usd',
              recurring: { interval: 'month' }
            }
          }]
        },
        latest_invoice: null,
        trial_end: null,
        cancel_at_period_end: false
      });
    }
  }),

  http.get('https://api.stripe.com/v1/subscriptions/:subscriptionId', ({ params }) => {
    return HttpResponse.json({
      id: params.subscriptionId,
      customer: 'cus_mock_customer',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      items: {
        data: [{
          id: 'si_mock_item',
          price: {
            id: 'price_mock',
            unit_amount: 2000,
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      },
      latest_invoice: null,
      trial_end: null,
      cancel_at_period_end: false
    });
  }),

  http.post('https://api.stripe.com/v1/subscriptions/:subscriptionId', async ({ params, request }) => {
    const formData = await request.formData();
    const cancelAtPeriodEnd = formData.get('cancel_at_period_end');
    
    return HttpResponse.json({
      id: params.subscriptionId,
      customer: 'cus_mock_customer',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      cancel_at_period_end: cancelAtPeriodEnd === 'true',
      items: {
        data: [{
          id: 'si_mock_item',
          price: {
            id: 'price_mock',
            unit_amount: 2000,
            currency: 'usd',
            recurring: { interval: 'month' }
          }
        }]
      }
    });
  }),

  // Checkout sessions
  http.post('https://api.stripe.com/v1/checkout/sessions', async ({ request }) => {
    try {
      const formData = await request.formData();
      const mode = formData.get('mode') as string;
      
      return HttpResponse.json({
        id: `cs_${Math.random().toString(36).substr(2, 14)}`,
        url: 'https://checkout.stripe.com/pay/mock-session-url',
        mode,
        payment_status: mode === 'payment' ? 'unpaid' : null,
        status: 'open',
        customer: 'cus_mock_customer'
      });
    } catch (error) {
      // Fallback for JSON body
      const body = await request.json() as any;
      return HttpResponse.json({
        id: `cs_${Math.random().toString(36).substr(2, 14)}`,
        url: 'https://checkout.stripe.com/pay/mock-session-url',
        mode: body.mode || 'subscription',
        payment_status: body.mode === 'payment' ? 'unpaid' : null,
        status: 'open',
        customer: 'cus_mock_customer'
      });
    }
  }),

  // Billing portal sessions
  http.post('https://api.stripe.com/v1/billing_portal/sessions', async ({ request }) => {
    const formData = await request.formData();
    const customerId = formData.get('customer') as string;
    
    return HttpResponse.json({
      id: `bps_${Math.random().toString(36).substr(2, 14)}`,
      url: 'https://billing.stripe.com/session/mock-portal-url',
      customer: customerId
    });
  }),

  // Payment intents
  http.post('https://api.stripe.com/v1/payment_intents', async ({ request }) => {
    const formData = await request.formData();
    const amount = formData.get('amount') as string;
    const currency = formData.get('currency') as string;
    
    return HttpResponse.json({
      id: `pi_${Math.random().toString(36).substr(2, 14)}`,
      client_secret: `pi_${Math.random().toString(36).substr(2, 14)}_secret_${Math.random().toString(36).substr(2, 10)}`,
      status: 'requires_payment_method',
      amount: parseInt(amount),
      currency,
      payment_method_types: ['card']
    });
  }),

  // Invoices
  http.get('https://api.stripe.com/v1/invoices/:invoiceId', ({ params }) => {
    return HttpResponse.json({
      id: params.invoiceId,
      customer: 'cus_mock_customer',
      subscription: 'sub_mock_subscription',
      status: 'paid',
      amount_paid: 2000,
      amount_due: 0,
      currency: 'usd',
      created: Math.floor(Date.now() / 1000),
      period_start: Math.floor(Date.now() / 1000),
      period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)
    });
  }),

  http.get('https://api.stripe.com/v1/invoices/upcoming', ({ request }) => {
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer');
    
    return HttpResponse.json({
      id: 'in_upcoming',
      customer: customerId,
      amount_due: 2000,
      currency: 'usd',
      period_start: Math.floor(Date.now() / 1000),
      period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      lines: {
        data: [{
          amount: 2000,
          currency: 'usd',
          description: 'Mock subscription item',
          proration: false
        }]
      }
    });
  }),

  // Charges
  http.get('https://api.stripe.com/v1/charges/:chargeId', ({ params }) => {
    return HttpResponse.json({
      id: params.chargeId,
      customer: 'cus_mock_customer',
      amount: 2000,
      currency: 'usd',
      status: 'succeeded',
      created: Math.floor(Date.now() / 1000),
      payment_method: 'card_mock',
      receipt_url: 'https://pay.stripe.com/receipts/mock-receipt'
    });
  }),

  // Promotion codes
  http.get('https://api.stripe.com/v1/promotion_codes', ({ request }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    
    if (code === 'VALID_PROMO') {
      return HttpResponse.json({
        data: [{
          id: 'promo_mock',
          code: 'VALID_PROMO',
          active: true,
          coupon: {
            id: 'coupon_mock',
            percent_off: 20,
            duration: 'once'
          }
        }]
      });
    }
    
    return HttpResponse.json({ data: [] });
  }),

  // Webhook endpoints
  http.get('https://api.stripe.com/v1/webhook_endpoints', () => {
    return HttpResponse.json({
      data: [{
        id: 'we_mock_endpoint',
        url: 'https://example.com/webhook',
        enabled_events: ['customer.created', 'invoice.paid'],
        status: 'enabled'
      }]
    });
  }),

  http.post('https://api.stripe.com/v1/webhook_endpoints', async ({ request }) => {
    const formData = await request.formData();
    const url = formData.get('url') as string;
    
    return HttpResponse.json({
      id: `we_${Math.random().toString(36).substr(2, 14)}`,
      url,
      enabled_events: ['customer.created', 'invoice.paid'],
      status: 'enabled',
      secret: `whsec_${Math.random().toString(36).substr(2, 32)}`
    });
  }),

  // Account info
  http.get('https://api.stripe.com/v1/accounts', () => {
    return HttpResponse.json({
      id: 'acct_mock_account',
      type: 'standard',
      country: 'US',
      email: 'test@stripe.com',
      charges_enabled: true,
      payouts_enabled: true
    });
  }),

  // ===== OPENAI API HANDLERS =====
  
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as any;
    const messages = body.messages || [];
    const model = body.model || 'gpt-4';
    
    // Simulate different responses based on content
    let responseContent = 'This is a mock AI response for testing purposes.';
    
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.content?.includes('analyze')) {
        responseContent = 'Based on my analysis, this content appears to have moderate accuracy with some claims that require verification.';
      } else if (lastMessage.content?.includes('hallucination')) {
        responseContent = 'I have detected potential hallucinations in the provided content. The accuracy score is 75%.';
      }
    }
    
    return HttpResponse.json({
      id: `chatcmpl-${Math.random().toString(36).substr(2, 10)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: Math.floor(Math.random() * 100) + 10,
        completion_tokens: Math.floor(Math.random() * 50) + 15,
        total_tokens: Math.floor(Math.random() * 150) + 25
      }
    });
  }),

  // ===== ANTHROPIC API HANDLERS =====
  
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = await request.json() as any;
    const messages = body.messages || [];
    const model = body.model || 'claude-3-sonnet-20240229';
    
    let responseContent = 'This is a mock Claude response for testing purposes.';
    
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.content?.includes('analyze')) {
        responseContent = 'I have analyzed the content and found several areas that require fact-checking.';
      } else if (lastMessage.content?.includes('hallucination')) {
        responseContent = 'The content contains potential inaccuracies that should be verified against reliable sources.';
      }
    }
    
    return HttpResponse.json({
      id: `msg_${Math.random().toString(36).substr(2, 10)}`,
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: responseContent
      }],
      model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: Math.floor(Math.random() * 100) + 10,
        output_tokens: Math.floor(Math.random() * 50) + 15
      }
    });
  }),

  // ===== HALLUCIFIX API HANDLERS =====
  
  // Single content analysis
  http.post('/api/v1/analyze', async ({ request }) => {
    const body = await request.json() as any;
    const content = body.content || '';
    const options = body.options || {};
    
    // Simulate analysis based on content length and keywords
    let accuracyScore = Math.floor(Math.random() * 40) + 60; // 60-100
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    
    if (content.includes('verified') || content.includes('confirmed')) {
      accuracyScore = Math.floor(Math.random() * 10) + 90; // 90-100
      riskLevel = 'low';
    } else if (content.includes('unverified') || content.includes('rumor')) {
      accuracyScore = Math.floor(Math.random() * 30) + 20; // 20-50
      riskLevel = 'high';
    } else if (content.includes('false') || content.includes('misinformation')) {
      accuracyScore = Math.floor(Math.random() * 20); // 0-20
      riskLevel = 'critical';
    }
    
    return HttpResponse.json({
      id: `analysis-${Date.now()}`,
      accuracy: accuracyScore,
      riskLevel,
      processingTime: Math.floor(Math.random() * 3000) + 500,
      verificationSources: Math.floor(Math.random() * 5) + 1,
      hallucinations: [
        {
          text: 'Sample hallucination detected',
          type: 'factual_error',
          confidence: 0.85,
          explanation: 'This claim could not be verified against reliable sources',
          startIndex: 10,
          endIndex: 35
        }
      ],
      metadata: {
        contentLength: content.length,
        timestamp: new Date().toISOString(),
        modelVersion: '1.0.0'
      }
    });
  }),

  // Batch analysis
  http.post('/api/v1/batch/analyze', async ({ request }) => {
    const body = await request.json() as any;
    const documents = body.documents || [];
    
    return HttpResponse.json({
      batchId: `batch-${Date.now()}`,
      status: 'processing',
      totalDocuments: documents.length,
      completedDocuments: 0,
      results: [],
      estimatedTimeRemaining: documents.length * 2000
    });
  }),

  // Batch status
  http.get('/api/v1/batch/:batchId', ({ params }) => {
    return HttpResponse.json({
      batchId: params.batchId,
      status: 'completed',
      totalDocuments: 3,
      completedDocuments: 3,
      results: [
        {
          id: 'analysis-1',
          accuracy: 85,
          riskLevel: 'medium',
          processingTime: 1500,
          verificationSources: 3,
          hallucinations: [],
          metadata: {
            contentLength: 150,
            timestamp: new Date().toISOString(),
            modelVersion: '1.0.0'
          }
        }
      ]
    });
  }),

  // Analysis history
  http.get('/api/v1/history', ({ request }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    const mockAnalyses = Object.values(fixtures.analyses).slice(offset, offset + limit);
    
    return HttpResponse.json({
      analyses: mockAnalyses,
      total: Object.keys(fixtures.analyses).length,
      hasMore: offset + limit < Object.keys(fixtures.analyses).length
    });
  }),

  // Usage stats
  http.get('/api/v1/usage', () => {
    return HttpResponse.json({
      requestsToday: Math.floor(Math.random() * 100),
      requestsThisMonth: Math.floor(Math.random() * 1000) + 500,
      remainingQuota: Math.floor(Math.random() * 500) + 100,
      quotaResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }),

  // API key validation
  http.get('/api/v1/auth/validate', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.includes('Bearer')) {
      return new HttpResponse(null, { status: 401 });
    }
    
    return HttpResponse.json({
      valid: true,
      accountId: 'acc_mock_account',
      plan: 'pro',
      permissions: ['analyze', 'batch_analyze', 'history']
    });
  }),

  // ===== ERROR SIMULATION HANDLERS =====
  
  // 500 Internal Server Error
  http.get('/api/error/500', () => {
    return new HttpResponse(null, { status: 500 });
  }),

  // 404 Not Found
  http.get('/api/error/404', () => {
    return new HttpResponse(null, { status: 404 });
  }),

  // Network Error
  http.get('/api/error/network', () => {
    return HttpResponse.error();
  }),

  // Rate Limit Error
  http.get('/api/error/rate-limit', () => {
    return new HttpResponse(null, { 
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Remaining': '0'
      }
    });
  }),

  // Authentication Error
  http.get('/api/error/auth', () => {
    return new HttpResponse(null, { status: 401 });
  }),

  // Timeout simulation
  http.get('/api/error/timeout', () => {
    return new Promise(() => {
      // Never resolves to simulate timeout
    });
  })
];