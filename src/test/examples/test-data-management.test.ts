import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  TestDataManager, 
  TestDataIsolation
} from '../data';
import { 
  setupTestDataIsolation,
  getTestDataFactory,
  verifyDataIsolation
} from '../utils/test-data-helpers';

describe('Test Data Management Examples', () => {
  describe('Basic Test Data Manager Usage', () => {
    let manager: TestDataManager;

    beforeEach(() => {
      manager = new TestDataManager({
        isolationId: 'basic-test',
        cleanup: true
      });
    });

    afterEach(async () => {
      await manager.cleanup();
    });

    it('should create isolated test user', async () => {
      const user = await manager.createTestUser({
        email: 'test@example.com',
        name: 'Test User'
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.isolation_id).toBe('basic-test');
    });

    it('should create multiple test users', async () => {
      const users = await manager.createTestUsers(3, {
        role: 'user'
      });

      expect(users).toHaveLength(3);
      users.forEach(user => {
        expect(user.role).toBe('user');
        expect(user.isolation_id).toBe('basic-test');
      });
    });

    it('should create test analysis results', async () => {
      const user = await manager.createTestUser();
      const results = await manager.createTestAnalysisResults(user.id, 2);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.user_id).toBe(user.id);
        expect(result.isolation_id).toBe('basic-test');
        expect(result.accuracy).toBeGreaterThan(0);
        expect(result.accuracy).toBeLessThanOrEqual(100);
      });
    });

    it('should create complete test scenario', async () => {
      const scenario = await manager.createTestScenario({
        userCount: 2,
        analysisPerUser: 3
      });

      expect(scenario.users).toHaveLength(2);
      expect(scenario.analysisResults).toHaveLength(6); // 2 users * 3 analyses each

      scenario.users.forEach(user => {
        expect(user.isolation_id).toBe('basic-test');
      });

      scenario.analysisResults.forEach(result => {
        expect(result.isolation_id).toBe('basic-test');
        expect(scenario.users.some(u => u.id === result.user_id)).toBeTruthy();
      });
    });
  });

  describe('Test Data Isolation', () => {
    it('should isolate data between different managers', async () => {
      const manager1 = new TestDataManager({ isolationId: 'isolation-1' });
      const manager2 = new TestDataManager({ isolationId: 'isolation-2' });

      try {
        // Verify isolation
        const isIsolated = await verifyDataIsolation(manager1, manager2);
        expect(isIsolated).toBeTruthy();

        // Create data in first manager
        const user1 = await manager1.createTestUser({ email: 'user1@test.com' });
        
        // Create data in second manager
        const user2 = await manager2.createTestUser({ email: 'user2@test.com' });

        // Verify data is isolated
        const users1 = await manager1.getIsolatedData('users');
        const users2 = await manager2.getIsolatedData('users');

        expect(users1.some((u: any) => u.id === user1.id)).toBeTruthy();
        expect(users1.some((u: any) => u.id === user2.id)).toBeFalsy();

        expect(users2.some((u: any) => u.id === user2.id)).toBeTruthy();
        expect(users2.some((u: any) => u.id === user1.id)).toBeFalsy();
      } finally {
        await manager1.cleanup();
        await manager2.cleanup();
      }
    });

    it('should use automatic isolation setup', async () => {
      const { getManager, getIsolationId } = setupTestDataIsolation({
        strategy: 'test',
        autoCleanup: true
      });

      // This would be called in beforeEach/afterEach automatically
      const manager = getManager();
      const isolationId = getIsolationId();

      expect(manager).toBeDefined();
      expect(isolationId).toBeDefined();
      expect(isolationId).toContain('test_');

      const user = await manager.createTestUser();
      expect(user.isolation_id).toBe(isolationId);
    });
  });

  describe('Test Data Factory Usage', () => {
    it('should use test data factory', async () => {
      const factory = getTestDataFactory();

      const user = await factory.createUser({
        email: 'factory@test.com'
      });

      expect(user.email).toBe('factory@test.com');

      const analysisResults = await factory.createAnalysisResults(user.id, 2);
      expect(analysisResults).toHaveLength(2);
      analysisResults.forEach(result => {
        expect(result.user_id).toBe(user.id);
      });
    });

    it('should create test scenario with factory', async () => {
      const factory = getTestDataFactory();

      const scenario = await factory.createScenario({
        userCount: 1,
        analysisPerUser: 5,
        userOverrides: { role: 'admin' },
        analysisOverrides: { risk_level: 'high' }
      });

      expect(scenario.users).toHaveLength(1);
      expect(scenario.users[0].role).toBe('admin');
      
      expect(scenario.analysisResults).toHaveLength(5);
      scenario.analysisResults.forEach(result => {
        expect(result.risk_level).toBe('high');
      });
    });
  });

  describe('Test Data Statistics and Reporting', () => {
    let manager: TestDataManager;

    beforeEach(() => {
      manager = new TestDataManager({
        isolationId: 'stats-test'
      });
    });

    afterEach(async () => {
      await manager.cleanup();
    });

    it('should provide data statistics', async () => {
      // Create some test data
      await manager.createTestUsers(3);
      const user = await manager.createTestUser();
      await manager.createTestAnalysisResults(user.id, 5);

      const stats = await manager.getDataStatistics();

      expect(stats.isolation_id).toBe('stats-test');
      expect(stats.tables.users.count).toBe(4); // 3 + 1 users
      expect(stats.tables.analysis_results.count).toBe(5);
    });

    it('should export and import test data', async () => {
      // Create test data
      const originalUser = await manager.createTestUser({
        email: 'export@test.com'
      });
      await manager.createTestAnalysisResults(originalUser.id, 2);

      // Export data
      const exportedData = await manager.exportTestData();

      expect(exportedData.isolation_id).toBe('stats-test');
      expect(exportedData.tables.users).toHaveLength(1);
      expect(exportedData.tables.analysis_results).toHaveLength(2);

      // Clean up and import
      await manager.cleanup();

      await manager.importTestData(exportedData);

      // Verify imported data
      const users = await manager.getIsolatedData('users');
      const results = await manager.getIsolatedData('analysis_results');

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('export@test.com');
      expect(results).toHaveLength(2);
    });
  });

  describe('Parallel Test Execution', () => {
    it('should handle parallel test data creation', async () => {
      const managers = Array.from({ length: 3 }, (_, i) => 
        new TestDataManager({ isolationId: `parallel-${i}` })
      );

      try {
        // Create data in parallel
        const promises = managers.map(async (manager, i) => {
          const user = await manager.createTestUser({
            email: `parallel-${i}@test.com`
          });
          return { manager, user };
        });

        const results = await Promise.all(promises);

        // Verify each manager has its own data
        for (let i = 0; i < results.length; i++) {
          const { manager, user } = results[i];
          const users = await manager.getIsolatedData('users');
          
          expect(users).toHaveLength(1);
          expect(users[0].id).toBe(user.id);
          expect(users[0].email).toBe(`parallel-${i}@test.com`);
        }

        // Verify isolation between managers
        for (let i = 0; i < managers.length; i++) {
          for (let j = i + 1; j < managers.length; j++) {
            const isIsolated = await verifyDataIsolation(managers[i], managers[j]);
            expect(isIsolated).toBeTruthy();
          }
        }
      } finally {
        // Clean up all managers
        await Promise.all(managers.map(m => m.cleanup()));
      }
    });
  });
});