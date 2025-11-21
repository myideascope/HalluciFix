import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import MigrationApp from './MigrationApp.tsx';
import './index.css';
import { config } from './lib/config';
import { initializeConfiguration, getConfigurationStatus } from './lib/config/integration';
import { serviceRegistry } from './lib/serviceRegistry';
import { ConfigurationProvider } from './contexts/ConfigurationContext';
import { validateEnvironment, logConfigurationStatus } from './lib/env';
import { initializeAmplify, validateAwsConfig } from './lib/aws-config';


import { logger } from './logging';
// Initialize configuration system on startup
async function initializeApplication() {
  try {
    // Validate environment variables first
    validateEnvironment();
    
    // Initialize AWS Amplify configuration
    try {
      const awsConfigValid = validateAwsConfig();
      if (awsConfigValid) {
        initializeAmplify();
        logger.debug("✅ AWS Amplify initialized successfully");
      } else {
        logger.warn("⚠️ AWS configuration incomplete - some features may not work");
      }
    } catch (amplifyError) {
      logger.warn("⚠️ AWS Amplify initialization failed:", { amplifyError });
    }
    
    // Initialize comprehensive configuration system
    const startupResult = await initializeConfiguration();
    
    // Initialize error tracking system
    try {
      const { initializeErrorTracking } = await import('./lib/errorTrackingSetup');
      initializeErrorTracking();
      logger.debug("✅ Error tracking system initialized successfully");
    } catch (errorTrackingError) {
      logger.warn("⚠️ Error tracking initialization failed:", { errorTrackingError });
    }
    
    // Initialize database connection
    try {
      const { initializeDatabaseConnection } = await import('./lib/initializeDatabase');
      const dbResult = await initializeDatabaseConnection();
      
      if (dbResult.success) {
        console.log(`✅ Database initialized successfully (${dbResult.usingRDS ? 'RDS' : 'Supabase'})`);
        if (dbResult.migrationsRun > 0) {
          console.log(`📊 Ran ${dbResult.migrationsRun} database migrations`);
        }
      } else {
        logger.warn("⚠️ Database initialization failed:", { dbResult.error?.message });
      }
    } catch (dbError) {
      logger.warn("⚠️ Database initialization error:", { dbError });
    }
    
    // Initialize service registry
    await serviceRegistry.initialize();

    // Register service worker for caching and offline support
    if ('serviceWorker' in navigator && config.app.environment !== 'development') {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });

        logger.debug("✅ Service Worker registered successfully");

        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                logger.debug("🔄 New service worker version available");
                // Optionally show update prompt to user
              }
            });
          }
        });

        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          const { type, payload } = event.data;

          switch (type) {
            case 'CACHE_CLEARED':
              logger.debug("🗑️ Service worker cache cleared");
              break;
            case 'OFFLINE_READY':
              logger.debug("📱 App ready for offline use");
              break;
            default:
              logger.info("📨 Service worker message:", { type, payload });
          }
        });

      } catch (swError) {
        logger.warn("⚠️ Service Worker registration failed:", { swError });
      }
    }

    // Log configuration and service status in development
    try {
      if (config.isDevelopment) {
        console.group('🔧 Configuration Status');
        logger.info("Environment:", { config.app.environment });
        logger.info("App Name:", { config.app.name });
        logger.info("App Version:", { config.app.version });
        logger.info("OpenAI:", { config.hasOpenAI( }) ? '✅ Configured' : '⚠️ Not configured');
        logger.info("Anthropic:", { config.hasAnthropic( }) ? '✅ Configured' : '⚠️ Not configured');
        logger.info("Stripe:", { config.hasStripe( }) ? '✅ Configured' : '⚠️ Not configured');
        logger.info("Sentry:", { config.hasSentry( }) ? '✅ Configured' : '⚠️ Not configured');
        logger.info("Analytics:", { config.features.enableAnalytics ? '✅ Enabled' : '❌ Disabled' });
        logger.info("Payments:", { config.features.enablePayments ? '✅ Enabled' : '❌ Disabled' });
        logger.info("Beta Features:", { config.features.enableBetaFeatures ? '✅ Enabled' : '❌ Disabled' });
        
        console.groupEnd();
        
        // OAuth configuration status and validation
        try {
          const { OAuthStartupValidator } = await import('./lib/oauth/startupValidation');
          const { OAuthHealthChecker } = await import('./lib/oauth/healthCheck');
          
          // Run startup validation
          const validationResult = await OAuthStartupValidator.validateOnStartup();
          OAuthStartupValidator.logValidationResults(validationResult);
          
          // Get quick health status
          const healthStatus = await OAuthHealthChecker.getQuickStatus();
          console.log(`🔐 OAuth System: ${healthStatus.status === 'healthy' ? '✅' : healthStatus.status === 'unavailable' ? '⚠️' : '❌'} ${healthStatus.message}`);
          
          // Don't prevent startup for OAuth issues in development
          if (!validationResult.canProceed && config.isProduction) {
            OAuthStartupValidator.enforceValidConfiguration(validationResult);
          }
        } catch (oauthImportError) {
          logger.warn("OAuth validation not available:", { oauthImportError });
        }
        
        // Log service availability
        serviceRegistry.logServiceStatus();
      }
    } catch (configError) {
      logger.warn("Failed to log configuration status:", { configError });
    }
    
    // Render the application
    const AppComponent = import.meta.env.VITE_ENABLE_MIGRATION_MODE === 'true' ? MigrationApp : App;
    
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ConfigurationProvider>
          <AppComponent />
        </ConfigurationProvider>
      </StrictMode>
    );
  } catch (error) {
    logger.error("❌ Configuration initialization failed:", error instanceof Error ? error : new Error(String(error)));
    
    // Show user-friendly error message
    const errorContainer = document.createElement('div');
    errorContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #1a1a1a;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;
    
    errorContainer.innerHTML = `
      <div style="max-width: 600px; padding: 2rem; text-align: center;">
        <h1 style="color: #ef4444; margin-bottom: 1rem;">⚠️ Configuration Error</h1>
        <p style="margin-bottom: 1rem; line-height: 1.6;">
          The application failed to start due to a configuration error.
        </p>
        <details style="text-align: left; background: #2a2a2a; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
          <summary style="cursor: pointer; font-weight: bold;">Error Details</summary>
          <pre style="margin-top: 1rem; white-space: pre-wrap; font-size: 0.875rem;">${error instanceof Error ? error.message : String(error)}</pre>
        </details>
        <p style="font-size: 0.875rem; color: #888;">
          Please check your environment configuration and try again.
          Check the console for more details.
        </p>
      </div>
    `;
    
    document.body.appendChild(errorContainer);
    
    // In production, prevent the application from starting
    try {
      if (config.isProduction) {
        throw error;
      }
    } catch {
      // If config is not initialized, assume production and throw
      throw error;
    }
  }
}

// Start the application
initializeApplication();
