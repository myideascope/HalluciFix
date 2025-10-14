import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { config } from './lib/config';
import { serviceRegistry } from './lib/serviceRegistry';
import { ConfigurationProvider } from './contexts/ConfigurationContext';

// Initialize configuration system on startup
async function initializeApplication() {
  try {
    await config.initialize();
    console.log('✅ Configuration system initialized successfully');
    
    // Initialize service registry
    await serviceRegistry.initialize();
    
    // Log configuration and service status in development
    if (config.isDevelopment) {
      console.group('🔧 Configuration Status');
      console.log('Environment:', config.app.environment);
      console.log('App Name:', config.app.name);
      console.log('App Version:', config.app.version);
      console.log('OpenAI:', config.hasOpenAI() ? '✅ Configured' : '⚠️ Not configured');
      console.log('Anthropic:', config.hasAnthropic() ? '✅ Configured' : '⚠️ Not configured');
      console.log('Stripe:', config.hasStripe() ? '✅ Configured' : '⚠️ Not configured');
      console.log('Sentry:', config.hasSentry() ? '✅ Configured' : '⚠️ Not configured');
      console.log('Analytics:', config.features.enableAnalytics ? '✅ Enabled' : '❌ Disabled');
      console.log('Payments:', config.features.enablePayments ? '✅ Enabled' : '❌ Disabled');
      console.log('Beta Features:', config.features.enableBetaFeatures ? '✅ Enabled' : '❌ Disabled');
      console.groupEnd();
      
      // Log service availability
      serviceRegistry.logServiceStatus();
    }
    
    // Render the application
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ConfigurationProvider>
          <App />
        </ConfigurationProvider>
      </StrictMode>
    );
  } catch (error) {
    console.error('❌ Configuration initialization failed:', error);
    
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
          ${config.isDevelopment ? 'Check the console for more details.' : 'Contact support if this issue persists.'}
        </p>
      </div>
    `;
    
    document.body.appendChild(errorContainer);
    
    // In production, prevent the application from starting
    if (config.isProduction) {
      throw error;
    }
  }
}

// Start the application
initializeApplication();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
