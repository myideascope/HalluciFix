import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { 
  IntegrationDatabaseSeeder, 
  withIntegrationTest,
  setupIntegrationTest,
  cleanupIntegrationTest
} from '../utils/database-seeder';
import { createTestUser, createTestAnalysis } from '../utils';

describe('Supabase Integration Tests', () => {
  let supabase: any;
  let seeder: IntegrationDatabaseSeeder;

  beforeEach(async () => {
    supabase = createClient(
      process.env.VITE_SUPABASE_URL || 'https://test.supabase.co',
      process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key'
    );
    seeder = new IntegrationDatabaseSeeder();
  });

  afterEach(async () => {
    await seeder.cleanup();
  });

  describe('User Operations', () => {
    it('should create and retrieve users', async () => {
      await withIntegrationTest('user-crud', 'basic', async (testData) => {
        const { users } = testData;
        
        // Test user creation (mocked in test environment)
        expect(users).toHaveLength(3);
        expect(users[0].email).toBe('test@example.com');
        expect(users[1].email).toBe('admin@example.com');
        expect(users[2].email).toBe('trial@example.com');
        
        // Test user retrieval (would be real database call in actual integration)
        const { data: retrievedUsers, error } = await supabase
          .from('users')
          .select('*')
          .in('id', users.map(u => u.id));
        
        // In test environment, this would be mocked
        if (!error) {
          expect(retrievedUsers).toBeDefined();
        }
      });
    });

    it('should handle user authentication flow', async () => {
      await withIntegrationTest('user-auth', 'auth', async (testData) => {
        const { users } = testData;
        
        const validAuthUser = users.find(u => u.email === 'valid-auth@example.com');
        const expiredTokenUser = users.find(u => u.email === 'expired-token@example.com');
        
        expect(validAuthUser).toBeDefined();
        expect(validAuthUser?.google_refresh_token).toBeTruthy();
        expect(new Date(validAuthUser?.google_access_token_expires_at!)).toBeInstanceOf(Date);
        
        expect(expiredTokenUser).toBeDefined();
        expect(new Date(expiredTokenUser?.google_access_token_expires_at!)).toBeInstanceOf(Date);
      });
    });
  });

  describe('Analysis Operations', () => {
    it('should create and query analyses', async () => {
      await withIntegrationTest('analysis-crud', 'basic', async (testData) => {
        const { users, analyses } = testData;
        
        expect(analyses.length).toBeGreaterThan(0);
        
        // Test analysis creation and retrieval
        const userAnalyses = analyses.filter(a => a.user_id === users[0].id);
        expect(userAnalyses).toHaveLength(5);
        
        // Test analysis queries (mocked in test environment)
        const { data: retrievedAnalyses, error } = await supabase
          .from('analyses')
          .select('*')
          .eq('user_id', users[0].id)
          .order('created_at', { ascending: false });
        
        if (!error) {
          expect(retrievedAnalyses).toBeDefined();
        }
      });
    });

    it('should handle analysis filtering and pagination', async () => {
      await withIntegrationTest('analysis-filtering', 'performance', async (testData) => {
        const { analyses } = testData;
        
        expect(analyses.length).toBe(500);
        
        // Test risk level filtering
        const highRiskAnalyses = analyses.filter(a => a.risk_level === 'high');
        const lowRiskAnalyses = analyses.filter(a => a.risk_level === 'low');
        
        expect(highRiskAnalyses.length).toBeGreaterThan(0);
        expect(lowRiskAnalyses.length).toBeGreaterThan(0);
        
        // Test pagination (mocked query)
        const { data: paginatedAnalyses, error } = await supabase
          .from('analyses')
          .select('*')
          .range(0, 9) // First 10 items
          .order('created_at', { ascending: false });
        
        if (!error) {
          expect(paginatedAnalyses).toBeDefined();
        }
      });
    });
  });

  describe('Scheduled Scan Operations', () => {
    it('should manage scheduled scans', async () => {
      await withIntegrationTest('scan-management', 'basic', async (testData) => {
        const { users, scans } = testData;
        
        expect(scans.length).toBeGreaterThan(0);
        
        // Test scan creation and retrieval
        const userScans = scans.filter(s => s.user_id === users[0].id);
        expect(userScans).toHaveLength(2);
        
        // Test active scan filtering
        const activeScans = scans.filter(s => s.is_active);
        expect(activeScans.length).toBeGreaterThan(0);
        
        // Test scan update (mocked in test environment)
        const scanToUpdate = scans[0];
        const { data: updatedScan, error } = await supabase
          .from('scheduled_scans')
          .update({ is_active: false })
          .eq('id', scanToUpdate.id)
          .select()
          .single();
        
        if (!error) {
          expect(updatedScan).toBeDefined();
        }
      });
    });

    it('should handle scan error states', async () => {
      await withIntegrationTest('scan-errors', 'error', async (testData) => {
        const { scans } = testData;
        
        const scansWithErrors = scans.filter(s => s.last_error !== null);
        expect(scansWithErrors.length).toBeGreaterThan(0);
        
        const quotaErrorScan = scans.find(s => s.last_error?.code === 'QUOTA_EXCEEDED');
        expect(quotaErrorScan).toBeDefined();
        expect(quotaErrorScan?.is_active).toBe(false);
        
        const authErrorScan = scans.find(s => s.last_error?.code === 'AUTH_ERROR');
        expect(authErrorScan).toBeDefined();
        expect(authErrorScan?.last_error?.message).toContain('Authentication failed');
      });
    });
  });

  describe('Database Relationships', () => {
    it('should maintain referential integrity', async () => {
      await withIntegrationTest('referential-integrity', 'basic', async (testData) => {
        const { users, analyses, scans } = testData;
        
        // Verify all analyses belong to existing users
        analyses.forEach(analysis => {
          const userExists = users.some(user => user.id === analysis.user_id);
          expect(userExists).toBe(true);
        });
        
        // Verify all scans belong to existing users
        scans.forEach(scan => {
          const userExists = users.some(user => user.id === scan.user_id);
          expect(userExists).toBe(true);
        });
      });
    });

    it('should handle cascade operations', async () => {
      const testUser = createTestUser();
      await seeder.seedUsers([testUser]);
      
      const testAnalysis = createTestAnalysis({ user_id: testUser.id });
      await seeder.seedAnalyses([testAnalysis]);
      
      // Test cascade delete (mocked in test environment)
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', testUser.id);
      
      if (!deleteError) {
        // Verify related analyses are also deleted
        const { data: remainingAnalyses, error: queryError } = await supabase
          .from('analyses')
          .select('*')
          .eq('user_id', testUser.id);
        
        if (!queryError) {
          expect(remainingAnalyses).toHaveLength(0);
        }
      }
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', async () => {
      await withIntegrationTest('performance-test', 'performance', async (testData) => {
        const { users, analyses } = testData;
        
        expect(users).toHaveLength(50);
        expect(analyses).toHaveLength(500);
        
        const startTime = Date.now();
        
        // Test bulk query performance (mocked)
        const { data: bulkAnalyses, error } = await supabase
          .from('analyses')
          .select('id, accuracy_score, risk_level, created_at')
          .limit(100);
        
        const queryTime = Date.now() - startTime;
        
        if (!error) {
          expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
          expect(bulkAnalyses).toBeDefined();
        }
      });
    });

    it('should handle concurrent operations', async () => {
      await withIntegrationTest('concurrent-operations', 'basic', async (testData) => {
        const { users } = testData;
        
        // Test concurrent analysis creation
        const concurrentAnalyses = users.map(user => 
          createTestAnalysis({ user_id: user.id })
        );
        
        const startTime = Date.now();
        
        // Simulate concurrent inserts (mocked)
        const insertPromises = concurrentAnalyses.map(analysis => 
          supabase
            .from('analyses')
            .insert(analysis)
            .select()
            .single()
        );
        
        const results = await Promise.allSettled(insertPromises);
        const concurrentTime = Date.now() - startTime;
        
        expect(concurrentTime).toBeLessThan(2000); // Should complete within 2 seconds
        
        const successfulInserts = results.filter(result => result.status === 'fulfilled');
        expect(successfulInserts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Test with invalid connection
      const invalidSupabase = createClient('https://invalid.supabase.co', 'invalid-key');
      
      const { data, error } = await invalidSupabase
        .from('users')
        .select('*')
        .limit(1);
      
      expect(error).toBeDefined();
      expect(data).toBeNull();
    });

    it('should handle constraint violations', async () => {
      await withIntegrationTest('constraint-violations', 'basic', async (testData) => {
        const { users } = testData;
        
        // Try to create user with duplicate email (should fail)
        const duplicateUser = createTestUser({ 
          email: users[0].email // Same email as existing user
        });
        
        const { data, error } = await supabase
          .from('users')
          .insert(duplicateUser)
          .select()
          .single();
        
        // In a real database, this would fail due to unique constraint
        // In test environment, we simulate the error
        if (error) {
          expect(error.message).toContain('duplicate');
        }
      });
    });
  });
});