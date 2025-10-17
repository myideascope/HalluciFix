/**
 * API Connectivity Validator
 * Provides startup health checks and connectivity validation for all API providers
 */

import { logger } from '../../logging';
import { config } from '../../config';
import { BaseProvider, ProviderHealthStatus } from '../base/BaseProvider';
import { AIProvider } from '../interfaces/AIProvider';
import { AuthProvider } from '../interfaces/AuthProvider';
import { DriveProvider } from '../interfaces/DriveProvider';
import { KnowledgeProvider } from '../interfaces/KnowledgeProvider';

export interface ConnectivityTestResult {
  provider: string;
  type: 'ai' | 'auth' | 'drive' | 'knowledge' | 'database';
  isConnected: boolean;
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface ConnectivityValidationResult {
  isValid: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: ConnectivityTestResult[];
  criticalFailures: string[];
  warnings: string[];
  summary: {
    ai: { available: number; total: number };
    auth: { available: number; total: number };
    drive: { available: number; total: number };
    knowledge: { available: number; total: number };
    database: { available: number; total: number };
  };
}

export interface ValidationOptions {
  timeout?: number;
  skipOptional?: boolean;
  requireAllCritical?: boolean;
  enableRetries?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export class ApiConnectivityValidator {
  private static instance: ApiConnectivityValidator;
  private validationLogger = logger.child({ component: 'ApiConnectivityValidator' });
  private lastValidation: ConnectivityValidationResult | null = null;
  private validationInProgress = false;

  private constructor() {}

  static getInstance(): ApiConnectivityValidator {
    if (!ApiConnectivityValidator.instance) {
      ApiConnectivityValidator.instance = new ApiConnectivityValidator();
    }
    return ApiConnectivityValidator.instance;
  }

  /**
   * Validate all API connectivity before service initialization
   */
  async validateAllConnectivity(options: ValidationOptions = {}): Promise<ConnectivityValidationResult> {
    if (this.validationInProgress) {
      throw new Error('Connectivity validation already in progress');
    }

    this.validationInProgress = true;
    this.validationLogger.info('Starting comprehensive API connectivity validation');

    const startTime = Date.now();
    const results: ConnectivityTestResult[] = [];
    const criticalFailures: string[] = [];
    const warnings: string[] = [];

    try {
      // Test database connectivity (always critical)
      const databaseResults = await this.validateDatabaseConnectivity(options);
      results.push(...databaseResults);

      // Test AI providers
      const aiResults = await this.validateAIProviders(options);
      results.push(...aiResults);

      // Test Auth providers
      const authResults = await this.validateAuthProviders(options);
      results.push(...authResults);

      // Test Drive providers
      const driveResults = await this.validateDriveProviders(options);
      results.push(...driveResults);

      // Test Knowledge providers
      const knowledgeResults = await this.validateKnowledgeProviders(options);
      results.push(...knowledgeResults);

      // Analyze results
      const summary = this.analyzeSummary(results);
      const { criticalFailures: critical, warnings: warns } = this.analyzeFailures(results, options);
      
      criticalFailures.push(...critical);
      warnings.push(...warns);

      const totalTests = results.length;
      const passedTests = results.filter(r => r.isConnected).length;
      const failedTests = totalTests - passedTests;
      const isValid = criticalFailures.length === 0;

      const validationResult: ConnectivityValidationResult = {
        isValid,
        totalTests,
        passedTests,
        failedTests,
        results,
        criticalFailures,
        warnings,
        summary
      };

      this.lastValidation = validationResult;
      
      const duration = Date.now() - startTime;
      this.validationLogger.info('API connectivity validation completed', {
        duration,
        isValid,
        totalTests,
        passedTests,
        failedTests,
        criticalFailures: criticalFailures.length,
        warnings: warnings.length
      });

      return validationResult;

    } catch (error) {
      this.validationLogger.error('API connectivity validation failed', error as Error);
      throw error;
    } finally {
      this.validationInProgress = false;
    }
  }

  /**
   * Validate database connectivity
   */
  private async validateDatabaseConnectivity(options: ValidationOptions): Promise<ConnectivityTestResult[]> {
    const results: ConnectivityTestResult[] = [];
    
    // Test primary database
    const primaryResult = await this.testDatabaseConnection(
      'supabase-primary',
      config.database.url,
      config.database.anonKey,
      options
    );
    results.push(primaryResult);

    // Test read replicas if enabled
    if (config.database.enableReadReplicas && config.database.readReplicas) {
      for (let i = 0; i < config.database.readReplicas.length; i++) {
        const replica = config.database.readReplicas[i];
        const replicaResult = await this.testDatabaseConnection(
          `supabase-replica-${i + 1}`,
          replica.url,
          replica.key,
          options
        );
        results.push(replicaResult);
      }
    }

    return results;
  }

  /**
   * Test individual database connection
   */
  private async testDatabaseConnection(
    name: string,
    url: string,
    key: string,
    options: ValidationOptions
  ): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      // Import Supabase client dynamically to avoid circular dependencies
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(url, key);
      
      // Test with a simple query
      const { data, error } = await Promise.race([
        client.from('profiles').select('count', { count: 'exact', head: true }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database connection timeout')), options.timeout || 10000)
        )
      ]) as any;

      const responseTime = Date.now() - startTime;

      if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found" which is OK for connectivity test
        throw error;
      }

      return {
        provider: name,
        type: 'database',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          url: this.maskUrl(url),
          hasKey: !!key
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: name,
        type: 'database',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date(),
        details: {
          url: this.maskUrl(url),
          hasKey: !!key
        }
      };
    }
  }

  /**
   * Validate AI providers
   */
  private async validateAIProviders(options: ValidationOptions): Promise<ConnectivityTestResult[]> {
    const results: ConnectivityTestResult[] = [];

    // Test OpenAI
    if (config.ai.openai.enabled && config.ai.openai.apiKey) {
      const openaiResult = await this.testOpenAIConnection(options);
      results.push(openaiResult);
    }

    // Test Anthropic
    if (config.ai.anthropic.enabled && config.ai.anthropic.apiKey) {
      const anthropicResult = await this.testAnthropicConnection(options);
      results.push(anthropicResult);
    }

    // Test HalluciFix API
    if (config.ai.hallucifix?.enabled && config.ai.hallucifix.apiKey) {
      const hallucifixResult = await this.testHallucifixConnection(options);
      results.push(hallucifixResult);
    }

    return results;
  }

  /**
   * Test OpenAI API connection
   */
  private async testOpenAIConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await Promise.race([
        fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.ai.openai.apiKey}`,
            'Content-Type': 'application/json'
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('OpenAI API timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        provider: 'openai',
        type: 'ai',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          modelsAvailable: data.data?.length || 0,
          hasApiKey: !!config.ai.openai.apiKey
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'openai',
        type: 'ai',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date(),
        details: {
          hasApiKey: !!config.ai.openai.apiKey
        }
      };
    }
  }

  /**
   * Test Anthropic API connection
   */
  private async testAnthropicConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      // Test with a minimal completion request
      const response = await Promise.race([
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': config.ai.anthropic.apiKey!,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          })
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Anthropic API timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        provider: 'anthropic',
        type: 'ai',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          hasApiKey: !!config.ai.anthropic.apiKey
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'anthropic',
        type: 'ai',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date(),
        details: {
          hasApiKey: !!config.ai.anthropic.apiKey
        }
      };
    }
  }

  /**
   * Test HalluciFix API connection
   */
  private async testHallucifixConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      const apiUrl = config.ai.hallucifix?.apiUrl || 'https://api.hallucifix.com';
      const response = await Promise.race([
        fetch(`${apiUrl}/api/v1/auth/validate`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.ai.hallucifix?.apiKey}`,
            'Content-Type': 'application/json'
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('HalluciFix API timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        provider: 'hallucifix',
        type: 'ai',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          apiUrl: this.maskUrl(apiUrl),
          hasApiKey: !!config.ai.hallucifix?.apiKey,
          accountValid: data.valid || false
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'hallucifix',
        type: 'ai',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date(),
        details: {
          hasApiKey: !!config.ai.hallucifix?.apiKey
        }
      };
    }
  }

  /**
   * Validate Auth providers
   */
  private async validateAuthProviders(options: ValidationOptions): Promise<ConnectivityTestResult[]> {
    const results: ConnectivityTestResult[] = [];

    // Test Google OAuth
    if (config.auth.google.enabled && config.auth.google.clientId) {
      const googleResult = await this.testGoogleOAuthConnection(options);
      results.push(googleResult);
    }

    return results;
  }

  /**
   * Test Google OAuth connection
   */
  private async testGoogleOAuthConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      // Test OAuth discovery endpoint
      const response = await Promise.race([
        fetch('https://accounts.google.com/.well-known/openid_configuration'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Google OAuth discovery timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const discoveryData = await response.json();

      return {
        provider: 'google-oauth',
        type: 'auth',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          hasClientId: !!config.auth.google.clientId,
          hasClientSecret: !!config.auth.google.clientSecret,
          authorizationEndpoint: discoveryData.authorization_endpoint,
          tokenEndpoint: discoveryData.token_endpoint
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'google-oauth',
        type: 'auth',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date(),
        details: {
          hasClientId: !!config.auth.google.clientId,
          hasClientSecret: !!config.auth.google.clientSecret
        }
      };
    }
  }

  /**
   * Validate Drive providers
   */
  private async validateDriveProviders(options: ValidationOptions): Promise<ConnectivityTestResult[]> {
    const results: ConnectivityTestResult[] = [];

    // Test Google Drive API
    if (config.auth.google.enabled) {
      const driveResult = await this.testGoogleDriveConnection(options);
      results.push(driveResult);
    }

    return results;
  }

  /**
   * Test Google Drive API connection
   */
  private async testGoogleDriveConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      // Test Drive API discovery endpoint (doesn't require auth)
      const response = await Promise.race([
        fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Google Drive API discovery timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const discoveryData = await response.json();

      return {
        provider: 'google-drive',
        type: 'drive',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          apiVersion: discoveryData.version,
          baseUrl: discoveryData.baseUrl,
          hasOAuthConfig: !!(config.auth.google.clientId && config.auth.google.clientSecret)
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'google-drive',
        type: 'drive',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date(),
        details: {
          hasOAuthConfig: !!(config.auth.google.clientId && config.auth.google.clientSecret)
        }
      };
    }
  }

  /**
   * Validate Knowledge providers
   */
  private async validateKnowledgeProviders(options: ValidationOptions): Promise<ConnectivityTestResult[]> {
    const results: ConnectivityTestResult[] = [];

    // Test Wikipedia API
    const wikipediaResult = await this.testWikipediaConnection(options);
    results.push(wikipediaResult);

    // Test arXiv API
    const arxivResult = await this.testArxivConnection(options);
    results.push(arxivResult);

    // Test PubMed API
    const pubmedResult = await this.testPubmedConnection(options);
    results.push(pubmedResult);

    return results;
  }

  /**
   * Test Wikipedia API connection
   */
  private async testWikipediaConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await Promise.race([
        fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Wikipedia'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Wikipedia API timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        provider: 'wikipedia',
        type: 'knowledge',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          apiVersion: 'REST v1',
          testPageFound: !!data.title
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'wikipedia',
        type: 'knowledge',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Test arXiv API connection
   */
  private async testArxivConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await Promise.race([
        fetch('http://export.arxiv.org/api/query?search_query=all:test&max_results=1'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('arXiv API timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        provider: 'arxiv',
        type: 'knowledge',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          apiVersion: 'Atom API',
          endpoint: 'export.arxiv.org'
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'arxiv',
        type: 'knowledge',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Test PubMed API connection
   */
  private async testPubmedConnection(options: ValidationOptions): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await Promise.race([
        fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=test&retmax=1'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PubMed API timeout')), options.timeout || 10000)
        )
      ]) as Response;

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        provider: 'pubmed',
        type: 'knowledge',
        isConnected: true,
        responseTime,
        timestamp: new Date(),
        details: {
          apiVersion: 'E-utilities',
          endpoint: 'eutils.ncbi.nlm.nih.gov'
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'pubmed',
        type: 'knowledge',
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Analyze connectivity results summary
   */
  private analyzeSummary(results: ConnectivityTestResult[]): ConnectivityValidationResult['summary'] {
    const summary = {
      ai: { available: 0, total: 0 },
      auth: { available: 0, total: 0 },
      drive: { available: 0, total: 0 },
      knowledge: { available: 0, total: 0 },
      database: { available: 0, total: 0 }
    };

    results.forEach(result => {
      summary[result.type].total++;
      if (result.isConnected) {
        summary[result.type].available++;
      }
    });

    return summary;
  }

  /**
   * Analyze failures and categorize them
   */
  private analyzeFailures(
    results: ConnectivityTestResult[], 
    options: ValidationOptions
  ): { criticalFailures: string[]; warnings: string[] } {
    const criticalFailures: string[] = [];
    const warnings: string[] = [];

    results.forEach(result => {
      if (!result.isConnected) {
        const message = `${result.provider} (${result.type}): ${result.error}`;
        
        // Database failures are always critical
        if (result.type === 'database') {
          criticalFailures.push(message);
        }
        // AI provider failures are critical if no mock services and no other AI providers available
        else if (result.type === 'ai' && !config.features.enableMockServices) {
          const availableAI = results.filter(r => r.type === 'ai' && r.isConnected).length;
          if (availableAI === 0) {
            criticalFailures.push(message);
          } else {
            warnings.push(message);
          }
        }
        // Auth failures are critical if no mock services
        else if (result.type === 'auth' && !config.features.enableMockServices) {
          criticalFailures.push(message);
        }
        // Other failures are warnings
        else {
          warnings.push(message);
        }
      }
    });

    return { criticalFailures, warnings };
  }

  /**
   * Get last validation result
   */
  getLastValidationResult(): ConnectivityValidationResult | null {
    return this.lastValidation;
  }

  /**
   * Check if validation is currently in progress
   */
  isValidationInProgress(): boolean {
    return this.validationInProgress;
  }

  /**
   * Mask sensitive URLs for logging
   */
  private maskUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url.replace(/\/\/[^@]+@/, '//***@');
    }
  }

  /**
   * Test specific provider connectivity
   */
  async testProviderConnectivity(
    provider: BaseProvider,
    options: ValidationOptions = {}
  ): Promise<ConnectivityTestResult> {
    const startTime = Date.now();
    
    try {
      const healthStatus = await provider.performHealthCheck();
      const responseTime = Date.now() - startTime;

      return {
        provider: provider.getName(),
        type: this.getProviderType(provider),
        isConnected: healthStatus.isHealthy,
        responseTime,
        error: healthStatus.errorMessage,
        timestamp: new Date(),
        details: {
          consecutiveFailures: healthStatus.consecutiveFailures,
          lastHealthCheck: healthStatus.lastHealthCheck
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        provider: provider.getName(),
        type: this.getProviderType(provider),
        isConnected: false,
        responseTime,
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get provider type from provider instance
   */
  private getProviderType(provider: BaseProvider): 'ai' | 'auth' | 'drive' | 'knowledge' {
    if (provider instanceof AIProvider) return 'ai';
    if (provider instanceof AuthProvider) return 'auth';
    if (provider instanceof DriveProvider) return 'drive';
    if (provider instanceof KnowledgeProvider) return 'knowledge';
    
    // Fallback based on provider name
    const name = provider.getName().toLowerCase();
    if (name.includes('openai') || name.includes('anthropic') || name.includes('ai')) return 'ai';
    if (name.includes('oauth') || name.includes('auth')) return 'auth';
    if (name.includes('drive') || name.includes('storage')) return 'drive';
    if (name.includes('wikipedia') || name.includes('arxiv') || name.includes('knowledge')) return 'knowledge';
    
    return 'ai'; // Default fallback
  }
}

// Export singleton instance
export const apiConnectivityValidator = ApiConnectivityValidator.getInstance();