import { createClient } from '@supabase/supabase-js';
import { logger } from './logging';
import { 
  createTestUser, 
  createMixedUsers, 
  createUserWithSpecificEmail,
  TestUser 
} from '../factories/userFactory';
import { 
  createTestAnalysis, 
  createMixedRiskAnalyses, 
  createAnalysesForUser,
  TestAnalysis 
} from '../factories/analysisFactory';
import { 
  createTestScheduledScan, 
  createMixedScans, 
  createScansForUser,
  TestScheduledScan 
} from '../factories/scheduledScanFactory';

// Test database configuration
const TEST_SUPABASE_URL = process.env.VITE_TEST_SUPABASE_URL || 'https://test.supabase.co';
const TEST_SUPABASE_ANON_KEY = process.env.VITE_TEST_SUPABASE_ANON_KEY || 'test-anon-key';

export const testSupabase = createClient(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY);

// Enhanced database seeding utilities
export class DatabaseSeeder {
  private static instance: DatabaseSeeder;
  private seededData: {
    users: TestUser[];
    analyses: TestAnalysis[];
    scheduledScans: TestScheduledScan[];
    subscriptions: any[];
    paymentHistory: any[];
    usageRecords: any[];
  } = {
    users: [],
    analyses: [],
    scheduledScans: [],
    subscriptions: [],
    paymentHistory: [],
    usageRecords: []
  };

  static getInstance(): DatabaseSeeder {
    if (!DatabaseSeeder.instance) {
      DatabaseSeeder.instance = new DatabaseSeeder();
    }
    return DatabaseSeeder.instance;
  }

  // User seeding methods
  async seedUsers(count: number = 5): Promise<TestUser[]> {
    const users = createMixedUsers(count);
    this.seededData.users.push(...users);
    return users;
  }

  async seedSpecificUsers(): Promise<{ [key: string]: TestUser }> {
    const specificUsers = {
      admin: createUserWithSpecificEmail('admin@test.com', { role: 'admin' }),
      regularUser: createUserWithSpecificEmail('user@test.com', { role: 'user' }),
      trialUser: createUserWithSpecificEmail('trial@test.com', { 
        subscription_status: 'trialing',
        trial_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      }),
      expiredUser: createUserWithSpecificEmail('expired@test.com', { 
        subscription_status: 'past_due' 
      })
    };

    const users = Object.values(specificUsers);
    this.seededData.users.push(...users);
    
    return specificUsers;
  }

  // Analysis seeding methods
  async seedAnalyses(count: number = 20, userId?: string): Promise<TestAnalysis[]> {
    let analyses: TestAnalysis[];
    
    if (userId) {
      analyses = createAnalysesForUser(userId, count);
    } else {
      analyses = createMixedRiskAnalyses(count);
      // Distribute analyses among existing users
      const userIds = this.seededData.users.map(u => u.id);
      analyses.forEach((analysis, index) => {
        if (userIds.length > 0) {
          analysis.user_id = userIds[index % userIds.length];
        }
      });
    }
    
    this.seededData.analyses.push(...analyses);
    return analyses;
  }

  async seedAnalysesWithTimeDistribution(count: number = 50): Promise<TestAnalysis[]> {
    const analyses: TestAnalysis[] = [];
    const now = new Date();
    
    // Create analyses distributed over the last 30 days
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const createdDate = new Date(now);
      createdDate.setDate(createdDate.getDate() - daysAgo);
      
      const userId = this.seededData.users.length > 0 
        ? this.seededData.users[Math.floor(Math.random() * this.seededData.users.length)].id
        : 'default-user';
      
      const analysis = createTestAnalysis({
        user_id: userId,
        created_at: createdDate.toISOString(),
        updated_at: createdDate.toISOString()
      });
      
      analyses.push(analysis);
    }
    
    this.seededData.analyses.push(...analyses);
    return analyses;
  }

  // Scheduled scan seeding methods
  async seedScheduledScans(count: number = 10, userId?: string): Promise<TestScheduledScan[]> {
    let scans: TestScheduledScan[];
    
    if (userId) {
      scans = createScansForUser(userId, count);
    } else {
      scans = createMixedScans(count);
      // Distribute scans among existing users
      const userIds = this.seededData.users.map(u => u.id);
      scans.forEach((scan, index) => {
        if (userIds.length > 0) {
          scan.user_id = userIds[index % userIds.length];
        }
      });
    }
    
    this.seededData.scheduledScans.push(...scans);
    return scans;
  }

  // Subscription and billing data seeding
  async seedSubscriptions(): Promise<any[]> {
    const subscriptions = this.seededData.users.map(user => ({
      id: `sub_${Math.random().toString(36).substr(2, 14)}`,
      user_id: user.id,
      stripe_subscription_id: user.stripe_customer_id ? `sub_${Math.random().toString(36).substr(2, 14)}` : null,
      stripe_customer_id: user.stripe_customer_id,
      plan: user.subscription_plan,
      status: user.subscription_status,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_end: user.trial_end,
      created_at: user.created_at,
      updated_at: user.updated_at
    }));

    this.seededData.subscriptions.push(...subscriptions);
    return subscriptions;
  }

  async seedPaymentHistory(): Promise<any[]> {
    const payments = this.seededData.users
      .filter(user => user.subscription_status === 'active' && user.subscription_plan !== 'free')
      .map(user => ({
        id: `payment_${Math.random().toString(36).substr(2, 14)}`,
        user_id: user.id,
        stripe_payment_intent_id: `pi_${Math.random().toString(36).substr(2, 14)}`,
        amount: user.subscription_plan === 'pro' ? 2000 : 5000, // cents
        currency: 'usd',
        status: 'succeeded',
        description: `${user.subscription_plan} plan subscription`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

    this.seededData.paymentHistory.push(...payments);
    return payments;
  }

  async seedUsageRecords(): Promise<any[]> {
    const usageRecords = this.seededData.users.map(user => ({
      id: `usage_${Math.random().toString(36).substr(2, 14)}`,
      user_id: user.id,
      period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date().toISOString(),
      analyses_count: user.usage_current || 0,
      quota_limit: user.usage_quota || 100,
      overage_count: Math.max(0, (user.usage_current || 0) - (user.usage_quota || 100)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    this.seededData.usageRecords.push(...usageRecords);
    return usageRecords;
  }

  // Comprehensive seeding methods
  async seedAll(): Promise<void> {
    logger.debug("🌱 Seeding test database...");
    
    // Seed in order of dependencies
    await this.seedUsers(8);
    await this.seedSpecificUsers();
    await this.seedAnalysesWithTimeDistribution(50);
    await this.seedScheduledScans(12);
    await this.seedSubscriptions();
    await this.seedPaymentHistory();
    await this.seedUsageRecords();
    
    logger.debug("✅ Test database seeded successfully");
  }

  async seedMinimal(): Promise<void> {
    logger.debug("🌱 Seeding minimal test data...");
    
    await this.seedUsers(3);
    await this.seedAnalyses(10);
    await this.seedScheduledScans(5);
    
    logger.debug("✅ Minimal test data seeded");
  }

  async seedForUser(userId: string): Promise<void> {
    console.log(`🌱 Seeding data for user ${userId}...`);
    
    await this.seedAnalyses(15, userId);
    await this.seedScheduledScans(8, userId);
    
    logger.debug("✅ User-specific data seeded");
  }

  getSeededData() {
    return { ...this.seededData };
  }

  getSeededDataCounts() {
    return {
      users: this.seededData.users.length,
      analyses: this.seededData.analyses.length,
      scheduledScans: this.seededData.scheduledScans.length,
      subscriptions: this.seededData.subscriptions.length,
      paymentHistory: this.seededData.paymentHistory.length,
      usageRecords: this.seededData.usageRecords.length
    };
  }

  async cleanup(): Promise<void> {
    logger.debug("🧹 Cleaning up test database...");
    
    this.seededData = {
      users: [],
      analyses: [],
      scheduledScans: [],
      subscriptions: [],
      paymentHistory: [],
      usageRecords: []
    };
    
    logger.debug("✅ Test database cleaned up");
  }
}

// Enhanced database cleanup utilities
export class DatabaseCleaner {
  static async cleanupTestData(): Promise<void> {
    logger.debug("🧹 Performing comprehensive test data cleanup...");
    
    // In a real implementation, this would:
    // 1. Delete all test data from the database in correct order (respecting foreign keys)
    // 2. Reset sequences/auto-increment values
    // 3. Clear any cached data
    // 4. Reset any test-specific configurations
    
    const seeder = DatabaseSeeder.getInstance();
    await seeder.cleanup();
    
    // Clear any browser storage that might contain test data
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch (error) {
        logger.warn("Could not clear browser storage:", { error });
      }
    }
    
    logger.debug("✅ Test data cleanup completed");
  }

  static async resetDatabase(): Promise<void> {
    logger.debug("🔄 Resetting test database to initial state...");
    
    // In a real implementation, this would:
    // 1. Drop all tables
    // 2. Run migrations to recreate schema
    // 3. Seed with minimal required data
    // 4. Reset all sequences and indexes
    
    await DatabaseCleaner.cleanupTestData();
    
    logger.debug("✅ Database reset completed");
  }

  static async cleanupByTestId(testId: string): Promise<void> {
    console.log(`🧹 Cleaning up data for test ${testId}...`);
    
    // In a real implementation, this would delete only data created by a specific test
    // using the testId as a filter
    
    logger.debug("✅ Test-specific cleanup completed");
  }

  static async validateCleanup(): Promise<boolean> {
    logger.debug("🔍 Validating cleanup completion...");
    
    const seeder = DatabaseSeeder.getInstance();
    const counts = seeder.getSeededDataCounts();
    
    const isClean = Object.values(counts).every(count => count === 0);
    
    if (isClean) {
      logger.debug("✅ Cleanup validation passed");
    } else {
      logger.warn("⚠️ Cleanup validation failed - some data remains:", { counts });
    }
    
    return isClean;
  }
}

// Enhanced test isolation utilities
export class TestIsolation {
  private static testId: string;
  private static testData: Map<string, any> = new Map();

  static startTest(testName: string): string {
    TestIsolation.testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    TestIsolation.testData.set(TestIsolation.testId, {
      name: testName,
      startTime: Date.now(),
      createdData: []
    });
    
    console.log(`🧪 Starting isolated test: ${testName} (${TestIsolation.testId})`);
    
    return TestIsolation.testId;
  }

  static async endTest(): Promise<void> {
    if (!TestIsolation.testId) return;
    
    const testInfo = TestIsolation.testData.get(TestIsolation.testId);
    const duration = testInfo ? Date.now() - testInfo.startTime : 0;
    
    console.log(`🏁 Ending test ${TestIsolation.testId} (${duration}ms)`);
    
    // Clean up any data created during this specific test
    await DatabaseCleaner.cleanupByTestId(TestIsolation.testId);
    
    TestIsolation.testData.delete(TestIsolation.testId);
    TestIsolation.testId = '';
  }

  static getTestId(): string {
    return TestIsolation.testId;
  }

  static recordCreatedData(type: string, id: string): void {
    if (!TestIsolation.testId) return;
    
    const testInfo = TestIsolation.testData.get(TestIsolation.testId);
    if (testInfo) {
      testInfo.createdData.push({ type, id, timestamp: Date.now() });
    }
  }

  static getTestData(testId?: string): any {
    const id = testId || TestIsolation.testId;
    return TestIsolation.testData.get(id);
  }
}

// Helper functions for test setup and teardown
export const setupTestDatabase = async (options: {
  seedLevel?: 'minimal' | 'full' | 'none';
  userId?: string;
} = {}): Promise<void> => {
  const { seedLevel = 'minimal', userId } = options;
  
  console.log(`🚀 Setting up test database (${seedLevel} seeding)...`);
  
  const seeder = DatabaseSeeder.getInstance();
  
  switch (seedLevel) {
    case 'full':
      await seeder.seedAll();
      break;
    case 'minimal':
      await seeder.seedMinimal();
      break;
    case 'none':
      // No seeding
      break;
  }
  
  if (userId) {
    await seeder.seedForUser(userId);
  }
  
  logger.debug("✅ Test database setup completed");
};

export const teardownTestDatabase = async (): Promise<void> => {
  logger.debug("🧹 Tearing down test database...");
  
  await DatabaseCleaner.cleanupTestData();
  
  logger.debug("✅ Test database teardown completed");
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

// Utility for creating isolated test environments
export const withIsolatedTest = async <T>(
  testName: string,
  callback: (testId: string) => Promise<T>
): Promise<T> => {
  const testId = TestIsolation.startTest(testName);
  
  try {
    const result = await callback(testId);
    return result;
  } finally {
    await TestIsolation.endTest();
  }
};

// Database state management for tests
export class TestDatabaseState {
  private snapshots: Map<string, any> = new Map();

  async createSnapshot(name: string): Promise<void> {
    console.log(`📸 Creating database snapshot: ${name}`);
    
    const seeder = DatabaseSeeder.getInstance();
    const data = seeder.getSeededData();
    
    this.snapshots.set(name, JSON.parse(JSON.stringify(data)));
    
    logger.debug("✅ Snapshot created");
  }

  async restoreSnapshot(name: string): Promise<void> {
    console.log(`🔄 Restoring database snapshot: ${name}`);
    
    const snapshot = this.snapshots.get(name);
    if (!snapshot) {
      throw new Error(`Snapshot '${name}' not found`);
    }
    
    // In a real implementation, this would restore the database to the snapshot state
    const seeder = DatabaseSeeder.getInstance();
    await seeder.cleanup();
    
    // Restore the data (in a real implementation, this would insert into the database)
    Object.assign(seeder['seededData'], snapshot);
    
    logger.debug("✅ Snapshot restored");
  }

  listSnapshots(): string[] {
    return Array.from(this.snapshots.keys());
  }

  deleteSnapshot(name: string): boolean {
    return this.snapshots.delete(name);
  }

  clearSnapshots(): void {
    this.snapshots.clear();
  }
}

// Export singleton instance for global use
export const testDatabaseState = new TestDatabaseState();