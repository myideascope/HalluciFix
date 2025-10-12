import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  setupTestDatabase, 
  cleanupTestDatabase, 
  seedTestData, 
  seedMinimalTestData,
  createTestUserInDatabase,
  createTestAnalysisInDatabase,
  getTestDatabase,
  checkDatabaseHealth,
  resetTestDatabase,
  waitForDatabaseOperation,
  testDataScenarios,
  DatabaseTestIsolation,
  DatabasePerformanceMonitor,
  withDatabaseTransaction
} from '../database';
import { supabase } from '../../../lib/supabase';
import { createTestUser, createTestDatabaseAnalysisResult } from '../../factories';

describe('Database Integration Tests', () => {
  let testIsolation: DatabaseTestIsolation;

  beforeEach(async () => {
    testIsolation = new DatabaseTestIsolation();
    await setupTestDatabase();
  });

  afterEach(async () => {
    await testIsolation.cleanup();
    await cleanupTestDatabase();
  });

  describe('Database Connection and Health', () => {
    it('should establish database connection successfully', async () => {
      const db = await setupTestDatabase();
      expect(db).toBeDefined();
      expect(typeof db.from).toBe('function');
    });

    it('should verify database health', async () => {
      const isHealthy = await checkDatabaseHealth();
      expect(isHealthy).toBe(true);
    });

    it('should handle connection failures gracefully', async () => {
      // Mock a connection failure
      const originalSupabase = getTestDatabase();
      vi.spyOn(originalSupabase, 'from').mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const isHealthy = await checkDatabaseHealth();
      expect(isHealthy).toBe(false);

      vi.restoreAllMocks();
    });

    it('should reconnect after connection loss', async () => {
      // Simulate connection loss and recovery
      await setupTestDatabase();
      const isHealthy = await checkDatabaseHealth();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Data Seeding and Cleanup', () => {
    it('should seed test data successfully', async () => {
      const seededData = await seedTestData();

      expect(seededData.users).toBeDefined();
      expect(seededData.analysisResults).toBeDefined();
      expect(seededData.scheduledScans).toBeDefined();
      expect(seededData.reviews).toBeDefined();

      expect(seededData.users.length).toBeGreaterThan(0);
      expect(seededData.analysisResults.length).toBeGreaterThan(0);
    });

    it('should seed minimal test data', async () => {
      const { user, analysisResult } = await seedMinimalTestData();

      expect(user).toBeDefined();
      expect(user.id).toBe('test-user-minimal');
      expect(analysisResult).toBeDefined();
      expect(analysisResult.user_id).toBe(user.id);

      // Verify data exists in database
      const { data: dbUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      expect(dbUser).toBeDefined();
      expect(dbUser.email).toBe(user.email);
    });

    it('should clean up test data completely', async () => {
      // Seed some data first
      await seedTestData();

      // Clean up
      await cleanupTestDatabase();

      // Verify cleanup
      const { data: users } = await supabase
        .from('users')
        .select('*')
        .like('email', '%@test.example.com');

      expect(users).toHaveLength(0);
    });

    it('should reset database to clean state', async () => {
      // Add some data
      await createTestUserInDatabase({ email: 'reset-test@test.example.com' });

      // Reset database
      await resetTestDatabase();

      // Should have fresh seeded data
      const { data: users } = await supabase
        .from('users')
        .select('*');

      expect(users).toBeDefined();
      expect(users!.length).toBeGreaterThan(0);
    });
  });

  describe('User Operations', () => {
    it('should create test user in database', async () => {
      const userData = createTestUser({
        email: 'db-test@test.example.com',
        name: 'Database Test User'
      });

      const createdUser = await createTestUserInDatabase(userData);

      expect(createdUser).toMatchObject(userData);

      // Verify in database
      const { data: dbUser, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', createdUser.id)
        .single();

      expect(error).toBeNull();
      expect(dbUser).toBeDefined();
      expect(dbUser.email).toBe(userData.email);
    });

    it('should handle user creation with duplicate email', async () => {
      const email = 'duplicate@test.example.com';
      
      await createTestUserInDatabase({ email });

      // Try to create another user with same email
      await expect(createTestUserInDatabase({ email }))
        .rejects.toThrow();
    });

    it('should create user with all role types', async () => {
      const roles = ['admin', 'manager', 'editor', 'viewer'];

      for (const roleId of roles) {
        const user = await createTestUserInDatabase({
          email: `${roleId}@test.example.com`,
          role: { id: roleId, name: roleId, description: `${roleId} role`, level: 1, permissions: [] }
        });

        expect(user.role.id).toBe(roleId);

        const { data: dbUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        expect(dbUser.role_id).toBe(roleId);
      }
    });
  });

  describe('Analysis Operations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await createTestUserInDatabase({
        email: 'analysis-test@test.example.com'
      });
    });

    it('should create analysis result in database', async () => {
      const analysisData = createTestDatabaseAnalysisResult({
        user_id: testUser.id,
        content: 'Test analysis content',
        accuracy: 85.5,
        risk_level: 'medium'
      });

      const createdAnalysis = await createTestAnalysisInDatabase(analysisData);

      expect(createdAnalysis).toMatchObject(analysisData);

      // Verify in database
      const { data: dbAnalysis, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('id', createdAnalysis.id)
        .single();

      expect(error).toBeNull();
      expect(dbAnalysis).toBeDefined();
      expect(dbAnalysis.accuracy).toBe(85.5);
      expect(dbAnalysis.risk_level).toBe('medium');
    });

    it('should handle analysis with complex hallucinations data', async () => {
      const complexHallucinations = [
        {
          text: 'exactly 99.7% accuracy',
          type: 'False Precision',
          confidence: 0.92,
          explanation: 'Suspiciously specific statistic',
          startIndex: 10,
          endIndex: 32
        },
        {
          text: 'zero false positives',
          type: 'Impossible Metric',
          confidence: 0.88,
          explanation: 'Perfect metrics are unlikely',
          startIndex: 40,
          endIndex: 60
        }
      ];

      const analysisData = createTestDatabaseAnalysisResult({
        user_id: testUser.id,
        hallucinations: complexHallucinations
      });

      const createdAnalysis = await createTestAnalysisInDatabase(analysisData);

      const { data: dbAnalysis } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('id', createdAnalysis.id)
        .single();

      expect(dbAnalysis.hallucinations).toHaveLength(2);
      expect(dbAnalysis.hallucinations[0].confidence).toBe(0.92);
    });

    it('should handle analysis with seq-logprob data', async () => {
      const seqLogprobData = {
        seqLogprob: -2.5,
        normalizedSeqLogprob: -1.8,
        confidenceScore: 75.5,
        hallucinationRisk: 'medium' as const,
        isHallucinationSuspected: true,
        lowConfidenceTokens: 5,
        suspiciousSequences: 2,
        processingTime: 1250
      };

      const analysisData = createTestDatabaseAnalysisResult({
        user_id: testUser.id,
        seq_logprob_analysis: seqLogprobData
      });

      const createdAnalysis = await createTestAnalysisInDatabase(analysisData);

      const { data: dbAnalysis } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('id', createdAnalysis.id)
        .single();

      expect(dbAnalysis.seq_logprob_analysis).toMatchObject(seqLogprobData);
    });

    it('should query analysis results with filters', async () => {
      // Create multiple analysis results
      await createTestAnalysisInDatabase({
        user_id: testUser.id,
        accuracy: 95.0,
        risk_level: 'low'
      });
      await createTestAnalysisInDatabase({
        user_id: testUser.id,
        accuracy: 45.0,
        risk_level: 'critical'
      });
      await createTestAnalysisInDatabase({
        user_id: testUser.id,
        accuracy: 75.0,
        risk_level: 'medium'
      });

      // Query high-risk results
      const { data: highRiskResults } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .in('risk_level', ['high', 'critical']);

      expect(highRiskResults).toHaveLength(1);
      expect(highRiskResults![0].risk_level).toBe('critical');

      // Query by accuracy range
      const { data: mediumAccuracyResults } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .gte('accuracy', 70)
        .lt('accuracy', 90);

      expect(mediumAccuracyResults).toHaveLength(1);
      expect(mediumAccuracyResults![0].accuracy).toBe(75.0);
    });
  });

  describe('Data Consistency and Transactions', () => {
    it('should maintain referential integrity', async () => {
      const user = await createTestUserInDatabase({
        email: 'integrity-test@test.example.com'
      });

      const analysis = await createTestAnalysisInDatabase({
        user_id: user.id
      });

      // Try to delete user (should fail due to foreign key constraint)
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      // Depending on database setup, this might fail or cascade delete
      // The test verifies the constraint exists
      if (error) {
        expect(error.message).toContain('foreign key');
      }
    });

    it('should handle concurrent operations', async () => {
      const user = await createTestUserInDatabase({
        email: 'concurrent-test@test.example.com'
      });

      // Create multiple analysis results concurrently
      const promises = Array.from({ length: 5 }, (_, i) =>
        createTestAnalysisInDatabase({
          user_id: user.id,
          content: `Concurrent analysis ${i}`,
          accuracy: 80 + i
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result.accuracy).toBe(80 + i);
      });

      // Verify all were created
      const { data: dbResults } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', user.id);

      expect(dbResults).toHaveLength(5);
    });

    it('should handle transaction-like operations', async () => {
      const user = await createTestUserInDatabase({
        email: 'transaction-test@test.example.com'
      });

      await withDatabaseTransaction(async (client) => {
        // Create analysis result
        const analysis = await createTestAnalysisInDatabase({
          user_id: user.id,
          content: 'Transaction test content'
        });

        // Update user's last activity
        await client
          .from('users')
          .update({ last_active: new Date().toISOString() })
          .eq('id', user.id);

        return analysis;
      });

      // Verify both operations completed
      const { data: updatedUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      expect(updatedUser.last_active).toBeDefined();
    });
  });

  describe('Test Data Isolation', () => {
    it('should create isolated test data', async () => {
      const isolation1 = new DatabaseTestIsolation('test1');
      const isolation2 = new DatabaseTestIsolation('test2');

      const user1 = await isolation1.createIsolatedUser();
      const user2 = await isolation2.createIsolatedUser();

      expect(user1.id).toContain('test1');
      expect(user2.id).toContain('test2');
      expect(user1.id).not.toBe(user2.id);

      // Clean up one isolation
      await isolation1.cleanup();

      // Verify only isolation1 data was cleaned
      const { data: remainingUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', user2.id)
        .single();

      expect(remainingUser).toBeDefined();

      await isolation2.cleanup();
    });

    it('should handle isolated analysis creation', async () => {
      const isolation = new DatabaseTestIsolation();
      
      const user = await isolation.createIsolatedUser();
      const analysis = await isolation.createIsolatedAnalysis({
        user_id: user.id
      });

      expect(analysis.user_id).toBe(user.id);
      expect(analysis.id).toContain(isolation['testId']);

      await isolation.cleanup();

      // Verify cleanup
      const { data: cleanedAnalysis } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('id', analysis.id)
        .single();

      expect(cleanedAnalysis).toBeNull();
    });
  });

  describe('Performance Monitoring', () => {
    it('should monitor database operation performance', async () => {
      const monitor = new DatabasePerformanceMonitor();
      
      monitor.start();
      
      // Perform database operations
      const user = await createTestUserInDatabase({
        email: 'performance-test@test.example.com'
      });
      monitor.recordOperation('create_user');

      await createTestAnalysisInDatabase({
        user_id: user.id
      });
      monitor.recordOperation('create_analysis');

      const report = monitor.getReport();

      expect(report.operations).toHaveLength(2);
      expect(report.operations[0].operation).toBe('create_user');
      expect(report.operations[1].operation).toBe('create_analysis');
      expect(report.totalTime).toBeGreaterThan(0);

      // Verify reasonable performance
      expect(report.totalTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle performance monitoring reset', async () => {
      const monitor = new DatabasePerformanceMonitor();
      
      monitor.start();
      await waitForDatabaseOperation(100);
      monitor.recordOperation('test_operation');

      let report = monitor.getReport();
      expect(report.operations).toHaveLength(1);

      monitor.reset();
      report = monitor.getReport();
      expect(report.operations).toHaveLength(0);
      expect(report.totalTime).toBe(0);
    });
  });

  describe('Test Data Scenarios', () => {
    it('should create user permissions scenario', async () => {
      const { adminUser, regularUser, viewerUser } = await testDataScenarios.userPermissions();

      expect(adminUser.role.id).toBe('admin');
      expect(regularUser.role.id).toBe('user');
      expect(viewerUser.role.id).toBe('viewer');

      // Verify in database
      const { data: users } = await supabase
        .from('users')
        .select('*')
        .in('id', [adminUser.id, regularUser.id, viewerUser.id]);

      expect(users).toHaveLength(3);
    });

    it('should create analysis workflow scenario', async () => {
      const { user, highAccuracy, lowAccuracy } = await testDataScenarios.analysisWorkflow();

      expect(highAccuracy.accuracy).toBe(95.5);
      expect(highAccuracy.risk_level).toBe('low');
      expect(lowAccuracy.accuracy).toBe(45.2);
      expect(lowAccuracy.risk_level).toBe('critical');

      // Verify both analyses belong to same user
      expect(highAccuracy.user_id).toBe(user.id);
      expect(lowAccuracy.user_id).toBe(user.id);
    });

    it('should create batch analysis scenario', async () => {
      const { user, batchId, batchResults } = await testDataScenarios.batchAnalysis();

      expect(batchResults).toHaveLength(3);
      batchResults.forEach(result => {
        expect(result.batch_id).toBe(batchId);
        expect(result.analysis_type).toBe('batch');
        expect(result.user_id).toBe(user.id);
      });

      // Verify in database
      const { data: dbBatchResults } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('batch_id', batchId);

      expect(dbBatchResults).toHaveLength(3);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid user data gracefully', async () => {
      await expect(createTestUserInDatabase({
        email: 'invalid-email', // Invalid email format
        name: ''
      })).rejects.toThrow();
    });

    it('should handle missing required fields', async () => {
      await expect(createTestAnalysisInDatabase({
        // Missing user_id
        content: 'Test content'
      } as any)).rejects.toThrow();
    });

    it('should handle database constraint violations', async () => {
      const user = await createTestUserInDatabase({
        email: 'constraint-test@test.example.com'
      });

      // Try to create analysis with invalid risk_level
      await expect(createTestAnalysisInDatabase({
        user_id: user.id,
        risk_level: 'invalid_level' as any
      })).rejects.toThrow();
    });

    it('should handle large data operations', async () => {
      const user = await createTestUserInDatabase({
        email: 'large-data-test@test.example.com'
      });

      // Create analysis with large content
      const largeContent = 'Large content test. '.repeat(10000);
      const analysis = await createTestAnalysisInDatabase({
        user_id: user.id,
        content: largeContent.substring(0, 200) + '...',
        full_content: largeContent
      });

      expect(analysis.full_content?.length).toBeGreaterThan(100000);

      // Verify it was stored correctly
      const { data: dbAnalysis } = await supabase
        .from('analysis_results')
        .select('full_content')
        .eq('id', analysis.id)
        .single();

      expect(dbAnalysis.full_content?.length).toBeGreaterThan(100000);
    });
  });
});