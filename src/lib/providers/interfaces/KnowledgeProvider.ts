/**
 * Knowledge Provider interface for RAG and fact-checking services
 */

import { BaseProvider, ProviderConfig } from '../base/BaseProvider';

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  url?: string;
  source: string;
  publishedDate?: Date;
  lastModified?: Date;
  author?: string;
  relevanceScore: number;
  reliabilityScore: number;
  citations?: string[];
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  maxResults?: number;
  minRelevanceScore?: number;
  minReliabilityScore?: number;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  sources?: string[];
  language?: string;
  contentType?: 'article' | 'paper' | 'news' | 'reference' | 'any';
}

export interface FactCheckResult {
  claim: string;
  verdict: 'supported' | 'contradicted' | 'unverified' | 'mixed';
  confidence: number;
  evidence: KnowledgeDocument[];
  explanation: string;
  sources: string[];
}

export interface KnowledgeProviderConfig extends ProviderConfig {
  apiKey?: string;
  baseUrl: string;
  defaultLanguage: string;
  cacheTTL: number;
  maxConcurrentRequests: number;
  reliabilityThreshold: number;
}

export interface SourceMetadata {
  name: string;
  type: 'encyclopedia' | 'academic' | 'news' | 'government' | 'reference';
  reliability: number;
  bias?: 'left' | 'center' | 'right' | 'unknown';
  factCheckRating?: number;
  lastUpdated?: Date;
}

export abstract class KnowledgeProvider extends BaseProvider {
  protected knowledgeConfig: KnowledgeProviderConfig;

  constructor(config: KnowledgeProviderConfig) {
    super(config);
    this.knowledgeConfig = config;
  }

  /**
   * Search for documents related to a query
   */
  abstract search(
    query: string, 
    options?: SearchOptions
  ): Promise<KnowledgeDocument[]>;

  /**
   * Fact-check a specific claim
   */
  abstract factCheck(
    claim: string, 
    context?: string
  ): Promise<FactCheckResult>;

  /**
   * Get document by ID
   */
  abstract getDocument(id: string): Promise<KnowledgeDocument | null>;

  /**
   * Get multiple documents by IDs
   */
  abstract getDocuments(ids: string[]): Promise<KnowledgeDocument[]>;

  /**
   * Extract claims from content
   */
  abstract extractClaims(content: string): Promise<string[]>;

  /**
   * Get source metadata and reliability information
   */
  abstract getSourceMetadata(): SourceMetadata;

  /**
   * Get reliability score for this provider
   */
  getReliabilityScore(): number {
    return this.knowledgeConfig.reliabilityThreshold;
  }

  /**
   * Get supported content types
   */
  abstract getSupportedContentTypes(): string[];

  /**
   * Get available languages
   */
  abstract getSupportedLanguages(): string[];

  /**
   * Check if provider supports real-time data
   */
  abstract supportsRealTimeData(): boolean;

  /**
   * Get cache TTL for this provider
   */
  getCacheTTL(): number {
    return this.knowledgeConfig.cacheTTL;
  }

  /**
   * Update knowledge-specific configuration
   */
  updateKnowledgeConfig(newConfig: Partial<KnowledgeProviderConfig>): void {
    this.knowledgeConfig = { ...this.knowledgeConfig, ...newConfig };
    this.updateConfig(newConfig);
  }

  /**
   * Validate search query
   */
  protected validateSearchQuery(query: string): boolean {
    return query.trim().length >= 3 && query.length <= 1000;
  }

  /**
   * Normalize relevance score (0-1)
   */
  protected normalizeRelevanceScore(score: number, maxScore: number = 100): number {
    return Math.max(0, Math.min(1, score / maxScore));
  }

  /**
   * Calculate combined score (relevance + reliability)
   */
  protected calculateCombinedScore(
    relevanceScore: number, 
    reliabilityScore: number,
    relevanceWeight: number = 0.7
  ): number {
    return (relevanceScore * relevanceWeight) + (reliabilityScore * (1 - relevanceWeight));
  }
}

export type KnowledgeProviderType = 'wikipedia' | 'arxiv' | 'pubmed' | 'news' | 'mock';