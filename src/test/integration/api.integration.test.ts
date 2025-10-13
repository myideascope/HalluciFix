import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase, seedMinimalTestData, testDataScenarios, getTestDatabase } from '../utils/database';
import analysisService from '../../lib/analysisService';
import { googleDriveService } from '../../lib/googleDrive';
import { createApiClient } from '../../lib/api';
import { supabase } from '../../lib/supabase';

describe('API Integration Tests', () => {
  let testData: any;
  
  beforeEach(async () => {
    await setupTestDatabase();
    testData = await seedMinimalTestData();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('Analysis Service Integration', () => {
    it('should perform complete analysis workflow from request to database storage', async () => {
      const content = 'Our AI system achieves exactly 99.7% accuracy with zero false positives guaranteed.';
      
      // Perform analysis
      const { analysis, ragAnalysis, seqLogprobResult } = await analysisService.analyzeContent(
        content, 
        testData.user.id,
        {
          sensitivity: 'high',
          includeSourceVerification: true,
          maxHallucinations: 10,
          enableRAG: true
        }
      );
      
      // Verify analysis result structure
      expect(analysis).toMatchObject({
        id: expect.any(String),
        user_id: testData.user.id,
        content: expect.any(String),
        timestamp: expect.any(String),
        accuracy: expect.any(Number),
        riskLevel: expect.stringMatching(/^(low|medium|high|critical)$/),
        hallucinations: expect.any(Array),
        verificationSources: expect.any(Number),
        processingTime: expect.any(Number),
        analysisType: 'single',
        fullContent: content
      });
      
      // Verify accuracy is within valid range
      expect(analysis.accuracy).toBeGreaterThanOrEqual(0);
      expect(analysis.accuracy).toBeLessThanOrEqual(100);
      
      // Verify hallucinations were detected (this content should trigger some)
      expect(analysis.hallucinations.length).toBeGreaterThan(0);
      
      // Verify seq-logprob analysis was performed
      expect(seqLogprobResult).toBeDefined();
      expect(seqLogprobResult).toMatchObject({
        seqLogprob: expect.any(Number),
        normalizedSeqLogprob: expect.any(Number),
        confidenceScore: expect.any(Number),
        hallucinationRisk: expect.stringMatching(/^(low|medium|high|critical)$/),
        isHallucinationSuspected: expect.any(Boolean)
      });
      
      // Store analysis in database
      const db = getTestDatabase();
      const { data: storedAnalysis, error } = await db
        .from('analysis_results')
        .insert({
          id: analysis.id,
          user_id: analysis.user_id,
          content: analysis.content,
          accuracy: analysis.accuracy,
          risk_level: analysis.riskLevel,
          hallucinations: analysis.hallucinations,
          verification_sources: analysis.verificationSources,
          processing_time: analysis.processingTime,
          created_at: analysis.timestamp,
          analysis_type: analysis.analysisType,
          filename: analysis.filename,
          full_content: analysis.fullContent,
          seq_logprob_analysis: analysis.seqLogprobAnalysis
        })
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(storedAnalysis).toBeDefined();
      expect(storedAnalysis.accuracy).toBe(analysis.accuracy);
      expect(storedAnalysis.risk_level).toBe(analysis.riskLevel);
    });

    it('should handle batch analysis workflow correctly', async () => {
      const documents = [
        { 
          id: 'doc1', 
          content: 'This is a factual statement about established scientific principles.',
          filename: 'scientific-facts.txt'
        },
        { 
          id: 'doc2', 
          content: 'Our revolutionary AI achieves 100% perfect accuracy with zero errors.',
          filename: 'marketing-claims.txt'
        },
        { 
          id: 'doc3', 
          content: 'According to recent studies, this method shows promising results.',
          filename: 'research-summary.txt'
        }
      ];
      
      // Perform batch analysis
      const results = await analysisService.analyzeBatch(
        documents, 
        testData.user.id,
        { sensitivity: 'medium', enableRAG: false }
      );
      
      // Verify all documents were processed
      expect(results).toHaveLength(3);
      
      // Verify each result
      results.forEach((result, index) => {
        expect(result.analysis).toMatchObject({
          user_id: testData.user.id,
          analysisType: 'batch',
          filename: documents[index].filename,
          fullContent: documents[index].content
        });
        
        expect(result.analysis.accuracy).toBeGreaterThanOrEqual(0);
        expect(result.analysis.accuracy).toBeLessThanOrEqual(100);
      });
      
      // Verify different accuracy levels based on content
      const factualDoc = results.find(r => r.analysis.filename === 'scientific-facts.txt');
      const marketingDoc = results.find(r => r.analysis.filename === 'marketing-claims.txt');
      
      expect(factualDoc?.analysis.accuracy).toBeGreaterThan(marketingDoc?.analysis.accuracy);
      expect(marketingDoc?.analysis.riskLevel).toMatch(/^(high|critical)$/);
      
      // Store batch results in database
      const db = getTestDatabase();
      const batchId = `test-batch-${Date.now()}`;
      
      for (const result of results) {
        const { error } = await db
          .from('analysis_results')
          .insert({
            id: result.analysis.id,
            user_id: result.analysis.user_id,
            content: result.analysis.content,
            accuracy: result.analysis.accuracy,
            risk_level: result.analysis.riskLevel,
            hallucinations: result.analysis.hallucinations,
            verification_sources: result.analysis.verificationSources,
            processing_time: result.analysis.processingTime,
            created_at: result.analysis.timestamp,
            analysis_type: result.analysis.analysisType,
            batch_id: batchId,
            filename: result.analysis.filename,
            full_content: result.analysis.fullContent
          });
        
        expect(error).toBeNull();
      }
      
      // Verify batch was stored correctly
      const { data: batchResults, error: batchError } = await db
        .from('analysis_results')
        .select('*')
        .eq('batch_id', batchId);
      
      expect(batchError).toBeNull();
      expect(batchResults).toHaveLength(3);
    });

    it('should handle analysis errors gracefully', async () => {
      // Mock API failure
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('API temporarily unavailable'));
      
      try {
        const content = 'Test content for error handling';
        
        // Should fall back to mock analysis when API fails
        const { analysis } = await analysisService.analyzeContent(content, testData.user.id);
        
        expect(analysis).toBeDefined();
        expect(analysis.user_id).toBe(testData.user.id);
        expect(analysis.fullContent).toBe(content);
        
        // Mock analysis should still provide valid results
        expect(analysis.accuracy).toBeGreaterThanOrEqual(0);
        expect(analysis.accuracy).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high', 'critical']).toContain(analysis.riskLevel);
        
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should validate analysis options and parameters', async () => {
      const content = 'Test content for options validation';
      
      // Test with various sensitivity levels
      const lowSensitivity = await analysisService.analyzeContent(
        content, 
        testData.user.id, 
        { sensitivity: 'low' }
      );
      
      const highSensitivity = await analysisService.analyzeContent(
        content, 
        testData.user.id, 
        { sensitivity: 'high' }
      );
      
      expect(lowSensitivity.analysis).toBeDefined();
      expect(highSensitivity.analysis).toBeDefined();
      
      // High sensitivity might detect more issues
      expect(highSensitivity.analysis.hallucinations.length).toBeGreaterThanOrEqual(
        lowSensitivity.analysis.hallucinations.length
      );
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should handle user authentication and session management', async () => {
      // Test user creation and authentication
      const testEmail = 'integration-test@test.example.com';
      const testPassword = 'test-password-123';
      
      // Sign up new user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          data: {
            name: 'Integration Test User'
          }
        }
      });
      
      // In test environment, user might be auto-confirmed
      expect(signUpError).toBeNull();
      expect(signUpData.user).toBeDefined();
      
      if (signUpData.user) {
        // Test sign in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: testPassword
        });
        
        expect(signInError).toBeNull();
        expect(signInData.session).toBeDefined();
        expect(signInData.user?.email).toBe(testEmail);
        
        // Test session retrieval
        const { data: sessionData } = await supabase.auth.getSession();
        expect(sessionData.session).toBeDefined();
        expect(sessionData.session?.user.email).toBe(testEmail);
        
        // Test sign out
        const { error: signOutError } = await supabase.auth.signOut();
        expect(signOutError).toBeNull();
        
        // Verify session is cleared
        const { data: clearedSession } = await supabase.auth.getSession();
        expect(clearedSession.session).toBeNull();
      }
    });

    it('should handle authentication errors properly', async () => {
      // Test invalid credentials
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'nonexistent@test.example.com',
        password: 'wrong-password'
      });
      
      expect(error).toBeDefined();
      expect(data.user).toBeNull();
      expect(data.session).toBeNull();
    });
  });

  describe('Google Drive Integration', () => {
    beforeEach(() => {
      // Mock Google Drive API responses
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('googleapis.com/drive/v3/files')) {
          if (url.includes('alt=media') || url.includes('export')) {
            // Mock file download
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve('Mock file content from Google Drive integration test')
            });
          } else {
            // Mock file listing
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [
                  {
                    id: 'mock-file-1',
                    name: 'Integration Test Document.docx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    size: '12345',
                    modifiedTime: '2024-01-15T10:30:00Z',
                    webViewLink: 'https://docs.google.com/document/d/mock-file-1/edit',
                    parents: ['root']
                  },
                  {
                    id: 'mock-file-2',
                    name: 'Test Spreadsheet.xlsx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    size: '67890',
                    modifiedTime: '2024-01-14T15:45:00Z',
                    webViewLink: 'https://docs.google.com/spreadsheets/d/mock-file-2/edit',
                    parents: ['root']
                  }
                ]
              })
            });
          }
        }
        
        return Promise.resolve({
          ok: false,
          statusText: 'Not Found'
        });
      });
    });

    it('should authenticate and list Google Drive files', async () => {
      // Mock authentication
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // Test file listing
      const files = await googleDriveService.listFiles();
      
      expect(files).toHaveLength(2);
      expect(files[0]).toMatchObject({
        id: 'mock-file-1',
        name: 'Integration Test Document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      expect(files[1]).toMatchObject({
        id: 'mock-file-2',
        name: 'Test Spreadsheet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    });

    it('should download and process Google Drive files', async () => {
      // Mock authentication
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // Test file download
      const fileContent = await googleDriveService.downloadFile('mock-file-1');
      
      expect(fileContent).toBe('Mock file content from Google Drive integration test');
      
      // Test analysis of downloaded content
      const { analysis } = await analysisService.analyzeContent(
        fileContent,
        testData.user.id,
        { enableRAG: false }
      );
      
      expect(analysis).toBeDefined();
      expect(analysis.fullContent).toBe(fileContent);
      expect(analysis.user_id).toBe(testData.user.id);
    });

    it('should handle Google Drive authentication errors', async () => {
      // Clear access token to simulate unauthenticated state
      googleDriveService['accessToken'] = null;
      
      // Should throw authentication error
      await expect(googleDriveService.listFiles()).rejects.toThrow('Google Drive not authenticated');
      await expect(googleDriveService.downloadFile('mock-file-1')).rejects.toThrow('Google Drive not authenticated');
    });

    it('should handle Google Drive API errors', async () => {
      // Mock authentication
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // Mock API error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({
          error: {
            code: 403,
            message: 'Insufficient permissions'
          }
        })
      });
      
      // Should handle API errors gracefully
      await expect(googleDriveService.listFiles()).rejects.toThrow('Failed to fetch files: Forbidden');
    });

    it('should search Google Drive files with filters', async () => {
      // Mock authentication
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // Mock search response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [
            {
              id: 'search-result-1',
              name: 'Integration Test Results.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
          ]
        })
      });
      
      // Test file search
      const searchResults = await googleDriveService.searchFiles('Integration', [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]);
      
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toContain('Integration');
    });
  });

  describe('API Client Integration', () => {
    it('should create and configure API client correctly', async () => {
      const apiKey = 'test-api-key-integration';
      const apiClient = createApiClient(apiKey, 'https://test-api.hallucifix.com');
      
      expect(apiClient).toBeDefined();
      
      // Mock successful API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'api-test-analysis-1',
          accuracy: 87.5,
          riskLevel: 'medium',
          processingTime: 1500,
          verificationSources: 6,
          hallucinations: [
            {
              text: 'test hallucination',
              type: 'unverified_claim',
              confidence: 0.8,
              explanation: 'Test explanation',
              startIndex: 0,
              endIndex: 18
            }
          ],
          metadata: {
            contentLength: 100,
            timestamp: new Date().toISOString(),
            modelVersion: '1.0.0'
          }
        })
      });
      
      // Test API call
      const response = await apiClient.analyzeContent({
        content: 'Test content for API integration',
        options: {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5
        }
      });
      
      expect(response).toMatchObject({
        id: 'api-test-analysis-1',
        accuracy: 87.5,
        riskLevel: 'medium',
        processingTime: 1500,
        verificationSources: 6,
        hallucinations: expect.any(Array),
        metadata: expect.any(Object)
      });
    });

    it('should handle API timeouts and errors', async () => {
      const apiClient = createApiClient('test-key', 'https://test-api.hallucifix.com');
      
      // Mock timeout
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );
      
      await expect(apiClient.analyzeContent({
        content: 'Test content'
      })).rejects.toThrow();
    });

    it('should validate API responses', async () => {
      const apiClient = createApiClient('test-key');
      
      // Mock invalid API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({
          code: 'INVALID_REQUEST',
          message: 'Content is required'
        })
      });
      
      await expect(apiClient.analyzeContent({
        content: ''
      })).rejects.toThrow('API Error: Content is required');
    });
  });

  describe('End-to-End Workflow Integration', () => {
    it('should complete full analysis workflow from Google Drive to database', async () => {
      // Set up test scenario
      const { user } = await testDataScenarios.googleDriveIntegration();
      
      // Mock Google Drive authentication and file operations
      googleDriveService['accessToken'] = 'mock-token';
      
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('googleapis.com/drive/v3/files') && !url.includes('alt=media')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              files: [{
                id: 'e2e-test-file',
                name: 'End-to-End Test Document.docx',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              }]
            })
          });
        } else if (url.includes('alt=media')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('This AI system guarantees 100% accuracy with zero false positives in all cases.')
          });
        }
        return Promise.resolve({ ok: false });
      });
      
      // 1. List files from Google Drive
      const files = await googleDriveService.listFiles();
      expect(files).toHaveLength(1);
      
      // 2. Download file content
      const fileContent = await googleDriveService.downloadFile('e2e-test-file');
      expect(fileContent).toContain('100% accuracy');
      
      // 3. Analyze content
      const { analysis } = await analysisService.analyzeContent(fileContent, user.id);
      expect(analysis.accuracy).toBeLessThan(90); // Should detect issues
      expect(analysis.hallucinations.length).toBeGreaterThan(0);
      
      // 4. Store in database
      const db = getTestDatabase();
      const { data: storedAnalysis, error } = await db
        .from('analysis_results')
        .insert({
          id: analysis.id,
          user_id: analysis.user_id,
          content: analysis.content,
          accuracy: analysis.accuracy,
          risk_level: analysis.riskLevel,
          hallucinations: analysis.hallucinations,
          verification_sources: analysis.verificationSources,
          processing_time: analysis.processingTime,
          created_at: analysis.timestamp,
          analysis_type: 'google_drive',
          filename: 'End-to-End Test Document.docx',
          full_content: analysis.fullContent
        })
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(storedAnalysis).toBeDefined();
      
      // 5. Verify data integrity
      const { data: retrievedAnalysis } = await db
        .from('analysis_results')
        .select('*')
        .eq('id', analysis.id)
        .single();
      
      expect(retrievedAnalysis.accuracy).toBe(analysis.accuracy);
      expect(retrievedAnalysis.filename).toBe('End-to-End Test Document.docx');
      expect(retrievedAnalysis.analysis_type).toBe('google_drive');
    });
  });
});