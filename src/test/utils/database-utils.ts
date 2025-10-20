import { createClient } from '@supabase/supabase-js';
import { createTestUser, TestUser } from '../factories/userFactory';
import { createTestAnalysis, TestAnalysis } from '../factories/analysisFactory';
import { createTestScheduledScan, TestScheduledScan } from '../factories/scheduledScanFactory';

// Test database configuration
const TEST_SUPABASE_URL = process.env.VITE_TEST_SUPABASE_URL || 'https://test.supabase.co';
const TEST_SUPABASE_ANON_KEY = process.env.VITE_TEST_SUPABASE_ANON_KEY || 'test-anon-key';

export const testSupabase = createClient(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY);

// Database seeding utilities
export class DatabaseSeeder {
  private static instance: DatabaseSeeder;
  private seededData: {
    users: TestUser[];
    analyses: TestAnalysis[];
    scheduledScans: TestScheduledScan[];
  } = {
    users: [],
    analyses: [],
    scheduledScans: []
  };

  static getInstance(): DatabaseSeeder {
    if (!DatabaseSeeder.instance) {
      DatabaseSeeder.instance = new DatabaseSeeder();
    }
    return DatabaseSeeder.instance;
  }

  async seedUsers(count: number = 3): Promise<TestUser[]> {
    const users = Array.from({ length: count }, () => createTestUser());
    
    // In a real implementation, this would insert into the database
    // For now, we'll just store in memory for testing
    this.seededData.users.push(...users);
    
    return users;
  }

  async seedAnalyses(count: number = 5, userId?: string): Promise<TestAnalysis[]> {
    const analyses = Array.from({ length: count }, () => 
      createTestAnalysis({ user_id: userId || this.seededData.users[0]?.id })
    );
    
    this.seededData.analyses.push(...analyses);
    
    return analyses;
  }

  async seedScheduledScans(count: number = 3, userId?: string): Promise<TestScheduledScan[]> {
    const scans = Array.from({ length: count }, () => 
      createTestScheduledScan({ user_id: userId || this.seededData.users[0]?.id })
    );
    
    this.seededData.scheduledScans.push(...scans);
    
    return scans;
  }

  async seedAll(): Promise<void> {
    await this.seedUsers(3);
    await this.seedAnalyses(10);
    await this.seedScheduledScans(5);
  }

  getSeededData() {
    return { ...this.seededData };
  }

  async cleanup(): Promise<void> {
    // In a real implementation, this would clean up the test database
    // For now, we'll just clear the in-memory data
    this.seededData = {
      users: [],
      analyses: [],
      scheduledScans: []
    };
  }
}

// Database cleanup utilities
export class DatabaseCleaner {
  static async cleanupTestData(): Promise<void> {
    // In a real implementation, this would:
    // 1. Delete all test data from the database
    // 2. Reset sequences/auto-increment values
    // 3. Clear any cached data
    
    const seeder = DatabaseSeeder.getInstance();
    await seeder.cleanup();
  }

  static async resetDatabase(): Promise<void> {
    // In a real implementation, this would:
    // 1. Drop all tables
    // 2. Run migrations to recreate schema
    // 3. Seed with minimal required data
    
    await DatabaseCleaner.cleanupTestData();
  }
}

// Test isolation utilities
export class TestIsolation {
  private static testId: string;

  static startTest(testName: string): string {
    TestIsolation.testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return TestIsolation.testId;
  }

  static async endTest(): Promise<void> {
    // Clean up any data created during this specific test
    await DatabaseCleaner.cleanupTestData();
    TestIsolation.testId = '';
  }

  static getTestId(): string {
    return TestIsolation.testId;
  }
}

// Helper functions for test setup and teardown
export const setupTestDatabase = async (): Promise<void> => {
  const seeder = DatabaseSeeder.getInstance();
  await seeder.seedAll();
};

export const teardownTestDatabase = async (): Promise<void> => {
  await DatabaseCleaner.cleanupTestData();
};

// Transaction utilities for test isolation
export const withTestTransaction = async <T>(
  callback: () => Promise<T>
): Promise<T> => {
  // In a real implementation, this would:
  // 1. Start a database transaction
  // 2. Execute the callback
  // 3. Rollback the transaction (never commit in tests)
  
  const testId = TestIsolation.startTest('transaction-test');
  
  try {
    const result = await callback();
    return result;
  } finally {
    await TestIsolation.endTest();
  }
};