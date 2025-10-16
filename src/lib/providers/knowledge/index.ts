/**
 * Knowledge providers index
 * Exports all knowledge base providers and utilities
 */

export * from './base';
export * from './wikipedia';
export * from './academic';
export * from './news';
export * from './manager';

// Re-export commonly used types
export type {
  KnowledgeDocument,
  SearchOptions,
  ReliabilityMetrics,
  KnowledgeProviderResult,
  KnowledgeProviderError
} from './base';

// Create and export a default knowledge manager instance
import { KnowledgeManager } from './manager';

export const knowledgeManager = new KnowledgeManager({
  providers: {
    wikipedia: {
      enabled: true,
      weight: 0.3,
      maxResults: 3,
      timeout: 10000
    },
    academic: {
      enabled: true,
      weight: 0.4,
      maxResults: 3,
      timeout: 15000
    },
    news: {
      enabled: true,
      weight: 0.3,
      maxResults: 2,
      timeout: 8000
    }
  },
  cache: {
    enabled: true,
    defaultTTL: 30 * 60 * 1000, // 30 minutes
    maxSize: 1000
  },
  search: {
    maxConcurrentProviders: 3,
    timeoutMs: 20000,
    minReliabilityThreshold: 0.3
  }
});