export interface TestAnalysis {
  id: string;
  content: string;
  accuracy_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  user_id: string;
  analysis_details?: {
    content_length: number;
    sources_checked: number;
    confidence_score: number;
    processing_time_ms: number;
  };
  recommendations?: string[];
}

export const createTestAnalysis = (overrides: Partial<TestAnalysis> = {}): TestAnalysis => {
  const content = overrides.content || 'This is test content for analysis purposes.';
  const accuracy_score = overrides.accuracy_score || Math.floor(Math.random() * 100);
  
  // Determine risk level based on accuracy score if not provided
  let risk_level: TestAnalysis['risk_level'] = 'medium';
  if (accuracy_score >= 90) risk_level = 'low';
  else if (accuracy_score >= 70) risk_level = 'medium';
  else if (accuracy_score >= 50) risk_level = 'high';
  else risk_level = 'critical';

  const baseAnalysis: TestAnalysis = {
    id: `analysis-${Math.random().toString(36).substr(2, 9)}`,
    content,
    accuracy_score,
    risk_level: overrides.risk_level || risk_level,
    created_at: new Date().toISOString(),
    user_id: `user-${Math.random().toString(36).substr(2, 9)}`,
    analysis_details: {
      content_length: content.length,
      sources_checked: Math.floor(Math.random() * 5) + 1,
      confidence_score: accuracy_score / 100,
      processing_time_ms: Math.floor(Math.random() * 3000) + 500
    },
    recommendations: generateRecommendations(risk_level)
  };

  return { ...baseAnalysis, ...overrides };
};

const generateRecommendations = (risk_level: TestAnalysis['risk_level']): string[] => {
  const recommendations: Record<TestAnalysis['risk_level'], string[]> = {
    low: ['Content appears to be accurate and well-sourced'],
    medium: [
      'Verify claims with additional sources',
      'Consider adding disclaimers for unverified information'
    ],
    high: [
      'Review content for accuracy before publication',
      'Fact-check all claims with reliable sources',
      'Consider removing unverified statements'
    ],
    critical: [
      'Do not publish this content',
      'Completely rewrite with verified information',
      'Consult subject matter experts'
    ]
  };

  return recommendations[risk_level];
};

export const createLowRiskAnalysis = (overrides: Partial<TestAnalysis> = {}): TestAnalysis => {
  return createTestAnalysis({ 
    accuracy_score: 90 + Math.floor(Math.random() * 10), 
    risk_level: 'low',
    ...overrides 
  });
};

export const createHighRiskAnalysis = (overrides: Partial<TestAnalysis> = {}): TestAnalysis => {
  return createTestAnalysis({ 
    accuracy_score: 20 + Math.floor(Math.random() * 30), 
    risk_level: 'high',
    ...overrides 
  });
};

export const createCriticalRiskAnalysis = (overrides: Partial<TestAnalysis> = {}): TestAnalysis => {
  return createTestAnalysis({ 
    accuracy_score: Math.floor(Math.random() * 20), 
    risk_level: 'critical',
    ...overrides 
  });
};

// Factory for creating multiple analyses
export const createTestAnalyses = (count: number, overrides: Partial<TestAnalysis> = {}): TestAnalysis[] => {
  return Array.from({ length: count }, () => createTestAnalysis(overrides));
};