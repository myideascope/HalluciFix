// Export all test utilities for easy importing
export * from './test-utils';
export * from './database-utils';
export * from './data-validation';

// Re-export factories
export * from '../factories/userFactory';
export * from '../factories/analysisFactory';
export * from '../factories/scheduledScanFactory';

// Re-export fixtures
import usersFixture from '../fixtures/users.json';
import analysesFixture from '../fixtures/analyses.json';
import scheduledScansFixture from '../fixtures/scheduledScans.json';

export const fixtures = {
  users: usersFixture,
  analyses: analysesFixture,
  scheduledScans: scheduledScansFixture
};