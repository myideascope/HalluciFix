import { faker } from '@faker-js/faker';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Test Data Manager for isolated test data management
 * Provides utilities for creating, managing, and cleaning up test data
 */

export interface TestDataOptions {
  isolationId?: string;
  cleanup?: boolean;
  seed?: number;
  version?: string;
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
  isolation_id: string;
}

export interface TestAnalysisResult {
  id: string;
  user_id: string;
  content: string;
  accuracy: number;
  risk_level: string;
  hallucinations: any[];
  processing_time: number;
  verification_sources: number;
  created_at: string;
  isolation_id: string;
}

export class TestDataManager {
  private supabase: SupabaseClient;
  private isolationId: string;
  private createdData: Map<string, string[]> = new Map();
  private version: string;

  constructor(options: TestDataOptions = {}) {
    this.isolationId = options.isolationId || this.generateIsolationId();
    this.version = options.version || '1.0.0';
    
    // Initialize Supabase client for test database
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'test-key';
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    
    // Set deterministic seed for reproducible test data
    if (options.seed) {
      faker.seed(options.seed);
    }
  }

  /**
   * Generate unique isolation ID for test run
   */
  private generateIsolationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `test_${timestamp}_${random}`;
  }

  /**
   * Get isolation ID for this test run
   */
  getIsolationId(): string {
    return this.isolationId;
  }

  /**
   * Create isolated test user
   */
  async createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
    const user: TestUser = {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      role: 'user',
      status: 'active',
      created_at: new Date().toISOString(),
      isolation_id: this.isolationId,
      ...overrides
    };

    const { data, error } = await this.supabase
      .from('users')
      .insert(user)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test user: ${error.message}`);
    }

    this.trackCreatedData('users', user.id);
    return data;
  }

  /**
   * Create multiple isolated test users
   */
  async createTestUsers(count: number, overrides: Partial<TestUser> = {}): Promise<TestUser[]> {
    const users: TestUser[] = [];
    
    for (let i = 0; i < count; i++) {
      const user = await this.createTestUser({
        ...overrides,
        email: `test-user-${i}-${this.isolationId}@example.com`
      });
      users.push(user);
    }
    
    return users;
  }

  /**
   * Create isolated test analysis result
   */
  async createTestAnalysisResult(
    userId: string, 
    overrides: Partial<TestAnalysisResult> = {}
  ): Promise<TestAnalysisResult> {
    const analysisResult: TestAnalysisResult = {
      id: faker.string.uuid(),
      user_id: userId,
      content: faker.lorem.paragraphs(2),
      accuracy: faker.number.float({ min: 60, max: 95, fractionDigits: 1 }),
      risk_level: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']),
      hallucinations: this.generateMockHallucinations(),
      processing_time: faker.number.int({ min: 500, max: 5000 }),
      verification_sources: faker.number.int({ min: 3, max: 15 }),
      created_at: new Date().toISOString(),
      isolation_id: this.isolationId,
      ...overrides
    };

    const { data, error } = await this.supabase
      .from('analysis_results')
      .insert(analysisResult)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test analysis result: ${error.message}`);
    }

    this.trackCreatedData('analysis_results', analysisResult.id);
    return data;
  }

  /**
   * Create multiple analysis results for a user
   */
  async createTestAnalysisResults(
    userId: string, 
    count: number, 
    overrides: Partial<TestAnalysisResult> = {}
  ): Promise<TestAnalysisResult[]> {
    const results: TestAnalysisResult[] = [];
    
    for (let i = 0; i < count; i++) {
      const result = await this.createTestAnalysisResult(userId, overrides);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Generate mock hallucinations for test data
   */
  private generateMockHallucinations(): any[] {
    const count = faker.number.int({ min: 0, max: 5 });
    const hallucinations = [];
    
    for (let i = 0; i < count; i++) {
      hallucinations.push({
        id: faker.string.uuid(),
        text: faker.lorem.sentence(),
        severity: faker.helpers.arrayElement(['low', 'medium', 'high']),
        confidence: faker.number.float({ min: 0.5, max: 1.0, fractionDigits: 2 }),
        category: faker.helpers.arrayElement(['factual', 'statistical', 'temporal', 'logical'])
      });
    }
    
    return hallucinations;
  }

  /**
   * Create complete test scenario with user and analysis results
   */
  async createTestScenario(options: {
    userCount?: number;
    analysisPerUser?: number;
    userOverrides?: Partial<TestUser>;
    analysisOverrides?: Partial<TestAnalysisResult>;
  } = {}): Promise<{
    users: TestUser[];
    analysisResults: TestAnalysisResult[];
  }> {
    const {
      userCount = 1,
      analysisPerUser = 3,
      userOverrides = {},
      analysisOverrides = {}
    } = options;

    const users = await this.createTestUsers(userCount, userOverrides);
    const analysisResults: TestAnalysisResult[] = [];

    for (const user of users) {
      const userAnalyses = await this.createTestAnalysisResults(
        user.id, 
        analysisPerUser, 
        analysisOverrides
      );
      analysisResults.push(...userAnalyses);
    }

    return { users, analysisResults };
  }

  /**
   * Track created data for cleanup
   */
  private trackCreatedData(table: string, id: string): void {
    if (!this.createdData.has(table)) {
      this.createdData.set(table, []);
    }
    this.createdData.get(table)!.push(id);
  }

  /**
   * Get all data created in this isolation
   */
  async getIsolatedData(table: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from(table)
      .select('*')
      .eq('isolation_id', this.isolationId);

    if (error) {
      throw new Error(`Failed to get isolated data from ${table}: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Clean up all data created in this isolation
   */
  async cleanup(): Promise<void> {
    console.log(`Cleaning up test data for isolation: ${this.isolationId}`);

    // Clean up in reverse dependency order
    const tables = ['analysis_results', 'user_tokens', 'oauth_states', 'users'];

    for (const table of tables) {
      try {
        const { error } = await this.supabase
          .from(table)
          .delete()
          .eq('isolation_id', this.isolationId);

        if (error) {
          console.warn(`Failed to cleanup ${table}:`, error.message);
        } else {
          const count = this.createdData.get(table)?.length || 0;
          if (count > 0) {
            console.log(`  Cleaned ${count} records from ${table}`);
          }
        }
      } catch (error) {
        console.warn(`Error cleaning up ${table}:`, error);
      }
    }

    this.createdData.clear();
  }

  /**
   * Clean up all test data (for global cleanup)
   */
  async cleanupAllTestData(): Promise<void> {
    console.log('Cleaning up all test data...');

    const tables = ['analysis_results', 'user_tokens', 'oauth_states', 'users'];

    for (const table of tables) {
      try {
        const { error } = await this.supabase
          .from(table)
          .delete()
          .like('isolation_id', 'test_%');

        if (error) {
          console.warn(`Failed to cleanup all test data from ${table}:`, error.message);
        }
      } catch (error) {
        console.warn(`Error cleaning up all test data from ${table}:`, error);
      }
    }
  }

  /**
   * Reset test data to a specific version/state
   */
  async resetToVersion(version: string): Promise<void> {
    console.log(`Resetting test data to version: ${version}`);

    // This would implement version-specific data reset
    // For now, we'll clean up and recreate basic data
    await this.cleanup();
    
    // Create version-specific baseline data
    if (version === 'baseline') {
      await this.createBaselineData();
    }
  }

  /**
   * Create baseline test data
   */
  private async createBaselineData(): Promise<void> {
    // Create standard test users
    const adminUser = await this.createTestUser({
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'admin'
    });

    const regularUser = await this.createTestUser({
      email: 'user@test.com',
      name: 'Test User',
      role: 'user'
    });

    // Create sample analysis results
    await this.createTestAnalysisResults(regularUser.id, 5);
    await this.createTestAnalysisResults(adminUser.id, 3);
  }

  /**
   * Export test data for backup/migration
   */
  async exportTestData(): Promise<any> {
    const data: any = {
      isolation_id: this.isolationId,
      version: this.version,
      timestamp: new Date().toISOString(),
      tables: {}
    };

    const tables = ['users', 'analysis_results'];

    for (const table of tables) {
      data.tables[table] = await this.getIsolatedData(table);
    }

    return data;
  }

  /**
   * Import test data from backup
   */
  async importTestData(data: any): Promise<void> {
    console.log(`Importing test data for isolation: ${data.isolation_id}`);

    // Clean up existing data first
    await this.cleanup();

    // Import data for each table
    for (const [table, records] of Object.entries(data.tables)) {
      if (Array.isArray(records) && records.length > 0) {
        const { error } = await this.supabase
          .from(table)
          .insert(records);

        if (error) {
          throw new Error(`Failed to import data to ${table}: ${error.message}`);
        }

        console.log(`  Imported ${records.length} records to ${table}`);
      }
    }
  }

  /**
   * Get test data statistics
   */
  async getDataStatistics(): Promise<any> {
    const stats: any = {
      isolation_id: this.isolationId,
      tables: {}
    };

    const tables = ['users', 'analysis_results'];

    for (const table of tables) {
      const data = await this.getIsolatedData(table);
      stats.tables[table] = {
        count: data.length,
        created: this.createdData.get(table)?.length || 0
      };
    }

    return stats;
  }
}