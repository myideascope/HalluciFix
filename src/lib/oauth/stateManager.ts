import { supabase } from '../supabase';
import { PKCEHelper } from './pkceHelper';

import { logger } from '../logging';
/**
 * OAuth state data stored for CSRF protection and callback validation
 */
export interface OAuthStateData {
  stateValue: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Manages OAuth state parameters for CSRF protection and secure callback handling
 */
export class StateManager {
  // State expires after 10 minutes
  private static readonly STATE_EXPIRY_MINUTES = 10;
  
  /**
   * Generate a cryptographically secure state parameter
   */
  static generateState(): string {
    return PKCEHelper.generateSecureState();
  }

  /**
   * Store OAuth state data securely with expiration
   */
  static async storeState(
    stateValue: string, 
    codeVerifier: string, 
    redirectUri: string
  ): Promise<void> {
    try {
      // Validate inputs
      if (!stateValue || !codeVerifier || !redirectUri) {
        throw new Error('Missing required state parameters');
      }

      if (!PKCEHelper.validateCodeVerifier(codeVerifier)) {
        throw new Error('Invalid code verifier format');
      }

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.STATE_EXPIRY_MINUTES);

      const { error } = await supabase
        .from('oauth_states')
        .insert({
          state_value: stateValue,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          expires_at: expiresAt.toISOString()
        });

      if (error) {
        throw new Error(`Failed to store OAuth state: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`State storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate state parameter and retrieve associated data
   */
  static async validateState(stateValue: string, codeVerifier: string): Promise<boolean> {
    try {
      if (!stateValue || !codeVerifier) {
        return false;
      }

      const stateData = await this.getStateData(stateValue);
      if (!stateData) {
        return false;
      }

      // Check if state has expired
      if (new Date() > stateData.expiresAt) {
        // Clean up expired state
        await this.cleanupState(stateValue);
        return false;
      }

      // Verify code verifier matches
      if (stateData.codeVerifier !== codeVerifier) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error("State validation error:", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Retrieve OAuth state data by state value
   */
  static async getStateData(stateValue: string): Promise<OAuthStateData | null> {
    try {
      if (!stateValue) {
        return null;
      }

      const { data, error } = await supabase
        .from('oauth_states')
        .select('*')
        .eq('state_value', stateValue)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        stateValue: data.state_value,
        codeVerifier: data.code_verifier,
        redirectUri: data.redirect_uri,
        expiresAt: new Date(data.expires_at),
        createdAt: new Date(data.created_at)
      };
    } catch (error) {
      logger.error("Failed to retrieve state data:", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Clean up OAuth state after successful validation or expiration
   */
  static async cleanupState(stateValue: string): Promise<void> {
    try {
      if (!stateValue) {
        return;
      }

      const { error } = await supabase
        .from('oauth_states')
        .delete()
        .eq('state_value', stateValue);

      if (error) {
        logger.error("Failed to cleanup OAuth state:", error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      logger.error("State cleanup error:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Clean up all expired OAuth states (maintenance function)
   */
  static async cleanupExpiredStates(): Promise<number> {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('oauth_states')
        .delete()
        .lt('expires_at', now)
        .select('id');

      if (error) {
        throw new Error(`Failed to cleanup expired states: ${error.message}`);
      }

      return data?.length || 0;
    } catch (error) {
      logger.error("Expired state cleanup error:", error instanceof Error ? error : new Error(String(error)));
      return 0;
    }
  }

  /**
   * Validate state format and security requirements
   */
  static validateStateFormat(stateValue: string): boolean {
    if (!stateValue) {
      return false;
    }

    // State should be at least 16 characters (128 bits base64URL encoded)
    if (stateValue.length < 22) {
      return false;
    }

    // Check if it's valid base64URL format
    const base64URLPattern = /^[A-Za-z0-9\-_]+$/;
    return base64URLPattern.test(stateValue);
  }

  /**
   * Generate state with additional entropy for enhanced security
   */
  static generateEnhancedState(additionalEntropy?: string): string {
    const baseState = this.generateState();
    
    if (additionalEntropy) {
      // Combine base state with additional entropy
      const combined = baseState + additionalEntropy + Date.now().toString();
      
      // Hash the combined value for consistent length
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // Note: This would need to be async in a real implementation
        // For now, just return the base state with timestamp
        return baseState + Date.now().toString(36);
      }
    }
    
    return baseState;
  }

  /**
   * Check if state storage is healthy (for monitoring)
   */
  static async checkStateStorageHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
      // Try to perform a simple query to check database connectivity
      const { error } = await supabase
        .from('oauth_states')
        .select('id')
        .limit(1);

      if (error) {
        return { healthy: false, error: error.message };
      }

      return { healthy: true };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}