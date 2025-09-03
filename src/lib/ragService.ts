import { supabase } from './supabase';

export interface KnowledgeSource {
  id: string;
  name: string;
  description: string;
  url?: string;
  type: 'wikipedia' | 'academic' | 'news' | 'government' | 'custom';
  reliability_score: number;
  last_updated: string;
  enabled: boolean;
  metadata?: {
    domain?: string;
    language?: string;
    category?: string;
  };
}

export interface RetrievedDocument {
  id: string;
  source_id: string;
  title: string;
  content: string;
  url?: string;
  relevance_score: number;
  publication_date?: string;
  author?: string;
  source_name: string;
  source_type: string;
  metadata?: any;
}

export interface RAGAnalysisResult {
  claim: string;
  verification_status: 'verified' | 'contradicted' | 'unsupported' | 'partial';
  confidence: number;
  supporting_documents: RetrievedDocument[];
  contradicting_documents: RetrievedDocument[];
  explanation: string;
  reliability_assessment: {
    source_quality: number;
    consensus_level: number;
    recency: number;
    overall_score: number;
  };
}

export interface RAGEnhancedAnalysis {
  original_accuracy: number;
  rag_enhanced_accuracy: number;
  improvement_score: number;
  verified_claims: RAGAnalysisResult[];
  unverified_claims: string[];
  source_coverage: number;
  processing_time: number;
  knowledge_gaps: string[];
}

class RAGService {
  private knowledgeSources: KnowledgeSource[] = [];
  private vectorStore: Map<string, number[]> = new Map();
  private documentCache: Map<string, RetrievedDocument[]> = new Map();

  constructor() {
    this.initializeKnowledgeSources();
  }

  private initializeKnowledgeSources() {
    // Initialize with default reliable knowledge sources
    this.knowledgeSources = [
      {
        id: 'wikipedia',
        name: 'Wikipedia',
        description: 'Collaborative encyclopedia with extensive fact-checking',
        url: 'https://en.wikipedia.org',
        type: 'wikipedia',
        reliability_score: 0.85,
        last_updated: new Date().toISOString(),
        enabled: true,
        metadata: { domain: 'wikipedia.org', language: 'en', category: 'general' }
      },
      {
        id: 'reuters',
        name: 'Reuters News',
        description: 'International news organization with fact-checking standards',
        url: 'https://reuters.com',
        type: 'news',
        reliability_score: 0.92,
        last_updated: new Date().toISOString(),
        enabled: true,
        metadata: { domain: 'reuters.com', language: 'en', category: 'news' }
      },
      {
        id: 'nature',
        name: 'Nature Publishing',
        description: 'Peer-reviewed scientific journal and research database',
        url: 'https://nature.com',
        type: 'academic',
        reliability_score: 0.95,
        last_updated: new Date().toISOString(),
        enabled: true,
        metadata: { domain: 'nature.com', language: 'en', category: 'science' }
      },
      {
        id: 'gov_data',
        name: 'Government Data Sources',
        description: 'Official government statistics and reports',
        url: 'https://data.gov',
        type: 'government',
        reliability_score: 0.90,
        last_updated: new Date().toISOString(),
        enabled: true,
        metadata: { domain: 'data.gov', language: 'en', category: 'statistics' }
      }
    ];
  }

  /**
   * Extract key claims from content for verification
   */
  private extractClaims(content: string): string[] {
    const claims: string[] = [];
    
    // Split content into sentences for better claim extraction
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length < 20) continue; // Skip very short sentences
      
      // Pattern 1: Statistical claims (numbers with percentages, specific figures)
      if (/\b\d+(?:\.\d+)?%/.test(trimmedSentence) || /\bexactly\s+\d+/.test(trimmedSentence)) {
        claims.push(trimmedSentence);
        continue;
      }
      
      // Pattern 2: Superlative claims (best, worst, first, last, etc.)
      if (/\b(?:the\s+(?:best|worst|first|last|only|most|least|highest|lowest|largest|smallest|perfect|unprecedented|revolutionary))/gi.test(trimmedSentence)) {
        claims.push(trimmedSentence);
        continue;
      }
      
      // Pattern 3: Attribution claims (according to, study shows, research indicates)
      if (/\b(?:according\s+to|study\s+(?:shows|indicates|found)|research\s+(?:shows|indicates|demonstrates)|scientists?\s+(?:found|discovered|proved))/gi.test(trimmedSentence)) {
        claims.push(trimmedSentence);
        continue;
      }
      
      // Pattern 4: Absolute claims (all, every, none, never, always)
      if (/\b(?:all|every|100%|zero|none|never|always)\s+(?:users?|customers?|clients?|people|studies?)/gi.test(trimmedSentence)) {
        claims.push(trimmedSentence);
        continue;
      }
      
      // Pattern 5: Performance claims (times faster, more effective, etc.)
      if (/\b\d+(?:,?\d{0,3})*\s*(?:times?\s+(?:faster|better|more\s+effective|superior)|%\s+(?:faster|better|improvement))/gi.test(trimmedSentence)) {
        claims.push(trimmedSentence);
        continue;
      }
    }
    
    // Clean and deduplicate claims
    return [...new Set(claims)]
      .map(claim => claim.trim())
      .filter(claim => claim.length > 15 && claim.length < 500) // Filter reasonable length claims
      .slice(0, 10); // Limit to 10 most important claims
  }

  /**
   * Simulate document retrieval from knowledge sources
   */
  private async retrieveDocuments(query: string, maxResults: number = 5): Promise<RetrievedDocument[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    const documents: RetrievedDocument[] = [];
    const enabledSources = this.knowledgeSources.filter(source => source.enabled);
    
    for (const source of enabledSources.slice(0, 3)) { // Limit to 3 sources for demo
      // Generate mock relevant documents
      const numDocs = Math.floor(Math.random() * 3) + 1; // 1-3 documents per source
      
      for (let i = 0; i < numDocs && documents.length < maxResults; i++) {
        const relevanceScore = 0.6 + Math.random() * 0.4; // 0.6-1.0 relevance
        
        documents.push({
          id: `doc_${source.id}_${i}_${Date.now()}`,
          source_id: source.id,
          title: this.generateMockTitle(query, source.type),
          content: this.generateMockContent(query, source.type),
          url: `${source.url}/article/${Date.now()}_${i}`,
          relevance_score: relevanceScore,
          publication_date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
          author: this.generateMockAuthor(source.type),
          source_name: source.name,
          source_type: source.type,
          metadata: {
            reliability: source.reliability_score,
            category: source.metadata?.category
          }
        });
      }
    }
    
    // Sort by relevance score
    return documents.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  private generateMockTitle(query: string, sourceType: string): string {
    const keywords = query.toLowerCase().split(' ').slice(0, 3);
    const keywordPhrase = keywords.join(' ');
    
    switch (sourceType) {
      case 'wikipedia':
        return `${keywordPhrase} - Wikipedia`;
      case 'academic':
        return `Research on ${keywordPhrase}: A Comprehensive Study`;
      case 'news':
        return `Latest developments in ${keywordPhrase}`;
      case 'government':
        return `Official statistics and data on ${keywordPhrase}`;
      default:
        return `Information about ${keywordPhrase}`;
    }
  }

  private generateMockContent(query: string, sourceType: string): string {
    const baseContent = `This document provides information related to "${query}". `;
    
    switch (sourceType) {
      case 'wikipedia':
        return baseContent + `According to multiple peer-reviewed sources, the information has been verified through collaborative editing and fact-checking processes. The content is regularly updated by subject matter experts and includes citations to primary sources.`;
      
      case 'academic':
        return baseContent + `This peer-reviewed research was conducted following rigorous scientific methodology. The study included proper controls, statistical analysis, and has been validated by independent researchers in the field.`;
      
      case 'news':
        return baseContent + `This report has been fact-checked by professional journalists and corroborated by multiple independent sources. The information follows established journalistic standards for accuracy and verification.`;
      
      case 'government':
        return baseContent + `This data comes from official government sources and statistical agencies. The information is collected through standardized methodologies and is subject to regular auditing and verification processes.`;
      
      default:
        return baseContent + `The information has been compiled from multiple reliable sources and cross-referenced for accuracy.`;
    }
  }

  private generateMockAuthor(sourceType: string): string {
    const authors = {
      wikipedia: ['Wikipedia Contributors', 'Editorial Team'],
      academic: ['Dr. Sarah Johnson', 'Prof. Michael Chen', 'Dr. Emily Rodriguez'],
      news: ['Reuters Staff', 'Associated Press', 'News Editorial Team'],
      government: ['Statistical Office', 'Government Research Team', 'Official Data Team']
    };
    
    const sourceAuthors = authors[sourceType] || ['Unknown Author'];
    return sourceAuthors[Math.floor(Math.random() * sourceAuthors.length)];
  }

  /**
   * Verify a single claim against knowledge sources
   */
  private async verifyClaim(claim: string): Promise<RAGAnalysisResult> {
    try {
      // Retrieve relevant documents
      const documents = await this.retrieveDocuments(claim, 8);
      
      // Simulate verification analysis
      const supportingDocs = documents.filter(doc => Math.random() > 0.3); // 70% chance of support
      const contradictingDocs = documents.filter(doc => 
        !supportingDocs.includes(doc) && Math.random() > 0.7 // 30% chance of contradiction
      );
      
      // Determine verification status
      let verificationStatus: RAGAnalysisResult['verification_status'];
      let confidence: number;
      
      if (supportingDocs.length >= 2 && contradictingDocs.length === 0) {
        verificationStatus = 'verified';
        confidence = 0.85 + Math.random() * 0.15;
      } else if (contradictingDocs.length >= 2) {
        verificationStatus = 'contradicted';
        confidence = 0.80 + Math.random() * 0.15;
      } else if (supportingDocs.length >= 1) {
        verificationStatus = 'partial';
        confidence = 0.60 + Math.random() * 0.25;
      } else {
        verificationStatus = 'unsupported';
        confidence = 0.40 + Math.random() * 0.30;
      }
      
      // Calculate reliability assessment
      const avgSourceQuality = documents.length > 0 
        ? documents.reduce((sum, doc) => sum + (doc.metadata?.reliability || 0.8), 0) / documents.length
        : 0.5;
      
      const consensusLevel = supportingDocs.length / Math.max(documents.length, 1);
      const recency = documents.length > 0
        ? documents.reduce((sum, doc) => {
            const daysSincePublication = doc.publication_date 
              ? (Date.now() - new Date(doc.publication_date).getTime()) / (1000 * 60 * 60 * 24)
              : 365;
            return sum + Math.max(0, 1 - (daysSincePublication / 365)); // Newer = higher score
          }, 0) / documents.length
        : 0.5;
      
      const overallScore = (avgSourceQuality * 0.4) + (consensusLevel * 0.4) + (recency * 0.2);
      
      return {
        claim,
        verification_status: verificationStatus,
        confidence,
        supporting_documents: supportingDocs,
        contradicting_documents: contradictingDocs,
        explanation: this.generateVerificationExplanation(verificationStatus, supportingDocs.length, contradictingDocs.length),
        reliability_assessment: {
          source_quality: avgSourceQuality,
          consensus_level: consensusLevel,
          recency,
          overall_score: overallScore
        }
      };
      
    } catch (error) {
      console.error('Error verifying claim:', error);
      return {
        claim,
        verification_status: 'unsupported',
        confidence: 0.3,
        supporting_documents: [],
        contradicting_documents: [],
        explanation: `Unable to verify claim due to retrieval error: ${error.message}`,
        reliability_assessment: {
          source_quality: 0,
          consensus_level: 0,
          recency: 0,
          overall_score: 0
        }
      };
    }
  }

  private generateVerificationExplanation(
    status: RAGAnalysisResult['verification_status'],
    supportingCount: number,
    contradictingCount: number
  ): string {
    switch (status) {
      case 'verified':
        return `This claim is supported by ${supportingCount} reliable source${supportingCount !== 1 ? 's' : ''} with no contradictory evidence found.`;
      case 'contradicted':
        return `This claim is contradicted by ${contradictingCount} reliable source${contradictingCount !== 1 ? 's' : ''}, suggesting it may be inaccurate.`;
      case 'partial':
        return `This claim has ${supportingCount} supporting source${supportingCount !== 1 ? 's' : ''} but also ${contradictingCount} contradicting source${contradictingCount !== 1 ? 's' : ''}, indicating mixed evidence.`;
      case 'unsupported':
        return `No reliable sources found to support or contradict this claim. This may indicate a potential hallucination or very recent information.`;
      default:
        return 'Unable to determine verification status.';
    }
  }

  /**
   * Perform RAG-enhanced analysis on content
   */
  async performRAGAnalysis(content: string, userId: string): Promise<RAGEnhancedAnalysis> {
    const startTime = Date.now();
    
    try {
      console.log('Starting RAG analysis...');
      
      // Extract key claims from content
      const claims = this.extractClaims(content);
      console.log(`Extracted ${claims.length} claims for verification`);
      
      if (claims.length === 0) {
        return {
          original_accuracy: 85, // Default baseline
          rag_enhanced_accuracy: 85,
          improvement_score: 0,
          verified_claims: [],
          unverified_claims: [],
          source_coverage: 0,
          processing_time: Date.now() - startTime,
          knowledge_gaps: ['No specific claims detected for verification']
        };
      }
      
      // Verify each claim against knowledge sources
      const verificationPromises = claims.map(claim => this.verifyClaim(claim));
      const verificationResults = await Promise.all(verificationPromises);
      
      // Calculate enhanced accuracy based on verification results
      const verifiedClaims = verificationResults.filter(r => r.verification_status === 'verified');
      const contradictedClaims = verificationResults.filter(r => r.verification_status === 'contradicted');
      const partialClaims = verificationResults.filter(r => r.verification_status === 'partial');
      const unsupportedClaims = verificationResults.filter(r => r.verification_status === 'unsupported');
      
      // Calculate accuracy adjustments
      const verificationBonus = (verifiedClaims.length / claims.length) * 15; // Up to 15% bonus
      const contradictionPenalty = (contradictedClaims.length / claims.length) * 25; // Up to 25% penalty
      const partialPenalty = (partialClaims.length / claims.length) * 10; // Up to 10% penalty
      const unsupportedPenalty = (unsupportedClaims.length / claims.length) * 20; // Up to 20% penalty
      
      const originalAccuracy = 75 + Math.random() * 20; // Baseline accuracy
      const ragEnhancedAccuracy = Math.max(0, Math.min(100, 
        originalAccuracy + verificationBonus - contradictionPenalty - partialPenalty - unsupportedPenalty
      ));
      
      const improvementScore = ragEnhancedAccuracy - originalAccuracy;
      
      // Calculate source coverage
      const totalSources = this.knowledgeSources.filter(s => s.enabled).length;
      const sourcesUsed = new Set(verificationResults.flatMap(r => 
        [...r.supporting_documents, ...r.contradicting_documents].map(d => d.source_id)
      )).size;
      const sourceCoverage = (sourcesUsed / totalSources) * 100;
      
      // Identify knowledge gaps
      const knowledgeGaps = unsupportedClaims.map(r => r.claim);
      
      console.log(`RAG analysis completed: ${verifiedClaims.length} verified, ${contradictedClaims.length} contradicted`);
      
      return {
        original_accuracy: parseFloat(originalAccuracy.toFixed(1)),
        rag_enhanced_accuracy: parseFloat(ragEnhancedAccuracy.toFixed(1)),
        improvement_score: parseFloat(improvementScore.toFixed(1)),
        verified_claims: verificationResults,
        unverified_claims: knowledgeGaps,
        source_coverage: parseFloat(sourceCoverage.toFixed(1)),
        processing_time: Date.now() - startTime,
        knowledge_gaps: knowledgeGaps.length > 0 ? knowledgeGaps : []
      };
      
    } catch (error) {
      console.error('Error in RAG analysis:', error);
      throw new Error(`RAG analysis failed: ${error.message}`);
    }
  }

  /**
   * Get available knowledge sources
   */
  getKnowledgeSources(): KnowledgeSource[] {
    return [...this.knowledgeSources];
  }

  /**
   * Update knowledge source configuration
   */
  updateKnowledgeSource(sourceId: string, updates: Partial<KnowledgeSource>): void {
    const index = this.knowledgeSources.findIndex(s => s.id === sourceId);
    if (index !== -1) {
      this.knowledgeSources[index] = { ...this.knowledgeSources[index], ...updates };
    }
  }

  /**
   * Add custom knowledge source
   */
  addCustomKnowledgeSource(source: Omit<KnowledgeSource, 'id'>): KnowledgeSource {
    const newSource: KnowledgeSource = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...source
    };
    
    this.knowledgeSources.push(newSource);
    return newSource;
  }

  /**
   * Remove knowledge source
   */
  removeKnowledgeSource(sourceId: string): boolean {
    const index = this.knowledgeSources.findIndex(s => s.id === sourceId);
    if (index !== -1) {
      this.knowledgeSources.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Search for specific information across knowledge sources
   */
  async searchKnowledgeBase(query: string, filters?: {
    sourceTypes?: string[];
    minReliability?: number;
    maxAge?: number; // days
  }): Promise<RetrievedDocument[]> {
    try {
      let filteredSources = this.knowledgeSources.filter(s => s.enabled);
      
      if (filters?.sourceTypes) {
        filteredSources = filteredSources.filter(s => filters.sourceTypes!.includes(s.type));
      }
      
      if (filters?.minReliability) {
        filteredSources = filteredSources.filter(s => s.reliability_score >= filters.minReliability!);
      }
      
      const documents = await this.retrieveDocuments(query, 10);
      
      // Apply age filter if specified
      if (filters?.maxAge) {
        const cutoffDate = new Date(Date.now() - filters.maxAge * 24 * 60 * 60 * 1000);
        return documents.filter(doc => 
          !doc.publication_date || new Date(doc.publication_date) >= cutoffDate
        );
      }
      
      return documents;
      
    } catch (error) {
      console.error('Error searching knowledge base:', error);
      return [];
    }
  }

  /**
   * Get reliability metrics for the knowledge base
   */
  getKnowledgeBaseMetrics(): {
    totalSources: number;
    enabledSources: number;
    averageReliability: number;
    sourceTypes: Record<string, number>;
    lastUpdated: string;
  } {
    const enabledSources = this.knowledgeSources.filter(s => s.enabled);
    const avgReliability = enabledSources.length > 0
      ? enabledSources.reduce((sum, s) => sum + s.reliability_score, 0) / enabledSources.length
      : 0;
    
    const sourceTypes = this.knowledgeSources.reduce((acc, source) => {
      acc[source.type] = (acc[source.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const lastUpdated = this.knowledgeSources.reduce((latest, source) => {
      return new Date(source.last_updated) > new Date(latest) ? source.last_updated : latest;
    }, this.knowledgeSources[0]?.last_updated || new Date().toISOString());
    
    return {
      totalSources: this.knowledgeSources.length,
      enabledSources: enabledSources.length,
      averageReliability: parseFloat(avgReliability.toFixed(3)),
      sourceTypes,
      lastUpdated
    };
  }
}

// Create singleton instance
const ragService = new RAGService();
export default ragService;