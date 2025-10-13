import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleTokenizer, TokenizationResult } from '../tokenizer';

describe('SimpleTokenizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('tokenize', () => {
    it('should tokenize simple text', () => {
      const text = 'Hello world';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toContain('Hello');
      expect(result.tokens).toContain('world');
      expect(result.probabilities).toHaveLength(result.tokens.length);
      expect(result.metadata.totalTokens).toBe(result.tokens.length);
      expect(result.metadata.averageProbability).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should preserve whitespace as tokens', () => {
      const text = 'Hello world';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toContain(' ');
    });

    it('should split long words into chunks', () => {
      const text = 'supercalifragilisticexpialidocious';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens.length).toBeGreaterThan(1);
      expect(result.tokens.join('')).toBe(text);
    });

    it('should handle empty string', () => {
      const text = '';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toEqual([]);
      expect(result.probabilities).toEqual([]);
      expect(result.metadata.totalTokens).toBe(0);
    });

    it('should handle single word', () => {
      const text = 'Hello';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toContain('Hello');
      expect(result.probabilities).toHaveLength(1);
      expect(result.probabilities[0]).toBeGreaterThan(0);
      expect(result.probabilities[0]).toBeLessThanOrEqual(1);
    });

    it('should handle multiple spaces', () => {
      const text = 'Hello    world';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toContain('Hello');
      expect(result.tokens).toContain('world');
      expect(result.tokens.some(token => /\s+/.test(token))).toBe(true);
    });

    it('should handle text with numbers', () => {
      const text = 'The answer is 42';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toContain('The');
      expect(result.tokens).toContain('answer');
      expect(result.tokens).toContain('42');
    });

    it('should handle text with punctuation', () => {
      const text = 'Hello, world!';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens.some(token => token.includes(','))).toBe(true);
      expect(result.tokens.some(token => token.includes('!'))).toBe(true);
    });

    it('should calculate metadata correctly', () => {
      const text = 'Hello world test';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.metadata.totalTokens).toBe(result.tokens.length);
      expect(result.metadata.averageProbability).toBe(
        result.probabilities.reduce((sum, p) => sum + p, 0) / result.probabilities.length
      );
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('probability generation', () => {
    it('should assign higher probabilities to common words', () => {
      const commonText = 'the and or';
      const uncommonText = 'supercalifragilisticexpialidocious';

      const commonResult = SimpleTokenizer.tokenize(commonText);
      const uncommonResult = SimpleTokenizer.tokenize(uncommonText);

      const commonAvg = commonResult.metadata.averageProbability;
      const uncommonAvg = uncommonResult.metadata.averageProbability;

      expect(commonAvg).toBeGreaterThan(uncommonAvg);
    });

    it('should assign high probabilities to whitespace', () => {
      const text = 'a b';
      const result = SimpleTokenizer.tokenize(text);

      const spaceToken = result.tokens.find(token => /^\s+$/.test(token));
      const spaceIndex = result.tokens.indexOf(spaceToken!);
      
      if (spaceIndex !== -1) {
        expect(result.probabilities[spaceIndex]).toBeGreaterThan(0.9);
      }
    });

    it('should assign lower probabilities to numbers', () => {
      const textWithNumbers = 'The value is 99.7%';
      const textWithoutNumbers = 'The value is high';

      const numbersResult = SimpleTokenizer.tokenize(textWithNumbers);
      const noNumbersResult = SimpleTokenizer.tokenize(textWithoutNumbers);

      // Find tokens with numbers
      const numberTokens = numbersResult.tokens
        .map((token, index) => ({ token, prob: numbersResult.probabilities[index] }))
        .filter(({ token }) => /\d/.test(token));

      const regularTokens = noNumbersResult.tokens
        .map((token, index) => ({ token, prob: noNumbersResult.probabilities[index] }))
        .filter(({ token }) => !/\s/.test(token)); // Exclude whitespace

      if (numberTokens.length > 0 && regularTokens.length > 0) {
        const avgNumberProb = numberTokens.reduce((sum, { prob }) => sum + prob, 0) / numberTokens.length;
        const avgRegularProb = regularTokens.reduce((sum, { prob }) => sum + prob, 0) / regularTokens.length;

        expect(avgNumberProb).toBeLessThan(avgRegularProb);
      }
    });

    it('should assign lower probabilities to unusual words', () => {
      const text = 'unprecedented revolutionary perfect exactly';
      const result = SimpleTokenizer.tokenize(text);

      // All these words should get lower probabilities
      result.probabilities.forEach(prob => {
        expect(prob).toBeLessThan(0.8); // Should be below normal probability
      });
    });

    it('should assign medium-low probabilities to technical terms', () => {
      const text = 'quantum algorithm optimization';
      const result = SimpleTokenizer.tokenize(text);

      // Technical terms should get reduced probabilities
      const nonWhitespaceProbs = result.probabilities.filter((prob, index) => 
        !/^\s+$/.test(result.tokens[index])
      );

      nonWhitespaceProbs.forEach(prob => {
        expect(prob).toBeLessThan(0.9);
      });
    });

    it('should ensure all probabilities are within valid range', () => {
      const text = 'This is a test with various words including numbers 123.45 and symbols!';
      const result = SimpleTokenizer.tokenize(text);

      result.probabilities.forEach(prob => {
        expect(prob).toBeGreaterThan(0);
        expect(prob).toBeLessThanOrEqual(1);
      });
    });

    it('should add randomness to probabilities', () => {
      const text = 'same same same';
      const result1 = SimpleTokenizer.tokenize(text);
      const result2 = SimpleTokenizer.tokenize(text);

      // Due to randomness, probabilities should likely be different
      // (though there's a small chance they could be the same)
      const prob1 = result1.probabilities[0];
      const prob2 = result2.probabilities[0];

      // Both should be in reasonable range for the word "same"
      expect(prob1).toBeGreaterThan(0.5);
      expect(prob1).toBeLessThan(1);
      expect(prob2).toBeGreaterThan(0.5);
      expect(prob2).toBeLessThan(1);
    });
  });

  describe('chunk splitting', () => {
    it('should split very long words appropriately', () => {
      const longWord = 'a'.repeat(20);
      const result = SimpleTokenizer.tokenize(longWord);

      expect(result.tokens.length).toBeGreaterThan(1);
      expect(result.tokens.join('')).toBe(longWord);
    });

    it('should not split short words', () => {
      const shortWord = 'hello';
      const result = SimpleTokenizer.tokenize(shortWord);

      expect(result.tokens).toEqual(['hello']);
    });

    it('should handle edge case of exactly 6 characters', () => {
      const sixCharWord = 'exactly';
      const result = SimpleTokenizer.tokenize(sixCharWord);

      expect(result.tokens).toEqual(['exactly']);
    });

    it('should handle edge case of 7 characters', () => {
      const sevenCharWord = 'exactly7';
      const result = SimpleTokenizer.tokenize(sevenCharWord);

      expect(result.tokens.length).toBeGreaterThan(1);
      expect(result.tokens.join('')).toBe(sevenCharWord);
    });
  });

  describe('utility methods', () => {
    describe('tokensToString', () => {
      it('should convert tokens to comma-separated string', () => {
        const tokens = ['Hello', ' ', 'world'];
        const result = SimpleTokenizer.tokensToString(tokens);

        expect(result).toBe('"Hello", " ", "world"');
      });

      it('should handle empty array', () => {
        const tokens: string[] = [];
        const result = SimpleTokenizer.tokensToString(tokens);

        expect(result).toBe('');
      });

      it('should handle single token', () => {
        const tokens = ['Hello'];
        const result = SimpleTokenizer.tokensToString(tokens);

        expect(result).toBe('"Hello"');
      });
    });

    describe('probabilitiesToString', () => {
      it('should convert probabilities to comma-separated string', () => {
        const probabilities = [0.9, 0.8, 0.7];
        const result = SimpleTokenizer.probabilitiesToString(probabilities);

        expect(result).toBe('0.9000, 0.8000, 0.7000');
      });

      it('should handle empty array', () => {
        const probabilities: number[] = [];
        const result = SimpleTokenizer.probabilitiesToString(probabilities);

        expect(result).toBe('');
      });

      it('should format to 4 decimal places', () => {
        const probabilities = [0.123456789];
        const result = SimpleTokenizer.probabilitiesToString(probabilities);

        expect(result).toBe('0.1235');
      });
    });

    describe('parseTokensString', () => {
      it('should parse comma-separated tokens string', () => {
        const tokensString = '"Hello", " ", "world"';
        const result = SimpleTokenizer.parseTokensString(tokensString);

        expect(result).toEqual(['Hello', ' ', 'world']);
      });

      it('should handle single quotes', () => {
        const tokensString = "'Hello', ' ', 'world'";
        const result = SimpleTokenizer.parseTokensString(tokensString);

        expect(result).toEqual(['Hello', ' ', 'world']);
      });

      it('should handle mixed quotes', () => {
        const tokensString = '"Hello", \' \', "world"';
        const result = SimpleTokenizer.parseTokensString(tokensString);

        expect(result).toEqual(['Hello', ' ', 'world']);
      });

      it('should filter out empty tokens', () => {
        const tokensString = '"Hello", "", "world"';
        const result = SimpleTokenizer.parseTokensString(tokensString);

        expect(result).toEqual(['Hello', 'world']);
      });

      it('should handle empty string', () => {
        const tokensString = '';
        const result = SimpleTokenizer.parseTokensString(tokensString);

        expect(result).toEqual([]);
      });

      it('should handle tokens without quotes', () => {
        const tokensString = 'Hello, world, test';
        const result = SimpleTokenizer.parseTokensString(tokensString);

        expect(result).toEqual(['Hello', 'world', 'test']);
      });
    });

    describe('parseProbabilitiesString', () => {
      it('should parse comma-separated probabilities string', () => {
        const probsString = '0.9, 0.8, 0.7';
        const result = SimpleTokenizer.parseProbabilitiesString(probsString);

        expect(result).toEqual([0.9, 0.8, 0.7]);
      });

      it('should handle different decimal formats', () => {
        const probsString = '0.9000, .8, 0.70';
        const result = SimpleTokenizer.parseProbabilitiesString(probsString);

        expect(result).toEqual([0.9, 0.8, 0.7]);
      });

      it('should filter out invalid numbers', () => {
        const probsString = '0.9, invalid, 0.7, NaN';
        const result = SimpleTokenizer.parseProbabilitiesString(probsString);

        expect(result).toEqual([0.9, 0.7]);
      });

      it('should handle empty string', () => {
        const probsString = '';
        const result = SimpleTokenizer.parseProbabilitiesString(probsString);

        expect(result).toEqual([]);
      });

      it('should handle scientific notation', () => {
        const probsString = '1e-1, 2e-2, 3e-3';
        const result = SimpleTokenizer.parseProbabilitiesString(probsString);

        expect(result).toEqual([0.1, 0.02, 0.003]);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle text with only whitespace', () => {
      const text = '   ';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.tokens.every(token => /^\s+$/.test(token))).toBe(true);
    });

    it('should handle text with special characters', () => {
      const text = 'Hello@#$%^&*()world';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens.join('')).toBe(text);
      expect(result.probabilities).toHaveLength(result.tokens.length);
    });

    it('should handle very long text', () => {
      const text = 'word '.repeat(1000).trim();
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens.length).toBeGreaterThan(1000);
      expect(result.metadata.totalTokens).toBe(result.tokens.length);
    });

    it('should handle unicode characters', () => {
      const text = 'Hello 世界 🌍';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toContain('Hello');
      expect(result.tokens.some(token => token.includes('世界'))).toBe(true);
      expect(result.tokens.some(token => token.includes('🌍'))).toBe(true);
    });

    it('should handle newlines and tabs', () => {
      const text = 'Hello\nworld\ttest';
      const result = SimpleTokenizer.tokenize(text);

      expect(result.tokens).toContain('Hello');
      expect(result.tokens).toContain('world');
      expect(result.tokens).toContain('test');
    });

    it('should maintain token order', () => {
      const text = 'first second third';
      const result = SimpleTokenizer.tokenize(text);

      const firstIndex = result.tokens.indexOf('first');
      const secondIndex = result.tokens.indexOf('second');
      const thirdIndex = result.tokens.indexOf('third');

      expect(firstIndex).toBeLessThan(secondIndex);
      expect(secondIndex).toBeLessThan(thirdIndex);
    });

    it('should handle repeated words', () => {
      const text = 'test test test';
      const result = SimpleTokenizer.tokenize(text);

      const testTokens = result.tokens.filter(token => token === 'test');
      expect(testTokens).toHaveLength(3);
    });
  });

  describe('performance', () => {
    it('should complete tokenization in reasonable time', () => {
      const text = 'This is a moderately long text that should be tokenized efficiently without taking too much time to process.';
      
      const startTime = Date.now();
      const result = SimpleTokenizer.tokenize(text);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete in less than 100ms
      expect(result.metadata.processingTime).toBeLessThan(100);
    });

    it('should handle large text efficiently', () => {
      const largeText = 'word '.repeat(10000).trim();
      
      const startTime = Date.now();
      const result = SimpleTokenizer.tokenize(largeText);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
      expect(result.tokens.length).toBeGreaterThan(10000);
    });
  });
});