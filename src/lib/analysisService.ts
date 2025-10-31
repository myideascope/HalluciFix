import { AnalysisResult, BatchProgress } from '../types/analysis';
import { createApiClient, AnalysisRequest, AnalysisResponse } from './api';
import ragService, { RAGEnhancedAnalysis } from './ragService';
import { SimpleTokenizer } from './tokenizer';
import { SeqLogprobAnalyzer, createTokenProbabilities } from './seqLogprob';
import { databaseOptimizationService } from './databaseOptimizationService';
import { optimizedAnalysisService } from './optimizedAnalysisService';

import { serviceRegistry } from './serviceRegistry';
import { errorManager, withRetry, RetryManager } from './errors';
import { serviceDegradationManager } from './serviceDegradationManager';
import { offlineCacheManager } from './offlineCacheManager';
import { createLogger } from './logging/structuredLogger';
import { performanceMonitor } from './performanceMonitor';

// Import AI provider infrastructure
import { providerManager } from './providers/ProviderManager';
import { AIProvider, AIAnalysisOptions, AIAnalysisResult } from './providers/interfaces/AIProvider';
import { aiService } from './providers/ai/AIService';

// Import optimization components
import { responseCacheManager } from './cache/ResponseCacheManager';
import { requestDeduplicator } from './optimization/RequestDeduplicator';
import { connectionPoolManager } from './optimization/ConnectionPoolManager';
import { apiUsageOptimizer } from './optimization/APIUsageOptimizer';

// Import subscription access control
import { 
  SubscriptionAccessMiddleware, 
  SubscriptionAccessError,
  SubscriptionAccessOptions 
} from './subscriptionAccessMiddleware';
import { subscriptionFallbackService } from './subscriptionFallbackService';
import { aiCostMonitoringService } from './aiCostMonitoringService';
import { aiPerformanceMonitoringService } from './aiPerformanceMonitoringService';

class AnalysisService {
  private apiClient;
  private seqLogprobAnalyzer;
  private logger = createLogger({ service: 'AnalysisService' });
  private aiProvidersInitialized = false;

  constructor() {
    // Get API client from service registry (legacy fallback)
    this.apiClient = serviceRegistry.getHallucifixClient();
    
    this.seqLogprobAnalyzer = new SeqLogprobAnalyzer();
    
    // Initialize AI providers
    this.initializeAIProviders();
  }

  private async initializeAIProviders(): Promise<void> {
    try {
      // Initialize provider manager if not already done
      if (!providerManager.getStatus().initialized) {
        await providerManager.initialize({
          enableHealthChecks: true,
          validateSecurity: false, // Skip in development
          enableMockFallback: true
        });
      }

      // Initialize AI service if not already done
      if (!aiService.getStatus().initialized) {
        await aiService.initialize();
      }

      this.aiProvidersInitialized = true;
      this.logger.info("AI providers initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize AI providers", error as Error);
      this.aiProvidersInitialized = false;
    }
  }

  async analyzeContent(
    content: string,
    userId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
      enableRAG?: boolean;
    }
  ): Promise<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }> {
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userLogger = createUserLogger(userId).child({ 
      analysisId,
      operation: 'analyzeContent',
      contentLength: content.length,
    });
    
    // Estimate cost for AWS Bedrock analysis
    const estimatedCost = await this.estimateAWSAnalysisCost(content, {
      sensitivity: options?.sensitivity || 'medium',
      maxHallucinations: options?.maxHallucinations || 5,
      temperature: 0.3,
      maxTokens: 2000
    });

    // Check cost limits before proceeding
    const costCheck = await aiCostMonitoringService.canPerformAnalysis(userId, estimatedCost);
    if (!costCheck.allowed) {
      userLogger.warn('Content analysis blocked by cost limits', {
        reason: costCheck.reason,
        currentCost: costCheck.currentCost,
        limit: costCheck.limit,
        estimatedCost
      });
      
      throw new Error(`Analysis blocked: ${costCheck.reason}`);
    }

    // Check subscription access before proceeding
    const subscriptionOptions: SubscriptionAccessOptions = {
      enforceSubscription: true,
      enforceUsageLimit: true,
      analysisType: 'content_analysis',
      tokensUsed: Math.ceil(content.length / 100), // Rough token estimation
      metadata: {
        sensitivity: options?.sensitivity || 'medium',
        enableRAG: options?.enableRAG !== false,
        contentLength: content.length,
        estimatedCost
      }
    };

    const accessResult = await SubscriptionAccessMiddleware.checkSubscriptionAccess(userId, subscriptionOptions);
    
    if (!accessResult.allowed) {
      userLogger.warn('Content analysis blocked by subscription access control', {
        reason: accessResult.reason,
        subscription: accessResult.subscription,
        gracePeriod: accessResult.gracePeriod
      });
      
      // Check if fallback analysis is available
      const fallbackCheck = await subscriptionFallbackService.canPerformAnalysis(
        userId, 
        content.length, 
        'basic_analysis'
      );
      
      if (fallbackCheck.allowed) {
        userLogger.info('Using fallback analysis mode', {
          remainingDaily: fallbackCheck.remainingDaily,
          remainingMonthly: fallbackCheck.remainingMonthly
        });
        
        // Perform fallback analysis
        const fallbackResult = await subscriptionFallbackService.performFallbackAnalysis(
          content,
          userId,
          'basic_analysis'
        );
        
        return { 
          analysis: fallbackResult,
          ragAnalysis: undefined, // RAG not available in fallback mode
          seqLogprobResult: undefined // Seq-logprob not available in fallback mode
        };
      }
      
      throw new SubscriptionAccessError(
        accessResult.reason || 'Access denied',
        accessResult
      );
    }

    userLogger.info('Content analysis started', {
      sensitivity: options?.sensitivity || 'medium',
      includeSourceVerification: options?.includeSourceVerification ?? true,
      enableRAG: options?.enableRAG !== false,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      subscription: accessResult.subscription
    });
    
    const startTime = Date.now();
    const performanceId = performanceMonitor.startOperation('content_analysis', {
      userId,
      contentLength: content.length.toString(),
      sensitivity: options?.sensitivity || 'medium',
      enableRAG: (options?.enableRAG !== false).toString(),
    });
    
    // Check for cached result first (offline mode support)
    const cachedResult = offlineCacheManager.getCachedAnalysisResult(content, userId);
    if (cachedResult && serviceDegradationManager.isOfflineMode()) {
      userLogger.info('Using cached analysis result (offline mode)', {
        cacheHit: true,
        offlineMode: true,
      });
      return {
        analysis: { ...cachedResult.analysis, fromCache: true },
        ragAnalysis: cachedResult.ragAnalysis
      };
    }

    // Perform standard analysis
    const standardAnalysisId = performanceMonitor.startOperation('standard_analysis', {
      userId,
      contentLength: content.length.toString(),
    });
    
    const analysis = await this.performStandardAnalysis(content, userId, options);
    
    performanceMonitor.endOperation(standardAnalysisId, {
      accuracy: analysis.accuracy.toString(),
      riskLevel: analysis.riskLevel,
      hallucinationsFound: analysis.hallucinations.length.toString(),
    });
    
    // Perform seq-logprob analysis
    let seqLogprobResult;
    const seqLogprobId = performanceMonitor.startOperation('seq_logprob_analysis', {
      userId,
      contentLength: content.length.toString(),
    });
    
    try {
      const tokenizationResult = SimpleTokenizer.tokenize(content);
      const tokenProbs = createTokenProbabilities(
        tokenizationResult.tokens,
        tokenizationResult.probabilities
      );
      
      seqLogprobResult = this.seqLogprobAnalyzer.detectHallucination(
        content,
        tokenProbs,
        -2.5
      );
      
      // Store seq-logprob analysis in the result
      analysis.seqLogprobAnalysis = {
        seqLogprob: seqLogprobResult.seqLogprob,
        normalizedSeqLogprob: seqLogprobResult.normalizedSeqLogprob,
        confidenceScore: seqLogprobResult.confidenceScore,
        hallucinationRisk: seqLogprobResult.hallucinationRisk,
        isHallucinationSuspected: seqLogprobResult.isHallucinationSuspected,
        lowConfidenceTokens: seqLogprobResult.lowConfidenceTokens,
        suspiciousSequences: seqLogprobResult.suspiciousSequences.length,
        processingTime: seqLogprobResult.processingTime
      };
      
      // Adjust overall analysis based on seq-logprob results
      if (seqLogprobResult.isHallucinationSuspected && seqLogprobResult.hallucinationRisk === 'critical') {
        analysis.accuracy = Math.min(analysis.accuracy, 60);
        analysis.riskLevel = 'critical';
      } else if (seqLogprobResult.isHallucinationSuspected && seqLogprobResult.hallucinationRisk === 'high') {
        analysis.accuracy = Math.min(analysis.accuracy, 75);
        if (analysis.riskLevel === 'low') analysis.riskLevel = 'medium';
      }
      
      performanceMonitor.endOperation(seqLogprobId, {
        isHallucinationSuspected: seqLogprobResult.isHallucinationSuspected.toString(),
        hallucinationRisk: seqLogprobResult.hallucinationRisk,
        confidenceScore: seqLogprobResult.confidenceScore.toString(),
      });
      
    } catch (error) {
      performanceMonitor.endOperation(seqLogprobId, { status: 'error' });
      errorManager.handleError(error, {
        component: 'AnalysisService',
        feature: 'seq-logprob-analysis',
        userId,
        operation: 'seqLogprobAnalysis',
        analysisId,
      });
      userLogger.error('Seq-logprob analysis failed', error as Error, {
        feature: 'seq-logprob-analysis',
      });
    }
    
    // Perform RAG analysis if enabled
    let ragAnalysis: RAGEnhancedAnalysis | undefined;
    if (options?.enableRAG !== false) { // Default to enabled
      const ragAnalysisId = performanceMonitor.startOperation('rag_analysis', {
        userId,
        contentLength: content.length.toString(),
      });
      
      try {
        ragAnalysis = await this.performEnhancedRAGAnalysis(content, analysis, userId);
        
        // Update analysis accuracy based on RAG results
        analysis.accuracy = ragAnalysis.rag_enhanced_accuracy;
        
        // Store RAG analysis in the result
        analysis.ragAnalysis = ragAnalysis;
        
        // Add RAG-specific hallucinations with enhanced detection
        const ragHallucinations = ragAnalysis.verified_claims
          .filter(claim => claim.verification_status === 'contradicted')
          .map(claim => ({
            text: claim.claim,
            type: 'RAG Contradiction',
            confidence: claim.confidence,
            explanation: `This claim contradicts reliable sources: ${claim.explanation}`,
            startIndex: content.indexOf(claim.claim),
            endIndex: content.indexOf(claim.claim) + claim.claim.length
          }))
          .filter(h => h.startIndex !== -1);
        
        analysis.hallucinations.push(...ragHallucinations);
        
        // Update risk level based on enhanced accuracy
        analysis.riskLevel = analysis.accuracy > 85 ? 'low' : 
                           analysis.accuracy > 70 ? 'medium' : 
                           analysis.accuracy > 50 ? 'high' : 'critical';
        
        performanceMonitor.endOperation(ragAnalysisId, {
          enhancedAccuracy: ragAnalysis.rag_enhanced_accuracy.toString(),
          verifiedClaims: ragAnalysis.verified_claims.length.toString(),
          contradictedClaims: ragAnalysis.verified_claims.filter(c => c.verification_status === 'contradicted').length.toString(),
          improvementScore: ragAnalysis.improvement_score.toString(),
        });
        
      } catch (error) {
        performanceMonitor.endOperation(ragAnalysisId, { status: 'error' });
        errorManager.handleError(error, {
          component: 'AnalysisService',
          feature: 'rag-analysis',
          userId,
          operation: 'ragAnalysis',
          analysisId,
        });
        userLogger.error('RAG analysis failed, continuing with standard analysis', error as Error, {
          feature: 'rag-analysis',
        });
      }
    }
    
    // Cache the analysis result for offline use
    try {
      offlineCacheManager.cacheAnalysisResult(content, analysis, ragAnalysis, userId);
      userLogger.debug('Analysis result cached successfully');
    } catch (error) {
      userLogger.warn('Failed to cache analysis result', undefined, { error: (error as Error).message });
    }

    // Save analysis result using optimized service
    try {
      await optimizedAnalysisService.batchCreateAnalysisResults([analysis], { userId, endpoint: 'analyzeContent' });
      userLogger.debug('Analysis result saved to database');
    } catch (error) {
      errorManager.handleError(error, {
        component: 'AnalysisService',
        feature: 'result-storage',
        userId,
        operation: 'saveAnalysisResult',
        analysisId,
      });
      userLogger.error('Failed to save analysis result', error as Error, {
        feature: 'result-storage',
      });
    }

    const totalDuration = Date.now() - startTime;
    userLogger.info('Content analysis completed', {
      accuracy: analysis.accuracy,
      riskLevel: analysis.riskLevel,
      hallucinationsFound: analysis.hallucinations.length,
      ragEnabled: !!ragAnalysis,
      seqLogprobEnabled: !!seqLogprobResult,
      totalDuration,
      processingTime: analysis.processingTime,
    });

    // End overall performance tracking
    performanceMonitor.endOperation(performanceId, {
      accuracy: analysis.accuracy.toString(),
      riskLevel: analysis.riskLevel,
      hallucinationsFound: analysis.hallucinations.length.toString(),
      ragEnabled: (!!ragAnalysis).toString(),
      seqLogprobEnabled: (!!seqLogprobResult).toString(),
    });

    // Record business metrics
    performanceMonitor.recordBusinessMetric('analysis_completed', 1, 'count', {
      userId,
      riskLevel: analysis.riskLevel,
      accuracy: Math.floor(analysis.accuracy / 10) * 10 + '-' + (Math.floor(analysis.accuracy / 10) * 10 + 9), // Bucket accuracy
    });

    performanceMonitor.recordBusinessMetric('analysis_accuracy', analysis.accuracy, 'percent', {
      userId,
      riskLevel: analysis.riskLevel,
    });

    performanceMonitor.recordBusinessMetric('analysis_processing_time', analysis.processingTime, 'ms', {
      userId,
      riskLevel: analysis.riskLevel,
    });

    // Log performance metrics
    logUtils.logPerformance('content_analysis', totalDuration, {
      userId,
      analysisId,
      contentLength: content.length,
      accuracy: analysis.accuracy,
      riskLevel: analysis.riskLevel,
      ragEnabled: !!ragAnalysis,
    });

    // Record cost usage and performance metrics for AWS AI services
    if (analysis.aiProviderMetadata?.provider === 'bedrock' && analysis.aiProviderMetadata?.tokenUsage) {
      try {
        const actualCost = await this.calculateActualCost(analysis.aiProviderMetadata);
        
        // Record cost usage
        await aiCostMonitoringService.recordUsage({
          userId,
          provider: analysis.aiProviderMetadata.provider,
          model: analysis.aiProviderMetadata.modelVersion,
          tokensUsed: analysis.aiProviderMetadata.tokenUsage.total,
          estimatedCost: actualCost,
          timestamp: new Date().toISOString(),
          analysisType: 'content_analysis'
        });

        // Record performance metrics
        await aiPerformanceMonitoringService.recordPerformanceMetrics({
          provider: analysis.aiProviderMetadata.provider,
          model: analysis.aiProviderMetadata.modelVersion,
          timestamp: analysis.timestamp,
          responseTime: analysis.processingTime,
          accuracy: analysis.accuracy,
          tokenUsage: analysis.aiProviderMetadata.tokenUsage,
          cost: actualCost,
          success: true,
          userId,
          contentLength: content.length,
          riskLevel: analysis.riskLevel,
        });
        
        userLogger.debug('AI cost and performance metrics recorded successfully', {
          cost: actualCost,
          tokens: analysis.aiProviderMetadata.tokenUsage.total,
          responseTime: analysis.processingTime,
          accuracy: analysis.accuracy,
        });
      } catch (error) {
        userLogger.warn('Failed to record AI metrics', undefined, { error: (error as Error).message });
      }
    }

    // Record usage for successful analysis
    try {
      await SubscriptionAccessMiddleware.recordUsage(userId, {
        ...subscriptionOptions,
        metadata: {
          ...subscriptionOptions.metadata,
          analysisId,
          accuracy: analysis.accuracy,
          riskLevel: analysis.riskLevel,
          processingTime: totalDuration,
          actualCost: analysis.aiProviderMetadata?.tokenUsage ? 
            await this.calculateActualCost(analysis.aiProviderMetadata) : estimatedCost,
          success: true
        }
      });
      userLogger.debug('Usage recorded successfully');
    } catch (error) {
      userLogger.warn('Failed to record usage', undefined, { error: (error as Error).message });
      // Don't fail the analysis for usage recording issues
    }

    // Also record usage directly with usage tracker for billing
    try {
      const { usageTracker } = await import('./usageTracker');
      await usageTracker.recordApiCall(userId, {
        analysisType: 'content_analysis',
        tokensUsed: subscriptionOptions.tokensUsed,
        metadata: {
          analysisId,
          accuracy: analysis.accuracy,
          riskLevel: analysis.riskLevel,
          processingTime: totalDuration,
          contentLength: content.length,
          ragEnabled: !!ragAnalysis,
          seqLogprobEnabled: !!seqLogprobResult
        }
      });
      userLogger.debug('Usage tracking recorded for billing');
    } catch (error) {
      userLogger.warn('Failed to record usage tracking', undefined, { error: (error as Error).message });
      // Don't fail the analysis for usage tracking issues
    }

    return { analysis, ragAnalysis, seqLogprobResult };
  }

  private async performStandardAnalysis(
    content: string,
    userId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
    }
  ): Promise<AnalysisResult> {
    // Check if we should use fallback due to service degradation
    const shouldUseFallback = serviceDegradationManager.shouldUseFallback('hallucifix');
    
    // Try AWS Bedrock first if available and not in fallback mode
    if (!shouldUseFallback) {
      try {
        const aiResult = await this.performAIProviderAnalysis(content, userId, options);
        if (aiResult) {
          return aiResult;
        }
      } catch (error) {
        this.logger.warn("Bedrock analysis failed, trying legacy providers", error as Error, {
          errorType: (error as Error).constructor.name,
          errorMessage: (error as Error).message,
        });
        
        // Check if this is a cost/quota error that should trigger fallback
        const errorMessage = (error as Error).message.toLowerCase();
        if (errorMessage.includes('cost limit') || 
            errorMessage.includes('quota') || 
            errorMessage.includes('rate limit')) {
          serviceDegradationManager.forceFallback('bedrock', 'Cost or quota limits reached');
        }
      }
    }
    
    // Try other AI providers through provider manager
    if (this.aiProvidersInitialized && !shouldUseFallback) {
      try {
        // Use provider manager for fallback providers
        const aiOptions: AIAnalysisOptions = {
          sensitivity: options?.sensitivity || 'medium',
          maxHallucinations: options?.maxHallucinations || 5,
          temperature: 0.3,
          maxTokens: 2000,
          includeSourceVerification: options?.includeSourceVerification ?? true,
        };

        const aiResult = await providerManager.analyzeContent(content, aiOptions);
        
        // Convert to our standard format
        return {
          id: aiResult.id,
          user_id: userId,
          content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          timestamp: aiResult.metadata.timestamp,
          accuracy: aiResult.accuracy,
          riskLevel: aiResult.riskLevel,
          hallucinations: aiResult.hallucinations.map(h => ({
            text: h.text,
            type: h.type,
            confidence: h.confidence,
            explanation: h.explanation,
            startIndex: h.startIndex,
            endIndex: h.endIndex,
          })),
          verificationSources: aiResult.verificationSources,
          processingTime: aiResult.processingTime,
          analysisType: 'single',
          fullContent: content,
          aiProviderMetadata: {
            provider: aiResult.metadata.provider,
            modelVersion: aiResult.metadata.modelVersion,
            tokenUsage: aiResult.metadata.tokenUsage,
            contentLength: aiResult.metadata.contentLength,
            region: import.meta.env.VITE_AWS_REGION,
            service: 'provider-manager'
          }
        };
      } catch (error) {
        this.logger.warn("Provider manager analysis failed, trying legacy API", error as Error);
      }
    }
    
    // Fallback to legacy HalluciFix API if available
    if (this.apiClient && !shouldUseFallback) {
      try {
        const request: AnalysisRequest = {
          content,
          options: {
            sensitivity: options?.sensitivity || 'medium',
            includeSourceVerification: options?.includeSourceVerification ?? true,
            maxHallucinations: options?.maxHallucinations ?? 5
          }
        };
        
        const apiResponse: AnalysisResponse = await withRetry(
          () => this.apiClient!.analyzeContent(request),
          {
            maxRetries: 3,
            baseDelay: 1000,
            backoffFactor: 2,
            jitter: true
          }
        );

        return {
          id: apiResponse.id,
          user_id: userId,
          content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          timestamp: apiResponse.metadata.timestamp,
          accuracy: apiResponse.accuracy,
          riskLevel: apiResponse.riskLevel,
          hallucinations: apiResponse.hallucinations.map(h => ({
            text: h.text,
            type: h.type,
            confidence: h.confidence,
            explanation: h.explanation,
            startIndex: h.startIndex,
            endIndex: h.endIndex,
          })),
          verificationSources: apiResponse.verificationSources,
          processingTime: apiResponse.processingTime,
          analysisType: 'single',
          fullContent: content
        };
      } catch (error) {
        // Handle and log the error through the error management system
        const handledError = errorManager.handleError(error, {
          component: 'AnalysisService',
          feature: 'content-analysis',
          userId,
          operation: 'performStandardAnalysis'
        });
        
        this.logger.error("Error from HalluciFix API, falling back to mock analysis", handledError);
        
        // Force fallback mode for this service
        serviceDegradationManager.forceFallback('hallucifix', 'API error during analysis');
      }
    }
    
    // Final fallback to mock analysis
    this.logger.info(shouldUseFallback ? 'Using mock analysis due to service degradation' : 'Using mock analysis (no providers available)', {
      degradationReason: serviceDegradationManager.getFallbackReason('hallucifix'),
      providersInitialized: this.aiProvidersInitialized,
      hasApiClient: !!this.apiClient,
    });
    return this.mockAnalyzeContent(content, userId);
  }

  /**
   * Perform analysis using AWS AI services (Bedrock, etc.)
   */
  private async performAIProviderAnalysis(
    content: string,
    userId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
    }
  ): Promise<AnalysisResult | null> {
    try {
      this.logger.debug("Starting AWS Bedrock analysis", {
        contentLength: content.length,
        sensitivity: options?.sensitivity || 'medium'
      });

      // Import Bedrock service dynamically to avoid circular dependencies
      const { bedrockService } = await import('./providers/bedrock/BedrockService');
      
      // Convert options to AI provider format
      const aiOptions: AIAnalysisOptions = {
        sensitivity: options?.sensitivity || 'medium',
        maxHallucinations: options?.maxHallucinations || 5,
        temperature: 0.3, // Lower temperature for more consistent analysis
        maxTokens: 2000,
        includeSourceVerification: options?.includeSourceVerification ?? true,
        enableRAG: true
      };

      // Use Bedrock service for analysis
      const aiResult = await bedrockService.analyzeContent(content, userId, aiOptions);
      
      if (!aiResult) {
        this.logger.warn("No Bedrock analysis result received");
        return null;
      }

      this.logger.info("Bedrock analysis completed", {
        provider: aiResult.metadata.provider,
        model: aiResult.metadata.modelVersion,
        accuracy: aiResult.accuracy,
        riskLevel: aiResult.riskLevel,
        hallucinationCount: aiResult.hallucinations.length,
        processingTime: aiResult.processingTime,
        tokenUsage: aiResult.metadata.tokenUsage
      });

      // Convert AI provider result to our standard AnalysisResult format
      const analysisResult: AnalysisResult = {
        id: aiResult.id,
        user_id: userId,
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        timestamp: aiResult.metadata.timestamp,
        accuracy: aiResult.accuracy,
        riskLevel: aiResult.riskLevel,
        hallucinations: aiResult.hallucinations.map(h => ({
          text: h.text,
          type: h.type,
          confidence: h.confidence,
          explanation: h.explanation,
          startIndex: h.startIndex,
          endIndex: h.endIndex,
        })),
        verificationSources: aiResult.verificationSources,
        processingTime: aiResult.processingTime,
        analysisType: 'single',
        fullContent: content,
        // Add AWS Bedrock specific metadata
        aiProviderMetadata: {
          provider: aiResult.metadata.provider,
          modelVersion: aiResult.metadata.modelVersion,
          tokenUsage: aiResult.metadata.tokenUsage,
          contentLength: aiResult.metadata.contentLength,
          region: import.meta.env.VITE_AWS_REGION,
          service: 'bedrock'
        }
      };

      // Record business metrics for Bedrock usage
      performanceMonitor.recordBusinessMetric('bedrock_analysis_completed', 1, 'count', {
        userId,
        provider: aiResult.metadata.provider,
        model: aiResult.metadata.modelVersion,
        riskLevel: aiResult.riskLevel,
        accuracy: Math.floor(aiResult.accuracy / 10) * 10 + '-' + (Math.floor(aiResult.accuracy / 10) * 10 + 9)
      });

      if (aiResult.metadata.tokenUsage) {
        performanceMonitor.recordBusinessMetric('bedrock_tokens_used', aiResult.metadata.tokenUsage.total, 'count', {
          userId,
          provider: aiResult.metadata.provider,
          model: aiResult.metadata.modelVersion
        });

        // Track cost metrics
        const estimatedCost = await bedrockService.estimateCost(content, aiOptions);
        performanceMonitor.recordBusinessMetric('bedrock_cost_estimate', estimatedCost, 'currency', {
          userId,
          provider: aiResult.metadata.provider,
          model: aiResult.metadata.modelVersion
        });
      }

      return analysisResult;

    } catch (error) {
      this.logger.error("Bedrock analysis failed", error as Error, {
        contentLength: content.length,
        sensitivity: options?.sensitivity
      });

      // Record failure metrics
      performanceMonitor.recordBusinessMetric('bedrock_analysis_failed', 1, 'count', {
        userId,
        error: (error as Error).message.substring(0, 100)
      });

      throw error;
    }
  }

  /**
   * Estimate cost for AWS Bedrock analysis
   */
  private async estimateAWSAnalysisCost(content: string, options: AIAnalysisOptions): Promise<number> {
    try {
      // Import Bedrock service dynamically
      const { bedrockService } = await import('./providers/bedrock/BedrockService');
      return await bedrockService.estimateCost(content, options);
    } catch (error) {
      this.logger.warn("Failed to estimate Bedrock cost", undefined, {
        error: (error as Error).message
      });
      return this.estimateAnalysisCost(content.length);
    }
  }

  /**
   * Perform enhanced RAG analysis that combines AI provider insights with knowledge base verification
   */
  private async performEnhancedRAGAnalysis(
    content: string,
    aiAnalysis: AnalysisResult,
    userId: string
  ): Promise<RAGEnhancedAnalysis> {
    const startTime = Date.now();
    
    try {
      this.logger.debug("Starting enhanced RAG analysis", {
        contentLength: content.length,
        aiAccuracy: aiAnalysis.accuracy,
        aiHallucinationCount: aiAnalysis.hallucinations.length
      });

      // Get the standard RAG analysis
      const baseRAGAnalysis = await ragService.performRAGAnalysis(content, userId);
      
      // If we have AI provider metadata, use it to enhance the analysis
      if (aiAnalysis.aiProviderMetadata && this.aiProvidersInitialized) {
        const enhancedAnalysis = await this.enhanceRAGWithAIProvider(
          content,
          baseRAGAnalysis,
          aiAnalysis,
          userId
        );
        
        if (enhancedAnalysis) {
          this.logger.info("Enhanced RAG analysis completed", {
            originalAccuracy: baseRAGAnalysis.original_accuracy,
            enhancedAccuracy: enhancedAnalysis.rag_enhanced_accuracy,
            improvementScore: enhancedAnalysis.improvement_score,
            aiProvider: aiAnalysis.aiProviderMetadata.provider
          });
          
          return enhancedAnalysis;
        }
      }
      
      // Fallback to standard RAG analysis
      this.logger.debug("Using standard RAG analysis");
      return baseRAGAnalysis;
      
    } catch (error) {
      this.logger.error("Enhanced RAG analysis failed", error as Error);
      throw error;
    }
  }

  /**
   * Enhance RAG analysis using AI provider insights
   */
  private async enhanceRAGWithAIProvider(
    content: string,
    baseRAGAnalysis: RAGEnhancedAnalysis,
    aiAnalysis: AnalysisResult,
    userId: string
  ): Promise<RAGEnhancedAnalysis | null> {
    try {
      // Extract claims that the AI provider identified as problematic
      const aiHallucinationClaims = aiAnalysis.hallucinations.map(h => h.text);
      
      // Cross-verify AI-identified hallucinations with knowledge base
      if (aiHallucinationClaims.length > 0) {
        this.logger.debug("Cross-verifying AI hallucinations with knowledge base", {
          aiHallucinationCount: aiHallucinationClaims.length
        });
        
        // Use knowledge manager to verify AI-identified claims
        const knowledgeManager = (await import('./providers/knowledge')).knowledgeManager;
        const crossVerificationResults = await knowledgeManager.verifyClaims(aiHallucinationClaims);
        
        // Combine results for enhanced accuracy calculation
        const enhancedVerifiedClaims = [
          ...baseRAGAnalysis.verified_claims,
          ...crossVerificationResults.map(result => ({
            claim: result.claim,
            verification_status: result.verification,
            confidence: result.confidence,
            supporting_documents: result.supportingDocuments.map(doc => ({
              id: doc.id,
              source_id: doc.metadata?.source || 'unknown',
              title: doc.title,
              content: doc.content,
              url: doc.url,
              relevance_score: 0.8,
              publication_date: doc.publicationDate,
              author: doc.author,
              source_name: doc.metadata?.sourceName || 'Knowledge Base',
              source_type: doc.metadata?.source || 'unknown',
              metadata: doc.metadata
            })),
            contradicting_documents: result.contradictingDocuments.map(doc => ({
              id: doc.id,
              source_id: doc.metadata?.source || 'unknown',
              title: doc.title,
              content: doc.content,
              url: doc.url,
              relevance_score: 0.8,
              publication_date: doc.publicationDate,
              author: doc.author,
              source_name: doc.metadata?.sourceName || 'Knowledge Base',
              source_type: doc.metadata?.source || 'unknown',
              metadata: doc.metadata
            })),
            explanation: result.explanation,
            reliability_assessment: {
              source_quality: 0.8,
              consensus_level: result.supportingDocuments.length / Math.max(result.supportingDocuments.length + result.contradictingDocuments.length, 1),
              recency: 0.7,
              overall_score: result.confidence
            }
          }))
        ];
        
        // Calculate enhanced accuracy combining AI and RAG insights
        const aiWeight = 0.4; // Weight for AI provider analysis
        const ragWeight = 0.6; // Weight for knowledge base verification
        
        const aiAccuracyContribution = aiAnalysis.accuracy * aiWeight;
        const ragAccuracyContribution = baseRAGAnalysis.rag_enhanced_accuracy * ragWeight;
        
        // Apply cross-verification bonus/penalty
        const crossVerifiedCorrect = crossVerificationResults.filter(r => r.verification === 'verified').length;
        const crossVerifiedIncorrect = crossVerificationResults.filter(r => r.verification === 'contradicted').length;
        
        const crossVerificationBonus = (crossVerifiedCorrect / Math.max(crossVerificationResults.length, 1)) * 5;
        const crossVerificationPenalty = (crossVerifiedIncorrect / Math.max(crossVerificationResults.length, 1)) * 10;
        
        const enhancedAccuracy = Math.max(0, Math.min(100, 
          aiAccuracyContribution + ragAccuracyContribution + crossVerificationBonus - crossVerificationPenalty
        ));
        
        const improvementScore = enhancedAccuracy - baseRAGAnalysis.original_accuracy;
        
        this.logger.debug("Enhanced RAG calculation", {
          aiAccuracy: aiAnalysis.accuracy,
          baseRAGAccuracy: baseRAGAnalysis.rag_enhanced_accuracy,
          enhancedAccuracy,
          crossVerifiedCorrect,
          crossVerifiedIncorrect,
          improvementScore
        });
        
        return {
          ...baseRAGAnalysis,
          rag_enhanced_accuracy: parseFloat(enhancedAccuracy.toFixed(1)),
          improvement_score: parseFloat(improvementScore.toFixed(1)),
          verified_claims: enhancedVerifiedClaims,
          processing_time: Date.now() - Date.now(), // Will be set by caller
          knowledge_gaps: [
            ...baseRAGAnalysis.knowledge_gaps,
            ...crossVerificationResults
              .filter(r => r.verification === 'unsupported')
              .map(r => r.claim)
          ]
        };
      }
      
      return null;
      
    } catch (error) {
      this.logger.error("Failed to enhance RAG with AI provider", error as Error);
      return null;
    }
  }

  private mockAnalyzeContent(content: string, userId: string): AnalysisResult {
    // Simulate realistic analysis based on content patterns
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

    let accuracy = 85 + Math.random() * 10; // Base accuracy 85-95%
    const hallucinations = [];

    // Check for suspicious patterns and reduce accuracy
    suspiciousPatterns.forEach((patternObj, index) => {
      const matches = content.match(patternObj.pattern);
      if (matches) {
        accuracy -= matches.length * (5 + Math.random() * 10);
        matches.forEach(match => {
          const startIndex = content.indexOf(match);
          hallucinations.push({
            text: match,
            type: patternObj.type,
            confidence: 0.7 + Math.random() * 0.25,
            explanation: this.getHallucinationExplanation(match, patternObj.type),
            startIndex,
            endIndex: startIndex + match.length
          });
        });
      }
    });

    // Ensure accuracy doesn't go below 0
    accuracy = Math.max(0, accuracy);
    
    const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';
    const processingTime = Math.floor(Math.random() * 1000) + 500;

    return {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: userId,
      content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      timestamp: new Date().toISOString(),
      accuracy: parseFloat(accuracy.toFixed(1)),
      riskLevel,
      hallucinations,
      verificationSources: Math.floor(Math.random() * 15) + 5,
      processingTime,
      analysisType: 'single',
      fullContent: content
    };
  }


  private getHallucinationExplanation(match: string, type: string): string {
    const explanations: Record<string, string> = {
      'False Precision': `Suspiciously specific statistic "${match}" without verifiable source`,
      'Impossible Metric': `The metric "${match}" seems unrealistic or impossible`,
      'Unverifiable Claim': `Claim "${match}" appears to be unverifiable or lacks proper attribution`,
      'Exaggerated Language': `Language like "${match}" suggests potential exaggeration`,
      'Performance Exaggeration': `Performance metric "${match}" seems unrealistically high`,
      'Unrealistic Accuracy': `Accuracy claim "${match}" is likely unattainable in practice`,
      'Unverifiable Attribution': `Attribution "${match}" lacks specific source citation`,
      'Absolute Claim': `Absolute statement "${match}" is statistically unlikely to be true`
    };
    return explanations[type] || `Potentially problematic claim: "${match}"`;
  }

  async analyzeBatch(
    documents: Array<{ id: string; content: string; filename?: string }>,
    userId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
      enableRAG?: boolean;
      batchSize?: number;
      progressCallback?: (progress: BatchProgress) => void;
      maxConcurrency?: number;
    }
  ): Promise<Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }>> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userLogger = createUserLogger(userId).child({ 
      batchId,
      operation: 'analyzeBatch',
      documentCount: documents.length,
    });
    
    userLogger.info('Batch analysis started', {
      documentCount: documents.length,
      sensitivity: options?.sensitivity || 'medium',
      enableRAG: options?.enableRAG !== false,
      batchSize: options?.batchSize || 5,
      maxConcurrency: options?.maxConcurrency || 3
    });

    const startTime = Date.now();
    const performanceId = performanceMonitor.startOperation('batch_analysis', {
      userId,
      documentCount: documents.length.toString(),
      sensitivity: options?.sensitivity || 'medium',
    });

    try {
      // Use enhanced batch processing with rate limit management
      const results = await this.performEnhancedBatchAnalysis(
        documents,
        userId,
        batchId,
        options,
        userLogger
      );

      const totalDuration = Date.now() - startTime;
      const successCount = results.filter(r => r.analysis).length;
      const failureCount = documents.length - successCount;

      userLogger.info('Batch analysis completed', {
        totalDocuments: documents.length,
        successCount,
        failureCount,
        totalDuration,
        averageTimePerDocument: Math.round(totalDuration / documents.length)
      });

      performanceMonitor.endOperation(performanceId, {
        successCount: successCount.toString(),
        failureCount: failureCount.toString(),
        totalDuration: totalDuration.toString(),
      });

      // Record business metrics
      performanceMonitor.recordBusinessMetric('batch_analysis_completed', 1, 'count', {
        userId,
        documentCount: documents.length.toString(),
        successRate: Math.round((successCount / documents.length) * 100).toString()
      });

      performanceMonitor.recordBusinessMetric('batch_analysis_documents_processed', successCount, 'count', {
        userId,
        batchSize: documents.length.toString()
      });

      return results;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      userLogger.error('Batch analysis failed', error as Error);
      throw error;
    }
  }

  /**
   * Enhanced batch processing with rate limit management and progress tracking
   */
  private async performEnhancedBatchAnalysis(
    documents: Array<{ id: string; content: string; filename?: string }>,
    userId: string,
    batchId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
      enableRAG?: boolean;
      batchSize?: number;
      progressCallback?: (progress: BatchProgress) => void;
      maxConcurrency?: number;
    },
    userLogger?: any
  ): Promise<Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }>> {
    const batchSize = options?.batchSize || 5;
    const maxConcurrency = options?.maxConcurrency || 3;
    const results: Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }> = [];
    
    // Initialize progress tracking
    const progress: BatchProgress = {
      batchId,
      totalDocuments: documents.length,
      processedDocuments: 0,
      successfulDocuments: 0,
      failedDocuments: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(documents.length / batchSize),
      startTime: Date.now(),
      estimatedTimeRemaining: 0,
      currentStatus: 'processing',
      errors: []
    };

    // Process documents in batches to manage rate limits
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      progress.currentBatch = Math.floor(i / batchSize) + 1;
      
      userLogger?.debug(`Processing batch ${progress.currentBatch}/${progress.totalBatches}`, {
        batchSize: batch.length,
        documentsRemaining: documents.length - i
      });

      // Process batch with concurrency control
      const batchResults = await this.processBatchWithConcurrency(
        batch,
        userId,
        batchId,
        options,
        maxConcurrency,
        userLogger
      );

      results.push(...batchResults);

      // Update progress
      progress.processedDocuments = i + batch.length;
      progress.successfulDocuments = results.filter(r => r.analysis).length;
      progress.failedDocuments = progress.processedDocuments - progress.successfulDocuments;
      
      // Calculate estimated time remaining
      const elapsedTime = Date.now() - progress.startTime;
      const avgTimePerDocument = elapsedTime / progress.processedDocuments;
      progress.estimatedTimeRemaining = Math.round(avgTimePerDocument * (documents.length - progress.processedDocuments));

      // Call progress callback if provided
      if (options?.progressCallback) {
        try {
          options.progressCallback(progress);
        } catch (callbackError) {
          userLogger?.warn('Progress callback failed', undefined, { error: (callbackError as Error).message });
        }
      }

      // Add delay between batches to respect rate limits
      if (i + batchSize < documents.length) {
        const delayMs = this.calculateBatchDelay(batch.length, this.aiProvidersInitialized);
        if (delayMs > 0) {
          userLogger?.debug(`Waiting ${delayMs}ms between batches for rate limit management`);
          await this.sleep(delayMs);
        }
      }
    }

    progress.currentStatus = 'completed';
    progress.estimatedTimeRemaining = 0;

    // Final progress callback
    if (options?.progressCallback) {
      try {
        options.progressCallback(progress);
      } catch (callbackError) {
        userLogger?.warn('Final progress callback failed', undefined, { error: (callbackError as Error).message });
      }
    }

    return results;
  }

  /**
   * Process a batch of documents with concurrency control
   */
  private async processBatchWithConcurrency(
    batch: Array<{ id: string; content: string; filename?: string }>,
    userId: string,
    batchId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
      enableRAG?: boolean;
    },
    maxConcurrency: number = 3,
    userLogger?: any
  ): Promise<Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }>> {
    const results: Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }> = [];
    
    // Process documents with controlled concurrency
    const semaphore = new Array(maxConcurrency).fill(null);
    const processingPromises: Promise<void>[] = [];

    for (let i = 0; i < batch.length; i++) {
      const doc = batch[i];
      
      // Wait for an available slot
      const slotIndex = i % maxConcurrency;
      if (processingPromises[slotIndex]) {
        await processingPromises[slotIndex];
      }

      // Start processing this document
      processingPromises[slotIndex] = this.processDocumentWithRetry(
        doc,
        userId,
        batchId,
        options,
        userLogger
      ).then(result => {
        results[i] = result; // Maintain order
      });
    }

    // Wait for all remaining processing to complete
    await Promise.all(processingPromises.filter(p => p));

    return results.filter(r => r); // Remove any undefined entries
  }

  /**
   * Process a single document with retry logic
   */
  private async processDocumentWithRetry(
    doc: { id: string; content: string; filename?: string },
    userId: string,
    batchId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
      enableRAG?: boolean;
    },
    userLogger?: any,
    maxRetries: number = 2
  ): Promise<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { analysis, ragAnalysis, seqLogprobResult } = await this.analyzeContent(doc.content, userId, options);
        
        // Mark as batch analysis
        analysis.analysisType = 'batch';
        analysis.batchId = batchId;
        analysis.filename = doc.filename;

        if (attempt > 0) {
          userLogger?.info(`Document analysis succeeded on retry ${attempt}`, {
            documentId: doc.id,
            filename: doc.filename
          });
        }

        return { analysis, ragAnalysis, seqLogprobResult };

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff
          userLogger?.warn(`Document analysis failed, retrying in ${delayMs}ms`, undefined, {
            documentId: doc.id,
            filename: doc.filename,
            attempt: attempt + 1,
            maxRetries,
            error: lastError.message
          });
          
          await this.sleep(delayMs);
        } else {
          userLogger?.error(`Document analysis failed after ${maxRetries + 1} attempts`, lastError, {
            documentId: doc.id,
            filename: doc.filename
          });
        }
      }
    }

    // Create a failed analysis result
    const failedAnalysis: AnalysisResult = {
      id: `failed_${doc.id}_${Date.now()}`,
      user_id: userId,
      content: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
      timestamp: new Date().toISOString(),
      accuracy: 0,
      riskLevel: 'critical',
      hallucinations: [{
        text: 'Analysis failed',
        type: 'System Error',
        confidence: 1.0,
        explanation: `Failed to analyze document: ${lastError?.message || 'Unknown error'}`,
        startIndex: 0,
        endIndex: 0
      }],
      verificationSources: 0,
      processingTime: 0,
      analysisType: 'batch',
      batchId,
      filename: doc.filename,
      fullContent: doc.content
    };

    errorManager.handleError(lastError || new Error('Unknown batch processing error'), {
      component: 'AnalysisService',
      feature: 'batch-analysis',
      userId,
      operation: 'processDocumentWithRetry',
      documentId: doc.id,
      batchId
    });

    return { analysis: failedAnalysis };
  }

  /**
   * Calculate appropriate delay between batches based on provider capabilities
   */
  private calculateBatchDelay(batchSize: number, hasRealProviders: boolean): number {
    if (!hasRealProviders) {
      return 100; // Minimal delay for mock providers
    }

    // Base delay for real API providers to respect rate limits
    const baseDelay = 2000; // 2 seconds
    const perDocumentDelay = 500; // 500ms per document
    
    return baseDelay + (batchSize * perDocumentDelay);
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get analysis history using optimized queries and caching
  async getAnalysisHistory(
    userId: string,
    options?: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    return databaseOptimizationService.getAnalysisResultsOptimized(userId, options);
  }

  // Get user analytics using optimized queries and caching
  async getUserAnalytics(
    userId: string,
    timeRange?: { start: Date; end: Date }
  ) {
    return databaseOptimizationService.getUserAnalyticsOptimized(userId, timeRange);
  }

  // Search analysis results using optimized queries and caching
  async searchAnalysisResults(
    searchQuery: string,
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
    }
  ) {
    return databaseOptimizationService.searchAnalysisResultsOptimized(searchQuery, userId, options);
  }

  // Get performance metrics
  getPerformanceMetrics() {
    return optimizedAnalysisService.getPerformanceMetrics();
  }

  // Get optimization statistics
  getOptimizationStats() {
    return {
      cache: responseCacheManager.getStats(),
      deduplication: requestDeduplicator.getStats(),
      connectionPool: connectionPoolManager.getStats(),
      apiUsage: apiUsageOptimizer.getStats()
    };
  }

  // Get optimization recommendations
  getOptimizationRecommendations() {
    return apiUsageOptimizer.getOptimizationRecommendations();
  }

  // Utility method to hash content for cache keys
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Estimate analysis cost based on content length (legacy method)
  private estimateAnalysisCost(contentLength: number): number {
    // Rough estimate: $0.002 per 1000 characters
    return (contentLength / 1000) * 0.002;
  }

  // Calculate actual cost from AI provider metadata
  private async calculateActualCost(metadata: any): Promise<number> {
    if (!metadata.tokenUsage || !metadata.provider) {
      return 0;
    }

    try {
      // Use the provider's cost calculation
      const provider = providerManager.getAIProvider();
      if (provider && provider.getName() === metadata.provider) {
        // For Bedrock, calculate based on actual token usage
        if (metadata.provider === 'bedrock') {
          return this.calculateBedrockCost(metadata.modelVersion, metadata.tokenUsage);
        }
      }
      
      return 0;
    } catch (error) {
      this.logger.warn('Failed to calculate actual cost', undefined, {
        error: (error as Error).message,
        provider: metadata.provider
      });
      return 0;
    }
  }

  // Calculate Bedrock-specific costs
  private calculateBedrockCost(model: string, tokenUsage: { input: number; output: number }): number {
    const modelPricing: Record<string, { inputCostPer1K: number; outputCostPer1K: number }> = {
      'anthropic.claude-3-sonnet-20240229-v1:0': { inputCostPer1K: 0.003, outputCostPer1K: 0.015 },
      'anthropic.claude-3-haiku-20240307-v1:0': { inputCostPer1K: 0.00025, outputCostPer1K: 0.00125 },
      'anthropic.claude-3-opus-20240229-v1:0': { inputCostPer1K: 0.015, outputCostPer1K: 0.075 },
      'amazon.titan-text-express-v1': { inputCostPer1K: 0.0008, outputCostPer1K: 0.0016 },
    };

    const pricing = modelPricing[model];
    if (!pricing) {
      return 0;
    }

    const inputCost = (tokenUsage.input / 1000) * pricing.inputCostPer1K;
    const outputCost = (tokenUsage.output / 1000) * pricing.outputCostPer1K;
    
    return inputCost + outputCost;
  }

  // Shutdown method for cleanup
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Analysis Service...');
    
    try {
      // Shutdown optimization components
      responseCacheManager.shutdown();
      requestDeduplicator.shutdown();
      connectionPoolManager.shutdown();
      
      this.logger.info('Analysis Service shutdown complete');
    } catch (error) {
      this.logger.error('Error during Analysis Service shutdown', error as Error);
    }
  }
}

const analysisService = new AnalysisService();
export default analysisService;