/**
 * AI Provider Interface
 * Defines the contract for AI service providers
 */

export interface AIAnalysisOptions {
  sensitivity?: 'low' | 'medium' | 'high';
  maxHallucinations?: number;
  temperature?: number;
  maxTokens?: number;
  includeSourceVerification?: boolean;
  enableRAG?: boolean;
}

export interface AIHallucination {
  text: string;
  type: string;
  confidence: number;
  explanation: string;
  startIndex: number;
  endIndex: number;
}

export interface AIAnalysisResult {
  id: string;
  accuracy: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hallucinations: AIHallucination[];
  verificationSources: number;
  processingTime: number;
  metadata: {
    provider: string;
    modelVersion: string;
    timestamp: string;
    tokenUsage?: {
      input: number;
      output: number;
      total: number;
    };
    contentLength: number;
  };
}

export interface AIProviderConfig {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  region?: string;
  endpoint?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface AIProviderStatus {
  name: string;
  enabled: boolean;
  healthy: boolean;
  lastCheck: string;
  errorCount: number;
  successCount: number;
  avgResponseTime: number;
  costToDate: number;
}

export abstract class AIProvider {
  protected config: AIProviderConfig;
  protected name: string;
  protected status: AIProviderStatus;

  constructor(name: string, config: AIProviderConfig) {
    this.name = name;
    this.config = config;
    this.status = {
      name,
      enabled: config.enabled,
      healthy: false,
      lastCheck: new Date().toISOString(),
      errorCount: 0,
      successCount: 0,
      avgResponseTime: 0,
      costToDate: 0,
    };
  }

  abstract initialize(): Promise<void>;
  abstract analyzeContent(content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult>;
  abstract healthCheck(): Promise<boolean>;
  abstract getModels(): Promise<string[]>;
  abstract estimateCost(content: string, options?: AIAnalysisOptions): Promise<number>;

  getName(): string {
    return this.name;
  }

  getStatus(): AIProviderStatus {
    return { ...this.status };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isHealthy(): boolean {
    return this.status.healthy;
  }

  protected updateStatus(updates: Partial<AIProviderStatus>): void {
    this.status = {
      ...this.status,
      ...updates,
      lastCheck: new Date().toISOString(),
    };
  }

  protected recordSuccess(responseTime: number, cost: number = 0): void {
    this.status.successCount++;
    this.status.avgResponseTime = (
      (this.status.avgResponseTime * (this.status.successCount - 1) + responseTime) / 
      this.status.successCount
    );
    this.status.costToDate += cost;
    this.status.healthy = true;
  }

  protected recordError(): void {
    this.status.errorCount++;
    // Mark as unhealthy if error rate is too high
    const totalRequests = this.status.successCount + this.status.errorCount;
    const errorRate = this.status.errorCount / totalRequests;
    if (errorRate > 0.1) { // 10% error rate threshold
      this.status.healthy = false;
    }
  }
}