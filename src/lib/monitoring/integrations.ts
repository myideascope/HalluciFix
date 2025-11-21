/**
 * Monitoring Integrations
 * Helper functions to integrate monitoring with existing API services
 */

import { getMonitoringService } from './monitoringService';

import { logger } from './logging';
/**
 * Decorator for OpenAI API calls
 */
export function withOpenAIMonitoring<T extends any[], R>(
  endpoint: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const monitoringService = getMonitoringService();
  return monitoringService.wrapAPICall('openai', endpoint, () => fn(...args));
}

/**
 * Decorator for Anthropic API calls
 */
export function withAnthropicMonitoring<T extends any[], R>(
  endpoint: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const monitoringService = getMonitoringService();
  return monitoringService.wrapAPICall('anthropic', endpoint, () => fn(...args));
}

/**
 * Decorator for Google Drive API calls
 */
export function withGoogleDriveMonitoring<T extends any[], R>(
  endpoint: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const monitoringService = getMonitoringService();
  return monitoringService.wrapAPICall('google_drive', endpoint, () => fn(...args));
}

/**
 * Decorator for Wikipedia API calls
 */
export function withWikipediaMonitoring<T extends any[], R>(
  endpoint: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const monitoringService = getMonitoringService();
  return monitoringService.wrapAPICall('wikipedia', endpoint, () => fn(...args));
}

/**
 * Generic API monitoring decorator
 */
export function withAPIMonitoring<T extends any[], R>(
  provider: string,
  endpoint: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const monitoringService = getMonitoringService();
  return monitoringService.wrapAPICall(provider, endpoint, () => fn(...args));
}

/**
 * Batch monitoring for multiple API calls
 */
export async function monitorBatchAPICalls<T>(
  provider: string,
  endpoint: string,
  calls: (() => Promise<T>)[]
): Promise<T[]> {
  const monitoringService = getMonitoringService();
  
  const wrappedCalls = calls.map((call, index) => 
    monitoringService.wrapAPICall(provider, `${endpoint}_batch_${index}`, call)
  );

  return Promise.all(wrappedCalls.map(call => call()));
}

/**
 * Monitor file upload/download operations
 */
export function withFileOperationMonitoring<T extends any[], R>(
  provider: string,
  operation: 'upload' | 'download',
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const monitoringService = getMonitoringService();
  return monitoringService.wrapAPICall(provider, `file_${operation}`, () => fn(...args));
}

/**
 * Monitor authentication operations
 */
export function withAuthMonitoring<T extends any[], R>(
  provider: string,
  operation: 'login' | 'refresh' | 'logout',
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const monitoringService = getMonitoringService();
  return monitoringService.wrapAPICall(provider, `auth_${operation}`, () => fn(...args));
}

/**
 * Example integration with existing analysisService
 */
export function createMonitoredAnalysisService() {
  return {
    analyzeContent: withOpenAIMonitoring('analyze_content', async (content: string) => {
      // This would be the actual OpenAI API call
      // For now, returning a mock response to demonstrate monitoring
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
      
      if (Math.random() < 0.1) {
        throw new Error('Simulated API error');
      }

      return {
        accuracy: Math.random() * 100,
        riskLevel: 'low',
        usage: {
          prompt_tokens: Math.floor(Math.random() * 1000 + 100),
          completion_tokens: Math.floor(Math.random() * 500 + 50),
          total_tokens: Math.floor(Math.random() * 1500 + 150)
        }
      };
    }),

    analyzeWithAnthropic: withAnthropicMonitoring('analyze_content', async (content: string) => {
      // Anthropic API call simulation
      await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 800));
      
      if (Math.random() < 0.05) {
        throw new Error('Anthropic API rate limit exceeded');
      }

      return {
        accuracy: Math.random() * 100,
        riskLevel: 'medium',
        usage: {
          prompt_tokens: Math.floor(Math.random() * 800 + 80),
          completion_tokens: Math.floor(Math.random() * 400 + 40),
          total_tokens: Math.floor(Math.random() * 1200 + 120)
        }
      };
    })
  };
}

/**
 * Example integration with Google Drive service
 */
export function createMonitoredGoogleDriveService() {
  return {
    listFiles: withGoogleDriveMonitoring('list_files', async (folderId?: string) => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 200));
      
      if (Math.random() < 0.02) {
        throw new Error('Google Drive API quota exceeded');
      }

      return {
        files: Array.from({ length: Math.floor(Math.random() * 20 + 5) }, (_, i) => ({
          id: `file_${i}`,
          name: `Document ${i}.pdf`,
          mimeType: 'application/pdf'
        }))
      };
    }),

    downloadFile: withFileOperationMonitoring('google_drive', 'download', async (fileId: string) => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5000 + 1000));
      
      if (Math.random() < 0.03) {
        throw new Error('File download failed');
      }

      return `Content of file ${fileId}`;
    })
  };
}

/**
 * Initialize monitoring for all services
 */
export function initializeServiceMonitoring() {
  const monitoringService = getMonitoringService();
  
  // Set up quotas for different providers
  const apiMonitor = require('./apiMonitor').getAPIMonitor();
  
  // OpenAI quotas
  apiMonitor.setQuota({
    provider: 'openai',
    quotaType: 'requests',
    limit: 1000,
    used: 0,
    resetDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    warningThreshold: 80,
    criticalThreshold: 95
  });

  apiMonitor.setQuota({
    provider: 'openai',
    quotaType: 'tokens',
    limit: 1000000,
    used: 0,
    resetDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    warningThreshold: 80,
    criticalThreshold: 95
  });

  // Anthropic quotas
  apiMonitor.setQuota({
    provider: 'anthropic',
    quotaType: 'requests',
    limit: 500,
    used: 0,
    resetDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    warningThreshold: 80,
    criticalThreshold: 95
  });

  // Google Drive quotas
  apiMonitor.setQuota({
    provider: 'google_drive',
    quotaType: 'requests',
    limit: 10000,
    used: 0,
    resetDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    warningThreshold: 80,
    criticalThreshold: 95
  });

  logger.debug("Service monitoring initialized");
}

/**
 * Get monitoring statistics for all services
 */
export function getServiceMonitoringStats() {
  const monitoringService = getMonitoringService();
  return monitoringService.getMetricsSummary();
}