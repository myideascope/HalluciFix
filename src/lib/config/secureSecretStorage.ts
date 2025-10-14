/**
 * Secure secret storage implementation with encryption and access controls
 * Provides encrypted storage for sensitive configuration data with proper access controls
 */

import { SecretManagerProvider } from './types.js';
import { SecretManagerError } from './errors.js';
import { 
  SecretEncryptionService, 
  EncryptedSecret, 
  SecretRotationManager, 
  SecretRotationConfig,
  SecretAccessLog 
} from './secretEncryption.js';

export interface SecretAccessControl {
  allowedOperations: ('read' | 'write' | 'delete' | 'rotate')[];
  allowedSecrets: string[] | '*'; // '*' means all secrets
  userId?: string;
  role?: string;
  expiresAt?: number;
}

export interface SecretMetadata {
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
  tags?: string[];
  description?: string;
  rotationConfig?: SecretRotationConfig;
}

export interface StoredSecret {
  encrypted: EncryptedSecret;
  metadata: SecretMetadata;
}

/**
 * Secure secret storage with encryption and access controls
 */
export class SecureSecretStorage implements SecretManagerProvider {
  private secrets: Map<string, StoredSecret> = new Map();
  private accessControls: Map<string, SecretAccessControl> = new Map();
  private encryptionService: SecretEncryptionService;
  private rotationManager: SecretRotationManager;

  constructor(
    masterPassword?: string,
    private persistenceProvider?: SecretPersistenceProvider
  ) {
    this.encryptionService = new SecretEncryptionService(masterPassword);
    this.rotationManager = new SecretRotationManager(this.encryptionService);
    
    // Load existing secrets if persistence provider is available
    if (this.persistenceProvider) {
      this.loadSecretsFromPersistence();
    }
  }

  /**
   * Set master encryption key
   */
  setMasterKey(password: string): void {
    this.encryptionService.setMasterKey(password);
  }

  /**
   * Get a single secret with access control validation
   */
  async getSecret(key: string, userId?: string): Promise<string | null> {
    try {
      // Validate access
      this.validateAccess(key, 'read', userId);

      const stored = this.secrets.get(key);
      if (!stored) {
        return null;
      }

      // Check if secret needs rotation
      if (stored.metadata.rotationConfig) {
        const needsRotation = this.encryptionService.needsRotation(
          stored.encrypted, 
          stored.metadata.rotationConfig
        );
        
        if (needsRotation) {
          console.warn(`Secret ${key} needs rotation`);
          
          // Auto-rotate if configured
          if (stored.metadata.rotationConfig.autoRotate) {
            await this.rotationManager.rotateSecret(key);
            // Get the updated secret after rotation
            const updatedStored = this.secrets.get(key);
            if (updatedStored) {
              return await this.encryptionService.decryptSecret(updatedStored.encrypted, key);
            }
          }
        }
      }

      return await this.encryptionService.decryptSecret(stored.encrypted, key);
    } catch (error) {
      throw new SecretManagerError(
        `Failed to get secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        key
      );
    }
  }

  /**
   * Get multiple secrets with access control validation
   */
  async getSecrets(keys: string[], userId?: string): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    for (const key of keys) {
      try {
        const value = await this.getSecret(key, userId);
        if (value !== null) {
          results[key] = value;
        }
      } catch (error) {
        console.warn(`Failed to get secret ${key}:`, error);
        // Continue with other secrets
      }
    }

    return results;
  }

  /**
   * Set a secret with encryption and access control validation
   */
  async setSecret(key: string, value: string, userId?: string, metadata?: Partial<SecretMetadata>): Promise<void> {
    try {
      // Validate access
      this.validateAccess(key, 'write', userId);

      // Validate secret strength
      const validation = this.encryptionService.validateSecretStrength(value);
      if (!validation.isValid) {
        throw new Error(`Secret validation failed: ${validation.issues.join(', ')}`);
      }

      // Encrypt the secret
      const encrypted = await this.encryptionService.encryptSecret(value, key);

      // Create or update metadata
      const existingStored = this.secrets.get(key);
      const secretMetadata: SecretMetadata = {
        createdAt: existingStored?.metadata.createdAt || Date.now(),
        updatedAt: Date.now(),
        createdBy: existingStored?.metadata.createdBy || userId,
        updatedBy: userId,
        tags: metadata?.tags || existingStored?.metadata.tags || [],
        description: metadata?.description || existingStored?.metadata.description,
        rotationConfig: metadata?.rotationConfig || existingStored?.metadata.rotationConfig
      };

      // Store the encrypted secret
      this.secrets.set(key, {
        encrypted,
        metadata: secretMetadata
      });

      // Schedule rotation if configured
      if (secretMetadata.rotationConfig) {
        this.rotationManager.scheduleRotation(
          key,
          async (oldSecret: string, newSecret: string) => {
            await this.setSecret(key, newSecret, 'system-rotation');
          },
          secretMetadata.rotationConfig
        );
      }

      // Persist to storage
      if (this.persistenceProvider) {
        await this.persistenceProvider.saveSecret(key, this.secrets.get(key)!);
      }

    } catch (error) {
      throw new SecretManagerError(
        `Failed to set secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        key
      );
    }
  }

  /**
   * Delete a secret with access control validation
   */
  async deleteSecret(key: string, userId?: string): Promise<void> {
    try {
      // Validate access
      this.validateAccess(key, 'delete', userId);

      // Clear rotation schedule
      this.rotationManager.clearRotationSchedule(key);

      // Remove from memory
      this.secrets.delete(key);

      // Remove from persistence
      if (this.persistenceProvider) {
        await this.persistenceProvider.deleteSecret(key);
      }

    } catch (error) {
      throw new SecretManagerError(
        `Failed to delete secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        key
      );
    }
  }

  /**
   * Rotate a secret manually
   */
  async rotateSecret(key: string, userId?: string): Promise<void> {
    try {
      // Validate access
      this.validateAccess(key, 'rotate', userId);

      await this.rotationManager.rotateSecret(key);
    } catch (error) {
      throw new SecretManagerError(
        `Failed to rotate secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        key
      );
    }
  }

  /**
   * List all secret keys (without values) that the user has access to
   */
  listSecrets(userId?: string): Array<{ key: string; metadata: SecretMetadata }> {
    const results: Array<{ key: string; metadata: SecretMetadata }> = [];

    for (const [key, stored] of this.secrets.entries()) {
      try {
        this.validateAccess(key, 'read', userId);
        results.push({
          key,
          metadata: stored.metadata
        });
      } catch {
        // User doesn't have access to this secret, skip it
      }
    }

    return results;
  }

  /**
   * Set access control for a user/role
   */
  setAccessControl(identifier: string, accessControl: SecretAccessControl): void {
    this.accessControls.set(identifier, accessControl);
  }

  /**
   * Remove access control for a user/role
   */
  removeAccessControl(identifier: string): void {
    this.accessControls.delete(identifier);
  }

  /**
   * Get access logs for audit purposes
   */
  getAccessLogs(secretKey?: string, since?: number): SecretAccessLog[] {
    return this.encryptionService.getAccessLogs(secretKey, since);
  }

  /**
   * Export encrypted secrets for backup
   */
  exportSecrets(): string {
    const secretsObject: Record<string, StoredSecret> = {};
    for (const [key, stored] of this.secrets.entries()) {
      secretsObject[key] = stored;
    }

    return JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      secrets: secretsObject,
      accessControls: Object.fromEntries(this.accessControls.entries())
    }, null, 2);
  }

  /**
   * Import encrypted secrets from backup
   */
  importSecrets(exportedData: string): void {
    try {
      const data = JSON.parse(exportedData);
      
      if (data.version !== 1) {
        throw new Error(`Incompatible export version: ${data.version}`);
      }

      // Import secrets
      for (const [key, stored] of Object.entries(data.secrets as Record<string, StoredSecret>)) {
        this.secrets.set(key, stored);
      }

      // Import access controls
      if (data.accessControls) {
        for (const [identifier, accessControl] of Object.entries(data.accessControls as Record<string, SecretAccessControl>)) {
          this.accessControls.set(identifier, accessControl);
        }
      }

    } catch (error) {
      throw new Error(`Failed to import secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate access control for a secret operation
   */
  private validateAccess(secretKey: string, operation: 'read' | 'write' | 'delete' | 'rotate', userId?: string): void {
    // If no user ID provided, allow access (for system operations)
    if (!userId) {
      return;
    }

    // Check user-specific access control
    const userAccess = this.accessControls.get(userId);
    if (userAccess) {
      this.checkAccessControl(userAccess, secretKey, operation);
      return;
    }

    // Check role-based access control (if user has a role)
    // This would typically be determined by looking up the user's role
    // For now, we'll use a simple role-based check
    const roleAccess = this.accessControls.get('default-role');
    if (roleAccess) {
      this.checkAccessControl(roleAccess, secretKey, operation);
      return;
    }

    // No access control found - deny by default
    throw new Error(`Access denied: No permissions for user ${userId} to ${operation} secret ${secretKey}`);
  }

  /**
   * Check if an access control allows the operation
   */
  private checkAccessControl(
    accessControl: SecretAccessControl, 
    secretKey: string, 
    operation: 'read' | 'write' | 'delete' | 'rotate'
  ): void {
    // Check if access control has expired
    if (accessControl.expiresAt && Date.now() > accessControl.expiresAt) {
      throw new Error('Access control has expired');
    }

    // Check if operation is allowed
    if (!accessControl.allowedOperations.includes(operation)) {
      throw new Error(`Operation ${operation} not allowed`);
    }

    // Check if secret is allowed
    if (accessControl.allowedSecrets === '*') {
      return; // Allow all secrets
    }

    // Check if secret matches any of the allowed patterns
    const isAllowed = accessControl.allowedSecrets.some(pattern => {
      if (pattern.endsWith('*')) {
        // Wildcard pattern matching
        const prefix = pattern.slice(0, -1);
        return secretKey.startsWith(prefix);
      } else {
        // Exact match
        return secretKey === pattern;
      }
    });

    if (!isAllowed) {
      throw new Error(`Access to secret ${secretKey} not allowed`);
    }
  }

  /**
   * Load secrets from persistence provider
   */
  private async loadSecretsFromPersistence(): Promise<void> {
    if (!this.persistenceProvider) {
      return;
    }

    try {
      const secrets = await this.persistenceProvider.loadAllSecrets();
      for (const [key, stored] of Object.entries(secrets)) {
        this.secrets.set(key, stored);
        
        // Restore rotation schedules
        if (stored.metadata.rotationConfig) {
          this.rotationManager.scheduleRotation(
            key,
            async (oldSecret: string, newSecret: string) => {
              await this.setSecret(key, newSecret, 'system-rotation');
            },
            stored.metadata.rotationConfig
          );
        }
      }
    } catch (error) {
      console.warn('Failed to load secrets from persistence:', error);
    }
  }
}

/**
 * Interface for secret persistence providers
 */
export interface SecretPersistenceProvider {
  saveSecret(key: string, stored: StoredSecret): Promise<void>;
  loadSecret(key: string): Promise<StoredSecret | null>;
  loadAllSecrets(): Promise<Record<string, StoredSecret>>;
  deleteSecret(key: string): Promise<void>;
}

/**
 * File-based secret persistence provider (for development)
 */
export class FileSecretPersistenceProvider implements SecretPersistenceProvider {
  constructor(private secretsFilePath: string = '.secrets.encrypted.json') {}

  async saveSecret(key: string, stored: StoredSecret): Promise<void> {
    try {
      const allSecrets = await this.loadAllSecrets();
      allSecrets[key] = stored;
      
      const fs = await import('fs/promises');
      await fs.writeFile(this.secretsFilePath, JSON.stringify(allSecrets, null, 2));
    } catch (error) {
      throw new Error(`Failed to save secret to file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async loadSecret(key: string): Promise<StoredSecret | null> {
    const allSecrets = await this.loadAllSecrets();
    return allSecrets[key] || null;
  }

  async loadAllSecrets(): Promise<Record<string, StoredSecret>> {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.secretsFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return {}; // File doesn't exist yet
      }
      throw new Error(`Failed to load secrets from file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteSecret(key: string): Promise<void> {
    try {
      const allSecrets = await this.loadAllSecrets();
      delete allSecrets[key];
      
      const fs = await import('fs/promises');
      await fs.writeFile(this.secretsFilePath, JSON.stringify(allSecrets, null, 2));
    } catch (error) {
      throw new Error(`Failed to delete secret from file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * AWS Secrets Manager persistence provider (for production)
 */
export class AWSSecretsManagerPersistenceProvider implements SecretPersistenceProvider {
  constructor(private region: string = 'us-east-1', private secretPrefix: string = 'hallucifix/') {}

  async saveSecret(key: string, stored: StoredSecret): Promise<void> {
    try {
      // This would use AWS SDK to store the encrypted secret
      // For now, we'll throw an error indicating it needs AWS SDK implementation
      throw new Error('AWS Secrets Manager persistence provider requires AWS SDK implementation');
    } catch (error) {
      throw new Error(`Failed to save secret to AWS Secrets Manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async loadSecret(key: string): Promise<StoredSecret | null> {
    try {
      // This would use AWS SDK to load the encrypted secret
      throw new Error('AWS Secrets Manager persistence provider requires AWS SDK implementation');
    } catch (error) {
      throw new Error(`Failed to load secret from AWS Secrets Manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async loadAllSecrets(): Promise<Record<string, StoredSecret>> {
    try {
      // This would use AWS SDK to list and load all secrets with the prefix
      throw new Error('AWS Secrets Manager persistence provider requires AWS SDK implementation');
    } catch (error) {
      throw new Error(`Failed to load secrets from AWS Secrets Manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteSecret(key: string): Promise<void> {
    try {
      // This would use AWS SDK to delete the secret
      throw new Error('AWS Secrets Manager persistence provider requires AWS SDK implementation');
    } catch (error) {
      throw new Error(`Failed to delete secret from AWS Secrets Manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}