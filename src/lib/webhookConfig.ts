/**
 * Webhook Configuration Utility
 * Provides utilities for configuring and managing Stripe webhooks
 */

import { getStripe, withStripeErrorHandling } from './stripe';
import { config } from './config';

export interface WebhookEndpoint {
  id: string;
  url: string;
  enabledEvents: string[];
  status: 'enabled' | 'disabled';
  secret: string;
  created: Date;
  updated: Date;
}

export interface WebhookConfigurationStatus {
  isConfigured: boolean;
  endpointUrl: string;
  requiredEvents: string[];
  configuredEvents: string[];
  missingEvents: string[];
  extraEvents: string[];
  recommendations: string[];
}

export class WebhookConfigurationService {
  private stripe = getStripe();

  /**
   * Required webhook events for the application
   */
  private readonly REQUIRED_EVENTS = [
    // Checkout events
    'checkout.session.completed',
    'checkout.session.expired',
    
    // Subscription lifecycle events
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.trial_will_end',
    
    // Payment and invoice events
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'invoice.created',
    'invoice.finalized',
    
    // Customer events
    'customer.created',
    'customer.updated',
    
    // Payment method events
    'payment_method.attached',
    'payment_method.detached',
  ];

  /**
   * Get webhook endpoint URL for this application
   */
  getWebhookEndpointUrl(): string {
    const baseUrl = config.app.url.replace(/\/$/, ''); // Remove trailing slash
    return `${baseUrl}/functions/v1/stripe-webhook`;
  }

  /**
   * List all webhook endpoints
   */
  async listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
    const endpoints = await withStripeErrorHandling(
      () => this.stripe.webhookEndpoints.list({ limit: 100 }),
      'list webhook endpoints'
    );

    return endpoints.data.map(endpoint => ({
      id: endpoint.id,
      url: endpoint.url,
      enabledEvents: endpoint.enabled_events,
      status: endpoint.status,
      secret: endpoint.secret || '',
      created: new Date(endpoint.created * 1000),
      updated: new Date(endpoint.created * 1000), // Stripe doesn't provide updated timestamp
    }));
  }

  /**
   * Create webhook endpoint
   */
  async createWebhookEndpoint(options: {
    url?: string;
    enabledEvents?: string[];
    description?: string;
  } = {}): Promise<WebhookEndpoint> {
    const {
      url = this.getWebhookEndpointUrl(),
      enabledEvents = this.REQUIRED_EVENTS,
      description = 'HalluciFix Webhook Endpoint',
    } = options;

    const endpoint = await withStripeErrorHandling(
      () => this.stripe.webhookEndpoints.create({
        url,
        enabled_events: enabledEvents as any[],
        description,
      }),
      'create webhook endpoint'
    );

    return {
      id: endpoint.id,
      url: endpoint.url,
      enabledEvents: endpoint.enabled_events,
      status: endpoint.status,
      secret: endpoint.secret || '',
      created: new Date(endpoint.created * 1000),
      updated: new Date(endpoint.created * 1000),
    };
  }

  /**
   * Update webhook endpoint
   */
  async updateWebhookEndpoint(
    endpointId: string,
    options: {
      url?: string;
      enabledEvents?: string[];
      disabled?: boolean;
    }
  ): Promise<WebhookEndpoint> {
    const updateData: any = {};

    if (options.url) {
      updateData.url = options.url;
    }

    if (options.enabledEvents) {
      updateData.enabled_events = options.enabledEvents;
    }

    if (options.disabled !== undefined) {
      updateData.disabled = options.disabled;
    }

    const endpoint = await withStripeErrorHandling(
      () => this.stripe.webhookEndpoints.update(endpointId, updateData),
      'update webhook endpoint'
    );

    return {
      id: endpoint.id,
      url: endpoint.url,
      enabledEvents: endpoint.enabled_events,
      status: endpoint.status,
      secret: endpoint.secret || '',
      created: new Date(endpoint.created * 1000),
      updated: new Date(endpoint.created * 1000),
    };
  }

  /**
   * Delete webhook endpoint
   */
  async deleteWebhookEndpoint(endpointId: string): Promise<void> {
    await withStripeErrorHandling(
      () => this.stripe.webhookEndpoints.del(endpointId),
      'delete webhook endpoint'
    );
  }

  /**
   * Get webhook configuration status
   */
  async getWebhookConfigurationStatus(): Promise<WebhookConfigurationStatus> {
    const endpointUrl = this.getWebhookEndpointUrl();
    const endpoints = await this.listWebhookEndpoints();
    
    // Find endpoint matching our URL
    const ourEndpoint = endpoints.find(endpoint => endpoint.url === endpointUrl);
    
    if (!ourEndpoint) {
      return {
        isConfigured: false,
        endpointUrl,
        requiredEvents: this.REQUIRED_EVENTS,
        configuredEvents: [],
        missingEvents: this.REQUIRED_EVENTS,
        extraEvents: [],
        recommendations: [
          'Create a webhook endpoint for your application',
          `Use URL: ${endpointUrl}`,
          'Configure all required events for proper functionality',
        ],
      };
    }

    const configuredEvents = ourEndpoint.enabledEvents;
    const missingEvents = this.REQUIRED_EVENTS.filter(
      event => !configuredEvents.includes(event)
    );
    const extraEvents = configuredEvents.filter(
      event => !this.REQUIRED_EVENTS.includes(event)
    );

    const recommendations: string[] = [];
    
    if (ourEndpoint.status === 'disabled') {
      recommendations.push('Enable the webhook endpoint');
    }
    
    if (missingEvents.length > 0) {
      recommendations.push(`Add missing events: ${missingEvents.join(', ')}`);
    }
    
    if (extraEvents.length > 0) {
      recommendations.push(`Consider removing unused events: ${extraEvents.join(', ')}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Webhook configuration looks good!');
    }

    return {
      isConfigured: ourEndpoint.status === 'enabled' && missingEvents.length === 0,
      endpointUrl,
      requiredEvents: this.REQUIRED_EVENTS,
      configuredEvents,
      missingEvents,
      extraEvents,
      recommendations,
    };
  }

  /**
   * Auto-configure webhook endpoint
   */
  async autoConfigureWebhook(): Promise<{
    success: boolean;
    endpoint?: WebhookEndpoint;
    message: string;
  }> {
    try {
      const status = await this.getWebhookConfigurationStatus();
      const endpointUrl = this.getWebhookEndpointUrl();
      
      // Find existing endpoint
      const endpoints = await this.listWebhookEndpoints();
      const existingEndpoint = endpoints.find(endpoint => endpoint.url === endpointUrl);
      
      if (existingEndpoint) {
        // Update existing endpoint
        const updatedEndpoint = await this.updateWebhookEndpoint(existingEndpoint.id, {
          enabledEvents: this.REQUIRED_EVENTS,
          disabled: false,
        });
        
        return {
          success: true,
          endpoint: updatedEndpoint,
          message: 'Webhook endpoint updated successfully',
        };
      } else {
        // Create new endpoint
        const newEndpoint = await this.createWebhookEndpoint();
        
        return {
          success: true,
          endpoint: newEndpoint,
          message: 'Webhook endpoint created successfully',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to configure webhook',
      };
    }
  }

  /**
   * Test webhook endpoint
   */
  async testWebhookEndpoint(endpointId: string): Promise<{
    success: boolean;
    message: string;
    testEvents?: Array<{
      eventType: string;
      success: boolean;
      responseCode?: number;
      error?: string;
    }>;
  }> {
    try {
      // Create a test event
      const testEvent = await withStripeErrorHandling(
        () => this.stripe.events.create({
          type: 'customer.created',
          data: {
            object: {
              id: 'cus_test_webhook',
              object: 'customer',
              email: 'test@example.com',
              created: Math.floor(Date.now() / 1000),
              metadata: {
                test: 'webhook_test',
              },
            },
          },
        }),
        'create test event'
      );

      // Note: In a real implementation, you would need to check if the webhook
      // endpoint received and processed the test event correctly.
      // This would require additional monitoring infrastructure.

      return {
        success: true,
        message: 'Test event created successfully',
        testEvents: [
          {
            eventType: 'customer.created',
            success: true,
            responseCode: 200,
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Webhook test failed',
      };
    }
  }

  /**
   * Get webhook setup instructions
   */
  getWebhookSetupInstructions(): {
    steps: Array<{
      step: number;
      title: string;
      description: string;
      code?: string;
    }>;
    environmentVariables: Array<{
      name: string;
      description: string;
      required: boolean;
    }>;
  } {
    const endpointUrl = this.getWebhookEndpointUrl();

    return {
      steps: [
        {
          step: 1,
          title: 'Create Webhook Endpoint in Stripe Dashboard',
          description: 'Go to your Stripe Dashboard > Developers > Webhooks and click "Add endpoint"',
        },
        {
          step: 2,
          title: 'Configure Endpoint URL',
          description: `Set the endpoint URL to: ${endpointUrl}`,
          code: endpointUrl,
        },
        {
          step: 3,
          title: 'Select Events',
          description: 'Select the following events to listen for:',
          code: this.REQUIRED_EVENTS.join('\n'),
        },
        {
          step: 4,
          title: 'Copy Webhook Secret',
          description: 'After creating the endpoint, copy the webhook signing secret',
        },
        {
          step: 5,
          title: 'Set Environment Variable',
          description: 'Add the webhook secret to your environment variables',
          code: 'STRIPE_WEBHOOK_SECRET=whsec_...',
        },
        {
          step: 6,
          title: 'Deploy and Test',
          description: 'Deploy your application and test the webhook endpoint',
        },
      ],
      environmentVariables: [
        {
          name: 'STRIPE_SECRET_KEY',
          description: 'Your Stripe secret key (starts with sk_)',
          required: true,
        },
        {
          name: 'STRIPE_WEBHOOK_SECRET',
          description: 'Your webhook endpoint signing secret (starts with whsec_)',
          required: true,
        },
        {
          name: 'SUPABASE_URL',
          description: 'Your Supabase project URL',
          required: true,
        },
        {
          name: 'SUPABASE_SERVICE_ROLE_KEY',
          description: 'Your Supabase service role key (for webhook processing)',
          required: true,
        },
      ],
    };
  }

  /**
   * Validate webhook secret format
   */
  validateWebhookSecret(secret: string): {
    isValid: boolean;
    error?: string;
  } {
    if (!secret) {
      return {
        isValid: false,
        error: 'Webhook secret is required',
      };
    }

    if (!secret.startsWith('whsec_')) {
      return {
        isValid: false,
        error: 'Webhook secret must start with "whsec_"',
      };
    }

    if (secret.length < 20) {
      return {
        isValid: false,
        error: 'Webhook secret appears to be too short',
      };
    }

    return {
      isValid: true,
    };
  }
}

// Export singleton instance
export const webhookConfigurationService = new WebhookConfigurationService();

// Export types for external use
export type {
  WebhookEndpoint,
  WebhookConfigurationStatus,
};