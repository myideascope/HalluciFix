/**
 * AWS Bedrock AI Provider
 * Implements AI analysis using AWS Bedrock foundation models
 */

import { BedrockRuntimeClient, InvokeModelCommand, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock-runtime';
import { AIProvider, AIAnalysisOptions, AIAnalysisResult, AIProviderConfig } from '../interfaces/AIProvider';
import { logger } from '../../logging';
import { performanceMonitor } from '../../performanceMonitor';
import { bedrockConfig, getAwsCredentials } from '../../aws-config';

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
      capabilities: ['analysis', 'reasoning', 'code'],
      recommendedFor: ['balanced', 'production'],
    },
    'anthropic.claude-3-haiku-20240307-v1:0': {
      name: 'Claude 3 Haiku',
      inputCostPer1K: 0.00025,
      outputCostPer1K: 0.00125,
      maxTokens: 200000,
      contextWindow: 200000,
      capabilities: ['analysis', 'speed'],
      recommendedFor: ['fast', 'cost-effective'],
    },
    'anthropic.claude-3-opus-20240229-v1:0': {
      name: 'Claude 3 Opus',
      inputCostPer1K: 0.015,
      outputCostPer1K: 0.075,
      maxTokens: 200000,
      contextWindow: 200000,
      capabilities: ['analysis', 'reasoning', 'complex-tasks'],
      recommendedFor: ['high-accuracy', 'complex'],
    },
    'amazon.titan-text-express-v1': {
      name: 'Amazon Titan Text Express',
      inputCostPer1K: 0.0008,
      outputCostPer1K: 0.0016,
      maxTokens: 8000,
      contextWindow: 8000,
      capabilities: ['analysis', 'text-generation'],
      recommendedFor: ['cost-effective', 'simple'],
    },
  };

  constructor(config: BedrockConfig) {
    super('bedrock', config);
    this.config = config;

    // Use enhanced AWS configuration
    const credentials = getAwsCredentials();
    
    this.client = new BedrockRuntimeClient({
      region: config.region || bedrockConfig.region,
      credentials,
      maxAttempts: 3,
      retryMode: 'adaptive',
    });

    this.logger.info('Bedrock provider initialized', {
      region: config.region || bedrockConfig.region,
      model: config.model || bedrockConfig.model,
      hasCredentials: !!credentials,
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
    const performanceId = performanceMonitor.startOperation('bedrock_analyze_content', {
      contentLength: content.length.toString(),
      model: this.config.model,
      sensitivity: options.sensitivity || 'medium',
    });

    try {
      // Select optimal model based on content and options
      const selectedModel = this.selectOptimalModel(content, options);
      
      this.logger.debug('Starting Bedrock analysis', {
        contentLength: content.length,
        selectedModel,
        sensitivity: options.sensitivity,
        maxTokens: options.maxTokens,
      });

      const prompt = this.buildAnalysisPrompt(content, options);
      const response = await this.invokeModel(prompt, options, selectedModel);
      const analysisResult = this.parseAnalysisResponse(response, content, startTime, selectedModel);
      
      const processingTime = Date.now() - startTime;
      const cost = this.calculateCost(response.usage, selectedModel);
      
      this.recordSuccess(processingTime, cost);
      
      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        model: selectedModel,
        accuracy: analysisResult.accuracy.toString(),
        processingTime: processingTime.toString(),
        cost: cost.toString(),
      });

      // Record Bedrock-specific monitoring metrics
      try {
        const { bedrockMonitoringService } = await import('../../monitoring/BedrockMonitoringService');
        await bedrockMonitoringService.recordBedrockMetrics(selectedModel, {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
          latency: processingTime,
          cost,
          success: true,
        });
      } catch (monitoringError) {
        this.logger.debug('Failed to record Bedrock monitoring metrics', undefined, {
          error: (monitoringError as Error).message,
        });
      }

      this.logger.info('Bedrock analysis completed successfully', {
        analysisId: analysisResult.id,
        model: selectedModel,
        accuracy: analysisResult.accuracy,
        processingTime,
        cost,
        tokenUsage: response.usage,
      });
      
      return analysisResult;
    } catch (error) {
      this.recordError();
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      // Record error in Bedrock monitoring
      try {
        const { bedrockMonitoringService } = await import('../../monitoring/BedrockMonitoringService');
        const selectedModel = this.selectOptimalModel(content, options);
        await bedrockMonitoringService.recordBedrockMetrics(selectedModel, {
          inputTokens: Math.ceil(content.length / 4),
          outputTokens: 0,
          latency: Date.now() - startTime,
          cost: 0,
          success: false,
          errorType: (error as Error).constructor.name,
          throttled: (error as Error).message.toLowerCase().includes('throttl'),
        });
      } catch (monitoringError) {
        this.logger.debug('Failed to record Bedrock error metrics', undefined, {
          error: (monitoringError as Error).message,
        });
      }
      
      this.logger.error('Bedrock analysis failed', error as Error, {
        contentLength: content.length,
        model: this.config.model,
        sensitivity: options.sensitivity,
      });
      
      throw this.enhanceError(error as Error);
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
    const selectedModel = this.selectOptimalModel(content, options);
    const modelConfig = BedrockProvider.SUPPORTED_MODELS[selectedModel as keyof typeof BedrockProvider.SUPPORTED_MODELS];
    if (!modelConfig) return 0;

    const inputTokens = Math.ceil(content.length / 4);
    const outputTokens = options.maxTokens || bedrockConfig.maxTokens || 2000;
    const inputCost = (inputTokens / 1000) * modelConfig.inputCostPer1K;
    const outputCost = (outputTokens / 1000) * modelConfig.outputCostPer1K;
    return inputCost + outputCost;
  }

  /**
   * Select optimal model based on content characteristics and options
   */
  private selectOptimalModel(content: string, options: AIAnalysisOptions): string {
    // Use configured model if specified and valid
    if (this.config.model && BedrockProvider.SUPPORTED_MODELS[this.config.model as keyof typeof BedrockProvider.SUPPORTED_MODELS]) {
      return this.config.model;
    }

    // Import and use AI provider config for intelligent model selection
    try {
      const { aiProviderConfig } = require('../AIProviderConfig');
      
      const optimalModel = aiProviderConfig.getOptimalModel({
        contentLength: content.length,
        sensitivity: options.sensitivity || bedrockConfig.defaultSensitivity || 'medium',
        maxCost: options.maxCost,
        requiresReasoning: options.sensitivity === 'high',
        requiresSpeed: options.sensitivity === 'low',
      });

      if (optimalModel && optimalModel.provider === 'bedrock') {
        this.logger.debug('Selected optimal model via config service', {
          selectedModel: optimalModel.id,
          contentLength: content.length,
          sensitivity: options.sensitivity,
        });
        return optimalModel.id;
      }
    } catch (error) {
      this.logger.debug('AI provider config not available, using fallback selection', undefined, {
        error: (error as Error).message,
      });
    }

    // Fallback to simple selection logic
    const contentLength = content.length;
    const sensitivity = options.sensitivity || bedrockConfig.defaultSensitivity || 'medium';
    
    if (sensitivity === 'high' || contentLength > 10000) {
      // Use most capable model for high sensitivity or long content
      return 'anthropic.claude-3-opus-20240229-v1:0';
    } else if (sensitivity === 'low' || contentLength < 1000) {
      // Use fastest/cheapest model for low sensitivity or short content
      return 'anthropic.claude-3-haiku-20240307-v1:0';
    } else {
      // Use balanced model for medium sensitivity
      return 'anthropic.claude-3-sonnet-20240229-v1:0';
    }
  }

  /**
   * Enhance error with Bedrock-specific context
   */
  private enhanceError(error: Error): Error {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('throttling') || errorMessage.includes('rate limit')) {
      return new Error(`Bedrock rate limit exceeded. Please reduce request frequency. Original error: ${error.message}`);
    }
    
    if (errorMessage.includes('access denied') || errorMessage.includes('unauthorized')) {
      return new Error(`Bedrock access denied. Please check IAM permissions for model access. Original error: ${error.message}`);
    }
    
    if (errorMessage.includes('model not found') || errorMessage.includes('invalid model')) {
      return new Error(`Bedrock model '${this.config.model}' not available. Please check model ID and region. Original error: ${error.message}`);
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded')) {
      return new Error(`Bedrock service quota exceeded. Please check your AWS service limits. Original error: ${error.message}`);
    }
    
    if (errorMessage.includes('validation')) {
      return new Error(`Bedrock request validation failed. Please check input parameters. Original error: ${error.message}`);
    }
    
    // Return enhanced error with context
    return new Error(`Bedrock provider error: ${error.message}`);
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

  private async invokeModel(prompt: string, options: AIAnalysisOptions, modelId?: string): Promise<ClaudeResponse> {
    const selectedModel = modelId || this.config.model;
    const modelConfig = BedrockProvider.SUPPORTED_MODELS[selectedModel as keyof typeof BedrockProvider.SUPPORTED_MODELS];
    
    if (!modelConfig) {
      throw new Error(`Unsupported model: ${selectedModel}`);
    }

    const maxTokens = Math.min(
      options.maxTokens || bedrockConfig.maxTokens || 2000,
      modelConfig.maxTokens
    );

    const requestBody: ClaudeRequest = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: options.temperature || bedrockConfig.temperature || 0.3,
      messages: [{ role: 'user', content: prompt }],
    };

    this.logger.debug('Invoking Bedrock model', {
      modelId: selectedModel,
      maxTokens,
      temperature: requestBody.temperature,
      promptLength: prompt.length,
    });

    const command = new InvokeModelCommand({
      modelId: selectedModel,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json',
    });

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      this.logger.debug('Bedrock model response received', {
        modelId: selectedModel,
        inputTokens: responseBody.usage?.input_tokens,
        outputTokens: responseBody.usage?.output_tokens,
        responseLength: responseBody.content?.[0]?.text?.length,
      });
      
      return responseBody;
    } catch (error) {
      this.logger.error('Bedrock model invocation failed', error as Error, {
        modelId: selectedModel,
        promptLength: prompt.length,
      });
      throw error;
    }
  }

  private parseAnalysisResponse(response: ClaudeResponse, content: string, startTime: number, modelId: string): AIAnalysisResult {
    const analysisText = response.content[0]?.text || '';
    
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON found in Bedrock response, attempting to extract structured data', {
          responseText: analysisText.substring(0, 200),
        });
        throw new Error('No JSON found in response');
      }
      
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Validate and sanitize the analysis result
      const sanitizedAnalysis = this.sanitizeAnalysisResult(analysis);
      
      return {
        id: `bedrock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        accuracy: sanitizedAnalysis.accuracy,
        riskLevel: sanitizedAnalysis.riskLevel,
        hallucinations: sanitizedAnalysis.hallucinations,
        verificationSources: sanitizedAnalysis.verificationSources,
        processingTime: Date.now() - startTime,
        metadata: {
          provider: 'bedrock',
          modelVersion: modelId,
          timestamp: new Date().toISOString(),
          tokenUsage: response.usage ? {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
            total: response.usage.input_tokens + response.usage.output_tokens,
          } : undefined,
          contentLength: content.length,
          rawResponse: analysisText.substring(0, 500), // Store first 500 chars for debugging
        },
      };
    } catch (error) {
      this.logger.error('Failed to parse Bedrock response', error as Error, {
        responseText: analysisText.substring(0, 200),
        modelId,
      });
      throw new Error(`Failed to parse Bedrock response: ${(error as Error).message}`);
    }
  }

  /**
   * Sanitize and validate analysis result from Bedrock
   */
  private sanitizeAnalysisResult(analysis: any): {
    accuracy: number;
    riskLevel: string;
    hallucinations: any[];
    verificationSources: number;
  } {
    // Ensure accuracy is a valid number between 0 and 100
    let accuracy = parseFloat(analysis.accuracy) || 0;
    accuracy = Math.max(0, Math.min(100, accuracy));

    // Ensure risk level is valid
    const validRiskLevels = ['low', 'medium', 'high', 'critical'];
    let riskLevel = analysis.riskLevel || 'medium';
    if (!validRiskLevels.includes(riskLevel.toLowerCase())) {
      riskLevel = 'medium';
    }

    // Ensure hallucinations is an array
    let hallucinations = Array.isArray(analysis.hallucinations) ? analysis.hallucinations : [];
    
    // Sanitize each hallucination
    hallucinations = hallucinations.map((h: any, index: number) => ({
      text: String(h.text || ''),
      type: String(h.type || 'Unknown'),
      confidence: Math.max(0, Math.min(1, parseFloat(h.confidence) || 0)),
      explanation: String(h.explanation || ''),
      startIndex: parseInt(h.startIndex) || 0,
      endIndex: parseInt(h.endIndex) || 0,
    })).filter(h => h.text.length > 0); // Remove empty hallucinations

    // Ensure verification sources is a valid number
    const verificationSources = Math.max(0, parseInt(analysis.verificationSources) || 0);

    return {
      accuracy,
      riskLevel: riskLevel.toLowerCase(),
      hallucinations,
      verificationSources,
    };
  }

  private calculateCost(usage?: { input_tokens: number; output_tokens: number }, modelId?: string): number {
    if (!usage) return 0;
    
    const model = modelId || this.config.model;
    const modelConfig = BedrockProvider.SUPPORTED_MODELS[model as keyof typeof BedrockProvider.SUPPORTED_MODELS];
    if (!modelConfig) return 0;

    const inputCost = (usage.input_tokens / 1000) * modelConfig.inputCostPer1K;
    const outputCost = (usage.output_tokens / 1000) * modelConfig.outputCostPer1K;
    const totalCost = inputCost + outputCost;
    
    this.logger.debug('Calculated Bedrock cost', {
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      inputCost,
      outputCost,
      totalCost,
    });
    
    return totalCost;
  }
}