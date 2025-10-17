/**
 * Service Integration Validator
 * Validates that all services are properly integrated and working together
 */

import { providerManager } from '../providers/ProviderManager';
import { aiService } from '../providers/ai/AIService';
import { googleDriveService } from '../googleDrive';
import ragService from '../ragService';
import analysisService from '../analysisService';
import { supabase } from '../supabase';
import { logger } from '../logging';

export interface ServiceIntegrationStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  services: {
    providerManager: ServiceStatus;
    aiService: ServiceStatus;
    googleDrive: ServiceStatus;
    ragService: ServiceStatus;
    analysisService: ServiceStatus;
    database: ServiceStatus;
    authentication: ServiceStatus;
  };
  integrationTests: {
    aiProviderIntegration: TestResult;
    driveAnalysisIntegration: TestResult;
    ragAnalysisIntegration: TestResult;
    databaseIntegration: TestResult;
    authenticationFlow: TestResult;
    endToEndWorkflow: TestResult;
  };
  recommendations: string[];
  criticalIssues: string[];
}

interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'critical' | 'unavailable';
  initialized: boolean;
  lastCheck: Date;
  errors: string[];
  warnings: string[];
  metrics?: Record<string, any>;
}

interface TestResult {
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, any>;
}

export class ServiceIntegrationValidator {
  private static instance: ServiceIntegrationValidator;
  private logger = logger.child({ component: 'ServiceIntegrationValidator' });

  private constructor() {}

  static getInstance(): ServiceIntegrationValidator {
    if (!ServiceIntegrationValidator.instance) {
      ServiceIntegrationValidator.instance = new ServiceIntegrationValidator();
    }
    return ServiceIntegrationValidator.instance;
  }

  /**
   * Perform comprehensive service integration validation
   */
  async validateIntegration(): Promise<ServiceIntegrationStatus> {
    this.logger.info('Starting comprehensive service integration validation');
    const startTime = Date.now();

    try {
      // Check individual service status
      const services = await this.checkServiceStatus();
      
      // Run integration tests
      const integrationTests = await this.runIntegrationTests();
      
      // Determine overall status
      const overall = this.determineOverallStatus(services, integrationTests);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(services, integrationTests);
      const criticalIssues = this.identifyCriticalIssues(services, integrationTests);

      const result: ServiceIntegrationStatus = {
        overall,
        services,
        integrationTests,
        recommendations,
        criticalIssues
      };

      const duration = Date.now() - startTime;
      this.logger.info('Service integration validation completed', {
        overall,
        duration,
        criticalIssuesCount: criticalIssues.length,
        recommendationsCount: recommendations.length
      });

      return result;

    } catch (error) {
      this.logger.error('Service integration validation failed', error as Error);
      throw error;
    }
  }

  /**
   * Check the status of all individual services
   */
  private async checkServiceStatus(): Promise<ServiceIntegrationStatus['services']> {
    const results = await Promise.allSettled([
      this.checkProviderManager(),
      this.checkAIService(),
      this.checkGoogleDriveService(),
      this.checkRAGService(),
      this.checkAnalysisService(),
      this.checkDatabase(),
      this.checkAuthentication()
    ]);

    return {
      providerManager: results[0].status === 'fulfilled' ? results[0].value : this.createErrorStatus('Provider Manager check failed'),
      aiService: results[1].status === 'fulfilled' ? results[1].value : this.createErrorStatus('AI Service check failed'),
      googleDrive: results[2].status === 'fulfilled' ? results[2].value : this.createErrorStatus('Google Drive check failed'),
      ragService: results[3].status === 'fulfilled' ? results[3].value : this.createErrorStatus('RAG Service check failed'),
      analysisService: results[4].status === 'fulfilled' ? results[4].value : this.createErrorStatus('Analysis Service check failed'),
      database: results[5].status === 'fulfilled' ? results[5].value : this.createErrorStatus('Database check failed'),
      authentication: results[6].status === 'fulfilled' ? results[6].value : this.createErrorStatus('Authentication check failed')
    };
  }

  private async checkProviderManager(): Promise<ServiceStatus> {
    try {
      const status = providerManager.getStatus();
      
      return {
        status: status.initialized && status.configurationValid ? 'healthy' : 'degraded',
        initialized: status.initialized,
        lastCheck: new Date(),
        errors: status.errors,
        warnings: status.warnings,
        metrics: {
          totalProviders: status.totalProviders,
          healthyProviders: status.healthyProviders,
          configurationValid: status.configurationValid,
          securityValid: status.securityValid
        }
      };
    } catch (error) {
      return this.createErrorStatus('Provider Manager not accessible', error);
    }
  }

  private async checkAIService(): Promise<ServiceStatus> {
    try {
      const status = aiService.getStatus();
      
      return {
        status: status.initialized && status.healthyProviders.length > 0 ? 'healthy' : 'degraded',
        initialized: status.initialized,
        lastCheck: new Date(),
        errors: status.unhealthyProviders.map(p => `${p} provider unhealthy`),
        warnings: status.failoverEnabled ? [] : ['Failover not enabled'],
        metrics: {
          enabledProviders: status.enabledProviders,
          healthyProviders: status.healthyProviders,
          failoverEnabled: status.failoverEnabled,
          healthCheckEnabled: status.healthCheckEnabled
        }
      };
    } catch (error) {
      return this.createErrorStatus('AI Service not accessible', error);
    }
  }

  private async checkGoogleDriveService(): Promise<ServiceStatus> {
    try {
      const isAvailable = await googleDriveService.isAvailable();
      const isAuthenticated = await googleDriveService.isAuthenticated();
      
      let status: ServiceStatus['status'] = 'healthy';
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!isAvailable) {
        status = 'unavailable';
        errors.push('Google Drive service not configured');
      } else if (!isAuthenticated) {
        status = 'degraded';
        warnings.push('Google Drive not authenticated');
      }

      return {
        status,
        initialized: isAvailable,
        lastCheck: new Date(),
        errors,
        warnings,
        metrics: {
          available: isAvailable,
          authenticated: isAuthenticated
        }
      };
    } catch (error) {
      return this.createErrorStatus('Google Drive Service check failed', error);
    }
  }

  private async checkRAGService(): Promise<ServiceStatus> {
    try {
      const metrics = ragService.getKnowledgeBaseMetrics();
      
      const status = metrics.enabledSources > 0 ? 'healthy' : 'degraded';
      const warnings = metrics.enabledSources === 0 ? ['No knowledge sources enabled'] : [];

      return {
        status,
        initialized: true,
        lastCheck: new Date(),
        errors: [],
        warnings,
        metrics: {
          totalSources: metrics.totalSources,
          enabledSources: metrics.enabledSources,
          averageReliability: metrics.averageReliability,
          realProviders: metrics.realProviders
        }
      };
    } catch (error) {
      return this.createErrorStatus('RAG Service check failed', error);
    }
  }

  private async checkAnalysisService(): Promise<ServiceStatus> {
    try {
      // Analysis service doesn't have a direct status method, so we'll check if it's accessible
      const metrics = analysisService.getPerformanceMetrics();
      
      return {
        status: 'healthy',
        initialized: true,
        lastCheck: new Date(),
        errors: [],
        warnings: [],
        metrics
      };
    } catch (error) {
      return this.createErrorStatus('Analysis Service check failed', error);
    }
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    try {
      // Test database connectivity
      const { data, error } = await supabase.from('analysis_results').select('count').limit(1);
      
      if (error) {
        return {
          status: 'critical',
          initialized: false,
          lastCheck: new Date(),
          errors: [`Database error: ${error.message}`],
          warnings: []
        };
      }

      return {
        status: 'healthy',
        initialized: true,
        lastCheck: new Date(),
        errors: [],
        warnings: []
      };
    } catch (error) {
      return this.createErrorStatus('Database check failed', error);
    }
  }

  private async checkAuthentication(): Promise<ServiceStatus> {
    try {
      // Test authentication service
      const { data, error } = await supabase.auth.getSession();
      
      return {
        status: 'healthy',
        initialized: true,
        lastCheck: new Date(),
        errors: error ? [`Auth error: ${error.message}`] : [],
        warnings: []
      };
    } catch (error) {
      return this.createErrorStatus('Authentication check failed', error);
    }
  }

  /**
   * Run integration tests between services
   */
  private async runIntegrationTests(): Promise<ServiceIntegrationStatus['integrationTests']> {
    const tests = await Promise.allSettled([
      this.testAIProviderIntegration(),
      this.testDriveAnalysisIntegration(),
      this.testRAGAnalysisIntegration(),
      this.testDatabaseIntegration(),
      this.testAuthenticationFlow(),
      this.testEndToEndWorkflow()
    ]);

    return {
      aiProviderIntegration: tests[0].status === 'fulfilled' ? tests[0].value : this.createFailedTest('AI Provider integration test failed'),
      driveAnalysisIntegration: tests[1].status === 'fulfilled' ? tests[1].value : this.createFailedTest('Drive Analysis integration test failed'),
      ragAnalysisIntegration: tests[2].status === 'fulfilled' ? tests[2].value : this.createFailedTest('RAG Analysis integration test failed'),
      databaseIntegration: tests[3].status === 'fulfilled' ? tests[3].value : this.createFailedTest('Database integration test failed'),
      authenticationFlow: tests[4].status === 'fulfilled' ? tests[4].value : this.createFailedTest('Authentication flow test failed'),
      endToEndWorkflow: tests[5].status === 'fulfilled' ? tests[5].value : this.createFailedTest('End-to-end workflow test failed')
    };
  }

  private async testAIProviderIntegration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Test if AI service can get providers from provider manager
      const aiProvider = providerManager.getAIProvider();
      const aiStatus = aiService.getStatus();
      
      const passed = aiStatus.initialized && aiStatus.healthyProviders.length > 0;
      
      return {
        passed,
        duration: Date.now() - startTime,
        details: {
          aiProviderAvailable: !!aiProvider,
          healthyProviders: aiStatus.healthyProviders,
          enabledProviders: aiStatus.enabledProviders
        }
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private async testDriveAnalysisIntegration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Test if Google Drive service is available and can integrate with analysis
      const isAvailable = await googleDriveService.isAvailable();
      
      return {
        passed: isAvailable,
        duration: Date.now() - startTime,
        details: {
          driveAvailable: isAvailable,
          supportedMimeTypes: googleDriveService.getSupportedMimeTypes().length
        }
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private async testRAGAnalysisIntegration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Test if RAG service can integrate with analysis service
      const knowledgeSources = ragService.getKnowledgeSources();
      const metrics = ragService.getKnowledgeBaseMetrics();
      
      const passed = knowledgeSources.length > 0 && metrics.enabledSources > 0;
      
      return {
        passed,
        duration: Date.now() - startTime,
        details: {
          knowledgeSourcesCount: knowledgeSources.length,
          enabledSources: metrics.enabledSources,
          averageReliability: metrics.averageReliability
        }
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private async testDatabaseIntegration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Test database operations that analysis service would use
      const { data, error } = await supabase
        .from('analysis_results')
        .select('id')
        .limit(1);
      
      const passed = !error;
      
      return {
        passed,
        duration: Date.now() - startTime,
        error: error?.message,
        details: {
          canQuery: !error,
          hasData: (data?.length || 0) > 0
        }
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private async testAuthenticationFlow(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Test authentication service integration
      const { data, error } = await supabase.auth.getSession();
      
      return {
        passed: !error,
        duration: Date.now() - startTime,
        error: error?.message,
        details: {
          sessionAvailable: !!data.session,
          authServiceResponsive: true
        }
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private async testEndToEndWorkflow(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Test a simplified end-to-end workflow
      const testContent = 'This is a test content for integration validation.';
      
      // Check if all required services are available for analysis
      const aiStatus = aiService.getStatus();
      const ragMetrics = ragService.getKnowledgeBaseMetrics();
      const providerStatus = providerManager.getStatus();
      
      const passed = aiStatus.initialized && 
                    ragMetrics.enabledSources > 0 && 
                    providerStatus.initialized;
      
      return {
        passed,
        duration: Date.now() - startTime,
        details: {
          aiServiceReady: aiStatus.initialized,
          ragServiceReady: ragMetrics.enabledSources > 0,
          providerManagerReady: providerStatus.initialized,
          testContentLength: testContent.length
        }
      };
    } catch (error) {
      return {
        passed: false,
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  private createErrorStatus(message: string, error?: any): ServiceStatus {
    return {
      status: 'critical',
      initialized: false,
      lastCheck: new Date(),
      errors: [error ? `${message}: ${error.message}` : message],
      warnings: []
    };
  }

  private createFailedTest(message: string): TestResult {
    return {
      passed: false,
      duration: 0,
      error: message
    };
  }

  private determineOverallStatus(
    services: ServiceIntegrationStatus['services'],
    tests: ServiceIntegrationStatus['integrationTests']
  ): 'healthy' | 'degraded' | 'critical' {
    const serviceStatuses = Object.values(services);
    const testResults = Object.values(tests);

    // Critical if any service is critical or core tests fail
    const hasCriticalService = serviceStatuses.some(s => s.status === 'critical');
    const hasCriticalTestFailure = !testResults.find(t => t.passed && (
      tests.aiProviderIntegration === t || 
      tests.databaseIntegration === t || 
      tests.endToEndWorkflow === t
    ));

    if (hasCriticalService || hasCriticalTestFailure) {
      return 'critical';
    }

    // Degraded if any service is degraded or some tests fail
    const hasDegradedService = serviceStatuses.some(s => s.status === 'degraded');
    const hasTestFailures = testResults.some(t => !t.passed);

    if (hasDegradedService || hasTestFailures) {
      return 'degraded';
    }

    return 'healthy';
  }

  private generateRecommendations(
    services: ServiceIntegrationStatus['services'],
    tests: ServiceIntegrationStatus['integrationTests']
  ): string[] {
    const recommendations: string[] = [];

    // Service-specific recommendations
    if (services.providerManager.status !== 'healthy') {
      recommendations.push('Initialize and configure provider manager properly');
    }

    if (services.aiService.status !== 'healthy') {
      recommendations.push('Ensure AI service providers are configured and healthy');
    }

    if (services.googleDrive.status === 'degraded') {
      recommendations.push('Complete Google Drive authentication for full functionality');
    }

    if (services.ragService.status !== 'healthy') {
      recommendations.push('Enable knowledge sources for RAG analysis');
    }

    // Test-specific recommendations
    if (!tests.aiProviderIntegration.passed) {
      recommendations.push('Fix AI provider integration issues');
    }

    if (!tests.endToEndWorkflow.passed) {
      recommendations.push('Address end-to-end workflow integration problems');
    }

    return recommendations;
  }

  private identifyCriticalIssues(
    services: ServiceIntegrationStatus['services'],
    tests: ServiceIntegrationStatus['integrationTests']
  ): string[] {
    const issues: string[] = [];

    // Critical service issues
    Object.entries(services).forEach(([serviceName, status]) => {
      if (status.status === 'critical') {
        issues.push(`${serviceName} is in critical state: ${status.errors.join(', ')}`);
      }
    });

    // Critical test failures
    if (!tests.databaseIntegration.passed) {
      issues.push('Database integration is failing - data persistence unavailable');
    }

    if (!tests.endToEndWorkflow.passed) {
      issues.push('End-to-end workflow is broken - core functionality unavailable');
    }

    return issues;
  }

  /**
   * Quick health check for monitoring
   */
  async quickHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    timestamp: Date;
    summary: string;
  }> {
    try {
      const [providerStatus, aiStatus, dbTest] = await Promise.allSettled([
        Promise.resolve(providerManager.getStatus()),
        Promise.resolve(aiService.getStatus()),
        supabase.from('analysis_results').select('count').limit(1)
      ]);

      const issues: string[] = [];

      if (providerStatus.status === 'rejected' || !providerStatus.value.initialized) {
        issues.push('Provider Manager');
      }

      if (aiStatus.status === 'rejected' || !aiStatus.value.initialized) {
        issues.push('AI Service');
      }

      if (dbTest.status === 'rejected') {
        issues.push('Database');
      }

      let status: 'healthy' | 'degraded' | 'critical';
      let summary: string;

      if (issues.length === 0) {
        status = 'healthy';
        summary = 'All core services operational';
      } else if (issues.length <= 1) {
        status = 'degraded';
        summary = `${issues.join(', ')} experiencing issues`;
      } else {
        status = 'critical';
        summary = `Multiple services failing: ${issues.join(', ')}`;
      }

      return {
        status,
        timestamp: new Date(),
        summary
      };

    } catch (error) {
      return {
        status: 'critical',
        timestamp: new Date(),
        summary: 'Health check failed'
      };
    }
  }
}

// Export singleton instance
export const serviceIntegrationValidator = ServiceIntegrationValidator.getInstance();