/**
 * Provider Infrastructure Integration Tests
 * Tests the core provider system functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  ProviderManager,
  ProviderRegistry, 
  ProviderConfigManager, 
  EnvironmentValidator,
  ProviderUtils 
} from '../index';

// Create instances for testing
const providerManager = ProviderManager.getInstance();
const providerRegistry = new ProviderRegistry();
const providerConfigManager = new ProviderConfigManager();
const environmentValidator = EnvironmentValidator.getInstance();

describe('Provider Infrastructure', () => {
  beforeEach(() => {
    // Clear any existing state
    providerRegistry.clear();
    environmentValidator.clearCache();
  });

  afterEach(() => {
    // Clean up after tests
    try {
      providerManager.shutdown();
    } catch {
      // Ignore if not initialized
    }
  });

  describe('Environment Validation', () => {
    it('should validate environment variables', () => {
      const validation = environmentValidator.validateEnvironment();
      
      expect(validation).toBeDefined();
      expect(validation.isValid).toBeDefined();
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    it('should validate security configuration', () => {
      const securityValidation = environmentValidator.validateSecurity();
      
      expect(securityValidation).toBeDefined();
      expect(securityValidation.isSecure).toBeDefined();
      expect(Array.isArray(securityValidation.issues)).toBe(true);
      expect(Array.isArray(securityValidation.recommendations)).toBe(true);
    });

    it('should provide configuration status', () => {
      const status = environmentValidator.getConfigurationStatus();
      
      expect(status).toBeDefined();
      expect(typeof status.mockServices).toBe('boolean');
      expect(typeof status.production).toBe('boolean');
    });
  });

  describe('Configuration Management', () => {
    it('should load provider configurations', async () => {
      const configurations = await providerConfigManager.loadConfigurations();
      
      expect(configurations).toBeDefined();
      expect(configurations.ai).toBeDefined();
      expect(configurations.auth).toBeDefined();
      expect(configurations.drive).toBeDefined();
      expect(configurations.knowledge).toBeDefined();
    });

    it('should validate configurations', async () => {
      await providerConfigManager.loadConfigurations();
      const validation = providerConfigManager.validateConfigurations();
      
      expect(validation).toBeDefined();
      expect(validation.isValid).toBeDefined();
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    it('should provide configuration summary', async () => {
      await providerConfigManager.loadConfigurations();
      const summary = providerConfigManager.getConfigurationSummary();
      
      expect(summary).toBeDefined();
      expect(summary.ai).toBeDefined();
      expect(summary.auth).toBeDefined();
      expect(summary.drive).toBeDefined();
      expect(summary.knowledge).toBeDefined();
    });
  });

  describe('Provider Registry', () => {
    it('should start with empty registry', () => {
      const metrics = providerRegistry.getMetrics();
      
      expect(metrics.totalProviders).toBe(0);
      expect(metrics.healthyProviders).toBe(0);
      expect(metrics.unhealthyProviders).toBe(0);
    });

    it('should provide health status', () => {
      const healthStatus = providerRegistry.getHealthStatus();
      
      expect(healthStatus).toBeDefined();
      expect(typeof healthStatus).toBe('object');
    });

    it('should return null for non-existent providers', () => {
      const aiProvider = providerRegistry.getAIProvider();
      const authProvider = providerRegistry.getAuthProvider();
      const driveProvider = providerRegistry.getDriveProvider();
      const knowledgeProvider = providerRegistry.getKnowledgeProvider();
      
      expect(aiProvider).toBeNull();
      expect(authProvider).toBeNull();
      expect(driveProvider).toBeNull();
      expect(knowledgeProvider).toBeNull();
    });
  });

  describe('Provider Manager', () => {
    it('should initialize successfully', async () => {
      await expect(providerManager.initialize({
        enableHealthChecks: false,
        validateSecurity: false,
        enableMockFallback: true
      })).resolves.not.toThrow();
      
      const status = providerManager.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.lastInitialization).toBeDefined();
    });

    it('should provide status information', async () => {
      await providerManager.initialize({
        enableHealthChecks: false,
        validateSecurity: false
      });
      
      const status = providerManager.getStatus();
      
      expect(status).toBeDefined();
      expect(typeof status.initialized).toBe('boolean');
      expect(typeof status.totalProviders).toBe('number');
      expect(typeof status.healthyProviders).toBe('number');
      expect(typeof status.configurationValid).toBe('boolean');
      expect(Array.isArray(status.errors)).toBe(true);
      expect(Array.isArray(status.warnings)).toBe(true);
    });

    it('should provide health status', async () => {
      await providerManager.initialize({
        enableHealthChecks: false,
        validateSecurity: false
      });
      
      const healthStatus = providerManager.getHealthStatus();
      
      expect(healthStatus).toBeDefined();
      expect(healthStatus.registry).toBeDefined();
      expect(healthStatus.providers).toBeDefined();
      expect(healthStatus.configuration).toBeDefined();
    });

    it('should throw error when accessing providers before initialization', () => {
      expect(() => providerManager.getAIProvider()).toThrow();
      expect(() => providerManager.getAuthProvider()).toThrow();
      expect(() => providerManager.getDriveProvider()).toThrow();
      expect(() => providerManager.getKnowledgeProvider()).toThrow();
    });
  });

  describe('Provider Utils', () => {
    it('should validate environment', () => {
      const validation = ProviderUtils.validateEnvironment();
      
      expect(validation).toBeDefined();
      expect(validation.isValid).toBeDefined();
    });

    it('should validate security', () => {
      const securityValidation = ProviderUtils.validateSecurity();
      
      expect(securityValidation).toBeDefined();
      expect(securityValidation.isSecure).toBeDefined();
    });

    it('should get configuration status', () => {
      const status = ProviderUtils.getConfigurationStatus();
      
      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
    });

    it('should initialize providers with default options', async () => {
      await expect(ProviderUtils.initializeProviders({
        enableHealthChecks: false,
        validateSecurity: false
      })).resolves.not.toThrow();
      
      const status = ProviderUtils.getProviderStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should complete full initialization cycle', async () => {
      // Initialize
      await ProviderUtils.initializeProviders({
        enableHealthChecks: false,
        validateSecurity: false,
        enableMockFallback: true
      });
      
      // Check status
      const status = ProviderUtils.getProviderStatus();
      expect(status.initialized).toBe(true);
      
      // Check health
      const health = ProviderUtils.getHealthStatus();
      expect(health).toBeDefined();
      
      // Check configuration
      const configStatus = ProviderUtils.getConfigurationStatus();
      expect(configStatus).toBeDefined();
      
      // Shutdown
      ProviderUtils.shutdownProviders();
      
      const finalStatus = ProviderUtils.getProviderStatus();
      expect(finalStatus.initialized).toBe(false);
    });
  });
});