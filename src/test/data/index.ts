/**
 * Test Data Management System
 * 
 * Provides comprehensive test data management with isolation, versioning, and cleanup
 */

export { TestDataManager } from './TestDataManager';
export { 
  TestDataIsolation, 
  withTestDataIsolation,
  setupTestDataIsolation,
  teardownTestDataIsolation 
} from './TestDataIsolation';
export { TestDataVersioning } from './TestDataVersioning';

export type {
  TestDataOptions,
  TestUser,
  TestAnalysisResult
} from './TestDataManager';

export type {
  IsolationConfig
} from './TestDataIsolation';

export type {
  DataVersion,
  MigrationScript
} from './TestDataVersioning';

// Re-export commonly used utilities
// export * from '../factories';
// export * from '../fixtures';