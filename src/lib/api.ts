// API client for HalluciFix AI Content Verification
export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export interface AnalysisRequest {
  content: string;
  options?: {
    sensitivity?: 'low' | 'medium' | 'high';
    includeSourceVerification?: boolean;
    maxHallucinations?: number;
  };
}

export interface AnalysisResponse {
  id: string;
  accuracy: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  processingTime: number;
  verificationSources: number;
  hallucinations: Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
    startIndex: number;
    endIndex: number;
  }>;
  metadata: {
    contentLength: number;
    timestamp: string;
    modelVersion: string;
  };
}

export interface BatchAnalysisRequest {
  documents: Array<{
    id: string;
    content: string;
    filename?: string;
  }>;
  options?: {
    sensitivity?: 'low' | 'medium' | 'high';
    includeSourceVerification?: boolean;
    maxHallucinations?: number;
  };
}

export interface BatchAnalysisResponse {
  batchId: string;
  status: 'processing' | 'completed' | 'failed';
  totalDocuments: number;
  completedDocuments: number;
  results: AnalysisResponse[];
  estimatedTimeRemaining?: number;
}

// Import the comprehensive error system
import { ApiErrorClassifier, type ApiError as ClassifiedApiError, type ErrorContext, errorManager } from './errors';
import { ApiLoggingMiddleware } from './logging/middleware';
import { logUtils, createRequestLogger, logger } from './logging';
import { performanceMonitor } from './performanceMonitor';

class HalluciFixApi {
  private config: ApiConfig;
  private logger = logger.child({ component: 'HalluciFixApi' });

  constructor(config: ApiConfig) {
    this.config = {
      timeout: 30000,
      ...config
    };
    
    this.logger.info('HalluciFixApi initialized', {
      baseUrl: config.baseUrl,
      timeout: this.config.timeout,
    });
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const method = options.method || 'GET';
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create request-scoped logger
    const requestLogger = createRequestLogger({
      method,
      url: endpoint,
    }).child({ requestId, endpoint });
    
    requestLogger.info('API request started', {
      method,
      endpoint,
      hasBody: !!options.body,
    });
    
    const startTime = Date.now();
    const performanceId = performanceMonitor.startOperation(`api.${method.toLowerCase()}.${endpoint}`, {
      method,
      endpoint,
      apiClient: 'HalluciFixApi',
    });
    
    // Use logging middleware for API calls
    const response = await ApiLoggingMiddleware.loggedFetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-API-Version': '1.0',
        'X-Request-ID': requestId,
        ...options.headers,
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    }, {
      endpoint,
      apiClient: 'HalluciFixApi',
      requestId,
    });

    const duration = Date.now() - startTime;
    
    // Record API performance metrics
    performanceMonitor.recordApiCall(endpoint, method, response.status, duration, {
      apiClient: 'HalluciFixApi',
      requestId,
    });
    
    if (!response.ok) {
      performanceMonitor.endOperation(performanceId, { 
        status: 'error',
        statusCode: response.status.toString(),
      });
      // Create error object for classification
      const errorResponse = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`
      }));
      
      requestLogger.error('API request failed', undefined, {
        statusCode: response.status,
        statusText: response.statusText,
        duration,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        errorResponse,
      });
      
      // Create a mock error object that matches expected structure
      const httpError = {
        response: {
          status: response.status,
          statusText: response.statusText,
          data: errorResponse,
          headers: Object.fromEntries(response.headers.entries())
        }
      };
      
      // Classify and handle the error
      const context: ErrorContext = {
        url: url,
        method,
        endpoint,
        component: 'HalluciFixApi',
        feature: 'api-client',
        requestId,
      };
      
      const classifiedError = errorManager.handleError(httpError, context);
      
      // Log the error with additional context
      logUtils.logError(classifiedError as Error, {
        apiEndpoint: endpoint,
        statusCode: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        requestId,
        duration,
      });
      
      throw classifiedError;
    }

    const responseData = await response.json();
    
    performanceMonitor.endOperation(performanceId, { 
      status: 'success',
      statusCode: response.status.toString(),
      responseSize: JSON.stringify(responseData).length.toString(),
    });
    
    requestLogger.info('API request completed successfully', {
      statusCode: response.status,
      duration,
      responseSize: JSON.stringify(responseData).length,
    });

    return responseData;
  }

  /**
   * Analyze a single piece of content for hallucinations
   */
  async analyzeContent(request: AnalysisRequest): Promise<AnalysisResponse> {
    return this.makeRequest<AnalysisResponse>('/api/v1/analyze', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Submit multiple documents for batch analysis
   */
  async submitBatchAnalysis(request: BatchAnalysisRequest): Promise<BatchAnalysisResponse> {
    return this.makeRequest<BatchAnalysisResponse>('/api/v1/batch/analyze', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get the status of a batch analysis job
   */
  async getBatchStatus(batchId: string): Promise<BatchAnalysisResponse> {
    return this.makeRequest<BatchAnalysisResponse>(`/api/v1/batch/${batchId}`);
  }

  /**
   * Get analysis history for the current user
   */
  async getAnalysisHistory(params?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    analyses: AnalysisResponse[];
    total: number;
    hasMore: boolean;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.startDate) queryParams.append('start_date', params.startDate);
    if (params?.endDate) queryParams.append('end_date', params.endDate);

    const query = queryParams.toString();
    const endpoint = `/api/v1/history${query ? `?${query}` : ''}`;
    
    return this.makeRequest(endpoint);
  }

  /**
   * Get API usage statistics
   */
  async getUsageStats(): Promise<{
    requestsToday: number;
    requestsThisMonth: number;
    remainingQuota: number;
    quotaResetDate: string;
  }> {
    return this.makeRequest('/api/v1/usage');
  }

  /**
   * Validate API key and get account information
   */
  async validateApiKey(): Promise<{
    valid: boolean;
    accountId: string;
    plan: string;
    permissions: string[];
  }> {
    return this.makeRequest('/api/v1/auth/validate');
  }
}

import { config } from './config';

// Configuration-based API client factory
export const createApiClient = (apiKey?: string, baseUrl?: string): HalluciFixApi | null => {
  // Use provided apiKey or get from configuration
  const effectiveApiKey = apiKey || config.ai.hallucifix?.apiKey;
  const effectiveBaseUrl = baseUrl || config.ai.hallucifix?.apiUrl || 'https://api.hallucifix.com';
  
  if (!effectiveApiKey) {
    console.warn('HalluciFix API key not configured. API client will not be available.');
    return null;
  }
  
  return new HalluciFixApi({
    apiKey: effectiveApiKey,
    baseUrl: effectiveBaseUrl,
  });
};

// Get configured API client instance
export const getConfiguredApiClient = (): HalluciFixApi | null => {
  return createApiClient();
};

// Export types for external use
export type {
  AnalysisRequest,
  AnalysisResponse,
  BatchAnalysisRequest,
  BatchAnalysisResponse,
  ApiConfig
};

// Re-export the classified API error type
export type { ApiError } from './errors';

export default HalluciFixApi;