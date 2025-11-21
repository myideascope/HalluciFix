/**
 * Configuration system demonstration
 * Shows how to use the new configuration system
 */

/* eslint-disable no-console */

import { ConfigurationLoader, ConfigurationService } from './index.js';

import { logger } from './logging';
// Example of using the configuration loader directly
async function demonstrateConfigurationLoader() {
  logger.debug("🔧 Configuration System Demo");
  logger.debug("============================\n");

  try {
    const loader = new ConfigurationLoader();
    const config = await loader.loadConfiguration();
    
    logger.debug("✅ Configuration loaded successfully");
    logger.debug("📊 Configuration summary:");
    console.log(`   - Environment: ${config.app?.environment || 'unknown'}`);
    console.log(`   - App Name: ${config.app?.name || 'unknown'}`);
    console.log(`   - Database URL: ${config.database?.supabaseUrl ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - OpenAI API: ${config.ai?.openai?.apiKey ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Google OAuth: ${config.auth?.google?.clientId ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Stripe: ${config.payments?.stripe ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Mock Services: ${config.features?.enableMockServices ? '✅ Enabled' : '❌ Disabled'}\n`);

  } catch (error) {
    logger.error("❌ Configuration loading failed:", error.message instanceof Error ? error.message : new Error(String(error.message)));
    if (error.validationErrors) {
      logger.error("📋 Validation errors:");
      error.validationErrors.forEach(err => console.error(`   - ${err}`));
    }
  }
}

// Example of using the configuration service singleton
async function demonstrateConfigurationService() {
  logger.debug("🔧 Configuration Service Demo");
  logger.debug("==============================\n");

  try {
    const config = ConfigurationService.getInstance();
    
    // This would normally be called during app initialization
    // await config.initialize();
    
    logger.debug("✅ Configuration service ready");
    logger.debug("🎯 Available convenience methods:");
    logger.debug("   - config.isDevelopment");
    logger.debug("   - config.isProduction");
    logger.debug("   - config.hasOpenAI()");
    logger.debug("   - config.hasStripe()");
    logger.debug("   - config.hasSentry()");
    logger.debug("   - config.app.name");
    logger.debug("   - config.database.supabaseUrl");
    logger.debug("   - config.features.enableMockServices\n");

  } catch (error) {
    logger.error("❌ Configuration service error:", error.message instanceof Error ? error.message : new Error(String(error.message)));
  }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateConfigurationLoader()
    .then(() => demonstrateConfigurationService())
    .catch(console.error);
}

export { demonstrateConfigurationLoader, demonstrateConfigurationService };