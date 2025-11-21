import { logger } from './logging';

/**
 * Seq-Logprob Hallucination Detection Module
 * 
 * This module implements sequence log probability analysis to detect potential
 * hallucinations in LLM-generated text by analyzing token-level confidence scores.
 */

export interface TokenProbability {
  token: string;
  probability: number;
  logProbability?: number;
  position: number;
}

export interface SeqLogprobResult {
  // Overall sequence metrics
  seqLogprob: number;
  normalizedSeqLogprob: number;
  averageLogProb: number;
  sequenceLength: number;
  
  // Token-level analysis
  tokenAnalysis: Array<{
    token: string;
    probability: number;
    logProbability: number;
    position: number;
    isLowConfidence: boolean;
    confidenceLevel: 'high' | 'medium' | 'low' | 'very_low';
  }>;
  
  // Hallucination detection
  isHallucinationSuspected: boolean;
  hallucinationRisk: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number; // 0-100, higher = more confident
  
  // Detailed analysis
  lowConfidenceTokens: number;
  averageConfidence: number;
  confidenceVariance: number;
  suspiciousSequences: Array<{
    startIndex: number;
    endIndex: number;
    tokens: string[];
    averageLogProb: number;
    reason: string;
  }>;
  
  // Metadata
  threshold: number;
  processingTime: number;
  modelInfo?: {
    name?: string;
    version?: string;
    temperature?: number;
  };
}

export interface HallucinationDetectionConfig {
  // Primary threshold for hallucination detection
  hallucinationThreshold: number; // Default: -2.5
  
  // Token-level confidence thresholds
  lowConfidenceThreshold: number; // Default: -3.0
  veryLowConfidenceThreshold: number; // Default: -5.0
  
  // Sequence analysis parameters
  minSequenceLength: number; // Default: 3
  maxLowConfidenceRatio: number; // Default: 0.3 (30%)
  
  // Advanced detection parameters
  enableSequenceAnalysis: boolean; // Default: true
  enableVarianceAnalysis: boolean; // Default: true
  enableSuspiciousPatternDetection: boolean; // Default: true
  
  // Model-specific adjustments
  modelAdjustments?: {
    [modelName: string]: {
      thresholdAdjustment: number;
      confidenceBoost: number;
    };
  };
}

export class SeqLogprobAnalyzer {
  private config: HallucinationDetectionConfig;

  constructor(config?: Partial<HallucinationDetectionConfig>) {
    this.config = {
      hallucinationThreshold: -2.5,
      lowConfidenceThreshold: -3.0,
      veryLowConfidenceThreshold: -5.0,
      minSequenceLength: 3,
      maxLowConfidenceRatio: 0.3,
      enableSequenceAnalysis: true,
      enableVarianceAnalysis: true,
      enableSuspiciousPatternDetection: true,
      ...config
    };
  }

  /**
   * Main function to detect hallucinations using sequence log probabilities
   */
  detectHallucination(
    text: string,
    tokenProbs: TokenProbability[],
    threshold?: number,
    modelInfo?: SeqLogprobResult['modelInfo']
  ): SeqLogprobResult {
    const startTime = Date.now();
    const effectiveThreshold = threshold ?? this.config.hallucinationThreshold;

    // Validate inputs
    this.validateInputs(text, tokenProbs);

    // Apply model-specific adjustments if available
    const adjustedThreshold = this.applyModelAdjustments(effectiveThreshold, modelInfo?.name);

    // Calculate log probabilities for each token
    const tokenAnalysis = this.calculateTokenLogProbabilities(tokenProbs);

    // Calculate sequence-level metrics
    const sequenceMetrics = this.calculateSequenceMetrics(tokenAnalysis);

    // Detect suspicious sequences
    const suspiciousSequences = this.config.enableSuspiciousPatternDetection 
      ? this.detectSuspiciousSequences(tokenAnalysis)
      : [];

    // Calculate confidence variance
    const confidenceVariance = this.config.enableVarianceAnalysis
      ? this.calculateConfidenceVariance(tokenAnalysis)
      : 0;

    // Determine hallucination risk
    const hallucinationAssessment = this.assessHallucinationRisk(
      sequenceMetrics,
      tokenAnalysis,
      suspiciousSequences,
      adjustedThreshold
    );

    const processingTime = Date.now() - startTime;

    return {
      // Overall sequence metrics
      seqLogprob: sequenceMetrics.totalLogProb,
      normalizedSeqLogprob: sequenceMetrics.normalizedLogProb,
      averageLogProb: sequenceMetrics.averageLogProb,
      sequenceLength: tokenAnalysis.length,
      
      // Token-level analysis
      tokenAnalysis,
      
      // Hallucination detection
      isHallucinationSuspected: hallucinationAssessment.isHallucination,
      hallucinationRisk: hallucinationAssessment.riskLevel,
      confidenceScore: hallucinationAssessment.confidenceScore,
      
      // Detailed analysis
      lowConfidenceTokens: tokenAnalysis.filter(t => t.isLowConfidence).length,
      averageConfidence: sequenceMetrics.averageConfidence,
      confidenceVariance,
      suspiciousSequences,
      
      // Metadata
      threshold: adjustedThreshold,
      processingTime,
      modelInfo
    };
  }

  /**
   * Validate input parameters
   */
  private validateInputs(text: string, tokenProbs: TokenProbability[]): void {
    if (!text || typeof text !== 'string') {
      throw new Error('Text input must be a non-empty string');
    }

    if (!Array.isArray(tokenProbs) || tokenProbs.length === 0) {
      throw new Error('Token probabilities must be a non-empty array');
    }

    // Validate token probability structure
    for (let i = 0; i < tokenProbs.length; i++) {
      const token = tokenProbs[i];
      if (!token.token || typeof token.token !== 'string') {
        throw new Error(`Invalid token at position ${i}: token must be a string`);
      }
      if (typeof token.probability !== 'number' || token.probability < 0 || token.probability > 1) {
        throw new Error(`Invalid probability at position ${i}: must be between 0 and 1`);
      }
      if (typeof token.position !== 'number' || token.position < 0) {
        throw new Error(`Invalid position at position ${i}: must be a non-negative number`);
      }
    }

    // Check if tokens roughly match the text length
    const totalTokenLength = tokenProbs.reduce((sum, token) => sum + token.token.length, 0);
    if (Math.abs(totalTokenLength - text.length) > text.length * 0.5) {
      logger.warn("Token lengths do not closely match input text length. Results may be inaccurate.");
    }
  }

  /**
   * Apply model-specific threshold adjustments
   */
  private applyModelAdjustments(threshold: number, modelName?: string): number {
    if (!modelName || !this.config.modelAdjustments) {
      return threshold;
    }

    const adjustment = this.config.modelAdjustments[modelName];
    if (adjustment) {
      return threshold + adjustment.thresholdAdjustment;
    }

    return threshold;
  }

  /**
   * Calculate log probabilities and confidence levels for each token
   */
  private calculateTokenLogProbabilities(tokenProbs: TokenProbability[]) {
    return tokenProbs.map((token, index) => {
      // Calculate log probability: log(P(token))
      const logProbability = Math.log(Math.max(token.probability, 1e-10)); // Prevent log(0)
      
      // Determine confidence level based on log probability
      let confidenceLevel: 'high' | 'medium' | 'low' | 'very_low';
      if (logProbability > -1.0) {
        confidenceLevel = 'high';
      } else if (logProbability > -2.0) {
        confidenceLevel = 'medium';
      } else if (logProbability > this.config.veryLowConfidenceThreshold) {
        confidenceLevel = 'low';
      } else {
        confidenceLevel = 'very_low';
      }

      const isLowConfidence = logProbability < this.config.lowConfidenceThreshold;

      return {
        token: token.token,
        probability: token.probability,
        logProbability,
        position: token.position,
        isLowConfidence,
        confidenceLevel
      };
    });
  }

  /**
   * Calculate sequence-level metrics
   */
  private calculateSequenceMetrics(tokenAnalysis: ReturnType<typeof this.calculateTokenLogProbabilities>) {
    const totalLogProb = tokenAnalysis.reduce((sum, token) => sum + token.logProbability, 0);
    const sequenceLength = tokenAnalysis.length;
    const normalizedLogProb = totalLogProb / sequenceLength;
    const averageLogProb = normalizedLogProb;
    
    // Calculate average confidence (convert log prob back to probability for intuitive understanding)
    const averageConfidence = tokenAnalysis.reduce((sum, token) => sum + token.probability, 0) / sequenceLength;

    return {
      totalLogProb,
      normalizedLogProb,
      averageLogProb,
      averageConfidence,
      sequenceLength
    };
  }

  /**
   * Calculate confidence variance to detect inconsistent confidence patterns
   */
  private calculateConfidenceVariance(tokenAnalysis: ReturnType<typeof this.calculateTokenLogProbabilities>): number {
    const logProbs = tokenAnalysis.map(t => t.logProbability);
    const mean = logProbs.reduce((sum, lp) => sum + lp, 0) / logProbs.length;
    const variance = logProbs.reduce((sum, lp) => sum + Math.pow(lp - mean, 2), 0) / logProbs.length;
    return variance;
  }

  /**
   * Detect suspicious sequences of low-confidence tokens
   */
  private detectSuspiciousSequences(tokenAnalysis: ReturnType<typeof this.calculateTokenLogProbabilities>) {
    const suspiciousSequences = [];
    let currentSequence: typeof tokenAnalysis = [];
    
    for (let i = 0; i < tokenAnalysis.length; i++) {
      const token = tokenAnalysis[i];
      
      if (token.isLowConfidence) {
        currentSequence.push(token);
      } else {
        // End of low-confidence sequence
        if (currentSequence.length >= this.config.minSequenceLength) {
          const averageLogProb = currentSequence.reduce((sum, t) => sum + t.logProbability, 0) / currentSequence.length;
          
          suspiciousSequences.push({
            startIndex: currentSequence[0].position,
            endIndex: currentSequence[currentSequence.length - 1].position,
            tokens: currentSequence.map(t => t.token),
            averageLogProb,
            reason: this.getSuspiciousSequenceReason(currentSequence, averageLogProb)
          });
        }
        currentSequence = [];
      }
    }
    
    // Handle sequence that ends at the end of text
    if (currentSequence.length >= this.config.minSequenceLength) {
      const averageLogProb = currentSequence.reduce((sum, t) => sum + t.logProbability, 0) / currentSequence.length;
      
      suspiciousSequences.push({
        startIndex: currentSequence[0].position,
        endIndex: currentSequence[currentSequence.length - 1].position,
        tokens: currentSequence.map(t => t.token),
        averageLogProb,
        reason: this.getSuspiciousSequenceReason(currentSequence, averageLogProb)
      });
    }

    return suspiciousSequences;
  }

  /**
   * Generate reason for suspicious sequence
   */
  private getSuspiciousSequenceReason(sequence: any[], averageLogProb: number): string {
    const veryLowCount = sequence.filter(t => t.confidenceLevel === 'very_low').length;
    const lowCount = sequence.filter(t => t.confidenceLevel === 'low').length;
    
    if (veryLowCount > sequence.length * 0.5) {
      return `Sequence contains ${veryLowCount} very low confidence tokens (avg log prob: ${averageLogProb.toFixed(3)})`;
    } else if (lowCount > sequence.length * 0.7) {
      return `Sequence contains ${lowCount} low confidence tokens (avg log prob: ${averageLogProb.toFixed(3)})`;
    } else {
      return `Consecutive low-confidence tokens detected (avg log prob: ${averageLogProb.toFixed(3)})`;
    }
  }

  /**
   * Assess overall hallucination risk based on multiple factors
   */
  private assessHallucinationRisk(
    sequenceMetrics: any,
    tokenAnalysis: any[],
    suspiciousSequences: any[],
    threshold: number
  ) {
    const { normalizedSeqLogprob, averageConfidence } = sequenceMetrics;
    const lowConfidenceRatio = tokenAnalysis.filter(t => t.isLowConfidence).length / tokenAnalysis.length;
    
    // Primary check: sequence log probability vs threshold
    const belowThreshold = normalizedSeqLogprob < threshold;
    
    // Secondary checks for more nuanced assessment
    const highLowConfidenceRatio = lowConfidenceRatio > this.config.maxLowConfidenceRatio;
    const hasSuspiciousSequences = suspiciousSequences.length > 0;
    const veryLowAverageConfidence = averageConfidence < 0.3;
    
    // Calculate confidence score (0-100)
    let confidenceScore = Math.max(0, Math.min(100, 
      (normalizedSeqLogprob + 5) * 20 + // Base score from log prob
      (averageConfidence * 30) + // Boost from average confidence
      (lowConfidenceRatio < 0.2 ? 20 : 0) // Bonus for low ratio of low-confidence tokens
    ));

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    let isHallucination = false;

    if (belowThreshold && (highLowConfidenceRatio || veryLowAverageConfidence)) {
      riskLevel = 'critical';
      isHallucination = true;
      confidenceScore = Math.min(confidenceScore, 25);
    } else if (belowThreshold || (highLowConfidenceRatio && hasSuspiciousSequences)) {
      riskLevel = 'high';
      isHallucination = true;
      confidenceScore = Math.min(confidenceScore, 40);
    } else if (highLowConfidenceRatio || suspiciousSequences.length > 2) {
      riskLevel = 'medium';
      isHallucination = suspiciousSequences.length > 3;
      confidenceScore = Math.min(confidenceScore, 60);
    } else {
      riskLevel = 'low';
      isHallucination = false;
    }

    return {
      isHallucination,
      riskLevel,
      confidenceScore: Math.round(confidenceScore)
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HallucinationDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): HallucinationDetectionConfig {
    return { ...this.config };
  }
}

/**
 * Convenience function for simple hallucination detection
 */
export function detectHallucination(
  text: string,
  tokenProbs: TokenProbability[],
  threshold: number = -2.5,
  config?: Partial<HallucinationDetectionConfig>
): SeqLogprobResult {
  const analyzer = new SeqLogprobAnalyzer(config);
  return analyzer.detectHallucination(text, tokenProbs, threshold);
}

/**
 * Utility function to create TokenProbability array from simple arrays
 */
export function createTokenProbabilities(
  tokens: string[],
  probabilities: number[]
): TokenProbability[] {
  if (tokens.length !== probabilities.length) {
    throw new Error('Tokens and probabilities arrays must have the same length');
  }

  return tokens.map((token, index) => ({
    token,
    probability: probabilities[index],
    position: index
  }));
}

/**
 * Utility function to parse tokenized text with probabilities from common LLM APIs
 */
export function parseTokenizedResponse(response: {
  tokens: string[];
  logprobs: number[];
} | {
  choices: Array<{
    logprobs: {
      tokens: string[];
      token_logprobs: number[];
    };
  }>;
}): TokenProbability[] {
  let tokens: string[];
  let logprobs: number[];

  // Handle OpenAI API format
  if ('choices' in response && response.choices[0]?.logprobs) {
    tokens = response.choices[0].logprobs.tokens;
    logprobs = response.choices[0].logprobs.token_logprobs;
  }
  // Handle direct format
  else if ('tokens' in response && 'logprobs' in response) {
    tokens = response.tokens;
    logprobs = response.logprobs;
  } else {
    throw new Error('Unsupported response format');
  }

  // Convert log probabilities to probabilities
  const probabilities = logprobs.map(logprob => Math.exp(logprob));

  return createTokenProbabilities(tokens, probabilities);
}

/**
 * Advanced analysis function that provides detailed insights
 */
export function analyzeSequenceConfidence(
  text: string,
  tokenProbs: TokenProbability[],
  options?: {
    threshold?: number;
    includeDetailedAnalysis?: boolean;
    modelInfo?: SeqLogprobResult['modelInfo'];
    config?: Partial<HallucinationDetectionConfig>;
  }
): SeqLogprobResult & {
  insights: {
    mostSuspiciousToken: { token: string; logProbability: number; reason: string } | null;
    confidenceTrend: 'improving' | 'declining' | 'stable';
    recommendedActions: string[];
    technicalSummary: string;
  };
} {
  const result = detectHallucination(
    text,
    tokenProbs,
    options?.threshold,
    options?.config
  );

  // Generate additional insights if requested
  const insights = options?.includeDetailedAnalysis ? {
    mostSuspiciousToken: findMostSuspiciousToken(result.tokenAnalysis),
    confidenceTrend: analyzeConfidenceTrend(result.tokenAnalysis),
    recommendedActions: generateRecommendations(result),
    technicalSummary: generateTechnicalSummary(result)
  } : {
    mostSuspiciousToken: null,
    confidenceTrend: 'stable' as const,
    recommendedActions: [],
    technicalSummary: ''
  };

  return { ...result, insights };
}

/**
 * Find the most suspicious token in the sequence
 */
function findMostSuspiciousToken(tokenAnalysis: SeqLogprobResult['tokenAnalysis']) {
  const suspiciousTokens = tokenAnalysis.filter(t => t.isLowConfidence);
  if (suspiciousTokens.length === 0) return null;

  const mostSuspicious = suspiciousTokens.reduce((min, token) => 
    token.logProbability < min.logProbability ? token : min
  );

  return {
    token: mostSuspicious.token,
    logProbability: mostSuspicious.logProbability,
    reason: `Extremely low probability token (${mostSuspicious.logProbability.toFixed(3)}) suggests potential hallucination`
  };
}

/**
 * Analyze confidence trend across the sequence
 */
function analyzeConfidenceTrend(tokenAnalysis: SeqLogprobResult['tokenAnalysis']): 'improving' | 'declining' | 'stable' {
  if (tokenAnalysis.length < 5) return 'stable';

  const firstHalf = tokenAnalysis.slice(0, Math.floor(tokenAnalysis.length / 2));
  const secondHalf = tokenAnalysis.slice(Math.floor(tokenAnalysis.length / 2));

  const firstHalfAvg = firstHalf.reduce((sum, t) => sum + t.logProbability, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, t) => sum + t.logProbability, 0) / secondHalf.length;

  const difference = secondHalfAvg - firstHalfAvg;

  if (difference > 0.5) return 'improving';
  if (difference < -0.5) return 'declining';
  return 'stable';
}

/**
 * Generate actionable recommendations based on analysis
 */
function generateRecommendations(result: SeqLogprobResult): string[] {
  const recommendations: string[] = [];

  if (result.isHallucinationSuspected) {
    recommendations.push('Manual review recommended due to low sequence confidence');
  }

  if (result.lowConfidenceTokens > result.sequenceLength * 0.3) {
    recommendations.push('High ratio of low-confidence tokens detected - consider regenerating content');
  }

  if (result.suspiciousSequences.length > 0) {
    recommendations.push(`${result.suspiciousSequences.length} suspicious token sequences found - review highlighted sections`);
  }

  if (result.confidenceScore < 30) {
    recommendations.push('Very low overall confidence - strong recommendation for human fact-checking');
  } else if (result.confidenceScore < 60) {
    recommendations.push('Moderate confidence - consider additional verification for critical claims');
  }

  if (result.confidenceVariance > 2.0) {
    recommendations.push('High confidence variance detected - some parts may be more reliable than others');
  }

  if (recommendations.length === 0) {
    recommendations.push('Sequence appears to have good confidence - standard review process recommended');
  }

  return recommendations;
}

/**
 * Generate technical summary of the analysis
 */
function generateTechnicalSummary(result: SeqLogprobResult): string {
  const riskDescription = {
    low: 'low risk of hallucination',
    medium: 'moderate hallucination risk',
    high: 'high hallucination risk',
    critical: 'critical hallucination risk'
  }[result.hallucinationRisk];

  return `Seq-Logprob analysis of ${result.sequenceLength} tokens revealed ${riskDescription}. ` +
         `Normalized sequence log probability: ${result.normalizedSeqLogprob.toFixed(3)} ` +
         `(threshold: ${result.threshold}). Average token confidence: ${(result.averageConfidence * 100).toFixed(1)}%. ` +
         `${result.lowConfidenceTokens} tokens below confidence threshold. ` +
         `${result.suspiciousSequences.length} suspicious sequences detected.`;
}

/**
 * Export default analyzer instance for convenience
 */
export const defaultSeqLogprobAnalyzer = new SeqLogprobAnalyzer();

// Export types for external use
export type {
  HallucinationDetectionConfig,
  SeqLogprobResult,
  TokenProbability
};