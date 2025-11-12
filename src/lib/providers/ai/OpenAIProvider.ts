/**
 * OpenAI Provider Implementation
 * Provides AI analysis using OpenAI's GPT models for hallucination detection
 */

import OpenAI from 'openai';
import { AIProvider, AIProviderConfig, AIAnalysisOptions, AIAnalysisResult } from '../interfaces/AIProvider';

export interface OpenAIProviderConfig extends AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseUrl?: string;
  organization?: string;
}

export class OpenAIProvider extends AIProvider {
  private client: OpenAI;
  private openaiConfig: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    super('openai', config);
    this.openaiConfig = config;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization,
      dangerouslyAllowBrowser: true // Required for client-side usage
    });
  }

  async initialize(): Promise<void> {
    // Test connection
    await this.healthCheck();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data.map(m => m.id);
    } catch {
      return [];
    }
  }

  async estimateCost(content: string): Promise<number> {
    const inputTokens = Math.ceil(content.length / 4);
    const outputTokens = 1000;
    // GPT-4 pricing approximation
    return (inputTokens * 0.03 + outputTokens * 0.06) / 1000;
  }

  async analyzeContent(content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    try {
      const prompt = this.buildAnalysisPrompt(content, options);

      const response = await this.client.chat.completions.create({
        model: this.openaiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.openaiConfig.temperature,
        max_tokens: this.openaiConfig.maxTokens,
      });

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No response from OpenAI');
      }

      const analysis = this.parseAnalysisResult(result);
      const processingTime = Date.now() - startTime;

      return {
        id: `openai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        accuracy: analysis.accuracy,
        riskLevel: analysis.riskLevel,
        hallucinations: analysis.hallucinations,
        verificationSources: analysis.verificationSources,
        processingTime,
        metadata: {
          provider: 'openai',
          modelVersion: this.openaiConfig.model,
          timestamp: new Date().toISOString(),
          tokenUsage: {
            input: response.usage?.prompt_tokens || 0,
            output: response.usage?.completion_tokens || 0,
            total: response.usage?.total_tokens || 0,
          },
          contentLength: content.length,
        },
      };
    } catch (error) {
      throw new Error(`OpenAI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildAnalysisPrompt(content: string, options?: AIAnalysisOptions): string {
    const sensitivity = options?.sensitivity || 'medium';
    const maxHallucinations = options?.maxHallucinations || 5;

    return `Analyze the following text for potential hallucinations, misinformation, or unverifiable claims. Focus on detecting:

1. False precision (specific numbers/statistics without sources)
2. Impossible metrics or unrealistic claims
3. Unverifiable attributions or citations
4. Exaggerated language or absolute statements
5. Contradictions within the text
6. Factual inaccuracies

Sensitivity level: ${sensitivity}
Maximum hallucinations to report: ${maxHallucinations}

Text to analyze:
${content}

Provide your analysis in the following JSON format:
{
  "accuracy": <number between 0-100>,
  "riskLevel": "low|medium|high|critical",
  "hallucinations": [
    {
      "text": "exact text snippet",
      "type": "category of hallucination",
      "confidence": <0-1>,
      "explanation": "why this is problematic",
      "startIndex": <character position>,
      "endIndex": <character position>
    }
  ],
  "verificationSources": <number of sources that could be checked>
}`;
  }

  private parseAnalysisResult(result: string): {
    accuracy: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    hallucinations: Array<{
      text: string;
      type: string;
      confidence: number;
      explanation: string;
      startIndex: number;
      endIndex: number;
    }>;
    verificationSources: number;
  } {
    try {
      const parsed = JSON.parse(result);
      return {
        accuracy: Math.max(0, Math.min(100, parsed.accuracy || 85)),
        riskLevel: ['low', 'medium', 'high', 'critical'].includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
        hallucinations: (parsed.hallucinations || []).map((h: any) => ({
          text: h.text || '',
          type: h.type || 'Unknown',
          confidence: Math.max(0, Math.min(1, h.confidence || 0.5)),
          explanation: h.explanation || 'Potential issue detected',
          startIndex: h.startIndex || 0,
          endIndex: h.endIndex || h.startIndex || 0,
        })),
        verificationSources: parsed.verificationSources || 0,
      };
    } catch {
      // Fallback parsing
      return {
        accuracy: 85,
        riskLevel: 'medium',
        hallucinations: [],
        verificationSources: 0,
      };
    }
  }
}