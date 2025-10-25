/**
 * Test Data Management Utilities for E2E Tests
 * Handles creation, management, and cleanup of test data
 */

import { testDatabase } from '../../src/test/utils/testDatabase';
import { createTestBillingScenario } from '../../src/test/factories/subscriptionFactory';

export interface TestAnalysis {
  id?: string;
  userId: string;
  title: string;
  content: string;
  results: {
    overallScore: number;
    riskLevel: string;
    confidenceScore: number;
    hallucinations: Array<{
      text: string;
      score: number;
      type: string;
    }>;
  };
  status: 'completed' | 'processing' | 'failed';
  createdAt?: Date;
}

export interface TestScheduledScan {
  id?: string;
  userId: string;
  name: string;
  schedule: string;
  sources: string[];
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export class TestDataManager {
  /**
   * Create test analysis records
   */
  async createTestAnalyses(userId: string, count: number = 5): Promise<TestAnalysis[]> {
    const analyses: TestAnalysis[] = [];
    
    for (let i = 0; i < count; i++) {
      const analysis: TestAnalysis = {
        userId,
        title: `Test Analysis ${i + 1}`,
        content: `This is test content for analysis ${i + 1}. It contains some sample text to analyze for hallucinations.`,
        results: {
          overallScore: Math.floor(Math.random() * 100),
          riskLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
          confidenceScore: Math.floor(Math.random() * 100),
          hallucinations: [
            {
              text: `Potential hallucination ${i + 1}`,
              score: Math.floor(Math.random() * 100),
              type: ['factual', 'logical', 'contextual'][Math.floor(Math.random() * 3)],
            },
          ],
        },
        status: ['completed', 'processing', 'failed'][Math.floor(Math.random() * 3)] as any,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
      };

      const { data, error } = await testDatabase.supabase
        .from('analyses')
        .insert({
          user_id: analysis.userId,
          title: analysis.title,
          content: analysis.content,
          results: analysis.results,
          status: analysis.status,
          created_at: analysis.createdAt,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create test analysis: ${error.message}`);
      }

      analysis.id = data.id;
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Create test scheduled scans
   */
  async createTestScheduledScans(userId: string, count: number = 3): Promise<TestScheduledScan[]> {
    const scans: TestScheduledScan[] = [];
    
    for (let i = 0; i < count; i++) {
      const scan: TestScheduledScan = {
        userId,
        name: `Test Scheduled Scan ${i + 1}`,
        schedule: ['daily', 'weekly', 'monthly'][i % 3],
        sources: [
          `https://example${i + 1}.com`,
          `https://test${i + 1}.com/api/content`,
        ],
        enabled: Math.random() > 0.3, // 70% enabled
        lastRun: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : undefined,
        nextRun: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      };

      const { data, error } = await testDatabase.supabase
        .from('scheduled_scans')
        .insert({
          user_id: scan.userId,
          name: scan.name,
          schedule: scan.schedule,
          sources: scan.sources,
          enabled: scan.enabled,
          last_run: scan.lastRun,
          next_run: scan.nextRun,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create test scheduled scan: ${error.message}`);
      }

      scan.id = data.id;
      scans.push(scan);
    }

    return scans;
  }

  /**
   * Create test usage records
   */
  async createTestUsageRecords(userId: string, days: number = 30): Promise<void> {
    const records = [];
    const now = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const usage = Math.floor(Math.random() * 100); // Random usage per day
      
      records.push({
        user_id: userId,
        usage_type: 'analysis',
        quantity: usage,
        timestamp: date,
        metadata: {
          source: 'test_data',
          day_of_week: date.getDay(),
        },
      });
    }

    const { error } = await testDatabase.supabase
      .from('usage_records')
      .insert(records);

    if (error) {
      throw new Error(`Failed to create test usage records: ${error.message}`);
    }
  }

  /**
   * Create test notifications
   */
  async createTestNotifications(userId: string, count: number = 5): Promise<void> {
    const notifications = [];
    
    for (let i = 0; i < count; i++) {
      notifications.push({
        user_id: userId,
        type: ['info', 'warning', 'error', 'success'][Math.floor(Math.random() * 4)],
        title: `Test Notification ${i + 1}`,
        message: `This is a test notification message ${i + 1}`,
        read: Math.random() > 0.5, // 50% read
        created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      });
    }

    const { error } = await testDatabase.supabase
      .from('notifications')
      .insert(notifications);

    if (error) {
      throw new Error(`Failed to create test notifications: ${error.message}`);
    }
  }

  /**
   * Create complete test scenario for a user
   */
  async createCompleteTestScenario(userId: string): Promise<{
    analyses: TestAnalysis[];
    scheduledScans: TestScheduledScan[];
    billingData?: any;
  }> {
    // Create analyses
    const analyses = await this.createTestAnalyses(userId, 10);
    
    // Create scheduled scans
    const scheduledScans = await this.createTestScheduledScans(userId, 5);
    
    // Create usage records
    await this.createTestUsageRecords(userId, 30);
    
    // Create notifications
    await this.createTestNotifications(userId, 8);
    
    // Create billing data (if user has subscription)
    let billingData;
    try {
      billingData = await createTestBillingScenario();
    } catch (error) {
      console.warn('Failed to create billing test data:', error);
    }

    return {
      analyses,
      scheduledScans,
      billingData,
    };
  }

  /**
   * Create test files for upload testing
   */
  async createTestFiles(): Promise<{ [key: string]: string }> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const testFilesDir = path.join(__dirname, '../test-files');
    
    // Ensure directory exists
    try {
      await fs.mkdir(testFilesDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const files: { [key: string]: string } = {};

    // Create sample text file
    const textContent = `
This is a sample text file for testing.
It contains multiple paragraphs with various claims.

Some factual statements:
- The Earth is round
- Water boils at 100°C at sea level
- Paris is the capital of France

Some potentially questionable statements:
- The moon is made of cheese
- Unicorns exist in reality
- The internet was invented in 1850
    `.trim();

    const textFilePath = path.join(testFilesDir, 'sample-text.txt');
    await fs.writeFile(textFilePath, textContent);
    files.text = textFilePath;

    // Create sample JSON file
    const jsonContent = {
      title: "Sample Analysis Data",
      content: "This is sample content for JSON analysis testing",
      metadata: {
        source: "test",
        created: new Date().toISOString(),
      },
      claims: [
        "The sky is blue",
        "Gravity makes things fall down",
        "Dragons are real animals",
      ],
    };

    const jsonFilePath = path.join(testFilesDir, 'sample-data.json');
    await fs.writeFile(jsonFilePath, JSON.stringify(jsonContent, null, 2));
    files.json = jsonFilePath;

    // Create sample CSV file
    const csvContent = `
title,content,score
"Claim 1","The Earth orbits the Sun",95
"Claim 2","Water is wet",98
"Claim 3","Elephants can fly naturally",15
"Claim 4","Computers use electricity",99
    `.trim();

    const csvFilePath = path.join(testFilesDir, 'sample-data.csv');
    await fs.writeFile(csvFilePath, csvContent);
    files.csv = csvFilePath;

    return files;
  }

  /**
   * Create large test file for testing file size limits
   */
  async createLargeTestFile(sizeMB: number = 10): Promise<string> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const testFilesDir = path.join(__dirname, '../test-files');
    const filePath = path.join(testFilesDir, `large-file-${sizeMB}mb.txt`);
    
    // Create content that's approximately the specified size
    const chunkSize = 1024; // 1KB chunks
    const totalChunks = sizeMB * 1024; // Total chunks needed for specified MB
    const chunk = 'A'.repeat(chunkSize);
    
    let content = '';
    for (let i = 0; i < totalChunks; i++) {
      content += chunk;
    }
    
    await fs.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Clean up test files
   */
  async cleanupTestFiles(): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const testFilesDir = path.join(__dirname, '../test-files');
    
    try {
      const files = await fs.readdir(testFilesDir);
      for (const file of files) {
        await fs.unlink(path.join(testFilesDir, file));
      }
      await fs.rmdir(testFilesDir);
    } catch (error) {
      // Directory might not exist or be empty
      console.log('Test files cleanup skipped:', error.message);
    }
  }

  /**
   * Clean up test data for a user
   */
  async cleanupUserTestData(userId: string): Promise<void> {
    const tables = [
      'notifications',
      'usage_records',
      'scheduled_scans',
      'analyses',
      'billing_notifications',
      'payment_history',
      'user_subscriptions',
    ];

    for (const table of tables) {
      try {
        await testDatabase.supabase
          .from(table)
          .delete()
          .eq('user_id', userId);
      } catch (error) {
        console.warn(`Failed to cleanup ${table} for user ${userId}:`, error);
      }
    }
  }

  /**
   * Clean up all test data
   */
  async cleanupAllTestData(): Promise<void> {
    await testDatabase.cleanup();
    await this.cleanupTestFiles();
  }

  /**
   * Seed database with realistic test data
   */
  async seedRealisticData(): Promise<void> {
    // Create multiple test users with different subscription levels
    const testUsers = [
      { email: 'basic@test.com', subscription: 'basic', analysisCount: 15 },
      { email: 'pro@test.com', subscription: 'pro', analysisCount: 50 },
      { email: 'enterprise@test.com', subscription: 'enterprise', analysisCount: 200 },
    ];

    for (const userData of testUsers) {
      // Create user
      const { data: user, error } = await testDatabase.supabase
        .from('users')
        .upsert({
          email: userData.email,
          name: userData.email.split('@')[0],
          access_level: userData.subscription === 'basic' ? 'free' : 'premium',
        }, { onConflict: 'email' })
        .select()
        .single();

      if (error) {
        console.warn(`Failed to create user ${userData.email}:`, error);
        continue;
      }

      // Create test scenario for user
      await this.createCompleteTestScenario(user.id);
    }
  }

  /**
   * Get test data statistics
   */
  async getTestDataStats(): Promise<{
    users: number;
    analyses: number;
    scheduledScans: number;
    usageRecords: number;
    notifications: number;
  }> {
    const stats = {
      users: 0,
      analyses: 0,
      scheduledScans: 0,
      usageRecords: 0,
      notifications: 0,
    };

    try {
      const { count: userCount } = await testDatabase.supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      stats.users = userCount || 0;

      const { count: analysisCount } = await testDatabase.supabase
        .from('analyses')
        .select('*', { count: 'exact', head: true });
      stats.analyses = analysisCount || 0;

      const { count: scanCount } = await testDatabase.supabase
        .from('scheduled_scans')
        .select('*', { count: 'exact', head: true });
      stats.scheduledScans = scanCount || 0;

      const { count: usageCount } = await testDatabase.supabase
        .from('usage_records')
        .select('*', { count: 'exact', head: true });
      stats.usageRecords = usageCount || 0;

      const { count: notificationCount } = await testDatabase.supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true });
      stats.notifications = notificationCount || 0;
    } catch (error) {
      console.warn('Failed to get test data stats:', error);
    }

    return stats;
  }
}