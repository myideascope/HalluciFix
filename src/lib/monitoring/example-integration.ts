/**
 * Example Integration
 * Shows how to integrate monitoring with existing API services
 */

import { withOpenAIMonitoring, withGoogleDriveMonitoring, initializeMonitoring } from './index';

// Example: Enhanced Analysis Service with Monitoring
export class MonitoredAnalysisService {
  constructor() {
    // Initialize monitoring when service is created
    initializeMonitoring({
      enabled: true,
      apiMonitor: {
        responseTimeThreshold: 3000, // 3 seconds
        errorRateThreshold: 5, // 5%
        costThreshold: 5, // $5 per hour
        quotaWarningEnabled: true,
        quotaCriticalEnabled: true
      },
      costTracking: {
        enabled: true,
        budgets: {
          openai: {
            amount: 50, // $50 per day
            period: 'day',
            alertThreshold: 0.8
          }
        }
      }
    });
  }

  // Monitored OpenAI analysis method
  analyzeContent = withOpenAIMonitoring('content_analysis', async (content: string) => {
    // Simulate OpenAI API call
    const response = await fetch('/api/openai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    
    // The monitoring wrapper will automatically track:
    // - Response time
    // - Status code
    // - Token usage (if included in result.usage)
    // - Cost calculation
    // - Error handling
    
    return result;
  });

  // Monitored batch analysis
  analyzeBatch = withOpenAIMonitoring('batch_analysis', async (contents: string[]) => {
    const results = [];
    
    for (const content of contents) {
      try {
        const result = await this.analyzeContent(content);
        results.push(result);
      } catch (error) {
        results.push({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
    
    return results;
  });
}

// Example: Enhanced Google Drive Service with Monitoring
export class MonitoredGoogleDriveService {
  // Monitored file listing
  listFiles = withGoogleDriveMonitoring('list_files', async (folderId?: string) => {
    const response = await fetch(`/api/google-drive/files${folderId ? `?folderId=${folderId}` : ''}`);
    
    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status}`);
    }
    
    return response.json();
  });

  // Monitored file download
  downloadFile = withGoogleDriveMonitoring('download_file', async (fileId: string) => {
    const response = await fetch(`/api/google-drive/files/${fileId}/download`);
    
    if (!response.ok) {
      throw new Error(`File download error: ${response.status}`);
    }
    
    return response.text();
  });
}

// Example usage in a React component or service
export function useMonitoredServices() {
  const analysisService = new MonitoredAnalysisService();
  const driveService = new MonitoredGoogleDriveService();
  
  return {
    analysisService,
    driveService,
    
    // Helper to get current monitoring stats
    getMonitoringStats: () => {
      const { getServiceMonitoringStats } = require('./integrations');
      return getServiceMonitoringStats();
    }
  };
}

// Example: How to add monitoring to existing functions
export function addMonitoringToExistingService() {
  // If you have an existing service like this:
  const existingAnalyzeFunction = async (content: string) => {
    // existing implementation
    return { accuracy: 95, riskLevel: 'low' };
  };

  // You can easily add monitoring:
  const monitoredAnalyzeFunction = withOpenAIMonitoring('existing_analyze', existingAnalyzeFunction);

  return monitoredAnalyzeFunction;
}

// Example: Custom monitoring for specific use cases
export function createCustomMonitoredFunction<T extends any[], R>(
  provider: string,
  endpoint: string,
  fn: (...args: T) => Promise<R>
) {
  const { withAPIMonitoring } = require('./integrations');
  return withAPIMonitoring(provider, endpoint, fn);
}

// Example: Monitoring setup for different environments
export function setupEnvironmentSpecificMonitoring(environment: 'development' | 'staging' | 'production') {
  const baseConfig = {
    enabled: true,
    apiMonitor: {
      responseTimeThreshold: 5000,
      errorRateThreshold: 10,
      costThreshold: 10,
      quotaWarningEnabled: true,
      quotaCriticalEnabled: true
    },
    costTracking: {
      enabled: true,
      budgets: {}
    }
  };

  switch (environment) {
    case 'development':
      return initializeMonitoring({
        ...baseConfig,
        apiMonitor: {
          ...baseConfig.apiMonitor,
          responseTimeThreshold: 10000, // More lenient in dev
          errorRateThreshold: 20
        },
        costTracking: {
          enabled: false, // Disable cost tracking in dev
          budgets: {}
        }
      });

    case 'staging':
      return initializeMonitoring({
        ...baseConfig,
        costTracking: {
          enabled: true,
          budgets: {
            openai: { amount: 20, period: 'day', alertThreshold: 0.8 },
            anthropic: { amount: 10, period: 'day', alertThreshold: 0.8 }
          }
        }
      });

    case 'production':
      return initializeMonitoring({
        ...baseConfig,
        apiMonitor: {
          ...baseConfig.apiMonitor,
          responseTimeThreshold: 3000, // Stricter in production
          errorRateThreshold: 5,
          webhookUrl: import.meta.env.VITE_MONITORING_WEBHOOK_URL
        },
        costTracking: {
          enabled: true,
          budgets: {
            openai: { amount: 200, period: 'day', alertThreshold: 0.8 },
            anthropic: { amount: 100, period: 'day', alertThreshold: 0.8 },
            google_drive: { amount: 50, period: 'day', alertThreshold: 0.8 }
          }
        }
      });

    default:
      return initializeMonitoring(baseConfig);
  }
}