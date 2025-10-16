/**
 * Wikipedia API provider for knowledge retrieval
 * Uses the Wikipedia REST API and MediaWiki API for content extraction
 */

import {
  BaseKnowledgeProvider,
  KnowledgeDocument,
  SearchOptions,
  ReliabilityMetrics,
  KnowledgeProviderResult,
  KnowledgeProviderError
} from './base';

interface WikipediaSearchResult {
  pageid: number;
  title: string;
  snippet: string;
  size: number;
  wordcount: number;
  timestamp: string;
}

interface WikipediaPage {
  pageid: number;
  title: string;
  extract: string;
  fullurl: string;
  touched: string;
  categories?: Array<{ title: string }>;
  pageprops?: {
    wikibase_item?: string;
    page_image?: string;
  };
}

interface WikipediaQualityMetrics {
  assessmentClass?: string; // FA, GA, B, C, Start, Stub
  importance?: string; // Top, High, Mid, Low
  pageViews?: number;
  editCount?: number;
  references?: number;
}

export class WikipediaProvider extends BaseKnowledgeProvider {
  private readonly apiUrl = 'https://en.wikipedia.org/api/rest_v1';
  private readonly mediaWikiUrl = 'https://en.wikipedia.org/w/api.php';
  private readonly baseReliability = 0.85;

  constructor() {
    super('Wikipedia', 'https://en.wikipedia.org', 1000); // 1 second rate limit
  }

  async search(query: string, options: SearchOptions = {}): Promise<KnowledgeProviderResult> {
    const startTime = Date.now();
    
    try {
      await this.enforceRateLimit();

      // Search for relevant articles
      const searchResults = await this.searchArticles(query, options.limit || 5);
      
      // Get full content for each result
      const documents: KnowledgeDocument[] = [];
      
      for (const result of searchResults) {
        try {
          const document = await this.getDocumentByPageId(result.pageid);
          if (document) {
            documents.push(document);
          }
        } catch (error) {
          console.warn(`Failed to fetch Wikipedia page ${result.pageid}:`, error);
          // Continue with other results
        }
      }

      // Calculate overall reliability metrics
      const reliability = this.calculateOverallReliability(documents);

      return {
        documents,
        reliability,
        searchMetadata: {
          query,
          totalResults: searchResults.length,
          searchTime: Date.now() - startTime,
          provider: this.name
        }
      };

    } catch (error) {
      throw new KnowledgeProviderError(
        `Wikipedia search failed: ${error.message}`,
        this.name,
        'SEARCH_ERROR'
      );
    }
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    try {
      await this.enforceRateLimit();
      
      // Try to parse as page ID first, then as title
      const pageId = parseInt(id);
      if (!isNaN(pageId)) {
        return await this.getDocumentByPageId(pageId);
      } else {
        return await this.getDocumentByTitle(id);
      }
    } catch (error) {
      console.error(`Failed to get Wikipedia document ${id}:`, error);
      return null;
    }
  }

  calculateReliability(document: KnowledgeDocument): ReliabilityMetrics {
    const metadata = document.metadata || {};
    
    // Source quality based on Wikipedia's assessment system
    let sourceQuality = this.baseReliability;
    
    if (metadata.assessmentClass) {
      const classScores = {
        'FA': 1.0,    // Featured Article
        'GA': 0.95,   // Good Article
        'B': 0.85,    // B-class
        'C': 0.75,    // C-class
        'Start': 0.65, // Start-class
        'Stub': 0.5   // Stub
      };
      sourceQuality = classScores[metadata.assessmentClass] || sourceQuality;
    }

    // Content quality based on length, references, structure
    const contentQuality = this.calculateContentQuality(document.content, metadata);

    // Recency score
    const recency = this.calculateRecencyScore(document.lastModified);

    // Citation count from metadata
    const citations = metadata.references || 0;

    // Calculate overall score with Wikipedia-specific weighting
    const overallScore = (
      sourceQuality * 0.3 +      // Wikipedia's editorial process
      contentQuality * 0.4 +     // Content comprehensiveness
      recency * 0.2 +            // How recently updated
      Math.min(1.0, citations / 20) * 0.1  // Reference density
    );

    return {
      sourceQuality,
      contentQuality,
      recency,
      citations,
      overallScore: Math.min(1.0, overallScore)
    };
  }

  getProviderInfo() {
    return {
      name: 'Wikipedia',
      type: 'encyclopedia',
      baseReliability: this.baseReliability,
      supportedLanguages: ['en'], // Can be extended for other language editions
      rateLimit: this.rateLimitDelay
    };
  }

  private async searchArticles(query: string, limit: number): Promise<WikipediaSearchResult[]> {
    const searchUrl = new URL(this.mediaWikiUrl);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', query);
    searchUrl.searchParams.set('srlimit', limit.toString());
    searchUrl.searchParams.set('srprop', 'snippet|size|wordcount|timestamp');
    searchUrl.searchParams.set('origin', '*');

    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      throw new Error(`Wikipedia search API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Wikipedia API error: ${data.error.info}`);
    }

    return data.query?.search || [];
  }

  private async getDocumentByPageId(pageId: number): Promise<KnowledgeDocument | null> {
    try {
      // Get page content and metadata
      const [pageData, qualityMetrics] = await Promise.all([
        this.fetchPageData(pageId),
        this.fetchQualityMetrics(pageId)
      ]);

      if (!pageData) return null;

      return this.createDocument(pageData, qualityMetrics);
    } catch (error) {
      console.error(`Error fetching Wikipedia page ${pageId}:`, error);
      return null;
    }
  }

  private async getDocumentByTitle(title: string): Promise<KnowledgeDocument | null> {
    try {
      // First get page ID from title
      const pageUrl = new URL(this.mediaWikiUrl);
      pageUrl.searchParams.set('action', 'query');
      pageUrl.searchParams.set('format', 'json');
      pageUrl.searchParams.set('titles', title);
      pageUrl.searchParams.set('origin', '*');

      const response = await fetch(pageUrl.toString());
      const data = await response.json();

      const pages = data.query?.pages;
      if (!pages) return null;

      const pageId = Object.keys(pages)[0];
      if (pageId === '-1') return null; // Page not found

      return await this.getDocumentByPageId(parseInt(pageId));
    } catch (error) {
      console.error(`Error fetching Wikipedia page by title ${title}:`, error);
      return null;
    }
  }

  private async fetchPageData(pageId: number): Promise<WikipediaPage | null> {
    const pageUrl = new URL(this.mediaWikiUrl);
    pageUrl.searchParams.set('action', 'query');
    pageUrl.searchParams.set('format', 'json');
    pageUrl.searchParams.set('pageids', pageId.toString());
    pageUrl.searchParams.set('prop', 'extracts|info|categories|pageprops');
    pageUrl.searchParams.set('exintro', 'false');
    pageUrl.searchParams.set('explaintext', 'true');
    pageUrl.searchParams.set('exsectionformat', 'plain');
    pageUrl.searchParams.set('inprop', 'url|touched');
    pageUrl.searchParams.set('origin', '*');

    const response = await fetch(pageUrl.toString());
    
    if (!response.ok) {
      throw new Error(`Wikipedia page API error: ${response.status}`);
    }

    const data = await response.json();
    const pages = data.query?.pages;
    
    if (!pages || pages[pageId]?.missing) {
      return null;
    }

    return pages[pageId];
  }

  private async fetchQualityMetrics(pageId: number): Promise<WikipediaQualityMetrics> {
    try {
      // Fetch page assessment data (if available)
      const assessmentUrl = new URL(this.mediaWikiUrl);
      assessmentUrl.searchParams.set('action', 'query');
      assessmentUrl.searchParams.set('format', 'json');
      assessmentUrl.searchParams.set('pageids', pageId.toString());
      assessmentUrl.searchParams.set('prop', 'pageassessments');
      assessmentUrl.searchParams.set('origin', '*');

      const response = await fetch(assessmentUrl.toString());
      const data = await response.json();

      const assessments = data.query?.pages?.[pageId]?.pageassessments;
      
      let assessmentClass: string | undefined;
      let importance: string | undefined;

      if (assessments) {
        // Get the highest quality assessment
        for (const project in assessments) {
          const assessment = assessments[project];
          if (assessment.class && !assessmentClass) {
            assessmentClass = assessment.class;
          }
          if (assessment.importance && !importance) {
            importance = assessment.importance;
          }
        }
      }

      return {
        assessmentClass,
        importance,
        // These would require additional API calls or parsing
        pageViews: undefined,
        editCount: undefined,
        references: undefined
      };
    } catch (error) {
      console.warn(`Failed to fetch quality metrics for page ${pageId}:`, error);
      return {};
    }
  }

  private createDocument(pageData: WikipediaPage, qualityMetrics: WikipediaQualityMetrics): KnowledgeDocument {
    const content = this.cleanContent(pageData.extract || '');
    const keyInfo = this.extractKeyInfo(content);

    // Extract categories
    const categories = pageData.categories?.map(cat => 
      cat.title.replace('Category:', '')
    ) || [];

    // Count references in content (rough estimate)
    const referenceCount = (content.match(/\[\d+\]/g) || []).length;

    return {
      id: pageData.pageid.toString(),
      title: pageData.title,
      content,
      url: pageData.fullurl,
      lastModified: pageData.touched,
      language: 'en',
      categories,
      metadata: {
        ...qualityMetrics,
        references: referenceCount,
        wordCount: content.split(/\s+/).length,
        keyInfo,
        wikibaseItem: pageData.pageprops?.wikibase_item,
        pageImage: pageData.pageprops?.page_image
      }
    };
  }

  private calculateOverallReliability(documents: KnowledgeDocument[]): ReliabilityMetrics {
    if (documents.length === 0) {
      return {
        sourceQuality: 0,
        contentQuality: 0,
        recency: 0,
        citations: 0,
        overallScore: 0
      };
    }

    const reliabilities = documents.map(doc => this.calculateReliability(doc));

    return {
      sourceQuality: reliabilities.reduce((sum, r) => sum + r.sourceQuality, 0) / documents.length,
      contentQuality: reliabilities.reduce((sum, r) => sum + r.contentQuality, 0) / documents.length,
      recency: reliabilities.reduce((sum, r) => sum + r.recency, 0) / documents.length,
      citations: reliabilities.reduce((sum, r) => sum + r.citations, 0),
      overallScore: reliabilities.reduce((sum, r) => sum + r.overallScore, 0) / documents.length
    };
  }
}