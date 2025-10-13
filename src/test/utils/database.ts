import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User } from '../../types/user';
import { DatabaseAnalysisResult } from '../../types/analysis';
import { createTestUser, createTestDatabaseAnalysisResult, createTestScheduledScan, createTestReview } from '../factories';
import usersFixture from '../fixtures/users.json';
import analysisResultsFixture from '../fixtures/analysisResults.json';

let testSupabase: SupabaseClient | null = null;
let testDatabaseUrl: string | null = null;
let testDatabaseKey: string | null = null;

// Test database configuration
const TEST_DB_CONFIG = {
  // Use a separate test database or schema
  testSchemaPrefix: 'test_',
  // Isolation settings
  isolationLevel: 'READ_COMMITTED',
  // Cleanup settings
  autoCleanup: true,
  cleanupTimeout: 30000, // 30 seconds
  // Connection settings
  maxConnections: 10,
  connectionTimeout: 5000
};

/**
 * Initialize test database connection with proper isolation
 */
export async function setupTestDatabase(): Promise<SupabaseClient> {
  if (testSupabase) {
    return testSupabase;
  }

<<<<<<< HEAD
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
=======
  // Use test-specific database configuration
  testDatabaseUrl = process.env.VITE_TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://test.supabase.co';
  testDatabaseKey = process.env.VITE_TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
  
  // Create test database client with specific configuration
  testSupabase = createClient(testDatabaseUrl, testDatabaseKey, {
    db: {
      schema: 'public'
    },
    auth: {
      persistSession: false, // Don't persist sessions in tests
      autoRefreshToken: false, // Don't auto-refresh tokens in tests
      detectSessionInUrl: false // Don't detect sessions from URL in tests
    },
    global: {
      headers: {
        'x-test-mode': 'true', // Mark requests as test mode
        'x-test-isolation': `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }
    }
  });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  
  // Verify database connection
  await verifyDatabaseConnection();
  
  // Run test-specific setup
  await runTestMigrations();
  
  // Set up test isolation
  await setupTestIsolation();
  
  return testSupabase;
}

/**
 * Verify database connection is working
 */
async function verifyDatabaseConnection(): Promise<void> {
  if (!testSupabase) {
    throw new Error('Test database client not initialized');
  }

  try {
    // Simple query to verify connection
    const { error } = await testSupabase.from('analysis_results').select('id').limit(1);
    if (error && !error.message.includes('relation "analysis_results" does not exist')) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  } catch (error) {
    throw new Error(`Failed to verify database connection: ${error}`);
  }
}

/**
 * Set up test isolation to prevent interference between tests
 */
async function setupTestIsolation(): Promise<void> {
  if (!testSupabase) return;

  try {
    // Create test-specific functions for isolation
    await testSupabase.rpc('create_test_isolation_functions');
  } catch (error) {
    // Functions might not exist yet, that's okay
    console.debug('Test isolation functions not available:', error);
  }
}

/**
 * Clean up all test data from database with proper isolation
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (!testSupabase) return;
  
  try {
    // Use transaction for atomic cleanup
    await testSupabase.rpc('begin_test_cleanup');
    
    // Clean up test data in reverse dependency order to avoid foreign key constraints
    const tables = [
      'reviews',
      'analysis_results', 
      'scheduled_scans',
      'user_tokens',
      'oauth_states',
      'user_subscriptions',
      'usage_records'
    ];
    
    for (const table of tables) {
      try {
        // Delete test data using multiple patterns to ensure comprehensive cleanup
        const patterns = [
          'test-%',
          'analysis-%',
          'user-%',
          'scan-%',
          'review-%',
          'integration-test-%',
          'temp-test-%'
        ];
        
        for (const pattern of patterns) {
          await testSupabase.from(table).delete().like('id', pattern);
        }
        
        // Also clean up by test email patterns for users table
        if (table === 'users') {
          await testSupabase.from(table).delete().or(
            'email.like.%@test.example.com,email.like.test%@example.com,email.like.%+test@%'
          );
        }
      } catch (error) {
        console.warn(`Failed to clean up table ${table}:`, error);
      }
    }
    
    // Clean up auth.users table (if we have access)
    try {
      await testSupabase.auth.admin.deleteUser('test-user-id');
    } catch (error) {
      // Expected to fail in most test environments
      console.debug('Could not clean up auth users:', error);
    }
    
    await testSupabase.rpc('commit_test_cleanup');
  } catch (error) {
    console.warn('Test cleanup failed:', error);
    try {
      await testSupabase.rpc('rollback_test_cleanup');
    } catch (rollbackError) {
      console.warn('Cleanup rollback failed:', rollbackError);
    }
  }
}

/**
 * Force cleanup all test data (more aggressive cleanup for CI/CD)
 */
export async function forceCleanupTestDatabase(): Promise<void> {
  if (!testSupabase) return;
  
  const tables = [
    'reviews',
    'analysis_results', 
    'scheduled_scans',
    'user_tokens',
    'oauth_states',
    'user_subscriptions',
    'usage_records'
  ];
  
  // More aggressive cleanup - delete all data created in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  for (const table of tables) {
    try {
<<<<<<< HEAD
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
=======
      await testSupabase.from(table).delete().gte('created_at', oneHourAgo);
    } catch (error) {
      console.warn(`Force cleanup failed for table ${table}:`, error);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    }
  }
}

/**
 * Seed database with comprehensive test data
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

  try {
    // Start transaction for atomic seeding
    await testSupabase.rpc('begin_test_seeding');

    // Clean up any existing test data first
    await cleanupTestDatabase();

    // Seed users from fixtures with test-specific IDs
    const users = Object.values(usersFixture).map((user: any) => ({
      ...user,
      id: `test-${user.id}`, // Prefix with 'test-' for easy cleanup
      email: user.email.includes('@test.example.com') ? user.email : `test-${user.email}`
    })) as User[];

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
      throw new Error(`Failed to seed users: ${usersError.message}`);
    }

    // Seed analysis results from fixtures with test-specific IDs
    const analysisResults = Object.values(analysisResultsFixture).map((result: any) => ({
      id: `test-analysis-${result.id}`,
      user_id: `test-${result.user_id}`,
      content: result.content,
      accuracy: result.accuracy,
      risk_level: result.riskLevel,
      hallucinations: result.hallucinations,
      verification_sources: result.verificationSources,
      processing_time: result.processingTime,
      created_at: result.timestamp,
      analysis_type: result.analysisType,
      batch_id: result.batchId ? `test-batch-${result.batchId}` : null,
      scan_id: result.scanId ? `test-scan-${result.scanId}` : null,
      filename: result.filename,
      full_content: result.fullContent,
      seq_logprob_analysis: result.seqLogprobAnalysis
    })) as DatabaseAnalysisResult[];

    const { data: insertedAnalysisResults, error: analysisError } = await testSupabase
      .from('analysis_results')
      .insert(analysisResults)
      .select();

    if (analysisError) {
      throw new Error(`Failed to seed analysis results: ${analysisError.message}`);
    }

    // Seed scheduled scans with test-specific data
    const scheduledScans = Array.from({ length: 3 }, (_, index) => createTestScheduledScan({
      id: `test-scan-${index + 1}`,
      user_id: users[0].id,
      name: `Test Scan ${index + 1}`,
      description: `Integration test scheduled scan ${index + 1}`
    }));

    const { data: insertedScans, error: scansError } = await testSupabase
      .from('scheduled_scans')
      .insert(scheduledScans)
      .select();

    if (scansError) {
      throw new Error(`Failed to seed scheduled scans: ${scansError.message}`);
    }

    // Seed reviews with test-specific data
    const reviews = Array.from({ length: 2 }, (_, index) => createTestReview({
      id: `test-review-${index + 1}`,
      analysis_id: analysisResults[index].id,
      reviewer_id: users[0].id
    }));

    const { data: insertedReviews, error: reviewsError } = await testSupabase
      .from('reviews')
      .insert(reviews)
      .select();

    if (reviewsError) {
      throw new Error(`Failed to seed reviews: ${reviewsError.message}`);
    }

    await testSupabase.rpc('commit_test_seeding');

    return {
      users,
      analysisResults,
      scheduledScans: insertedScans || [],
      reviews: insertedReviews || []
    };
  } catch (error) {
    await testSupabase.rpc('rollback_test_seeding');
    throw new Error(`Test data seeding failed: ${error}`);
  }
}

/**
 * Seed database with realistic test scenarios
 */
export async function seedRealisticTestData(): Promise<{
  users: User[];
  analysisResults: DatabaseAnalysisResult[];
  scheduledScans: any[];
  reviews: any[];
}> {
  if (!testSupabase) {
    throw new Error('Test database not initialized');
  }

  // Create realistic test users with different roles
  const users = [
    createTestUser({
      id: 'test-admin-user',
      email: 'admin@test.example.com',
      name: 'Test Admin User',
      role: { id: 'admin', name: 'Administrator' },
      status: 'active'
    }),
    createTestUser({
      id: 'test-regular-user',
      email: 'user@test.example.com',
      name: 'Test Regular User',
      role: { id: 'user', name: 'User' },
      status: 'active'
    }),
    createTestUser({
      id: 'test-viewer-user',
      email: 'viewer@test.example.com',
      name: 'Test Viewer User',
      role: { id: 'viewer', name: 'Viewer' },
      status: 'active'
    })
  ];

  // Insert users
  await testSupabase.from('users').insert(users.map(user => ({
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
  })));

  // Create realistic analysis results with various scenarios
  const analysisResults = [
    // High accuracy, low risk
    createTestDatabaseAnalysisResult({
      id: 'test-analysis-high-accuracy',
      user_id: users[0].id,
      content: 'This is a factual statement about established scientific principles.',
      accuracy: 95.5,
      risk_level: 'low',
      hallucinations: [],
      verification_sources: 8
    }),
    // Medium accuracy, medium risk
    createTestDatabaseAnalysisResult({
      id: 'test-analysis-medium-accuracy',
      user_id: users[1].id,
      content: 'Some claims that are partially verifiable with mixed evidence.',
      accuracy: 78.2,
      risk_level: 'medium',
      hallucinations: [
        { type: 'unverified_claim', confidence: 0.6, text: 'partially verifiable claim' }
      ],
      verification_sources: 4
    }),
    // Low accuracy, high risk
    createTestDatabaseAnalysisResult({
      id: 'test-analysis-low-accuracy',
      user_id: users[1].id,
      content: 'This AI achieves 99.9% accuracy with zero false positives guaranteed.',
      accuracy: 45.8,
      risk_level: 'critical',
      hallucinations: [
        { type: 'exaggerated_claim', confidence: 0.9, text: '99.9% accuracy' },
        { type: 'absolute_statement', confidence: 0.8, text: 'zero false positives guaranteed' }
      ],
      verification_sources: 2
    })
  ];

  await testSupabase.from('analysis_results').insert(analysisResults);

  // Create scheduled scans
  const scheduledScans = [
    createTestScheduledScan({
      id: 'test-scan-daily',
      user_id: users[0].id,
      name: 'Daily Content Review',
      frequency: 'daily',
      enabled: true
    }),
    createTestScheduledScan({
      id: 'test-scan-weekly',
      user_id: users[1].id,
      name: 'Weekly Report Scan',
      frequency: 'weekly',
      enabled: false
    })
  ];

  const { data: insertedScans } = await testSupabase
    .from('scheduled_scans')
    .insert(scheduledScans)
    .select();

  // Create reviews
  const reviews = [
    createTestReview({
      id: 'test-review-approved',
      analysis_id: analysisResults[0].id,
      reviewer_id: users[0].id,
      status: 'approved'
    }),
    createTestReview({
      id: 'test-review-rejected',
      analysis_id: analysisResults[2].id,
      reviewer_id: users[0].id,
      status: 'rejected'
    })
  ];

  const { data: insertedReviews } = await testSupabase
    .from('reviews')
    .insert(reviews)
    .select();

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
<<<<<<< HEAD
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
=======
    // Create test-specific functions for better test isolation and cleanup
    await testSupabase.rpc('create_test_functions');
  } catch (error) {
    // Functions might already exist or we might not have permissions
    console.debug('Test functions setup skipped:', error);
  }
  
  try {
    // Create test-specific indexes for better performance
    await createTestIndexes();
  } catch (error) {
    console.debug('Test indexes setup skipped:', error);
  }
  
  try {
    // Set up test-specific constraints
    await setupTestConstraints();
  } catch (error) {
    console.debug('Test constraints setup skipped:', error);
  }
}

/**
 * Create test-specific database indexes for better performance
 */
async function createTestIndexes(): Promise<void> {
  if (!testSupabase) return;
  
  const testIndexes = [
    // Index for test data cleanup
    `CREATE INDEX IF NOT EXISTS idx_test_analysis_results_cleanup 
     ON analysis_results(id) WHERE id LIKE 'test-%'`,
    
    // Index for test user queries
    `CREATE INDEX IF NOT EXISTS idx_test_users_email 
     ON auth.users(email) WHERE email LIKE '%@test.example.com'`,
     
    // Index for test scheduled scans
    `CREATE INDEX IF NOT EXISTS idx_test_scheduled_scans_cleanup 
     ON scheduled_scans(id) WHERE id LIKE 'test-%'`
  ];
  
  for (const indexSql of testIndexes) {
    try {
      await testSupabase.rpc('execute_sql', { sql: indexSql });
    } catch (error) {
      console.debug('Failed to create test index:', error);
    }
  }
}

/**
 * Set up test-specific database constraints
 */
async function setupTestConstraints(): Promise<void> {
  if (!testSupabase) return;
  
  // Add test-specific constraints to ensure data integrity in tests
  const constraints = [
    // Ensure test users have valid email formats
    `ALTER TABLE auth.users ADD CONSTRAINT IF NOT EXISTS test_email_format 
     CHECK (email !~ '^test.*@test\\.example\\.com$' OR email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')`,
  ];
  
  for (const constraintSql of constraints) {
    try {
      await testSupabase.rpc('execute_sql', { sql: constraintSql });
    } catch (error) {
      console.debug('Failed to create test constraint:', error);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
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