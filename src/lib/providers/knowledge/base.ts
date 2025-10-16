/**
 * Base interfaces and types for knowledge base providers
 */

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  url?: string;
  author?: string;
  publicationDate?: string;
  lastModified?: string;
  language?: string;
  categories?: string[];
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  limit?: number;
  language?: string;
  categories?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  minReliability?: number;
}

export interface ReliabilityMetrics {
  sourceQuality: number; // 0-1 score based on source reputation
  contentQuality: number; // 0-1 score based on content analysis
  recency: number; // 0-1 score based on how recent the information is
  citations: number; // Number of citations/references
  overallScore: number; // Weighted combination of above metrics
}

export interface KnowledgeProviderResult {
  documents: KnowledgeDocument[];
  reliability: ReliabilityMetrics;
  searchMetadata: {
    query: string;
    totalResults: number;
    searchTime: number;
    provider: string;
  };
}

export abstract class BaseKnowledgeProvider {
  protected name: string;
  protected baseUrl: string;
  protected rateLimitDelay: number;
  protected lastRequestTime: number = 0;

  constructor(name: string, baseUrl: string, rateLimitDelay: number = 100) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.rateLimitDelay = rateLimitDelay;
  }

  /**
   * Search for documents related to the query
   */
  abstract search(query: string, options?: SearchOptions): Promise<KnowledgeProviderResult>;

  /**
   * Get a specific document by ID
   */
  abstract getDocument(id: string): Promise<KnowledgeDocument | null>;

  /**
   * Calculate reliability metrics for a document
   */
  abstract calculateReliability(document: KnowledgeDocument): ReliabilityMetrics;

  /**
   * Get provider-specific configuration
   */
  abstract getProviderInfo(): {
    name: string;
    type: string;
    baseReliability: number;
    supportedLanguages: string[];
    rateLimit: number;
  };

  /**
   * Rate limiting helper
   */
  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Clean and normalize text content
   */
  protected cleanContent(content: string): string {
    return content
      .replace(/\[\d+\]/g, '') // Remove citation markers like [1], [2]
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();
  }

  /**
   * Extract key information from content
   */
  protected extractKeyInfo(content: string): {
    summary: string;
    keyPoints: string[];
    entities: string[];
  } {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const summary = sentences.slice(0, 2).join('. ').trim();
    
    // Extract potential key points (sentences with numbers, dates, or specific terms)
    const keyPoints = sentences
      .filter(s => /\b\d{4}\b|\b\d+%|\b(?:study|research|according|found|shows)\b/i.test(s))
      .slice(0, 5)
      .map(s => s.trim());

    // Simple entity extraction (capitalized words that might be names, places, etc.)
    const entities = Array.from(new Set(
      content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []
    )).slice(0, 10);

    return { summary, keyPoints, entities };
  }

  /**
   * Calculate content quality score based on various factors
   */
  protected calculateContentQuality(content: string, metadata?: Record<string, any>): number {
    let score = 0.5; // Base score

    // Length factor (longer articles tend to be more comprehensive)
    const wordCount = content.split(/\s+/).length;
    if (wordCount > 500) score += 0.1;
    if (wordCount > 1000) score += 0.1;
    if (wordCount > 2000) score += 0.1;

    // Citation indicators
    const citationCount = (content.match(/\[\d+\]|\(.*?\d{4}.*?\)/g) || []).length;
    score += Math.min(0.2, citationCount * 0.02);

    // Structure indicators (headers, lists, etc.)
    const structureIndicators = (content.match(/^#+\s|^\*\s|^\d+\.\s/gm) || []).length;
    score += Math.min(0.1, structureIndicators * 0.01);

    // Metadata quality
    if (metadata?.categories?.length > 0) score += 0.05;
    if (metadata?.lastModified) score += 0.05;
    if (metadata?.author) score += 0.05;

    return Math.min(1.0, score);
  }

  /**
   * Calculate recency score based on publication/modification date
   */
  protected calculateRecencyScore(date?: string): number {
    if (!date) return 0.3; // Default for unknown dates

    const docDate = new Date(date);
    const now = new Date();
    const daysDiff = (now.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24);

    // Exponential decay: newer content gets higher scores
    if (daysDiff < 30) return 1.0;
    if (daysDiff < 90) return 0.9;
    if (daysDiff < 180) return 0.8;
    if (daysDiff < 365) return 0.7;
    if (daysDiff < 730) return 0.6;
    return 0.4;
  }
}

export class KnowledgeProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'KnowledgeProviderError';
  }
}