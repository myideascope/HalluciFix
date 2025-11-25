/**
 * Environment file management system
 * Handles loading and managing environment-specific configuration files
 */

import { EnvironmentFileError } from './errors.js';
import { logger } from '../../logging';

export interface EnvironmentFileConfig {
  [key: string]: string;
}

export class EnvironmentFileManager {
  private readonly environment: string;
  private readonly supportedEnvironments = ['development', 'staging', 'production'];

  constructor(environment: string = import.meta.env.MODE || 'development') {
    this.environment = environment;
  }

  /**
   * Get the list of environment files to load in order of precedence
   */
  getEnvironmentFiles(): string[] {
    return [
      '.env.example',           // Template with defaults
      `.env.${this.environment}`, // Environment-specific
      '.env.local'              // Local overrides (highest precedence)
    ];
  }

  /**
   * Load all environment files and merge them
   */
  async loadAllEnvironmentFiles(): Promise<EnvironmentFileConfig> {
    const files = this.getEnvironmentFiles();
    let mergedConfig: EnvironmentFileConfig = {};

    for (const file of files) {
      try {
        const config = await this.loadEnvironmentFile(file);
        if (config) {
          mergedConfig = { ...mergedConfig, ...config };
          logger.debug(`Loaded environment file: ${file}`, {
        }
      } catch (error) {
        // Only log warning for .env.local as it's optional
        if (file === '.env.local') {
          logger.debug(`Optional environment file not found: ${file}`, {
        } else {
          logger.warn(`Could not load environment file ${file}:`, error instanceof Error ? error : new Error(String(error)), {
        }
      }
    }

    return mergedConfig;
  }

  /**
   * Load a specific environment file
   */
  async loadEnvironmentFile(filePath: string): Promise<EnvironmentFileConfig | null> {
    try {
      if (typeof window !== 'undefined') {
        // Browser environment - can't load files directly
        logger.debug('Environment file loading not supported in browser', {
        return null;
      }

      // Node.js environment
      const fs = await import('fs');
      const path = await import('path');
      
      const fullPath = path.resolve(process.cwd(), filePath);
      
      if (!fs.existsSync(fullPath)) {
        return null;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      return this.parseEnvironmentFileContent(content);
    } catch (error) {
      throw new EnvironmentFileError(
        `Failed to load environment file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        filePath
      );
    }
  }

  /**
   * Parse environment file content
   */
  parseEnvironmentFileContent(content: string): EnvironmentFileConfig {
    const result: EnvironmentFileConfig = {};
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }

      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = line.slice(0, equalIndex).trim();
      let value = line.slice(equalIndex + 1).trim();

      // Handle multiline values
      if (value.startsWith('"') && !value.endsWith('"')) {
        // Start of multiline value
        let multilineValue = value.slice(1); // Remove opening quote
        i++; // Move to next line
        
        while (i < lines.length) {
          const nextLine = lines[i];
          if (nextLine.endsWith('"')) {
            multilineValue += '\n' + nextLine.slice(0, -1); // Remove closing quote
            break;
          } else {
            multilineValue += '\n' + nextLine;
          }
          i++;
        }
        value = multilineValue;
      } else {
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
      }

      // Handle escape sequences
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");

      result[key] = value;
    }

    return result;
  }

  /**
   * Validate environment file structure
   */
  validateEnvironmentFile(config: EnvironmentFileConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const requiredKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

    // Check for required keys
    for (const key of requiredKeys) {
      if (!config[key]) {
        errors.push(`Missing required environment variable: ${key}`);
      }
    }

    // Validate URL formats
    const urlKeys = [
      'VITE_SUPABASE_URL',
      'VITE_APP_URL',
      'VITE_HALLUCIFIX_API_URL',
      'VITE_GOOGLE_REDIRECT_URI',
      'VITE_SENTRY_DSN'
    ];

    for (const key of urlKeys) {
      if (config[key] && !this.isValidUrl(config[key])) {
        errors.push(`Invalid URL format for ${key}: ${config[key]}`);
      }
    }

    // Validate API key formats
    if (config.VITE_OPENAI_API_KEY && !config.VITE_OPENAI_API_KEY.startsWith('sk-')) {
      errors.push('Invalid OpenAI API key format. Should start with "sk-"');
    }

    if (config.VITE_GOOGLE_CLIENT_ID && !config.VITE_GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com')) {
      errors.push('Invalid Google Client ID format');
    }

    if (config.GOOGLE_CLIENT_SECRET && !config.GOOGLE_CLIENT_SECRET.startsWith('GOCSPX-')) {
      errors.push('Invalid Google Client Secret format. Should start with "GOCSPX-"');
    }

    // Validate Stripe keys
    if (config.VITE_STRIPE_PUBLISHABLE_KEY && !config.VITE_STRIPE_PUBLISHABLE_KEY.startsWith('pk_')) {
      errors.push('Invalid Stripe publishable key format. Should start with "pk_"');
    }

    if (config.STRIPE_SECRET_KEY && !config.STRIPE_SECRET_KEY.startsWith('sk_')) {
      errors.push('Invalid Stripe secret key format. Should start with "sk_"');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate environment-specific configuration file
   */
  generateEnvironmentFile(environment: string, baseConfig: EnvironmentFileConfig = {}): string {
    const envConfig = { ...baseConfig };

    // Set environment-specific defaults
    switch (environment) {
      case 'development':
        envConfig.NODE_ENV = 'development';
        envConfig.VITE_APP_URL = envConfig.VITE_APP_URL || 'http://localhost:5173';
        envConfig.LOG_LEVEL = envConfig.LOG_LEVEL || 'debug';
        envConfig.LOG_FORMAT = envConfig.LOG_FORMAT || 'pretty';
        envConfig.VITE_ENABLE_MOCK_SERVICES = envConfig.VITE_ENABLE_MOCK_SERVICES || 'true';
        break;

      case 'staging':
        envConfig.NODE_ENV = 'staging';
        envConfig.LOG_LEVEL = envConfig.LOG_LEVEL || 'info';
        envConfig.LOG_FORMAT = envConfig.LOG_FORMAT || 'json';
        envConfig.VITE_ENABLE_MOCK_SERVICES = envConfig.VITE_ENABLE_MOCK_SERVICES || 'false';
        envConfig.VITE_ENABLE_ANALYTICS = envConfig.VITE_ENABLE_ANALYTICS || 'true';
        break;

      case 'production':
        envConfig.NODE_ENV = 'production';
        envConfig.LOG_LEVEL = envConfig.LOG_LEVEL || 'warn';
        envConfig.LOG_FORMAT = envConfig.LOG_FORMAT || 'json';
        envConfig.VITE_ENABLE_MOCK_SERVICES = 'false';
        envConfig.VITE_ENABLE_ANALYTICS = envConfig.VITE_ENABLE_ANALYTICS || 'true';
        envConfig.VITE_ENABLE_PAYMENTS = envConfig.VITE_ENABLE_PAYMENTS || 'true';
        break;
    }

    return this.formatEnvironmentFile(envConfig, environment);
  }

  /**
   * Format environment configuration as a file string
   */
  private formatEnvironmentFile(config: EnvironmentFileConfig, environment: string): string {
    const sections = [
      {
        title: 'APPLICATION CONFIGURATION',
        keys: ['NODE_ENV', 'VITE_APP_NAME', 'VITE_APP_VERSION', 'VITE_APP_URL']
      },
      {
        title: 'DATABASE CONFIGURATION',
        keys: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_PROJECT_ID']
      },
      {
        title: 'AI SERVICES CONFIGURATION',
        keys: ['VITE_OPENAI_API_KEY', 'VITE_OPENAI_MODEL', 'VITE_OPENAI_MAX_TOKENS', 'VITE_OPENAI_TEMPERATURE', 'VITE_HALLUCIFIX_API_KEY', 'VITE_HALLUCIFIX_API_URL']
      },
      {
        title: 'AUTHENTICATION CONFIGURATION',
        keys: ['VITE_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'VITE_GOOGLE_REDIRECT_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN']
      },
      {
        title: 'PAYMENT CONFIGURATION',
        keys: ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID_BASIC_MONTHLY', 'STRIPE_PRICE_ID_BASIC_YEARLY', 'STRIPE_PRICE_ID_PRO_MONTHLY', 'STRIPE_PRICE_ID_PRO_YEARLY']
      },
      {
        title: 'MONITORING CONFIGURATION',
        keys: ['VITE_SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'VITE_GOOGLE_ANALYTICS_ID', 'VITE_MIXPANEL_TOKEN', 'LOG_LEVEL', 'LOG_FORMAT']
      },
      {
        title: 'FEATURE FLAGS',
        keys: ['VITE_ENABLE_ANALYTICS', 'VITE_ENABLE_PAYMENTS', 'VITE_ENABLE_BETA_FEATURES', 'VITE_ENABLE_MOCK_SERVICES']
      }
    ];

    let content = `# HalluciFix ${environment.toUpperCase()} Environment Configuration\n`;
    content += `# Generated on ${new Date().toISOString()}\n\n`;

    for (const section of sections) {
      content += `# ${'='.repeat(77)}\n`;
      content += `# ${section.title}\n`;
      content += `# ${'='.repeat(77)}\n\n`;

      for (const key of section.keys) {
        if (config[key] !== undefined) {
          const value = this.escapeValue(config[key]);
          content += `${key}=${value}\n`;
        }
      }

      content += '\n';
    }

    return content;
  }

  /**
   * Escape environment variable value for file output
   */
  private escapeValue(value: string): string {
    // If value contains spaces, newlines, or special characters, wrap in quotes
    if (value.includes(' ') || value.includes('\n') || value.includes('\t') || value.includes('"')) {
      return `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
    }
    return value;
  }

  /**
   * Check if a string is a valid URL
   */
  private isValidUrl(urlString: string): boolean {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get environment-specific configuration recommendations
   */
  getEnvironmentRecommendations(environment: string): { required: string[]; recommended: string[]; optional: string[] } {
    const base = {
      required: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      recommended: ['VITE_APP_NAME', 'VITE_APP_VERSION', 'VITE_APP_URL'],
      optional: ['LOG_LEVEL', 'LOG_FORMAT']
    };

    switch (environment) {
      case 'development':
        return {
          ...base,
          recommended: [...base.recommended, 'VITE_ENABLE_MOCK_SERVICES'],
          optional: [...base.optional, 'VITE_OPENAI_API_KEY', 'VITE_GOOGLE_CLIENT_ID']
        };

      case 'staging':
        return {
          ...base,
          required: [...base.required, 'SUPABASE_SERVICE_KEY'],
          recommended: [...base.recommended, 'VITE_OPENAI_API_KEY', 'VITE_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
          optional: [...base.optional, 'VITE_SENTRY_DSN', 'VITE_ENABLE_ANALYTICS']
        };

      case 'production':
        return {
          required: [...base.required, 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'],
          recommended: [
            ...base.recommended,
            'VITE_OPENAI_API_KEY',
            'VITE_GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'VITE_SENTRY_DSN'
          ],
          optional: [
            ...base.optional,
            'VITE_STRIPE_PUBLISHABLE_KEY',
            'STRIPE_SECRET_KEY',
            'VITE_GOOGLE_ANALYTICS_ID'
          ]
        };

      default:
        return base;
    }
  }
}