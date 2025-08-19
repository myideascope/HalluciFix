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
  }>;
  verificationSources: number;
  processingTime: number;
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
  }>;
  verification_sources: number;
  processing_time: number;
  created_at: string;
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
});