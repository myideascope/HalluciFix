export interface TestAnalysis {
  id: string;
  content: string;
  accuracy_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at?: string;
  user_id: string;
  analysis_details?: {
    content_length: number;
    sources_checked: number;
    confidence_score: number;
    processing_time_ms: number;
    model_version?: string;
    language_detected?: string;
    sentiment_score?: number;
  };
  recommendations?: string[];
  hallucinations?: Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
    startIndex: number;
    endIndex: number;
  }>;
  metadata?: {
    source_type?: 'manual' | 'batch' | 'scheduled' | 'api';
    batch_id?: string;
    scan_id?: string;
    file_name?: string;
    file_type?: string;
  };
  tags?: string[];
  status?: 'completed' | 'processing' | 'failed' | 'pending';
}

// Realistic content samples for different risk levels
const CONTENT_SAMPLES = {
  low: [
    'According to the World Health Organization, regular exercise can reduce the risk of heart disease by up to 30%.',
    'The Earth orbits the Sun at an average distance of approximately 93 million miles, also known as one astronomical unit.',
    'Water boils at 100 degrees Celsius (212 degrees Fahrenheit) at sea level atmospheric pressure.',
    'The human brain contains approximately 86 billion neurons, according to recent neuroscience research.',
    'Shakespeare wrote 39 plays and 154 sonnets during his literary career in the late 16th and early 17th centuries.'
  ],
  medium: [
    'Some studies suggest that drinking green tea may help with weight loss, though results vary between individuals.',
    'Experts believe that artificial intelligence could revolutionize healthcare in the next decade.',
    'Recent reports indicate that remote work productivity has increased, but long-term effects are still being studied.',
    'Climate scientists predict significant changes in weather patterns, though exact timelines remain uncertain.',
    'New research shows promising results for gene therapy, but more clinical trials are needed.'
  ],
  high: [
    'Unverified sources claim that a new miracle cure can eliminate all diseases within days.',
    'Anonymous reports suggest that major corporations are hiding important health information from the public.',
    'Some believe that certain foods can completely prevent aging, though scientific evidence is limited.',
    'Rumors circulate about secret government programs that allegedly control weather patterns.',
    'Unconfirmed studies claim that specific supplements can increase IQ by 50 points.'
  ],
  critical: [
    'Dangerous misinformation: Drinking bleach can cure viral infections (THIS IS FALSE AND DANGEROUS).',
    'False claim: Vaccines contain microchips for government surveillance (completely fabricated).',
    'Harmful myth: Essential oils can replace all medical treatments (potentially life-threatening advice).',
    'Conspiracy theory: The Earth is flat and all space agencies are lying (scientifically disproven).',
    'Medical misinformation: Cancer can be cured by positive thinking alone (dangerous falsehood).'
  ]
};

const HALLUCINATION_TYPES = [
  'factual_error', 'statistical_inaccuracy', 'temporal_inconsistency', 
  'logical_fallacy', 'source_misattribution', 'causal_confusion',
  'numerical_error', 'geographical_error', 'historical_inaccuracy'
];

const TAGS = [
  'health', 'science', 'technology', 'politics', 'business', 'education',
  'environment', 'sports', 'entertainment', 'finance', 'research', 'news'
];

export const createTestAnalysis = (overrides?: Partial<TestAnalysis>): TestAnalysis => {
  const risk_level = overrides?.risk_level || (['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as TestAnalysis['risk_level']);
  const content = overrides?.content || getRandomContent(risk_level);
  const accuracy_score = overrides?.accuracy_score || generateAccuracyScore(risk_level);
  const now = new Date().toISOString();
  
  const baseAnalysis: TestAnalysis = {
    id: `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    content,
    accuracy_score,
    risk_level,
    created_at: now,
    updated_at: now,
    user_id: `user-${Math.random().toString(36).substr(2, 9)}`,
    analysis_details: {
      content_length: content.length,
      sources_checked: Math.floor(Math.random() * 8) + 1,
      confidence_score: accuracy_score / 100,
      processing_time_ms: Math.floor(Math.random() * 5000) + 500,
      model_version: '1.0.0',
      language_detected: 'en',
      sentiment_score: (Math.random() - 0.5) * 2 // -1 to 1
    },
    recommendations: generateRecommendations(risk_level),
    hallucinations: generateHallucinations(risk_level, content),
    metadata: {
      source_type: 'manual',
      batch_id: null,
      scan_id: null,
      file_name: null,
      file_type: null
    },
    tags: generateRandomTags(),
    status: 'completed'
  };

  return { ...baseAnalysis, ...overrides };
};

const getRandomContent = (risk_level: TestAnalysis['risk_level']): string => {
  const samples = CONTENT_SAMPLES[risk_level];
  return samples[Math.floor(Math.random() * samples.length)];
};

const generateAccuracyScore = (risk_level: TestAnalysis['risk_level']): number => {
  switch (risk_level) {
    case 'low':
      return Math.floor(Math.random() * 10) + 90; // 90-100
    case 'medium':
      return Math.floor(Math.random() * 20) + 70; // 70-89
    case 'high':
      return Math.floor(Math.random() * 20) + 40; // 40-59
    case 'critical':
      return Math.floor(Math.random() * 30); // 0-29
    default:
      return Math.floor(Math.random() * 100);
  }
};

const generateRecommendations = (risk_level: TestAnalysis['risk_level']): string[] => {
  const recommendations: Record<TestAnalysis['risk_level'], string[]> = {
    low: [
      'Content appears to be accurate and well-sourced',
      'Consider adding publication dates for time-sensitive information',
      'Verify any statistical claims with primary sources'
    ],
    medium: [
      'Verify claims with additional reliable sources',
      'Consider adding disclaimers for unverified information',
      'Cross-reference facts with authoritative sources',
      'Add source citations where possible'
    ],
    high: [
      'Review content for accuracy before publication',
      'Fact-check all claims with reliable sources',
      'Consider removing unverified statements',
      'Consult subject matter experts',
      'Add clear disclaimers about uncertainty'
    ],
    critical: [
      'Do not publish this content without major revisions',
      'Completely rewrite with verified information',
      'Consult subject matter experts immediately',
      'Remove all unsubstantiated claims',
      'Consider legal implications of false information'
    ]
  };

  const baseRecommendations = recommendations[risk_level];
  // Return 1-3 random recommendations
  const count = Math.floor(Math.random() * 3) + 1;
  return baseRecommendations.slice(0, count);
};

const generateHallucinations = (risk_level: TestAnalysis['risk_level'], content: string): TestAnalysis['hallucinations'] => {
  const hallucinationCount = risk_level === 'low' ? 0 : 
                           risk_level === 'medium' ? Math.floor(Math.random() * 2) :
                           risk_level === 'high' ? Math.floor(Math.random() * 3) + 1 :
                           Math.floor(Math.random() * 5) + 2;
  
  if (hallucinationCount === 0) return [];
  
  const hallucinations: TestAnalysis['hallucinations'] = [];
  
  for (let i = 0; i < hallucinationCount; i++) {
    const startIndex = Math.floor(Math.random() * Math.max(1, content.length - 20));
    const endIndex = Math.min(startIndex + Math.floor(Math.random() * 30) + 10, content.length);
    const text = content.substring(startIndex, endIndex);
    const type = HALLUCINATION_TYPES[Math.floor(Math.random() * HALLUCINATION_TYPES.length)];
    
    hallucinations.push({
      text,
      type,
      confidence: Math.random() * 0.4 + 0.6, // 0.6 to 1.0
      explanation: `Potential ${type.replace('_', ' ')} detected in this segment`,
      startIndex,
      endIndex
    });
  }
  
  return hallucinations;
};

const generateRandomTags = (): string[] => {
  const count = Math.floor(Math.random() * 4) + 1; // 1-4 tags
  const shuffled = [...TAGS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Specialized factory functions
export const createLowRiskAnalysis = (overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({ 
    risk_level: 'low',
    accuracy_score: 90 + Math.floor(Math.random() * 10),
    ...overrides 
  });
};

export const createMediumRiskAnalysis = (overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({ 
    risk_level: 'medium',
    accuracy_score: 70 + Math.floor(Math.random() * 20),
    ...overrides 
  });
};

export const createHighRiskAnalysis = (overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({ 
    risk_level: 'high',
    accuracy_score: 40 + Math.floor(Math.random() * 20),
    ...overrides 
  });
};

export const createCriticalRiskAnalysis = (overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({ 
    risk_level: 'critical',
    accuracy_score: Math.floor(Math.random() * 30),
    ...overrides 
  });
};

export const createBatchAnalysis = (batchId: string, overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({
    metadata: {
      source_type: 'batch',
      batch_id: batchId,
      ...overrides.metadata
    },
    ...overrides
  });
};

export const createScheduledAnalysis = (scanId: string, overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({
    metadata: {
      source_type: 'scheduled',
      scan_id: scanId,
      ...overrides.metadata
    },
    ...overrides
  });
};

export const createFileAnalysis = (fileName: string, fileType: string, overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({
    metadata: {
      source_type: 'manual',
      file_name: fileName,
      file_type: fileType,
      ...overrides.metadata
    },
    ...overrides
  });
};

export const createProcessingAnalysis = (overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({
    status: 'processing',
    accuracy_score: 0,
    recommendations: [],
    hallucinations: [],
    ...overrides
  });
};

export const createFailedAnalysis = (overrides?: Partial<TestAnalysis>): TestAnalysis => {
  return createTestAnalysis({
    status: 'failed',
    accuracy_score: 0,
    recommendations: ['Analysis failed - please try again'],
    hallucinations: [],
    ...overrides
  });
};

// Factory for creating multiple analyses with different characteristics
export const createTestAnalyses = (count: number, overrides?: Partial<TestAnalysis>): TestAnalysis[] => {
  return Array.from({ length: count }, () => createTestAnalysis(overrides));
};

export const createMixedRiskAnalyses = (count: number): TestAnalysis[] => {
  const analyses: TestAnalysis[] = [];
  const riskLevels: TestAnalysis['risk_level'][] = ['low', 'medium', 'high', 'critical'];
  
  for (let i = 0; i < count; i++) {
    const riskLevel = riskLevels[i % riskLevels.length];
    analyses.push(createTestAnalysis({ risk_level: riskLevel }));
  }
  
  return analyses;
};

export const createAnalysesForUser = (userId: string, count: number): TestAnalysis[] => {
  return Array.from({ length: count }, () => createTestAnalysis({ user_id: userId }));
};

export const createAnalysesFromDaysAgo = (days: number, count: number): TestAnalysis[] => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  
  return Array.from({ length: count }, () => createTestAnalysis({ 
    created_at: date.toISOString(),
    updated_at: date.toISOString()
  }));
};