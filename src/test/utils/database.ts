import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User } from '../../types/user';
import { DatabaseAnalysisResult } from '../../types/analysis';
import { createTestUser, createTestDatabaseAnalysisResult, createTestScheduledScan, createTestReview } from '../factories';
import usersFixture from '../fixtures/users.json';
import analysisResultsFixture from '../fixtures/analysisResults.json';

let testSupabase: SupabaseClient | null = null;

/**
 * Initialize test database connection
 */
export async function setupTestDatabase(): Promise<SupabaseClient> {
  if (testSupabase) {
    return testSupabase;
  }

  // Use environment-specific test database URLs
  const testUrl = process.env.VITE_TEST_SUPABASE_URL || 
                  process.env.VITE_SUPABASE_URL || 
                  'https://test.supabase.co';
  const testKey = process.env.VITE_TEST_SUPABASE_ANON_KEY || 
                  process.env.VITE_SUPABASE_ANON_KEY || 
                  'test-anon-key';
  
  testSupabase = createClient(testUrl, testKey, {
    auth: {
      persistSession: false, // Don't persist sessions in tests
      autoRefreshToken: false, // Don't auto-refresh tokens in tests
    },
    db: {
      schema: 'public'
    }
  });
  
  // Verify connection
  try {
    const { error } = await testSupabase.from('users').select('id').limit(1);
    if (error && !error.message.includes('relation "users" does not exist')) {
      throw error;
    }
  } catch (connectionError) {
    console.warn('Database connection test failed:', connectionError);
  }
  
  // Run any test-specific setup
  await runTestMigrations();
  
  return testSupabase;
}

/**
 * Clean up all test data from database
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (!testSupabase) return;
  
  // Clean up test data in reverse dependency order to avoid foreign key constraints
  const tables = [
    'reviews',
    'analysis_results', 
    'scheduled_scans',
    'user_tokens',
    'oauth_states',
    'user_subscriptions',
    'usage_records',
    'users'
  ];
  
  for (const table of tables) {
    try {
      // Delete all test data (assuming test data has specific prefixes or patterns)
      const { error } = await testSupabase.from(table).delete().or(
        'id.like.test-%,id.like.analysis-%,id.like.user-%,id.like.scan-%,id.like.review-%,email.like.%@test.example.com'
      );
      
      if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
        console.warn(`Failed to clean up table ${table}:`, error);
      }
    } catch (error) {
      // Ignore table not found errors in test environment
      if (!(error as any)?.message?.includes('relation') && !(error as any)?.message?.includes('does not exist')) {
        console.warn(`Failed to clean up table ${table}:`, error);
      }
    }
  }
}

/**
 * Seed database with test data
 */
export async function seedTestData(): Promise<{
  users: User[];
  analysisResults: DatabaseAnalysisResult[];
  scheduledScans: any[];
  reviews: any[];
}> {
  if (!testSupabase) {
    throw new Error('Test database not initialized');
  }

  // Seed users from fixtures
  const users = Object.values(usersFixture) as User[];
  const { data: insertedUsers, error: usersError } = await testSupabase
    .from('users')
    .insert(users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role_id: user.role.id,
      department: user.department,
      status: user.status,
      last_active: user.lastActive,
      created_at: user.createdAt,
      permissions: user.permissions
    })))
    .select();

  if (usersError) {
    console.warn('Failed to seed users:', usersError);
  }

  // Seed analysis results from fixtures
  const analysisResults = Object.values(analysisResultsFixture).map(result => ({
    id: result.id,
    user_id: result.user_id,
    content: result.content,
    accuracy: result.accuracy,
    risk_level: result.riskLevel,
    hallucinations: result.hallucinations,
    verification_sources: result.verificationSources,
    processing_time: result.processingTime,
    created_at: result.timestamp,
    analysis_type: result.analysisType,
    batch_id: result.batchId,
    scan_id: result.scanId,
    filename: result.filename,
    full_content: result.fullContent,
    seq_logprob_analysis: result.seqLogprobAnalysis
  })) as DatabaseAnalysisResult[];

  const { data: insertedAnalysisResults, error: analysisError } = await testSupabase
    .from('analysis_results')
    .insert(analysisResults)
    .select();

  if (analysisError) {
    console.warn('Failed to seed analysis results:', analysisError);
  }

  // Seed additional test data
  const scheduledScans = Array.from({ length: 3 }, () => createTestScheduledScan({
    user_id: users[0].id
  }));

  const { data: insertedScans, error: scansError } = await testSupabase
    .from('scheduled_scans')
    .insert(scheduledScans)
    .select();

  if (scansError) {
    console.warn('Failed to seed scheduled scans:', scansError);
  }

  const reviews = Array.from({ length: 2 }, () => createTestReview({
    analysis_id: analysisResults[0].id,
    reviewer_id: users[0].id
  }));

  const { data: insertedReviews, error: reviewsError } = await testSupabase
    .from('reviews')
    .insert(reviews)
    .select();

  if (reviewsError) {
    console.warn('Failed to seed reviews:', reviewsError);
  }

  return {
    users,
    analysisResults,
    scheduledScans: insertedScans || [],
    reviews: insertedReviews || []
  };
}

/**
 * Seed minimal test data for quick tests
 */
export async function seedMinimalTestData(): Promise<{
  user: User;
  analysisResult: DatabaseAnalysisResult;
}> {
  if (!testSupabase) {
    throw new Error('Test database not initialized');
  }

  const user = createTestUser({ id: 'test-user-minimal' });
  const analysisResult = createTestDatabaseAnalysisResult({ 
    id: 'test-analysis-minimal',
    user_id: user.id 
  });

  // Insert user
  await testSupabase.from('users').insert({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role_id: user.role.id,
    department: user.department,
    status: user.status,
    last_active: user.lastActive,
    created_at: user.createdAt,
    permissions: user.permissions
  });

  // Insert analysis result
  await testSupabase.from('analysis_results').insert(analysisResult);

  return { user, analysisResult };
}

/**
 * Create test user in database
 */
export async function createTestUserInDatabase(userOverrides: Partial<User> = {}): Promise<User> {
  if (!testSupabase) {
    throw new Error('Test database not initialized');
  }

  const user = createTestUser(userOverrides);
  
  const { error } = await testSupabase.from('users').insert({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role_id: user.role.id,
    department: user.department,
    status: user.status,
    last_active: user.lastActive,
    created_at: user.createdAt,
    permissions: user.permissions
  });

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  return user;
}

/**
 * Create test analysis result in database
 */
export async function createTestAnalysisInDatabase(
  analysisOverrides: Partial<DatabaseAnalysisResult> = {}
): Promise<DatabaseAnalysisResult> {
  if (!testSupabase) {
    throw new Error('Test database not initialized');
  }

  const analysisResult = createTestDatabaseAnalysisResult(analysisOverrides);
  
  const { error } = await testSupabase
    .from('analysis_results')
    .insert(analysisResult);

  if (error) {
    throw new Error(`Failed to create test analysis: ${error.message}`);
  }

  return analysisResult;
}

/**
 * Get test database client
 */
export function getTestDatabase(): SupabaseClient {
  if (!testSupabase) {
    throw new Error('Test database not initialized. Call setupTestDatabase() first.');
  }
  return testSupabase;
}

/**
 * Run test-specific database migrations or setup
 */
async function runTestMigrations(): Promise<void> {
  if (!testSupabase) return;
  
  try {
    // Create test-specific functions if they don't exist
    await testSupabase.rpc('create_test_cleanup_function', {}, { count: 'exact' });
  } catch (error) {
    // Ignore if function already exists or RPC is not available
    console.debug('Test migration warning (can be ignored):', (error as any)?.message);
  }
  
  // Verify essential tables exist (for integration tests)
  const essentialTables = ['users', 'analysis_results'];
  for (const table of essentialTables) {
    try {
      await testSupabase.from(table).select('*').limit(0);
    } catch (error) {
      console.warn(`Table ${table} may not exist in test database:`, (error as any)?.message);
    }
  }
}

/**
 * Reset database to clean state
 */
export async function resetTestDatabase(): Promise<void> {
  await cleanupTestDatabase();
  await seedTestData();
}

/**
 * Utility to wait for database operations to complete
 */
export async function waitForDatabaseOperation(delay: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Check if database is available and responsive
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  if (!testSupabase) {
    return false;
  }

  try {
    const { error } = await testSupabase.from('users').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Transaction utilities for integration tests
 */
export async function withDatabaseTransaction<T>(
  operation: (client: SupabaseClient) => Promise<T>
): Promise<T> {
  if (!testSupabase) {
    throw new Error('Test database not initialized');
  }
  
  // Note: Supabase doesn't support explicit transactions in the client
  // This is a wrapper for future transaction support or cleanup
  try {
    const result = await operation(testSupabase);
    return result;
  } catch (error) {
    // In a real transaction, we would rollback here
    await cleanupTestDatabase();
    throw error;
  }
}

/**
 * Isolation utilities for parallel test execution
 */
export class DatabaseTestIsolation {
  private testId: string;
  
  constructor(testId?: string) {
    this.testId = testId || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Create isolated test user
   */
  async createIsolatedUser(overrides: Partial<User> = {}): Promise<User> {
    return createTestUserInDatabase({
      id: `${this.testId}-user-${Math.random().toString(36).substr(2, 9)}`,
      email: `${this.testId}@test.example.com`,
      ...overrides
    });
  }
  
  /**
   * Create isolated test analysis
   */
  async createIsolatedAnalysis(overrides: Partial<DatabaseAnalysisResult> = {}): Promise<DatabaseAnalysisResult> {
    return createTestAnalysisInDatabase({
      id: `${this.testId}-analysis-${Math.random().toString(36).substr(2, 9)}`,
      ...overrides
    });
  }
  
  /**
   * Clean up all data for this test
   */
  async cleanup(): Promise<void> {
    if (!testSupabase) return;
    
    const tables = ['reviews', 'analysis_results', 'scheduled_scans', 'users'];
    
    for (const table of tables) {
      try {
        await testSupabase.from(table).delete().like('id', `${this.testId}%`);
      } catch (error) {
        console.warn(`Failed to cleanup isolated data from ${table}:`, error);
      }
    }
  }
}

/**
 * Performance monitoring for integration tests
 */
export class DatabasePerformanceMonitor {
  private startTime: number = 0;
  private operations: Array<{ operation: string; duration: number }> = [];
  
  start(): void {
    this.startTime = Date.now();
  }
  
  recordOperation(operation: string): void {
    const duration = Date.now() - this.startTime;
    this.operations.push({ operation, duration });
    this.startTime = Date.now();
  }
  
  getReport(): { totalTime: number; operations: Array<{ operation: string; duration: number }> } {
    const totalTime = this.operations.reduce((sum, op) => sum + op.duration, 0);
    return { totalTime, operations: this.operations };
  }
  
  reset(): void {
    this.operations = [];
    this.startTime = Date.now();
  }
}

/**
 * Create test data for specific scenarios
 */
export const testDataScenarios = {
  /**
   * Create data for user permission testing
   */
  async userPermissions() {
    const adminUser = await createTestUserInDatabase(usersFixture.adminUser as User);
    const regularUser = await createTestUserInDatabase(usersFixture.regularUser as User);
    const viewerUser = await createTestUserInDatabase(usersFixture.viewerUser as User);
    
    return { adminUser, regularUser, viewerUser };
  },

  /**
   * Create data for analysis workflow testing
   */
  async analysisWorkflow() {
    const user = await createTestUserInDatabase();
    const highAccuracy = await createTestAnalysisInDatabase({
      user_id: user.id,
      accuracy: 95.5,
      risk_level: 'low'
    });
    const lowAccuracy = await createTestAnalysisInDatabase({
      user_id: user.id,
      accuracy: 45.2,
      risk_level: 'critical'
    });
    
    return { user, highAccuracy, lowAccuracy };
  },

  /**
   * Create data for batch analysis testing
   */
  async batchAnalysis() {
    const user = await createTestUserInDatabase();
    const batchId = 'test-batch-001';
    
    const batchResults = await Promise.all([
      createTestAnalysisInDatabase({
        user_id: user.id,
        batch_id: batchId,
        analysis_type: 'batch',
        filename: 'doc1.pdf'
      }),
      createTestAnalysisInDatabase({
        user_id: user.id,
        batch_id: batchId,
        analysis_type: 'batch',
        filename: 'doc2.docx'
      }),
      createTestAnalysisInDatabase({
        user_id: user.id,
        batch_id: batchId,
        analysis_type: 'batch',
        filename: 'doc3.txt'
      })
    ]);
    
    return { user, batchId, batchResults };
  }
};