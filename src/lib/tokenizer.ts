/**
 * Simple tokenizer for seq-logprob analysis
 * Provides basic tokenization with mock probability generation
 */

export interface TokenizationResult {
  tokens: string[];
  probabilities: number[];
  metadata: {
    totalTokens: number;
    averageProbability: number;
    processingTime: number;
  };
}

export class SimpleTokenizer {
  /**
   * Tokenize text and generate mock probabilities
   */
  static tokenize(text: string): TokenizationResult {
    const startTime = Date.now();
    
    // Simple word-based tokenization with space preservation
    const tokens: string[] = [];
    const words = text.split(/(\s+)/);
    
    for (const word of words) {
      if (word.trim()) {
        // Split word into subword tokens (simplified BPE-like approach)
        if (word.length > 6) {
          // Split longer words into smaller tokens
          const chunks = this.splitIntoChunks(word, 3, 6);
          tokens.push(...chunks);
        } else {
          tokens.push(word);
        }
      } else if (word) {
        // Preserve whitespace as tokens
        tokens.push(word);
      }
    }

    // Generate realistic probabilities based on token characteristics
    const probabilities = tokens.map(token => this.generateTokenProbability(token, tokens));
    
    const averageProbability = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
    const processingTime = Date.now() - startTime;

    return {
      tokens,
      probabilities,
      metadata: {
        totalTokens: tokens.length,
        averageProbability,
        processingTime
      }
    };
  }

  /**
   * Split word into smaller chunks
   */
  private static splitIntoChunks(word: string, minSize: number, maxSize: number): string[] {
    const chunks: string[] = [];
    let remaining = word;
    
    while (remaining.length > 0) {
      const chunkSize = Math.min(
        maxSize,
        Math.max(minSize, Math.floor(remaining.length / 2))
      );
      
      if (remaining.length <= maxSize) {
        chunks.push(remaining);
        break;
      }
      
      chunks.push(remaining.substring(0, chunkSize));
      remaining = remaining.substring(chunkSize);
    }
    
    return chunks;
  }

  /**
   * Generate realistic token probability based on characteristics
   */
  private static generateTokenProbability(token: string, allTokens: string[]): number {
    let baseProbability = 0.7; // Base probability
    
    // Adjust based on token characteristics
    
    // Common words get higher probability
    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    if (commonWords.includes(token.toLowerCase())) {
      baseProbability += 0.2;
    }
    
    // Whitespace tokens get high probability
    if (/^\s+$/.test(token)) {
      baseProbability = 0.9 + Math.random() * 0.1;
    }
    
    // Very short tokens get higher probability
    if (token.length <= 2) {
      baseProbability += 0.1;
    }
    
    // Very long tokens get lower probability
    if (token.length > 10) {
      baseProbability -= 0.2;
    }
    
    // Numbers and specific values get lower probability
    if (/\d/.test(token)) {
      baseProbability -= 0.1;
      
      // Very specific numbers get much lower probability
      if (/\d+\.\d+/.test(token)) {
        baseProbability -= 0.3;
      }
    }
    
    // Unusual words get lower probability
    const unusualWords = ['unprecedented', 'revolutionary', 'perfect', 'impossible', 'exactly', 'precisely'];
    if (unusualWords.some(word => token.toLowerCase().includes(word))) {
      baseProbability -= 0.4;
    }
    
    // Technical terms get medium-low probability
    const technicalTerms = ['quantum', 'algorithm', 'optimization', 'breakthrough', 'paradigm'];
    if (technicalTerms.some(term => token.toLowerCase().includes(term))) {
      baseProbability -= 0.2;
    }
    
    // Add some randomness
    baseProbability += (Math.random() - 0.5) * 0.2;
    
    // Ensure probability is within valid range
    return Math.max(0.001, Math.min(0.999, baseProbability));
  }

  /**
   * Create comma-separated string from tokens
   */
  static tokensToString(tokens: string[]): string {
    return tokens.map(token => `"${token}"`).join(', ');
  }

  /**
   * Create comma-separated string from probabilities
   */
  static probabilitiesToString(probabilities: number[]): string {
    return probabilities.map(p => p.toFixed(4)).join(', ');
  }

  /**
   * Parse comma-separated tokens string
   */
  static parseTokensString(tokensString: string): string[] {
    return tokensString
      .split(',')
      .map(token => token.trim().replace(/^["']|["']$/g, ''))
      .filter(token => token.length > 0);
  }

  /**
   * Parse comma-separated probabilities string
   */
  static parseProbabilitiesString(probsString: string): number[] {
    return probsString
      .split(',')
      .map(prob => parseFloat(prob.trim()))
      .filter(prob => !isNaN(prob));
  }
}

export default SimpleTokenizer;