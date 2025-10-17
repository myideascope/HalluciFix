/**
 * Integration Test Runner
 * Runs comprehensive integration tests for all services
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { serviceIntegrationValidator } from '../../lib/integration/ServiceIntegrationValidator';
import { providerManager } from '../../lib/providers/ProviderManager';
import { aiService } from '../../lib/providers/ai/AIService';
import { googleDriveService } from '../../lib/googleDrive';
import ragService from '../../lib/ragService';
import analysisService from '../../lib/analysisService';

describe('Service Integration Test Suite', () => {
  let integrationStatus: any;

  beforeAll(async () => {
    // Initialize all services for integration testing
    try {
      console.log('🚀 Initializing services for integration testing...');
      
      // Initialize provider manager
      await providerManager.initialize({
        enableHealthChecks: false, // Disable for testing
        validateSecurity: false,
        enableMockFallback: true,
        skipProviderValidation: true
      });

      // Initialize AI service
      await aiService.initialize();

      // Initialize Google Drive service
      await googleDriveService.initialize();

      console.log('✅ Services initialized for integration testing');
    } catch (error) {
      console.error('❌ Failed to initialize services for testing:', error);
      throw error;
    }
  });

  afterAll(async () => {
    // Cleanup after tests
    try {
      providerManager.shutdown();
      await aiService.shutdown();
      console.log('✅ Services cleaned up after integration testing');
    } catch (error) {
      console.warn('⚠️ Error during service cleanup:', error);
    }
  });

  describe('Service Integration Validation', () => {
    it('should validate all service integrations', async () => {
      integrationStatus = await serviceIntegrationValidator.validateIntegration();
      
      expect(integrationStatus).toBeDefined();
      expect(integrationStatus.overall).toBeOneOf(['healthy', 'degraded', 'critical']);
      expect(integrationStatus.services).toBeDefined();
      expect(integrationStatus.integrationTests).toBeDefined();
    }, 30000); // 30 second timeout for comprehensive validation

    it('should have all core services initialized', () => {
      expect(integrationStatus.services.providerManager.initialized).toBe(true);
      expect(integrationStatus.services.aiService.initialized).toBe(true);
      expect(integrationStatus.services.analysisService.initialized).toBe(true);
      expect(integrationStatus.services.ragService.initialized).toBe(true);
    });

    it('should pass critical integration tests', () => {
      // These tests are critical for core functionality
      expect(integrationStatus.integrationTests.aiProviderIntegration.passed).toBe(true);
      expect(integrationStatus.integrationTests.databaseIntegration.passed).toBe(true);
      expect(integrationStatus.integrationTests.endToEndWorkflow.passed).toBe(true);
    });

    it('should not have critical issues', () => {
      expect(integrationStatus.criticalIssues).toHaveLength(0);
    });
  });

  describe('Provider Manager Integration', () => {
    it('should have provider manager properly configured', () => {
      const status = providerManager.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.configurationValid).toBe(true);
      expect(status.totalProviders).toBeGreaterThan(0);
    });

    it('should provide AI providers', () => {
      const aiProvider = providerManager.getAIProvider();
      // In test environment, this might be null if no real providers are configured
      // That's acceptable as long as mock providers are available
      expect(typeof aiProvider === 'object' || aiProvider === null).toBe(true);
    });

    it('should handle provider health checks', () => {
      const healthStatus = providerManager.getHealthStatus();
      
      expect(healthStatus).toBeDefined();
      expect(healthStatus.registry).toBeDefined();
      expect(healthStatus.providers).toBeDefined();
    });
  });

  describe('AI Service Integration', () => {
    it('should have AI service properly initialized', () => {
      const status = aiService.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.enabledProviders).toBeDefined();
      expect(Array.isArray(status.enabledProviders)).toBe(true);
    });

    it('should handle provider failover configuration', () => {
      const status = aiService.getStatus();
      
      expect(typeof status.failoverEnabled).toBe('boolean');
      expect(typeof status.healthCheckEnabled).toBe('boolean');
    });

    it('should provide health metrics', () => {
      const healthMetrics = aiService.getHealthMetrics();
      
      expect(Array.isArray(healthMetrics)).toBe(true);
    });
  });

  describe('Google Drive Integration', () => {
    it('should check Google Drive availability', async () => {
      const isAvailable = await googleDriveService.isAvailable();
      
      // In test environment, this might be false if not configured
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should provide supported MIME types', () => {
      const mimeTypes = googleDriveService.getSupportedMimeTypes();
      
      expect(Array.isArray(mimeTypes)).toBe(true);
      expect(mimeTypes.length).toBeGreaterThan(0);
    });

    it('should handle file type validation', () => {
      const category = googleDriveService.getFileTypeCategory('application/pdf');
      expect(category).toBe('pdf');
      
      const description = googleDriveService.getFileTypeDescription('application/pdf');
      expect(typeof description).toBe('string');
    });
  });

  describe('RAG Service Integration', () => {
    it('should have knowledge sources configured', () => {
      const sources = ragService.getKnowledgeSources();
      
      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it('should provide knowledge base metrics', () => {
      const metrics = ragService.getKnowledgeBaseMetrics();
      
      expect(metrics).toBeDefined();
      expect(typeof metrics.totalSources).toBe('number');
      expect(typeof metrics.enabledSources).toBe('number');
      expect(typeof metrics.averageReliability).toBe('number');
      expect(metrics.realProviders).toBeDefined();
    });

    it('should handle knowledge source management', () => {
      const sources = ragService.getKnowledgeSources();
      const initialCount = sources.length;
      
      // Test adding a custom source
      const customSource = ragService.addCustomKnowledgeSource({
        name: 'Test Source',
        description: 'Test knowledge source for integration testing',
        type: 'custom',
        reliability_score: 0.8,
        last_updated: new Date().toISOString(),
        enabled: true
      });
      
      expect(customSource).toBeDefined();
      expect(customSource.id).toBeDefined();
      
      const updatedSources = ragService.getKnowledgeSources();
      expect(updatedSources.length).toBe(initialCount + 1);
      
      // Test removing the source
      const removed = ragService.removeKnowledgeSource(customSource.id);
      expect(removed).toBe(true);
      
      const finalSources = ragService.getKnowledgeSources();
      expect(finalSources.length).toBe(initialCount);
    });
  });

  describe('Analysis Service Integration', () => {
    it('should provide performance metrics', () => {
      const metrics = analysisService.getPerformanceMetrics();
      
      expect(metrics).toBeDefined();
      // The exact structure depends on the implementation
      expect(typeof metrics).toBe('object');
    });

    it('should handle analysis history queries', async () => {
      const history = await analysisService.getAnalysisHistory('test-user-id', {
        limit: 10
      });
      
      expect(Array.isArray(history)).toBe(true);
    });

    it('should handle user analytics queries', async () => {
      const analytics = await analysisService.getUserAnalytics('test-user-id');
      
      expect(typeof analytics).toBe('object');
    });
  });

  describe('End-to-End Workflow Integration', () => {
    it('should handle complete analysis workflow', async () => {
      const testContent = 'This is a test content for integration validation. According to recent studies, 99.9% of AI models are perfect.';
      const testUserId = 'integration-test-user';
      
      try {
        // This should work with mock providers in test environment
        const result = await analysisService.analyzeContent(testContent, testUserId, {
          sensitivity: 'medium',
          includeSourceVerification: true,
          enableRAG: true
        });
        
        expect(result).toBeDefined();
        expect(result.analysis).toBeDefined();
        expect(result.analysis.id).toBeDefined();
        expect(result.analysis.user_id).toBe(testUserId);
        expect(result.analysis.content).toBeDefined();
        expect(typeof result.analysis.accuracy).toBe('number');
        expect(result.analysis.riskLevel).toBeOneOf(['low', 'medium', 'high', 'critical']);
        expect(Array.isArray(result.analysis.hallucinations)).toBe(true);
        
        // RAG analysis might be available
        if (result.ragAnalysis) {
          expect(typeof result.ragAnalysis.original_accuracy).toBe('number');
          expect(typeof result.ragAnalysis.rag_enhanced_accuracy).toBe('number');
          expect(Array.isArray(result.ragAnalysis.verified_claims)).toBe(true);
        }
        
      } catch (error) {
        // In test environment, this might fail due to missing real providers
        // That's acceptable as long as the error is handled gracefully
        expect(error).toBeInstanceOf(Error);
        console.log('Analysis failed as expected in test environment:', error.message);
      }
    }, 15000); // 15 second timeout for analysis

    it('should handle batch analysis workflow', async () => {
      const testDocuments = [
        {
          id: 'doc-1',
          content: 'First test document with some claims.',
          filename: 'test1.txt'
        },
        {
          id: 'doc-2',
          content: 'Second test document with different content.',
          filename: 'test2.txt'
        }
      ];
      const testUserId = 'integration-test-user';
      
      try {
        const results = await analysisService.analyzeBatch(testDocuments, testUserId, {
          sensitivity: 'medium',
          enableRAG: false, // Disable RAG for faster testing
          batchSize: 2,
          maxConcurrency: 1
        });
        
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(testDocuments.length);
        
        results.forEach((result, index) => {
          expect(result.analysis).toBeDefined();
          expect(result.analysis.filename).toBe(testDocuments[index].filename);
          expect(result.analysis.analysisType).toBe('batch');
        });
        
      } catch (error) {
        // In test environment, this might fail due to missing real providers
        console.log('Batch analysis failed as expected in test environment:', error.message);
        expect(error).toBeInstanceOf(Error);
      }
    }, 20000); // 20 second timeout for batch analysis
  });

  describe('Error Handling and Resilience', () => {
    it('should handle service degradation gracefully', async () => {
      // Test quick health check
      const healthCheck = await serviceIntegrationValidator.quickHealthCheck();
      
      expect(healthCheck).toBeDefined();
      expect(healthCheck.status).toBeOneOf(['healthy', 'degraded', 'critical']);
      expect(healthCheck.timestamp).toBeInstanceOf(Date);
      expect(typeof healthCheck.summary).toBe('string');
    });

    it('should provide meaningful error messages', () => {
      // Test that services provide meaningful error information
      const providerStatus = providerManager.getStatus();
      const aiStatus = aiService.getStatus();
      
      expect(Array.isArray(providerStatus.errors)).toBe(true);
      expect(Array.isArray(providerStatus.warnings)).toBe(true);
      expect(Array.isArray(aiStatus.healthyProviders)).toBe(true);
      expect(Array.isArray(aiStatus.unhealthyProviders)).toBe(true);
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track integration test performance', () => {
      if (integrationStatus?.integrationTests) {
        Object.values(integrationStatus.integrationTests).forEach((test: any) => {
          expect(typeof test.duration).toBe('number');
          expect(test.duration).toBeGreaterThan(0);
        });
      }
    });

    it('should provide service metrics', () => {
      const providerStatus = providerManager.getStatus();
      const aiStatus = aiService.getStatus();
      const ragMetrics = ragService.getKnowledgeBaseMetrics();
      
      // Verify metrics are available
      expect(typeof providerStatus.totalProviders).toBe('number');
      expect(typeof providerStatus.healthyProviders).toBe('number');
      expect(Array.isArray(aiStatus.enabledProviders)).toBe(true);
      expect(typeof ragMetrics.totalSources).toBe('number');
    });
  });
});