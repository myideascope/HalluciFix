import { AnalysisResult } from '../types/analysis';
import { createApiClient, AnalysisRequest, AnalysisResponse } from './api';
import ragService, { RAGEnhancedAnalysis } from './ragService';

// Get API key from environment variables
const HALLUCIFIX_API_KEY = import.meta.env.VITE_HALLUCIFIX_API_KEY;

class AnalysisService {
  private apiClient;

  constructor() {
    if (HALLUCIFIX_API_KEY) {
      this.apiClient = createApiClient(HALLUCIFIX_API_KEY);
    } else {
      console.warn("VITE_HALLUCIFIX_API_KEY is not set. Using mock analysis.");
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
  ): Promise<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis }> {
    // Perform standard analysis
    const analysis = await this.performStandardAnalysis(content, userId, options);
    
    // Perform RAG analysis if enabled
    let ragAnalysis: RAGEnhancedAnalysis | undefined;
    if (options?.enableRAG !== false) { // Default to enabled
      try {
        ragAnalysis = await ragService.performRAGAnalysis(content, userId);
        
        // Update analysis accuracy based on RAG results
        analysis.accuracy = ragAnalysis.rag_enhanced_accuracy;
        
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
        
      } catch (error) {
        console.error('RAG analysis failed, continuing with standard analysis:', error);
      }
    }
    
    return { analysis, ragAnalysis };
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
    if (this.apiClient) {
      try {
        const request: AnalysisRequest = {
          content,
          options: {
            sensitivity: options?.sensitivity || 'medium',
            includeSourceVerification: options?.includeSourceVerification ?? true,
            maxHallucinations: options?.maxHallucinations ?? 5
          }
        };
        
        const apiResponse: AnalysisResponse = await this.apiClient.analyzeContent(request);

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
        console.error("Error from HalluciFix API, falling back to mock analysis:", error);
        return this.mockAnalyzeContent(content, userId);
      }
    } else {
      return this.mockAnalyzeContent(content, userId);
    }
  }

  private mockAnalyzeContent(content: string, userId: string): AnalysisResult {
    // Simulate realistic analysis based on content patterns
    const suspiciousPatterns = [
      /exactly \d+\.\d+%/gi,
      /perfect 100%/gi,
      /zero complaints/gi,
      /unprecedented/gi,
      /revolutionary leap/gi,
      /\d+,\d{3} times faster/gi,
      /99\.\d+% accuracy/gi
    ];

    let accuracy = 85 + Math.random() * 10; // Base accuracy 85-95%
    const hallucinations = [];

    // Check for suspicious patterns and reduce accuracy
    suspiciousPatterns.forEach((pattern, index) => {
      const matches = content.match(pattern);
      if (matches) {
        accuracy -= matches.length * (5 + Math.random() * 10);
        matches.forEach(match => {
          const startIndex = content.indexOf(match);
          hallucinations.push({
            text: match,
            type: this.getHallucinationType(index),
            confidence: 0.7 + Math.random() * 0.25,
            explanation: this.getHallucinationExplanation(match, index),
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

  private getHallucinationType(patternIndex: number): string {
    const types = [
      'False Precision',
      'Unverifiable Claim',
      'Impossible Metric',
      'Exaggerated Language',
      'Technological Impossibility',
      'Performance Exaggeration',
      'Unrealistic Accuracy'
    ];
    return types[patternIndex] || 'Suspicious Pattern';
  }

  private getHallucinationExplanation(match: string, patternIndex: number): string {
    const explanations = [
      `Suspiciously specific statistic "${match}" without verifiable source`,
      `Claim of "${match}" appears to be unverifiable or exaggerated`,
      `The metric "${match}" seems unrealistic or impossible`,
      `Language like "${match}" suggests potential exaggeration`,
      `Technical claim "${match}" appears to exceed current capabilities`,
      `Performance metric "${match}" seems unrealistically high`,
      `Accuracy claim "${match}" is likely unattainable in practice`
    ];
    return explanations[patternIndex] || `Potentially problematic claim: "${match}"`;
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
  ): Promise<Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis }>> {
    const results: AnalysisResult[] = [];
    const enhancedResults: Array<{ analysis: AnalysisResult; ragAnalysis?: RAGEnhancedAnalysis }> = [];
    
    for (const doc of documents) {
      try {
        const { analysis, ragAnalysis } = await this.analyzeContent(doc.content, userId, options);
        analysis.analysisType = 'batch';
        analysis.filename = doc.filename;
        enhancedResults.push({ analysis, ragAnalysis });
      } catch (error) {
        console.error(`Error analyzing document ${doc.id}:`, error);
        // Continue with other documents even if one fails
      }
    }
    
    return enhancedResults;
  }
}

const analysisService = new AnalysisService();
export default analysisService;