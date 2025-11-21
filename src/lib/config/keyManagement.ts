/**
 * Secure API Key Management System
 * Provides secure storage, rotation, and access control for API keys
 */

import { createClient } from '@supabase/supabase-js';
import type { EnvironmentConfig } from './index';

import { logger } from './logging';
// API key metadata
export interface ApiKeyMetadata {
  id: string;
  provider: string;
  keyType: 'primary' | 'secondary' | 'test';
  environment: string;
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
  isActive: boolean;
  rotationSchedule?: 'weekly' | 'monthly' | 'quarterly' | 'manual';
  permissions?: string[];
  usage?: {
    requestCount: number;
    lastReset: string;
    quotaLimit?: number;
  };
}

export interface EncryptedApiKey {
  id: string;
  encryptedKey: string;
  iv: string;
  metadata: ApiKeyMetadata;
}

export interface KeyRotationResult {
  success: boolean;
  oldKeyId: string;
  newKeyId?: string;
  error?: string;
  rollbackAvailable: boolean;
}

// Key management service
export class ApiKeyManager {
  private config: EnvironmentConfig;
  private supabase: any;
  private encryptionKey: string;

  constructor(config: EnvironmentConfig) {
    this.config = config;
    this.supabase = createClient(config.database.url, config.database.serviceKey || config.database.anonKey);
    
    // Use OAuth encryption key for API key encryption
    this.encryptionKey = config.security.oauth.tokenEncryptionKey || 'fallback-key-for-development-only';
    
    if (config.app.environment === 'production' && this.encryptionKey === 'fallback-key-for-development-only') {
      throw new Error('Production environment requires a secure encryption key');
    }
  }

  // Encrypt API key using Web Crypto API
  private async encryptApiKey(apiKey: string): Promise<{ encryptedKey: string; iv: string }> {
    const encoder = new TextEncoder();
    
    // Ensure we have a proper 32-byte key
    const keyBytes = encoder.encode(this.encryptionKey.padEnd(32, '0').slice(0, 32));
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      keyMaterial,
      encoder.encode(apiKey)
    );

    return {
      encryptedKey: Array.from(new Uint8Array(encrypted))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
      iv: Array.from(iv)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
    };
  }

  // Decrypt API key using Web Crypto API
  private async decryptApiKey(encryptedKey: string, iv: string): Promise<string> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Ensure we have a proper 32-byte key
    const keyBytes = encoder.encode(this.encryptionKey.padEnd(32, '0').slice(0, 32));
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const ivArray = new Uint8Array(
      iv.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    const encryptedArray = new Uint8Array(
      encryptedKey.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      keyMaterial,
      encryptedArray
    );

    return decoder.decode(decrypted);
  }

  // Store API key securely
  async storeApiKey(
    provider: string,
    apiKey: string,
    keyType: 'primary' | 'secondary' | 'test' = 'primary',
    metadata: Partial<ApiKeyMetadata> = {}
  ): Promise<string> {
    const { encryptedKey, iv } = await this.encryptApiKey(apiKey);
    
    const keyId = `${provider}_${keyType}_${Date.now()}`;
    const keyMetadata: ApiKeyMetadata = {
      id: keyId,
      provider,
      keyType,
      environment: this.config.app.environment,
      createdAt: new Date().toISOString(),
      isActive: true,
      ...metadata,
    };

    const encryptedApiKeyRecord: EncryptedApiKey = {
      id: keyId,
      encryptedKey,
      iv,
      metadata: keyMetadata,
    };

    const { error } = await this.supabase
      .from('encrypted_api_keys')
      .insert(encryptedApiKeyRecord);

    if (error) {
      throw new Error(`Failed to store API key: ${error.message}`);
    }

    return keyId;
  }

  // Retrieve API key
  async getApiKey(keyId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('encrypted_api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('metadata->isActive', true)
      .single();

    if (error || !data) {
      return null;
    }

    // Update last used timestamp
    await this.updateKeyUsage(keyId);

    return this.decryptApiKey(data.encryptedKey, data.iv);
  }

  // Get active API key for provider
  async getActiveApiKey(provider: string, keyType: 'primary' | 'secondary' | 'test' = 'primary'): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('encrypted_api_keys')
      .select('*')
      .eq('metadata->provider', provider)
      .eq('metadata->keyType', keyType)
      .eq('metadata->environment', this.config.app.environment)
      .eq('metadata->isActive', true)
      .order('metadata->createdAt', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    // Update last used timestamp
    await this.updateKeyUsage(data.id);

    return this.decryptApiKey(data.encryptedKey, data.iv);
  }

  // List API keys for provider
  async listApiKeys(provider: string): Promise<ApiKeyMetadata[]> {
    const { data, error } = await this.supabase
      .from('encrypted_api_keys')
      .select('metadata')
      .eq('metadata->provider', provider)
      .eq('metadata->environment', this.config.app.environment)
      .order('metadata->createdAt', { ascending: false });

    if (error) {
      throw new Error(`Failed to list API keys: ${error.message}`);
    }

    return data?.map(record => record.metadata) || [];
  }

  // Rotate API key
  async rotateApiKey(
    provider: string,
    newApiKey: string,
    keyType: 'primary' | 'secondary' | 'test' = 'primary'
  ): Promise<KeyRotationResult> {
    try {
      // Get current active key
      const currentKeys = await this.listApiKeys(provider);
      const currentKey = currentKeys.find(k => k.keyType === keyType && k.isActive);

      if (!currentKey) {
        return {
          success: false,
          oldKeyId: '',
          error: 'No active key found to rotate',
          rollbackAvailable: false,
        };
      }

      // Store new key
      const newKeyId = await this.storeApiKey(provider, newApiKey, keyType, {
        rotationSchedule: currentKey.rotationSchedule,
        permissions: currentKey.permissions,
      });

      // Deactivate old key (but keep for rollback)
      await this.deactivateApiKey(currentKey.id);

      return {
        success: true,
        oldKeyId: currentKey.id,
        newKeyId,
        rollbackAvailable: true,
      };
    } catch (error) {
      return {
        success: false,
        oldKeyId: currentKey?.id || '',
        error: error instanceof Error ? error.message : 'Unknown error',
        rollbackAvailable: false,
      };
    }
  }

  // Rollback key rotation
  async rollbackKeyRotation(oldKeyId: string, newKeyId: string): Promise<boolean> {
    try {
      // Reactivate old key
      await this.reactivateApiKey(oldKeyId);
      
      // Deactivate new key
      await this.deactivateApiKey(newKeyId);

      return true;
    } catch (error) {
      logger.error("Failed to rollback key rotation:", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  // Deactivate API key
  async deactivateApiKey(keyId: string): Promise<void> {
    const { error } = await this.supabase
      .from('encrypted_api_keys')
      .update({ 
        'metadata->isActive': false,
        'metadata->deactivatedAt': new Date().toISOString(),
      })
      .eq('id', keyId);

    if (error) {
      throw new Error(`Failed to deactivate API key: ${error.message}`);
    }
  }

  // Reactivate API key
  async reactivateApiKey(keyId: string): Promise<void> {
    const { error } = await this.supabase
      .from('encrypted_api_keys')
      .update({ 
        'metadata->isActive': true,
        'metadata->reactivatedAt': new Date().toISOString(),
      })
      .eq('id', keyId);

    if (error) {
      throw new Error(`Failed to reactivate API key: ${error.message}`);
    }
  }

  // Update key usage statistics
  private async updateKeyUsage(keyId: string): Promise<void> {
    const { data } = await this.supabase
      .from('encrypted_api_keys')
      .select('metadata')
      .eq('id', keyId)
      .single();

    if (data) {
      const usage = data.metadata.usage || { requestCount: 0, lastReset: new Date().toISOString() };
      usage.requestCount += 1;

      await this.supabase
        .from('encrypted_api_keys')
        .update({
          'metadata->lastUsed': new Date().toISOString(),
          'metadata->usage': usage,
        })
        .eq('id', keyId);
    }
  }

  // Check for keys that need rotation
  async getKeysNeedingRotation(): Promise<ApiKeyMetadata[]> {
    const { data, error } = await this.supabase
      .from('encrypted_api_keys')
      .select('metadata')
      .eq('metadata->environment', this.config.app.environment)
      .eq('metadata->isActive', true)
      .not('metadata->rotationSchedule', 'eq', 'manual');

    if (error) {
      throw new Error(`Failed to check rotation schedule: ${error.message}`);
    }

    const now = new Date();
    return (data?.map(record => record.metadata) || []).filter(key => {
      if (!key.rotationSchedule || key.rotationSchedule === 'manual') {
        return false;
      }

      const createdAt = new Date(key.createdAt);
      const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      switch (key.rotationSchedule) {
        case 'weekly':
          return daysSinceCreation >= 7;
        case 'monthly':
          return daysSinceCreation >= 30;
        case 'quarterly':
          return daysSinceCreation >= 90;
        default:
          return false;
      }
    });
  }

  // Delete expired keys
  async cleanupExpiredKeys(): Promise<number> {
    const { data, error } = await this.supabase
      .from('encrypted_api_keys')
      .delete()
      .lt('metadata->expiresAt', new Date().toISOString())
      .select('id');

    if (error) {
      throw new Error(`Failed to cleanup expired keys: ${error.message}`);
    }

    return data?.length || 0;
  }

  // Get key usage statistics
  async getKeyUsageStats(provider: string): Promise<{
    totalKeys: number;
    activeKeys: number;
    totalRequests: number;
    keysNeedingRotation: number;
  }> {
    const keys = await this.listApiKeys(provider);
    const keysNeedingRotation = await this.getKeysNeedingRotation();

    return {
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.isActive).length,
      totalRequests: keys.reduce((sum, k) => sum + (k.usage?.requestCount || 0), 0),
      keysNeedingRotation: keysNeedingRotation.filter(k => k.provider === provider).length,
    };
  }
}

// Key validation utilities
export function validateApiKeyFormat(apiKey: string, provider: string): boolean {
  const patterns: Record<string, RegExp> = {
    openai: /^sk-[a-zA-Z0-9]{48}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9-]{95}$/,
    google: /^[a-zA-Z0-9-_]{72}\.apps\.googleusercontent\.com$/,
    stripe_pk: /^pk_(test|live)_[a-zA-Z0-9]{24}$/,
    stripe_sk: /^sk_(test|live)_[a-zA-Z0-9]{24}$/,
    sentry: /^https:\/\/[a-f0-9]{32}@[a-z0-9.-]+\/[0-9]+$/,
    datadog: /^[a-f0-9]{32}$/,
  };

  const pattern = patterns[provider];
  return pattern ? pattern.test(apiKey) : true;
}

// Generate secure API key rotation schedule
export function generateRotationSchedule(
  provider: string,
  environment: string
): 'weekly' | 'monthly' | 'quarterly' | 'manual' {
  // Production keys should rotate more frequently
  if (environment === 'production') {
    switch (provider) {
      case 'openai':
      case 'anthropic':
        return 'monthly';
      case 'stripe':
        return 'quarterly';
      case 'google':
        return 'quarterly';
      default:
        return 'monthly';
    }
  }

  // Development and staging can use longer rotation periods
  return 'quarterly';
}

// Database migration for API key storage
export const apiKeyStorageMigration = `
-- Create encrypted API keys table
CREATE TABLE IF NOT EXISTS encrypted_api_keys (
  id TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_encrypted_api_keys_provider 
ON encrypted_api_keys USING GIN ((metadata->>'provider'));

CREATE INDEX IF NOT EXISTS idx_encrypted_api_keys_environment 
ON encrypted_api_keys USING GIN ((metadata->>'environment'));

CREATE INDEX IF NOT EXISTS idx_encrypted_api_keys_active 
ON encrypted_api_keys USING GIN ((metadata->>'isActive'));

CREATE INDEX IF NOT EXISTS idx_encrypted_api_keys_key_type 
ON encrypted_api_keys USING GIN ((metadata->>'keyType'));

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_encrypted_api_keys_updated_at 
BEFORE UPDATE ON encrypted_api_keys 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE encrypted_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy for service role access
CREATE POLICY "Service role can manage all keys" ON encrypted_api_keys
FOR ALL USING (auth.role() = 'service_role');

-- Policy for authenticated users (read-only access to metadata)
CREATE POLICY "Authenticated users can read key metadata" ON encrypted_api_keys
FOR SELECT USING (auth.role() = 'authenticated')
WITH CHECK (false);
`;

// Export types and utilities
export type {
  ApiKeyMetadata,
  EncryptedApiKey,
  KeyRotationResult,
};