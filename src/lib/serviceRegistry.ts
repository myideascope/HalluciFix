/**
 * Service Registry - Manages service initialization based on configuration
 */

import { config } from './config';
import { googleDriveService } from './googleDrive';
import { getConfiguredApiClient } from './api';
import type HalluciFixApi from './api';

import { logger } from './logging';
export interface ServiceAvailability {
  googleDrive: boolean;
  hallucifix: boolean;
  openai: boolean;
  anthropic: boolean;
  stripe: boolean;
  sentry: boolean;
  analytics: boolean;
}

export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private initialized = false;
  private services: {
    googleDrive?: typeof googleDriveService;
    hallucifix?: HalluciFixApi | null;
  } = {};

  private constructor() {}

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.debug("🔧 Initializing services based on configuration...");

    // Initialize Google Drive service if configured
    if (config.auth.google.clientId && config.auth.google.clientSecret) {
      this.services.googleDrive = googleDriveService;
      logger.debug("✅ Google Drive service initialized");
    } else {
      logger.debug("⚠️ Google Drive service not configured");
    }

    // Initialize HalluciFix API client if configured
    this.services.hallucifix = getConfiguredApiClient();
    if (this.services.hallucifix) {
      logger.debug("✅ HalluciFix API client initialized");
    } else {
      logger.debug("⚠️ HalluciFix API client not configured");
    }

    this.initialized = true;
    logger.debug("🎯 Service registry initialization complete");
  }

  getAvailability(): ServiceAvailability {
    return {
      googleDrive: config.auth.google.clientId && config.auth.google.clientSecret ? true : false,
      hallucifix: !!config.ai.hallucifix?.apiKey,
      openai: !!config.ai.openai?.apiKey,
      anthropic: !!config.ai.anthropic?.apiKey,
      stripe: !!config.payments?.stripe,
      sentry: !!config.monitoring.sentry?.dsn,
      analytics: config.features.enableAnalytics && !!config.monitoring.analytics
    };
  }

  getGoogleDriveService(): typeof googleDriveService | null {
    if (!this.services.googleDrive) {
      logger.warn("Google Drive service not available. Check configuration.");
      return null;
    }
    return this.services.googleDrive;
  }

  getHallucifixClient(): HalluciFixApi | null {
    if (!this.services.hallucifix) {
      logger.warn("HalluciFix API client not available. Check configuration.");
      return null;
    }
    return this.services.hallucifix;
  }

  isServiceAvailable(serviceName: keyof ServiceAvailability): boolean {
    return this.getAvailability()[serviceName];
  }

  getServiceStatus(): Record<string, 'available' | 'configured' | 'unavailable'> {
    const availability = this.getAvailability();
    
    return {
      googleDrive: availability.googleDrive ? 'available' : 'unavailable',
      hallucifix: availability.hallucifix ? 'available' : 'unavailable',
      openai: availability.openai ? 'configured' : 'unavailable',
      anthropic: availability.anthropic ? 'configured' : 'unavailable',
      stripe: availability.stripe ? 'configured' : 'unavailable',
      sentry: availability.sentry ? 'configured' : 'unavailable',
      analytics: availability.analytics ? 'configured' : 'unavailable'
    };
  }

  logServiceStatus(): void {
    if (config.isDevelopment) {
      console.group('🔧 Service Status');
      const status = this.getServiceStatus();
      
      Object.entries(status).forEach(([service, state]) => {
        const icon = state === 'available' ? '✅' : state === 'configured' ? '🔧' : '❌';
        console.log(`${icon} ${service}: ${state}`);
      });
      
      console.groupEnd();
    }
  }
}

// Export singleton instance
export const serviceRegistry = ServiceRegistry.getInstance();