/**
 * Tests for configuration hot reload functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { ConfigurationHotReload, DevelopmentConfigurationUtils } from '../hotReload.js';
import { ConfigurationLoader } from '../loader.js';
import type { EnvironmentConfig } from '../types.js';

// Mock chokidar
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  }))
}));

// Mock configuration loader
vi.mock('../loader.js', () => ({
  ConfigurationLoader: vi.fn(() => ({
    loadAndValidateConfiguration: vi.fn()
  }))
}));

describe('ConfigurationHotReload', () => {
  let hotReload: ConfigurationHotReload;
  let mockLoader: ConfigurationLoader;
  let mockConfig: EnvironmentConfig;

  beforeEach(() => {
    // Set up test environment
    process.env.NODE_ENV = 'development';

    // Create mock configuration
    mockConfig = {
      app: {
        name: 'Test App',
        version: '1.0.0',
        environment: 'development',
        url: 'http://localhost:5173',
        port: 5173,
        logLevel: 'info'
      },
      database: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-anon-key',
        connectionPoolSize: 10,
        queryTimeout: 30000
      },
      ai: {},
      auth: {
        google: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          redirectUri: 'http://localhost:5173/auth/callback'
        },
        jwt: {
          secret: 'test-jwt-secret',
          expiresIn: '24h',
          refreshExpiresIn: '7d'
        }
      },
      monitoring: {
        logging: {
          level: 'info',
          format: 'pretty',
          destination: 'console'
        }
      },
      features: {
        enableAnalytics: true,
        enablePayments: false,
        enableBetaFeatures: false,
        enableRagAnalysis: true,
        enableBatchProcessing: true,
        enableMockServices: true
      },
      security: {
        corsOrigins: ['http://localhost:5173'],
        rateLimitWindow: 900000,
        rateLimitMax: 100,
        encryptionKey: 'test-encryption-key-32-characters',
        sessionSecret: 'test-session-secret'
      }
    } as EnvironmentConfig;

    // Create mock loader
    mockLoader = new ConfigurationLoader();
    (mockLoader.loadAndValidateConfiguration as MockedFunction<any>).mockResolvedValue(mockConfig);

    // Create hot reload instance
    hotReload = new ConfigurationHotReload(mockLoader, {
      enabled: true,
      debounceMs: 100
    });
  });

  afterEach(async () => {
    await hotReload.stop();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with correct options', () => {
      expect(hotReload).toBeDefined();
      expect(hotReload.isRunning()).toBe(false);
    });

    it('should not start if disabled', async () => {
      const disabledHotReload = new ConfigurationHotReload(mockLoader, {
        enabled: false
      });

      await disabledHotReload.start();
      expect(disabledHotReload.isRunning()).toBe(false);
    });
  });

  describe('configuration loading', () => {
    it('should load initial configuration on start', async () => {
      await hotReload.start();
      
      expect(mockLoader.loadAndValidateConfiguration).toHaveBeenCalled();
      expect(hotReload.getCurrentConfig()).toEqual(mockConfig);
    });

    it('should emit started event', async () => {
      const startedSpy = vi.fn();
      hotReload.on('started', startedSpy);

      await hotReload.start();

      expect(startedSpy).toHaveBeenCalled();
    });
  });

  describe('configuration reloading', () => {
    beforeEach(async () => {
      await hotReload.start();
    });

    it('should reload configuration manually', async () => {
      const newConfig = { ...mockConfig, app: { ...mockConfig.app, name: 'Updated App' } };
      (mockLoader.loadAndValidateConfiguration as MockedFunction<any>).mockResolvedValue(newConfig);

      const reloadedSpy = vi.fn();
      hotReload.on('reloaded', reloadedSpy);

      const result = await hotReload.reload();

      expect(result).toEqual(newConfig);
      expect(hotReload.getCurrentConfig()).toEqual(newConfig);
      expect(reloadedSpy).toHaveBeenCalledWith(newConfig);
    });

    it('should emit config-change event on successful reload', async () => {
      const newConfig = { ...mockConfig, app: { ...mockConfig.app, name: 'Updated App' } };
      (mockLoader.loadAndValidateConfiguration as MockedFunction<any>).mockResolvedValue(newConfig);

      const configChangeSpy = vi.fn();
      hotReload.on('config-change', configChangeSpy);

      await hotReload.reload();

      expect(configChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'config-reloaded',
          config: newConfig,
          timestamp: expect.any(Date)
        })
      );
    });

    it('should handle reload errors gracefully', async () => {
      const error = new Error('Configuration load failed');
      (mockLoader.loadAndValidateConfiguration as MockedFunction<any>).mockRejectedValue(error);

      const errorSpy = vi.fn();
      const configChangeSpy = vi.fn();
      hotReload.on('error', errorSpy);
      hotReload.on('config-change', configChangeSpy);

      await expect(hotReload.reload()).rejects.toThrow('Configuration load failed');

      expect(errorSpy).toHaveBeenCalledWith(error);
      expect(configChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reload-error',
          error,
          timestamp: expect.any(Date)
        })
      );
    });

    it('should not reload if already reloading', async () => {
      // Reset the mock to track calls from this point
      vi.clearAllMocks();
      
      // Make the first reload take some time
      let resolveReload: (value: any) => void;
      const reloadPromise = new Promise(resolve => {
        resolveReload = resolve;
      });
      (mockLoader.loadAndValidateConfiguration as MockedFunction<any>).mockReturnValue(reloadPromise);

      // Start first reload
      const firstReload = hotReload.reload();

      // Start second reload immediately (should be skipped)
      const secondReload = hotReload.reload();

      // Resolve the first reload
      resolveReload!(mockConfig);

      const [firstResult, secondResult] = await Promise.all([firstReload, secondReload]);

      // Both should return the same config (second reload should return cached result)
      expect(firstResult).toEqual(mockConfig);
      expect(secondResult).toEqual(mockConfig);
      
      // The loader should only be called once (for the first reload)
      // The second call should be skipped due to concurrent reload protection
      expect(mockLoader.loadAndValidateConfiguration).toHaveBeenCalledTimes(1);
    });
  });

  describe('change detection', () => {
    beforeEach(async () => {
      await hotReload.start();
    });

    it('should detect configuration changes', async () => {
      const newConfig = { ...mockConfig, app: { ...mockConfig.app, name: 'Updated App' } };
      (mockLoader.loadAndValidateConfiguration as MockedFunction<any>).mockResolvedValue(newConfig);

      const configChangeSpy = vi.fn();
      hotReload.on('config-change', configChangeSpy);

      await hotReload.reload();

      expect(configChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'config-reloaded',
          config: newConfig
        })
      );
    });

    it('should not emit change event if configuration is identical', async () => {
      // Return the same configuration
      (mockLoader.loadAndValidateConfiguration as MockedFunction<any>).mockResolvedValue(mockConfig);

      const configChangeSpy = vi.fn();
      hotReload.on('config-change', configChangeSpy);

      await hotReload.reload();

      // Should not emit config-reloaded event for identical config
      expect(configChangeSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'config-reloaded'
        })
      );
    });
  });

  describe('cleanup', () => {
    it('should stop watching and clean up resources', async () => {
      await hotReload.start();
      expect(hotReload.isRunning()).toBe(true);

      const stoppedSpy = vi.fn();
      hotReload.on('stopped', stoppedSpy);

      await hotReload.stop();

      expect(hotReload.isRunning()).toBe(false);
      expect(stoppedSpy).toHaveBeenCalled();
    });
  });
});

describe('DevelopmentConfigurationUtils', () => {
  let hotReload: ConfigurationHotReload;
  let devUtils: DevelopmentConfigurationUtils;
  let mockLoader: ConfigurationLoader;

  beforeEach(() => {
    mockLoader = new ConfigurationLoader();
    hotReload = new ConfigurationHotReload(mockLoader);
    devUtils = new DevelopmentConfigurationUtils(hotReload);
  });

  describe('browser notifications', () => {
    it('should set up browser notifications if window is available', () => {
      // Mock window object
      const mockWindow = {
        console: {
          log: vi.fn(),
          error: vi.fn()
        }
      };
      vi.stubGlobal('window', mockWindow);

      const onSpy = vi.spyOn(hotReload, 'on');

      devUtils.enableBrowserNotifications();

      expect(onSpy).toHaveBeenCalledWith('config-change', expect.any(Function));

      vi.unstubAllGlobals();
    });

    it('should not set up browser notifications if window is not available', () => {
      vi.stubGlobal('window', undefined);

      const onSpy = vi.spyOn(hotReload, 'on');

      devUtils.enableBrowserNotifications();

      expect(onSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe('visual notifications', () => {
    it('should create visual notifications in browser environment', () => {
      // Mock DOM
      const mockDocument = {
        createElement: vi.fn(() => ({
          style: {},
          textContent: '',
          appendChild: vi.fn(),
          parentNode: {
            removeChild: vi.fn()
          }
        })),
        body: {
          appendChild: vi.fn()
        }
      };
      vi.stubGlobal('document', mockDocument);
      vi.stubGlobal('window', {});

      const onSpy = vi.spyOn(hotReload, 'on');

      devUtils.enableVisualNotifications();

      expect(onSpy).toHaveBeenCalledWith('config-change', expect.any(Function));

      vi.unstubAllGlobals();
    });
  });
});