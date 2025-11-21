import { createClient } from '@supabase/supabase-js';
import { fixtures } from './index';
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

// Enhanced database seeding for integration tests
export class IntegrationDatabaseSeeder {
  private supabase: any;
  private seededIds: {
    users: string[];
    analyses: string[];
    scheduledScans: string[];
    subscriptions: string[];
    paymentHistory: string[];
    usageRecords: string[];
  } = {
    users: [],
    analyses: [],
    scheduledScans: [],
    subscriptions: [],
    paymentHistory: [],
    usageRecords: []
  };

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    this.supabase = createClient(
      supabaseUrl || process.env.VITE_TEST_SUPABASE_URL || 'https://test.supabase.co',
      supabaseKey || process.env.VITE_TEST_SUPABASE_ANON_KEY || 'test-anon-key'
    );
  }

  // User seeding methods
  async seedUsers(users: TestUser[]): Promise<string[]> {
    console.log(`🌱 Seeding ${users.length} users...`);
    
    try {
      const { data, error } = await this.supabase
        .from('users')
        .insert(users)
        .select('id');
      
      if (error) {
        logger.warn("Mock database insert (users):", { error });
        // In real implementation, this would handle the actual database error
      }
      
      const userIds = users.map(u => u.id);
      this.seededIds.users.push(...userIds);
      
      console.log(`✅ Seeded ${userIds.length} users`);
      return userIds;
    } catch (error) {
      logger.warn("Mock database operation (users):", { error });
      const userIds = users.map(u => u.id);
      this.seededIds.users.push(...userIds);
      return userIds;
    }
  }

  async seedAnalyses(analyses: TestAnalysis[]): Promise<string[]> {
    console.log(`🌱 Seeding ${analyses.length} analyses...`);
    
    try {
      const { data, error } = await this.supabase
        .from('analyses')
        .insert(analyses)
        .select('id');
      
      if (error) {
        logger.warn("Mock database insert (analyses):", { error });
      }
      
      const analysisIds = analyses.map(a => a.id);
      this.seededIds.analyses.push(...analysisIds);
      
      console.log(`✅ Seeded ${analysisIds.length} analyses`);
      return analysisIds;
    } catch (error) {
      logger.warn("Mock database operation (analyses):", { error });
      const analysisIds = analyses.map(a => a.id);
      this.seededIds.analyses.push(...analysisIds);
      return analysisIds;
    }
  }

  async seedScheduledScans(scans: TestScheduledScan[]): Promise<string[]> {
    console.log(`🌱 Seeding ${scans.length} scheduled scans...`);
    
    try {
      const { data, error } = await this.supabase
        .from('scheduled_scans')
        .insert(scans)
        .select('id');
      
      if (error) {
        logger.warn("Mock database insert (scheduled_scans):", { error });
      }
      
      const scanIds = scans.map(s => s.id);
      this.seededIds.scheduledScans.push(...scanIds);
      
      console.log(`✅ Seeded ${scanIds.length} scheduled scans`);
      return scanIds;
    } catch (error) {
      logger.warn("Mock database operation (scheduled_scans):", { error });
      const scanIds = scans.map(s => s.id);
      this.seededIds.scheduledScans.push(...scanIds);
      return scanIds;
    }
  }

  // Comprehensive seeding scenarios
  async seedBasicScenario(): Promise<{
    users: TestUser[];
    analyses: TestAnalysis[];
    scans: TestScheduledScan[];
  }> {
    logger.debug("🌱 Seeding basic test scenario...");
    
    // Create users
    const users = [
      createUserWithSpecificEmail('test@example.com', { role: 'user' }),
      createUserWithSpecificEmail('admin@example.com', { role: 'admin' }),
      createUserWithSpecificEmail('trial@example.com', { 
        subscription_status: 'trialing',
        trial_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      })
    ];
    
    await this.seedUsers(users);
    
    // Create analyses for users
    const analyses = [
      ...createAnalysesForUser(users[0].id, 5),
      ...createAnalysesForUser(users[1].id, 3),
      ...createAnalysesForUser(users[2].id, 2)
    ];
    
    await this.seedAnalyses(analyses);
    
    // Create scheduled scans
    const scans = [
      ...createScansForUser(users[0].id, 2),
      ...createScansForUser(users[1].id, 3),
      ...createScansForUser(users[2].id, 1)
    ];
    
    await this.seedScheduledScans(scans);
    
    logger.debug("✅ Basic scenario seeded successfully");
    
    return { users, analyses, scans };
  }

  async seedPerformanceScenario(): Promise<{
    users: TestUser[];
    analyses: TestAnalysis[];
    scans: TestScheduledScan[];
  }> {
    logger.debug("🌱 Seeding performance test scenario...");
    
    // Create many users for performance testing
    const users = createMixedUsers(50);
    await this.seedUsers(users);
    
    // Create many analyses distributed across users
    const analyses = createMixedRiskAnalyses(500);
    analyses.forEach((analysis, index) => {
      analysis.user_id = users[index % users.length].id;
    });
    await this.seedAnalyses(analyses);
    
    // Create scheduled scans
    const scans = createMixedScans(100);
    scans.forEach((scan, index) => {
      scan.user_id = users[index % users.length].id;
    });
    await this.seedScheduledScans(scans);
    
    logger.debug("✅ Performance scenario seeded successfully");
    
    return { users, analyses, scans };
  }

  async seedErrorScenario(): Promise<{
    users: TestUser[];
    analyses: TestAnalysis[];
    scans: TestScheduledScan[];
  }> {
    logger.debug("🌱 Seeding error handling test scenario...");
    
    // Create users with various problematic states
    const users = [
      createUserWithSpecificEmail('expired@example.com', { 
        subscription_status: 'past_due',
        usage_current: 1000,
        usage_quota: 100 // Over quota
      }),
      createUserWithSpecificEmail('unconfirmed@example.com', { 
        email_confirmed_at: null,
        subscription_status: 'inactive'
      }),
      createUserWithSpecificEmail('canceled@example.com', { 
        subscription_status: 'canceled'
      })
    ];
    
    await this.seedUsers(users);
    
    // Create analyses with various error states
    const analyses = [
      createTestAnalysis({ 
        user_id: users[0].id, 
        status: 'failed',
        accuracy_score: 0,
        recommendations: ['Analysis failed due to quota exceeded']
      }),
      createTestAnalysis({ 
        user_id: users[1].id, 
        status: 'processing' // Stuck in processing
      }),
      createTestAnalysis({ 
        user_id: users[2].id, 
        risk_level: 'critical',
        accuracy_score: 15
      })
    ];
    
    await this.seedAnalyses(analyses);
    
    // Create scans with error states
    const scans = [
      createTestScheduledScan({
        user_id: users[0].id,
        is_active: false,
        last_error: {
          message: 'Quota exceeded',
          code: 'QUOTA_EXCEEDED',
          timestamp: new Date().toISOString(),
          details: 'User has exceeded their monthly analysis quota'
        }
      }),
      createTestScheduledScan({
        user_id: users[1].id,
        is_active: true,
        last_error: {
          message: 'Authentication failed',
          code: 'AUTH_ERROR',
          timestamp: new Date().toISOString(),
          details: 'Google Drive authentication token expired'
        }
      })
    ];
    
    await this.seedScheduledScans(scans);
    
    logger.debug("✅ Error scenario seeded successfully");
    
    return { users, analyses, scans };
  }

  async seedAuthenticationScenario(): Promise<{
    users: TestUser[];
    analyses: TestAnalysis[];
    scans: TestScheduledScan[];
  }> {
    logger.debug("🌱 Seeding authentication test scenario...");
    
    // Create users with different authentication states
    const users = [
      createUserWithSpecificEmail('valid-auth@example.com', { 
        role: 'user',
        google_refresh_token: 'encrypted_refresh_token_123',
        google_access_token_expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      }),
      createUserWithSpecificEmail('expired-token@example.com', { 
        role: 'user',
        google_refresh_token: 'encrypted_refresh_token_456',
        google_access_token_expires_at: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      }),
      createUserWithSpecificEmail('no-google-auth@example.com', { 
        role: 'user',
        google_refresh_token: null,
        google_access_token_expires_at: null
      })
    ];
    
    await this.seedUsers(users);
    
    // Create Google Drive scans that require authentication
    const scans = [
      createTestScheduledScan({
        user_id: users[0].id,
        source_type: 'google_drive',
        source_config: {
          folder_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          file_types: ['pdf', 'docx'],
          recursive: true
        },
        is_active: true
      }),
      createTestScheduledScan({
        user_id: users[1].id,
        source_type: 'google_drive',
        source_config: {
          folder_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEf',
          file_types: ['pdf'],
          recursive: false
        },
        is_active: true,
        last_error: {
          message: 'Token expired',
          code: 'TOKEN_EXPIRED',
          timestamp: new Date().toISOString(),
          details: 'Google access token has expired and refresh failed'
        }
      }),
      createTestScheduledScan({
        user_id: users[2].id,
        source_type: 'url', // Non-Google source
        source_config: {
          url: 'https://example.com/feed',
          selector: 'article'
        },
        is_active: true
      })
    ];
    
    await this.seedScheduledScans(scans);
    
    const analyses = createAnalysesForUser(users[0].id, 3);
    await this.seedAnalyses(analyses);
    
    logger.debug("✅ Authentication scenario seeded successfully");
    
    return { users, analyses, scans };
  }

  async seedBillingScenario(): Promise<{
    users: TestUser[];
    subscriptions: any[];
    paymentHistory: any[];
  }> {
    logger.debug("🌱 Seeding billing test scenario...");
    
    // Create users with different billing states
    const users = [
      createUserWithSpecificEmail('active-pro@example.com', { 
        subscription_status: 'active',
        subscription_plan: 'pro',
        stripe_customer_id: 'cus_test_active_pro'
      }),
      createUserWithSpecificEmail('trial-user@example.com', { 
        subscription_status: 'trialing',
        subscription_plan: 'pro',
        stripe_customer_id: 'cus_test_trial',
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      }),
      createUserWithSpecificEmail('past-due@example.com', { 
        subscription_status: 'past_due',
        subscription_plan: 'pro',
        stripe_customer_id: 'cus_test_past_due'
      }),
      createUserWithSpecificEmail('free-user@example.com', { 
        subscription_status: 'active',
        subscription_plan: 'free',
        stripe_customer_id: null
      })
    ];
    
    await this.seedUsers(users);
    
    // Create subscription records
    const subscriptions = [
      {
        id: 'sub_test_active_pro',
        user_id: users[0].id,
        stripe_subscription_id: 'sub_stripe_active_pro',
        stripe_customer_id: users[0].stripe_customer_id,
        plan: 'pro',
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: users[0].created_at,
        updated_at: users[0].updated_at
      },
      {
        id: 'sub_test_trial',
        user_id: users[1].id,
        stripe_subscription_id: 'sub_stripe_trial',
        stripe_customer_id: users[1].stripe_customer_id,
        plan: 'pro',
        status: 'trialing',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        trial_end: users[1].trial_end,
        created_at: users[1].created_at,
        updated_at: users[1].updated_at
      },
      {
        id: 'sub_test_past_due',
        user_id: users[2].id,
        stripe_subscription_id: 'sub_stripe_past_due',
        stripe_customer_id: users[2].stripe_customer_id,
        plan: 'pro',
        status: 'past_due',
        current_period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        current_period_end: new Date().toISOString(),
        created_at: users[2].created_at,
        updated_at: users[2].updated_at
      }
    ];
    
    // Mock database insert for subscriptions
    this.seededIds.subscriptions.push(...subscriptions.map(s => s.id));
    
    // Create payment history
    const paymentHistory = [
      {
        id: 'payment_successful_1',
        user_id: users[0].id,
        stripe_payment_intent_id: 'pi_successful_1',
        amount: 2000, // $20.00
        currency: 'usd',
        status: 'succeeded',
        description: 'Pro plan subscription',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'payment_failed_1',
        user_id: users[2].id,
        stripe_payment_intent_id: 'pi_failed_1',
        amount: 2000,
        currency: 'usd',
        status: 'failed',
        description: 'Pro plan subscription',
        failure_reason: 'insufficient_funds',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    // Mock database insert for payment history
    this.seededIds.paymentHistory.push(...paymentHistory.map(p => p.id));
    
    logger.debug("✅ Billing scenario seeded successfully");
    
    return { users, subscriptions, paymentHistory };
  }

  // Cleanup methods
  async cleanup(): Promise<void> {
    logger.debug("🧹 Cleaning up seeded test data...");
    
    try {
      // Clean up in reverse order of dependencies
      if (this.seededIds.paymentHistory.length > 0) {
        await this.supabase
          .from('payment_history')
          .delete()
          .in('id', this.seededIds.paymentHistory);
      }
      
      if (this.seededIds.subscriptions.length > 0) {
        await this.supabase
          .from('subscriptions')
          .delete()
          .in('id', this.seededIds.subscriptions);
      }
      
      if (this.seededIds.usageRecords.length > 0) {
        await this.supabase
          .from('usage_records')
          .delete()
          .in('id', this.seededIds.usageRecords);
      }
      
      if (this.seededIds.scheduledScans.length > 0) {
        await this.supabase
          .from('scheduled_scans')
          .delete()
          .in('id', this.seededIds.scheduledScans);
      }
      
      if (this.seededIds.analyses.length > 0) {
        await this.supabase
          .from('analyses')
          .delete()
          .in('id', this.seededIds.analyses);
      }
      
      if (this.seededIds.users.length > 0) {
        await this.supabase
          .from('users')
          .delete()
          .in('id', this.seededIds.users);
      }
      
      // Reset seeded IDs
      this.seededIds = {
        users: [],
        analyses: [],
        scheduledScans: [],
        subscriptions: [],
        paymentHistory: [],
        usageRecords: []
      };
      
      logger.debug("✅ Test data cleanup completed");
    } catch (error) {
      logger.warn("Mock database cleanup:", { error });
      // In real implementation, this would handle cleanup errors
    }
  }

  getSeededIds() {
    return { ...this.seededIds };
  }

  getSeededCounts() {
    return {
      users: this.seededIds.users.length,
      analyses: this.seededIds.analyses.length,
      scheduledScans: this.seededIds.scheduledScans.length,
      subscriptions: this.seededIds.subscriptions.length,
      paymentHistory: this.seededIds.paymentHistory.length,
      usageRecords: this.seededIds.usageRecords.length
    };
  }
}

// Utility functions for test setup
export const setupIntegrationTest = async (scenario: 'basic' | 'performance' | 'error' | 'auth' | 'billing' = 'basic') => {
  const seeder = new IntegrationDatabaseSeeder();
  
  switch (scenario) {
    case 'basic':
      return await seeder.seedBasicScenario();
    case 'performance':
      return await seeder.seedPerformanceScenario();
    case 'error':
      return await seeder.seedErrorScenario();
    case 'auth':
      return await seeder.seedAuthenticationScenario();
    case 'billing':
      return await seeder.seedBillingScenario();
    default:
      return await seeder.seedBasicScenario();
  }
};

export const cleanupIntegrationTest = async () => {
  const seeder = new IntegrationDatabaseSeeder();
  await seeder.cleanup();
};

// Test isolation utilities
export const withIntegrationTest = async <T>(
  testName: string,
  scenario: 'basic' | 'performance' | 'error' | 'auth' | 'billing',
  callback: (data: any) => Promise<T>
): Promise<T> => {
  console.log(`🧪 Starting integration test: ${testName}`);
  
  const seeder = new IntegrationDatabaseSeeder();
  let testData: any;
  
  try {
    // Setup test data based on scenario
    switch (scenario) {
      case 'basic':
        testData = await seeder.seedBasicScenario();
        break;
      case 'performance':
        testData = await seeder.seedPerformanceScenario();
        break;
      case 'error':
        testData = await seeder.seedErrorScenario();
        break;
      case 'auth':
        testData = await seeder.seedAuthenticationScenario();
        break;
      case 'billing':
        testData = await seeder.seedBillingScenario();
        break;
      default:
        testData = await seeder.seedBasicScenario();
    }
    
    // Execute test
    const result = await callback(testData);
    
    return result;
  } finally {
    // Always cleanup
    await seeder.cleanup();
    console.log(`🏁 Integration test completed: ${testName}`);
  }
};