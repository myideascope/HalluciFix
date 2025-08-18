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

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

class HalluciFixApi {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = {
      timeout: 30000,
      ...config
    };
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-API-Version': '1.0',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(`API Error: ${error.message}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
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

// Default API client instance
export const createApiClient = (apiKey: string, baseUrl?: string): HalluciFixApi => {
  return new HalluciFixApi({
    apiKey,
    baseUrl: baseUrl || 'https://api.hallucifix.com',
  });
};

// Export types for external use
export type {
  AnalysisRequest,
  AnalysisResponse,
  BatchAnalysisRequest,
  BatchAnalysisResponse,
  ApiError,
  ApiConfig
};

export default HalluciFixApi;