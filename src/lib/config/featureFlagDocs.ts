/**
 * Feature Flag Documentation Generator
 * Automatically generates comprehensive documentation for feature flags
 */

import { FeatureFlagKey } from './featureFlags.js';
import { EnvironmentConfig } from './types.js';
import { config } from './index.js';

export interface FeatureFlagDocumentation {
  key: FeatureFlagKey;
  name: string;
  description: string;
  defaultValue: boolean;
  category: string;
  environments: {
    development: boolean;
    staging: boolean;
    production: boolean;
  };
  dependencies?: FeatureFlagKey[];
  conflicts?: FeatureFlagKey[];
  examples: {
    usage: string;
    component?: string;
    hook?: string;
  };
  notes?: string[];
  lastUpdated: string;
}

/**
 * Feature Flag Documentation Registry
 * Maintains comprehensive documentation for all feature flags
 */
export class FeatureFlagDocumentationRegistry {
  private static instance: FeatureFlagDocumentationRegistry;
  private documentation: Map<FeatureFlagKey, FeatureFlagDocumentation>;

  private constructor() {
    this.documentation = new Map();
    this.initializeDocumentation();
  }

  static getInstance(): FeatureFlagDocumentationRegistry {
    if (!FeatureFlagDocumentationRegistry.instance) {
      FeatureFlagDocumentationRegistry.instance = new FeatureFlagDocumentationRegistry();
    }
    return FeatureFlagDocumentationRegistry.instance;
  }

  /**
   * Get documentation for a specific feature flag
   */
  getDocumentation(key: FeatureFlagKey): FeatureFlagDocumentation | null {
    return this.documentation.get(key) || null;
  }

  /**
   * Get all feature flag documentation
   */
  getAllDocumentation(): FeatureFlagDocumentation[] {
    return Array.from(this.documentation.values());
  }

  /**
   * Get documentation by category
   */
  getDocumentationByCategory(category: string): FeatureFlagDocumentation[] {
    return this.getAllDocumentation().filter(doc => doc.category === category);
  }

  /**
   * Generate markdown documentation
   */
  generateMarkdownDocs(): string {
    const docs = this.getAllDocumentation();
    const categories = [...new Set(docs.map(doc => doc.category))];

    let markdown = `# Feature Flags Documentation\n\n`;
    markdown += `Generated on: ${new Date().toISOString()}\n`;
    markdown += `Environment: ${config.app.environment}\n\n`;

    markdown += `## Overview\n\n`;
    markdown += `This document provides comprehensive information about all feature flags in the application.\n\n`;

    markdown += `### Quick Reference\n\n`;
    markdown += `| Flag | Default | Category | Description |\n`;
    markdown += `|------|---------|----------|-------------|\n`;
    docs.forEach(doc => {
      markdown += `| \`${doc.key}\` | ${doc.defaultValue ? '✅' : '❌'} | ${doc.category} | ${doc.description} |\n`;
    });
    markdown += `\n`;

    categories.forEach(category => {
      markdown += `## ${category}\n\n`;
      const categoryDocs = this.getDocumentationByCategory(category);
      
      categoryDocs.forEach(doc => {
        markdown += `### ${doc.name} (\`${doc.key}\`)\n\n`;
        markdown += `${doc.description}\n\n`;
        
        markdown += `**Default Value:** ${doc.defaultValue ? 'Enabled' : 'Disabled'}\n\n`;
        
        markdown += `**Environment Values:**\n`;
        markdown += `- Development: ${doc.environments.development ? 'Enabled' : 'Disabled'}\n`;
        markdown += `- Staging: ${doc.environments.staging ? 'Enabled' : 'Disabled'}\n`;
        markdown += `- Production: ${doc.environments.production ? 'Enabled' : 'Disabled'}\n\n`;

        if (doc.dependencies && doc.dependencies.length > 0) {
          markdown += `**Dependencies:** ${doc.dependencies.map(dep => `\`${dep}\``).join(', ')}\n\n`;
        }

        if (doc.conflicts && doc.conflicts.length > 0) {
          markdown += `**Conflicts:** ${doc.conflicts.map(conflict => `\`${conflict}\``).join(', ')}\n\n`;
        }

        markdown += `**Usage Examples:**\n\n`;
        markdown += `\`\`\`typescript\n${doc.examples.usage}\n\`\`\`\n\n`;

        if (doc.examples.component) {
          markdown += `**Component Usage:**\n\n`;
          markdown += `\`\`\`tsx\n${doc.examples.component}\n\`\`\`\n\n`;
        }

        if (doc.examples.hook) {
          markdown += `**Hook Usage:**\n\n`;
          markdown += `\`\`\`typescript\n${doc.examples.hook}\n\`\`\`\n\n`;
        }

        if (doc.notes && doc.notes.length > 0) {
          markdown += `**Notes:**\n\n`;
          doc.notes.forEach(note => {
            markdown += `- ${note}\n`;
          });
          markdown += `\n`;
        }

        markdown += `---\n\n`;
      });
    });

    markdown += `## Usage Guide\n\n`;
    markdown += this.generateUsageGuide();

    return markdown;
  }

  /**
   * Generate HTML documentation
   */
  generateHtmlDocs(): string {
    const docs = this.getAllDocumentation();
    const categories = [...new Set(docs.map(doc => doc.category))];

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feature Flags Documentation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { border-bottom: 2px solid #e1e5e9; padding-bottom: 20px; margin-bottom: 30px; }
        .flag { border: 1px solid #e1e5e9; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .flag-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
        .flag-name { font-size: 1.5em; font-weight: bold; }
        .flag-key { font-family: monospace; background: #f6f8fa; padding: 4px 8px; border-radius: 4px; }
        .flag-status { padding: 4px 12px; border-radius: 20px; font-size: 0.9em; font-weight: bold; }
        .enabled { background: #d4edda; color: #155724; }
        .disabled { background: #f8d7da; color: #721c24; }
        .category { color: #6f42c1; font-weight: bold; }
        .environments { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 15px 0; }
        .env-item { text-align: center; padding: 10px; border-radius: 4px; }
        .env-enabled { background: #d4edda; }
        .env-disabled { background: #f8d7da; }
        .code-block { background: #f6f8fa; border: 1px solid #e1e5e9; border-radius: 4px; padding: 15px; margin: 10px 0; overflow-x: auto; }
        .toc { background: #f6f8fa; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
        .toc ul { list-style: none; padding-left: 0; }
        .toc li { margin: 5px 0; }
        .toc a { text-decoration: none; color: #0366d6; }
        .toc a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚩 Feature Flags Documentation</h1>
            <p>Generated on: ${new Date().toISOString()}</p>
            <p>Environment: <strong>${config.app.environment}</strong></p>
        </div>

        <div class="toc">
            <h2>Table of Contents</h2>
            <ul>`;

    categories.forEach(category => {
      html += `<li><a href="#${category.toLowerCase().replace(/\s+/g, '-')}">${category}</a></li>`;
    });

    html += `</ul>
        </div>`;

    categories.forEach(category => {
      const categoryDocs = this.getDocumentationByCategory(category);
      html += `<h2 id="${category.toLowerCase().replace(/\s+/g, '-')}">${category}</h2>`;
      
      categoryDocs.forEach(doc => {
        html += `
        <div class="flag">
            <div class="flag-header">
                <div>
                    <div class="flag-name">${doc.name}</div>
                    <div class="flag-key">${doc.key}</div>
                </div>
                <div class="flag-status ${doc.defaultValue ? 'enabled' : 'disabled'}">
                    ${doc.defaultValue ? 'Enabled' : 'Disabled'}
                </div>
            </div>
            
            <p><strong>Category:</strong> <span class="category">${doc.category}</span></p>
            <p>${doc.description}</p>
            
            <h4>Environment Values</h4>
            <div class="environments">
                <div class="env-item ${doc.environments.development ? 'env-enabled' : 'env-disabled'}">
                    <strong>Development</strong><br>
                    ${doc.environments.development ? 'Enabled' : 'Disabled'}
                </div>
                <div class="env-item ${doc.environments.staging ? 'env-enabled' : 'env-disabled'}">
                    <strong>Staging</strong><br>
                    ${doc.environments.staging ? 'Enabled' : 'Disabled'}
                </div>
                <div class="env-item ${doc.environments.production ? 'env-enabled' : 'env-disabled'}">
                    <strong>Production</strong><br>
                    ${doc.environments.production ? 'Enabled' : 'Disabled'}
                </div>
            </div>`;

        if (doc.dependencies && doc.dependencies.length > 0) {
          html += `<p><strong>Dependencies:</strong> ${doc.dependencies.map(dep => `<code>${dep}</code>`).join(', ')}</p>`;
        }

        if (doc.conflicts && doc.conflicts.length > 0) {
          html += `<p><strong>Conflicts:</strong> ${doc.conflicts.map(conflict => `<code>${conflict}</code>`).join(', ')}</p>`;
        }

        html += `
            <h4>Usage Example</h4>
            <div class="code-block"><pre><code>${this.escapeHtml(doc.examples.usage)}</code></pre></div>`;

        if (doc.examples.component) {
          html += `
            <h4>Component Usage</h4>
            <div class="code-block"><pre><code>${this.escapeHtml(doc.examples.component)}</code></pre></div>`;
        }

        if (doc.notes && doc.notes.length > 0) {
          html += `<h4>Notes</h4><ul>`;
          doc.notes.forEach(note => {
            html += `<li>${note}</li>`;
          });
          html += `</ul>`;
        }

        html += `</div>`;
      });
    });

    html += `
        </div>
    </body>
    </html>`;

    return html;
  }

  /**
   * Export documentation as JSON
   */
  exportAsJson(): string {
    const exportData = {
      generatedAt: new Date().toISOString(),
      environment: config.app.environment,
      flags: this.getAllDocumentation()
    };

    return JSON.stringify(exportData, null, 2);
  }

  private initializeDocumentation(): void {
    // Analytics Feature Flag
    this.documentation.set('enableAnalytics', {
      key: 'enableAnalytics',
      name: 'Analytics Tracking',
      description: 'Enables user analytics and tracking functionality including Google Analytics and Mixpanel integration.',
      defaultValue: true,
      category: 'Analytics & Monitoring',
      environments: {
        development: true,
        staging: true,
        production: true
      },
      examples: {
        usage: `import { useFeatureFlag } from '../hooks/useFeatureFlag';

const { isEnabled } = useFeatureFlag('enableAnalytics');

if (isEnabled) {
  // Track user events
  analytics.track('user_action', { action: 'click' });
}`,
        component: `function AnalyticsWrapper({ children }) {
  const { isEnabled } = useFeatureFlag('enableAnalytics');
  
  return (
    <>
      {children}
      {isEnabled && <AnalyticsScript />}
    </>
  );
}`,
        hook: `const analytics = useAnalytics();
const { isEnabled } = useFeatureFlag('enableAnalytics');

useEffect(() => {
  if (isEnabled) {
    analytics.initialize();
  }
}, [isEnabled]);`
      },
      notes: [
        'Requires VITE_GOOGLE_ANALYTICS_ID and VITE_MIXPANEL_TOKEN to be configured',
        'Automatically disabled in development if analytics keys are not provided',
        'Respects user privacy preferences and GDPR compliance'
      ],
      lastUpdated: '2024-01-15'
    });

    // Payments Feature Flag
    this.documentation.set('enablePayments', {
      key: 'enablePayments',
      name: 'Payment Processing',
      description: 'Enables Stripe payment integration for subscription management and billing.',
      defaultValue: false,
      category: 'Commerce',
      environments: {
        development: false,
        staging: true,
        production: true
      },
      dependencies: ['enableAnalytics'],
      examples: {
        usage: `import { useFeatureFlag } from '../hooks/useFeatureFlag';

const { isEnabled } = useFeatureFlag('enablePayments');

if (isEnabled) {
  // Show payment options
  return <PaymentForm />;
}

return <ComingSoonMessage />;`,
        component: `function PricingPage() {
  const { isEnabled } = useFeatureFlag('enablePayments');
  
  return (
    <div>
      <PricingPlans />
      {isEnabled ? (
        <PaymentButtons />
      ) : (
        <ContactSalesButton />
      )}
    </div>
  );
}`
      },
      notes: [
        'Requires Stripe configuration (publishable key, secret key, webhook secret)',
        'Should be disabled in development unless testing payment flows',
        'Depends on analytics for conversion tracking'
      ],
      lastUpdated: '2024-01-15'
    });

    // Beta Features Flag
    this.documentation.set('enableBetaFeatures', {
      key: 'enableBetaFeatures',
      name: 'Beta Features',
      description: 'Enables experimental and beta features for testing and early access users.',
      defaultValue: false,
      category: 'Development',
      environments: {
        development: true,
        staging: true,
        production: false
      },
      examples: {
        usage: `import { useFeatureFlag } from '../hooks/useFeatureFlag';

const { isEnabled } = useFeatureFlag('enableBetaFeatures');

if (isEnabled) {
  // Show beta features
  return <BetaFeatureComponent />;
}`,
        component: `function Navigation() {
  const { isEnabled } = useFeatureFlag('enableBetaFeatures');
  
  return (
    <nav>
      <NavItem to="/dashboard">Dashboard</NavItem>
      <NavItem to="/analysis">Analysis</NavItem>
      {isEnabled && (
        <NavItem to="/beta" badge="Beta">
          New Features
        </NavItem>
      )}
    </nav>
  );
}`
      },
      notes: [
        'Should be enabled only for internal testing and beta users',
        'Features behind this flag may be unstable or incomplete',
        'Automatically disabled in production for safety'
      ],
      lastUpdated: '2024-01-15'
    });

    // RAG Analysis Flag
    this.documentation.set('enableRagAnalysis', {
      key: 'enableRagAnalysis',
      name: 'RAG Analysis',
      description: 'Enables Retrieval-Augmented Generation analysis for enhanced content verification.',
      defaultValue: true,
      category: 'AI & Analysis',
      environments: {
        development: true,
        staging: true,
        production: true
      },
      examples: {
        usage: `import { useFeatureFlag } from '../hooks/useFeatureFlag';

const { isEnabled } = useFeatureFlag('enableRagAnalysis');

const analysisOptions = {
  basic: true,
  rag: isEnabled,
  seqLogprob: true
};`,
        component: `function AnalysisOptions() {
  const { isEnabled } = useFeatureFlag('enableRagAnalysis');
  
  return (
    <div>
      <AnalysisOption type="basic" />
      <AnalysisOption type="seqLogprob" />
      {isEnabled && (
        <AnalysisOption 
          type="rag" 
          description="Enhanced analysis with external knowledge"
        />
      )}
    </div>
  );
}`
      },
      notes: [
        'Requires additional API calls and may increase analysis time',
        'Provides more comprehensive fact-checking capabilities',
        'Can be disabled to reduce API costs or improve performance'
      ],
      lastUpdated: '2024-01-15'
    });

    // Batch Processing Flag
    this.documentation.set('enableBatchProcessing', {
      key: 'enableBatchProcessing',
      name: 'Batch Processing',
      description: 'Enables batch analysis functionality for processing multiple documents simultaneously.',
      defaultValue: true,
      category: 'Performance',
      environments: {
        development: true,
        staging: true,
        production: true
      },
      examples: {
        usage: `import { useFeatureFlag } from '../hooks/useFeatureFlag';

const { isEnabled } = useFeatureFlag('enableBatchProcessing');

if (isEnabled) {
  return <BatchAnalysisComponent />;
}

return <SingleAnalysisOnly />;`,
        component: `function AnalysisPage() {
  const { isEnabled } = useFeatureFlag('enableBatchProcessing');
  
  return (
    <div>
      <SingleAnalysis />
      {isEnabled && (
        <TabPanel label="Batch Analysis">
          <BatchAnalysis />
        </TabPanel>
      )}
    </div>
  );
}`
      },
      notes: [
        'May require additional server resources for large batch operations',
        'Includes file upload and processing queue management',
        'Can be disabled to simplify the user interface'
      ],
      lastUpdated: '2024-01-15'
    });

    // Mock Services Flag
    this.documentation.set('enableMockServices', {
      key: 'enableMockServices',
      name: 'Mock Services',
      description: 'Enables mock services for development and testing when real API keys are not available.',
      defaultValue: true,
      category: 'Development',
      environments: {
        development: true,
        staging: false,
        production: false
      },
      examples: {
        usage: `import { useFeatureFlag } from '../hooks/useFeatureFlag';

const { isEnabled } = useFeatureFlag('enableMockServices');

const apiClient = isEnabled 
  ? new MockApiClient() 
  : new RealApiClient();`,
        component: `function ApiProvider({ children }) {
  const { isEnabled } = useFeatureFlag('enableMockServices');
  
  const apiClient = useMemo(() => {
    return isEnabled 
      ? new MockApiClient()
      : new RealApiClient();
  }, [isEnabled]);
  
  return (
    <ApiContext.Provider value={apiClient}>
      {children}
    </ApiContext.Provider>
  );
}`
      },
      notes: [
        'Automatically enabled in development when API keys are missing',
        'Should never be enabled in production',
        'Provides realistic mock responses for development and testing'
      ],
      lastUpdated: '2024-01-15'
    });
  }

  private generateUsageGuide(): string {
    return `### Basic Usage

\`\`\`typescript
import { useFeatureFlag } from '../hooks/useFeatureFlag';

function MyComponent() {
  const { isEnabled } = useFeatureFlag('enableAnalytics');
  
  if (isEnabled) {
    // Feature is enabled
    return <AnalyticsComponent />;
  }
  
  // Feature is disabled
  return <PlaceholderComponent />;
}
\`\`\`

### Advanced Usage with Context

\`\`\`typescript
const { isEnabled, flagInfo, setOverride } = useFeatureFlag('enablePayments', {
  debug: true,
  context: {
    userId: user.id,
    customProperties: { plan: 'premium' }
  }
});

// Temporarily override for testing
setOverride(true, { expiresIn: 60000 }); // 1 minute
\`\`\`

### URL Parameter Overrides

Add parameters to the URL to override feature flags:
- \`?ff_enableAnalytics=true\`
- \`?ff_enablePayments=false\`
- \`?ff_enableBetaFeatures=true\`

### Console Commands

Open browser console and use these commands:
\`\`\`javascript
// Check flag status
featureFlagManager.isEnabled('enableAnalytics');

// Set override
featureFlagManager.setOverride('enablePayments', true);

// Get debug information
featureFlagManager.getDebugInfo();

// Clear all overrides
featureFlagManager.clearAllOverrides();
\`\`\`

### Environment Variables

Configure feature flags via environment variables:
\`\`\`bash
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=false
VITE_ENABLE_BETA_FEATURES=false
VITE_ENABLE_RAG_ANALYSIS=true
VITE_ENABLE_BATCH_PROCESSING=true
VITE_ENABLE_MOCK_SERVICES=true
\`\`\`
`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export singleton instance
export const featureFlagDocs = FeatureFlagDocumentationRegistry.getInstance();