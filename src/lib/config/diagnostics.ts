/**
 * Configuration diagnostics and troubleshooting tools
 * Provides diagnostic utilities, validation reporting, and troubleshooting guidance
 */

import { EnvironmentConfig } from './types.js';
import { ConfigurationService } from './index.js';
import { ConfigurationHealthChecker, ConfigurationHealthStatus } from './healthChecks.js';
import { ConfigurationMonitoringService } from './monitoring.js';

import { logger } from './logging';
export interface DiagnosticResult {
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  message: string;
  details?: Record<string, any>;
  recommendation?: string;
  documentationUrl?: string;
}

export interface ConfigurationDiagnosticReport {
  timestamp: Date;
  environment: string;
  overallStatus: 'healthy' | 'issues-found' | 'critical-issues';
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    info: number;
  };
  categories: {
    [category: string]: DiagnosticResult[];
  };
  recommendations: string[];
  troubleshootingSteps: TroubleshootingStep[];
}

export interface TroubleshootingStep {
  id: string;
  title: string;
  description: string;
  commands?: string[];
  expectedOutput?: string;
  troubleshootingUrl?: string;
}

export interface ConfigurationValidationGuidance {
  missingVariables: Array<{
    variable: string;
    description: string;
    required: boolean;
    example: string;
    documentationUrl?: string;
  }>;
  invalidFormats: Array<{
    variable: string;
    currentValue: string;
    expectedFormat: string;
    example: string;
  }>;
  securityIssues: Array<{
    issue: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
  }>;
  performanceWarnings: Array<{
    setting: string;
    currentValue: any;
    recommendedValue: any;
    impact: string;
  }>;
}

/**
 * Configuration diagnostic service
 */
export class ConfigurationDiagnosticService {
  private configService: ConfigurationService;
  private healthChecker: ConfigurationHealthChecker;
  private monitoringService?: ConfigurationMonitoringService;

  constructor(
    configService: ConfigurationService, 
    monitoringService?: ConfigurationMonitoringService
  ) {
    this.configService = configService;
    this.healthChecker = new ConfigurationHealthChecker(configService);
    this.monitoringService = monitoringService;
  }

  /**
   * Run comprehensive configuration diagnostics
   */
  async runDiagnostics(): Promise<ConfigurationDiagnosticReport> {
    logger.debug("🔍 Running configuration diagnostics...");
    
    const startTime = Date.now();
    const results: DiagnosticResult[] = [];

    // Run all diagnostic checks
    results.push(...await this.checkEnvironmentSetup());
    results.push(...await this.checkServiceConfiguration());
    results.push(...await this.checkSecurityConfiguration());
    results.push(...await this.checkPerformanceConfiguration());
    results.push(...await this.checkFeatureFlagConfiguration());
    results.push(...await this.checkConnectivityDiagnostics());

    // Categorize results
    const categories: { [category: string]: DiagnosticResult[] } = {};
    results.forEach(result => {
      if (!categories[result.category]) {
        categories[result.category] = [];
      }
      categories[result.category].push(result);
    });

    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
      warnings: results.filter(r => r.status === 'warning').length,
      info: results.filter(r => r.status === 'info').length
    };

    // Determine overall status
    let overallStatus: 'healthy' | 'issues-found' | 'critical-issues' = 'healthy';
    if (summary.failed > 0) {
      overallStatus = 'critical-issues';
    } else if (summary.warnings > 0) {
      overallStatus = 'issues-found';
    }

    // Generate recommendations and troubleshooting steps
    const recommendations = this.generateRecommendations(results);
    const troubleshootingSteps = this.generateTroubleshootingSteps(results);

    const report: ConfigurationDiagnosticReport = {
      timestamp: new Date(),
      environment: this.configService.app.environment,
      overallStatus,
      summary,
      categories,
      recommendations,
      troubleshootingSteps
    };

    const diagnosticTime = Date.now() - startTime;
    console.log(`✅ Configuration diagnostics completed in ${diagnosticTime}ms - Status: ${overallStatus}`);

    return report;
  }

  /**
   * Generate configuration validation guidance
   */
  async generateValidationGuidance(): Promise<ConfigurationValidationGuidance> {
    const guidance: ConfigurationValidationGuidance = {
      missingVariables: [],
      invalidFormats: [],
      securityIssues: [],
      performanceWarnings: []
    };

    try {
      // Check for missing variables based on environment
      const environment = this.configService.app.environment;
      const requiredVariables = this.getRequiredVariablesForEnvironment(environment);
      
      for (const variable of requiredVariables) {
        try {
          // Try to access the configuration value
          this.getConfigValueByPath(variable.path);
        } catch {
          guidance.missingVariables.push(variable);
        }
      }

      // Check for invalid formats
      guidance.invalidFormats.push(...this.checkConfigurationFormats());

      // Check for security issues
      guidance.securityIssues.push(...this.checkSecurityIssues());

      // Check for performance warnings
      guidance.performanceWarnings.push(...this.checkPerformanceSettings());

    } catch (error) {
      logger.error("Error generating validation guidance:", error instanceof Error ? error : new Error(String(error)));
    }

    return guidance;
  }

  /**
   * Get troubleshooting guide for specific issues
   */
  getTroubleshootingGuide(issueType: string): TroubleshootingStep[] {
    const guides: { [key: string]: TroubleshootingStep[] } = {
      'supabase-connection': [
        {
          id: 'check-supabase-url',
          title: 'Verify Supabase URL',
          description: 'Check that your Supabase URL is correct and accessible',
          commands: ['curl -I $VITE_SUPABASE_URL/rest/v1/'],
          expectedOutput: 'HTTP/2 200',
          troubleshootingUrl: 'https://supabase.com/docs/guides/getting-started'
        },
        {
          id: 'check-supabase-keys',
          title: 'Verify Supabase API Keys',
          description: 'Ensure your Supabase anonymous key is valid',
          commands: [
            'echo "Anon key length: ${#VITE_SUPABASE_ANON_KEY}"',
            'echo "Key starts with: ${VITE_SUPABASE_ANON_KEY:0:10}..."'
          ],
          expectedOutput: 'Key should be a JWT token starting with "eyJ"'
        }
      ],
      'openai-api': [
        {
          id: 'check-openai-key',
          title: 'Verify OpenAI API Key',
          description: 'Check that your OpenAI API key is valid and has proper permissions',
          commands: [
            'curl -H "Authorization: Bearer $VITE_OPENAI_API_KEY" https://api.openai.com/v1/models'
          ],
          expectedOutput: 'JSON response with available models'
        }
      ],
      'environment-setup': [
        {
          id: 'check-env-files',
          title: 'Check Environment Files',
          description: 'Verify that environment files exist and are properly formatted',
          commands: [
            'ls -la .env*',
            'head -5 .env.example'
          ],
          expectedOutput: 'Environment files should be present'
        },
        {
          id: 'validate-env-vars',
          title: 'Validate Environment Variables',
          description: 'Check that required environment variables are set',
          commands: [
            'env | grep VITE_ | head -10',
            'echo "NODE_ENV: $NODE_ENV"'
          ]
        }
      ]
    };

    return guides[issueType] || [];
  }

  /**
   * Generate configuration health report
   */
  async generateHealthReport(): Promise<{
    healthStatus: ConfigurationHealthStatus;
    diagnosticReport: ConfigurationDiagnosticReport;
    validationGuidance: ConfigurationValidationGuidance;
    monitoringSummary?: any;
  }> {
    const [healthStatus, diagnosticReport, validationGuidance] = await Promise.all([
      this.healthChecker.runHealthChecks(),
      this.runDiagnostics(),
      this.generateValidationGuidance()
    ]);

    const monitoringSummary = this.monitoringService?.getMonitoringSummary();

    return {
      healthStatus,
      diagnosticReport,
      validationGuidance,
      monitoringSummary
    };
  }

  private async checkEnvironmentSetup(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];
    
    try {
      const environment = this.configService.app.environment;
      
      // Check environment is valid
      if (['development', 'staging', 'production'].includes(environment)) {
        results.push({
          category: 'Environment Setup',
          name: 'Environment Detection',
          status: 'pass',
          message: `Environment correctly set to '${environment}'`,
          details: { environment }
        });
      } else {
        results.push({
          category: 'Environment Setup',
          name: 'Environment Detection',
          status: 'fail',
          message: `Invalid environment '${environment}'`,
          recommendation: 'Set NODE_ENV to development, staging, or production',
          details: { environment }
        });
      }

      // Check application configuration
      const app = this.configService.app;
      
      if (app.name && app.version && app.url) {
        results.push({
          category: 'Environment Setup',
          name: 'Application Configuration',
          status: 'pass',
          message: 'Application configuration is complete',
          details: {
            name: app.name,
            version: app.version,
            url: app.url,
            port: app.port
          }
        });
      } else {
        results.push({
          category: 'Environment Setup',
          name: 'Application Configuration',
          status: 'warning',
          message: 'Application configuration is incomplete',
          recommendation: 'Ensure VITE_APP_NAME, VITE_APP_VERSION, and VITE_APP_URL are set'
        });
      }

    } catch (error) {
      results.push({
        category: 'Environment Setup',
        name: 'Configuration Access',
        status: 'fail',
        message: 'Failed to access configuration',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        recommendation: 'Check that configuration is properly initialized'
      });
    }

    return results;
  }

  private async checkServiceConfiguration(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // Check database configuration
    try {
      const database = this.configService.database;
      
      if (database.supabaseUrl && database.supabaseAnonKey) {
        results.push({
          category: 'Service Configuration',
          name: 'Database Configuration',
          status: 'pass',
          message: 'Supabase configuration is present',
          details: {
            url: database.supabaseUrl,
            hasAnonKey: !!database.supabaseAnonKey,
            hasServiceKey: !!database.supabaseServiceKey,
            connectionPoolSize: database.connectionPoolSize
          }
        });
      } else {
        results.push({
          category: 'Service Configuration',
          name: 'Database Configuration',
          status: 'fail',
          message: 'Supabase configuration is missing',
          recommendation: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
          documentationUrl: 'https://supabase.com/docs/guides/getting-started'
        });
      }
    } catch (error) {
      results.push({
        category: 'Service Configuration',
        name: 'Database Configuration',
        status: 'fail',
        message: 'Failed to check database configuration',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    // Check AI service configuration
    try {
      const ai = this.configService.ai;
      
      if (ai.openai?.apiKey || ai.anthropic?.apiKey || ai.hallucifix?.apiKey) {
        const configuredServices = [];
        if (ai.openai?.apiKey) configuredServices.push('OpenAI');
        if (ai.anthropic?.apiKey) configuredServices.push('Anthropic');
        if (ai.hallucifix?.apiKey) configuredServices.push('HalluciFix');
        
        results.push({
          category: 'Service Configuration',
          name: 'AI Services Configuration',
          status: 'pass',
          message: `AI services configured: ${configuredServices.join(', ')}`,
          details: {
            openai: !!ai.openai?.apiKey,
            anthropic: !!ai.anthropic?.apiKey,
            hallucifix: !!ai.hallucifix?.apiKey
          }
        });
      } else {
        results.push({
          category: 'Service Configuration',
          name: 'AI Services Configuration',
          status: 'warning',
          message: 'No AI services configured',
          recommendation: 'Configure at least one AI service (OpenAI, Anthropic, or HalluciFix)',
          details: { mockServicesEnabled: this.configService.features.enableMockServices }
        });
      }
    } catch (error) {
      results.push({
        category: 'Service Configuration',
        name: 'AI Services Configuration',
        status: 'fail',
        message: 'Failed to check AI services configuration',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    return results;
  }

  private async checkSecurityConfiguration(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const security = this.configService.security;
      const auth = this.configService.auth;
      const environment = this.configService.app.environment;

      // Check JWT secret strength
      if (auth.jwt.secret.length >= 32) {
        results.push({
          category: 'Security Configuration',
          name: 'JWT Secret Strength',
          status: 'pass',
          message: 'JWT secret meets minimum length requirements',
          details: { length: auth.jwt.secret.length }
        });
      } else {
        results.push({
          category: 'Security Configuration',
          name: 'JWT Secret Strength',
          status: 'fail',
          message: 'JWT secret is too short',
          recommendation: 'Use a JWT secret of at least 32 characters',
          details: { length: auth.jwt.secret.length }
        });
      }

      // Check encryption key
      if (security.encryptionKey.length >= 32) {
        results.push({
          category: 'Security Configuration',
          name: 'Encryption Key Strength',
          status: 'pass',
          message: 'Encryption key meets minimum length requirements',
          details: { length: security.encryptionKey.length }
        });
      } else {
        results.push({
          category: 'Security Configuration',
          name: 'Encryption Key Strength',
          status: 'fail',
          message: 'Encryption key is too short',
          recommendation: 'Use an encryption key of at least 32 characters',
          details: { length: security.encryptionKey.length }
        });
      }

      // Check CORS configuration
      if (security.corsOrigins.length > 0) {
        const hasWildcard = security.corsOrigins.includes('*');
        if (hasWildcard && environment === 'production') {
          results.push({
            category: 'Security Configuration',
            name: 'CORS Configuration',
            status: 'warning',
            message: 'Wildcard CORS origin in production',
            recommendation: 'Specify exact origins instead of using wildcard in production',
            details: { origins: security.corsOrigins }
          });
        } else {
          results.push({
            category: 'Security Configuration',
            name: 'CORS Configuration',
            status: 'pass',
            message: 'CORS origins configured appropriately',
            details: { origins: security.corsOrigins }
          });
        }
      } else {
        results.push({
          category: 'Security Configuration',
          name: 'CORS Configuration',
          status: 'warning',
          message: 'No CORS origins configured',
          recommendation: 'Configure CORS origins for security'
        });
      }

    } catch (error) {
      results.push({
        category: 'Security Configuration',
        name: 'Security Configuration Access',
        status: 'fail',
        message: 'Failed to check security configuration',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    return results;
  }

  private async checkPerformanceConfiguration(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const database = this.configService.database;
      const security = this.configService.security;

      // Check database connection pool size
      if (database.connectionPoolSize >= 5 && database.connectionPoolSize <= 20) {
        results.push({
          category: 'Performance Configuration',
          name: 'Database Connection Pool',
          status: 'pass',
          message: 'Database connection pool size is optimal',
          details: { poolSize: database.connectionPoolSize }
        });
      } else if (database.connectionPoolSize < 5) {
        results.push({
          category: 'Performance Configuration',
          name: 'Database Connection Pool',
          status: 'warning',
          message: 'Database connection pool size may be too small',
          recommendation: 'Consider increasing connection pool size to 5-20',
          details: { poolSize: database.connectionPoolSize }
        });
      } else {
        results.push({
          category: 'Performance Configuration',
          name: 'Database Connection Pool',
          status: 'warning',
          message: 'Database connection pool size may be too large',
          recommendation: 'Consider reducing connection pool size to 5-20',
          details: { poolSize: database.connectionPoolSize }
        });
      }

      // Check query timeout
      if (database.queryTimeout >= 5000 && database.queryTimeout <= 60000) {
        results.push({
          category: 'Performance Configuration',
          name: 'Database Query Timeout',
          status: 'pass',
          message: 'Database query timeout is reasonable',
          details: { timeout: database.queryTimeout }
        });
      } else {
        results.push({
          category: 'Performance Configuration',
          name: 'Database Query Timeout',
          status: 'warning',
          message: 'Database query timeout may need adjustment',
          recommendation: 'Consider setting query timeout between 5-60 seconds',
          details: { timeout: database.queryTimeout }
        });
      }

      // Check rate limiting
      if (security.rateLimitMax > 0 && security.rateLimitWindow > 0) {
        results.push({
          category: 'Performance Configuration',
          name: 'Rate Limiting',
          status: 'pass',
          message: 'Rate limiting is configured',
          details: {
            maxRequests: security.rateLimitMax,
            windowMs: security.rateLimitWindow
          }
        });
      } else {
        results.push({
          category: 'Performance Configuration',
          name: 'Rate Limiting',
          status: 'warning',
          message: 'Rate limiting is not properly configured',
          recommendation: 'Configure rate limiting to protect against abuse'
        });
      }

    } catch (error) {
      results.push({
        category: 'Performance Configuration',
        name: 'Performance Configuration Access',
        status: 'fail',
        message: 'Failed to check performance configuration',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    return results;
  }

  private async checkFeatureFlagConfiguration(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const features = this.configService.features;
      const environment = this.configService.app.environment;

      // Count enabled features
      const enabledFeatures = Object.entries(features)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature);

      results.push({
        category: 'Feature Configuration',
        name: 'Feature Flags Status',
        status: 'info',
        message: `${enabledFeatures.length} features enabled`,
        details: {
          enabledFeatures,
          totalFeatures: Object.keys(features).length
        }
      });

      // Check environment-specific recommendations
      if (environment === 'production') {
        if (features.enableBetaFeatures) {
          results.push({
            category: 'Feature Configuration',
            name: 'Beta Features in Production',
            status: 'warning',
            message: 'Beta features are enabled in production',
            recommendation: 'Consider disabling beta features in production',
            details: { enableBetaFeatures: features.enableBetaFeatures }
          });
        }

        if (features.enableMockServices) {
          results.push({
            category: 'Feature Configuration',
            name: 'Mock Services in Production',
            status: 'fail',
            message: 'Mock services are enabled in production',
            recommendation: 'Disable mock services in production environment',
            details: { enableMockServices: features.enableMockServices }
          });
        }
      }

      // Check feature consistency
      if (features.enablePayments && !this.configService.payments?.stripe) {
        results.push({
          category: 'Feature Configuration',
          name: 'Payment Feature Consistency',
          status: 'warning',
          message: 'Payments feature enabled but Stripe not configured',
          recommendation: 'Configure Stripe or disable payment features',
          details: {
            enablePayments: features.enablePayments,
            stripeConfigured: !!this.configService.payments?.stripe
          }
        });
      }

    } catch (error) {
      results.push({
        category: 'Feature Configuration',
        name: 'Feature Configuration Access',
        status: 'fail',
        message: 'Failed to check feature configuration',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    return results;
  }

  private async checkConnectivityDiagnostics(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      // Run health checks to get connectivity status
      const healthStatus = await this.healthChecker.runHealthChecks();
      
      healthStatus.checks.forEach(check => {
        let status: DiagnosticResult['status'] = 'pass';
        let recommendation: string | undefined;

        if (check.status === 'unhealthy') {
          status = 'fail';
          recommendation = `Fix ${check.name} connectivity issue`;
        } else if (check.status === 'warning') {
          status = 'warning';
          recommendation = `Review ${check.name} configuration`;
        }

        results.push({
          category: 'Connectivity Diagnostics',
          name: check.name,
          status,
          message: check.message,
          details: {
            responseTime: check.responseTime,
            lastChecked: check.lastChecked,
            metadata: check.metadata
          },
          recommendation
        });
      });

    } catch (error) {
      results.push({
        category: 'Connectivity Diagnostics',
        name: 'Health Check Execution',
        status: 'fail',
        message: 'Failed to run connectivity diagnostics',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        recommendation: 'Check configuration service initialization'
      });
    }

    return results;
  }

  private generateRecommendations(results: DiagnosticResult[]): string[] {
    const recommendations: string[] = [];
    
    // Collect all recommendations from failed and warning results
    results.forEach(result => {
      if (result.recommendation && (result.status === 'fail' || result.status === 'warning')) {
        recommendations.push(result.recommendation);
      }
    });

    // Add general recommendations based on patterns
    const failedResults = results.filter(r => r.status === 'fail');
    const warningResults = results.filter(r => r.status === 'warning');

    if (failedResults.length > 0) {
      recommendations.push('Address critical configuration issues before deployment');
    }

    if (warningResults.length > 3) {
      recommendations.push('Review configuration warnings to improve system reliability');
    }

    // Remove duplicates
    return [...new Set(recommendations)];
  }

  private generateTroubleshootingSteps(results: DiagnosticResult[]): TroubleshootingStep[] {
    const steps: TroubleshootingStep[] = [];
    
    // Generate steps based on failed results
    const failedResults = results.filter(r => r.status === 'fail');
    
    failedResults.forEach(result => {
      if (result.category === 'Service Configuration' && result.name === 'Database Configuration') {
        steps.push(...this.getTroubleshootingGuide('supabase-connection'));
      }
      
      if (result.category === 'Service Configuration' && result.name === 'AI Services Configuration') {
        steps.push(...this.getTroubleshootingGuide('openai-api'));
      }
      
      if (result.category === 'Environment Setup') {
        steps.push(...this.getTroubleshootingGuide('environment-setup'));
      }
    });

    // Remove duplicate steps
    const uniqueSteps = steps.filter((step, index, self) => 
      index === self.findIndex(s => s.id === step.id)
    );

    return uniqueSteps;
  }

  private getRequiredVariablesForEnvironment(environment: string) {
    const baseVariables = [
      {
        path: 'app.name',
        variable: 'VITE_APP_NAME',
        description: 'Application name',
        required: true,
        example: 'HalluciFix'
      },
      {
        path: 'database.supabaseUrl',
        variable: 'VITE_SUPABASE_URL',
        description: 'Supabase project URL',
        required: true,
        example: 'https://your-project.supabase.co'
      },
      {
        path: 'database.supabaseAnonKey',
        variable: 'VITE_SUPABASE_ANON_KEY',
        description: 'Supabase anonymous key',
        required: true,
        example: 'eyJ...'
      }
    ];

    const productionVariables = [
      {
        path: 'database.supabaseServiceKey',
        variable: 'SUPABASE_SERVICE_KEY',
        description: 'Supabase service key for server operations',
        required: true,
        example: 'eyJ...'
      },
      {
        path: 'monitoring.sentry.dsn',
        variable: 'VITE_SENTRY_DSN',
        description: 'Sentry DSN for error tracking',
        required: true,
        example: 'https://...@sentry.io/...'
      }
    ];

    return environment === 'production' 
      ? [...baseVariables, ...productionVariables]
      : baseVariables;
  }

  private getConfigValueByPath(path: string): any {
    const parts = path.split('.');
    let current: any = {
      app: this.configService.app,
      database: this.configService.database,
      ai: this.configService.ai,
      auth: this.configService.auth,
      payments: this.configService.payments,
      monitoring: this.configService.monitoring,
      features: this.configService.features,
      security: this.configService.security
    };

    for (const part of parts) {
      if (current[part] === undefined) {
        throw new Error(`Configuration path ${path} not found`);
      }
      current = current[part];
    }

    return current;
  }

  private checkConfigurationFormats(): Array<{
    variable: string;
    currentValue: string;
    expectedFormat: string;
    example: string;
  }> {
    const issues: Array<{
      variable: string;
      currentValue: string;
      expectedFormat: string;
      example: string;
    }> = [];

    try {
      // Check OpenAI API key format
      const openaiKey = this.configService.ai.openai?.apiKey;
      if (openaiKey && !/^sk-[a-zA-Z0-9]{48}$/.test(openaiKey)) {
        issues.push({
          variable: 'VITE_OPENAI_API_KEY',
          currentValue: `${openaiKey.substring(0, 10)}...`,
          expectedFormat: 'sk-[48 characters]',
          example: 'sk-1234567890abcdef...'
        });
      }

      // Check Google Client ID format
      const googleClientId = this.configService.auth.google.clientId;
      if (googleClientId && !/^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
        issues.push({
          variable: 'VITE_GOOGLE_CLIENT_ID',
          currentValue: googleClientId,
          expectedFormat: '[numbers]-[string].apps.googleusercontent.com',
          example: '123456789-abc.apps.googleusercontent.com'
        });
      }

    } catch (error) {
      // Configuration access error - will be caught by other checks
    }

    return issues;
  }

  private checkSecurityIssues(): Array<{
    issue: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
  }> {
    const issues: Array<{
      issue: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      recommendation: string;
    }> = [];

    try {
      const environment = this.configService.app.environment;
      
      // Check for test keys in production
      if (environment === 'production') {
        const stripeKey = this.configService.payments?.stripe?.secretKey;
        if (stripeKey && stripeKey.startsWith('sk_test_')) {
          issues.push({
            issue: 'Test Stripe key in production',
            severity: 'critical',
            description: 'Using test Stripe keys in production environment',
            recommendation: 'Replace with live Stripe keys for production'
          });
        }
      }

      // Check JWT secret strength
      const jwtSecret = this.configService.auth.jwt.secret;
      if (jwtSecret.length < 32) {
        issues.push({
          issue: 'Weak JWT secret',
          severity: 'high',
          description: 'JWT secret is shorter than recommended minimum',
          recommendation: 'Use a JWT secret of at least 32 characters'
        });
      }

      // Check for wildcard CORS in production
      if (environment === 'production') {
        const corsOrigins = this.configService.security.corsOrigins;
        if (corsOrigins.includes('*')) {
          issues.push({
            issue: 'Wildcard CORS in production',
            severity: 'medium',
            description: 'Using wildcard CORS origin in production',
            recommendation: 'Specify exact allowed origins instead of wildcard'
          });
        }
      }

    } catch (error) {
      // Configuration access error
    }

    return issues;
  }

  private checkPerformanceSettings(): Array<{
    setting: string;
    currentValue: any;
    recommendedValue: any;
    impact: string;
  }> {
    const warnings: Array<{
      setting: string;
      currentValue: any;
      recommendedValue: any;
      impact: string;
    }> = [];

    try {
      // Check connection pool size
      const poolSize = this.configService.database.connectionPoolSize;
      if (poolSize < 5) {
        warnings.push({
          setting: 'database.connectionPoolSize',
          currentValue: poolSize,
          recommendedValue: '5-20',
          impact: 'Low connection pool may cause performance bottlenecks'
        });
      } else if (poolSize > 50) {
        warnings.push({
          setting: 'database.connectionPoolSize',
          currentValue: poolSize,
          recommendedValue: '5-20',
          impact: 'High connection pool may waste resources'
        });
      }

      // Check query timeout
      const queryTimeout = this.configService.database.queryTimeout;
      if (queryTimeout < 5000) {
        warnings.push({
          setting: 'database.queryTimeout',
          currentValue: queryTimeout,
          recommendedValue: '5000-30000',
          impact: 'Short timeout may cause queries to fail prematurely'
        });
      } else if (queryTimeout > 60000) {
        warnings.push({
          setting: 'database.queryTimeout',
          currentValue: queryTimeout,
          recommendedValue: '5000-30000',
          impact: 'Long timeout may cause poor user experience'
        });
      }

    } catch (error) {
      // Configuration access error
    }

    return warnings;
  }
}