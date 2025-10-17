import { AnalysisResult } from '../types/analysis';
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
import { logger, createUserLogger, logUtils } from './logging';
import { performanceMonitor } from './performanceMonitor';

class AnalysisService {
  private apiClient;
  private seqLogprobAnalyzer;
  private logger = logger.child({ component: 'AnalysisService' });

  constructor() {
    // Get API client from service registry
    this.apiClient = serviceRegistry.getHallucifixClient();
    
    if (!this.apiClient) {
      this.logger.warn("HalluciFix API client not available. Using mock analysis.");
    } else {
      this.logger.info("AnalysisService initialized with API client");
    }
    
    this.seqLogprobAnalyzer = new SeqLogprobAnalyzer();
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
    
    userLogger.info('Content analysis started', {
      sensitivity: options?.sensitivity || 'medium',
      includeSourceVerification: options?.includeSourceVerification ?? true,
      enableRAG: options?.enableRAG !== false,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
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
        ragAnalysis = await ragService.performRAGAnalysis(content, userId);
        
        // Update analysis accuracy based on RAG results
        analysis.accuracy = ragAnalysis.rag_enhanced_accuracy;
        
        // Store RAG analysis in the result
        analysis.ragAnalysis = ragAnalysis;
        
        // Add RAG-specific hallucinations
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
        
        console.error("Error from HalluciFix API, falling back to mock analysis:", handledError);
        
        // Force fallback mode for this service
        serviceDegradationManager.forceFallback('hallucifix', 'API error during analysis');
        
        return this.mockAnalyzeContent(content, userId);
      }
    } else {
      console.log(shouldUseFallback ? 'Using mock analysis due to service degradation' : 'Using mock analysis (API not configured)');
      return this.mockAnalyzeContent(content, userId);
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
    }
  ): Promise<Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }>> {
    const results: AnalysisResult[] = [];
    const enhancedResults: Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis; seqLogprobResult?: any }> = [];
    
    for (const doc of documents) {
      try {
        const { analysis, ragAnalysis, seqLogprobResult } = await this.analyzeContent(doc.content, userId, options);
        analysis.analysisType = 'batch';
        analysis.filename = doc.filename;
        enhancedResults.push({ analysis, ragAnalysis, seqLogprobResult });
      } catch (error) {
        errorManager.handleError(error, {
          component: 'AnalysisService',
          feature: 'batch-analysis',
          userId,
          operation: 'analyzeBatch',
          documentId: doc.id
        });
        console.error(`Error analyzing document ${doc.id}:`, error);
        // Continue with other documents even if one fails
      }
    }
    
    return enhancedResults;
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
}

const analysisService = new AnalysisService();
export default analysisService;