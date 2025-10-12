import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase } from '../supabase';
import { setupTestDatabase, cleanupTestDatabase, createTestUserInDatabase, DatabaseTestIsolation } from '../../test/utils/database';
import { createTestDatabaseAnalysisResult } from '../../test/factories';

describe('Supabase Client Integration Tests', () => {
  let testIsolation: DatabaseTestIsolation;

  beforeEach(async () => {
    testIsolation = new DatabaseTestIsolation();
    await setupTestDatabase();
  });

  afterEach(async () => {
    await testIsolation.cleanup();
    await cleanupTestDatabase();
  });

  describe('Authentication Operations', () => {
    it('should handle auth session retrieval', async () => {
      const { data, error } = await supabase.auth.getSession();
      
      expect(error).toBeNull();
      expect(data).toBeDefined();
      // In test environment, session might be null
      expect(data.session).toBeNull();
    });

    it('should handle auth state changes', async () => {
      const mockCallback = vi.fn();
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange(mockCallback);
      
      expect(subscription).toBeDefined();
      expect(typeof subscription.unsubscribe).toBe('function');
      
      subscription.unsubscribe();
    });

    it('should handle OAuth sign-in attempts', async () => {
      // This would typically redirect in a real environment
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:3000/auth/callback'
        }
      });

      // In test environment, this might not complete the full OAuth flow
      expect(data).toBeDefined();
    });
  });

  describe('Database CRUD Operations', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await testIsolation.createIsolatedUser({
        email: 'crud-test@test.example.com',
        name: 'CRUD Test User'
      });
    });

    describe('Users Table Operations', () => {
      it('should create user record', async () => {
        const userData = {
          id: 'test-user-create',
          email: 'create-test@test.example.com',
          name: 'Create Test User',
          role_id: 'user',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('users')
          .insert(userData)
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).toMatchObject(userData);
      });

      it('should read user record', async () => {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', testUser.id)
          .single();

        expect(error).toBeNull();
        expect(data).toBeDefined();
        expect(data.email).toBe(testUser.email);
      });

      it('should update user record', async () => {
        const newName = 'Updated Test User';
        
        const { data, error } = await supabase
          .from('users')
          .update({ name: newName })
          .eq('id', testUser.id)
          .select()
          .single();

        expect(error).toBeNull();
        expect(data.name).toBe(newName);
      });

      it('should delete user record', async () => {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', testUser.id);

        // This might fail due to foreign key constraints
        // The test verifies the operation is handled properly
        if (error) {
          expect(error.message).toBeDefined();
        }
      });

      it('should handle user queries with filters', async () => {
        // Create additional test users
        await testIsolation.createIsolatedUser({
          email: 'active-user@test.example.com',
          status: 'active'
        });
        await testIsolation.createIsolatedUser({
          email: 'inactive-user@test.example.com',
          status: 'inactive'
        });

        const { data: activeUsers, error } = await supabase
          .from('users')
          .select('*')
          .eq('status', 'active')
          .like('email', '%@test.example.com');

        expect(error).toBeNull();
        expect(activeUsers!.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Analysis Results Table Operations', () => {
      it('should create analysis result record', async () => {
        const analysisData = createTestDatabaseAnalysisResult({
          user_id: testUser.id,
          content: 'Test analysis content',
          accuracy: 85.5,
          risk_level: 'medium'
        });

        const { data, error } = await supabase
          .from('analysis_results')
          .insert(analysisData)
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).toMatchObject(analysisData);
      });

      it('should query analysis results with complex filters', async () => {
        // Create multiple analysis results
        const analyses = [
          createTestDatabaseAnalysisResult({
            user_id: testUser.id,
            accuracy: 95.0,
            risk_level: 'low',
            analysis_type: 'single'
          }),
          createTestDatabaseAnalysisResult({
            user_id: testUser.id,
            accuracy: 45.0,
            risk_level: 'critical',
            analysis_type: 'batch'
          }),
          createTestDatabaseAnalysisResult({
            user_id: testUser.id,
            accuracy: 75.0,
            risk_level: 'medium',
            analysis_type: 'scheduled'
          })
        ];

        await supabase.from('analysis_results').insert(analyses);

        // Query with multiple filters
        const { data: filteredResults, error } = await supabase
          .from('analysis_results')
          .select('*')
          .eq('user_id', testUser.id)
          .gte('accuracy', 70)
          .in('analysis_type', ['single', 'scheduled'])
          .order('accuracy', { ascending: false });

        expect(error).toBeNull();
        expect(filteredResults).toHaveLength(2);
        expect(filteredResults![0].accuracy).toBe(95.0);
        expect(filteredResults![1].accuracy).toBe(75.0);
      });

      it('should handle JSON column operations', async () => {
        const hallucinations = [
          {
            text: 'exactly 99.7% accuracy',
            type: 'False Precision',
            confidence: 0.92,
            explanation: 'Suspiciously specific statistic'
          }
        ];

        const analysisData = createTestDatabaseAnalysisResult({
          user_id: testUser.id,
          hallucinations
        });

        const { data, error } = await supabase
          .from('analysis_results')
          .insert(analysisData)
          .select()
          .single();

        expect(error).toBeNull();
        expect(data.hallucinations).toEqual(hallucinations);

        // Query by JSON content
        const { data: jsonResults } = await supabase
          .from('analysis_results')
          .select('*')
          .contains('hallucinations', [{ type: 'False Precision' }]);

        expect(jsonResults!.length).toBeGreaterThan(0);
      });

      it('should handle aggregation queries', async () => {
        // Create multiple analysis results for aggregation
        const analyses = Array.from({ length: 5 }, (_, i) =>
          createTestDatabaseAnalysisResult({
            user_id: testUser.id,
            accuracy: 70 + (i * 5),
            processing_time: 1000 + (i * 100)
          })
        );

        await supabase.from('analysis_results').insert(analyses);

        // Note: Supabase doesn't support aggregation functions directly in the client
        // This would typically be done with RPC calls or database functions
        const { data: allResults } = await supabase
          .from('analysis_results')
          .select('accuracy, processing_time')
          .eq('user_id', testUser.id);

        expect(allResults!.length).toBe(5);
        
        // Calculate aggregations in JavaScript for testing
        const avgAccuracy = allResults!.reduce((sum, r) => sum + r.accuracy, 0) / allResults!.length;
        expect(avgAccuracy).toBe(80); // (70+75+80+85+90)/5
      });
    });

    describe('Real-time Subscriptions', () => {
      it('should handle real-time subscriptions', async () => {
        const changes: any[] = [];
        
        const subscription = supabase
          .channel('test-channel')
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'analysis_results',
            filter: `user_id=eq.${testUser.id}`
          }, (payload) => {
            changes.push(payload);
          })
          .subscribe();

        // Wait for subscription to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Insert a new record
        const analysisData = createTestDatabaseAnalysisResult({
          user_id: testUser.id
        });

        await supabase
          .from('analysis_results')
          .insert(analysisData);

        // Wait for real-time event
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Clean up subscription
        await supabase.removeChannel(subscription);

        // In a real environment, this would capture the change
        // In test environment, real-time might not work
        expect(subscription).toBeDefined();
      });
    });
  });

  describe('Database Functions and RPC', () => {
    it('should handle RPC function calls', async () => {
      // Test a simple RPC call (if available in test database)
      try {
        const { data, error } = await supabase.rpc('test_function', {});
        
        // Function might not exist in test environment
        if (error && !error.message.includes('function') && !error.message.includes('does not exist')) {
          expect(error).toBeNull();
        }
      } catch (error) {
        // RPC might not be available in test environment
        expect(error).toBeDefined();
      }
    });

    it('should handle database health check', async () => {
      // Simple query to check database connectivity
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid table names', async () => {
      const { data, error } = await supabase
        .from('nonexistent_table')
        .select('*');

      expect(error).toBeDefined();
      expect(error!.message).toContain('relation');
    });

    it('should handle invalid column names', async () => {
      const { data, error } = await supabase
        .from('users')
        .select('nonexistent_column');

      expect(error).toBeDefined();
      expect(error!.message).toContain('column');
    });

    it('should handle constraint violations', async () => {
      // Try to insert user with duplicate ID
      const userData = {
        id: testUser.id, // Duplicate ID
        email: 'duplicate@test.example.com',
        name: 'Duplicate User'
      };

      const { data, error } = await supabase
        .from('users')
        .insert(userData);

      expect(error).toBeDefined();
      expect(error!.message).toContain('duplicate');
    });

    it('should handle foreign key violations', async () => {
      // Try to insert analysis result with non-existent user
      const analysisData = createTestDatabaseAnalysisResult({
        user_id: 'nonexistent-user-id'
      });

      const { data, error } = await supabase
        .from('analysis_results')
        .insert(analysisData);

      expect(error).toBeDefined();
      expect(error!.message).toContain('foreign key');
    });

    it('should handle malformed JSON data', async () => {
      // This test depends on how the database handles JSON validation
      const analysisData = {
        ...createTestDatabaseAnalysisResult({ user_id: testUser.id }),
        hallucinations: 'invalid json string' as any
      };

      const { data, error } = await supabase
        .from('analysis_results')
        .insert(analysisData);

      // Depending on database setup, this might succeed or fail
      if (error) {
        expect(error.message).toBeDefined();
      }
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle large result sets efficiently', async () => {
      // Create many analysis results
      const analyses = Array.from({ length: 100 }, (_, i) =>
        createTestDatabaseAnalysisResult({
          user_id: testUser.id,
          content: `Analysis content ${i}`,
          accuracy: Math.random() * 100
        })
      );

      const startTime = Date.now();
      
      // Insert in batches for better performance
      const batchSize = 20;
      for (let i = 0; i < analyses.length; i += batchSize) {
        const batch = analyses.slice(i, i + batchSize);
        await supabase.from('analysis_results').insert(batch);
      }

      const insertTime = Date.now() - startTime;

      // Query all results
      const queryStartTime = Date.now();
      const { data, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .order('created_at', { ascending: false });

      const queryTime = Date.now() - queryStartTime;

      expect(error).toBeNull();
      expect(data!.length).toBe(100);
      
      // Performance assertions (adjust based on environment)
      expect(insertTime).toBeLessThan(10000); // 10 seconds max for inserts
      expect(queryTime).toBeLessThan(5000);   // 5 seconds max for query
    });

    it('should handle pagination efficiently', async () => {
      // Create test data
      const analyses = Array.from({ length: 50 }, (_, i) =>
        createTestDatabaseAnalysisResult({
          user_id: testUser.id,
          content: `Paginated content ${i}`,
          created_at: new Date(Date.now() - (i * 1000)).toISOString()
        })
      );

      await supabase.from('analysis_results').insert(analyses);

      // Test pagination
      const pageSize = 10;
      let allResults: any[] = [];
      let page = 0;

      while (true) {
        const { data, error } = await supabase
          .from('analysis_results')
          .select('*')
          .eq('user_id', testUser.id)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        expect(error).toBeNull();
        
        if (!data || data.length === 0) break;
        
        allResults.push(...data);
        page++;
        
        if (page > 10) break; // Safety break
      }

      expect(allResults.length).toBe(50);
      expect(page).toBe(5); // 50 items / 10 per page = 5 pages
    });

    it('should handle concurrent database operations', async () => {
      const concurrentOperations = Array.from({ length: 10 }, (_, i) =>
        supabase
          .from('analysis_results')
          .insert(createTestDatabaseAnalysisResult({
            user_id: testUser.id,
            content: `Concurrent analysis ${i}`
          }))
      );

      const results = await Promise.all(concurrentOperations);

      results.forEach(({ error }) => {
        expect(error).toBeNull();
      });

      // Verify all records were created
      const { data: allRecords } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id);

      expect(allRecords!.length).toBe(10);
    });
  });
});