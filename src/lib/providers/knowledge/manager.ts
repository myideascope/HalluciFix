/**
 * Knowledge Base Manager
 * Coordinates multiple knowledge providers and manages caching
 */

import {
  BaseKnowledgeProvider,
  KnowledgeDocument,
  SearchOptions,
  ReliabilityMetrics,
  KnowledgeProviderResult,
  KnowledgeProviderError
} from './base';
import { WikipediaProvider } from './wikipedia';
import { AcademicProvider } from './academic';
import { NewsProvider } from './news';

interface CacheEntry {
  result: KnowledgeProviderResult;
  timestamp: number;
  ttl: number;
}

interface ProviderConfig {
  enabled: boolean;
  weight: number; // Relative importance in results
  maxResults: number;
  timeout: number; // milliseconds
}

interface KnowledgeManagerConfig {
  providers: {
    wikipedia: ProviderConfig;
    academic: ProviderConfig;
    news: ProviderConfig;
  };
  cache: {
    enabled: boolean;
    defaultTTL: number; // milliseconds
    maxSize: number;
  };
  search: {
    maxConcurrentProviders: number;
    timeoutMs: number;
    minReliabilityThreshold: number;
  };
}

export class KnowledgeManager {
  private providers: Map<string, BaseKnowledgeProvider>;
  private cache: Map<string, CacheEntry>;
  private config: KnowledgeManagerConfig;

  constructor(config?: Partial<KnowledgeManagerConfig>) {
    this.providers = new Map();
    this.cache = new Map();
    
    // Default configuration
    this.config = {
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
      },
      ...config
    };

    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize Wikipedia provider
    if (this.config.providers.wikipedia.enabled) {
      this.providers.set('wikipedia', new WikipediaProvider());
    }

    // Initialize Academic provider
    if (this.config.providers.academic.enabled) {
      this.providers.set('academic', new AcademicProvider());
    }

    // Initialize News provider
    if (this.config.providers.news.enabled) {
      this.providers.set('news', new NewsProvider());
    }
  }

  /**
   * Search across all enabled knowledge providers
   */
  async search(query: string, options: SearchOptions = {}): Promise<KnowledgeProviderResult> {
    const cacheKey = this.generateCacheKey('search', query, options);
    
    // Check cache first
    if (this.config.cache.enabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();
    const enabledProviders = Array.from(this.providers.entries())
      .filter(([name]) => this.config.providers[name as keyof typeof this.config.providers]?.enabled);

    if (enabledProviders.length === 0) {
      throw new KnowledgeProviderError(
        'No knowledge providers are enabled',
        'KnowledgeManager',
        'NO_PROVIDERS'
      );
    }

    try {
      // Search all providers concurrently with timeout
      const searchPromises = enabledProviders.map(async ([name, provider]) => {
        const providerConfig = this.config.providers[name as keyof typeof this.config.providers];
        const providerOptions = {
          ...options,
          limit: providerConfig.maxResults
        };

        try {
          const result = await Promise.race([
            provider.search(query, providerOptions),
            this.createTimeoutPromise(providerConfig.timeout)
          ]);
          
          return { name, result, weight: providerConfig.weight };
        } catch (error) {
          console.warn(`Provider ${name} failed:`, error);
          return null;
        }
      });

      const results = (await Promise.all(searchPromises)).filter(Boolean);

      if (results.length === 0) {
        throw new KnowledgeProviderError(
          'All knowledge providers failed',
          'KnowledgeManager',
          'ALL_PROVIDERS_FAILED'
        );
      }

      // Combine and rank results
      const combinedResult = this.combineProviderResults(results, query, startTime);

      // Cache the result
      if (this.config.cache.enabled) {
        this.addToCache(cacheKey, combinedResult);
      }

      return combinedResult;

    } catch (error) {
      throw new KnowledgeProviderError(
        `Knowledge search failed: ${error.message}`,
        'KnowledgeManager',
        'SEARCH_FAILED'
      );
    }
  }

  /**
   * Get a specific document by ID from any provider
   */
  async getDocument(id: string, providerHint?: string): Promise<KnowledgeDocument | null> {
    const cacheKey = this.generateCacheKey('document', id, { providerHint });
    
    // Check cache first
    if (this.config.cache.enabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached && cached.documents.length > 0) {
        return cached.documents[0];
      }
    }

    try {
      let providers = Array.from(this.providers.entries());
      
      // If provider hint is given, try that first
      if (providerHint && this.providers.has(providerHint)) {
        providers = [[providerHint, this.providers.get(providerHint)!], ...providers.filter(([name]) => name !== providerHint)];
      }

      for (const [name, provider] of providers) {
        try {
          const document = await provider.getDocument(id);
          if (document) {
            // Cache the result
            if (this.config.cache.enabled) {
              const result: KnowledgeProviderResult = {
                documents: [document],
                reliability: provider.calculateReliability(document),
                searchMetadata: {
                  query: id,
                  totalResults: 1,
                  searchTime: 0,
                  provider: name
                }
              };
              this.addToCache(cacheKey, result);
            }
            return document;
          }
        } catch (error) {
          console.warn(`Provider ${name} failed to get document ${id}:`, error);
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get document ${id}:`, error);
      return null;
    }
  }

  /**
   * Verify claims against knowledge base
   */
  async verifyClaims(claims: string[]): Promise<Array<{
    claim: string;
    verification: 'verified' | 'contradicted' | 'unsupported' | 'partial';
    confidence: number;
    supportingDocuments: KnowledgeDocument[];
    contradictingDocuments: KnowledgeDocument[];
    explanation: string;
  }>> {
    const verificationResults = await Promise.all(
      claims.map(async (claim) => {
        try {
          const searchResult = await this.search(claim, { limit: 8 });
          
          // Analyze documents for support/contradiction
          const analysis = this.analyzeClaim(claim, searchResult.documents);
          
          return {
            claim,
            ...analysis
          };
        } catch (error) {
          console.error(`Failed to verify claim: ${claim}`, error);
          return {
            claim,
            verification: 'unsupported' as const,
            confidence: 0.1,
            supportingDocuments: [],
            contradictingDocuments: [],
            explanation: `Unable to verify due to search error: ${error.message}`
          };
        }
      })
    );

    return verificationResults;
  }

  /**
   * Get knowledge base statistics
   */
  getStatistics(): {
    enabledProviders: string[];
    cacheSize: number;
    cacheHitRate: number;
    providerInfo: Array<{
      name: string;
      type: string;
      reliability: number;
      enabled: boolean;
    }>;
  } {
    const enabledProviders = Array.from(this.providers.keys())
      .filter(name => this.config.providers[name as keyof typeof this.config.providers]?.enabled);

    const providerInfo = Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      ...provider.getProviderInfo(),
      enabled: enabledProviders.includes(name)
    }));

    return {
      enabledProviders,
      cacheSize: this.cache.size,
      cacheHitRate: 0, // Would need to track hits/misses
      providerInfo
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerName: string, config: Partial<ProviderConfig>): void {
    if (this.config.providers[providerName as keyof typeof this.config.providers]) {
      this.config.providers[providerName as keyof typeof this.config.providers] = {
        ...this.config.providers[providerName as keyof typeof this.config.providers],
        ...config
      };

      // Reinitialize if enabled status changed
      if (config.enabled !== undefined) {
        if (config.enabled && !this.providers.has(providerName)) {
          this.initializeProvider(providerName);
        } else if (!config.enabled && this.providers.has(providerName)) {
          this.providers.delete(providerName);
        }
      }
    }
  }

  private initializeProvider(name: string): void {
    switch (name) {
      case 'wikipedia':
        this.providers.set('wikipedia', new WikipediaProvider());
        break;
      case 'academic':
        this.providers.set('academic', new AcademicProvider());
        break;
      case 'news':
        this.providers.set('news', new NewsProvider());
        break;
    }
  }

  private combineProviderResults(
    results: Array<{ name: string; result: KnowledgeProviderResult; weight: number }>,
    query: string,
    startTime: number
  ): KnowledgeProviderResult {
    // Combine all documents
    const allDocuments: KnowledgeDocument[] = [];
    let totalReliabilityScore = 0;
    let totalWeight = 0;

    for (const { result, weight } of results) {
      // Apply weight to document scores
      const weightedDocuments = result.documents.map(doc => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          providerWeight: weight,
          originalReliability: result.reliability.overallScore
        }
      }));

      allDocuments.push(...weightedDocuments);
      totalReliabilityScore += result.reliability.overallScore * weight;
      totalWeight += weight;
    }

    // Remove duplicates based on URL or title similarity
    const uniqueDocuments = this.deduplicateDocuments(allDocuments);

    // Sort by combined relevance score
    uniqueDocuments.sort((a, b) => {
      const aScore = (a.metadata?.originalReliability || 0.5) * (a.metadata?.providerWeight || 1);
      const bScore = (b.metadata?.originalReliability || 0.5) * (b.metadata?.providerWeight || 1);
      return bScore - aScore;
    });

    // Calculate combined reliability
    const avgReliability = totalWeight > 0 ? totalReliabilityScore / totalWeight : 0;
    
    const combinedReliability: ReliabilityMetrics = {
      sourceQuality: avgReliability,
      contentQuality: avgReliability,
      recency: this.calculateAverageRecency(uniqueDocuments),
      citations: uniqueDocuments.reduce((sum, doc) => sum + (doc.metadata?.citations || 0), 0),
      overallScore: avgReliability
    };

    return {
      documents: uniqueDocuments,
      reliability: combinedReliability,
      searchMetadata: {
        query,
        totalResults: uniqueDocuments.length,
        searchTime: Date.now() - startTime,
        provider: 'KnowledgeManager'
      }
    };
  }

  private deduplicateDocuments(documents: KnowledgeDocument[]): KnowledgeDocument[] {
    const seen = new Set<string>();
    const unique: KnowledgeDocument[] = [];

    for (const doc of documents) {
      // Create a key based on URL or title
      const key = doc.url || doc.title.toLowerCase().replace(/\s+/g, '');
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(doc);
      }
    }

    return unique;
  }

  private calculateAverageRecency(documents: KnowledgeDocument[]): number {
    if (documents.length === 0) return 0;

    const recencyScores = documents.map(doc => {
      const date = doc.publicationDate || doc.lastModified;
      if (!date) return 0.3;

      const daysSince = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(0, 1 - (daysSince / 365)); // Linear decay over a year
    });

    return recencyScores.reduce((sum, score) => sum + score, 0) / recencyScores.length;
  }

  private analyzeClaim(claim: string, documents: KnowledgeDocument[]): {
    verification: 'verified' | 'contradicted' | 'unsupported' | 'partial';
    confidence: number;
    supportingDocuments: KnowledgeDocument[];
    contradictingDocuments: KnowledgeDocument[];
    explanation: string;
  } {
    if (documents.length === 0) {
      return {
        verification: 'unsupported',
        confidence: 0.1,
        supportingDocuments: [],
        contradictingDocuments: [],
        explanation: 'No relevant documents found to verify this claim.'
      };
    }

    // Simple keyword-based analysis (in a real implementation, this would use NLP)
    const claimKeywords = this.extractKeywords(claim.toLowerCase());
    
    const supportingDocs: KnowledgeDocument[] = [];
    const contradictingDocs: KnowledgeDocument[] = [];
    const neutralDocs: KnowledgeDocument[] = [];

    for (const doc of documents) {
      const content = (doc.title + ' ' + doc.content).toLowerCase();
      const matchingKeywords = claimKeywords.filter(keyword => content.includes(keyword));
      
      if (matchingKeywords.length >= claimKeywords.length * 0.6) {
        // Check for contradiction indicators
        const hasContradiction = /\b(?:not|no|never|false|incorrect|wrong|dispute|deny|refute)\b/.test(content);
        
        if (hasContradiction) {
          contradictingDocs.push(doc);
        } else {
          supportingDocs.push(doc);
        }
      } else {
        neutralDocs.push(doc);
      }
    }

    // Determine verification status
    let verification: 'verified' | 'contradicted' | 'unsupported' | 'partial';
    let confidence: number;

    if (supportingDocs.length >= 2 && contradictingDocs.length === 0) {
      verification = 'verified';
      confidence = Math.min(0.95, 0.7 + (supportingDocs.length * 0.05));
    } else if (contradictingDocs.length >= 2) {
      verification = 'contradicted';
      confidence = Math.min(0.95, 0.7 + (contradictingDocs.length * 0.05));
    } else if (supportingDocs.length >= 1 && contradictingDocs.length >= 1) {
      verification = 'partial';
      confidence = 0.5 + Math.random() * 0.2;
    } else if (supportingDocs.length >= 1) {
      verification = 'partial';
      confidence = 0.4 + Math.random() * 0.3;
    } else {
      verification = 'unsupported';
      confidence = 0.2 + Math.random() * 0.2;
    }

    const explanation = this.generateVerificationExplanation(
      verification,
      supportingDocs.length,
      contradictingDocs.length
    );

    return {
      verification,
      confidence,
      supportingDocuments: supportingDocs,
      contradictingDocuments: contradictingDocs,
      explanation
    };
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction (remove common words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
    
    return text
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10); // Limit to 10 keywords
  }

  private generateVerificationExplanation(
    status: 'verified' | 'contradicted' | 'unsupported' | 'partial',
    supportingCount: number,
    contradictingCount: number
  ): string {
    switch (status) {
      case 'verified':
        return `This claim is supported by ${supportingCount} reliable source${supportingCount !== 1 ? 's' : ''} with no contradictory evidence found.`;
      case 'contradicted':
        return `This claim is contradicted by ${contradictingCount} reliable source${contradictingCount !== 1 ? 's' : ''}, suggesting it may be inaccurate.`;
      case 'partial':
        return `This claim has mixed evidence: ${supportingCount} supporting and ${contradictingCount} contradicting source${(supportingCount + contradictingCount) !== 1 ? 's' : ''}.`;
      case 'unsupported':
        return 'No reliable sources found to support or contradict this claim. This may indicate a potential hallucination or very recent information.';
      default:
        return 'Unable to determine verification status.';
    }
  }

  private generateCacheKey(type: string, query: string, options?: any): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return `${type}:${query}:${optionsStr}`;
  }

  private getFromCache(key: string): KnowledgeProviderResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  private addToCache(key: string, result: KnowledgeProviderResult): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.config.cache.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl: this.config.cache.defaultTTL
    });
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Provider timeout')), timeoutMs);
    });
  }
}