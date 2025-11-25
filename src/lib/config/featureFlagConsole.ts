/**
 * Feature Flag Console Debugging Utilities
 * Provides global console commands for debugging feature flags
 */

import { featureFlagManager, FeatureFlagKey } from './featureFlags.js';
import { featureFlagLogger } from './featureFlagLogger.js';
import { featureFlagDocs } from './featureFlagDocs.js';
import { config } from './index.js';

import { logger } from '../logging';
/**
 * Feature Flag Console Interface
 * Provides a convenient console API for debugging feature flags
 */
export class FeatureFlagConsole {
  private static instance: FeatureFlagConsole;

  private constructor() {}

  static getInstance(): FeatureFlagConsole {
    if (!FeatureFlagConsole.instance) {
      FeatureFlagConsole.instance = new FeatureFlagConsole();
    }
    return FeatureFlagConsole.instance;
  }

  /**
   * Initialize console debugging utilities
   * Adds global commands to the window object in development
   */
  initialize(): void {
    if (typeof window === 'undefined' || config.app.environment === 'production') {
      return;
    }

    // Add global debugging utilities
    (window as any).featureFlags = {
      // Core functionality
      isEnabled: this.isEnabled.bind(this),
      get: this.get.bind(this),
      getAll: this.getAll.bind(this),
      
      // Override management
      set: this.set.bind(this),
      override: this.set.bind(this), // Alias
      remove: this.remove.bind(this),
      clear: this.clear.bind(this),
      
      // Debugging and information
      debug: this.debug.bind(this),
      info: this.info.bind(this),
      stats: this.stats.bind(this),
      logs: this.logs.bind(this),
      
      // Documentation
      docs: this.docs.bind(this),
      help: this.help.bind(this),
      
      // Export utilities
      export: this.export.bind(this),
      
      // Manager access
      manager: featureFlagManager
    };

    // Also add direct manager access
    (window as any).featureFlagManager = featureFlagManager;

    logger.debug("🚩 Feature Flag Console Utilities Loaded");
    logger.debug("Type `featureFlags.help()` for available commands");
  }

  /**
   * Check if a feature flag is enabled
   */
  isEnabled(key: FeatureFlagKey): boolean {
    try {
      const result = featureFlagManager.isEnabled(key);
      console.log(`🚩 ${key}: ${result ? '✅ Enabled' : '❌ Disabled'}`);
      return result;
    } catch (error) {
      console.error(`❌ Error checking flag ${key}:`, error);
      return false;
    }
  }

  /**
   * Get detailed information about a feature flag
   */
  get(key: FeatureFlagKey): void {
    try {
      const flagInfo = featureFlagManager.evaluateFlag(key);
      const stats = featureFlagLogger.getFlagStats(key);
      const docs = featureFlagDocs.getDocumentation(key);

      console.group(`🚩 Feature Flag: ${key}`);
      logger.info("Current Value:", { value: flagInfo.enabled ? '✅ Enabled' : '❌ Disabled' });
      logger.info("Source:", { source: flagInfo.source });
      logger.info("Last Updated:", { timestamp: new Date(flagInfo.lastUpdated).toISOString() });
      
      if (flagInfo.metadata) {
        logger.info("Metadata:", { metadata: flagInfo.metadata });
      }

      if (stats) {
        logger.info("Usage Stats:", { stats: {
          evaluations: stats.evaluationCount,
          trueCount: stats.trueCount,
          falseCount: stats.falseCount,
          overrides: stats.overrideCount,
          errors: stats.errorCount
        } });
      }

      if (docs) {
        logger.info("Documentation:", { docs: {
          name: docs.name,
          description: docs.description,
          category: docs.category,
          defaultValue: docs.defaultValue
        } });
      }

      console.groupEnd();
    } catch (error) {
      console.error(`❌ Error getting flag info for ${key}:`, error);
    }
  }

  /**
   * Get all feature flags with their current values
   */
  getAll(): Record<FeatureFlagKey, boolean> {
    try {
      const flags = featureFlagManager.getAllFlags();
      
      console.group('🚩 All Feature Flags');
      Object.entries(flags).forEach(([key, enabled]) => {
        console.log(`${key}: ${enabled ? '✅' : '❌'}`);
      });
      console.groupEnd();
      
      return flags;
    } catch (error) {
      logger.error("❌ Error getting all flags:", error instanceof Error ? error : new Error(String(error)));
      return {} as Record<FeatureFlagKey, boolean>;
    }
  }

  /**
   * Set an override for a feature flag
   */
  set(key: FeatureFlagKey, enabled: boolean, options?: {
    expiresIn?: number;
    persistToLocalStorage?: boolean;
  }): void {
    try {
      featureFlagManager.setOverride(key, enabled, {
        ...options,
        metadata: {
          setBy: 'console',
          timestamp: Date.now()
        }
      });
      
      console.log(`🚩 Override set: ${key} = ${enabled ? '✅ Enabled' : '❌ Disabled'}`);
      
      if (options?.expiresIn) {
        console.log(`⏰ Expires in: ${Math.round(options.expiresIn / 1000)}s`);
      }
      
      if (options?.persistToLocalStorage) {
        logger.debug("💾 Persisted to localStorage");
      }
    } catch (error) {
      console.error(`❌ Error setting override for ${key}:`, error);
    }
  }

  /**
   * Remove an override for a feature flag
   */
  remove(key: FeatureFlagKey): void {
    try {
      featureFlagManager.removeOverride(key);
      console.log(`🚩 Override removed for: ${key}`);
    } catch (error) {
      console.error(`❌ Error removing override for ${key}:`, error);
    }
  }

  /**
   * Clear all overrides
   */
  clear(): void {
    try {
      featureFlagManager.clearAllOverrides();
      logger.debug("🚩 All overrides cleared");
    } catch (error) {
      logger.error("❌ Error clearing overrides:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Show debug information
   */
  debug(): void {
    try {
      const debugInfo = featureFlagManager.getDebugInfo();
      
      console.group('🚩 Feature Flag Debug Information');
      logger.info("Current Flags:", { flags: debugInfo.flags });
      logger.info("Active Overrides:", { overrides: debugInfo.overrides });
      logger.info("Cache Size:", { cacheSize: debugInfo.cacheSize });
      logger.info("Listener Count:", { listenerCount: debugInfo.listenerCount });
      console.groupEnd();
    } catch (error) {
      logger.error("❌ Error getting debug info:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Show system information
   */
  info(): void {
    try {
      console.group('🚩 Feature Flag System Information');
      logger.info("Environment:", { environment: config.app.environment });
      logger.info("Total Flags:", { count: Object.keys(config.features).length });
      logger.info("Manager Initialized:", { initialized: featureFlagManager ? 'Yes' : 'No' });
      logger.info("Logger Enabled:", { enabled: featureFlagLogger ? 'Yes' : 'No' });
      logger.info("Session ID:", { sessionId: (featureFlagLogger as any).sessionId });
      console.groupEnd();
    } catch (error) {
      logger.error("❌ Error getting system info:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Show usage statistics
   */
  stats(): void {
    try {
      const analytics = featureFlagLogger.getAnalytics();
      
      console.group('🚩 Feature Flag Usage Statistics');
      logger.info("Total Evaluations:", { evaluations: analytics.totalEvaluations });
      logger.info("Total Overrides:", { overrides: analytics.totalOverrides });
      logger.info("Total Errors:", { errors: analytics.totalErrors });
      logger.info("Session Duration:", { duration: Math.round((Date.now() - analytics.sessionStart) / 60000) + ' minutes' });
      
      logger.debug("\nFlag Statistics:");
      Object.entries(analytics.flagStats).forEach(([key, stats]) => {
        const truePercentage = stats.evaluationCount > 0 
          ? Math.round((stats.trueCount / stats.evaluationCount) * 100)
          : 0;
        
        console.log(`  ${key}:`, {
          evaluations: stats.evaluationCount,
          truePercentage: `${truePercentage}%`,
          overrides: stats.overrideCount,
          errors: stats.errorCount
        });
      });
      
      console.groupEnd();
    } catch (error) {
      logger.error("❌ Error getting statistics:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Show recent logs
   */
  logs(limit = 20): void {
    try {
      const events = featureFlagLogger.getRecentEvents(limit);
      
      console.group(`🚩 Recent Feature Flag Events (${events.length})`);
      events.slice().reverse().forEach(event => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const icon = event.type === 'error' ? '❌' : 
                    event.type === 'override_set' ? '🔧' :
                    event.type === 'override_removed' ? '🗑️' : '📊';
        
        console.log(`${icon} [${timestamp}] ${event.type}${event.flagKey ? ` - ${event.flagKey}` : ''}:`, 
          event.value !== undefined ? (event.value ? 'enabled' : 'disabled') : 'N/A');
      });
      console.groupEnd();
    } catch (error) {
      logger.error("❌ Error getting logs:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Show documentation for a specific flag or all flags
   */
  docs(key?: FeatureFlagKey): void {
    try {
      if (key) {
        const doc = featureFlagDocs.getDocumentation(key);
        if (doc) {
          console.group(`📚 Documentation: ${key}`);
          logger.info("Name:", { name: doc.name });
          logger.info("Description:", { description: doc.description });
          logger.info("Category:", { category: doc.category });
          logger.info("Default Value:", { defaultValue: doc.defaultValue });
          logger.info("Environment Values:", { environments: doc.environments });
          logger.debug("Usage Example:");
          console.log(doc.examples.usage);
          if (doc.notes) {
            logger.info("Notes:", { notes: doc.notes });
          }
          console.groupEnd();
        } else {
          console.log(`❌ No documentation found for ${key}`);
        }
      } else {
        const allDocs = featureFlagDocs.getAllDocumentation();
        console.group('📚 All Feature Flag Documentation');
        allDocs.forEach(doc => {
          console.log(`${doc.key}: ${doc.name} (${doc.category})`);
        });
        console.log('\nUse featureFlags.docs("flagName") for detailed documentation');
        console.groupEnd();
      }
    } catch (error) {
      logger.error("❌ Error getting documentation:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Show help information
   */
  help(): void {
    console.group('🚩 Feature Flag Console Commands');
    logger.debug("Basic Commands:");
    console.log('  featureFlags.isEnabled("flagName")     - Check if flag is enabled');
    console.log('  featureFlags.get("flagName")           - Get detailed flag information');
    logger.debug("  featureFlags.getAll()                  - Get all flags and their values");
    logger.debug("");
    logger.debug("Override Commands:");
    console.log('  featureFlags.set("flagName", true)     - Enable a flag');
    console.log('  featureFlags.set("flagName", false)    - Disable a flag');
    console.log('  featureFlags.remove("flagName")        - Remove override for a flag');
    logger.debug("  featureFlags.clear()                   - Clear all overrides");
    logger.debug("");
    logger.debug("Debug Commands:");
    logger.debug("  featureFlags.debug()                   - Show debug information");
    logger.debug("  featureFlags.info()                    - Show system information");
    logger.debug("  featureFlags.stats()                   - Show usage statistics");
    logger.debug("  featureFlags.logs()                    - Show recent events");
    logger.debug("");
    logger.debug("Documentation:");
    logger.debug("  featureFlags.docs()                    - List all documented flags");
    console.log('  featureFlags.docs("flagName")          - Show flag documentation');
    logger.debug("  featureFlags.help()                    - Show this help");
    logger.debug("");
    logger.debug("Export:");
    logger.debug("  featureFlags.export()                  - Export debug data");
    logger.debug("");
    logger.debug("Advanced:");
    logger.debug("  featureFlags.manager                   - Access the flag manager directly");
    logger.debug("  featureFlagManager                     - Direct manager access");
    console.groupEnd();
  }

  /**
   * Export debug data
   */
  export(): void {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        environment: config.app.environment,
        flags: featureFlagManager.getAllFlags(),
        debugInfo: featureFlagManager.getDebugInfo(),
        analytics: featureFlagLogger.getAnalytics(),
        documentation: featureFlagDocs.getAllDocumentation()
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feature-flags-debug-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.debug("🚩 Debug data exported successfully");
    } catch (error) {
      logger.error("❌ Error exporting debug data:", error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// Export singleton instance
export const featureFlagConsole = FeatureFlagConsole.getInstance();