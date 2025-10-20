// Export all test utilities for easy importing
export * from './test-utils';
export * from './database-utils';
export * from './data-validation';

// Re-export factories
export * from '../factories/userFactory';
export * from '../factories/analysisFactory';
export * from '../factories/scheduledScanFactory';
export * from '../factories/stripeFactory';
export * from '../factories/googleDriveFactory';

// Re-export fixtures
import usersFixture from '../fixtures/users.json';
import analysesFixture from '../fixtures/analyses.json';
import scheduledScansFixture from '../fixtures/scheduledScans.json';

export const fixtures = {
  users: usersFixture,
  analyses: analysesFixture,
  scheduledScans: scheduledScansFixture
};

// Export enhanced test utilities
export {
  DatabaseSeeder,
  DatabaseCleaner,
  TestIsolation,
  setupTestDatabase,
  teardownTestDatabase,
  withTestTransaction,
  withIsolatedTest,
  TestDatabaseState,
  testDatabaseState
} from './database-utils';

export {
  validateTestData,
  checkDataConsistency,
  validateDataSet,
  TestDataValidator,
  PIIScrubber,
  TestDataSanitizer,
  assertNoPII,
  assertValidTestData,
  mockConsoleForTesting
} from './data-validation';