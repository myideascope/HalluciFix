export interface AnalysisResult {
  id: string;
  user_id: string;
  content: string;
  timestamp: string;
  accuracy: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hallucinations: Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
    startIndex?: number;
    endIndex?: number;
  }>;
  verificationSources: number;
  processingTime: number;
  analysisType: 'single' | 'batch' | 'scheduled';
  batchId?: string;
  scanId?: string;
  filename?: string;
  fullContent?: string; // Store full content for detailed view
  ragAnalysis?: any; // Store RAG analysis results
  seqLogprobAnalysis?: {
    seqLogprob: number;
    normalizedSeqLogprob: number;
    confidenceScore: number;
    hallucinationRisk: 'low' | 'medium' | 'high' | 'critical';
    isHallucinationSuspected: boolean;
    lowConfidenceTokens: number;
    suspiciousSequences: number;
    processingTime: number;
  };
  // AI Provider metadata for real provider analysis
  aiProviderMetadata?: {
    provider: string;
    modelVersion: string;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
    contentLength: number;
  };
  // Cache and fallback indicators
  fromCache?: boolean;
  fallbackUsed?: string[];
}

export interface BatchProgress {
  batchId: string;
  totalDocuments: number;
  processedDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  currentBatch: number;
  totalBatches: number;
  startTime: number;
  estimatedTimeRemaining: number;
  currentStatus: 'processing' | 'completed' | 'failed';
  errors: Array<{
    documentId: string;
    error: string;
    timestamp: number;
  }>;
}

export interface DatabaseAnalysisResult {
  id: string;
  user_id: string;
  content: string;
  accuracy: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  hallucinations: Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
    startIndex?: number;
    endIndex?: number;
  }>;
  verification_sources: number;
  processing_time: number;
  created_at: string;
  analysis_type: 'single' | 'batch' | 'scheduled';
  batch_id?: string;
  scan_id?: string;
  filename?: string;
  full_content?: string;
  seq_logprob_analysis?: {
    seqLogprob: number;
    normalizedSeqLogprob: number;
    confidenceScore: number;
    hallucinationRisk: 'low' | 'medium' | 'high' | 'critical';
    isHallucinationSuspected: boolean;
    lowConfidenceTokens: number;
    suspiciousSequences: number;
    processingTime: number;
  };
  ai_provider_metadata?: {
    provider: string;
    modelVersion: string;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
    contentLength: number;
  };
}

// Helper function to convert database result to app format
export const convertDatabaseResult = (dbResult: DatabaseAnalysisResult): AnalysisResult => ({
  id: dbResult.id,
  user_id: dbResult.user_id,
  content: dbResult.content,
  timestamp: dbResult.created_at,
  accuracy: dbResult.accuracy,
  riskLevel: dbResult.risk_level,
  hallucinations: dbResult.hallucinations,
  verificationSources: dbResult.verification_sources,
  processingTime: dbResult.processing_time,
  analysisType: dbResult.analysis_type,
  batchId: dbResult.batch_id,
  scanId: dbResult.scan_id,
  filename: dbResult.filename,
  fullContent: dbResult.full_content,
  seqLogprobAnalysis: dbResult.seq_logprob_analysis,
  aiProviderMetadata: dbResult.ai_provider_metadata,
});

// Helper function to convert app result to database format
export const convertToDatabase = (result: AnalysisResult): Omit<DatabaseAnalysisResult, 'id' | 'created_at'> => ({
  user_id: result.user_id,
  content: result.content,
  accuracy: result.accuracy,
  risk_level: result.riskLevel,
  hallucinations: result.hallucinations,
  verification_sources: result.verificationSources,
  processing_time: result.processingTime,
  analysis_type: result.analysisType,
  batch_id: result.batchId,
  scan_id: result.scanId,
  filename: result.filename,
  full_content: result.fullContent,
  seq_logprob_analysis: result.seqLogprobAnalysis,
  ai_provider_metadata: result.aiProviderMetadata,
});