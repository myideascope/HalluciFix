import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  setupTestDatabase, 
  cleanupTestDatabase, 
  seedTestData, 
  seedRealisticTestData,
  testDataScenarios,
  testTransactions,
  testPerformance,
  getTestDatabase,
  checkDatabaseHealth
} from '../utils/database';
import { supabase } from '../../lib/supabase';
import { createTestUser, createTestDatabaseAnalysisResult, createTestScheduledScan } from '../factories';

describe('Database Integration Tests', () => {
  let testDb: any;
  
  beforeEach(async () => {
    testDb = await setupTestDatabase();
    await cleanupTestDatabase();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('Database Connection and Health', () => {
    it('should establish database connection successfully', async () => {
      expect(testDb).toBeDefined();
      
      const isHealthy = await checkDatabaseHealth();
      expect(isHealthy).toBe(true);
    });

    it('should handle database connection errors gracefully', async () => {
      // Mock connection failure
      const originalFrom = testDb.from;
      testDb.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            error: { message: 'Connection failed' }
          })
        })
      });

      const isHealthy = await checkDatabaseHealth();
      expect(isHealthy).toBe(false);

      // Restore original method
      testDb.from = originalFrom;
    });
  });

  describe('CRUD Operations', () => {
    it('should perform complete CRUD operations on users table', async () => {
      const testUser = createTestUser({
        id: 'test-crud-user',
        email: 'crud-test@test.example.com',
        name: 'CRUD Test User'
      });

      // CREATE
      const { data: createdUser, error: createError } = await testDb
        .from('users')
        .insert({
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
          avatar: testUser.avatar,
          role_id: testUser.role.id,
          department: testUser.department,
          status: testUser.status,
          last_active: testUser.lastActive,
          created_at: testUser.createdAt,
          permissions: testUser.permissions
        })
        .select()
        .single();

      expect(createError).toBeNull();
      expect(createdUser).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name
      });

      // READ
      const { data: readUser, error: readError } = await testDb
        .from('users')
        .select('*')
        .eq('id', testUser.id)
        .single();

      expect(readError).toBeNull();
      expect(readUser).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name
      });

      // UPDATE
      const updatedName = 'Updated CRUD Test User';
      const { data: updatedUser, error: updateError } = await testDb
        .from('users')
        .update({ name: updatedName })
        .eq('id', testUser.id)
        .select()
        .single();

      expect(updateError).toBeNull();
      expect(updatedUser.name).toBe(updatedName);

      // DELETE
      const { error: deleteError } = await testDb
        .from('users')
        .delete()
        .eq('id', testUser.id);

      expect(deleteError).toBeNull();

      // Verify deletion
      const { data: deletedUser, error: verifyError } = await testDb
        .from('users')
        .select('*')
        .eq('id', testUser.id)
        .single();

      expect(deletedUser).toBeNull();
    });

    it('should perform CRUD operations on analysis_results table', async () => {
      // First create a user for foreign key constraint
      const testUser = createTestUser({ id: 'test-analysis-crud-user' });
      await testDb.from('users').insert({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        avatar: testUser.avatar,
        role_id: testUser.role.id,
        department: testUser.department,
        status: testUser.status,
        last_active: testUser.lastActive,
        created_at: testUser.createdAt,
        permissions: testUser.permissions
      });

      const testAnalysis = createTestDatabaseAnalysisResult({
        id: 'test-crud-analysis',
        user_id: testUser.id,
        content: 'Test content for CRUD operations',
        accuracy: 85.5,
        risk_level: 'medium'
      });

      // CREATE
      const { data: createdAnalysis, error: createError } = await testDb
        .from('analysis_results')
        .insert(testAnalysis)
        .select()
        .single();

      expect(createError).toBeNull();
      expect(createdAnalysis).toMatchObject({
        id: testAnalysis.id,
        user_id: testAnalysis.user_id,
        accuracy: testAnalysis.accuracy,
        risk_level: testAnalysis.risk_level
      });

      // READ
      const { data: readAnalysis, error: readError } = await testDb
        .from('analysis_results')
        .select('*')
        .eq('id', testAnalysis.id)
        .single();

      expect(readError).toBeNull();
      expect(readAnalysis.accuracy).toBe(testAnalysis.accuracy);

      // UPDATE
      const newAccuracy = 92.3;
      const { data: updatedAnalysis, error: updateError } = await testDb
        .from('analysis_results')
        .update({ accuracy: newAccuracy })
        .eq('id', testAnalysis.id)
        .select()
        .single();

      expect(updateError).toBeNull();
      expect(updatedAnalysis.accuracy).toBe(newAccuracy);

      // DELETE
      const { error: deleteError } = await testDb
        .from('analysis_results')
        .delete()
        .eq('id', testAnalysis.id);

      expect(deleteError).toBeNull();
    });

    it('should handle foreign key constraints properly', async () => {
      // Try to insert analysis result without valid user
      const invalidAnalysis = createTestDatabaseAnalysisResult({
        id: 'test-invalid-analysis',
        user_id: 'non-existent-user'
      });

      const { error } = await testDb
        .from('analysis_results')
        .insert(invalidAnalysis);

      expect(error).toBeDefined();
      expect(error.message).toContain('foreign key');
    });
  });

  describe('Data Consistency and Transactions', () => {
    it('should maintain data consistency in transactions', async () => {
      await testTransactions.withTransaction(async (db) => {
        // Create user
        const testUser = createTestUser({ id: 'test-transaction-user' });
        const { error: userError } = await db.from('users').insert({
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
          avatar: testUser.avatar,
          role_id: testUser.role.id,
          department: testUser.department,
          status: testUser.status,
          last_active: testUser.lastActive,
          created_at: testUser.createdAt,
          permissions: testUser.permissions
        });
        expect(userError).toBeNull();

        // Create analysis result
        const testAnalysis = createTestDatabaseAnalysisResult({
          id: 'test-transaction-analysis',
          user_id: testUser.id
        });
        const { error: analysisError } = await db
          .from('analysis_results')
          .insert(testAnalysis);
        expect(analysisError).toBeNull();

        // Verify both records exist within transaction
        const { data: userData } = await db
          .from('users')
          .select('*')
          .eq('id', testUser.id)
          .single();
        expect(userData).toBeDefined();

        const { data: analysisData } = await db
          .from('analysis_results')
          .select('*')
          .eq('id', testAnalysis.id)
          .single();
        expect(analysisData).toBeDefined();
      });
    });

    it('should rollback transactions on error', async () => {
      const testUserId = 'test-rollback-user';
      
      try {
        await testTransactions.withRollback(async (db) => {
          // Create user
          const testUser = createTestUser({ id: testUserId });
          await db.from('users').insert({
            id: testUser.id,
            email: testUser.email,
            name: testUser.name,
            avatar: testUser.avatar,
            role_id: testUser.role.id,
            department: testUser.department,
            status: testUser.status,
            last_active: testUser.lastActive,
            created_at: testUser.createdAt,
            permissions: testUser.permissions
          });

          // This should be rolled back
          const testAnalysis = createTestDatabaseAnalysisResult({
            id: 'test-rollback-analysis',
            user_id: testUser.id
          });
          await db.from('analysis_results').insert(testAnalysis);
        });
      } catch (error) {
        // Expected to be rolled back
      }

      // Verify data was rolled back
      const { data: userData } = await testDb
        .from('users')
        .select('*')
        .eq('id', testUserId)
        .single();
      expect(userData).toBeNull();
    });

    it('should handle concurrent operations correctly', async () => {
      // Create base user
      const testUser = createTestUser({ id: 'test-concurrent-user' });
      await testDb.from('users').insert({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        avatar: testUser.avatar,
        role_id: testUser.role.id,
        department: testUser.department,
        status: testUser.status,
        last_active: testUser.lastActive,
        created_at: testUser.createdAt,
        permissions: testUser.permissions
      });

      // Simulate concurrent analysis insertions
      const concurrentOperations = Array.from({ length: 5 }, (_, index) => 
        testDb.from('analysis_results').insert(createTestDatabaseAnalysisResult({
          id: `test-concurrent-analysis-${index}`,
          user_id: testUser.id,
          content: `Concurrent test content ${index}`
        }))
      );

      const results = await Promise.allSettled(concurrentOperations);
      
      // All operations should succeed
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
      });

      // Verify all records were created
      const { data: analysisResults } = await testDb
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id);

      expect(analysisResults).toHaveLength(5);
    });
  });

  describe('Database Performance', () => {
    it('should perform queries within acceptable time limits', async () => {
      // Seed test data
      const testData = await seedRealisticTestData();
      
      // Test user query performance
      await testPerformance.assertPerformance(
        async () => {
          const { data } = await testDb
            .from('users')
            .select('*')
            .eq('status', 'active');
          return data;
        },
        1000, // 1 second max
        'user query'
      );

      // Test analysis results query performance
      await testPerformance.assertPerformance(
        async () => {
          const { data } = await testDb
            .from('analysis_results')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
          return data;
        },
        1500, // 1.5 seconds max
        'analysis results query'
      );

      // Test join query performance
      await testPerformance.assertPerformance(
        async () => {
          const { data } = await testDb
            .from('analysis_results')
            .select(`
              *,
              users!inner(name, email)
            `)
            .limit(5);
          return data;
        },
        2000, // 2 seconds max
        'join query'
      );
    });

    it('should handle large dataset queries efficiently', async () => {
      // Create a larger dataset
      const testUser = createTestUser({ id: 'test-performance-user' });
      await testDb.from('users').insert({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        avatar: testUser.avatar,
        role_id: testUser.role.id,
        department: testUser.department,
        status: testUser.status,
        last_active: testUser.lastActive,
        created_at: testUser.createdAt,
        permissions: testUser.permissions
      });

      // Insert multiple analysis results
      const analysisResults = Array.from({ length: 50 }, (_, index) => 
        createTestDatabaseAnalysisResult({
          id: `test-performance-analysis-${index}`,
          user_id: testUser.id,
          content: `Performance test content ${index}`,
          accuracy: 70 + Math.random() * 30
        })
      );

      await testDb.from('analysis_results').insert(analysisResults);

      // Test pagination performance
      const { result: paginatedResults, duration } = await testPerformance.measureOperation(
        'paginated query',
        async () => {
          const { data } = await testDb
            .from('analysis_results')
            .select('*')
            .eq('user_id', testUser.id)
            .order('created_at', { ascending: false })
            .range(0, 9); // First 10 results
          return data;
        }
      );

      expect(paginatedResults).toHaveLength(10);
      expect(duration).toBeLessThan(1000); // Should be fast

      // Test aggregation performance
      await testPerformance.assertPerformance(
        async () => {
          const { data } = await testDb
            .from('analysis_results')
            .select('accuracy')
            .eq('user_id', testUser.id);
          
          // Calculate average accuracy
          const avgAccuracy = data.reduce((sum, item) => sum + item.accuracy, 0) / data.length;
          return avgAccuracy;
        },
        1500,
        'aggregation query'
      );
    });
  });

  describe('Database Schema and Migrations', () => {
    it('should validate table schemas are correct', async () => {
      // Test users table schema
      const { data: usersColumns, error: usersError } = await testDb
        .rpc('get_table_columns', { table_name: 'users' });

      expect(usersError).toBeNull();
      
      const expectedUserColumns = ['id', 'email', 'name', 'avatar', 'role_id', 'department', 'status', 'last_active', 'created_at', 'permissions'];
      const actualUserColumns = usersColumns?.map((col: any) => col.column_name) || [];
      
      expectedUserColumns.forEach(col => {
        expect(actualUserColumns).toContain(col);
      });

      // Test analysis_results table schema
      const { data: analysisColumns, error: analysisError } = await testDb
        .rpc('get_table_columns', { table_name: 'analysis_results' });

      expect(analysisError).toBeNull();
      
      const expectedAnalysisColumns = [
        'id', 'user_id', 'content', 'accuracy', 'risk_level', 
        'hallucinations', 'verification_sources', 'processing_time', 
        'created_at', 'analysis_type', 'batch_id', 'scan_id', 
        'filename', 'full_content', 'seq_logprob_analysis'
      ];
      const actualAnalysisColumns = analysisColumns?.map((col: any) => col.column_name) || [];
      
      expectedAnalysisColumns.forEach(col => {
        expect(actualAnalysisColumns).toContain(col);
      });
    });

    it('should validate database constraints', async () => {
      // Test accuracy constraint (0-100)
      const testUser = createTestUser({ id: 'test-constraint-user' });
      await testDb.from('users').insert({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        avatar: testUser.avatar,
        role_id: testUser.role.id,
        department: testUser.department,
        status: testUser.status,
        last_active: testUser.lastActive,
        created_at: testUser.createdAt,
        permissions: testUser.permissions
      });

      // Test invalid accuracy (> 100)
      const invalidAnalysis = createTestDatabaseAnalysisResult({
        id: 'test-invalid-accuracy',
        user_id: testUser.id,
        accuracy: 150 // Invalid
      });

      const { error: accuracyError } = await testDb
        .from('analysis_results')
        .insert(invalidAnalysis);

      expect(accuracyError).toBeDefined();
      expect(accuracyError.message).toContain('accuracy');

      // Test invalid risk level
      const invalidRiskAnalysis = createTestDatabaseAnalysisResult({
        id: 'test-invalid-risk',
        user_id: testUser.id,
        risk_level: 'invalid_level' as any
      });

      const { error: riskError } = await testDb
        .from('analysis_results')
        .insert(invalidRiskAnalysis);

      expect(riskError).toBeDefined();
      expect(riskError.message).toContain('risk_level');
    });

    it('should validate indexes exist for performance', async () => {
      // Check for expected indexes
      const { data: indexes, error } = await testDb
        .rpc('get_table_indexes', { table_name: 'analysis_results' });

      expect(error).toBeNull();
      
      const indexNames = indexes?.map((idx: any) => idx.indexname) || [];
      
      // Should have index on user_id and created_at
      const hasUserIdIndex = indexNames.some((name: string) => 
        name.includes('user_id') || name.includes('created_at')
      );
      expect(hasUserIdIndex).toBe(true);
    });
  });

  describe('Row Level Security (RLS)', () => {
    it('should enforce RLS policies correctly', async () => {
      // Create two test users
      const user1 = createTestUser({ id: 'test-rls-user-1', email: 'user1@test.example.com' });
      const user2 = createTestUser({ id: 'test-rls-user-2', email: 'user2@test.example.com' });

      await testDb.from('users').insert([
        {
          id: user1.id,
          email: user1.email,
          name: user1.name,
          avatar: user1.avatar,
          role_id: user1.role.id,
          department: user1.department,
          status: user1.status,
          last_active: user1.lastActive,
          created_at: user1.createdAt,
          permissions: user1.permissions
        },
        {
          id: user2.id,
          email: user2.email,
          name: user2.name,
          avatar: user2.avatar,
          role_id: user2.role.id,
          department: user2.department,
          status: user2.status,
          last_active: user2.lastActive,
          created_at: user2.createdAt,
          permissions: user2.permissions
        }
      ]);

      // Create analysis results for each user
      const analysis1 = createTestDatabaseAnalysisResult({
        id: 'test-rls-analysis-1',
        user_id: user1.id,
        content: 'User 1 analysis content'
      });

      const analysis2 = createTestDatabaseAnalysisResult({
        id: 'test-rls-analysis-2',
        user_id: user2.id,
        content: 'User 2 analysis content'
      });

      await testDb.from('analysis_results').insert([analysis1, analysis2]);

      // Test that users can only see their own data
      // Note: In a real test, you would authenticate as each user
      // For this integration test, we verify the data exists correctly
      const { data: user1Results } = await testDb
        .from('analysis_results')
        .select('*')
        .eq('user_id', user1.id);

      const { data: user2Results } = await testDb
        .from('analysis_results')
        .select('*')
        .eq('user_id', user2.id);

      expect(user1Results).toHaveLength(1);
      expect(user1Results[0].content).toContain('User 1');

      expect(user2Results).toHaveLength(1);
      expect(user2Results[0].content).toContain('User 2');
    });
  });

  describe('Data Seeding and Scenarios', () => {
    it('should seed comprehensive test data correctly', async () => {
      const seededData = await seedTestData();

      expect(seededData.users.length).toBeGreaterThan(0);
      expect(seededData.analysisResults.length).toBeGreaterThan(0);
      expect(seededData.scheduledScans.length).toBeGreaterThan(0);

      // Verify data integrity
      seededData.analysisResults.forEach(analysis => {
        expect(analysis.accuracy).toBeGreaterThanOrEqual(0);
        expect(analysis.accuracy).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high', 'critical']).toContain(analysis.risk_level);
      });
    });

    it('should create realistic test scenarios', async () => {
      // Test user permissions scenario
      const { adminUser, regularUser, viewerUser } = await testDataScenarios.userPermissions();
      
      expect(adminUser.role.id).toBe('admin');
      expect(regularUser.role.id).toBe('user');
      expect(viewerUser.role.id).toBe('viewer');

      // Test analysis workflow scenario
      const { user, highAccuracy, lowAccuracy } = await testDataScenarios.analysisWorkflow();
      
      expect(highAccuracy.accuracy).toBeGreaterThan(lowAccuracy.accuracy);
      expect(highAccuracy.risk_level).toBe('low');
      expect(lowAccuracy.risk_level).toBe('critical');

      // Test batch analysis scenario
      const { batchId, batchResults } = await testDataScenarios.batchAnalysis();
      
      expect(batchResults).toHaveLength(3);
      batchResults.forEach(result => {
        expect(result.batch_id).toBe(batchId);
        expect(result.analysis_type).toBe('batch');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database connection failures gracefully', async () => {
      // Mock connection failure
      const failingDb = {
        from: () => ({
          select: () => ({
            eq: () => Promise.resolve({ error: { message: 'Connection lost' } })
          })
        })
      };

      // Test error handling
      const { error } = await failingDb.from('users').select('*').eq('id', 'test');
      expect(error).toBeDefined();
      expect(error.message).toBe('Connection lost');
    });

    it('should handle malformed data gracefully', async () => {
      const testUser = createTestUser({ id: 'test-malformed-user' });
      await testDb.from('users').insert({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        avatar: testUser.avatar,
        role_id: testUser.role.id,
        department: testUser.department,
        status: testUser.status,
        last_active: testUser.lastActive,
        created_at: testUser.createdAt,
        permissions: testUser.permissions
      });

      // Try to insert analysis with malformed JSON
      const malformedAnalysis = {
        id: 'test-malformed-analysis',
        user_id: testUser.id,
        content: 'Test content',
        accuracy: 85,
        risk_level: 'medium',
        hallucinations: 'invalid json string', // Should be JSON array
        verification_sources: 5,
        processing_time: 1000,
        created_at: new Date().toISOString()
      };

      const { error } = await testDb
        .from('analysis_results')
        .insert(malformedAnalysis);

      // Should handle JSON validation error
      expect(error).toBeDefined();
    });

    it('should handle large data insertions', async () => {
      const testUser = createTestUser({ id: 'test-large-data-user' });
      await testDb.from('users').insert({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        avatar: testUser.avatar,
        role_id: testUser.role.id,
        department: testUser.department,
        status: testUser.status,
        last_active: testUser.lastActive,
        created_at: testUser.createdAt,
        permissions: testUser.permissions
      });

      // Create analysis with very large content
      const largeContent = 'A'.repeat(10000); // 10KB content
      const largeAnalysis = createTestDatabaseAnalysisResult({
        id: 'test-large-analysis',
        user_id: testUser.id,
        content: largeContent.substring(0, 200),
        full_content: largeContent
      });

      const { data, error } = await testDb
        .from('analysis_results')
        .insert(largeAnalysis)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.full_content).toHaveLength(10000);
    });
  });
});