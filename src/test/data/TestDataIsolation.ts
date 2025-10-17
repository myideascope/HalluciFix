import { TestDataManager } from './TestDataManager';

/**
 * Test Data Isolation utilities for parallel test execution
 * Ensures test data doesn't interfere between parallel test runs
 */

export interface IsolationConfig {
  strategy: 'process' | 'worker' | 'test' | 'suite';
  autoCleanup: boolean;
  sharedData?: boolean;
  namespace?: string;
}

export class TestDataIsolation {
  private static instances: Map<string, TestDataManager> = new Map();
  private static globalCleanupHandlers: (() => Promise<void>)[] = [];

  /**
   * Get or create isolated test data manager for current context
   */
  static getManager(config: IsolationConfig = { strategy: 'test', autoCleanup: true }): TestDataManager {
    const isolationKey = this.generateIsolationKey(config);
    
    if (!this.instances.has(isolationKey)) {
      const manager = new TestDataManager({
        isolationId: isolationKey,
        cleanup: config.autoCleanup
      });
      
      this.instances.set(isolationKey, manager);
      
      // Register cleanup handler
      if (config.autoCleanup) {
        this.registerCleanupHandler(isolationKey, manager);
      }
    }
    
    return this.instances.get(isolationKey)!;
  }

  /**
   * Generate isolation key based on strategy
   */
  private static generateIsolationKey(config: IsolationConfig): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    switch (config.strategy) {
      case 'process':
        return `proc_${process.pid}_${timestamp}`;
      
      case 'worker':
        // In Vitest, we can use worker ID if available
        const workerId = (globalThis as any).__vitest_worker__?.id || 'main';
        return `worker_${workerId}_${timestamp}`;
      
      case 'suite':
        // Use test suite context if available
        const suiteId = this.getCurrentSuiteId();
        return `suite_${suiteId}_${timestamp}`;
      
      case 'test':
      default:
        return `test_${timestamp}_${random}`;
    }
  }

  /**
   * Get current test suite ID (implementation depends on test runner)
   */
  private static getCurrentSuiteId(): string {
    // This would be implemented based on your test runner
    // For Vitest, you might use expect.getState() or similar
    try {
      const state = (globalThis as any).__vitest_runner__?.state;
      return state?.currentSuite?.name || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Register cleanup handler for isolation
   */
  private static registerCleanupHandler(isolationKey: string, manager: TestDataManager): void {
    const cleanupHandler = async () => {
      try {
        await manager.cleanup();
        this.instances.delete(isolationKey);
      } catch (error) {
        console.warn(`Failed to cleanup isolation ${isolationKey}:`, error);
      }
    };

    this.globalCleanupHandlers.push(cleanupHandler);

    // Register process exit handlers
    if (typeof process !== 'undefined') {
      process.on('exit', () => {
        // Synchronous cleanup on exit
        console.log(`Process exit: cleaning up isolation ${isolationKey}`);
      });

      process.on('SIGINT', async () => {
        await cleanupHandler();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await cleanupHandler();
        process.exit(0);
      });
    }
  }

  /**
   * Clean up specific isolation
   */
  static async cleanupIsolation(isolationKey: string): Promise<void> {
    const manager = this.instances.get(isolationKey);
    if (manager) {
      await manager.cleanup();
      this.instances.delete(isolationKey);
    }
  }

  /**
   * Clean up all active isolations
   */
  static async cleanupAll(): Promise<void> {
    console.log('Cleaning up all test data isolations...');
    
    const cleanupPromises = Array.from(this.instances.entries()).map(
      async ([key, manager]) => {
        try {
          await manager.cleanup();
          console.log(`  Cleaned isolation: ${key}`);
        } catch (error) {
          console.warn(`  Failed to clean isolation ${key}:`, error);
        }
      }
    );

    await Promise.all(cleanupPromises);
    this.instances.clear();
    this.globalCleanupHandlers.length = 0;
  }

  /**
   * Get statistics for all active isolations
   */
  static async getIsolationStatistics(): Promise<any> {
    const stats: any = {
      activeIsolations: this.instances.size,
      isolations: {}
    };

    for (const [key, manager] of this.instances.entries()) {
      try {
        stats.isolations[key] = await manager.getDataStatistics();
      } catch (error) {
        stats.isolations[key] = { error: error.message };
      }
    }

    return stats;
  }

  /**
   * Create shared test data that can be used across isolations
   */
  static async createSharedData(namespace: string = 'shared'): Promise<TestDataManager> {
    const sharedKey = `shared_${namespace}`;
    
    if (!this.instances.has(sharedKey)) {
      const manager = new TestDataManager({
        isolationId: sharedKey,
        cleanup: false // Shared data is not auto-cleaned
      });
      
      this.instances.set(sharedKey, manager);
    }
    
    return this.instances.get(sharedKey)!;
  }

  /**
   * Clean up shared data
   */
  static async cleanupSharedData(namespace: string = 'shared'): Promise<void> {
    const sharedKey = `shared_${namespace}`;
    await this.cleanupIsolation(sharedKey);
  }
}

/**
 * Decorator for automatic test data isolation
 */
export function withTestDataIsolation(config: IsolationConfig = { strategy: 'test', autoCleanup: true }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const manager = TestDataIsolation.getManager(config);
      
      try {
        // Add manager to test context
        (this as any).testDataManager = manager;
        
        // Execute original test
        const result = await originalMethod.apply(this, args);
        
        return result;
      } finally {
        // Cleanup is handled by the isolation manager
        if (config.autoCleanup) {
          await manager.cleanup();
        }
      }
    };

    return descriptor;
  };
}

/**
 * Global setup for test data isolation
 */
export async function setupTestDataIsolation(): Promise<void> {
  console.log('Setting up test data isolation...');
  
  // Clean up any existing test data
  const globalManager = new TestDataManager();
  await globalManager.cleanupAllTestData();
  
  console.log('Test data isolation ready');
}

/**
 * Global teardown for test data isolation
 */
export async function teardownTestDataIsolation(): Promise<void> {
  console.log('Tearing down test data isolation...');
  
  // Clean up all active isolations
  await TestDataIsolation.cleanupAll();
  
  // Final cleanup of any remaining test data
  const globalManager = new TestDataManager();
  await globalManager.cleanupAllTestData();
  
  console.log('Test data isolation teardown complete');
}