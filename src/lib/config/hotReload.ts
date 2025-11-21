/**
 * Configuration hot reload support for development
 * Provides file watching and configuration refresh capabilities
 */

import { watch, FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { ConfigurationLoader } from './loader.js';
import { EnvironmentConfig } from './types.js';
import { ConfigurationError } from './errors.js';

import { logger } from './logging';
export interface ConfigurationChangeEvent {
  type: 'file-changed' | 'config-reloaded' | 'reload-error';
  filePath?: string;
  config?: EnvironmentConfig;
  error?: Error;
  timestamp: Date;
}

export interface HotReloadOptions {
  enabled: boolean;
  watchPaths: string[];
  debounceMs: number;
  ignoreInitial: boolean;
  onConfigChange?: (event: ConfigurationChangeEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Configuration hot reload manager
 */
export class ConfigurationHotReload extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private loader: ConfigurationLoader;
  private options: HotReloadOptions;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isReloading = false;
  private lastConfig: EnvironmentConfig | null = null;

  constructor(loader: ConfigurationLoader, options: Partial<HotReloadOptions> = {}) {
    super();
    this.loader = loader;
    this.options = {
      enabled: import.meta.env.MODE === 'development',
      watchPaths: [
        '.env',
        '.env.local',
        '.env.development',
        '.env.staging',
        '.env.production',
        'src/lib/config/**/*.ts'
      ],
      debounceMs: 500,
      ignoreInitial: true,
      ...options
    };

    // Set up event listeners
    if (this.options.onConfigChange) {
      this.on('config-change', this.options.onConfigChange);
    }
    if (this.options.onError) {
      this.on('error', this.options.onError);
    }
  }

  /**
   * Start watching configuration files for changes
   */
  async start(): Promise<void> {
    if (!this.options.enabled) {
      console.debug('Hot reload disabled for non-development environment');
      return;
    }

    if (this.watcher) {
      logger.warn("Hot reload watcher already started");
      return;
    }

    try {
      // Load initial configuration
      this.lastConfig = await this.loader.loadAndValidateConfiguration();

      // Set up file watcher
      this.watcher = watch(this.options.watchPaths, {
        ignored: [
          'node_modules/**',
          'dist/**',
          'build/**',
          'coverage/**',
          '.git/**',
          '**/*.test.ts',
          '**/*.spec.ts'
        ],
        ignoreInitial: this.options.ignoreInitial,
        persistent: true,
        usePolling: false,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      });

      // Set up event handlers
      this.watcher.on('change', this.handleFileChange.bind(this));
      this.watcher.on('add', this.handleFileChange.bind(this));
      this.watcher.on('unlink', this.handleFileChange.bind(this));
      this.watcher.on('error', this.handleWatchError.bind(this));

      logger.debug("🔥 Configuration hot reload started");
      logger.info("📁 Watching paths:", { this.options.watchPaths });

      this.emit('started');
    } catch (error) {
      const configError = new ConfigurationError(
        `Failed to start hot reload: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      this.emit('error', configError);
      throw configError;
    }
  }

  /**
   * Stop watching configuration files
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.debug("🛑 Configuration hot reload stopped");
      this.emit('stopped');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Manually trigger configuration reload
   */
  async reload(): Promise<EnvironmentConfig> {
    if (this.isReloading) {
      console.debug('Configuration reload already in progress, skipping');
      return this.lastConfig!;
    }

    this.isReloading = true;

    try {
      logger.debug("🔄 Reloading configuration...");
      this.emit('reload-start');
      
      const newConfig = await this.loader.loadAndValidateConfiguration();
      const hasChanges = this.detectConfigChanges(this.lastConfig, newConfig);

      if (hasChanges) {
        this.lastConfig = newConfig;
        
        const event: ConfigurationChangeEvent = {
          type: 'config-reloaded',
          config: newConfig,
          timestamp: new Date()
        };

        logger.debug("✅ Configuration reloaded successfully");
        this.logConfigChanges(newConfig);
        
        this.emit('config-change', event);
        this.emit('reloaded', newConfig);
      } else {
        logger.debug("📋 No configuration changes detected");
      }

      return newConfig;
    } catch (error) {
      const configError = error instanceof Error ? error : new Error('Unknown reload error');
      
      const event: ConfigurationChangeEvent = {
        type: 'reload-error',
        error: configError,
        timestamp: new Date()
      };

      logger.error("❌ Configuration reload failed:", configError.message instanceof Error ? configError.message : new Error(String(configError.message)));
      
      this.emit('config-change', event);
      this.emit('error', configError);
      
      throw configError;
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Get the current configuration
   */
  getCurrentConfig(): EnvironmentConfig | null {
    return this.lastConfig;
  }

  /**
   * Check if hot reload is enabled and running
   */
  isRunning(): boolean {
    return this.watcher !== null && this.options.enabled;
  }

  /**
   * Handle file change events
   */
  private handleFileChange(filePath: string): void {
    console.log(`📝 Configuration file changed: ${filePath}`);

    const event: ConfigurationChangeEvent = {
      type: 'file-changed',
      filePath,
      timestamp: new Date()
    };

    this.emit('config-change', event);

    // Debounce reload to avoid multiple rapid reloads
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.reload().catch(error => {
        logger.error("Failed to reload configuration after file change:", error instanceof Error ? error : new Error(String(error)));
      });
    }, this.options.debounceMs);
  }

  /**
   * Handle file watcher errors
   */
  private handleWatchError(error: Error): void {
    logger.error("Configuration file watcher error:", error instanceof Error ? error : new Error(String(error)));
    this.emit('error', error);
  }

  /**
   * Detect changes between two configuration objects
   */
  private detectConfigChanges(oldConfig: EnvironmentConfig | null, newConfig: EnvironmentConfig): boolean {
    if (!oldConfig) return true;

    try {
      return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
    } catch (error) {
      logger.warn("Failed to compare configurations, assuming changes exist:", { error });
      return true;
    }
  }

  /**
   * Log configuration changes for debugging
   */
  private logConfigChanges(config: EnvironmentConfig): void {
    if (!this.lastConfig) return;

    const changes: string[] = [];

    // Check for environment changes
    if (this.lastConfig.app.environment !== config.app.environment) {
      changes.push(`Environment: ${this.lastConfig.app.environment} → ${config.app.environment}`);
    }

    // Check for feature flag changes
    Object.keys(config.features).forEach(key => {
      const oldValue = (this.lastConfig!.features as any)[key];
      const newValue = (config.features as any)[key];
      if (oldValue !== newValue) {
        changes.push(`Feature ${key}: ${oldValue} → ${newValue}`);
      }
    });

    // Check for service availability changes
    const oldHasOpenAI = !!this.lastConfig.ai.openai?.apiKey;
    const newHasOpenAI = !!config.ai.openai?.apiKey;
    if (oldHasOpenAI !== newHasOpenAI) {
      changes.push(`OpenAI: ${oldHasOpenAI ? 'enabled' : 'disabled'} → ${newHasOpenAI ? 'enabled' : 'disabled'}`);
    }

    const oldHasStripe = !!this.lastConfig.payments?.stripe;
    const newHasStripe = !!config.payments?.stripe;
    if (oldHasStripe !== newHasStripe) {
      changes.push(`Stripe: ${oldHasStripe ? 'enabled' : 'disabled'} → ${newHasStripe ? 'enabled' : 'disabled'}`);
    }

    if (changes.length > 0) {
      logger.debug("🔄 Configuration changes detected:");
      changes.forEach(change => console.log(`  • ${change}`));
    }
  }
}

/**
 * Development-only configuration refresh utilities
 */
export class DevelopmentConfigurationUtils {
  private hotReload: ConfigurationHotReload;

  constructor(hotReload: ConfigurationHotReload) {
    this.hotReload = hotReload;
  }

  /**
   * Add configuration change notification to browser console
   */
  enableBrowserNotifications(): void {
    if (typeof window === 'undefined') return;

    this.hotReload.on('config-change', (event: ConfigurationChangeEvent) => {
      switch (event.type) {
        case 'file-changed':
          console.log(`%c🔥 Config file changed: ${event.filePath}`, 'color: orange; font-weight: bold');
          break;
        case 'config-reloaded':
          logger.info("%c✅ Configuration reloaded successfully", { 'color: green; font-weight: bold' });
          break;
        case 'reload-error':
          logger.error("%c❌ Configuration reload failed", 'color: red; font-weight: bold', event.error instanceof Error ? 'color: red; font-weight: bold', event.error : new Error(String('color: red; font-weight: bold', event.error)));
          break;
      }
    });
  }

  /**
   * Add visual notification overlay for configuration changes
   */
  enableVisualNotifications(): void {
    if (typeof window === 'undefined') return;

    this.hotReload.on('config-change', (event: ConfigurationChangeEvent) => {
      this.showNotification(event);
    });
  }

  /**
   * Show a temporary notification overlay
   */
  private showNotification(event: ConfigurationChangeEvent): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${event.type === 'reload-error' ? '#ef4444' : '#10b981'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      max-width: 300px;
      transition: all 0.3s ease;
    `;

    let message = '';
    switch (event.type) {
      case 'file-changed':
        message = `🔥 Config file changed: ${event.filePath?.split('/').pop()}`;
        break;
      case 'config-reloaded':
        message = '✅ Configuration reloaded';
        break;
      case 'reload-error':
        message = `❌ Reload failed: ${event.error?.message}`;
        break;
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  /**
   * Create a configuration debug panel
   */
  createDebugPanel(): HTMLElement | null {
    if (typeof window === 'undefined') return null;

    const panel = document.createElement('div');
    panel.id = 'config-debug-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 16px;
      border-radius: 8px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      max-width: 400px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 9999;
      display: none;
    `;

    const toggle = document.createElement('button');
    toggle.textContent = '🔧 Config Debug';
    toggle.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: #374151;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      z-index: 10000;
    `;

    toggle.onclick = () => {
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'block';
      toggle.style.display = isVisible ? 'block' : 'none';
    };

    const updatePanel = () => {
      const config = this.hotReload.getCurrentConfig();
      if (config) {
        panel.innerHTML = `
          <h4 style="margin: 0 0 8px 0; color: #10b981;">Configuration Status</h4>
          <div><strong>Environment:</strong> ${config.app.environment}</div>
          <div><strong>Hot Reload:</strong> ${this.hotReload.isRunning() ? '🟢 Active' : '🔴 Inactive'}</div>
          <div><strong>OpenAI:</strong> ${config.ai.openai ? '🟢 Configured' : '🔴 Not configured'}</div>
          <div><strong>Stripe:</strong> ${config.payments?.stripe ? '🟢 Configured' : '🔴 Not configured'}</div>
          <div><strong>Features:</strong></div>
          <ul style="margin: 4px 0 0 16px; padding: 0;">
            ${Object.entries(config.features).map(([key, value]) => 
              `<li>${key}: ${value ? '🟢' : '🔴'}</li>`
            ).join('')}
          </ul>
        `;
      }
    };

    this.hotReload.on('config-change', updatePanel);
    updatePanel();

    document.body.appendChild(panel);
    document.body.appendChild(toggle);

    return panel;
  }
}