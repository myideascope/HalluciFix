import { describe, it, expect, beforeEach } from 'vitest';
import { 
  SeqLogprobAnalyzer, 
  detectHallucination, 
  createTokenProbabilities,
  parseTokenizedResponse,
  analyzeSequenceConfidence,
  TokenProbability 
} from './seqLogprob';

describe('SeqLogprobAnalyzer', () => {
  let analyzer: SeqLogprobAnalyzer;

  beforeEach(() => {
    analyzer = new SeqLogprobAnalyzer();
  });

  describe('Basic functionality', () => {
    it('should calculate log probabilities correctly', () => {
      const text = "The cat sat on the mat";
      const tokenProbs: TokenProbability[] = [
        { token: "The", probability: 0.9, position: 0 },
        { token: " cat", probability: 0.8, position: 3 },
        { token: " sat", probability: 0.7, position: 7 },
        { token: " on", probability: 0.85, position: 11 },
        { token: " the", probability: 0.9, position: 14 },
        { token: " mat", probability: 0.6, position: 18 }
      ];

      const result = analyzer.detectHallucination(text, tokenProbs);

      expect(result.sequenceLength).toBe(6);
      expect(result.seqLogprob).toBeLessThan(0); // Log probabilities are negative
      expect(result.normalizedSeqLogprob).toBe(result.seqLogprob / 6);
      expect(result.tokenAnalysis).toHaveLength(6);
      
      // Check that log probabilities are calculated correctly
      expect(result.tokenAnalysis[0].logProbability).toBeCloseTo(Math.log(0.9), 3);
      expect(result.tokenAnalysis[1].logProbability).toBeCloseTo(Math.log(0.8), 3);
    });

    it('should detect hallucinations when sequence is below threshold', () => {
      const text = "Polar bears enjoy sunbathing on the beaches of Antarctica during winter";
      const tokenProbs: TokenProbability[] = [
        { token: "Polar", probability: 0.8, position: 0 },
        { token: " bears", probability: 0.9, position: 5 },
        { token: " enjoy", probability: 0.1, position: 11 }, // Very low probability
        { token: " sunbathing", probability: 0.05, position: 17 }, // Very low probability
        { token: " on", probability: 0.7, position: 28 },
        { token: " the", probability: 0.9, position: 31 },
        { token: " beaches", probability: 0.02, position: 35 }, // Very low probability
        { token: " of", probability: 0.8, position: 43 },
        { token: " Antarctica", probability: 0.6, position: 46 },
        { token: " during", probability: 0.7, position: 56 },
        { token: " winter", probability: 0.1, position: 63 } // Low probability
      ];

      const result = analyzer.detectHallucination(text, tokenProbs, -2.5);

      expect(result.isHallucinationSuspected).toBe(true);
      expect(result.hallucinationRisk).toBeOneOf(['high', 'critical']);
      expect(result.lowConfidenceTokens).toBeGreaterThan(0);
      expect(result.suspiciousSequences.length).toBeGreaterThan(0);
    });

    it('should not flag high-confidence sequences as hallucinations', () => {
      const text = "The weather is nice today";
      const tokenProbs: TokenProbability[] = [
        { token: "The", probability: 0.95, position: 0 },
        { token: " weather", probability: 0.9, position: 3 },
        { token: " is", probability: 0.95, position: 11 },
        { token: " nice", probability: 0.8, position: 14 },
        { token: " today", probability: 0.85, position: 19 }
      ];

      const result = analyzer.detectHallucination(text, tokenProbs, -2.5);

      expect(result.isHallucinationSuspected).toBe(false);
      expect(result.hallucinationRisk).toBe('low');
      expect(result.confidenceScore).toBeGreaterThan(70);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty token arrays', () => {
      expect(() => {
        analyzer.detectHallucination("test", [], -2.5);
      }).toThrow('Token probabilities must be a non-empty array');
    });

    it('should handle invalid probabilities', () => {
      const tokenProbs: TokenProbability[] = [
        { token: "test", probability: 1.5, position: 0 } // Invalid probability > 1
      ];

      expect(() => {
        analyzer.detectHallucination("test", tokenProbs, -2.5);
      }).toThrow('Invalid probability at position 0: must be between 0 and 1');
    });

    it('should handle very low probabilities without errors', () => {
      const text = "Impossible statement";
      const tokenProbs: TokenProbability[] = [
        { token: "Impossible", probability: 1e-10, position: 0 },
        { token: " statement", probability: 1e-8, position: 10 }
      ];

      const result = analyzer.detectHallucination(text, tokenProbs, -2.5);

      expect(result.isHallucinationSuspected).toBe(true);
      expect(result.tokenAnalysis[0].logProbability).toBeLessThan(-10);
      expect(result.hallucinationRisk).toBe('critical');
    });

    it('should handle single token sequences', () => {
      const text = "Hello";
      const tokenProbs: TokenProbability[] = [
        { token: "Hello", probability: 0.8, position: 0 }
      ];

      const result = analyzer.detectHallucination(text, tokenProbs, -2.5);

      expect(result.sequenceLength).toBe(1);
      expect(result.tokenAnalysis).toHaveLength(1);
      expect(result.suspiciousSequences).toHaveLength(0); // Too short for suspicious sequences
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customAnalyzer = new SeqLogprobAnalyzer({
        hallucinationThreshold: -1.0,
        lowConfidenceThreshold: -2.0,
        maxLowConfidenceRatio: 0.5
      });

      const config = customAnalyzer.getConfig();
      expect(config.hallucinationThreshold).toBe(-1.0);
      expect(config.lowConfidenceThreshold).toBe(-2.0);
      expect(config.maxLowConfidenceRatio).toBe(0.5);
    });

    it('should update configuration dynamically', () => {
      analyzer.updateConfig({ hallucinationThreshold: -3.0 });
      const config = analyzer.getConfig();
      expect(config.hallucinationThreshold).toBe(-3.0);
    });
  });

  describe('Utility functions', () => {
    it('should create token probabilities correctly', () => {
      const tokens = ["Hello", " world"];
      const probabilities = [0.9, 0.8];

      const result = createTokenProbabilities(tokens, probabilities);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        token: "Hello",
        probability: 0.9,
        position: 0
      });
      expect(result[1]).toEqual({
        token: " world",
        probability: 0.8,
        position: 1
      });
    });

    it('should parse OpenAI API response format', () => {
      const response = {
        choices: [{
          logprobs: {
            tokens: ["Hello", " world"],
            token_logprobs: [-0.1, -0.2]
          }
        }]
      };

      const result = parseTokenizedResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].token).toBe("Hello");
      expect(result[0].probability).toBeCloseTo(Math.exp(-0.1), 3);
      expect(result[1].token).toBe(" world");
      expect(result[1].probability).toBeCloseTo(Math.exp(-0.2), 3);
    });

    it('should parse direct format response', () => {
      const response = {
        tokens: ["Test", " token"],
        logprobs: [-0.5, -1.0]
      };

      const result = parseTokenizedResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].probability).toBeCloseTo(Math.exp(-0.5), 3);
      expect(result[1].probability).toBeCloseTo(Math.exp(-1.0), 3);
    });
  });

  describe('Advanced analysis', () => {
    it('should provide detailed insights when requested', () => {
      const text = "Unusual claim about impossible events";
      const tokenProbs: TokenProbability[] = [
        { token: "Unusual", probability: 0.7, position: 0 },
        { token: " claim", probability: 0.8, position: 7 },
        { token: " about", probability: 0.9, position: 13 },
        { token: " impossible", probability: 0.1, position: 19 }, // Low probability
        { token: " events", probability: 0.05, position: 30 } // Very low probability
      ];

      const result = analyzeSequenceConfidence(text, tokenProbs, {
        includeDetailedAnalysis: true,
        threshold: -2.0
      });

      expect(result.insights).toBeDefined();
      expect(result.insights.mostSuspiciousToken).toBeDefined();
      expect(result.insights.recommendedActions).toBeInstanceOf(Array);
      expect(result.insights.technicalSummary).toBeTruthy();
      expect(result.insights.confidenceTrend).toBeOneOf(['improving', 'declining', 'stable']);
    });

    it('should detect suspicious sequences correctly', () => {
      const text = "Normal text with very unusual impossible claims here";
      const tokenProbs: TokenProbability[] = [
        { token: "Normal", probability: 0.9, position: 0 },
        { token: " text", probability: 0.85, position: 6 },
        { token: " with", probability: 0.9, position: 11 },
        { token: " very", probability: 0.1, position: 16 }, // Start of suspicious sequence
        { token: " unusual", probability: 0.05, position: 21 },
        { token: " impossible", probability: 0.02, position: 29 },
        { token: " claims", probability: 0.08, position: 40 }, // End of suspicious sequence
        { token: " here", probability: 0.8, position: 47 }
      ];

      const result = analyzer.detectHallucination(text, tokenProbs, -2.5);

      expect(result.suspiciousSequences.length).toBeGreaterThan(0);
      expect(result.suspiciousSequences[0].tokens).toContain(" very");
      expect(result.suspiciousSequences[0].tokens).toContain(" unusual");
      expect(result.suspiciousSequences[0].averageLogProb).toBeLessThan(-2.0);
    });
  });

  describe('Real-world examples', () => {
    it('should correctly analyze the polar bears example', () => {
      const text = "Polar bears enjoy sunbathing on the beaches of Antarctica during the winter";
      const tokenProbs: TokenProbability[] = [
        { token: "Polar", probability: 0.85, position: 0 },
        { token: " bears", probability: 0.9, position: 5 },
        { token: " enjoy", probability: 0.7, position: 11 },
        { token: " sunbathing", probability: 0.01, position: 17 }, // Highly improbable
        { token: " on", probability: 0.6, position: 28 },
        { token: " the", probability: 0.9, position: 31 },
        { token: " beaches", probability: 0.02, position: 35 }, // Highly improbable for polar bears
        { token: " of", probability: 0.8, position: 43 },
        { token: " Antarctica", probability: 0.3, position: 46 }, // Somewhat improbable context
        { token: " during", probability: 0.7, position: 56 },
        { token: " the", probability: 0.9, position: 63 },
        { token: " winter", probability: 0.05, position: 67 } // Improbable for sunbathing
      ];

      const result = analyzer.detectHallucination(text, tokenProbs, -2.5);

      expect(result.isHallucinationSuspected).toBe(true);
      expect(result.hallucinationRisk).toBeOneOf(['high', 'critical']);
      expect(result.seqLogprob).toBeLessThan(-10); // Very negative due to low probabilities
      expect(result.lowConfidenceTokens).toBeGreaterThan(3);
      
      // Should detect the improbable tokens
      const lowConfTokens = result.tokenAnalysis.filter(t => t.isLowConfidence);
      expect(lowConfTokens.some(t => t.token === " sunbathing")).toBe(true);
      expect(lowConfTokens.some(t => t.token === " beaches")).toBe(true);
    });

    it('should not flag normal, high-confidence text', () => {
      const text = "The weather is sunny today in California";
      const tokenProbs: TokenProbability[] = [
        { token: "The", probability: 0.95, position: 0 },
        { token: " weather", probability: 0.9, position: 3 },
        { token: " is", probability: 0.95, position: 11 },
        { token: " sunny", probability: 0.8, position: 14 },
        { token: " today", probability: 0.85, position: 20 },
        { token: " in", probability: 0.9, position: 26 },
        { token: " California", probability: 0.7, position: 29 }
      ];

      const result = analyzer.detectHallucination(text, tokenProbs, -2.5);

      expect(result.isHallucinationSuspected).toBe(false);
      expect(result.hallucinationRisk).toBe('low');
      expect(result.confidenceScore).toBeGreaterThan(70);
      expect(result.lowConfidenceTokens).toBe(0);
    });
  });

  describe('Threshold sensitivity', () => {
    it('should be more sensitive with higher (less negative) thresholds', () => {
      const text = "Moderately unusual statement";
      const tokenProbs: TokenProbability[] = [
        { token: "Moderately", probability: 0.6, position: 0 },
        { token: " unusual", probability: 0.3, position: 10 },
        { token: " statement", probability: 0.5, position: 18 }
      ];

      const strictResult = analyzer.detectHallucination(text, tokenProbs, -1.0); // Strict threshold
      const lenientResult = analyzer.detectHallucination(text, tokenProbs, -3.0); // Lenient threshold

      expect(strictResult.isHallucinationSuspected).toBe(true);
      expect(lenientResult.isHallucinationSuspected).toBe(false);
    });
  });

  describe('Utility functions', () => {
    it('should create token probabilities from arrays', () => {
      const tokens = ["Hello", " world", "!"];
      const probabilities = [0.9, 0.8, 0.7];

      const result = createTokenProbabilities(tokens, probabilities);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        token: "Hello",
        probability: 0.9,
        position: 0
      });
      expect(result[2]).toEqual({
        token: "!",
        probability: 0.7,
        position: 2
      });
    });

    it('should throw error for mismatched array lengths', () => {
      expect(() => {
        createTokenProbabilities(["a", "b"], [0.5]);
      }).toThrow('Tokens and probabilities arrays must have the same length');
    });
  });

  describe('Advanced features', () => {
    it('should detect confidence trends', () => {
      // Declining confidence sequence
      const decliningTokens: TokenProbability[] = [
        { token: "Good", probability: 0.9, position: 0 },
        { token: " start", probability: 0.8, position: 4 },
        { token: " but", probability: 0.7, position: 10 },
        { token: " getting", probability: 0.4, position: 14 },
        { token: " worse", probability: 0.2, position: 22 },
        { token: " now", probability: 0.1, position: 28 }
      ];

      const result = analyzeSequenceConfidence("Good start but getting worse now", decliningTokens, {
        includeDetailedAnalysis: true
      });

      expect(result.insights.confidenceTrend).toBe('declining');
    });

    it('should provide meaningful recommendations', () => {
      const text = "Highly suspicious content with impossible claims";
      const tokenProbs: TokenProbability[] = [
        { token: "Highly", probability: 0.7, position: 0 },
        { token: " suspicious", probability: 0.1, position: 6 },
        { token: " content", probability: 0.6, position: 17 },
        { token: " with", probability: 0.8, position: 25 },
        { token: " impossible", probability: 0.05, position: 30 },
        { token: " claims", probability: 0.1, position: 41 }
      ];

      const result = analyzeSequenceConfidence(text, tokenProbs, {
        includeDetailedAnalysis: true,
        threshold: -2.0
      });

      expect(result.insights.recommendedActions.length).toBeGreaterThan(0);
      expect(result.insights.technicalSummary).toContain('hallucination risk');
      expect(result.insights.mostSuspiciousToken).toBeDefined();
    });
  });
});

describe('Convenience functions', () => {
  it('should work with detectHallucination function', () => {
    const text = "Simple test";
    const tokenProbs: TokenProbability[] = [
      { token: "Simple", probability: 0.8, position: 0 },
      { token: " test", probability: 0.7, position: 6 }
    ];

    const result = detectHallucination(text, tokenProbs, -2.5);

    expect(result.sequenceLength).toBe(2);
    expect(result.isHallucinationSuspected).toBe(false);
  });

  it('should parse different API response formats', () => {
    // Test OpenAI format
    const openaiResponse = {
      choices: [{
        logprobs: {
          tokens: ["Test", " response"],
          token_logprobs: [-0.1, -0.3]
        }
      }]
    };

    const openaiResult = parseTokenizedResponse(openaiResponse);
    expect(openaiResult).toHaveLength(2);
    expect(openaiResult[0].probability).toBeCloseTo(Math.exp(-0.1), 3);

    // Test direct format
    const directResponse = {
      tokens: ["Direct", " format"],
      logprobs: [-0.2, -0.4]
    };

    const directResult = parseTokenizedResponse(directResponse);
    expect(directResult).toHaveLength(2);
    expect(directResult[0].probability).toBeCloseTo(Math.exp(-0.2), 3);
  });
});