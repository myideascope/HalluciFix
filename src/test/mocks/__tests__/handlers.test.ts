import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { server } from '../server';
import { 
  handlers, 
  createMockAnalysisResponse, 
  createMockGoogleDriveFiles,
  mockApiResponses 
} from '../handlers';
import { 
  mockAnalysisScenarios,
  mockGoogleDriveScenarios,
  mockSupabaseScenarios,
  mockOpenAIScenarios,
  resetAllMocks,
  createCustomMockResponse
} from '../utils';

describe('MSW Handlers and Utilities', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    resetAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    vi.clearAllMocks();
  });

  describe('Mock Data Generators', () => {
    it('should generate realistic analysis response', () => {
      const testContent = 'This is test content with exactly 99.7% accuracy.';
      const response = createMockAnalysisResponse(testContent);
      
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('accuracy');
      expect(response).toHaveProperty('riskLevel');
      expect(response).toHaveProperty('hallucinations');
      expect(response).toHaveProperty('verificationSources');
      expect(response).toHaveProperty('processingTime');
      expect(response).toHaveProperty('metadata');
      
      expect(typeof response.accuracy).toBe('number');
      expect(response.accuracy).toBeGreaterThanOrEqual(0);
      expect(response.accuracy).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(response.riskLevel);
      
      // Should detect suspicious patterns in the content
      expect(response.hallucinations.length).toBeGreaterThan(0);
      expect(response.accuracy).toBeLessThan(90); // Should be lower due to suspicious content
    });

    it('should generate different responses for different content', () => {
      const cleanContent = 'This is a normal, factual statement about technology.';
      const suspiciousContent = 'Our system achieves exactly 99.9% accuracy with zero errors.';
      
      const cleanResponse = createMockAnalysisResponse(cleanContent);
      const suspiciousResponse = createMockAnalysisResponse(suspiciousContent);
      
      expect(suspiciousResponse.accuracy).toBeLessThan(cleanResponse.accuracy);
      expect(suspiciousResponse.hallucinations.length).toBeGreaterThan(cleanResponse.hallucinations.length);
    });

    it('should validate handler configuration', () => {
      expect(Array.isArray(handlers)).toBe(true);
      expect(handlers.length).toBeGreaterThan(0);
    });

    it('should provide consistent mock data structure', () => {
      const response1 = createMockAnalysisResponse('Test content 1');
      const response2 = createMockAnalysisResponse('Test content 2');
      
      // Both responses should have the same structure
      const keys1 = Object.keys(response1).sort();
      const keys2 = Object.keys(response2).sort();
      expect(keys1).toEqual(keys2);
    });
  });

  describe('Google Drive Mock Utilities', () => {
    it('should generate realistic Google Drive files', () => {
      const files = createMockGoogleDriveFiles();
      
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
      
      files.forEach(file => {
        expect(file).toHaveProperty('id');
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('mimeType');
        expect(file).toHaveProperty('modifiedTime');
        expect(file).toHaveProperty('webViewLink');
        expect(file).toHaveProperty('parents');
        
        expect(typeof file.id).toBe('string');
        expect(typeof file.name).toBe('string');
        expect(typeof file.mimeType).toBe('string');
        expect(Array.isArray(file.parents)).toBe(true);
      });
    });

    it('should provide different file types', () => {
      const files = createMockGoogleDriveFiles();
      const mimeTypes = files.map(f => f.mimeType);
      const uniqueMimeTypes = new Set(mimeTypes);
      
      expect(uniqueMimeTypes.size).toBeGreaterThan(1);
    });
  });

  describe('Mock API Response Utilities', () => {
    it('should provide high accuracy response', () => {
      const response = mockApiResponses.highAccuracy('Clean content');
      
      expect(response.accuracy).toBeGreaterThan(90);
      expect(response.riskLevel).toBe('low');
      expect(response.hallucinations).toHaveLength(0);
    });

    it('should provide low accuracy response', () => {
      const response = mockApiResponses.lowAccuracy('Suspicious content');
      
      expect(response.accuracy).toBeLessThan(50);
      expect(response.riskLevel).toBe('critical');
      expect(response.hallucinations.length).toBeGreaterThan(0);
    });

    it('should provide processing error response', () => {
      const errorResponse = mockApiResponses.processingError();
      
      expect(errorResponse.status).toBe(422);
    });

    it('should provide rate limit error response', () => {
      const errorResponse = mockApiResponses.rateLimitError();
      
      expect(errorResponse.status).toBe(429);
    });
  });

  describe('Mock Scenario Configuration', () => {
    it('should configure analysis scenarios without errors', () => {
      expect(() => mockAnalysisScenarios.highAccuracy('Test content')).not.toThrow();
      expect(() => mockAnalysisScenarios.lowAccuracy()).not.toThrow();
      expect(() => mockAnalysisScenarios.apiError(500, 'Server error')).not.toThrow();
      expect(() => mockAnalysisScenarios.rateLimitError()).not.toThrow();
    });

    it('should configure Google Drive scenarios without errors', () => {
      const testFiles = [{ id: 'test1', name: 'Test.txt', mimeType: 'text/plain' }];
      
      expect(() => mockGoogleDriveScenarios.successfulListing(testFiles)).not.toThrow();
      expect(() => mockGoogleDriveScenarios.authError()).not.toThrow();
      expect(() => mockGoogleDriveScenarios.successfulDownload('file1', 'content')).not.toThrow();
      expect(() => mockGoogleDriveScenarios.emptyListing()).not.toThrow();
    });

    it('should configure Supabase scenarios without errors', () => {
      expect(() => mockSupabaseScenarios.successfulOperations()).not.toThrow();
      expect(() => mockSupabaseScenarios.connectionError()).not.toThrow();
    });

    it('should configure OpenAI scenarios without errors', () => {
      const testClaims = [{ claim: 'test', verification_status: 'verified', confidence: 0.9 }];
      
      expect(() => mockOpenAIScenarios.successfulRAG(testClaims)).not.toThrow();
      expect(() => mockOpenAIScenarios.apiError(500)).not.toThrow();
    });
  });

  describe('Custom Mock Response Creation', () => {
    it('should create custom mock responses without errors', () => {
      const customResponse = { message: 'Custom response' };
      
      expect(() => createCustomMockResponse(
        'https://api.example.com/test', 
        'GET', 
        customResponse
      )).not.toThrow();
      
      expect(() => createCustomMockResponse(
        'https://api.example.com/error', 
        'POST', 
        { error: 'Custom error' }, 
        400
      )).not.toThrow();
    });

    it('should handle different HTTP methods', () => {
      const methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE'> = ['GET', 'POST', 'PUT', 'DELETE'];
      
      methods.forEach(method => {
        expect(() => createCustomMockResponse(
          `https://api.example.com/${method.toLowerCase()}`, 
          method, 
          { method }
        )).not.toThrow();
      });
    });
  });

  describe('Reset and Cleanup Utilities', () => {
    it('should reset all mocks without errors', () => {
      // Configure some scenarios first
      mockAnalysisScenarios.highAccuracy();
      mockGoogleDriveScenarios.authError();
      
      // Reset should not throw
      expect(() => resetAllMocks()).not.toThrow();
    });

    it('should provide server instance for direct access', () => {
      expect(server).toBeDefined();
      expect(typeof server.listen).toBe('function');
      expect(typeof server.close).toBe('function');
      expect(typeof server.resetHandlers).toBe('function');
    });
  });

  describe('Mock Data Consistency', () => {
    it('should generate consistent analysis response structure', () => {
      const responses = Array.from({ length: 5 }, (_, i) => 
        createMockAnalysisResponse(`Test content ${i}`)
      );
      
      const firstKeys = Object.keys(responses[0]).sort();
      responses.forEach(response => {
        const keys = Object.keys(response).sort();
        expect(keys).toEqual(firstKeys);
      });
    });

    it('should generate unique IDs for different responses', () => {
      const responses = Array.from({ length: 10 }, (_, i) => 
        createMockAnalysisResponse(`Test content ${i}`)
      );
      
      const ids = responses.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should correlate accuracy with risk level', () => {
      const highAccuracyResponse = mockApiResponses.highAccuracy('Clean content');
      const lowAccuracyResponse = mockApiResponses.lowAccuracy('Suspicious content');
      
      expect(highAccuracyResponse.accuracy).toBeGreaterThan(lowAccuracyResponse.accuracy);
      expect(highAccuracyResponse.riskLevel).toBe('low');
      expect(lowAccuracyResponse.riskLevel).toBe('critical');
    });
  });
});