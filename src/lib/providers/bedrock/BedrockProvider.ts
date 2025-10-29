/**
 * AWS Bedrock AI Provider
 * Implements AI analysis using AWS Bedrock foundation models
 */

import { BedrockRuntimeClient, InvokeModelCommand, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock-runtime';
import { AIProvider, AIAnalysisOptions, AIAnalysisResult, AIProviderConfig } from '../interfaces/AIProvider';
import { logger } from '../../logging';
import { performanceMonitor } from '../../performanceMonitor';

interface BedrockConfig extends AIProviderConfig {
  region: string;
  model: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface ClaudeRequest {
  anthropic_version: string;
  max_tokens: number;
  temperature: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

interface ClaudeResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class BedrockProvider extends AIProvider {
  private client: BedrockRuntimeClient;
  private logger = logger.child({ component: 'BedrockProvider' });
  private config: BedrockConfig;

  // Supported models and their configurations
  private static readonly SUPPORTED_MODELS = {
    'anthropic.claude-3-sonnet-20240229-v1:0': {
      name: 'Claude 3 Sonnet',
      inputCostPer1K: 0.003,
      outputCostPer1K: 0.015,
      maxTokens: 200000,
      contextWindow: 200000,
    },
    'anthropic.claude-3-haiku-20240307-v1:0': {
      name: 'Claude 3 Haiku',
      inputCostPer1K: 0.00025,
      outputCostPer1K: 0.00125,
      maxTokens: 200000,
      contextWindow: 200000,
    },
  };

  constructor(config: BedrockConfig) {
    super('bedrock', config);
    this.config = config;

    this.client = new BedrockRuntimeClient({
      region: config.region,
      credentials: config.accessKeyId && config.secretAccessKey ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      } : undefined,
    });
  }  as
ync initialize(): Promise<void> {
    try {
      this.logger.info('Initializing AWS Bedrock provider');
      await this.healthCheck();
      this.updateStatus({ healthy: true });
      this.logger.info('AWS Bedrock provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AWS Bedrock provider', error as Error);
      this.updateStatus({ healthy: false });
      throw error;
    }
  }

  async analyzeContent(content: string, options: AIAnalysisOptions = {}): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    try {
      const prompt = this.buildAnalysisPrompt(content, options);
      const response = await this.invokeModel(prompt, options);
      const analysisResult = this.parseAnalysisResponse(response, content, startTime);
      
      const processingTime = Date.now() - startTime;
      const cost = this.calculateCost(response.usage);
      this.recordSuccess(processingTime, cost);
      
      return analysisResult;
    } catch (error) {
      this.recordError();
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const command = new InvokeModelCommand({
        modelId: this.config.model,
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 10,
          temperature: 0,
          messages: [{ role: 'user', content: 'Say "healthy"' }],
        }),
        contentType: 'application/json',
        accept: 'application/json',
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const isHealthy = responseBody.content?.[0]?.text?.toLowerCase().includes('healthy');
      
      this.updateStatus({ healthy: isHealthy });
      return isHealthy;
    } catch (error) {
      this.updateStatus({ healthy: false });
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const command = new ListFoundationModelsCommand({});
      const response = await this.client.send(command);
      return response.modelSummaries?.map(model => model.modelId || '') || [];
    } catch (error) {
      return Object.keys(BedrockProvider.SUPPORTED_MODELS);
    }
  }

  async estimateCost(content: string, options: AIAnalysisOptions = {}): Promise<number> {
    const modelConfig = BedrockProvider.SUPPORTED_MODELS[this.config.model as keyof typeof BedrockProvider.SUPPORTED_MODELS];
    if (!modelConfig) return 0;

    const inputTokens = Math.ceil(content.length / 4);
    const outputTokens = options.maxTokens || 2000;
    const inputCost = (inputTokens / 1000) * modelConfig.inputCostPer1K;
    const outputCost = (outputTokens / 1000) * modelConfig.outputCostPer1K;
    return inputCost + outputCost;
  } 
 private buildAnalysisPrompt(content: string, options: AIAnalysisOptions): string {
    const sensitivity = options.sensitivity || 'medium';
    const maxHallucinations = options.maxHallucinations || 10;

    return `Human: Analyze this content for hallucinations and inaccuracies. Return JSON:
{
  "accuracy": <0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "hallucinations": [{"text": "<text>", "type": "<type>", "confidence": <0-1>, "explanation": "<explanation>", "startIndex": <num>, "endIndex": <num>}],
  "verificationSources": <number>,
  "summary": "<summary>"
}

Content: ${content.substring(0, 4000)}

Sensitivity: ${sensitivity}, Max issues: ${maxHallucinations}Ass
istant: I'll analyze this content for potential hallucinations and inaccuracies.`;
  }

  private async invokeModel(prompt: string, options: AIAnalysisOptions): Promise<ClaudeResponse> {
    const requestBody: ClaudeRequest = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.3,
      messages: [{ role: 'user', content: prompt }],
    };

    const command = new InvokeModelCommand({
      modelId: this.config.model,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json',
    });

    const response = await this.client.send(command);
    return JSON.parse(new TextDecoder().decode(response.body));
  }

  private parseAnalysisResponse(response: ClaudeResponse, content: string, startTime: number): AIAnalysisResult {
    const analysisText = response.content[0]?.text || '';
    
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      
      const analysis = JSON.parse(jsonMatch[0]);
      
      return {
        id: `bedrock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        accuracy: analysis.accuracy || 0,
        riskLevel: analysis.riskLevel || 'medium',
        hallucinations: analysis.hallucinations || [],
        verificationSources: analysis.verificationSources || 0,
        processingTime: Date.now() - startTime,
        metadata: {
          provider: 'bedrock',
          modelVersion: this.config.model,
          timestamp: new Date().toISOString(),
          tokenUsage: response.usage ? {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
            total: response.usage.input_tokens + response.usage.output_tokens,
          } : undefined,
          contentLength: content.length,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse Bedrock response: ${error.message}`);
    }
  }

  private calculateCost(usage?: { input_tokens: number; output_tokens: number }): number {
    if (!usage) return 0;
    
    const modelConfig = BedrockProvider.SUPPORTED_MODELS[this.config.model as keyof typeof BedrockProvider.SUPPORTED_MODELS];
    if (!modelConfig) return 0;

    const inputCost = (usage.input_tokens / 1000) * modelConfig.inputCostPer1K;
    const outputCost = (usage.output_tokens / 1000) * modelConfig.outputCostPer1K;
    return inputCost + outputCost;
  }
}