import { faker } from '@faker-js/faker';
import { User, UserRole, Permission, DEFAULT_ROLES } from '../../types/user';
import { AnalysisResult, DatabaseAnalysisResult } from '../../types/analysis';

// =============================================================================
// USER FACTORIES
// =============================================================================

// User factory
export const createTestUser = (overrides: Partial<User> = {}): User => {
  const role = overrides.role || DEFAULT_ROLES[faker.number.int({ min: 0, max: DEFAULT_ROLES.length - 1 })];
  
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    avatar: faker.helpers.maybe(() => faker.image.avatar(), { probability: 0.3 }),
    role,
    department: faker.helpers.arrayElement([
      'Engineering', 'Marketing', 'Sales', 'Support', 'Research', 'Operations', 'Content'
    ]),
    status: faker.helpers.arrayElement(['active', 'inactive', 'pending']),
    lastActive: faker.date.recent({ days: 30 }).toISOString(),
    createdAt: faker.date.past({ years: 2 }).toISOString(),
    permissions: role.permissions,
    ...overrides
  };
};

export const createTestUsers = (count: number, overrides: Partial<User> = {}): User[] => {
  return Array.from({ length: count }, () => createTestUser(overrides));
};

// Specific user role factories
export const createAdminUser = (overrides: Partial<User> = {}): User => 
  createTestUser({
    role: DEFAULT_ROLES[0], // Admin
    permissions: DEFAULT_ROLES[0].permissions,
    status: 'active',
    ...overrides
  });

export const createManagerUser = (overrides: Partial<User> = {}): User => 
  createTestUser({
    role: DEFAULT_ROLES[1], // Manager
    permissions: DEFAULT_ROLES[1].permissions,
    status: 'active',
    ...overrides
  });

export const createEditorUser = (overrides: Partial<User> = {}): User => 
  createTestUser({
    role: DEFAULT_ROLES[2], // Editor
    permissions: DEFAULT_ROLES[2].permissions,
    status: 'active',
    ...overrides
  });

export const createViewerUser = (overrides: Partial<User> = {}): User => 
  createTestUser({
    role: DEFAULT_ROLES[3], // Viewer
    permissions: DEFAULT_ROLES[3].permissions,
    status: 'active',
    ...overrides
  });

// Permission factory
export const createTestPermission = (overrides: Partial<Permission> = {}): Permission => ({
  id: faker.string.uuid(),
  name: faker.helpers.arrayElement([
    'Analysis Management', 'Batch Processing', 'User Management', 'Settings Access'
  ]),
  description: faker.lorem.sentence(),
  resource: faker.helpers.arrayElement(['analysis', 'batch', 'users', 'settings', 'analytics']),
  actions: faker.helpers.arrayElements(['create', 'read', 'update', 'delete', 'execute'], { min: 1, max: 3 }),
  ...overrides
});

// User role factory
export const createTestUserRole = (overrides: Partial<UserRole> = {}): UserRole => ({
  id: faker.string.uuid(),
  name: faker.helpers.arrayElement(['Custom Admin', 'Team Lead', 'Specialist', 'Intern']),
  description: faker.lorem.sentence(),
  level: faker.number.int({ min: 1, max: 5 }),
  permissions: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => createTestPermission()),
  ...overrides
});

// =============================================================================
// ANALYSIS FACTORIES
// =============================================================================

// Hallucination factory
export const createTestHallucination = (overrides: Partial<AnalysisResult['hallucinations'][0]> = {}) => ({
  text: faker.helpers.arrayElement([
    'exactly 99.7% accuracy',
    'zero false positives',
    'unprecedented results',
    'revolutionary breakthrough',
    'perfect 100% success rate',
    'according to recent studies',
    '1000 times faster'
  ]),
  type: faker.helpers.arrayElement([
    'False Precision',
    'Impossible Metric',
    'Unverifiable Claim',
    'Exaggerated Language',
    'Performance Exaggeration',
    'Unrealistic Accuracy',
    'Unverifiable Attribution',
    'Absolute Claim'
  ]),
  confidence: faker.number.float({ min: 0.5, max: 1, fractionDigits: 2 }),
  explanation: faker.lorem.sentence(),
  startIndex: faker.number.int({ min: 0, max: 100 }),
  endIndex: faker.number.int({ min: 101, max: 200 }),
  ...overrides
});

// Seq-logprob analysis factory
export const createTestSeqLogprobAnalysis = (overrides: Partial<AnalysisResult['seqLogprobAnalysis']> = {}) => ({
  seqLogprob: faker.number.float({ min: -10, max: -1, fractionDigits: 3 }),
  normalizedSeqLogprob: faker.number.float({ min: -5, max: -0.5, fractionDigits: 3 }),
  confidenceScore: faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
  hallucinationRisk: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical'] as const),
  isHallucinationSuspected: faker.datatype.boolean(),
  lowConfidenceTokens: faker.number.int({ min: 0, max: 20 }),
  suspiciousSequences: faker.number.int({ min: 0, max: 5 }),
  processingTime: faker.number.int({ min: 100, max: 2000 }),
  ...overrides
});

// Analysis result factory
export const createTestAnalysisResult = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => {
  const accuracy = faker.number.float({ min: 0, max: 100, fractionDigits: 1 });
  const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';
  const hallucinationCount = riskLevel === 'low' ? faker.number.int({ min: 0, max: 1 }) :
                            riskLevel === 'medium' ? faker.number.int({ min: 1, max: 3 }) :
                            riskLevel === 'high' ? faker.number.int({ min: 2, max: 5 }) :
                            faker.number.int({ min: 3, max: 8 });
  
  return {
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    content: faker.lorem.paragraphs(2).substring(0, 200) + '...',
    timestamp: faker.date.past().toISOString(),
    accuracy,
    riskLevel: riskLevel as 'low' | 'medium' | 'high' | 'critical',
    hallucinations: Array.from({ length: hallucinationCount }, () => createTestHallucination()),
    verificationSources: faker.number.int({ min: 1, max: 20 }),
    processingTime: faker.number.int({ min: 500, max: 5000 }),
    analysisType: faker.helpers.arrayElement(['single', 'batch', 'scheduled']),
    batchId: faker.helpers.maybe(() => faker.string.uuid(), { probability: 0.3 }),
    scanId: faker.helpers.maybe(() => faker.string.uuid(), { probability: 0.2 }),
    filename: faker.helpers.maybe(() => faker.system.fileName(), { probability: 0.4 }),
    fullContent: faker.lorem.paragraphs(5),
    seqLogprobAnalysis: faker.helpers.maybe(() => createTestSeqLogprobAnalysis(), { probability: 0.7 }),
    ...overrides
  };
};

export const createTestAnalysisResults = (count: number, overrides: Partial<AnalysisResult> = {}): AnalysisResult[] => {
  return Array.from({ length: count }, () => createTestAnalysisResult(overrides));
};

// Database analysis result factory
export const createTestDatabaseAnalysisResult = (overrides: Partial<DatabaseAnalysisResult> = {}): DatabaseAnalysisResult => {
  const accuracy = faker.number.float({ min: 0, max: 100, fractionDigits: 1 });
  const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';
  
  return {
    id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    content: faker.lorem.paragraphs(2).substring(0, 200) + '...',
    accuracy,
    risk_level: riskLevel as 'low' | 'medium' | 'high' | 'critical',
    hallucinations: Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, () => createTestHallucination()),
    verification_sources: faker.number.int({ min: 1, max: 20 }),
    processing_time: faker.number.int({ min: 500, max: 5000 }),
    created_at: faker.date.past().toISOString(),
    analysis_type: faker.helpers.arrayElement(['single', 'batch', 'scheduled']),
    batch_id: faker.helpers.maybe(() => faker.string.uuid(), { probability: 0.3 }),
    scan_id: faker.helpers.maybe(() => faker.string.uuid(), { probability: 0.2 }),
    filename: faker.helpers.maybe(() => faker.system.fileName(), { probability: 0.4 }),
    full_content: faker.lorem.paragraphs(5),
    seq_logprob_analysis: faker.helpers.maybe(() => createTestSeqLogprobAnalysis(), { probability: 0.7 }),
    ...overrides
  };
};

// =============================================================================
// SCHEDULED SCAN FACTORIES
// =============================================================================

export interface TestScheduledScan {
  id: string;
  user_id: string;
  name: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  source_type: 'google_drive' | 'url' | 'upload';
  source_config: Record<string, any>;
  is_active: boolean;
  last_run: string | null;
  next_run: string;
  created_at: string;
  updated_at: string;
}

export const createTestScheduledScan = (overrides: Partial<TestScheduledScan> = {}): TestScheduledScan => ({
  id: faker.string.uuid(),
  user_id: faker.string.uuid(),
  name: faker.company.buzzPhrase(),
  description: faker.lorem.sentence(),
  frequency: faker.helpers.arrayElement(['daily', 'weekly', 'monthly']),
  source_type: faker.helpers.arrayElement(['google_drive', 'url', 'upload']),
  source_config: {
    folder_id: faker.string.uuid(),
    file_types: faker.helpers.arrayElements(['pdf', 'docx', 'txt', 'csv', 'md'], { min: 1, max: 3 }),
    max_files: faker.number.int({ min: 10, max: 100 })
  },
  is_active: faker.datatype.boolean(),
  last_run: faker.helpers.maybe(() => faker.date.past().toISOString(), { probability: 0.7 }),
  next_run: faker.date.future().toISOString(),
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides
});

export const createTestScheduledScans = (count: number, overrides: Partial<TestScheduledScan> = {}): TestScheduledScan[] => {
  return Array.from({ length: count }, () => createTestScheduledScan(overrides));
};

// =============================================================================
// REVIEW FACTORIES
// =============================================================================

export interface TestReview {
  id: string;
  analysis_id: string;
  reviewer_id: string;
  status: 'pending' | 'approved' | 'rejected';
  comments: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const createTestReview = (overrides: Partial<TestReview> = {}): TestReview => ({
  id: faker.string.uuid(),
  analysis_id: faker.string.uuid(),
  reviewer_id: faker.string.uuid(),
  status: faker.helpers.arrayElement(['pending', 'approved', 'rejected']),
  comments: faker.lorem.paragraph(),
  reviewed_at: faker.helpers.maybe(() => faker.date.past().toISOString(), { probability: 0.6 }),
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides
});

export const createTestReviews = (count: number, overrides: Partial<TestReview> = {}): TestReview[] => {
  return Array.from({ length: count }, () => createTestReview(overrides));
};

// =============================================================================
// GOOGLE DRIVE FACTORIES
// =============================================================================

export interface TestGoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  parents?: string[];
}

export const createTestGoogleDriveFile = (overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => ({
  id: faker.string.uuid(),
  name: faker.system.fileName(),
  mimeType: faker.helpers.arrayElement([
    'text/plain',
    'application/pdf',
    'application/vnd.google-apps.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv'
  ]),
  size: faker.number.int({ min: 1000, max: 1000000 }).toString(),
  modifiedTime: faker.date.past().toISOString(),
  webViewLink: faker.internet.url(),
  parents: ['root'],
  ...overrides
});

export const createTestGoogleDriveFiles = (count: number, overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile[] => {
  return Array.from({ length: count }, () => createTestGoogleDriveFile(overrides));
};

// =============================================================================
// CONTENT FACTORIES
// =============================================================================

// Generate realistic content with potential hallucinations
export const createTestContent = (type: 'clean' | 'suspicious' | 'problematic' = 'suspicious'): string => {
  const baseContent = faker.lorem.paragraphs(3);
  
  if (type === 'clean') {
    return baseContent;
  }
  
  const suspiciousPhrases = [
    'exactly 99.7% accuracy',
    'zero false positives',
    'unprecedented breakthrough',
    'revolutionary 1000x improvement',
    'perfect 100% success rate',
    'according to recent studies',
    'all users report satisfaction',
    'completely eliminates all errors'
  ];
  
  const phrasesToAdd = type === 'problematic' ? 
    faker.helpers.arrayElements(suspiciousPhrases, { min: 3, max: 5 }) :
    faker.helpers.arrayElements(suspiciousPhrases, { min: 1, max: 2 });
  
  return baseContent + ' ' + phrasesToAdd.join('. ') + '.';
};

// =============================================================================
// BATCH ANALYSIS FACTORIES
// =============================================================================

export interface TestBatchDocument {
  id: string;
  content: string;
  filename?: string;
}

export const createTestBatchDocument = (overrides: Partial<TestBatchDocument> = {}): TestBatchDocument => ({
  id: faker.string.uuid(),
  content: createTestContent(),
  filename: faker.helpers.maybe(() => faker.system.fileName(), { probability: 0.8 }),
  ...overrides
});

export const createTestBatchDocuments = (count: number, overrides: Partial<TestBatchDocument> = {}): TestBatchDocument[] => {
  return Array.from({ length: count }, () => createTestBatchDocument(overrides));
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Create a complete test scenario with related data
export const createTestScenario = (userId?: string) => {
  const user = createTestUser(userId ? { id: userId } : {});
  const analysisResults = createTestAnalysisResults(5, { user_id: user.id });
  const scheduledScans = createTestScheduledScans(2, { user_id: user.id });
  const reviews = createTestReviews(3, { 
    reviewer_id: user.id,
    analysis_id: analysisResults[0].id 
  });
  
  return {
    user,
    analysisResults,
    scheduledScans,
    reviews
  };
};

// Create test data for specific risk levels
export const createHighRiskAnalysis = (overrides: Partial<AnalysisResult> = {}): AnalysisResult =>
  createTestAnalysisResult({
    accuracy: faker.number.float({ min: 0, max: 50, fractionDigits: 1 }),
    riskLevel: 'critical',
    hallucinations: Array.from({ length: faker.number.int({ min: 5, max: 10 }) }, () => createTestHallucination()),
    ...overrides
  });

export const createLowRiskAnalysis = (overrides: Partial<AnalysisResult> = {}): AnalysisResult =>
  createTestAnalysisResult({
    accuracy: faker.number.float({ min: 90, max: 100, fractionDigits: 1 }),
    riskLevel: 'low',
    hallucinations: [],
    ...overrides
  });