/**
 * Configuration system demonstration
 * Shows how to use the new configuration system
 */

import { ConfigurationLoader, ConfigurationService } from './index.js';

// Example of using the configuration loader directly
async function demonstrateConfigurationLoader() {
  console.log('🔧 Configuration System Demo');
  console.log('============================\n');

  try {
    const loader = new ConfigurationLoader();
    const config = await loader.loadConfiguration();
    
    console.log('✅ Configuration loaded successfully');
    console.log('📊 Configuration summary:');
    console.log(`   - Environment: ${config.app?.environment || 'unknown'}`);
    console.log(`   - App Name: ${config.app?.name || 'unknown'}`);
    console.log(`   - Database URL: ${config.database?.supabaseUrl ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - OpenAI API: ${config.ai?.openai?.apiKey ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Google OAuth: ${config.auth?.google?.clientId ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Stripe: ${config.payments?.stripe ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Mock Services: ${config.features?.enableMockServices ? '✅ Enabled' : '❌ Disabled'}\n`);

  } catch (error) {
    console.error('❌ Configuration loading failed:', error.message);
    if (error.validationErrors) {
      console.error('📋 Validation errors:');
      error.validationErrors.forEach(err => console.error(`   - ${err}`));
    }
  }
}

// Example of using the configuration service singleton
async function demonstrateConfigurationService() {
  console.log('🔧 Configuration Service Demo');
  console.log('==============================\n');

  try {
    const config = ConfigurationService.getInstance();
    
    // This would normally be called during app initialization
    // await config.initialize();
    
    console.log('✅ Configuration service ready');
    console.log('🎯 Available convenience methods:');
    console.log('   - config.isDevelopment');
    console.log('   - config.isProduction');
    console.log('   - config.hasOpenAI()');
    console.log('   - config.hasStripe()');
    console.log('   - config.hasSentry()');
    console.log('   - config.app.name');
    console.log('   - config.database.supabaseUrl');
    console.log('   - config.features.enableMockServices\n');

  } catch (error) {
    console.error('❌ Configuration service error:', error.message);
  }
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateConfigurationLoader()
    .then(() => demonstrateConfigurationService())
    .catch(console.error);
}

export { demonstrateConfigurationLoader, demonstrateConfigurationService };