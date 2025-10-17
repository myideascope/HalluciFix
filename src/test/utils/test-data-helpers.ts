import { TestDataManager, TestDataIsolation, IsolationConfig } from '../data';
import { beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

/**
 * Test data helper utilities for easy integration with test suites
 */

/**
 * Setup test data isolation for a test suite
 */
export function setupTestDataIsolation(config: IsolationConfig = { strategy: 'test', autoCleanup: true }) {
  let manager: TestDataManager;

  beforeEach(async () => {
    manager = TestDataIsolation.getManager(config);
  });

  afterEach(async () => {
    if (config.autoCleanup && manager) {
      await manager.cleanup();
    }
  });

  return {
    getManager: () => manager,
    getIsolationId: () => manager?.getIsolationId()
  };
}

/**
 * Setup shared test data for a test suite
 */
export function setupSharedTestData(namespace: string = 'shared') {
  let sharedManager: TestDataManager;

  beforeAll(async () => {
    sharedManager = await TestDataIsolation.createSharedData(namespace);
  });

  afterAll(async () => {
    await TestDataIsolation.cleanupSharedData(namespace);
  });

  return {
    getSharedManager: () => sharedManager
  };
}

/**
 * Create test user with automatic cleanup
 */
export async function createTestUser(
  manager: TestDataManager,
  overrides: any = {}
) {
  return await manager.createTestUser(overrides);
}

/**
 * Create test scenario with automatic cleanup
 */
export async function createTestScenario(
  manager: TestDataManager,
  options: any = {}
) {
  return await manager.createTestScenario(options);
}

/**
 * Decorator for test methods that need isolated data
 */
export function withIsolatedData(config: IsolationConfig = { strategy: 'test', autoCleanup: true }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const manager = TestDataIsolation.getManager(config);
      
      try {
        // Add manager to test context
        (this as any).testDataManager = manager;
        
        // Execute original test
        return await originalMethod.apply(this, args);
      } finally {
        if (config.autoCleanup) {
          await manager.cleanup();
        }
      }
    };

    return descriptor;
  };
}

/**
 * Helper to run tests with different data versions
 */
export function withDataVersions(versions: string[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    // Replace the test method with a version that runs for each data version
    descriptor.value = function (...args: any[]) {
      versions.forEach(version => {
        const testName = `${propertyKey} (data version: ${version})`;
        
        // This would need to be adapted based on your test framework
        // For Vitest, you might use test.each or similar
        test(testName, async () => {
          const manager = TestDataIsolation.getManager({
            strategy: 'test',
            autoCleanup: true
          });
          
          // Load specific data version
          // await dataVersioning.loadVersion(version, manager);
          
          // Add manager to test context
          (this as any).testDataManager = manager;
          (this as any).dataVersion = version;
          
          try {
            return await originalMethod.apply(this, args);
          } finally {
            await manager.cleanup();
          }
        });
      });
    };

    return descriptor;
  };
}

/**
 * Helper to create test data factories with isolation
 */
export class IsolatedTestDataFactory {
  private manager: TestDataManager;

  constructor(manager: TestDataManager) {
    this.manager = manager;
  }

  async createUser(overrides: any = {}) {
    return await this.manager.createTestUser(overrides);
  }

  async createUsers(count: number, overrides: any = {}) {
    return await this.manager.createTestUsers(count, overrides);
  }

  async createAnalysisResult(userId: string, overrides: any = {}) {
    return await this.manager.createTestAnalysisResult(userId, overrides);
  }

  async createAnalysisResults(userId: string, count: number, overrides: any = {}) {
    return await this.manager.createTestAnalysisResults(userId, count, overrides);
  }

  async createScenario(options: any = {}) {
    return await this.manager.createTestScenario(options);
  }
}

/**
 * Get isolated test data factory for current test
 */
export function getTestDataFactory(): IsolatedTestDataFactory {
  const manager = TestDataIsolation.getManager({
    strategy: 'test',
    autoCleanup: true
  });
  
  return new IsolatedTestDataFactory(manager);
}

/**
 * Utility to wait for test data operations to complete
 */
export async function waitForTestData(
  operation: () => Promise<any>,
  timeout: number = 5000
): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      return await operation();
    } catch (error) {
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  throw new Error(`Test data operation timed out after ${timeout}ms`);
}

/**
 * Helper to verify test data isolation
 */
export async function verifyDataIsolation(
  manager1: TestDataManager,
  manager2: TestDataManager
): Promise<boolean> {
  const id1 = manager1.getIsolationId();
  const id2 = manager2.getIsolationId();
  
  // Isolation IDs should be different
  if (id1 === id2) {
    return false;
  }
  
  // Create data in first manager
  const user1 = await manager1.createTestUser({ email: 'test1@example.com' });
  
  // Check that data is not visible in second manager
  const users2 = await manager2.getIsolatedData('users');
  const hasUser1 = users2.some((u: any) => u.id === user1.id);
  
  return !hasUser1;
}

/**
 * Helper to benchmark test data operations
 */
export async function benchmarkTestDataOperation<T>(
  operation: () => Promise<T>,
  name: string = 'operation'
): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await operation();
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  console.log(`Test data ${name} took ${duration.toFixed(2)}ms`);
  
  return { result, duration };
}

/**
 * Helper to create test data in batches for performance
 */
export async function createTestDataInBatches<T>(
  factory: () => Promise<T>,
  count: number,
  batchSize: number = 10
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < count; i += batchSize) {
    const batchCount = Math.min(batchSize, count - i);
    const batchPromises = Array.from({ length: batchCount }, () => factory());
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to avoid overwhelming the database
    if (i + batchSize < count) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  return results;
}