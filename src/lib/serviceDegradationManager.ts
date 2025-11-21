/**
 * Service Degradation Manager
 * Handles graceful degradation and fallback mechanisms when APIs are unavailable
 */

import { serviceRegistry } from './serviceRegistry';
import { errorNotificationService } from './errors/notificationService';
import { errorManager } from './errors';
import { ApiError, ErrorType, ErrorSeverity } from './errors/types';

import { logger } from './logging';
export enum ServiceStatus {
  AVAILABLE = 'available',
  DEGRADED = 'degraded',
  UNAVAILABLE = 'unavailable',
  FALLBACK = 'fallback'
}

export interface ServiceHealth {
  status: ServiceStatus;
  lastCheck: number;
  consecutiveFailures: number;
  lastError?: ApiError;
  fallbackActive: boolean;
  userNotified: boolean;
}

export interface DegradationConfig {
  maxConsecutiveFailures: number;
  healthCheckInterval: number;
  fallbackTimeout: number;
  notificationCooldown: number;
  enableOfflineMode: boolean;
  enableMockFallback: boolean;
}

export interface ServiceDegradationNotification {
  serviceId: string;
  status: ServiceStatus;
  message: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    primary?: boolean;
  }>;
}

/**
 * Manages service degradation, fallbacks, and user notifications
 */
export class ServiceDegradationManager {
  private serviceHealth = new Map<string, ServiceHealth>();
  private notificationIds = new Map<string, string>();
  private config: DegradationConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private offlineMode = false;
  private listeners = new Set<(status: Map<string, ServiceHealth>) => void>();

  constructor(config: Partial<DegradationConfig> = {}) {
    this.config = {
      maxConsecutiveFailures: 3,
      healthCheckInterval: 30000, // 30 seconds
      fallbackTimeout: 5000, // 5 seconds
      notificationCooldown: 300000, // 5 minutes
      enableOfflineMode: true,
      enableMockFallback: true,
      ...config
    };

    this.initializeServices();
    this.startHealthChecking();
    this.setupNetworkListeners();
  }

  /**
   * Initialize service health tracking
   */
  private initializeServices(): void {
    const services = ['googleDrive', 'hallucifix', 'openai', 'anthropic', 'ragService'];
    
    services.forEach(serviceId => {
      this.serviceHealth.set(serviceId, {
        status: ServiceStatus.AVAILABLE,
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        fallbackActive: false,
        userNotified: false
      });
    });
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Setup network event listeners
   */
  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.handleNetworkOnline();
      });

      window.addEventListener('offline', () => {
        this.handleNetworkOffline();
      });

      // Initial network status check
      this.offlineMode = !navigator.onLine;
    }
  }

  /**
   * Handle network coming online
   */
  private handleNetworkOnline(): void {
    logger.debug("Network connection restored");
    this.offlineMode = false;
    
    // Reset all services to available and perform health checks
    this.serviceHealth.forEach((health, serviceId) => {
      if (health.status === ServiceStatus.UNAVAILABLE) {
        health.status = ServiceStatus.AVAILABLE;
        health.consecutiveFailures = 0;
        health.fallbackActive = false;
        
        // Clear any existing notifications
        this.clearServiceNotification(serviceId);
      }
    });

    this.notifyListeners();
    this.performHealthChecks();
    
    // Show recovery notification
    errorNotificationService.showError({
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.LOW,
      errorId: `network-recovery-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: 'Network connection restored',
      userMessage: 'Connection restored. All services are now available.',
      retryable: false
    }, {
      autoHide: true,
      duration: 3000
    });
  }

  /**
   * Handle network going offline
   */
  private handleNetworkOffline(): void {
    logger.debug("Network connection lost");
    this.offlineMode = true;
    
    // Mark all services as unavailable and activate fallbacks
    this.serviceHealth.forEach((health, serviceId) => {
      health.status = ServiceStatus.UNAVAILABLE;
      health.fallbackActive = this.config.enableMockFallback;
      health.lastCheck = Date.now();
    });

    this.notifyListeners();
    
    // Show offline notification
    this.showServiceDegradationNotification('network', {
      serviceId: 'network',
      status: ServiceStatus.UNAVAILABLE,
      message: this.config.enableOfflineMode 
        ? 'You\'re offline. Using cached data and mock services where possible.'
        : 'You\'re offline. Some features may not be available.',
      actions: this.config.enableOfflineMode ? [
        {
          label: 'Continue Offline',
          onClick: () => this.clearServiceNotification('network'),
          primary: true
        }
      ] : []
    });
  }

  /**
   * Perform health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    if (this.offlineMode) {
      return; // Skip health checks when offline
    }

    const healthCheckPromises = Array.from(this.serviceHealth.keys()).map(serviceId => 
      this.checkServiceHealth(serviceId)
    );

    await Promise.allSettled(healthCheckPromises);
    this.notifyListeners();
  }

  /**
   * Check health of a specific service
   */
  private async checkServiceHealth(serviceId: string): Promise<void> {
    const health = this.serviceHealth.get(serviceId);
    if (!health) return;

    try {
      const isHealthy = await this.performServiceHealthCheck(serviceId);
      
      if (isHealthy) {
        // Service is healthy
        if (health.status !== ServiceStatus.AVAILABLE) {
          console.log(`Service ${serviceId} recovered`);
          health.status = ServiceStatus.AVAILABLE;
          health.consecutiveFailures = 0;
          health.fallbackActive = false;
          
          // Clear degradation notification
          this.clearServiceNotification(serviceId);
          
          // Show recovery notification
          this.showServiceRecoveryNotification(serviceId);
        }
      } else {
        // Service check failed
        health.consecutiveFailures++;
        
        if (health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          if (health.status !== ServiceStatus.UNAVAILABLE) {
            console.log(`Service ${serviceId} marked as unavailable after ${health.consecutiveFailures} failures`);
            health.status = ServiceStatus.UNAVAILABLE;
            health.fallbackActive = this.config.enableMockFallback;
            
            this.handleServiceDegradation(serviceId, health);
          }
        } else if (health.status === ServiceStatus.AVAILABLE) {
          health.status = ServiceStatus.DEGRADED;
          console.log(`Service ${serviceId} degraded (${health.consecutiveFailures}/${this.config.maxConsecutiveFailures} failures)`);
        }
      }
      
      health.lastCheck = Date.now();
      
    } catch (error) {
      console.error(`Health check failed for service ${serviceId}:`, error);
      health.consecutiveFailures++;
      health.lastCheck = Date.now();
      
      if (health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        health.status = ServiceStatus.UNAVAILABLE;
        health.fallbackActive = this.config.enableMockFallback;
        this.handleServiceDegradation(serviceId, health);
      }
    }
  }

  /**
   * Perform actual health check for a service
   */
  private async performServiceHealthCheck(serviceId: string): Promise<boolean> {
    try {
      switch (serviceId) {
        case 'googleDrive':
          const driveService = serviceRegistry.getGoogleDriveService();
          return driveService ? await driveService.isAvailable() : false;
          
        case 'hallucifix':
          const hallucifixClient = serviceRegistry.getHallucifixClient();
          if (!hallucifixClient) return false;
          
          // Simple validation check
          const validation = await Promise.race([
            hallucifixClient.validateApiKey(),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Health check timeout')), this.config.fallbackTimeout)
            )
          ]);
          
          return validation.valid;
          
        case 'openai':
        case 'anthropic':
          // For AI providers, we'll check if they're configured
          // Real health checks would require actual API calls
          return serviceRegistry.isServiceAvailable(serviceId as any);
          
        case 'ragService':
          // RAG service health check - simplified
          return true; // RAG service has its own fallback mechanisms
          
        default:
          return true;
      }
    } catch (error) {
      console.error(`Health check error for ${serviceId}:`, error);
      return false;
    }
  }

  /**
   * Handle service degradation
   */
  private handleServiceDegradation(serviceId: string, health: ServiceHealth): void {
    console.log(`Handling degradation for service: ${serviceId}`);
    
    // Create degradation notification
    const notification = this.createDegradationNotification(serviceId, health);
    this.showServiceDegradationNotification(serviceId, notification);
    
    // Log degradation event
    errorManager.handleError(new Error(`Service ${serviceId} degraded`), {
      component: 'ServiceDegradationManager',
      feature: 'service-health',
      serviceId,
      operation: 'degradation-handling'
    });
  }

  /**
   * Create degradation notification for a service
   */
  private createDegradationNotification(serviceId: string, health: ServiceHealth): ServiceDegradationNotification {
    const serviceNames: Record<string, string> = {
      googleDrive: 'Google Drive',
      hallucifix: 'AI Analysis',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      ragService: 'Knowledge Base'
    };

    const serviceName = serviceNames[serviceId] || serviceId;
    
    let message: string;
    let actions: Array<{ label: string; onClick: () => void; primary?: boolean }> = [];

    if (health.fallbackActive) {
      message = `${serviceName} is temporarily unavailable. Using backup service to maintain functionality.`;
      actions = [
        {
          label: 'Continue with Backup',
          onClick: () => this.clearServiceNotification(serviceId),
          primary: true
        },
        {
          label: 'Retry Connection',
          onClick: () => this.retryService(serviceId)
        }
      ];
    } else {
      message = `${serviceName} is currently unavailable. Some features may not work properly.`;
      actions = [
        {
          label: 'Retry Connection',
          onClick: () => this.retryService(serviceId),
          primary: true
        }
      ];
    }

    return {
      serviceId,
      status: health.status,
      message,
      actions
    };
  }

  /**
   * Show service degradation notification
   */
  private showServiceDegradationNotification(serviceId: string, notification: ServiceDegradationNotification): void {
    const health = this.serviceHealth.get(serviceId);
    if (!health) return;

    // Check notification cooldown
    if (health.userNotified && Date.now() - health.lastCheck < this.config.notificationCooldown) {
      return;
    }

    // Clear existing notification
    this.clearServiceNotification(serviceId);

    // Create error for notification
    const error: ApiError = {
      type: ErrorType.SERVICE_UNAVAILABLE,
      severity: health.fallbackActive ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
      errorId: `service-degradation-${serviceId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: `Service ${serviceId} degraded`,
      userMessage: notification.message,
      retryable: true
    };

    const notificationId = errorNotificationService.showError(error, {
      autoHide: false,
      persistent: true,
      showActions: true
    });

    this.notificationIds.set(serviceId, notificationId);
    health.userNotified = true;
  }

  /**
   * Show service recovery notification
   */
  private showServiceRecoveryNotification(serviceId: string): void {
    const serviceNames: Record<string, string> = {
      googleDrive: 'Google Drive',
      hallucifix: 'AI Analysis',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      ragService: 'Knowledge Base'
    };

    const serviceName = serviceNames[serviceId] || serviceId;

    const error: ApiError = {
      type: ErrorType.SERVICE_UNAVAILABLE,
      severity: ErrorSeverity.LOW,
      errorId: `service-recovery-${serviceId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: `Service ${serviceId} recovered`,
      userMessage: `${serviceName} is now available. Full functionality restored.`,
      retryable: false
    };

    errorNotificationService.showError(error, {
      autoHide: true,
      duration: 3000
    });
  }

  /**
   * Clear service notification
   */
  private clearServiceNotification(serviceId: string): void {
    const notificationId = this.notificationIds.get(serviceId);
    if (notificationId) {
      errorNotificationService.hideError(notificationId);
      this.notificationIds.delete(serviceId);
    }

    const health = this.serviceHealth.get(serviceId);
    if (health) {
      health.userNotified = false;
    }
  }

  /**
   * Retry service connection
   */
  private async retryService(serviceId: string): Promise<void> {
    console.log(`Retrying service: ${serviceId}`);
    
    const health = this.serviceHealth.get(serviceId);
    if (!health) return;

    // Reset failure count and try health check
    health.consecutiveFailures = 0;
    await this.checkServiceHealth(serviceId);
    
    this.notifyListeners();
  }

  /**
   * Check if a service should use fallback
   */
  public shouldUseFallback(serviceId: string): boolean {
    const health = this.serviceHealth.get(serviceId);
    return health ? health.fallbackActive : false;
  }

  /**
   * Check if system is in offline mode
   */
  public isOfflineMode(): boolean {
    return this.offlineMode;
  }

  /**
   * Get service status
   */
  public getServiceStatus(serviceId: string): ServiceStatus {
    const health = this.serviceHealth.get(serviceId);
    return health ? health.status : ServiceStatus.UNAVAILABLE;
  }

  /**
   * Get all service statuses
   */
  public getAllServiceStatuses(): Record<string, ServiceStatus> {
    const statuses: Record<string, ServiceStatus> = {};
    
    this.serviceHealth.forEach((health, serviceId) => {
      statuses[serviceId] = health.status;
    });
    
    return statuses;
  }

  /**
   * Force fallback mode for a service
   */
  public forceFallback(serviceId: string, reason?: string): void {
    const health = this.serviceHealth.get(serviceId);
    if (health) {
      health.status = ServiceStatus.FALLBACK;
      health.fallbackActive = true;
      
      console.log(`Forced fallback for service ${serviceId}:`, reason);
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to service status changes
   */
  public subscribe(listener: (status: Map<string, ServiceHealth>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of status changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener(new Map(this.serviceHealth));
    });
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.listeners.clear();
    this.serviceHealth.clear();
    this.notificationIds.clear();
  }
}

// Singleton instance
export const serviceDegradationManager = new ServiceDegradationManager();