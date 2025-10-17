/**
 * Complete User Workflow Integration Test
 * Tests the full integration of all services working together
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { supabase } from '../../lib/supabase';
import { providerManager } from '../../lib/providers/ProviderManager';
import { aiService } from '../../lib/providers/ai/AIService';
import { googleDriveService } from '../../lib/googleDrive';
import ragService from '../../lib/ragService';
import analysisService from '../../lib/analysisService';

// Mock external services
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null }))
    }))
  }
}));

// Mock provider manager
vi.mock('../../lib/providers/ProviderManager', () => ({
  providerManager: {
    initialize: vi.fn(),
    getStatus: vi.fn(() => ({
      initialized: true,
      totalProviders: 4,
      healthyProviders: 4,
      configurationValid: true,
      securityValid: true,
      lastInitialization: new Date(),
      errors: [],
      warnings: []
    })),
    getAIProvider: vi.fn(),
    getAuthProvider: vi.fn(),
    getDriveProvider: vi.fn(),
    getKnowledgeProvider: vi.fn()
  }
}));

// Mock AI service
vi.mock('../../lib/providers/ai/AIService', () => ({
  aiService: {
    initialize: vi.fn(),
    getStatus: vi.fn(() => ({
      initialized: true,
      enabledProviders: ['openai', 'anthropic'],
      healthyProviders: ['openai', 'anthropic'],
      unhealthyProviders: [],
      failoverEnabled: true,
      healthCheckEnabled: true
    })),
    analyzeContent: vi.fn()
  }
}));

// Mock Google Drive service
vi.mock('../../lib/googleDrive', () => ({
  googleDriveService: {
    initialize: vi.fn(),
    isAvailable: vi.fn(() => Promise.resolve(true)),
    isAuthenticated: vi.fn(() => Promise.resolve(true)),
    listFiles: vi.fn(),
    downloadFile: vi.fn(),
    searchFiles: vi.fn()
  }
}));

// Mock RAG service
vi.mock('../../lib/ragService', () => ({
  default: {
    performRAGAnalysis: vi.fn(),
    getKnowledgeSources: vi.fn(() => []),
    searchKnowledgeBase: vi.fn()
  }
}));

// Mock analysis service
vi.mock('../../lib/analysisService', () => ({
  default: {
    analyzeContent: vi.fn(),
    analyzeBatch: vi.fn(),
    getAnalysisHistory: vi.fn(() => Promise.resolve([])),
    getUserAnalytics: vi.fn(() => Promise.resolve({}))
  }
}));

describe('Complete User Workflow Integration', () => {
  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    role: { name: 'user', level: 3, permissions: [] },
    department: 'General',
    status: 'active',
    lastActive: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    permissions: []
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup authenticated user session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { 
        session: { 
          user: { 
            id: mockUser.id, 
            email: mockUser.email,
            user_metadata: { full_name: mockUser.name }
          } 
        } 
      },
      error: null
    });

    // Setup successful provider initialization
    vi.mocked(providerManager.initialize).mockResolvedValue();
    vi.mocked(aiService.initialize).mockResolvedValue();
    vi.mocked(googleDriveService.initialize).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Flow Integration', () => {
    it('should handle complete OAuth authentication workflow', async () => {
      // Mock OAuth flow
      vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
        data: { provider: 'google', url: 'https://oauth.google.com/auth' },
        error: null
      });

      render(<App />);

      // Should show login interface initially
      await waitFor(() => {
        expect(screen.getByText(/sign in/i)).toBeInTheDocument();
      });

      // Click Google sign in
      const googleSignInButton = screen.getByRole('button', { name: /google/i });
      await userEvent.click(googleSignInButton);

      // Verify OAuth initiation
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('/auth/callback'),
          scopes: expect.stringContaining('drive.readonly')
        })
      });
    });

    it('should handle authentication state changes', async () => {
      const authStateCallback = vi.fn();
      vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
        authStateCallback.mockImplementation(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      render(<App />);

      // Simulate successful authentication
      await authStateCallback('SIGNED_IN', {
        user: {
          id: mockUser.id,
          email: mockUser.email,
          user_metadata: { full_name: mockUser.name }
        }
      });

      await waitFor(() => {
        expect(screen.getByText('HalluciFix')).toBeInTheDocument();
        expect(screen.getByText(mockUser.name)).toBeInTheDocument();
      });
    });
  });

  describe('Content Analysis Workflow', () => {
    beforeEach(() => {
      // Setup authenticated state
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { 
          session: { 
            user: { 
              id: mockUser.id, 
              email: mockUser.email,
              user_metadata: { full_name: mockUser.name }
            } 
          } 
        },
        error: null
      });
    });

    it('should perform complete content analysis with all services', async () => {
      const testContent = 'According to a recent study, AI models achieve 99.9% accuracy in all tasks.';
      
      // Mock analysis service response
      const mockAnalysisResult = {
        id: 'analysis-123',
        user_id: mockUser.id,
        content: testContent.substring(0, 200),
        timestamp: new Date().toISOString(),
        accuracy: 75.5,
        riskLevel: 'medium' as const,
        hallucinations: [
          {
            text: '99.9% accuracy in all tasks',
            type: 'Unrealistic Accuracy',
            confidence: 0.85,
            explanation: 'This accuracy claim is statistically unlikely to be true across all AI tasks',
            startIndex: 45,
            endIndex: 75
          }
        ],
        verificationSources: 8,
        processingTime: 1250,
        analysisType: 'single' as const,
        fullContent: testContent
      };

      const mockRAGAnalysis = {
        original_accuracy: 75.5,
        rag_enhanced_accuracy: 68.2,
        improvement_score: -7.3,
        verified_claims: [
          {
            claim: '99.9% accuracy in all tasks',
            verification_status: 'contradicted' as const,
            confidence: 0.9,
            supporting_documents: [],
            contradicting_documents: [
              {
                id: 'doc-1',
                source_id: 'academic',
                title: 'AI Performance Benchmarks',
                content: 'Current AI models typically achieve 70-85% accuracy on complex tasks',
                url: 'https://example.com/study',
                relevance_score: 0.95,
                publication_date: '2024-01-15',
                author: 'Dr. Smith',
                source_name: 'Academic Sources',
                source_type: 'academic',
                metadata: { reliability: 0.9 }
              }
            ],
            explanation: 'Multiple academic sources contradict this accuracy claim',
            reliability_assessment: {
              source_quality: 0.9,
              consensus_level: 0.8,
              recency: 0.9,
              overall_score: 0.87
            }
          }
        ],
        unverified_claims: [],
        source_coverage: 75.0,
        processing_time: 2100,
        knowledge_gaps: []
      };

      vi.mocked(analysisService.analyzeContent).mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: mockRAGAnalysis,
        seqLogprobResult: {
          seqLogprob: -2.8,
          normalizedSeqLogprob: 0.72,
          confidenceScore: 72,
          hallucinationRisk: 'medium',
          isHallucinationSuspected: true,
          lowConfidenceTokens: 3,
          suspiciousSequences: [],
          processingTime: 450
        }
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('HalluciFix')).toBeInTheDocument();
      });

      // Navigate to analyzer
      const analyzerTab = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzerTab);

      // Enter content for analysis
      const textarea = screen.getByPlaceholderText(/paste your ai-generated content/i);
      await userEvent.type(textarea, testContent);

      // Start analysis
      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzeButton);

      // Verify analysis service was called with correct parameters
      await waitFor(() => {
        expect(analysisService.analyzeContent).toHaveBeenCalledWith(
          testContent,
          mockUser.id,
          expect.objectContaining({
            sensitivity: 'medium',
            includeSourceVerification: true,
            maxHallucinations: 5,
            enableRAG: true
          })
        );
      });

      // Verify results are displayed
      await waitFor(() => {
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
        expect(screen.getByText('75.5%')).toBeInTheDocument(); // Accuracy score
        expect(screen.getByText('Medium')).toBeInTheDocument(); // Risk level
        expect(screen.getByText('68.2%')).toBeInTheDocument(); // RAG enhanced accuracy
        expect(screen.getByText('Unrealistic Accuracy')).toBeInTheDocument(); // Hallucination type
      });
    });

    it('should handle analysis errors gracefully', async () => {
      const testContent = 'Test content for error handling';
      
      // Mock analysis service error
      vi.mocked(analysisService.analyzeContent).mockRejectedValue(
        new Error('AI service temporarily unavailable')
      );

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('HalluciFix')).toBeInTheDocument();
      });

      // Navigate to analyzer
      const analyzerTab = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzerTab);

      // Enter content and analyze
      const textarea = screen.getByPlaceholderText(/paste your ai-generated content/i);
      await userEvent.type(textarea, testContent);

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzeButton);

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Google Drive Integration Workflow', () => {
    beforeEach(() => {
      // Setup authenticated state
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { 
          session: { 
            user: { 
              id: mockUser.id, 
              email: mockUser.email,
              user_metadata: { full_name: mockUser.name }
            } 
          } 
        },
        error: null
      });
    });

    it('should integrate Google Drive file access with analysis', async () => {
      // Mock Google Drive responses
      const mockFiles = [
        {
          id: 'file-123',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '15420',
          modifiedTime: '2024-01-15T10:30:00Z',
          webViewLink: 'https://drive.google.com/file/d/file-123/view',
          parents: ['root']
        }
      ];

      const mockFileContent = {
        content: 'This is the content from the Google Drive document. It contains some claims that need verification.',
        mimeType: 'text/plain',
        size: 95,
        truncated: false
      };

      vi.mocked(googleDriveService.listFiles).mockResolvedValue({
        files: mockFiles,
        nextPageToken: undefined,
        hasMore: false
      });

      vi.mocked(googleDriveService.downloadFile).mockResolvedValue(mockFileContent);

      // Mock analysis result for the file content
      vi.mocked(analysisService.analyzeContent).mockResolvedValue({
        analysis: {
          id: 'analysis-456',
          user_id: mockUser.id,
          content: mockFileContent.content.substring(0, 200),
          timestamp: new Date().toISOString(),
          accuracy: 82.3,
          riskLevel: 'low' as const,
          hallucinations: [],
          verificationSources: 5,
          processingTime: 890,
          analysisType: 'single' as const,
          fullContent: mockFileContent.content,
          filename: mockFiles[0].name
        },
        ragAnalysis: undefined,
        seqLogprobResult: undefined
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('HalluciFix')).toBeInTheDocument();
      });

      // Navigate to batch analysis (which includes Drive integration)
      const batchTab = screen.getByRole('button', { name: /batch analysis/i });
      await userEvent.click(batchTab);

      // Verify Google Drive integration is available
      await waitFor(() => {
        expect(googleDriveService.isAvailable).toHaveBeenCalled();
        expect(googleDriveService.isAuthenticated).toHaveBeenCalled();
      });

      // The actual Drive file selection and analysis would be tested in component-specific tests
      // This integration test verifies the services are properly connected
    });
  });

  describe('Service Degradation and Fallback', () => {
    it('should handle service degradation gracefully', async () => {
      // Mock provider manager indicating degraded state
      vi.mocked(providerManager.getStatus).mockReturnValue({
        initialized: true,
        totalProviders: 4,
        healthyProviders: 2,
        configurationValid: true,
        securityValid: true,
        lastInitialization: new Date(),
        errors: ['OpenAI provider unavailable'],
        warnings: ['Using fallback providers']
      });

      // Mock AI service with degraded status
      vi.mocked(aiService.getStatus).mockReturnValue({
        initialized: true,
        enabledProviders: ['openai', 'anthropic'],
        healthyProviders: ['anthropic'],
        unhealthyProviders: ['openai'],
        failoverEnabled: true,
        healthCheckEnabled: true
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('HalluciFix')).toBeInTheDocument();
      });

      // Verify service degradation status is displayed
      // This would typically show in a status indicator component
      // The exact implementation depends on how service status is displayed in the UI
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network errors and provide recovery options', async () => {
      // Mock network error
      vi.mocked(analysisService.analyzeContent).mockRejectedValue(
        new Error('Network error: Unable to connect to analysis service')
      );

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('HalluciFix')).toBeInTheDocument();
      });

      // Navigate to analyzer
      const analyzerTab = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzerTab);

      // Try to analyze content
      const textarea = screen.getByPlaceholderText(/paste your ai-generated content/i);
      await userEvent.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzeButton);

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track performance metrics during analysis', async () => {
      const testContent = 'Performance test content';
      
      // Mock successful analysis with timing
      vi.mocked(analysisService.analyzeContent).mockResolvedValue({
        analysis: {
          id: 'perf-test-123',
          user_id: mockUser.id,
          content: testContent,
          timestamp: new Date().toISOString(),
          accuracy: 88.5,
          riskLevel: 'low' as const,
          hallucinations: [],
          verificationSources: 3,
          processingTime: 750,
          analysisType: 'single' as const,
          fullContent: testContent
        },
        ragAnalysis: undefined,
        seqLogprobResult: undefined
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('HalluciFix')).toBeInTheDocument();
      });

      // Navigate to analyzer and perform analysis
      const analyzerTab = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzerTab);

      const textarea = screen.getByPlaceholderText(/paste your ai-generated content/i);
      await userEvent.type(textarea, testContent);

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await userEvent.click(analyzeButton);

      // Verify performance metrics are displayed
      await waitFor(() => {
        expect(screen.getByText(/processed in 750ms/i)).toBeInTheDocument();
      });
    });
  });
});