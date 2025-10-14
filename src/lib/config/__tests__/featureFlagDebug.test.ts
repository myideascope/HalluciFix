/**
 * Feature Flag Debugging System Tests
 * Tests the debugging, logging, and documentation features
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { featureFlagManager } from '../featureFlags';
import { featureFlagLogger } from '../featureFlagLogger';
import { featureFlagDocs } from '../featureFlagDocs';
import { featureFlagConsole } from '../featureFlagConsole';

// Mock the config module
vi.mock('../index.js', () => ({
  config: {
    app: {
      environment: 'development',
      name: 'Test App'
    },
    features: {
      enableAnalytics: true,
      enablePayments: false,
      enableBetaFeatures: false,
      enableRagAnalysis: true,
      enableBatchProcessing: true,
      enableMockServices: true
    }
  }
}));

describe('Feature Flag Debugging System', () => {
  beforeEach(async () => {
    // Initialize the feature flag system
    await featureFlagManager.initialize();
    
    // Clear any existing overrides
    featureFlagManager.clearAllOverrides();
    
    // Clear analytics
    featureFlagLogger.clearAnalytics();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Feature Flag Logger', () => {
    it('should log feature flag evaluations', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Evaluate a flag to trigger logging
      const result = featureFlagManager.evaluateFlag('enableAnalytics');
      
      expect(result.enabled).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FeatureFlag] 📊 enableAnalytics:'),
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
    });

    it('should track usage statistics', () => {
      // Evaluate flags multiple times
      featureFlagManager.isEnabled('enableAnalytics');
      featureFlagManager.isEnabled('enablePayments');
      featureFlagManager.isEnabled('enableAnalytics');
      
      const analytics = featureFlagLogger.getAnalytics();
      
      expect(analytics.totalEvaluations).toBeGreaterThan(0);
      expect(analytics.flagStats.enableAnalytics).toBeDefined();
      expect(analytics.flagStats.enableAnalytics.evaluationCount).toBeGreaterThan(0);
    });

    it('should log override operations', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Set an override
      featureFlagManager.setOverride('enablePayments', true);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FeatureFlag] 🔧 Override set for enablePayments:'),
        expect.any(Object)
      );
      
      // Remove the override
      featureFlagManager.removeOverride('enablePayments');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FeatureFlag] 🗑️ Override removed for enablePayments')
      );
      
      consoleSpy.mockRestore();
    });

    it('should generate usage reports', () => {
      // Generate some usage
      featureFlagManager.isEnabled('enableAnalytics');
      featureFlagManager.setOverride('enablePayments', true);
      
      const report = featureFlagLogger.generateSummaryReport();
      
      expect(report).toContain('Feature Flag Usage Report');
      expect(report).toContain('Total Evaluations:');
      expect(report).toContain('Total Overrides:');
      expect(report).toContain('enableAnalytics:');
    });
  });

  describe('Feature Flag Documentation', () => {
    it('should provide documentation for all flags', () => {
      const allDocs = featureFlagDocs.getAllDocumentation();
      
      expect(allDocs).toHaveLength(6); // All 6 feature flags should be documented
      
      const flagKeys = allDocs.map(doc => doc.key);
      expect(flagKeys).toContain('enableAnalytics');
      expect(flagKeys).toContain('enablePayments');
      expect(flagKeys).toContain('enableBetaFeatures');
      expect(flagKeys).toContain('enableRagAnalysis');
      expect(flagKeys).toContain('enableBatchProcessing');
      expect(flagKeys).toContain('enableMockServices');
    });

    it('should provide detailed documentation for specific flags', () => {
      const analyticsDoc = featureFlagDocs.getDocumentation('enableAnalytics');
      
      expect(analyticsDoc).toBeDefined();
      expect(analyticsDoc!.name).toBe('Analytics Tracking');
      expect(analyticsDoc!.description).toContain('analytics');
      expect(analyticsDoc!.category).toBe('Analytics & Monitoring');
      expect(analyticsDoc!.examples.usage).toContain('useFeatureFlag');
    });

    it('should generate markdown documentation', () => {
      const markdown = featureFlagDocs.generateMarkdownDocs();
      
      expect(markdown).toContain('# Feature Flags Documentation');
      expect(markdown).toContain('## Overview');
      expect(markdown).toContain('### Quick Reference');
      expect(markdown).toContain('## Analytics & Monitoring');
      expect(markdown).toContain('enableAnalytics');
    });

    it('should generate HTML documentation', () => {
      const html = featureFlagDocs.generateHtmlDocs();
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Feature Flags Documentation');
      expect(html).toContain('enableAnalytics');
      expect(html).toContain('Analytics Tracking');
    });

    it('should export documentation as JSON', () => {
      const json = featureFlagDocs.exportAsJson();
      const parsed = JSON.parse(json);
      
      expect(parsed.generatedAt).toBeDefined();
      expect(parsed.environment).toBe('development');
      expect(parsed.flags).toHaveLength(6);
      expect(parsed.flags[0]).toHaveProperty('key');
      expect(parsed.flags[0]).toHaveProperty('name');
      expect(parsed.flags[0]).toHaveProperty('description');
    });
  });

  describe('Feature Flag Console', () => {
    let mockWindow: any;

    beforeEach(() => {
      // Mock window object
      mockWindow = {
        location: { search: '' },
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn()
        }
      };
      
      // @ts-ignore
      global.window = mockWindow;
      global.document = {
        createElement: vi.fn(() => ({
          click: vi.fn(),
          setAttribute: vi.fn()
        })),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn()
        }
      } as any;
    });

    it('should initialize console utilities in development', () => {
      featureFlagConsole.initialize();
      
      expect(mockWindow.featureFlags).toBeDefined();
      expect(mockWindow.featureFlags.isEnabled).toBeInstanceOf(Function);
      expect(mockWindow.featureFlags.get).toBeInstanceOf(Function);
      expect(mockWindow.featureFlags.set).toBeInstanceOf(Function);
      expect(mockWindow.featureFlags.help).toBeInstanceOf(Function);
    });

    it('should provide console commands for flag inspection', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      featureFlagConsole.initialize();
      
      // Test isEnabled command
      const result = mockWindow.featureFlags.isEnabled('enableAnalytics');
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('enableAnalytics: ✅ Enabled')
      );
      
      consoleSpy.mockRestore();
    });

    it('should provide console commands for setting overrides', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      featureFlagConsole.initialize();
      
      // Test set command
      mockWindow.featureFlags.set('enablePayments', true);
      
      expect(featureFlagManager.isEnabled('enablePayments')).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Override set: enablePayments = ✅ Enabled')
      );
      
      consoleSpy.mockRestore();
    });

    it('should provide help information', () => {
      const consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      featureFlagConsole.initialize();
      mockWindow.featureFlags.help();
      
      expect(consoleGroupSpy).toHaveBeenCalledWith('🚩 Feature Flag Console Commands');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('featureFlags.isEnabled("flagName")')
      );
      
      consoleGroupSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('Integration Tests', () => {
    it('should work together to provide comprehensive debugging', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Initialize all systems
      await featureFlagManager.initialize();
      featureFlagConsole.initialize();
      
      // Perform some operations
      featureFlagManager.isEnabled('enableAnalytics');
      featureFlagManager.setOverride('enablePayments', true);
      
      // Check that everything is tracked
      const analytics = featureFlagLogger.getAnalytics();
      const debugInfo = featureFlagManager.getDebugInfo();
      const docs = featureFlagDocs.getDocumentation('enableAnalytics');
      
      expect(analytics.totalEvaluations).toBeGreaterThan(0);
      expect(analytics.totalOverrides).toBeGreaterThan(0);
      expect(debugInfo.overrides).toHaveLength(1);
      expect(docs).toBeDefined();
      
      // Verify console logging occurred
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FeatureFlag]'),
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
    });
  });
});