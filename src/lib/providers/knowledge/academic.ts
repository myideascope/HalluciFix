import { logger } from '../../logging';

/**
 * Academic sources provider for arXiv and PubMed
 * Provides access to peer-reviewed research papers and preprints
 */

import {
  BaseKnowledgeProvider,
  KnowledgeDocument,
  SearchOptions,
  ReliabilityMetrics,
  KnowledgeProviderResult,
  KnowledgeProviderError
} from './base';

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: Array<{ name: string }>;
  published: string;
  updated: string;
  categories: string[];
  doi?: string;
  journal_ref?: string;
  links: Array<{ href: string; type: string; title?: string }>;
}

interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: Array<{ name: string; affiliation?: string }>;
  journal: string;
  pubdate: string;
  doi?: string;
  pmc?: string;
  keywords?: string[];
  mesh_terms?: string[];
  publication_types?: string[];
}

interface CitationMetrics {
  citationCount?: number;
  hIndex?: number;
  impactFactor?: number;
  journalRank?: string;
  peerReviewed: boolean;
}

export class AcademicProvider extends BaseKnowledgeProvider {
  private readonly arxivUrl = 'http://export.arxiv.org/api/query';
  private readonly pubmedUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private readonly baseReliability = 0.92;

  constructor() {
    super('Academic Sources', 'https://arxiv.org', 3000); // 3 second rate limit for academic APIs
  }

  async search(query: string, options: SearchOptions = {}): Promise<KnowledgeProviderResult> {
    const startTime = Date.now();
    
    try {
      // Search both arXiv and PubMed in parallel
      const [arxivResults, pubmedResults] = await Promise.all([
        this.searchArxiv(query, Math.ceil((options.limit || 5) / 2)),
        this.searchPubMed(query, Math.ceil((options.limit || 5) / 2))
      ]);

      const documents: KnowledgeDocument[] = [
        ...arxivResults,
        ...pubmedResults
      ];

      // Sort by relevance and recency
      documents.sort((a, b) => {
        const aReliability = this.calculateReliability(a);
        const bReliability = this.calculateReliability(b);
        return bReliability.overallScore - aReliability.overallScore;
      });

      // Limit results
      const limitedDocuments = documents.slice(0, options.limit || 5);

      const reliability = this.calculateOverallReliability(limitedDocuments);

      return {
        documents: limitedDocuments,
        reliability,
        searchMetadata: {
          query,
          totalResults: documents.length,
          searchTime: Date.now() - startTime,
          provider: this.name
        }
      };

    } catch (error) {
      throw new KnowledgeProviderError(
        `Academic search failed: ${error.message}`,
        this.name,
        'SEARCH_ERROR'
      );
    }
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    try {
      await this.enforceRateLimit();

      // Determine if it's an arXiv ID or PubMed ID
      if (id.match(/^\d{4}\.\d{4,5}(v\d+)?$/)) {
        // arXiv ID format
        return await this.getArxivDocument(id);
      } else if (id.match(/^\d+$/)) {
        // PubMed ID format
        return await this.getPubMedDocument(id);
      } else {
        console.warn(`Unknown academic document ID format: ${id}`);
        return null;
      }
    } catch (error) {
      console.error(`Failed to get academic document ${id}:`, error);
      return null;
    }
  }

  calculateReliability(document: KnowledgeDocument): ReliabilityMetrics {
    const metadata = document.metadata || {};
    const citationMetrics: CitationMetrics = metadata.citationMetrics || {};

    // Source quality based on peer review status and journal reputation
    let sourceQuality = this.baseReliability;
    
    if (citationMetrics.peerReviewed) {
      sourceQuality += 0.05; // Bonus for peer review
    }

    if (citationMetrics.impactFactor) {
      // Impact factor bonus (normalized)
      const impactBonus = Math.min(0.1, citationMetrics.impactFactor / 50);
      sourceQuality += impactBonus;
    }

    if (metadata.source === 'arxiv' && !citationMetrics.peerReviewed) {
      sourceQuality -= 0.1; // Slight penalty for preprints
    }

    // Content quality based on abstract length, keywords, methodology indicators
    const contentQuality = this.calculateAcademicContentQuality(document);

    // Recency score
    const recency = this.calculateRecencyScore(document.publicationDate);

    // Citation count
    const citations = citationMetrics.citationCount || 0;

    // Calculate overall score with academic-specific weighting
    const overallScore = (
      sourceQuality * 0.35 +      // Peer review and journal quality
      contentQuality * 0.25 +     // Content comprehensiveness
      recency * 0.15 +            // How recent the research is
      Math.min(1.0, citations / 100) * 0.25  // Citation impact
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
      name: 'Academic Sources',
      type: 'academic',
      baseReliability: this.baseReliability,
      supportedLanguages: ['en'],
      rateLimit: this.rateLimitDelay
    };
  }

  private async searchArxiv(query: string, limit: number): Promise<KnowledgeDocument[]> {
    try {
      await this.enforceRateLimit();

      const searchUrl = new URL(this.arxivUrl);
      searchUrl.searchParams.set('search_query', `all:${query}`);
      searchUrl.searchParams.set('start', '0');
      searchUrl.searchParams.set('max_results', limit.toString());
      searchUrl.searchParams.set('sortBy', 'relevance');
      searchUrl.searchParams.set('sortOrder', 'descending');

      const response = await fetch(searchUrl.toString());
      
      if (!response.ok) {
        throw new Error(`arXiv API error: ${response.status}`);
      }

      const xmlText = await response.text();
      const entries = this.parseArxivXML(xmlText);

      return entries.map(entry => this.createArxivDocument(entry));
    } catch (error) {
      logger.error("arXiv search error:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  private async searchPubMed(query: string, limit: number): Promise<KnowledgeDocument[]> {
    try {
      await this.enforceRateLimit();

      // First, search for PMIDs
      const searchUrl = new URL(`${this.pubmedUrl}/esearch.fcgi`);
      searchUrl.searchParams.set('db', 'pubmed');
      searchUrl.searchParams.set('term', query);
      searchUrl.searchParams.set('retmax', limit.toString());
      searchUrl.searchParams.set('retmode', 'json');
      searchUrl.searchParams.set('sort', 'relevance');

      const searchResponse = await fetch(searchUrl.toString());
      const searchData = await searchResponse.json();

      if (!searchData.esearchresult?.idlist?.length) {
        return [];
      }

      const pmids = searchData.esearchresult.idlist;

      // Then fetch details for each PMID
      await this.enforceRateLimit();

      const fetchUrl = new URL(`${this.pubmedUrl}/efetch.fcgi`);
      fetchUrl.searchParams.set('db', 'pubmed');
      fetchUrl.searchParams.set('id', pmids.join(','));
      fetchUrl.searchParams.set('retmode', 'xml');

      const fetchResponse = await fetch(fetchUrl.toString());
      const xmlText = await fetchResponse.text();

      const articles = this.parsePubMedXML(xmlText);
      return articles.map(article => this.createPubMedDocument(article));

    } catch (error) {
      logger.error("PubMed search error:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  private parseArxivXML(xmlText: string): ArxivEntry[] {
    // Simple XML parsing for arXiv feed
    const entries: ArxivEntry[] = [];
    
    try {
      // Extract entry blocks
      const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || [];
      
      for (const entryXml of entryMatches) {
        const entry: ArxivEntry = {
          id: this.extractXMLValue(entryXml, 'id') || '',
          title: this.extractXMLValue(entryXml, 'title') || '',
          summary: this.extractXMLValue(entryXml, 'summary') || '',
          authors: this.extractArxivAuthors(entryXml),
          published: this.extractXMLValue(entryXml, 'published') || '',
          updated: this.extractXMLValue(entryXml, 'updated') || '',
          categories: this.extractArxivCategories(entryXml),
          doi: this.extractXMLValue(entryXml, 'arxiv:doi'),
          journal_ref: this.extractXMLValue(entryXml, 'arxiv:journal_ref'),
          links: this.extractArxivLinks(entryXml)
        };

        if (entry.id && entry.title) {
          entries.push(entry);
        }
      }
    } catch (error) {
      logger.error("Error parsing arXiv XML:", error instanceof Error ? error : new Error(String(error)));
    }

    return entries;
  }

  private parsePubMedXML(xmlText: string): PubMedArticle[] {
    const articles: PubMedArticle[] = [];
    
    try {
      // Extract PubmedArticle blocks
      const articleMatches = xmlText.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
      
      for (const articleXml of articleMatches) {
        const article: PubMedArticle = {
          pmid: this.extractXMLValue(articleXml, 'PMID') || '',
          title: this.extractXMLValue(articleXml, 'ArticleTitle') || '',
          abstract: this.extractPubMedAbstract(articleXml),
          authors: this.extractPubMedAuthors(articleXml),
          journal: this.extractXMLValue(articleXml, 'Title') || '', // Journal title
          pubdate: this.extractPubMedDate(articleXml),
          doi: this.extractPubMedDOI(articleXml),
          keywords: this.extractPubMedKeywords(articleXml),
          mesh_terms: this.extractPubMedMeshTerms(articleXml),
          publication_types: this.extractPubMedPublicationTypes(articleXml)
        };

        if (article.pmid && article.title) {
          articles.push(article);
        }
      }
    } catch (error) {
      logger.error("Error parsing PubMed XML:", error instanceof Error ? error : new Error(String(error)));
    }

    return articles;
  }

  private extractXMLValue(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1].trim() : undefined;
  }

  private extractArxivAuthors(xml: string): Array<{ name: string }> {
    const authorMatches = xml.match(/<author>[\s\S]*?<\/author>/g) || [];
    return authorMatches.map(authorXml => ({
      name: this.extractXMLValue(authorXml, 'name') || 'Unknown'
    }));
  }

  private extractArxivCategories(xml: string): string[] {
    const categoryMatches = xml.match(/<category\s+term="([^"]+)"/g) || [];
    return categoryMatches.map(match => {
      const termMatch = match.match(/term="([^"]+)"/);
      return termMatch ? termMatch[1] : '';
    }).filter(Boolean);
  }

  private extractArxivLinks(xml: string): Array<{ href: string; type: string; title?: string }> {
    const linkMatches = xml.match(/<link[^>]*>/g) || [];
    return linkMatches.map(linkXml => {
      const hrefMatch = linkXml.match(/href="([^"]+)"/);
      const typeMatch = linkXml.match(/type="([^"]+)"/);
      const titleMatch = linkXml.match(/title="([^"]+)"/);
      
      return {
        href: hrefMatch ? hrefMatch[1] : '',
        type: typeMatch ? typeMatch[1] : '',
        title: titleMatch ? titleMatch[1] : undefined
      };
    }).filter(link => link.href);
  }

  private extractPubMedAbstract(xml: string): string {
    const abstractMatch = xml.match(/<Abstract>[\s\S]*?<\/Abstract>/);
    if (!abstractMatch) return '';
    
    const abstractXml = abstractMatch[0];
    const textMatches = abstractXml.match(/<AbstractText[^>]*>([^<]*)<\/AbstractText>/g) || [];
    
    return textMatches.map(textXml => {
      const match = textXml.match(/<AbstractText[^>]*>([^<]*)<\/AbstractText>/);
      return match ? match[1] : '';
    }).join(' ').trim();
  }

  private extractPubMedAuthors(xml: string): Array<{ name: string; affiliation?: string }> {
    const authorMatches = xml.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) || [];
    return authorMatches.map(authorXml => {
      const lastName = this.extractXMLValue(authorXml, 'LastName') || '';
      const foreName = this.extractXMLValue(authorXml, 'ForeName') || '';
      const affiliation = this.extractXMLValue(authorXml, 'Affiliation');
      
      return {
        name: `${foreName} ${lastName}`.trim() || 'Unknown',
        affiliation
      };
    });
  }

  private extractPubMedDate(xml: string): string {
    const pubDateMatch = xml.match(/<PubDate>[\s\S]*?<\/PubDate>/);
    if (!pubDateMatch) return '';
    
    const pubDateXml = pubDateMatch[0];
    const year = this.extractXMLValue(pubDateXml, 'Year') || '';
    const month = this.extractXMLValue(pubDateXml, 'Month') || '01';
    const day = this.extractXMLValue(pubDateXml, 'Day') || '01';
    
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  private extractPubMedDOI(xml: string): string | undefined {
    const doiMatch = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
    return doiMatch ? doiMatch[1] : undefined;
  }

  private extractPubMedKeywords(xml: string): string[] {
    const keywordMatches = xml.match(/<Keyword[^>]*>([^<]+)<\/Keyword>/g) || [];
    return keywordMatches.map(match => {
      const keywordMatch = match.match(/<Keyword[^>]*>([^<]+)<\/Keyword>/);
      return keywordMatch ? keywordMatch[1] : '';
    }).filter(Boolean);
  }

  private extractPubMedMeshTerms(xml: string): string[] {
    const meshMatches = xml.match(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/g) || [];
    return meshMatches.map(match => {
      const meshMatch = match.match(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/);
      return meshMatch ? meshMatch[1] : '';
    }).filter(Boolean);
  }

  private extractPubMedPublicationTypes(xml: string): string[] {
    const typeMatches = xml.match(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g) || [];
    return typeMatches.map(match => {
      const typeMatch = match.match(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/);
      return typeMatch ? typeMatch[1] : '';
    }).filter(Boolean);
  }

  private createArxivDocument(entry: ArxivEntry): KnowledgeDocument {
    const content = this.cleanContent(entry.summary);
    const arxivId = entry.id.split('/').pop() || entry.id;

    // Determine if it's peer-reviewed based on journal reference
    const peerReviewed = !!entry.journal_ref;

    return {
      id: arxivId,
      title: entry.title.replace(/\s+/g, ' ').trim(),
      content,
      url: `https://arxiv.org/abs/${arxivId}`,
      author: entry.authors.map(a => a.name).join(', '),
      publicationDate: entry.published,
      lastModified: entry.updated,
      language: 'en',
      categories: entry.categories,
      metadata: {
        source: 'arxiv',
        doi: entry.doi,
        journalRef: entry.journal_ref,
        citationMetrics: {
          peerReviewed,
          citationCount: 0 // Would need additional API call to get citation count
        },
        links: entry.links,
        wordCount: content.split(/\s+/).length
      }
    };
  }

  private createPubMedDocument(article: PubMedArticle): KnowledgeDocument {
    const content = this.cleanContent(article.abstract);

    return {
      id: article.pmid,
      title: article.title.replace(/\s+/g, ' ').trim(),
      content,
      url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
      author: article.authors.map(a => a.name).join(', '),
      publicationDate: article.pubdate,
      language: 'en',
      categories: [...(article.keywords || []), ...(article.mesh_terms || [])],
      metadata: {
        source: 'pubmed',
        journal: article.journal,
        doi: article.doi,
        pmc: article.pmc,
        keywords: article.keywords,
        meshTerms: article.mesh_terms,
        publicationTypes: article.publication_types,
        citationMetrics: {
          peerReviewed: true, // PubMed articles are generally peer-reviewed
          citationCount: 0 // Would need additional API call
        },
        wordCount: content.split(/\s+/).length
      }
    };
  }

  private calculateAcademicContentQuality(document: KnowledgeDocument): number {
    let score = 0.5; // Base score

    const content = document.content;
    const metadata = document.metadata || {};

    // Length factor (academic abstracts should be substantial)
    const wordCount = content.split(/\s+/).length;
    if (wordCount > 100) score += 0.1;
    if (wordCount > 200) score += 0.1;
    if (wordCount > 300) score += 0.1;

    // Methodology indicators
    const methodologyTerms = /\b(?:method|methodology|analysis|study|research|experiment|data|results|conclusion|hypothesis|statistical|significant|correlation|regression)\b/gi;
    const methodologyMatches = (content.match(methodologyTerms) || []).length;
    score += Math.min(0.2, methodologyMatches * 0.02);

    // Keywords and MeSH terms
    if (metadata.keywords?.length > 0) score += 0.1;
    if (metadata.meshTerms?.length > 0) score += 0.1;

    // Journal quality (if available)
    if (metadata.journalRef || metadata.journal) score += 0.1;

    // DOI presence (indicates formal publication)
    if (metadata.doi) score += 0.05;

    return Math.min(1.0, score);
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

  private async getArxivDocument(id: string): Promise<KnowledgeDocument | null> {
    try {
      const searchUrl = new URL(this.arxivUrl);
      searchUrl.searchParams.set('id_list', id);
      searchUrl.searchParams.set('max_results', '1');

      const response = await fetch(searchUrl.toString());
      const xmlText = await response.text();
      const entries = this.parseArxivXML(xmlText);

      return entries.length > 0 ? this.createArxivDocument(entries[0]) : null;
    } catch (error) {
      console.error(`Error fetching arXiv document ${id}:`, error);
      return null;
    }
  }

  private async getPubMedDocument(id: string): Promise<KnowledgeDocument | null> {
    try {
      const fetchUrl = new URL(`${this.pubmedUrl}/efetch.fcgi`);
      fetchUrl.searchParams.set('db', 'pubmed');
      fetchUrl.searchParams.set('id', id);
      fetchUrl.searchParams.set('retmode', 'xml');

      const response = await fetch(fetchUrl.toString());
      const xmlText = await response.text();
      const articles = this.parsePubMedXML(xmlText);

      return articles.length > 0 ? this.createPubMedDocument(articles[0]) : null;
    } catch (error) {
      console.error(`Error fetching PubMed document ${id}:`, error);
      return null;
    }
  }
}